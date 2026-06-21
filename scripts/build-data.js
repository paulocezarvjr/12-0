/* ============================================================================
 * 12-0 — build-data.js
 *
 * Assembles src/squads.js from the per-Major JSON files in data/majors/.
 * Pure Node, no deps:  node scripts/build-data.js
 *
 * Pipeline:
 *   1. read every data/majors/*.json (skip unreadable/!JSON, with a warning)
 *   2. normalize team names (alias map) — exact-name identity, renames kept apart
 *   3. dedup to unique (team, year): if a team played >1 Major that year, keep
 *      the roster from its DEEPEST run (best placement; tie -> later Major)
 *   4. clean players (roles whitelist, awp flag, rating clamp)
 *   5. emit SQUADS (>=5 players each) + OPP_POOL (all team names) to src/squads.js
 * ==========================================================================*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Inputs/outputs are overridable via env so the assembler can be tested against
// a throwaway fixture dir without touching the live data/ or src/ files.
const MAJ_DIR = process.env.MAJ_DIR ? path.resolve(process.env.MAJ_DIR) : path.join(ROOT, 'data', 'majors');
const OUT = process.env.SQUADS_OUT ? path.resolve(process.env.SQUADS_OUT) : path.join(ROOT, 'src', 'squads.js');

const ROLE_TAGS = ['awp', 'igl', 'entry', 'support', 'lurker', 'rifle', 'star'];

// Chronological Major order (matches the fetch workflow). Index used as the
// tie-breaker when a team made an equally-deep run at two Majors in one year:
// the later Major wins. Also maps each Major to a short city label for `ev`.
const MAJORS = [
  ['dhw2013', 'DH Winter'], ['kat2014', 'Katowice'], ['col2014', 'Cologne'], ['dhw2014', 'DH Winter'],
  ['kat2015', 'Katowice'], ['col2015', 'Cologne'], ['clj2015', 'Cluj-Napoca'], ['clm2016', 'Columbus'],
  ['col2016', 'Cologne'], ['atl2017', 'Atlanta'], ['kra2017', 'Kraków'], ['bos2018', 'Boston'],
  ['lon2018', 'London'], ['kat2019', 'Katowice'], ['ber2019', 'Berlin'], ['sto2021', 'Stockholm'],
  ['ant2022', 'Antwerp'], ['rio2022', 'Rio'], ['par2023', 'Paris'], ['cph2024', 'Copenhagen'],
  ['sha2024', 'Shanghai'], ['aus2025', 'Austin'], ['bud2025', 'Budapest'], ['y2026', 'Cologne'],
];
const ORDER = new Map(MAJORS.map(([id], i) => [id, i]));
const CITY = new Map(MAJORS);

// Conservative alias map: only collapse obvious expansions to the canonical
// short name. Renames (mousesports->MOUZ, SK->MIBR->Luminosity) are NOT merged.
const ALIAS = {
  'Natus Vincere': 'NAVI', "Na'Vi": 'NAVI', 'Na`Vi': 'NAVI', 'NaVi': 'NAVI',
  'Ninjas in Pyjamas': 'NiP',
  'Team Vitality': 'Vitality',
  'G2 Esports': 'G2',
  'FaZe Clan': 'FaZe',
  'Team Liquid': 'Team Liquid', 'Liquid': 'Team Liquid',
  'Virtus.Pro': 'Virtus.pro', 'Virtus Pro': 'Virtus.pro',
  'Made in Brazil': 'MIBR',
  'Luminosity Gaming': 'Luminosity',
  'FURIA Esports': 'FURIA',
  'paiN Gaming': 'paiN',
  'The MongolZ': 'MongolZ',
  'Complexity Gaming': 'Complexity',
  'Gambit Esports': 'Gambit', 'Gambit Gaming': 'Gambit', 'Gambit Youngsters': 'Gambit',
  'Evil Geniuses': 'Evil Geniuses',
  'Team SoloMid': 'TSM', 'mousesports': 'mousesports',
};
const canonTeam = (t) => {
  const k = String(t || '').trim().replace(/\s+/g, ' ');
  return ALIAS[k] || k;
};

const warn = (m) => console.warn('  ! ' + m);

// ---- placement -> score (lower is better) ---------------------------------
function placementScore(p) {
  const s = String(p || '').toLowerCase();
  const m = s.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  if (/(champion|winner|1st|gold)/.test(s)) return 0;
  if (/grand final|final/.test(s)) return 2;
  if (/playoff|champions stage/.test(s)) return 6;
  if (/legend/.test(s)) return 8;
  if (/challenger|opening|play-?in/.test(s)) return 12;
  if (/group/.test(s)) return 14;
  return 20;
}

// ---- player cleaning ------------------------------------------------------
function cleanPlayer(p) {
  if (!p || !p.n) return null;
  let roles = Array.isArray(p.roles) ? p.roles.filter((r) => ROLE_TAGS.includes(r)) : [];
  roles = [...new Set(roles)];
  if (!roles.length) roles = ['rifle'];
  let awp = !!p.awp || roles.includes('awp');
  if (awp && !roles.includes('awp')) roles.unshift('awp');
  let r = Number(p.r);
  if (!isFinite(r)) r = 1.0;
  r = Math.max(0.5, Math.min(1.6, r));
  r = Math.round(r * 100) / 100;
  const c = String(p.c || '').toUpperCase().slice(0, 3) || 'XXX';
  return { n: String(p.n), c, r, awp, roles };
}

// ---- slug / id ------------------------------------------------------------
const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'team';

// ---- main -----------------------------------------------------------------
function main() {
  if (!fs.existsSync(MAJ_DIR)) {
    console.error('No data/majors directory — run the fetch workflow first.');
    process.exit(1);
  }
  const fileNames = fs.readdirSync(MAJ_DIR).filter((f) => f.endsWith('.json'));
  console.log('Reading ' + fileNames.length + ' major files from ' + MAJ_DIR);

  // group candidate rosters by canonical (team, year)
  const groups = new Map(); // key "team__year" -> [{team, year, players, score, order, ev}]
  const allTeams = new Set();
  let appearances = 0;

  for (const fn of fileNames) {
    const id = fn.replace(/\.json$/, '');
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(MAJ_DIR, fn), 'utf8'));
    } catch (e) {
      warn('skip ' + fn + ' (bad JSON: ' + e.message + ')');
      continue;
    }
    const year = Number(data.year) || Number((id.match(/(\d{4})$/) || [])[1]);
    const order = ORDER.has(id) ? ORDER.get(id) : 999;
    const ev = CITY.get(id) || data.event || 'Major';
    const teams = Array.isArray(data.teams) ? data.teams : [];
    for (const t of teams) {
      const team = canonTeam(t.team);
      if (!team) continue;
      const players = (Array.isArray(t.players) ? t.players : []).map(cleanPlayer).filter(Boolean);
      const hasReal = (Array.isArray(t.players) ? t.players : []).some((p) => p.est === false);
      allTeams.add(team);
      appearances++;
      const key = team + '__' + year;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ team, year, players, score: placementScore(t.placement), order, ev, hasReal });
    }
  }

  // pick the representative roster per (team, year)
  const squads = [];
  const usedIds = new Set();
  let dropped = 0, droppedEst = 0;
  for (const [, cands] of groups) {
    // prefer an appearance with real HLTV ratings, then best placement, then later major
    cands.sort((a, b) => b.hasReal - a.hasReal || a.score - b.score || b.order - a.order);
    const rep = cands[0];
    // drop any squad with no real HLTV ratings anywhere — non-playoff challenger
    // filler, plus the in-progress 2026 Major (re-included once its ratings land).
    if (!rep.hasReal) { droppedEst++; continue; }
    const players = rep.players.slice(0, 5);
    if (players.length < 5) {
      dropped++;
      warn('drop ' + rep.team + ' ' + rep.year + ' (only ' + players.length + ' players)');
      continue;
    }
    let id = slug(rep.team) + String(rep.year).slice(2);
    let n = 2;
    while (usedIds.has(id)) id = slug(rep.team) + String(rep.year).slice(2) + '_' + n++;
    usedIds.add(id);
    squads.push({ id, team: rep.team, ev: rep.ev, yr: rep.year, ps: players });
  }

  squads.sort((a, b) => a.yr - b.yr || a.team.localeCompare(b.team));
  const oppPool = [...allTeams].sort((a, b) => a.localeCompare(b));

  // ---- emit src/squads.js ----
  const pl = (p) =>
    `    { n: ${JSON.stringify(p.n)}, c: ${JSON.stringify(p.c)}, r: ${p.r.toFixed(2)}, awp: ${p.awp}, roles: [${p.roles.map((r) => `'${r}'`).join(',')}] }`;
  const sq = (s) =>
    `  { id: ${JSON.stringify(s.id)}, team: ${JSON.stringify(s.team)}, ev: ${JSON.stringify(s.ev)}, yr: ${s.yr}, ps: [\n${s.ps.map(pl).join(',\n')} ] }`;

  const header = `/* ============================================================================
 * 12-0 — Squad catalog (GENERATED — do not edit by hand)
 * Built by scripts/build-data.js from data/majors/*.json.
 * ${squads.length} squads (unique team|year) · OPP_POOL ${oppPool.length} teams.
 * Player object: { n, c, r, awp, roles }  (schema in src/data.js header)
 * ==========================================================================*/

`;
  const body =
    'const SQUADS = [\n' + squads.map(sq).join(',\n') + '\n];\n\n' +
    'const OPP_POOL = [' + oppPool.map((t) => JSON.stringify(t)).join(', ') + '];\n';

  fs.writeFileSync(OUT, header + body);
  console.log(
    '\nDone: ' + squads.length + ' squads (from ' + appearances + ' appearances, ' +
    groups.size + ' team-years, ' + droppedEst + ' dropped non-playoff/estimated, ' +
    dropped + ' dropped <5p), OPP_POOL=' + oppPool.length + '\n-> ' + OUT
  );
}

if (require.main === module) main();
