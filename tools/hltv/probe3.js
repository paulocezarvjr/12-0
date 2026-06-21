/* Probe v3: puppeteer-real-browser (auto-solves Cloudflare Turnstile).
 * Run under xvfb-run. Usage: xvfb-run -a node probe3.js [url] */
const { connect } = require('puppeteer-real-browser');
const url = process.argv[2] || 'https://www.hltv.org/stats/players?event=1270';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { browser, page } = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,1000'],
    customConfig: { chromePath: '/usr/bin/google-chrome-stable' },
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto:', e.message));
    let title = '', ok = false;
    for (let i = 0; i < 20; i++) {
      await sleep(2500);
      title = await page.title().catch(() => '');
      if (title && !/just a moment|a moment|verify|attention required/i.test(title)) { ok = true; break; }
    }
    const info = await page.evaluate(() => ({
      tables: document.querySelectorAll('table').length,
      cells: document.querySelectorAll('table td').length,
      body: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 300),
    })).catch(() => ({ tables: 0, cells: 0, body: '' }));
    console.log('cleared CF? :', ok ? 'YES' : 'NO');
    console.log('page title  :', JSON.stringify(title));
    console.log('tables/cells:', info.tables, '/', info.cells);
    console.log('body snippet:', JSON.stringify(info.body));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
