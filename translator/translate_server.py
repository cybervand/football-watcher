# =============================================================================
# NorT5 translation service (Norwegian -> English) for football-watcher.
# -----------------------------------------------------------------------------
# Runs ltg/nort5-base-en-no-translation through ONNX Runtime and exposes
#   POST /api/translate  { "texts": ["..."] }  ->  { "translations": ["..."] }
#
# The Docker image exports encoder/decoder ONNX graphs at build time. PyTorch is
# still installed because NorT5's custom model code is needed for export and as a
# fallback (TRANSLATOR_RUNTIME=torch). ONNX decoding is greedy/no-cache.
#
# Generation params follow the model author's reference translate.py.
# =============================================================================
import os
import json
import time
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch
import transformers
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from transformers.generation import LogitsProcessor

MODEL_NAME = os.environ.get("MODEL_NAME", "ltg/nort5-base-en-no-translation")
MODEL_LOCAL_ONLY = os.environ.get("MODEL_LOCAL_ONLY", "1").lower() not in {"0", "false", "no"}
TRANSLATOR_RUNTIME = os.environ.get("TRANSLATOR_RUNTIME", "auto").strip().lower()
ONNX_MODEL_DIR = Path(os.environ.get("ONNX_MODEL_DIR", "/models/nort5-onnx"))
PORT = int(os.environ.get("TRANSLATOR_PORT", "8788"))


def log(msg):
    print(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} [translator] {msg}", flush=True)


# Repetition penalty from the author's reference translate.py.
class RepetitionPenaltyLogitsProcessor(LogitsProcessor):
    def __init__(self, penalty, model):
        last_bias = model.classifier.nonlinearity[-1].bias.data
        last_bias = torch.nn.functional.log_softmax(last_bias, dim=-1)
        self.penalty = penalty * (last_bias - last_bias.max())

    def __call__(self, input_ids, scores):
        penalized = torch.gather(scores + self.penalty.unsqueeze(0).to(input_ids.device), 1, input_ids).to(scores.dtype)
        scores.scatter_(1, input_ids, penalized)
        return scores


class TorchTranslator:
    """PyTorch fallback, loaded once, lazily, then reused for every request."""

    def __init__(self):
        # Use the GPU if available (near-instant); fall back to CPU otherwise.
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        gpu = torch.cuda.get_device_name(0) if self.device == "cuda" else "CPU"
        log(f"loading model {MODEL_NAME} (transformers {transformers.__version__}) on {self.device} [{gpu}] …")
        t0 = time.time()
        self.tok = AutoTokenizer.from_pretrained(MODEL_NAME, local_files_only=MODEL_LOCAL_ONLY)
        self.cls = self.tok.convert_tokens_to_ids("[CLS]")
        self.sep = self.tok.convert_tokens_to_ids("[SEP]")
        self.pad = self.tok.convert_tokens_to_ids("[PAD]")
        self.eng = self.tok.convert_tokens_to_ids(">>eng<<")
        self.nob = self.tok.convert_tokens_to_ids(">>nob<<")
        self.model = AutoModelForSeq2SeqLM.from_pretrained(
            MODEL_NAME,
            trust_remote_code=True,
            local_files_only=MODEL_LOCAL_ONLY,
        )
        self.model = self.model.to(self.device)
        self.model.eval()
        log(f"model ready in {time.time() - t0:.1f}s")

    def translate_one(self, text):
        # Split on newlines into paragraphs, like the reference; each line gets
        # the [CLS] >>eng<< >>nob<< … [SEP] framing (target lang, then source).
        lines = [s.strip() for s in (text or "").split("\n") if s.strip()]
        if not lines:
            return ""
        seqs = []
        for line in lines:
            ids = self.tok(line).input_ids
            seqs.append(torch.tensor([self.cls, self.eng, self.nob] + ids + [self.sep]))
        batch = torch.nn.utils.rnn.pad_sequence(seqs, batch_first=True, padding_value=self.pad)[:, :512]
        batch = batch.to(self.device)
        # Beam search default: 8 on GPU (cheap, best quality), 1 on CPU (greedy,
        # ~5-8x faster so long recaps don't blow the proxy timeout). Override with
        # NUM_BEAMS / MAX_NEW_TOKENS.
        default_beams = "8" if self.device == "cuda" else "1"
        beams = int(os.environ.get("NUM_BEAMS", default_beams))
        gen_kwargs = dict(
            input_ids=batch,
            attention_mask=(batch != self.pad).long(),
            max_new_tokens=int(os.environ.get("MAX_NEW_TOKENS", "256")),
            num_beams=beams,
            do_sample=False,
            use_cache=True,
            logits_processor=[RepetitionPenaltyLogitsProcessor(0.5, self.model), transformers.LogitNormalization()],
        )
        if beams > 1:
            gen_kwargs.update(length_penalty=1.6, early_stopping=True)
        with torch.inference_mode():
            out = self.model.generate(**gen_kwargs).tolist()
        paras = [self.tok.decode(c, skip_special_tokens=True).strip() for c in out]
        return "\n".join(paras)


class OnnxTranslator:
    """ONNX Runtime translator using exported encoder/decoder graphs."""

    def __init__(self):
        try:
            import onnxruntime as ort
        except Exception as e:
            raise RuntimeError(f"onnxruntime is not installed: {e}") from e

        encoder_path = ONNX_MODEL_DIR / "encoder.onnx"
        init_path = ONNX_MODEL_DIR / "decoder_init.onnx"
        step_path = ONNX_MODEL_DIR / "decoder_step.onnx"
        penalty_path = ONNX_MODEL_DIR / "repetition_penalty.npy"
        missing = [str(p) for p in (encoder_path, init_path, step_path, penalty_path) if not p.exists()]
        if missing:
            raise FileNotFoundError("missing ONNX asset(s): " + ", ".join(missing))

        providers = self._providers(ort)
        log(f"loading model {MODEL_NAME} with ONNX Runtime {ort.__version__} providers={providers}")
        t0 = time.time()
        self.tok = AutoTokenizer.from_pretrained(MODEL_NAME, local_files_only=MODEL_LOCAL_ONLY)
        self.cls = self.tok.convert_tokens_to_ids("[CLS]")
        self.sep = self.tok.convert_tokens_to_ids("[SEP]")
        self.pad = self.tok.convert_tokens_to_ids("[PAD]")
        self.eng = self.tok.convert_tokens_to_ids(">>eng<<")
        self.nob = self.tok.convert_tokens_to_ids(">>nob<<")
        manifest = {}
        manifest_path = ONNX_MODEL_DIR / "manifest.json"
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.bos = int(os.environ.get("DECODER_START_TOKEN_ID", manifest.get("bos_token_id", 5)))
        self.eos = int(os.environ.get("EOS_TOKEN_ID", manifest.get("eos_token_id", 6)))
        self.num_layers = int(manifest.get("num_decoder_layers", 24))
        self.repetition_penalty = np.load(penalty_path).astype(np.float32)
        # Pin intra-op threads (4 is the measured CPU sweet spot; GPU ignores it).
        so = ort.SessionOptions()
        threads = int(os.environ.get("ORT_THREADS", "4"))
        if threads > 0:
            so.intra_op_num_threads = threads
        self.encoder = ort.InferenceSession(str(encoder_path), so, providers=providers)
        self.decoder_init = ort.InferenceSession(str(init_path), so, providers=providers)
        self.decoder_step = ort.InferenceSession(str(step_path), so, providers=providers)
        self._dec_out_names = [o.name for o in self.decoder_init.get_outputs()]  # logits + present_*
        self._step_in_names = set(i.name for i in self.decoder_step.get_inputs())
        log(f"ONNX model ready in {time.time() - t0:.1f}s (KV-cache, {self.num_layers} layers)")

    def _providers(self, ort):
        requested = [p.strip() for p in os.environ.get("ORT_PROVIDERS", "").split(",") if p.strip()]
        available = ort.get_available_providers()
        if requested:
            return [p for p in requested if p in available] or ["CPUExecutionProvider"]
        if "CUDAExecutionProvider" in available:
            return ["CUDAExecutionProvider", "CPUExecutionProvider"]
        return ["CPUExecutionProvider"]

    def _batch(self, lines):
        seqs = []
        for line in lines:
            ids = self.tok(line).input_ids
            seqs.append(np.array(([self.cls, self.eng, self.nob] + ids + [self.sep])[:512], dtype=np.int64))
        width = max(len(s) for s in seqs)
        batch = np.full((len(seqs), width), self.pad, dtype=np.int64)
        for i, seq in enumerate(seqs):
            batch[i, : len(seq)] = seq
        return batch

    def _apply_repetition_penalty(self, scores, output_ids, done):
        for row in range(output_ids.shape[0]):
            if done[row]:
                scores[row, :] = -np.inf
                scores[row, self.eos] = 0.0
                continue
            seen = np.unique(output_ids[row])
            scores[row, seen] = scores[row, seen] + self.repetition_penalty[seen]
        return scores

    def _greedy_one_line(self, line, max_new_tokens):
        """KV-cache greedy decode for a SINGLE line (batch=1). init graph for the
        first step, step graph (feeding present->past) for the rest."""
        ids = ([self.cls, self.eng, self.nob] + self.tok(line).input_ids + [self.sep])[:512]
        input_ids = np.array([ids], dtype=np.int64)
        attention_mask = (input_ids != self.pad).astype(np.int64)
        enc = self.encoder.run(None, {"input_ids": input_ids, "attention_mask": attention_mask})[0]

        def kv_from(present):
            return {self._dec_out_names[1 + j]: present[j] for j in range(len(present))}

        # step 0 — init graph
        r = self.decoder_init.run(
            self._dec_out_names,
            {"decoder_input_ids": np.array([[self.bos]], np.int64),
             "encoder_hidden_states": enc, "attention_mask": attention_mask},
        )
        logits = r[0][0, -1, :]
        pres = kv_from(r[1:])
        out = [self.bos]
        seen = np.array([self.bos], dtype=np.int64)
        scores = logits.copy()
        scores[seen] += self.repetition_penalty[seen]
        nxt = int(np.argmax(scores))
        out.append(nxt)
        if nxt == self.eos:
            return self.tok.decode(out, skip_special_tokens=True).strip()

        # steps 1+ — step graph with KV-cache
        for _ in range(max_new_tokens - 1):
            feed = {"decoder_input_ids": np.array([[out[-1]]], np.int64),
                    "encoder_hidden_states": enc, "attention_mask": attention_mask}
            for i in range(self.num_layers):
                for k in ("self_k", "self_v", "cross_k", "cross_v"):
                    nm = f"past_{i}_{k}"
                    if nm in self._step_in_names:
                        feed[nm] = pres[f"present_{i}_{k}"]
            r = self.decoder_step.run(self._dec_out_names, feed)
            logits = r[0][0, -1, :]
            pres = kv_from(r[1:])
            seen = np.unique(np.array(out, dtype=np.int64))
            scores = logits.copy()
            scores[seen] += self.repetition_penalty[seen]
            nxt = int(np.argmax(scores))
            out.append(nxt)
            if nxt == self.eos:
                break
        return self.tok.decode(out, skip_special_tokens=True).strip()

    def translate_one(self, text):
        lines = [s.strip() for s in (text or "").split("\n") if s.strip()]
        if not lines:
            return ""
        beams = int(os.environ.get("NUM_BEAMS", "1"))
        if beams != 1:
            log("ONNX runtime uses greedy decoding; ignoring NUM_BEAMS != 1")
        max_new_tokens = int(os.environ.get("MAX_NEW_TOKENS", "256"))
        return "\n".join(self._greedy_one_line(line, max_new_tokens) for line in lines)


_translator = None


def get_translator():
    global _translator
    if _translator is None:
        if TRANSLATOR_RUNTIME == "torch":
            _translator = TorchTranslator()
        else:
            try:
                _translator = OnnxTranslator()
            except Exception as e:
                if TRANSLATOR_RUNTIME == "onnx":
                    raise
                log(f"ONNX unavailable ({e}); falling back to PyTorch")
                _translator = TorchTranslator()
    return _translator


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # health endpoint
        if self.path == "/health":
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/translate":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw or b"{}")
            texts = data.get("texts") or ([data["text"]] if data.get("text") else [])
        except Exception:
            return self._json(400, {"error": "invalid JSON"})
        if not texts:
            return self._json(400, {"error": "no texts provided"})
        t0 = time.time()
        log(f"request: {len(texts)} text(s), {sum(len(t or '') for t in texts)} chars")
        try:
            tr = get_translator()
            translations = [tr.translate_one(t) for t in texts]
            log(f"done in {time.time() - t0:.2f}s")
            return self._json(200, {"translations": translations})
        except Exception as e:
            log(f"FAILED: {e}")
            return self._json(500, {"error": str(e)})

    def log_message(self, *args):
        pass  # silence default per-request stderr logging; we log our own


if __name__ == "__main__":
    log(f"starting on 0.0.0.0:{PORT}  (model loads lazily on first request)")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
