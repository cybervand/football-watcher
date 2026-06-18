# syntax=docker/dockerfile:1
# NorT5 translation service — Norwegian -> English, runs the model in ONNX Runtime.
# GPU-enabled: torch is the CUDA 12.4 build. The host needs the NVIDIA driver +
# the nvidia container runtime; run the container with --gpus all. Falls back to
# CPU automatically if no GPU is present (torch.cuda.is_available() == False).
# Python 3.12 is required: the older transformers/tokenizers pins have no wheels
# on 3.13+/3.14, and transformers 5.x breaks NorT5's custom code.
FROM python:3.12-slim AS runtime
WORKDIR /app

ENV PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models \
    ONNX_MODEL_DIR=/models/nort5-onnx \
    TRANSLATOR_PORT=8788

# CUDA torch wheel from the PyTorch cu124 index; everything else from PyPI.
COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cu124 \
        --extra-index-url https://pypi.org/simple \
        -r requirements.txt

COPY translate_server.py export_nort5_onnx.py ./

# Bake the model into the image at build time so first request isn't a download
# (and so the container works offline). ~900MB of weights/cache land in /models.
RUN python -c "from huggingface_hub import snapshot_download; \
    snapshot_download('ltg/nort5-base-en-no-translation')"
RUN python export_nort5_onnx.py

EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('TRANSLATOR_PORT','8788')+'/health')" || exit 1

CMD ["python", "translate_server.py"]
