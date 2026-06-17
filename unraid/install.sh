#!/bin/bash
# =============================================================================
# Football Watcher — one-shot installer for Unraid
# -----------------------------------------------------------------------------
# Creates the shared network, pulls both images from Docker Hub, and starts both
# containers (translator internal + web on its own br1 IP). Re-running it updates
# to the latest images (pull + recreate). Idempotent.
#
#   Usage:  bash install.sh            # default IP 192.168.1.123
#           WEB_IP=192.168.1.130 bash install.sh
# =============================================================================
set -euo pipefail

# ---- config (override via env) ----
NET="${NET:-football-watcher}"
BR="${BR:-br1}"                       # your macvlan network for the web's own IP
WEB_IP="${WEB_IP:-192.168.1.123}"
WEB_PORT="${WEB_PORT:-80}"
WEB_IMAGE="${WEB_IMAGE:-talentlesshack/football-watcher:latest}"
TR_IMAGE="${TR_IMAGE:-talentlesshack/nort5-translator:latest}"
ICON="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Football_%28soccer_ball%29.svg/240px-Football_%28soccer_ball%29.svg.png"

say() { echo -e "\n\033[1;36m==>\033[0m $*"; }

# ---- 1. shared bridge network for web <-> translator name resolution ----
if docker network inspect "$NET" >/dev/null 2>&1; then
  say "network '$NET' already exists"
else
  say "creating network '$NET'"
  docker network create "$NET"
fi

# ---- 2. pull latest images ----
say "pulling images"
docker pull "$TR_IMAGE"
docker pull "$WEB_IMAGE"

# ---- 3. (re)create translator (internal only) ----
say "starting translator"
docker rm -f football-watcher-translator >/dev/null 2>&1 || true
docker run -d \
  --name football-watcher-translator \
  --network "$NET" \
  --network-alias translator \
  --restart unless-stopped \
  -l net.unraid.docker.managed=dockerman \
  -l net.unraid.docker.icon="$ICON" \
  "$TR_IMAGE"

# ---- 4. (re)create web (own IP on br1 + joined to the shared net) ----
say "starting web on $WEB_IP:$WEB_PORT"
docker rm -f football-watcher-web >/dev/null 2>&1 || true
docker run -d \
  --name football-watcher-web \
  --network "$BR" --ip "$WEB_IP" \
  -e PORT="$WEB_PORT" \
  -e TRANSLATOR_URL="http://translator:8788" \
  -e LOG_LEVEL="info" \
  --restart unless-stopped \
  -l net.unraid.docker.managed=dockerman \
  -l net.unraid.docker.webui="http://[IP]:[PORT:${WEB_PORT}]/" \
  -l net.unraid.docker.icon="$ICON" \
  "$WEB_IMAGE"
# Attach the web to the shared network too, so it can reach 'translator' by name.
docker network connect "$NET" football-watcher-web

say "done — open  http://$WEB_IP"
