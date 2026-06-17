import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// DEBUG: a dev-only endpoint that runs the real data pipeline server-side and
// returns every match resolved BY NAME (groups + knockout). Lets us inspect
// "who is in each match" by fetching http://localhost:5173/debug/matches —
// no browser console needed. Remove when done.
function debugMatchesPlugin() {
  return {
    name: 'debug-matches',
    configureServer(server) {
      server.middlewares.use('/debug/matches', async (_req, res) => {
        try {
          const { normalizeMatches, buildGroups, buildBracket } = await server.ssrLoadModule(
            '/src/data/worldcup.js',
          )
          const r = await fetch(
            'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
            { cache: 'no-store' },
          )
          const data = await r.json()
          const matches = normalizeMatches(data)
          const groups = buildGroups(matches)
          const bracket = buildBracket(matches)

          const out = {
            source: 'live openfootball',
            groups: Object.fromEntries(
              Object.entries(groups).map(([g, table]) => [g, table.map((t) => t.team)]),
            ),
            bracket: bracket.map((round) => ({
              round: round.name,
              matches: round.matches.map((m) => ({
                num: m.num,
                team1: m.team1,
                team2: m.team2,
                slots: `${m.originalTeam1} / ${m.originalTeam2}`,
                status: m.status,
                kickoff: m.kickoff ? m.kickoff.toISOString() : null,
              })),
            })),
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(out, null, 2))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: e.message, stack: e.stack }))
        }
      })
    },
  }
}

// The openfootball data is on GitHub raw; we proxy it in dev to dodge CORS and
// keep the fetch URL identical between dev and prod.
export default defineConfig({
  plugins: [react(), debugMatchesPlugin()],
  server: {
    host: true, // bind to all interfaces so other devices on the LAN can reach it
    port: 5173,
    open: true,
    proxy: {
      '/wc-data': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/wc-data/, '/openfootball/worldcup.json/master'),
      },
      // In dev, /api/translate is served directly by the NorT5 translator
      // (run it with: docker run -p 8788:8788 talentlesshack/nort5-translator).
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
})
