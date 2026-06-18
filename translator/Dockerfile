# syntax=docker/dockerfile:1
# NorT5 translation service — Norwegian -> English via ONNX Runtime.
# -----------------------------------------------------------------------------
# Multi-stage: the EXPORT stage installs PyTorch (CPU) only to convert NorT5 into
# encoder/decoder ONNX graphs at build time. The RUNTIME stage ships ONLY ONNX
# Runtime + the tokenizer + the exported graphs — NO PyTorch — so the final image
# is ~10x smaller than bundling torch. Inference is greedy with a decoder
# KV-cache (decoder_init.onnx + decoder_step.onnx).
#
# Python 3.12 is required: the pinned transformers/tokenizers (needed so the
# tokenizer loads identically) have no wheels on 3.13+/3.14.

# ---- Stage 1: export ONNX (has PyTorch; thrown away after) ----
FROM python:3.12-slim AS export
WORKDIR /app
ENV PIP_NO_CACHE_DIR=1 HF_HOME=/models ONNX_MODEL_DIR=/models/nort5-onnx
# CPU torch is plenty for a one-time export and far smaller than the CUDA wheel.
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu \
        --extra-index-url https://pypi.org/simple -r requirements.txt
COPY export_nort5_onnx.py .
# Download the model snapshot, then export encoder + decoder_init + decoder_step.
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('ltg/nort5-base-en-no-translation')"
RUN python export_nort5_onnx.py

# ---- Stage 2: slim runtime (no PyTorch) ----
FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models \
    ONNX_MODEL_DIR=/models/nort5-onnx \
    TRANSLATOR_PORT=8788 \
    TRANSLATOR_RUNTIME=onnx
COPY requirements-runtime.txt .
RUN pip install -r requirements-runtime.txt
COPY translate_server.py .
# Bring over ONLY the exported ONNX graphs + saved tokenizer (NOT the HF cache /
# pytorch_model.bin — the ONNX path doesn't need them). Keeps the image lean.
COPY --from=export /models/nort5-onnx /models/nort5-onnx

EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('TRANSLATOR_PORT','8788')+'/health')" || exit 1

CMD ["python", "translate_server.py"]
