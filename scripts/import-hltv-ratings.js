/* ============================================================================
 * 12-0 — import-hltv-ratings.js
 *
 * Overlays REAL per-event HLTV ratings (the "rating da época") onto the
 * collected rosters. HLTV blocks automated fetching (403), so ratings are
 * pasted by hand: drop the HLTV event "Players" stats table into
 * data/ratings/<majorId>.txt (one file per Major), then run this.
 *
 *   node scripts/import-hltv-ratings.js
 *   node scripts/build-data.js          # rebuild src/squads.js afterwards
 *
 * It patches data/majors/<majorId>.json in place: for every player whose
 * nickname matches a pasted row, it sets r, est:false, src:"hltv".
 *
 * Paste format is tolerant — each line just needs the nickname as the first
 * token and the HLTV rating as the last x.xx number, e.g. raw rows like:
 *     1. s1mple Natus Vincere 13 +120 1.35 1.30
 * or simply:
 *     s1mple 1.30
 * Lines without an x.xx rating (headers, blanks) are ignored.
 * ==========================================================================*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAJ_DIR = process.env.MAJ_DIR ? path.resolve(process.env.MAJ_DIR) : path.join(ROOT, 'data', 'majors');
const RATINGS_DIR = process.env.RATINGS_DIR ? path.resolve(process.env.RATINGS_DIR) : path.join(ROOT, 'data', 'ratings');

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Parse a pasted HLTV players table -> Map(normalizedNick -> rating). */
function parseRatings(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const nums = line.match(/\b[0-2]\.\d{2}\b/g); // ratings/K-D look like x.xx
    if (!nums) continue;
    const rating = parseFloat(nums[nums.length - 1]); // HLTV Rating is the last column
    // nickname = first token after an optional leading rank ("12." / "12)")
    const nick = line.replace(/^\s*\d+[.)]?\s*/, '').split(/[\s\t,|]+/)[0];
    if (!nick) continue;
    const key = norm(nick);
    if (key) out.set(key, rating);
  }
  return out;
}

function main() {
  if (!fs.existsSync(RATINGS_DIR)) {
    console.error('No data/ratings directory. Create it and add <majorId>.txt files (paste HLTV event player tables).');
    process.exit(1);
  }
  const files = fs.readdirSync(RATINGS_DIR).filter((f) => f.endsWith('.txt'));
  if (!files.length) {
    console.error('No *.txt rating files in ' + RATINGS_DIR);
    process.exit(1);
  }

  let totalPatched = 0;
  for (const f of files) {
    const id = f.replace(/\.txt$/, '');
    const majPath = path.join(MAJ_DIR, id + '.json');
    if (!fs.existsSync(majPath)) {
      console.warn('! ' + f + ': no matching data/majors/' + id + '.json — skipping');
      continue;
    }
    const ratings = parseRatings(fs.readFileSync(path.join(RATINGS_DIR, f), 'utf8'));
    const data = JSON.parse(fs.readFileSync(majPath, 'utf8'));

    let patched = 0;
    const playerNicks = new Set();
    for (const t of data.teams || []) {
      for (const p of t.players || []) {
        playerNicks.add(norm(p.n));
        const r = ratings.get(norm(p.n));
        if (typeof r === 'number') {
          p.r = Math.round(r * 100) / 100;
          p.est = false;
          p.src = 'hltv';
          patched++;
        }
      }
    }
    const unmatchedPaste = [...ratings.keys()].filter((k) => !playerNicks.has(k));
    fs.writeFileSync(majPath, JSON.stringify(data, null, 2) + '\n');
    totalPatched += patched;
    console.log(
      id + ': patched ' + patched + ' ratings from ' + ratings.size + ' pasted rows' +
      (unmatchedPaste.length ? '  (unmatched paste: ' + unmatchedPaste.join(', ') + ')' : '')
    );
  }
  console.log('\nDone: ' + totalPatched + ' ratings overlaid. Now run: node scripts/build-data.js');
}

if (require.main === module) main();
