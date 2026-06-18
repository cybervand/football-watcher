import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


MODEL_NAME = os.environ.get("MODEL_NAME", "ltg/nort5-base-en-no-translation")
ONNX_MODEL_DIR = Path(os.environ.get("ONNX_MODEL_DIR", "/models/nort5-onnx"))
LOCAL_ONLY = os.environ.get("ONNX_EXPORT_LOCAL_ONLY", "1").lower() not in {"0", "false", "no"}
OPSET = int(os.environ.get("ONNX_OPSET", "17"))


def log(msg):
    print(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} [onnx-export] {msg}", flush=True)


class ExportableMaskedSoftmax:
    @staticmethod
    def apply(x, mask, dim):
        if mask is not None:
            x = x.masked_fill(mask, torch.finfo(x.dtype).min)
        y = torch.softmax(x, dim)
        if mask is not None:
            y = y.masked_fill(mask, 0.0)
        return y


def exportable_decoder_forward(self, x, encoder_output, encoder_padding_mask, past_key_values=None):
    self_relative_embedding = self.self_relative_embedding()
    cross_relative_embedding = self.cross_relative_embedding()

    if past_key_values is None:
        # torch.full(..., True) trips a PyTorch 2.4 ONNX exporter bug on Windows.
        autoreg_mask = torch.triu(
            torch.ones((x.size(0), x.size(0)), dtype=torch.bool, device=x.device),
            diagonal=1,
        )
    else:
        autoreg_mask = None

    if past_key_values is None:
        past_key_values = [None] * len(self.layers)

    hidden_states, self_attention_probs, cross_attention_probs, key_value_states = [x], [], [], []
    for layer, past_key_value in zip(self.layers, past_key_values):
        hidden_state, self_attention_p, cross_attention_p, key_value_state = layer(
            hidden_states[-1],
            autoreg_mask,
            encoder_output,
            encoder_padding_mask,
            self_relative_embedding,
            cross_relative_embedding,
            past_key_value=past_key_value,
        )
        hidden_states.append(hidden_state)
        self_attention_probs.append(self_attention_p)
        cross_attention_probs.append(cross_attention_p)
        key_value_states.append(key_value_state)

    return hidden_states, self_attention_probs, cross_attention_probs, key_value_states


class EncoderWrapper(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask):
        return self.model.get_encoder_output(
            input_ids,
            attention_mask,
            output_hidden_states=False,
            output_attentions=False,
            return_dict=False,
        )[0]


NUM_DECODER_LAYERS = None  # filled in main() from the model


class DecoderInitWrapper(torch.nn.Module):
    """Step 0: no past. Returns logits + ALL present KV (self + cross) per layer."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, decoder_input_ids, encoder_hidden_states, attention_mask):
        out = self.model.get_decoder_output(
            decoder_input_ids, encoder_hidden_states, attention_mask,
            past_key_values=None, use_cache=True,
            output_hidden_states=False, output_attentions=False, return_dict=False,
        )
        logits = self.model.classifier(out[0])
        flat = []
        for kv in out[1]:
            flat.extend(list(kv))
        return (logits, *flat)


class DecoderStepWrapper(torch.nn.Module):
    """Steps 1+: takes all 4 past KV per layer (self + cross) explicitly so the
    exporter cannot fold/tangle the self vs cross caches. Returns logits + present."""

    def __init__(self, model, num_layers):
        super().__init__()
        self.model = model
        self.num_layers = num_layers

    def forward(self, decoder_input_ids, encoder_hidden_states, attention_mask, *past):
        pkv = [tuple(past[i * 4: i * 4 + 4]) for i in range(self.num_layers)]
        out = self.model.get_decoder_output(
            decoder_input_ids, encoder_hidden_states, attention_mask,
            past_key_values=pkv, use_cache=True,
            output_hidden_states=False, output_attentions=False, return_dict=False,
        )
        logits = self.model.classifier(out[0])
        flat = []
        for kv in out[1]:
            flat.extend(list(kv))
        return (logits, *flat)


def _kv_names(prefix, num_layers):
    out = []
    for i in range(num_layers):
        for k in ("self_k", "self_v", "cross_k", "cross_v"):
            out.append(f"{prefix}_{i}_{k}")
    return out


def patch_for_export(model):
    module = sys.modules[model.__class__.__module__]
    module.MaskedSoftmax = ExportableMaskedSoftmax
    module.Decoder.forward = exportable_decoder_forward


def sample_inputs(tokenizer, model):
    cls = tokenizer.convert_tokens_to_ids("[CLS]")
    sep = tokenizer.convert_tokens_to_ids("[SEP]")
    eng = tokenizer.convert_tokens_to_ids(">>eng<<")
    nob = tokenizer.convert_tokens_to_ids(">>nob<<")
    pad = tokenizer.convert_tokens_to_ids("[PAD]")
    text_ids = tokenizer("Frankrike vinner 3-1 mot Senegal.").input_ids
    input_ids = torch.tensor([[cls, eng, nob] + text_ids + [sep]], dtype=torch.long)
    attention_mask = (input_ids != pad).long()
    decoder_input_ids = torch.tensor(
        [[model.config.bos_token_id, tokenizer.convert_tokens_to_ids("France"), tokenizer.convert_tokens_to_ids("wins")]],
        dtype=torch.long,
    )
    return input_ids, attention_mask, decoder_input_ids


def save_generation_assets(model, num_layers):
    bias = model.classifier.nonlinearity[-1].bias.detach().cpu()
    penalty = torch.nn.functional.log_softmax(bias, dim=-1)
    penalty = 0.5 * (penalty - penalty.max())
    np.save(ONNX_MODEL_DIR / "repetition_penalty.npy", penalty.numpy().astype(np.float32))

    manifest = {
        "model_name": MODEL_NAME,
        "opset": OPSET,
        "bos_token_id": int(model.config.bos_token_id),
        "eos_token_id": int(model.config.eos_token_id),
        "pad_token_id": int(model.config.pad_token_id),
        "max_position_embeddings": int(model.config.max_position_embeddings),
        "num_decoder_layers": int(num_layers),
        "num_attention_heads": int(model.config.num_attention_heads),
        "head_size": int(model.config.hidden_size // model.config.num_attention_heads),
        "runtime": "onnxruntime",
        "decoder": "kv_cache_two_graph",  # decoder_init.onnx + decoder_step.onnx
    }
    (ONNX_MODEL_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main():
    ONNX_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    log(f"loading {MODEL_NAME} (local_only={LOCAL_ONLY})")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, local_files_only=LOCAL_ONLY)
    model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_NAME,
        trust_remote_code=True,
        local_files_only=LOCAL_ONLY,
    ).eval()
    patch_for_export(model)

    # Count decoder layers (drives the number of KV cache tensors).
    num_layers = None
    for _, mm in model.named_modules():
        if mm.__class__.__name__ == "Decoder" and hasattr(mm, "layers"):
            num_layers = len(mm.layers)
            break
    if not num_layers:
        raise RuntimeError("could not locate the decoder layer stack")
    log(f"decoder layers: {num_layers}")

    input_ids, attention_mask, _ = sample_inputs(tokenizer, model)
    bos = int(model.config.bos_token_id)
    encoder = EncoderWrapper(model).eval()
    init_dec = DecoderInitWrapper(model).eval()
    step_dec = DecoderStepWrapper(model, num_layers).eval()

    # NOTE: use no_grad + clone, NOT inference_mode. torch.onnx.export traces with
    # autograd, and inference-mode tensors "cannot be saved for backward".
    with torch.no_grad():
        encoder_hidden_states = encoder(input_ids, attention_mask).clone()
        di0 = torch.tensor([[bos]], dtype=torch.long)
        init_out = init_dec(di0, encoder_hidden_states, attention_mask)
    present0 = tuple(t.clone() for t in init_out[1:])  # 4 * num_layers tensors

    log("exporting encoder.onnx")
    torch.onnx.export(
        encoder, (input_ids, attention_mask), str(ONNX_MODEL_DIR / "encoder.onnx"),
        input_names=["input_ids", "attention_mask"], output_names=["encoder_hidden_states"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "source_length"},
            "attention_mask": {0: "batch", 1: "source_length"},
            "encoder_hidden_states": {0: "batch", 1: "source_length"},
        },
        opset_version=OPSET,
    )

    present_names = _kv_names("present", num_layers)
    past_names = _kv_names("past", num_layers)

    # init graph: no past -> logits + all present KV
    log("exporting decoder_init.onnx")
    init_dyn = {
        "decoder_input_ids": {0: "batch", 1: "target_length"},
        "encoder_hidden_states": {0: "batch", 1: "source_length"},
        "attention_mask": {0: "batch", 1: "source_length"},
    }
    for i in range(num_layers):
        init_dyn[f"present_{i}_self_k"] = {2: "t"}
        init_dyn[f"present_{i}_self_v"] = {2: "t"}
        init_dyn[f"present_{i}_cross_k"] = {2: "source_length"}
        init_dyn[f"present_{i}_cross_v"] = {2: "source_length"}
    torch.onnx.export(
        init_dec, (di0, encoder_hidden_states, attention_mask),
        str(ONNX_MODEL_DIR / "decoder_init.onnx"),
        input_names=["decoder_input_ids", "encoder_hidden_states", "attention_mask"],
        output_names=["logits", *present_names], dynamic_axes=init_dyn, opset_version=OPSET,
    )

    # step graph: all 4 past KV per layer -> logits + present KV
    log("exporting decoder_step.onnx")
    step_dyn = {
        "decoder_input_ids": {0: "batch", 1: "target_length"},
        "encoder_hidden_states": {0: "batch", 1: "source_length"},
        "attention_mask": {0: "batch", 1: "source_length"},
    }
    for i in range(num_layers):
        step_dyn[f"past_{i}_self_k"] = {2: "past_t"}
        step_dyn[f"past_{i}_self_v"] = {2: "past_t"}
        step_dyn[f"past_{i}_cross_k"] = {2: "source_length"}
        step_dyn[f"past_{i}_cross_v"] = {2: "source_length"}
        step_dyn[f"present_{i}_self_k"] = {2: "t"}
        step_dyn[f"present_{i}_self_v"] = {2: "t"}
        step_dyn[f"present_{i}_cross_k"] = {2: "source_length"}
        step_dyn[f"present_{i}_cross_v"] = {2: "source_length"}
    torch.onnx.export(
        step_dec, (di0, encoder_hidden_states, attention_mask, *present0),
        str(ONNX_MODEL_DIR / "decoder_step.onnx"),
        input_names=["decoder_input_ids", "encoder_hidden_states", "attention_mask", *past_names],
        output_names=["logits", *present_names], dynamic_axes=step_dyn, opset_version=OPSET,
    )

    save_generation_assets(model, num_layers)
    log(f"wrote ONNX assets to {ONNX_MODEL_DIR}")


if __name__ == "__main__":
    main()
