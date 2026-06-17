#!/bin/bash
# =============================================================================
# Football Watcher — one-shot installer for Unraid
# -----------------------------------------------------------------------------
# Pulls both images from Docker Hub and starts both containers, each with its
# own IP on br1 (no custom bridge, no dual-network reboot bug). Re-running it
# updates to the latest images. Idempotent.
#
#   Usage:  bash install.sh
#           WEB_IP=192.168.1.123 TR_IP=192.168.1.124 bash install.sh
# =============================================================================
set -euo pipefail

BR="${BR:-br1}"
WEB_IP="${WEB_IP:-192.168.1.123}"
TR_IP="${TR_IP:-192.168.1.124}"
WEB_PORT="${WEB_PORT:-80}"
WEB_IMAGE="${WEB_IMAGE:-talentlesshack/football-watcher:latest}"
TR_IMAGE="${TR_IMAGE:-talentlesshack/nort5-translator:latest}"
ICON="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Football_%28soccer_ball%29.svg/240px-Football_%28soccer_ball%29.svg.png"

say() { echo -e "\n\033[1;36m==>\033[0m $*"; }

say "pulling images"
docker pull "$TR_IMAGE"
docker pull "$WEB_IMAGE"

# ---- translator: own br1 IP ----
say "starting translator on $BR ($TR_IP:8788)"
docker rm -f football-watcher-translator >/dev/null 2>&1 || true
docker run -d \
  --name football-watcher-translator \
  --network "$BR" --ip "$TR_IP" \
  --restart unless-stopped \
  -l net.unraid.docker.managed=dockerman \
  -l net.unraid.docker.icon="$ICON" \
  "$TR_IMAGE"

# ---- web: own br1 IP, points at the translator's br1 IP ----
say "starting web on $BR ($WEB_IP:$WEB_PORT)"
docker rm -f football-watcher-web >/dev/null 2>&1 || true
docker run -d \
  --name football-watcher-web \
  --network "$BR" --ip "$WEB_IP" \
  -e PORT="$WEB_PORT" \
  -e TRANSLATOR_URL="http://${TR_IP}:8788" \
  -e LOG_LEVEL="info" \
  --restart unless-stopped \
  -l net.unraid.docker.managed=dockerman \
  -l net.unraid.docker.webui="http://[IP]:[PORT:${WEB_PORT}]/" \
  -l net.unraid.docker.icon="$ICON" \
  "$WEB_IMAGE"

say "done — open  http://$WEB_IP"
