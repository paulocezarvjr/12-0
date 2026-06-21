/* ============================================================================
 * 12-0 — reconcile.js
 *
 * Overlays REAL HLTV per-event ratings onto data/majors/*.json AND audits team
 * assignments. Matches each roster player to the HLTV row by NICK + TEAM, so
 * same-nick different-player collisions (AdreN/adreN, niko/NiKo) resolve to the
 * right person instead of clobbering each other's rating.
 *
 * Input: data/ratings/<id>.txt  (nick \t team \t rating, from the scraper)
 *   node scripts/reconcile.js            # report only
 *   node scripts/reconcile.js --apply    # write ratings (est:false, src:hltv)
 *
 * Philosophy: HLTV is the source for RATINGS. For TEAMS we keep our era-accurate
 * names and only surface genuine discrepancies — we do not blindly trust HLTV
 * (it shows current org names and has the odd quirk).
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAJ = path.join(ROOT, 'data', 'majors');
const RAT = path.join(ROOT, 'data', 'ratings');
const APPLY = process.argv.includes('--apply');

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
// alias for COMPARISON only (does not rename real renames apart: mousesports vs mouz
// are aliased here just so a 2019 "MOUZ" label from HLTV matches our "mousesports").
const TEAM_ALIAS = {
  natusvincere: 'navi', ninjasinpyjamas: 'nip', teamvitality: 'vitality',
  teamliquid: 'liquid', skgaming: 'sk', g2esports: 'g2', themongolz: 'mongolz',
  fazeclan: 'faze', teamfalcons: 'falcons', teamspirit: 'spirit', virtuspro: 'virtuspro',
  teamenvyus: 'envy', envyus: 'envy', opticgaming: 'optic', mousesports: 'mouz',
  teamdignitas: 'dignitas', teamldlccom: 'ldlc', teamldlc: 'ldlc', ldlccom: 'ldlc',
  counterlogicgaming: 'clg', teamsolomid: 'tsm', gambitesports: 'gambit',
  gambitgaming: 'gambit', gambityoungsters: 'gambit', flipsid3tactics: 'flipsid3',
  copenhagenwolves: 'cphwolves', cphwolves: 'cphwolves', universalsoldiers: 'unisol',
  quantumbellatorfire: 'qbfire', teamwolf: 'wolves', wolf: 'wolves',
};
const cteam = (t) => {
  let k = norm(t);
  if (TEAM_ALIAS[k]) return TEAM_ALIAS[k];
  k = k.replace(/^team/, '').replace(/(gaming|esports|sports|club|com|dynamics|team)$/, '');
  return TEAM_ALIAS[k] || k;
};

function parseRatings(txt) {
  const m = new Map(); // normNick -> [{team, r}]
  for (const line of txt.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const nick = parts[0].trim();
    const team = (parts[1] || '').trim();
    const rate = parseFloat((line.match(/\d\.\d{2}/g) || []).pop());
    if (nick && isFinite(rate)) {
      const k = norm(nick);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({ team, r: Math.round(rate * 100) / 100 });
    }
  }
  return m;
}

let totMatched = 0, totMismatch = 0, totAmbig = 0;
const ids = fs.readdirSync(RAT).filter((f) => f.endsWith('.txt')).map((f) => f.replace('.txt', '')).sort();

for (const id of ids) {
  const mj = path.join(MAJ, id + '.json');
  if (!fs.existsSync(mj)) { console.log(id + ': no data/majors file'); continue; }
  const hltv = parseRatings(fs.readFileSync(path.join(RAT, id + '.txt'), 'utf8'));
  const data = JSON.parse(fs.readFileSync(mj, 'utf8'));

  const matchedNicks = new Set();
  let matched = 0;
  const mismatches = [], ambiguous = [];
  for (const t of data.teams || []) {
    for (const p of t.players || []) {
      const arr = hltv.get(norm(p.n));
      if (!arr || !arr.length) continue;
      const exact = arr.find((e) => cteam(e.team) === cteam(t.team));
      if (exact) {
        matched++; matchedNicks.add(norm(p.n));
        if (APPLY) { p.r = exact.r; p.est = false; p.src = 'hltv'; }
      } else if (arr.length === 1) {
        matched++; matchedNicks.add(norm(p.n));
        if (APPLY) { p.r = arr[0].r; p.est = false; p.src = 'hltv'; }
        mismatches.push(p.n + ': ours=' + t.team + ' / hltv=' + arr[0].team);
      } else {
        // same nick, several HLTV people, none on our team -> ambiguous; skip rating
        ambiguous.push(p.n + ': ours=' + t.team + ' / hltv=[' + arr.map((e) => e.team).join(', ') + ']');
      }
    }
  }
  const missing = [...hltv.keys()].filter((k) => !matchedNicks.has(k)).length;
  if (APPLY) fs.writeFileSync(mj, JSON.stringify(data, null, 2) + '\n');

  totMatched += matched; totMismatch += mismatches.length; totAmbig += ambiguous.length;
  console.log(
    id.padEnd(9) + ' matched ' + String(matched).padStart(3) +
    '  team-diff ' + String(mismatches.length).padStart(2) +
    '  ambiguous ' + String(ambiguous.length).padStart(2) +
    '  hltv-only ' + String(missing).padStart(3)
  );
  mismatches.forEach((m) => console.log('      ~ ' + m));
  ambiguous.forEach((m) => console.log('      ? ' + m));
}
console.log('\nTOTAL  matched=' + totMatched + '  team-diff=' + totMismatch + '  ambiguous=' + totAmbig);
console.log(APPLY ? '*** RATINGS WRITTEN ***' : '(report only — re-run with --apply to write)');
