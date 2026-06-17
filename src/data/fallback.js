// Bundled fallback dataset, used ONLY when the live openfootball fetch fails
// (offline, GitHub down, CORS). Same shape as the live JSON: { name, matches }.
//
// IMPORTANT: this mirrors the REAL feed's structure — knockout slots use
// placeholder references (1I = winner of Group I, 2I = runner-up, W74 = winner
// of match 74, "3C/D/F/G/H" = a best-third-place team), exactly like the live
// data. It deliberately does NOT invent confirmed knockout matchups, so offline
// mode can never imply, say, "France vs Senegal in the Round of 32" when no such
// fixture is decided. Real country names appear only in group fixtures, which
// ARE known in advance. Live data, when reachable, always wins over this.
export default {
  name: 'World Cup 2026 (offline sample)',
  matches: [
    // ---- Real group fixtures (full schedule, mirrored from openfootball) ----
    // Group A
    { round: 'Matchday 1', group: 'Group A', date: '2026-06-11', time: '13:00 UTC-6', team1: 'Mexico', team2: 'South Africa', score: { ft: [] }, ground: 'Mexico City' },
    { round: 'Matchday 1', group: 'Group A', date: '2026-06-11', time: '20:00 UTC-6', team1: 'South Korea', team2: 'Czech Republic', score: { ft: [] }, ground: 'Guadalajara (Zapopan)' },
    { round: 'Matchday 8', group: 'Group A', date: '2026-06-18', time: '12:00 UTC-4', team1: 'Czech Republic', team2: 'South Africa', score: { ft: [] }, ground: 'Atlanta' },
    { round: 'Matchday 8', group: 'Group A', date: '2026-06-18', time: '19:00 UTC-6', team1: 'Mexico', team2: 'South Korea', score: { ft: [] }, ground: 'Guadalajara (Zapopan)' },
    { round: 'Matchday 14', group: 'Group A', date: '2026-06-24', time: '19:00 UTC-6', team1: 'Czech Republic', team2: 'Mexico', score: { ft: [] }, ground: 'Mexico City' },
    { round: 'Matchday 14', group: 'Group A', date: '2026-06-24', time: '19:00 UTC-6', team1: 'South Africa', team2: 'South Korea', score: { ft: [] }, ground: 'Monterrey (Guadalupe)' },
    // Group B
    { round: 'Matchday 2', group: 'Group B', date: '2026-06-12', time: '15:00 UTC-4', team1: 'Canada', team2: 'Bosnia & Herzegovina', score: { ft: [] }, ground: 'Toronto' },
    { round: 'Matchday 3', group: 'Group B', date: '2026-06-13', time: '12:00 UTC-7', team1: 'Qatar', team2: 'Switzerland', score: { ft: [] }, ground: 'San Francisco Bay Area (Santa Clara)' },
    { round: 'Matchday 8', group: 'Group B', date: '2026-06-18', time: '12:00 UTC-7', team1: 'Switzerland', team2: 'Bosnia & Herzegovina', score: { ft: [] }, ground: 'Los Angeles (Inglewood)' },
    { round: 'Matchday 8', group: 'Group B', date: '2026-06-18', time: '15:00 UTC-7', team1: 'Canada', team2: 'Qatar', score: { ft: [] }, ground: 'Vancouver' },
    { round: 'Matchday 14', group: 'Group B', date: '2026-06-24', time: '12:00 UTC-7', team1: 'Switzerland', team2: 'Canada', score: { ft: [] }, ground: 'Vancouver' },
    { round: 'Matchday 14', group: 'Group B', date: '2026-06-24', time: '12:00 UTC-7', team1: 'Bosnia & Herzegovina', team2: 'Qatar', score: { ft: [] }, ground: 'Seattle' },
    // Group C
    { round: 'Matchday 3', group: 'Group C', date: '2026-06-13', time: '18:00 UTC-4', team1: 'Brazil', team2: 'Morocco', score: { ft: [] }, ground: 'New York/New Jersey (East Rutherford)' },
    { round: 'Matchday 3', group: 'Group C', date: '2026-06-13', time: '21:00 UTC-4', team1: 'Haiti', team2: 'Scotland', score: { ft: [] }, ground: 'Boston (Foxborough)' },
    { round: 'Matchday 9', group: 'Group C', date: '2026-06-19', time: '18:00 UTC-4', team1: 'Scotland', team2: 'Morocco', score: { ft: [] }, ground: 'Boston (Foxborough)' },
    { round: 'Matchday 9', group: 'Group C', date: '2026-06-19', time: '20:30 UTC-4', team1: 'Brazil', team2: 'Haiti', score: { ft: [] }, ground: 'Philadelphia' },
    { round: 'Matchday 14', group: 'Group C', date: '2026-06-24', time: '18:00 UTC-4', team1: 'Scotland', team2: 'Brazil', score: { ft: [] }, ground: 'Miami (Miami Gardens)' },
    { round: 'Matchday 14', group: 'Group C', date: '2026-06-24', time: '18:00 UTC-4', team1: 'Morocco', team2: 'Haiti', score: { ft: [] }, ground: 'Atlanta' },
    // Group D
    { round: 'Matchday 2', group: 'Group D', date: '2026-06-12', time: '18:00 UTC-7', team1: 'USA', team2: 'Paraguay', score: { ft: [] }, ground: 'Los Angeles (Inglewood)' },
    { round: 'Matchday 3', group: 'Group D', date: '2026-06-13', time: '21:00 UTC-7', team1: 'Australia', team2: 'Turkey', score: { ft: [] }, ground: 'Vancouver' },
    { round: 'Matchday 9', group: 'Group D', date: '2026-06-19', time: '12:00 UTC-7', team1: 'USA', team2: 'Australia', score: { ft: [] }, ground: 'Seattle' },
    { round: 'Matchday 9', group: 'Group D', date: '2026-06-19', time: '20:00 UTC-7', team1: 'Turkey', team2: 'Paraguay', score: { ft: [] }, ground: 'San Francisco Bay Area (Santa Clara)' },
    { round: 'Matchday 15', group: 'Group D', date: '2026-06-25', time: '19:00 UTC-7', team1: 'Turkey', team2: 'USA', score: { ft: [] }, ground: 'Los Angeles (Inglewood)' },
    { round: 'Matchday 15', group: 'Group D', date: '2026-06-25', time: '19:00 UTC-7', team1: 'Paraguay', team2: 'Australia', score: { ft: [] }, ground: 'San Francisco Bay Area (Santa Clara)' },
    // Group E
    { round: 'Matchday 4', group: 'Group E', date: '2026-06-14', time: '12:00 UTC-5', team1: 'Germany', team2: 'Curaçao', score: { ft: [] }, ground: 'Houston' },
    { round: 'Matchday 4', group: 'Group E', date: '2026-06-14', time: '19:00 UTC-4', team1: 'Ivory Coast', team2: 'Ecuador', score: { ft: [] }, ground: 'Philadelphia' },
    { round: 'Matchday 10', group: 'Group E', date: '2026-06-20', time: '16:00 UTC-4', team1: 'Germany', team2: 'Ivory Coast', score: { ft: [] }, ground: 'Toronto' },
    { round: 'Matchday 10', group: 'Group E', date: '2026-06-20', time: '19:00 UTC-5', team1: 'Ecuador', team2: 'Curaçao', score: { ft: [] }, ground: 'Kansas City' },
    { round: 'Matchday 15', group: 'Group E', date: '2026-06-25', time: '16:00 UTC-4', team1: 'Curaçao', team2: 'Ivory Coast', score: { ft: [] }, ground: 'Philadelphia' },
    { round: 'Matchday 15', group: 'Group E', date: '2026-06-25', time: '16:00 UTC-4', team1: 'Ecuador', team2: 'Germany', score: { ft: [] }, ground: 'New York/New Jersey (East Rutherford)' },
    // Group F
    { round: 'Matchday 4', group: 'Group F', date: '2026-06-14', time: '15:00 UTC-5', team1: 'Netherlands', team2: 'Japan', score: { ft: [] }, ground: 'Dallas (Arlington)' },
    { round: 'Matchday 4', group: 'Group F', date: '2026-06-14', time: '20:00 UTC-6', team1: 'Sweden', team2: 'Tunisia', score: { ft: [] }, ground: 'Monterrey (Guadalupe)' },
    { round: 'Matchday 10', group: 'Group F', date: '2026-06-20', time: '12:00 UTC-5', team1: 'Netherlands', team2: 'Sweden', score: { ft: [] }, ground: 'Houston' },
    { round: 'Matchday 10', group: 'Group F', date: '2026-06-20', time: '22:00 UTC-6', team1: 'Tunisia', team2: 'Japan', score: { ft: [] }, ground: 'Monterrey (Guadalupe)' },
    { round: 'Matchday 15', group: 'Group F', date: '2026-06-25', time: '18:00 UTC-5', team1: 'Japan', team2: 'Sweden', score: { ft: [] }, ground: 'Dallas (Arlington)' },
    { round: 'Matchday 15', group: 'Group F', date: '2026-06-25', time: '18:00 UTC-5', team1: 'Tunisia', team2: 'Netherlands', score: { ft: [] }, ground: 'Kansas City' },
    // Group G
    { round: 'Matchday 5', group: 'Group G', date: '2026-06-15', time: '12:00 UTC-7', team1: 'Belgium', team2: 'Egypt', score: { ft: [] }, ground: 'Seattle' },
    { round: 'Matchday 5', group: 'Group G', date: '2026-06-15', time: '18:00 UTC-7', team1: 'Iran', team2: 'New Zealand', score: { ft: [] }, ground: 'Los Angeles (Inglewood)' },
    { round: 'Matchday 11', group: 'Group G', date: '2026-06-21', time: '12:00 UTC-7', team1: 'Belgium', team2: 'Iran', score: { ft: [] }, ground: 'Los Angeles (Inglewood)' },
    { round: 'Matchday 11', group: 'Group G', date: '2026-06-21', time: '18:00 UTC-7', team1: 'New Zealand', team2: 'Egypt', score: { ft: [] }, ground: 'Vancouver' },
    { round: 'Matchday 16', group: 'Group G', date: '2026-06-26', time: '20:00 UTC-7', team1: 'Egypt', team2: 'Iran', score: { ft: [] }, ground: 'Seattle' },
    { round: 'Matchday 16', group: 'Group G', date: '2026-06-26', time: '20:00 UTC-7', team1: 'New Zealand', team2: 'Belgium', score: { ft: [] }, ground: 'Vancouver' },
    // Group H
    { round: 'Matchday 5', group: 'Group H', date: '2026-06-15', time: '12:00 UTC-4', team1: 'Spain', team2: 'Cape Verde', score: { ft: [] }, ground: 'Atlanta' },
    { round: 'Matchday 5', group: 'Group H', date: '2026-06-15', time: '18:00 UTC-4', team1: 'Saudi Arabia', team2: 'Uruguay', score: { ft: [] }, ground: 'Miami (Miami Gardens)' },
    { round: 'Matchday 11', group: 'Group H', date: '2026-06-21', time: '12:00 UTC-4', team1: 'Spain', team2: 'Saudi Arabia', score: { ft: [] }, ground: 'Atlanta' },
    { round: 'Matchday 11', group: 'Group H', date: '2026-06-21', time: '18:00 UTC-4', team1: 'Uruguay', team2: 'Cape Verde', score: { ft: [] }, ground: 'Miami (Miami Gardens)' },
    { round: 'Matchday 16', group: 'Group H', date: '2026-06-26', time: '19:00 UTC-5', team1: 'Cape Verde', team2: 'Saudi Arabia', score: { ft: [] }, ground: 'Houston' },
    { round: 'Matchday 16', group: 'Group H', date: '2026-06-26', time: '18:00 UTC-6', team1: 'Uruguay', team2: 'Spain', score: { ft: [] }, ground: 'Guadalajara (Zapopan)' },
    // Group I — France, Senegal, Norway, Iraq. France v Senegal is a GROUP game.
    { round: 'Matchday 6', group: 'Group I', date: '2026-06-16', time: '15:00 UTC-4', team1: 'France', team2: 'Senegal', score: { ft: [] }, ground: 'New York/New Jersey (East Rutherford)' },
    { round: 'Matchday 6', group: 'Group I', date: '2026-06-16', time: '18:00 UTC-4', team1: 'Iraq', team2: 'Norway', score: { ft: [] }, ground: 'Boston (Foxborough)' },
    { round: 'Matchday 12', group: 'Group I', date: '2026-06-22', time: '17:00 UTC-4', team1: 'France', team2: 'Iraq', score: { ft: [] }, ground: 'Philadelphia' },
    { round: 'Matchday 12', group: 'Group I', date: '2026-06-22', time: '20:00 UTC-4', team1: 'Norway', team2: 'Senegal', score: { ft: [] }, ground: 'New York/New Jersey (East Rutherford)' },
    { round: 'Matchday 16', group: 'Group I', date: '2026-06-26', time: '15:00 UTC-4', team1: 'Norway', team2: 'France', score: { ft: [] }, ground: 'Boston (Foxborough)' },
    { round: 'Matchday 16', group: 'Group I', date: '2026-06-26', time: '15:00 UTC-4', team1: 'Senegal', team2: 'Iraq', score: { ft: [] }, ground: 'Toronto' },
    // Group J
    { round: 'Matchday 6', group: 'Group J', date: '2026-06-16', time: '20:00 UTC-5', team1: 'Argentina', team2: 'Algeria', score: { ft: [] }, ground: 'Kansas City' },
    { round: 'Matchday 6', group: 'Group J', date: '2026-06-16', time: '21:00 UTC-7', team1: 'Austria', team2: 'Jordan', score: { ft: [] }, ground: 'San Francisco Bay Area (Santa Clara)' },
    { round: 'Matchday 12', group: 'Group J', date: '2026-06-22', time: '12:00 UTC-5', team1: 'Argentina', team2: 'Austria', score: { ft: [] }, ground: 'Dallas (Arlington)' },
    { round: 'Matchday 12', group: 'Group J', date: '2026-06-22', time: '20:00 UTC-7', team1: 'Jordan', team2: 'Algeria', score: { ft: [] }, ground: 'San Francisco Bay Area (Santa Clara)' },
    { round: 'Matchday 17', group: 'Group J', date: '2026-06-27', time: '21:00 UTC-5', team1: 'Algeria', team2: 'Austria', score: { ft: [] }, ground: 'Kansas City' },
    { round: 'Matchday 17', group: 'Group J', date: '2026-06-27', time: '21:00 UTC-5', team1: 'Jordan', team2: 'Argentina', score: { ft: [] }, ground: 'Dallas (Arlington)' },
    // Group K
    { round: 'Matchday 7', group: 'Group K', date: '2026-06-17', time: '12:00 UTC-5', team1: 'Portugal', team2: 'DR Congo', score: { ft: [] }, ground: 'Houston' },
    { round: 'Matchday 7', group: 'Group K', date: '2026-06-17', time: '20:00 UTC-6', team1: 'Uzbekistan', team2: 'Colombia', score: { ft: [] }, ground: 'Mexico City' },
    { round: 'Matchday 13', group: 'Group K', date: '2026-06-23', time: '12:00 UTC-5', team1: 'Portugal', team2: 'Uzbekistan', score: { ft: [] }, ground: 'Houston' },
    { round: 'Matchday 13', group: 'Group K', date: '2026-06-23', time: '20:00 UTC-6', team1: 'Colombia', team2: 'DR Congo', score: { ft: [] }, ground: 'Guadalajara (Zapopan)' },
    { round: 'Matchday 17', group: 'Group K', date: '2026-06-27', time: '19:30 UTC-4', team1: 'Colombia', team2: 'Portugal', score: { ft: [] }, ground: 'Miami (Miami Gardens)' },
    { round: 'Matchday 17', group: 'Group K', date: '2026-06-27', time: '19:30 UTC-4', team1: 'DR Congo', team2: 'Uzbekistan', score: { ft: [] }, ground: 'Atlanta' },
    // Group L
    { round: 'Matchday 7', group: 'Group L', date: '2026-06-17', time: '15:00 UTC-5', team1: 'England', team2: 'Croatia', score: { ft: [] }, ground: 'Dallas (Arlington)' },
    { round: 'Matchday 7', group: 'Group L', date: '2026-06-17', time: '19:00 UTC-4', team1: 'Ghana', team2: 'Panama', score: { ft: [] }, ground: 'Toronto' },
    { round: 'Matchday 13', group: 'Group L', date: '2026-06-23', time: '16:00 UTC-4', team1: 'England', team2: 'Ghana', score: { ft: [] }, ground: 'Boston (Foxborough)' },
    { round: 'Matchday 13', group: 'Group L', date: '2026-06-23', time: '19:00 UTC-4', team1: 'Panama', team2: 'Croatia', score: { ft: [] }, ground: 'Toronto' },
    { round: 'Matchday 17', group: 'Group L', date: '2026-06-27', time: '17:00 UTC-4', team1: 'Panama', team2: 'England', score: { ft: [] }, ground: 'New York/New Jersey (East Rutherford)' },
    { round: 'Matchday 17', group: 'Group L', date: '2026-06-27', time: '17:00 UTC-4', team1: 'Croatia', team2: 'Ghana', score: { ft: [] }, ground: 'Philadelphia' },

    // ---- Knockout skeleton: placeholder slots, real interleaved topology ----
    // Round of 32 (slots = group placements; ordered by num)
    { round: 'Round of 32', num: 73, date: '2026-06-28', time: '15:00 UTC-4', team1: '2A', team2: '2B', score: { ft: [] } },
    { round: 'Round of 32', num: 74, date: '2026-06-28', time: '19:00 UTC-4', team1: '1E', team2: '3A/B/C/D/F', score: { ft: [] } },
    { round: 'Round of 32', num: 75, date: '2026-06-29', time: '15:00 UTC-4', team1: '1F', team2: '2C', score: { ft: [] } },
    { round: 'Round of 32', num: 76, date: '2026-06-29', time: '19:00 UTC-4', team1: '1C', team2: '2F', score: { ft: [] } },
    { round: 'Round of 32', num: 77, date: '2026-06-30', time: '15:00 UTC-4', team1: '1I', team2: '3C/D/F/G/H', score: { ft: [] } },
    { round: 'Round of 32', num: 78, date: '2026-06-30', time: '19:00 UTC-4', team1: '2E', team2: '2I', score: { ft: [] } },
    { round: 'Round of 32', num: 79, date: '2026-07-01', time: '15:00 UTC-4', team1: '1A', team2: '3C/E/F/H/I', score: { ft: [] } },
    { round: 'Round of 32', num: 80, date: '2026-07-01', time: '19:00 UTC-4', team1: '1L', team2: '3E/H/I/J/K', score: { ft: [] } },
    { round: 'Round of 32', num: 81, date: '2026-07-02', time: '15:00 UTC-4', team1: '1D', team2: '3B/E/F/I/J', score: { ft: [] } },
    { round: 'Round of 32', num: 82, date: '2026-07-02', time: '19:00 UTC-4', team1: '1G', team2: '3A/E/H/I/J', score: { ft: [] } },
    { round: 'Round of 32', num: 83, date: '2026-07-03', time: '15:00 UTC-4', team1: '2K', team2: '2L', score: { ft: [] } },
    { round: 'Round of 32', num: 84, date: '2026-07-03', time: '19:00 UTC-4', team1: '1H', team2: '2J', score: { ft: [] } },
    { round: 'Round of 32', num: 85, date: '2026-07-03', time: '21:00 UTC-4', team1: '1B', team2: '3E/F/G/I/J', score: { ft: [] } },
    { round: 'Round of 32', num: 86, date: '2026-07-04', time: '15:00 UTC-4', team1: '1J', team2: '2H', score: { ft: [] } },
    { round: 'Round of 32', num: 87, date: '2026-07-04', time: '19:00 UTC-4', team1: '1K', team2: '3D/E/I/J/L', score: { ft: [] } },
    { round: 'Round of 32', num: 88, date: '2026-07-04', time: '21:00 UTC-4', team1: '2D', team2: '2G', score: { ft: [] } },

    // Round of 16 (slots = winners of R32; real interleaved pairings)
    { round: 'Round of 16', num: 89, date: '2026-07-06', time: '15:00 UTC-4', team1: 'W74', team2: 'W77', score: { ft: [] } },
    { round: 'Round of 16', num: 90, date: '2026-07-06', time: '19:00 UTC-4', team1: 'W73', team2: 'W75', score: { ft: [] } },
    { round: 'Round of 16', num: 91, date: '2026-07-07', time: '15:00 UTC-4', team1: 'W76', team2: 'W78', score: { ft: [] } },
    { round: 'Round of 16', num: 92, date: '2026-07-07', time: '19:00 UTC-4', team1: 'W79', team2: 'W80', score: { ft: [] } },
    { round: 'Round of 16', num: 93, date: '2026-07-08', time: '15:00 UTC-4', team1: 'W83', team2: 'W84', score: { ft: [] } },
    { round: 'Round of 16', num: 94, date: '2026-07-08', time: '19:00 UTC-4', team1: 'W81', team2: 'W82', score: { ft: [] } },
    { round: 'Round of 16', num: 95, date: '2026-07-09', time: '15:00 UTC-4', team1: 'W86', team2: 'W88', score: { ft: [] } },
    { round: 'Round of 16', num: 96, date: '2026-07-09', time: '19:00 UTC-4', team1: 'W85', team2: 'W87', score: { ft: [] } },

    // Quarter-finals
    { round: 'Quarter-finals', num: 97, date: '2026-07-11', time: '15:00 UTC-4', team1: 'W89', team2: 'W90', score: { ft: [] } },
    { round: 'Quarter-finals', num: 98, date: '2026-07-11', time: '19:00 UTC-4', team1: 'W93', team2: 'W94', score: { ft: [] } },
    { round: 'Quarter-finals', num: 99, date: '2026-07-12', time: '15:00 UTC-4', team1: 'W91', team2: 'W92', score: { ft: [] } },
    { round: 'Quarter-finals', num: 100, date: '2026-07-12', time: '19:00 UTC-4', team1: 'W95', team2: 'W96', score: { ft: [] } },

    // Semi-finals
    { round: 'Semi-finals', num: 101, date: '2026-07-15', time: '19:00 UTC-4', team1: 'W97', team2: 'W98', score: { ft: [] } },
    { round: 'Semi-finals', num: 102, date: '2026-07-16', time: '19:00 UTC-4', team1: 'W99', team2: 'W100', score: { ft: [] } },

    // Final
    { round: 'Final', num: 104, date: '2026-07-19', time: '15:00 UTC-4', team1: 'W101', team2: 'W102', score: { ft: [] } },
  ],
}
