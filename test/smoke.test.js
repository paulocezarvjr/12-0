/* ============================================================================
 * 12-0 — Headless smoke test (no deps, plain Node).
 *
 * Loads the browser scripts into a vm sandbox with a tiny DOM stub, then drives
 * the REAL delegated click handler through full playthroughs (home -> setup ->
 * draft 5 -> simulate -> result) for every setup, plus engine invariants.
 *
 *   node test/smoke.test.js
 * ==========================================================================*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src');
const files = ['data.js', 'squads.js', 'engine.js', 'view.js', 'app.js'];

// ---- DOM / env stubs ------------------------------------------------------
let clickHandler = null;
const root = {
  innerHTML: '',
  contains: () => true,
  addEventListener: (type, fn) => { if (type === 'click') clickHandler = fn; },
};
let domReady = null;
const sandbox = {
  console,
  setTimeout, clearTimeout,
  navigator: { clipboard: { writeText: () => {} } },
  document: {
    getElementById: () => root,
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') domReady = fn; },
  },
};
// Concatenate into one program so cross-file top-level `const`s resolve (in vm,
// lexical bindings don't persist across separate runInContext calls), then
// expose the pieces the test reads via globalThis (== the sandbox).
vm.createContext(sandbox);
const bundle =
  files.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n') +
  '\n;globalThis.Engine=Engine;globalThis.View=View;globalThis.App=App;globalThis.SETUPS=SETUPS;globalThis.SQUADS=SQUADS;globalThis.OPP_POOL=OPP_POOL;';
vm.runInContext(bundle, sandbox, { filename: 'bundle.js' });

// ---- click simulation -----------------------------------------------------
function fakeTarget(action, val) {
  const el = {
    getAttribute: (n) => (n === 'data-action' ? action : val),
    closest: () => el,
  };
  return el;
}
function click(action, val) {
  assert.ok(clickHandler, 'click handler must be registered');
  clickHandler({ target: fakeTarget(action, val), preventDefault() {} });
}
function parseActions(html) {
  const re = /data-action="([a-zA-Z]+)"(?:\s+data-(?:idx|id)="([^"]*)")?/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ action: m[1], val: m[2] });
  return out;
}
const has = (acts, a) => acts.some((x) => x.action === a);
const first = (acts, a) => acts.find((x) => x.action === a);

// ---- a full playthrough for one setup ------------------------------------
function playthrough(setupId) {
  domReady(); // App.mount -> renders home
  assert.ok(/Start Draft/.test(root.innerHTML), 'home should render');

  click('start');
  assert.ok(/Choose your/.test(root.innerHTML), 'setup screen should render');

  click('selectSetup', setupId);
  click('confirm');
  assert.ok(/ROSTER BOARD/.test(root.innerHTML), 'draft screen should render');

  let guard = 0;
  for (;;) {
    if (++guard > 300) throw new Error('draft never completed for ' + setupId);
    const acts = parseActions(root.innerHTML);
    if (has(acts, 'run')) { click('run'); break; }
    if (has(acts, 'placeSlot')) { const a = first(acts, 'placeSlot'); click('placeSlot', a.val); continue; }
    if (has(acts, 'pick')) { const a = first(acts, 'pick'); click('pick', a.val); continue; }
    throw new Error('draft stuck with no actionable control for ' + setupId);
  }

  assert.ok(/THE MAJOR RUN/.test(root.innerHTML), 'sim screen should render');
  click('skip'); // jump to the end of the reveal
  assert.ok(/See result/.test(root.innerHTML), 'sim should finish after skip');

  click('result');
  assert.ok(/YOUR ROSTER/.test(root.innerHTML), 'result screen should render');
  assert.ok(/FLAWLESS|MAJOR CHAMPION|RUN ENDED/.test(root.innerHTML), 'result must show an outcome');
  // every role slot filled on the result screen (no em-dash placeholder name)
  assert.ok(!/>—<\/div>/.test(root.innerHTML), 'every slot should be filled');

  click('share');
  assert.ok(/Copied to clipboard/.test(root.innerHTML), 'share should confirm copy');

  click('playAgain');
  assert.ok(/Start Draft/.test(root.innerHTML), 'play again returns home');
}

// ---- run ------------------------------------------------------------------
let passed = 0;
const Engine = sandbox.Engine;
const SETUPS = sandbox.SETUPS;
const SQUADS = sandbox.SQUADS;
const OPP_POOL = sandbox.OPP_POOL;

// 1) full UI playthroughs, each setup several times (random draws each time)
for (const s of SETUPS) {
  for (let i = 0; i < 40; i++) { playthrough(s.id); passed++; }
}

// 2) engine invariants over many simulated runs (Swiss + playoffs format)
const mockRoster = SETUPS[0].roles.map((role) => ({ role, player: { n: 'x', c: 'XX', r: 1.2, awp: true, roles: ['awp', 'igl', 'entry', 'support', 'lurker', 'rifle', 'star'], team: 'T', yr: 2020 } }));
let champions = 0, championWithLoss = 0, perfects = 0, eliminations = 0;
for (let i = 0; i < 4000; i++) {
  const res = Engine.computeResults(mockRoster);
  assert.ok(res.length >= 3 && res.length <= 18, 'run length in [3,18], got ' + res.length);
  const wins = res.filter((m) => m.win).length;
  const losses = res.filter((m) => !m.win).length;
  const last = res[res.length - 1];
  const champion = last.ph === 'GRAND FINAL' && last.win;
  const sum = Engine.summary(res);

  assert.strictEqual(sum.wins, wins, 'summary win count');
  assert.strictEqual(sum.losses, losses, 'summary loss count');
  assert.strictEqual(sum.record, wins + '-' + losses, 'record matches wins-losses');
  assert.strictEqual(sum.champion, champion, 'champion flag derives from last match');
  assert.strictEqual(sum.perfect, champion && losses === 0, 'perfect = champion with zero losses');
  assert.ok(Engine.shareText({ results: res, roster: mockRoster, setup: SETUPS[0] }).includes('12-0 · CS2 Fantasy Major'), 'share header');

  if (champion) {
    assert.strictEqual(wins, 12, 'a champion always has exactly 12 wins');
    assert.ok(losses >= 0 && losses <= 6, 'a champion drops 0..6 maps, got ' + losses);
    champions++;
    if (losses > 0) championWithLoss++;
    if (losses === 0) { perfects++; assert.strictEqual(res.length, 12, 'a 12-0 run is exactly 12 matches'); }
  } else {
    assert.strictEqual(last.win, false, 'a non-title run always ends on a loss');
    eliminations++;
  }
  // an all-win run can only be a flawless title
  if (res.every((m) => m.win)) assert.ok(champion && losses === 0, 'an all-win run must be 12-0');
}
// a loss in the Swiss must NOT end the run: titles with a dropped map prove it
assert.ok(champions > 0, 'some runs should win the Major');
assert.ok(championWithLoss > 0, 'some titles include a dropped map (Swiss losses do not eliminate)');
assert.ok(eliminations > 0, 'some runs should be eliminated');
passed += 4000;
console.log('  champions=' + champions + ' (perfect=' + perfects + ', with-loss=' + championWithLoss + '), eliminations=' + eliminations);

// 2b) reroll axes — exact team-name identity
{
  const yearWithTwo = SQUADS.find((s) => SQUADS.some((o) => o.yr === s.yr && o.team !== s.team));
  assert.ok(yearWithTwo, 'fixture: a year with two teams exists');
  assert.ok(Engine.hasReroll(yearWithTwo, 'team'), 'reroll-team available when the year has another team');
  for (let i = 0; i < 200; i++) {
    const rt = Engine.pickReroll(mockRoster, yearWithTwo, [], 'team');
    assert.ok(rt && rt.yr === yearWithTwo.yr && rt.team !== yearWithTwo.team, 'reroll-team: same year, different team');
  }
  const soloYear = SQUADS.find((s) => !SQUADS.some((o) => o.team === s.team && o.yr !== s.yr));
  if (soloYear) {
    assert.ok(!Engine.hasReroll(soloYear, 'year'), 'reroll-year unavailable for a single-year team');
    assert.strictEqual(Engine.pickReroll(mockRoster, soloYear, [], 'year'), null, 'reroll-year returns null with no candidates');
  }
  const multiYearTeam = SQUADS.find((s) => SQUADS.some((o) => o.team === s.team && o.yr !== s.yr));
  if (multiYearTeam) {
    const ry = Engine.pickReroll(mockRoster, multiYearTeam, [], 'year');
    assert.ok(ry && ry.team === multiYearTeam.team && ry.yr !== multiYearTeam.yr, 'reroll-year: same team, different year');
  }
  assert.strictEqual(Engine.hasReroll(null, 'team'), false, 'no draw -> no reroll');
  passed += 201;
}

// 3) opponents are drawn from the pool, which must cover the longest run
const r = Engine.computeResults(mockRoster);
assert.ok(r.every((m) => OPP_POOL.includes(m.opp)), 'every opponent comes from the pool');
assert.ok(OPP_POOL.length >= 18, 'opponent pool covers the longest possible run (18)');
passed++;

console.log('OK — ' + passed + ' assertions/playthroughs passed');
