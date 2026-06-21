/* ============================================================================
 * 12-0 — HLTV per-event rating scraper
 *
 * Drives a real (Turnstile-solving) Chrome to read an HLTV event "Players"
 * stats page and write data/ratings/<majorId>.txt — exactly what
 * scripts/import-hltv-ratings.js consumes.
 *
 *   xvfb-run -a node tools/hltv/fetch-ratings.js <eventIdOrUrl> [majorId]
 *
 * e.g.  xvfb-run -a node tools/hltv/fetch-ratings.js 1270 dhw2013
 *       xvfb-run -a node tools/hltv/fetch-ratings.js https://www.hltv.org/stats/players?event=1270
 *
 * If majorId is omitted it's auto-detected from the event name on the page.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const { connect } = require('puppeteer-real-browser');

const RATINGS_DIR = path.join(__dirname, '..', '..', 'data', 'ratings');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// event-name (lowercased) -> our major id
const NAME_MAP = [
  [/dreamhack winter 2013/, 'dhw2013'], [/katowice 2014/, 'kat2014'], [/cologne 2014/, 'col2014'],
  [/dreamhack winter 2014/, 'dhw2014'], [/katowice 2015/, 'kat2015'], [/cologne 2015/, 'col2015'],
  [/cluj/, 'clj2015'], [/columbus/, 'clm2016'], [/cologne 2016/, 'col2016'], [/atlanta/, 'atl2017'],
  [/krak|cracow|kraków/, 'kra2017'], [/boston/, 'bos2018'], [/london/, 'lon2018'],
  [/katowice 2019/, 'kat2019'], [/berlin/, 'ber2019'], [/stockholm/, 'sto2021'], [/antwerp/, 'ant2022'],
  [/\brio\b/, 'rio2022'], [/paris/, 'par2023'], [/copenhagen/, 'cph2024'], [/shanghai/, 'sha2024'],
  [/austin/, 'aus2025'], [/budapest/, 'bud2025'], [/cologne 2026/, 'y2026'],
];

(async () => {
  const a1 = process.argv[2];
  if (!a1) { console.error('usage: fetch-ratings.js <eventIdOrUrl> [majorId]'); process.exit(1); }
  const url = /^\d+$/.test(a1) ? `https://www.hltv.org/stats/players?event=${a1}` : a1;
  let majorId = process.argv[3] || null;

  const { browser, page } = await connect({
    headless: false, turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,1000'],
    customConfig: { chromePath: '/usr/bin/google-chrome-stable' },
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto:', e.message));
    // wait for Cloudflare to clear and the stats table to render
    let title = '';
    for (let i = 0; i < 24; i++) {
      await sleep(2000);
      title = await page.title().catch(() => '');
      if (/HLTV/.test(title) && !/just a moment|a moment|verify/i.test(title)) break;
    }
    await page.waitForSelector('table.stats-table tbody tr', { timeout: 25000 });

    const { rows, evName } = await page.evaluate(() => {
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

    if (!majorId) {
      const lc = evName.toLowerCase();
      const hit = NAME_MAP.find(([re]) => re.test(lc));
      majorId = hit ? hit[1] : null;
    }
    if (!majorId) { console.error('Could not auto-detect majorId. Event text:', evName, '\nPass it explicitly as arg 2.'); process.exit(2); }
    if (!rows.length) { console.error('No rating rows found — page layout may have changed.'); process.exit(3); }

    fs.mkdirSync(RATINGS_DIR, { recursive: true });
    const out = path.join(RATINGS_DIR, majorId + '.txt');
    // 3 columns: nick <TAB> team <TAB> rating. The rating importer reads the
    // first token (nick) + last x.xx (rating); the team column lets a roster
    // reconciler pin each player to the correct team straight from HLTV.
    fs.writeFileSync(out, rows.map((r) => r.n + '\t' + r.team + '\t' + r.r).join('\n') + '\n');
    console.log('major: ' + majorId + ' (' + url + ')');
    console.log('wrote ' + rows.length + ' rows (nick / team / rating) -> ' + out);
    console.log('sample:\n' + rows.slice(0, 6).map((r) => '  ' + r.n + '  |  ' + r.team + '  |  ' + r.r).join('\n'));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
