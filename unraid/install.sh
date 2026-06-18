#!/bin/bash
# =============================================================================
# Football Watcher — installer / updater for Unraid
# -----------------------------------------------------------------------------
# Pulls images from Docker Hub and (re)creates the containers, each with its own
# IP on br1 (no custom bridge, no dual-network reboot bug).
#
#   bash install.sh                  # both web + translator
#   bash install.sh --web-only       # only the web container (e.g. UI change)
#   bash install.sh --translator-only# only the translator (e.g. model change)
#   WEB_IP=192.168.1.123 TR_IP=192.168.1.124 bash install.sh
#
# Recreating a container is a few seconds of downtime, so update only what you
# changed: --translator-only leaves the web UI running, and vice-versa.
# =============================================================================
set -euo pipefail

BR="${BR:-br1}"
WEB_IP="${WEB_IP:-192.168.1.123}"
TR_IP="${TR_IP:-192.168.1.124}"
WEB_PORT="${WEB_PORT:-80}"
WEB_IMAGE="${WEB_IMAGE:-talentlesshack/football-watcher:latest}"
TR_IMAGE="${TR_IMAGE:-talentlesshack/nort5-translator:latest}"
ICON="https://raw.githubusercontent.com/cybervand/football-watcher/main/unraid/icon.png"

# Which services to (re)deploy — default both.
DO_WEB=1; DO_TR=1
case "${1:-}" in
  --web-only)        DO_TR=0 ;;
  --translator-only) DO_WEB=0 ;;
  "" )               ;;
  * ) echo "unknown arg: $1 (use --web-only or --translator-only)"; exit 1 ;;
esac

say() { echo -e "\n\033[1;36m==>\033[0m $*"; }

deploy_translator() {
  say "pulling + starting translator on $BR ($TR_IP:8788)"
  docker pull "$TR_IMAGE"
  docker rm -f football-watcher-translator >/dev/null 2>&1 || true
  docker run -d \
    --name football-watcher-translator \
    --network "$BR" --ip "$TR_IP" \
    --restart unless-stopped \
    -l net.unraid.docker.managed=dockerman \
    -l net.unraid.docker.icon="$ICON" \
    "$TR_IMAGE"
}

deploy_web() {
  say "pulling + starting web on $BR ($WEB_IP:$WEB_PORT)"
  docker pull "$WEB_IMAGE"
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
}

[ "$DO_TR" = 1 ] && deploy_translator
[ "$DO_WEB" = 1 ] && deploy_web

say "done — open  http://$WEB_IP"
