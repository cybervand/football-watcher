# Football Watcher — Project Guide (CLAUDE.md)

Live **FIFA World Cup 2026** tracker. Single-page React app showing live scores,
day-grouped matches, group standings, an auto-advancing knockout bracket, and
per-match summaries translated Norwegian→English (with an EN/NO toggle).

Deployed as a **two-container stack** on Unraid; source on GitHub, images on
Docker Hub.

---

## Architecture

```
Browser ──> web container (React UI + Node server, br1 IP 192.168.1.123:80)
                │  serves dist/, proxies /api/translate
                └──> translator container (NorT5 ONNX Runtime, br1 IP 192.168.1.124:8788)

Browser also fetches DIRECTLY (client-side, not via server):
   - live scores  -> NIFS API (v3api.nifs.no)  + openfootball (fixtures/bracket)
   - flags        -> flagcdn.com
```

- **web** is tiny (~330 MB): Node serves the built frontend and proxies
  `/api/translate` to the translator. No ML deps.
- **translator** is large (~3.6 GB): runs `ltg/nort5-base-en-no-translation`
  through ONNX Runtime. Internal service; the web calls it by br1 IP.
- The two communicate over **br1** by IP (NOT a custom bridge — see Networking).

---

## Repos & registries

| Thing | Location |
|---|---|
| Source code | GitHub: `cybervand/football-watcher` (public) |
| web image | Docker Hub: `talentlesshack/football-watcher:latest` |
| translator image | Docker Hub: `talentlesshack/nort5-translator:latest` |

Build/push images with `--provenance=false --sbom=false` — BuildKit's default
attestation manifest makes Unraid's update checker report "not available".

---

## Layout

```
src/
  App.jsx                  view tabs (Matches / Bracket / Group Stage), polling
  components/
    MatchList.jsx          day-grouped fixtures (Live / Today / Upcoming /
                           Completed); newest-day first, within-day newest first
    Fixture.jsx            one head-to-head row (flags, score/countdown, kickoff)
    Bracket.jsx            mirrored knockout tree; auto-fits screen (useFitScale,
                           no horizontal scroll); SVG connectors
    BracketMatch.jsx       a knockout slot
    Groups.jsx             12 group standings + per-group fixtures
    Countdown.jsx          live countdown; LIVE / FT? states
    FlagChip.jsx           rounded-rect flag + name
    MatchSummary.jsx       recap modal with EN/NO language toggle
  data/
    worldcup.js            fetch + normalize; group standings; bracket build +
                           auto-advance; status (scheduled/live/awaiting/finished)
    nifs.js                NIFS live-score overlay (NO->EN team name map,
                           per-match fresh fetch, side-agnostic pair key)
    matchSummary.js        build recap from NIFS events; translate via
                           /api/translate; keep original Norwegian for the toggle
    summaryCache.js        IndexedDB cache of built summaries (per browser)
    flags.js               name -> ISO -> flag
    fallback.js            offline sample (placeholder knockout slots)
server/
  index.js                 Node http server: serves dist/, proxies /api/translate
                           to TRANSLATOR_URL; structured logging (LOG_LEVEL)
translator/
  translate_server.py      NorT5 ONNX Runtime translate service (POST /api/translate)
  export_nort5_onnx.py     exports encoder/decoder ONNX graphs at image build
  requirements.txt         PINNED: torch 2.4.1, transformers 4.46.3, tok <0.21
  Dockerfile               python:3.12-slim; bakes the model in at build
Dockerfile                 web image (multi-stage: vite build -> slim node)
docker-compose.yml         stack (alt to the two-XML Unraid path)
unraid/
  football-watcher-web.xml         Unraid template (web, br1 .123)
  football-watcher-translator.xml  Unraid template (translator, br1 .124)
  install.sh                       one-shot installer (pull + run both on br1)
  icon.png                         self-hosted app icon
DOCKER.md                  deploy guide
```

---

## Data sources (all browser-fetchable, no API keys)

- **Live scores + status**: NIFS (`v3api.nifs.no`) — the feed behind NRK. Free,
  key-less, CORS-open. The bulk `/matches/?date=` endpoint is CACHED/laggy; the
  per-match `/matches/{id}/` (trailing slash REQUIRED) is fresh — poll that for
  live games. Team names are Norwegian (alias map in `nifs.js`). WC tournament
  id = 56. See `data/nifs.js`.
- **Fixtures + bracket structure**: openfootball/worldcup.json (public domain).
  Knockout slots are placeholders ("1A", "W74", "3C/D/F…") until groups decide
  them; `worldcup.js` resolves them and auto-advances winners by feeder ref.
- **Flags**: flagcdn.com.

Score orientation: NIFS home/away need not match openfootball team1/team2.
`applyLiveScores` (App.jsx) re-orients via an alphabetical pair key. A raw
pair-key dump prints "flipped" — that's the dump, not a bug; check the rendered row.

---

## Translation (the involved part)

- Model: **`ltg/nort5-base-en-no-translation`** (Univ. of Oslo). Chosen over the
  old opus-mt for better football phrasing ("second half" not "second round").
- **Runs in ONNX Runtime by default**: the translator image exports separate
  encoder/decoder graphs at build time. PyTorch remains installed for export and
  `TRANSLATOR_RUNTIME=torch` fallback.
- **Pins are REQUIRED** (`translator/requirements.txt`): transformers 4.46.3
  (5.x breaks the custom code — missing `all_tied_weights_keys`); tokenizers
  <0.21; Python 3.12 (older tokenizers have no wheels on 3.13+/3.14).
- ONNX export/runtime adds onnxruntime 1.27.0 and onnx 1.22.0.
- Model baked into the translator image at build (works offline; first request
  ~3 s to load, then warm). Summaries cached per-browser in IndexedDB.
- Frontend keeps BOTH the English and original Norwegian so the EN/NO toggle is
  instant (no re-fetch). Wikipedia fallback summaries are NOT cached.

---

## Networking on Unraid (important, learned the hard way)

- Both containers sit on **br1** (macvlan), each with its OWN IP. Web .123,
  translator .124. Web reaches translator at `http://192.168.1.124:8788`.
- **Do NOT use dual-networking** (br1 for IP + a custom bridge for name
  resolution): Unraid's GUI can't attach two networks, and the PostArgs
  `docker network connect` workaround BREAKS on reboot (known Unraid limitation).
  Single-network-per-container is why it's two IPs, not name resolution.
- **macvlan host isolation**: the Unraid host can't reach its own br1 containers
  (curl from the host = HTTP 000). This is normal. Test from another br1 peer or
  a LAN device.
- **Tailscale gotcha**: a device accepting the advertised `192.168.1.0/24`
  subnet route sends LAN traffic via the Tailscale subnet router (the host),
  which can't reach macvlan containers — so `.123` is unreachable from such a
  device until Tailscale is off / route not accepted. The server/app are fine;
  it's the client's route.

---

## Deploy / update on Unraid

Templates are GitHub-linked (`TemplateURL`). Both images pull from Docker Hub.

One-shot install or update (pulls latest, recreates both on br1):
```bash
bash <(curl -s https://raw.githubusercontent.com/cybervand/football-watcher/main/unraid/install.sh)
# override IPs: WEB_IP=192.168.1.123 TR_IP=192.168.1.124 bash <(...)
```

Or via the Docker tab: drop the two `unraid/*.xml` into
`/boot/config/plugins/dockerMan/templates-user/`, then Add Container for each.

To ship a code change: edit source → `docker build --provenance=false ...` →
`docker push` → Unraid shows "update ready". (No CI; build/push is manual.)

---

## Build / push cheatsheet

```bash
# web
docker build --provenance=false --sbom=false -t talentlesshack/football-watcher:latest .
docker push talentlesshack/football-watcher:latest

# translator
cd translator
docker build --provenance=false --sbom=false -t talentlesshack/nort5-translator:latest .
docker push talentlesshack/nort5-translator:latest
```

Dev: `npm run dev` (vite proxies `/api` -> localhost:8788, so run a translator
container on 8788 for summaries). Live scores work without it.

---

## Gotchas / history worth knowing

- The web image must NOT include `server/models` (the old opus-mt model) — it's
  gitignored and not used; the translator owns translation now.
- Unraid "update: not available" was caused by (1) BuildKit attestation
  manifests and (2) a stale `registry-1.docker.io/...` digest in
  `/var/lib/docker/unraid-update-status.json`. Fix: build `--provenance=false`,
  and if needed clear that container's entry from the json.
- Icons: host the icon IN the repo (`unraid/icon.png`) — the Wikimedia thumb URL
  returned HTTP 400 and showed blank.
