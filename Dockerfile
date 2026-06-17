# syntax=docker/dockerfile:1

# =============================================================================
# Football Watcher — WEB image (World Cup 2026 live tracker)
# Multi-stage build: compile the React frontend, then ship a slim Node runtime
# that serves the built app and PROXIES /api/translate to the translator
# service (see ../translator). No ML deps or model here — this image is tiny.
# =============================================================================

# ---- Stage 1: build the frontend ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install ALL deps (incl. dev) for the Vite build, using the lockfile if present.
COPY package*.json ./
RUN npm ci || npm install

# Build the production frontend into /app/dist.
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build


# ---- Stage 2: runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The server uses only Node built-ins + global fetch — no npm deps at runtime.
# (React/Vite were build-time only; they're bundled into dist.)
COPY server ./server
COPY --from=build /app/dist ./dist

# Served port (frontend + /api/translate). Defaults to 80 so it serves cleanly
# at the container's own IP (http://<ip>) on a custom/macvlan network. Override
# with -e PORT=... for bridge setups.
ENV PORT=80
EXPOSE 80

# Lightweight healthcheck: the HTTP server answers GET / once dist is served.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||80)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
