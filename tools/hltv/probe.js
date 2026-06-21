/* Probe: can a real (stealth) headless Chrome get past HLTV's Cloudflare?
 * Usage: node probe.js [url] */
const { addExtra } = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');
const puppeteer = addExtra(require('puppeteer-core'));
puppeteer.use(Stealth());

const url = process.argv[2] || 'https://www.hltv.org/stats/players?event=1270';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/bin/google-chrome-stable',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1400,1000', '--lang=en-US',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    let status = 0;
    page.on('response', (r) => { if (r.url() === url) status = r.status(); });
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (resp) status = resp.status();
    } catch (e) { console.log('goto error:', e.message); }
    await new Promise((r) => setTimeout(r, 7000)); // let any CF challenge resolve
    const title = await page.title();
    const info = await page.evaluate(() => ({
      bodyText: document.body ? document.body.innerText.replace(/\s+/g, ' ').slice(0, 350) : '',
      tables: document.querySelectorAll('table').length,
      ratingCells: document.querySelectorAll('.stats-table td, table td').length,
    }));
    const blocked = /just a moment|attention required|cloudflare|verify you are human/i.test(title + ' ' + info.bodyText);
    console.log('HTTP status :', status);
    console.log('page title  :', JSON.stringify(title));
    console.log('tables found:', info.tables, '| td cells:', info.ratingCells);
    console.log('CF blocked? :', blocked ? 'YES (challenge page)' : 'NO — looks like real content');
    console.log('body snippet:', JSON.stringify(info.bodyText));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
