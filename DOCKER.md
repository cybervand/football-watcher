# Running Football Watcher (Docker stack, incl. Unraid)

Football Watcher runs as a **two-container stack**:

| Service | What it is | Image | Size |
|---|---|---|---|
| **web** | React UI + Node server. Serves the app and proxies `/api/translate`. | Built **locally from this repo's source** (`football-watcher-web:local`) | ~330 MB |
| **translator** | NorT5 Norwegian→English model running in ONNX Runtime. Internal-only. | Pulled from **Docker Hub** (`talentlesshack/nort5-translator`) | ~3.6 GB |

**Why split this way:** the web app is tiny and changes often, so it's built from source on the spot. The translation model is huge and almost never changes, so it's a prebuilt Docker Hub image you just pull. The web app talks to the translator over a private internal network — the translator is never exposed to your LAN.

Live scores (NIFS/openfootball) and flags are fetched by the browser; match summaries are translated by the translator service. Summaries are cached per-browser (IndexedDB), so each match is translated once.

---

## Quick start (any machine with Docker + compose)

```bash
# from the repo root (web builds locally, translator pulls from Docker Hub)
docker compose up -d
```

The default `docker-compose.yml` puts **web** on the `br1` custom network with its own IP (`192.168.1.123`). On a plain machine without `br1`, use the bridge override below instead.

### Bridge (no custom network) — for a normal PC/server

```yaml
# docker-compose.override.yml
services:
  web:
    networks: !reset null
    ports: ["8787:80"]
networks:
  br1: !reset null
```
Then `docker compose up -d` and open `http://<host>:8787`.

---

## Unraid (Docker Compose Manager)

1. Install **Docker Compose Manager** from Community Apps.
2. Clone this repo onto the server (so the web image can be built from source):
   ```bash
   git clone https://github.com/cybervand/football-watcher /mnt/user/appdata/football-watcher-src
   ```
   (Or pull updates later with `git pull` in that folder.)
3. In Compose Manager: **Add New Stack** → name it `football-watcher` → paste/point at
   `docker-compose.yml`. Set the build context to the cloned folder.
4. Edit the `web` service's **`ipv4_address`** to a free IP on your `br1` network.
5. **Compose Up.** It builds `web` locally and pulls `translator` from Docker Hub.
6. Open `http://<the-web-ip>` (port 80, its own IP — translator stays internal).

### Updating
- **App code changed:** `git pull` in the source folder, then **Compose Up** again
  (it rebuilds only the small web image).
- **Translator/model changed (rare):** `docker compose pull translator` then Compose Up.

---

## Configuration

| Service | Setting | Default | Notes |
|---|---|---|---|
| web | `PORT` | `80` | Port the UI listens on (its own IP). |
| web | `TRANSLATOR_URL` | `http://translator:8788` | Where to reach the translator (service name in the stack). |
| web | `LOG_LEVEL` | `info` | `debug` for verbose boot/request logs. |
| translator | `TRANSLATOR_PORT` | `8788` | Internal port; not exposed to LAN. |

No volumes — the stack is stateless (summary cache lives in each browser).

---

## The translation model (for maintainers)

The translator runs **`ltg/nort5-base-en-no-translation`** (University of Oslo)
through ONNX Runtime. The Docker build first downloads the Hugging Face snapshot,
then `translator/export_nort5_onnx.py` exports separate encoder and decoder
graphs into `/models/nort5-onnx`.

NorT5 still needs its pinned PyTorch/Transformers stack during export because its
custom model code (`modeling_nort5.py`, with custom relative attention) is not a
standard Transformers architecture. The runtime defaults to
`TRANSLATOR_RUNTIME=auto`: use ONNX graphs when present, otherwise fall back to
PyTorch. Set `TRANSLATOR_RUNTIME=onnx` to fail if ONNX assets are missing, or
`TRANSLATOR_RUNTIME=torch` to force the old path.

The pins in `translator/requirements.txt` are **required**:
- `transformers==4.46.3` — 5.x breaks NorT5's custom code (`all_tied_weights_keys`).
- `tokenizers <0.21` — to match transformers 4.46.x.
- Python **3.12** — older `tokenizers` has no wheels on 3.13+/3.14.

ONNX export/runtime adds `onnxruntime==1.27.0` and `onnx==1.22.0`.

The model is baked into the translator image at build time, so the container
works offline and the first request only pays model-load time (~3 s), not a
download. To rebuild + republish the translator:

```bash
cd translator
docker build --provenance=false --sbom=false -t talentlesshack/nort5-translator:latest .
docker push talentlesshack/nort5-translator:latest
```

`--provenance=false` matters: BuildKit's default attestation manifest makes
Unraid's update checker report "not available" instead of comparing digests.
