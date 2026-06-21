/* ============================================================================
 * 12-0 — Scrape many HLTV events in ONE browser session.
 *
 * Opens a single (Turnstile-solving) Chrome, clears Cloudflare once, then reuses
 * the cf_clearance cookie to walk every event's Players stats page. Writes
 * data/ratings/<auto-detected-majorId>.txt (nick / team / rating) per event.
 *
 *   xvfb-run -a node tools/hltv/scrape-all.js [id1 id2 ...]   (defaults below)
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const { connect } = require('puppeteer-real-browser');

const RATINGS_DIR = path.join(__dirname, '..', '..', 'data', 'ratings');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_IDS = [1270, 1333, 1444, 1553, 1611, 1666, 1617, 2027, 2062, 2471, 2720, 3247, 3564, 3883, 4443, 4866, 6372, 6586, 6793, 7148, 7524, 7902, 8042];
const IDS = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : DEFAULT_IDS;

const NAME_MAP = [
  [/dreamhack winter 2013/, 'dhw2013'], [/katowice 2014/, 'kat2014'], [/cologne 2014/, 'col2014'],
  [/dreamhack winter 2014/, 'dhw2014'], [/katowice 2015/, 'kat2015'], [/cologne 2015/, 'col2015'],
  [/cluj/, 'clj2015'], [/columbus/, 'clm2016'], [/cologne 2016/, 'col2016'], [/atlanta/, 'atl2017'],
  [/krak|cracow|kraków/, 'kra2017'], [/boston/, 'bos2018'], [/london/, 'lon2018'],
  [/katowice 2019/, 'kat2019'], [/berlin/, 'ber2019'], [/stockholm/, 'sto2021'], [/antwerp/, 'ant2022'],
  [/\brio\b/, 'rio2022'], [/paris/, 'par2023'], [/copenhagen/, 'cph2024'], [/shanghai/, 'sha2024'],
  [/austin/, 'aus2025'], [/budapest/, 'bud2025'], [/cologne 2026/, 'y2026'],
];

async function scrapeOne(page, id) {
  const url = `https://www.hltv.org/stats/players?event=${id}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 24; i++) {
    await sleep(1500);
    const t = await page.title().catch(() => '');
    if (/HLTV/.test(t) && !/just a moment|a moment|verify/i.test(t)) break;
  }
  await page.waitForSelector('table.stats-table tbody tr', { timeout: 25000 });
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('table.stats-table tbody tr').forEach((tr) => {
      const nameEl = tr.querySelector('.playerCol a') || tr.querySelector('.playerCol') || tr.querySelector('td a');
      const teamEl = tr.querySelector('.teamCol a') || tr.querySelector('.teamCol');
      const rateEl = tr.querySelector('.ratingCol') || tr.querySelector('td:last-child');
      const n = nameEl ? nameEl.textContent.trim() : '';
      const team = teamEl ? teamEl.textContent.trim() : '';
      const r = rateEl ? rateEl.textContent.trim() : '';
      if (n && /\d\.\d{2}/.test(r)) rows.push({ n, team, r: (r.match(/\d\.\d{2}/) || [])[0] });
    });
    return { rows, evName: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300) };
  });
}

(async () => {
  fs.mkdirSync(RATINGS_DIR, { recursive: true });
  const { browser, page } = await connect({
    headless: false, turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,1000'],
    customConfig: { chromePath: '/usr/bin/google-chrome-stable' },
  });
  let ok = 0;
  try {
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i];
      try {
        const { rows, evName } = await scrapeOne(page, id);
        const hit = NAME_MAP.find(([re]) => re.test(evName.toLowerCase()));
        const majorId = hit ? hit[1] : 'event-' + id;
        if (rows.length) {
          fs.writeFileSync(path.join(RATINGS_DIR, majorId + '.txt'), rows.map((r) => r.n + '\t' + r.team + '\t' + r.r).join('\n') + '\n');
          ok++;
        }
        console.log(`[${i + 1}/${IDS.length}] event ${id} -> ${majorId}: ${rows.length} rows`);
      } catch (e) {
        console.log(`[${i + 1}/${IDS.length}] event ${id} FAILED: ${e.message}`);
      }
      await sleep(800);
    }
  } finally {
    await browser.close();
  }
  console.log(`SCRAPE COMPLETE: ${ok}/${IDS.length} events written to ${RATINGS_DIR}`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
