/* Probe v2: HEADFUL Chrome (run under xvfb-run) + poll until the Cloudflare
 * challenge clears. Usage: xvfb-run -a node probe2.js [url] */
const { addExtra } = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');
const puppeteer = addExtra(require('puppeteer-core'));
puppeteer.use(Stealth());

const url = process.argv[2] || 'https://www.hltv.org/stats/players?event=1270';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/usr/bin/google-chrome-stable',
    userDataDir: '/tmp/hltv-chrome-profile',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1400,1000', '--lang=en-US', '--start-maximized',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    catch (e) { console.log('goto error:', e.message); }

    let title = '', cleared = false;
    for (let i = 0; i < 18; i++) { // up to ~36s
      await sleep(2000);
      title = await page.title().catch(() => '');
      if (title && !/just a moment|attention required|verify|moment/i.test(title)) { cleared = true; break; }
    }
    const info = await page.evaluate(() => ({
      tables: document.querySelectorAll('table').length,
      cells: document.querySelectorAll('table td').length,
      body: document.body ? document.body.innerText.replace(/\s+/g, ' ').slice(0, 300) : '',
    })).catch(() => ({ tables: 0, cells: 0, body: '' }));
    console.log('cleared CF? :', cleared ? 'YES' : 'NO');
    console.log('page title  :', JSON.stringify(title));
    console.log('tables/cells:', info.tables, '/', info.cells);
    console.log('body snippet:', JSON.stringify(info.body));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
