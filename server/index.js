// =============================================================================
// SERVER — serves the built frontend and PROXIES the translation API.
// -----------------------------------------------------------------------------
// This Node process:
//   1. Serves the production build in ../dist (the React app).
//   2. POST /api/translate  { texts: string[] }  ->  { translations: string[] }
//      is PROXIED to the NorT5 translator service (a separate container running
//      the model through ONNX Runtime — see ../translator/). The web image stays small;
//      the heavy model lives only in the translator image.
//
// In the compose stack the translator is reachable at http://translator:8788.
// Override with TRANSLATOR_URL.
// =============================================================================

import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'dist')
const PORT = process.env.PORT || 80
const HOST = process.env.HOST || '0.0.0.0'
const TRANSLATOR_URL = process.env.TRANSLATOR_URL || 'http://translator:8788'

// --- Logging ----------------------------------------------------------------
// Timestamped, tagged, level-filtered. LOG_LEVEL=debug for the most detail,
// =info (default) for normal, =warn/=error to quiet it down. Writes to stdout
// so `docker logs` / the Unraid log viewer shows everything.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const LOG_LEVEL = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? 2
function log(level, tag, msg, extra) {
  if ((LEVELS[level] ?? 2) > LOG_LEVEL) return
  const ts = new Date().toISOString()
  const line = `${ts} ${level.toUpperCase().padEnd(5)} [${tag}] ${msg}`
  const out = extra !== undefined ? `${line} ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : line
  ;(level === 'error' ? console.error : console.log)(out)
}
const logger = {
  error: (t, m, e) => log('error', t, m, e),
  warn: (t, m, e) => log('warn', t, m, e),
  info: (t, m, e) => log('info', t, m, e),
  debug: (t, m, e) => log('debug', t, m, e),
}

// --- HTTP -------------------------------------------------------------------
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

async function handleTranslate(req, res) {
  let body = ''
  for await (const c of req) body += c
  let texts
  try {
    const data = JSON.parse(body || '{}')
    texts = Array.isArray(data.texts) ? data.texts : (data.text ? [data.text] : [])
  } catch {
    logger.warn('translate', 'rejected: invalid JSON body')
    return sendJson(res, 400, { error: 'invalid JSON' })
  }
  if (!texts.length) {
    logger.warn('translate', 'rejected: no texts provided')
    return sendJson(res, 400, { error: 'no texts provided' })
  }
  const chars = texts.reduce((n, t) => n + (t?.length || 0), 0)
  logger.info('translate', `proxying ${texts.length} text(s), ${chars} chars -> ${TRANSLATOR_URL}`)
  const t0 = Date.now()
  try {
    // First request triggers the translator's lazy model load, so allow time.
    const upstream = await fetch(`${TRANSLATOR_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(120000),
    })
    const payload = await upstream.json()
    logger.info('translate', `done in ${Date.now() - t0}ms (upstream ${upstream.status})`)
    sendJson(res, upstream.status, payload)
  } catch (err) {
    logger.error('translate', `proxy failed after ${Date.now() - t0}ms`, err.message)
    sendJson(res, 502, { error: `translator unreachable: ${err.message}` })
  }
}

// Stream proxy: forward the request to the translator's NDJSON streaming
// endpoint and pipe chunks straight through so the browser sees partial
// translations live (no buffering).
async function handleTranslateStream(req, res) {
  let body = ''
  for await (const c of req) body += c
  const t0 = Date.now()
  logger.info('translate', `stream proxy -> ${TRANSLATOR_URL}`)
  try {
    const upstream = await fetch(`${TRANSLATOR_URL}/api/translate/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body || '{}',
      signal: AbortSignal.timeout(180000),
    })
    res.writeHead(upstream.status, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    })
    // Pipe the upstream web ReadableStream to the Node response, chunk by chunk.
    const reader = upstream.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
    logger.info('translate', `stream done in ${Date.now() - t0}ms (upstream ${upstream.status})`)
  } catch (err) {
    logger.error('translate', `stream proxy failed after ${Date.now() - t0}ms`, err.message)
    if (!res.headersSent) sendJson(res, 502, { error: `translator unreachable: ${err.message}` })
    else res.end()
  }
}

async function serveStatic(req, res) {
  // Map URL to a file in dist; fall back to index.html (SPA).
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (urlPath === '/') urlPath = '/index.html'
  const filePath = normalize(join(DIST, urlPath))
  if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end('forbidden') }

  const hit = existsSync(filePath)
  const target = hit ? filePath : join(DIST, 'index.html')
  if (!hit && urlPath !== '/index.html') {
    logger.debug('http', `no file for ${urlPath} — serving SPA index.html`)
  }
  try {
    const data = await readFile(target)
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream' })
    res.end(data)
  } catch (err) {
    logger.warn('http', `404 ${urlPath}`, err.message)
    res.writeHead(404); res.end('not found')
  }
}

const server = http.createServer((req, res) => {
  const t0 = Date.now()
  const ip = req.socket.remoteAddress
  res.on('finish', () => {
    const ms = Date.now() - t0
    // API + errors at info/warn/error so they're visible by default; routine
    // static asset hits stay at debug to avoid drowning the log.
    const isApi = req.url?.startsWith('/api/')
    const lvl = res.statusCode >= 500 ? 'error'
      : res.statusCode >= 400 ? 'warn'
      : (isApi || req.url === '/' || req.url === '/index.html') ? 'info'
      : 'debug'
    logger[lvl]('http', `${req.method} ${req.url} → ${res.statusCode} (${ms}ms) ${ip}`)
  })
  if (req.method === 'POST' && req.url === '/api/translate/stream') return handleTranslateStream(req, res)
  if (req.method === 'POST' && req.url === '/api/translate') return handleTranslate(req, res)
  if (req.method === 'GET') return serveStatic(req, res)
  logger.warn('http', `405 ${req.method} ${req.url}`)
  res.writeHead(405); res.end('method not allowed')
})

// --- Boot ------------------------------------------------------------------
logger.info('boot', '──────────────────────────────────────────────')
logger.info('boot', 'Football Watcher server starting')
logger.info('boot', `node ${process.version} on ${process.platform}/${process.arch}`)
logger.info('boot', `config: HOST=${HOST} PORT=${PORT} LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}`)
logger.info('boot', `frontend dist: ${DIST} (${existsSync(DIST) ? 'present' : 'MISSING ⚠'})`)
logger.info('boot', `dist/index.html: ${existsSync(join(DIST, 'index.html')) ? 'present' : 'MISSING ⚠'}`)
logger.info('boot', `translator (for /api/translate): ${TRANSLATOR_URL}`)
logger.info('boot', '──────────────────────────────────────────────')

server.listen(PORT, HOST, () => {
  logger.info('server', `listening on http://${HOST}:${PORT}  (reach it at the container's IP)`)
  logger.info('server', `serving frontend from ${DIST}`)
  logger.info('server', 'ready — live scores fetch client-side (browser → NIFS/openfootball); /api/translate handles summaries')
})

// Surface anything that would otherwise crash the process silently.
process.on('uncaughtException', (e) => logger.error('fatal', 'uncaughtException', e.stack || e.message))
process.on('unhandledRejection', (e) => logger.error('fatal', 'unhandledRejection', e?.stack || String(e)))
server.on('error', (e) => logger.error('server', 'listen error', e.message))
