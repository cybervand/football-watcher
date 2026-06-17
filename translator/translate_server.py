# =============================================================================
# NorT5 translation service (Norwegian -> English) for football-watcher.
# -----------------------------------------------------------------------------
# Runs ltg/nort5-base-en-no-translation natively in PyTorch and exposes
#   POST /api/translate  { "texts": ["..."] }  ->  { "translations": ["..."] }
#
# WHY PyTorch and not ONNX: NorT5 uses custom model code (modeling_nort5.py)
# with a torch.autograd.Function (MaskedSoftmax) + custom relative attention
# that does NOT export to ONNX cleanly. Running it natively is the reliable
# path. The exact pinned stack (see Dockerfile) is the part that matters:
#   Python 3.12, torch 2.4.1, transformers 4.46.3, tokenizers <0.21.
# Newer transformers (5.x) break this custom code (missing all_tied_weights_keys),
# and Python 3.14 has no wheels for the older tokenizers — hence the pins.
#
# Generation params follow the model author's reference translate.py.
# =============================================================================
import os
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
import transformers
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
from transformers.generation import LogitsProcessor

MODEL_NAME = os.environ.get("MODEL_NAME", "ltg/nort5-base-en-no-translation")
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


class Translator:
    """Loaded once, lazily, then reused for every request."""

    def __init__(self):
        log(f"loading model {MODEL_NAME} (transformers {transformers.__version__}) …")
        t0 = time.time()
        self.tok = AutoTokenizer.from_pretrained(MODEL_NAME)
        self.cls = self.tok.convert_tokens_to_ids("[CLS]")
        self.sep = self.tok.convert_tokens_to_ids("[SEP]")
        self.pad = self.tok.convert_tokens_to_ids("[PAD]")
        self.eng = self.tok.convert_tokens_to_ids(">>eng<<")
        self.nob = self.tok.convert_tokens_to_ids(">>nob<<")
        self.model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME, trust_remote_code=True)
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
        with torch.inference_mode():
            out = self.model.generate(
                input_ids=batch,
                attention_mask=(batch != self.pad).long(),
                max_new_tokens=511,
                num_beams=8,
                length_penalty=1.6,
                early_stopping=True,
                do_sample=False,
                use_cache=True,
                logits_processor=[RepetitionPenaltyLogitsProcessor(0.5, self.model), transformers.LogitNormalization()],
            ).tolist()
        paras = [self.tok.decode(c, skip_special_tokens=True).strip() for c in out]
        return "\n".join(paras)


_translator = None


def get_translator():
    global _translator
    if _translator is None:
        _translator = Translator()
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
