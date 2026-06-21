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

// reroll is capped at one per pick
{
  domReady();
  click('start');
  click('selectSetup', SETUPS[0].id);
  click('confirm');
  let acts = parseActions(root.innerHTML);
  const rr = first(acts, 'rerollTeam') || first(acts, 'rerollYear');
  if (rr) {
    click(rr.action);
    acts = parseActions(root.innerHTML);
    assert.ok(!has(acts, 'rerollTeam') && !has(acts, 'rerollYear'), 'after one reroll, no reroll button remains for this pick');
    passed++;
  }
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

// 2d) any-of role: the Firepower support/igl slot accepts either
{
  const fp = SETUPS.find((s) => s.id === 'firepower');
  const hybrid = fp.roles.find((r) => r.tags && r.tags.includes('igl') && r.tags.includes('support'));
  assert.ok(hybrid, 'firepower has a support/igl hybrid slot');
  const igl = { n: 'i', roles: ['igl'], awp: false };
  const sup = { n: 's', roles: ['support'], awp: false };
  const rifler = { n: 'r', roles: ['rifle'], awp: false };
  assert.ok(Engine.eligible(hybrid, igl), 'an IGL fits the hybrid slot');
  assert.ok(Engine.eligible(hybrid, sup), 'a support fits the hybrid slot');
  assert.ok(!Engine.eligible(hybrid, rifler), 'a pure rifler does NOT fit the hybrid slot');
  // double AWP flex slot accepts an AWPer OR a rifler
  const da = SETUPS.find((s) => s.id === 'double');
  const flex = da.roles.find((r) => r.tags && r.tags.includes('awp') && r.tags.includes('rifle'));
  assert.ok(flex, 'double AWP has an awp/rifle flex slot');
  assert.ok(Engine.eligible(flex, { n: 'a', roles: ['awp'], awp: true }), 'an AWPer fits the flex slot');
  assert.ok(Engine.eligible(flex, rifler), 'a rifler fits the flex slot');
  assert.ok(!Engine.eligible(flex, igl), 'a pure IGL does not fit the flex slot');
  passed += 7;
}

// 2e) no duplicate players: a nick already on the roster can't be drafted again
{
  const r = [
    { role: { tag: 'rifle' }, player: { n: 'tarik', roles: ['rifle'], awp: false } },
    { role: { tag: 'igl' }, player: null },
  ];
  assert.ok(Engine.isPicked(r, { n: 'tarik', roles: ['igl'], awp: false }), 'same nick detected as already picked');
  assert.ok(!Engine.isPlaceable(r, { n: 'tarik', roles: ['igl'], awp: false }), 'an already-picked nick is not placeable');
  assert.ok(Engine.isPlaceable(r, { n: 'gla1ve', roles: ['igl'], awp: false }), 'a fresh eligible player is placeable');
  passed += 3;
}

// 2f) cosmetic broadcast: stage fields + playoffs bracket
{
  const mk = (ph, win, opp, score) => ({ ph, bo: 'BO1', win, opp, score });
  const champ = [
    mk('SWISS STAGE 1', true, "NAVI '21", '13 – 5'), mk('SWISS STAGE 1', true, "FaZe '22", '13 – 7'), mk('SWISS STAGE 1', true, "G2 '23", '13 – 9'),
    mk('SWISS STAGE 2', true, "MOUZ '24", '13 – 4'), mk('SWISS STAGE 2', true, "Spirit '24", '13 – 8'), mk('SWISS STAGE 2', true, "Liquid '19", '13 – 6'),
    mk('SWISS STAGE 3', true, "Astralis '18", '13 – 10'), mk('SWISS STAGE 3', true, "Vitality '23", '13 – 11'), mk('SWISS STAGE 3', true, "NiP '14", '13 – 7'),
    mk('QUARTERFINAL', true, "Fnatic '15", '2 – 0'), mk('SEMIFINAL', true, "SK Gaming '16", '2 – 1'), mk('GRAND FINAL', true, "Heroic '22", '2 – 1'),
  ];
  const bc = Engine.buildBroadcast(champ);
  assert.strictEqual(bc.stages.length, 3, '3 swiss stage fields');
  bc.stages.forEach((s) => {
    assert.strictEqual(s.teams.length, 15, '15 cosmetic teams per field (16 with you)');
    assert.ok(s.youAdvanced && s.youRecord === '3-0', 'you went 3-0 each stage');
    assert.strictEqual(s.teams.filter((t) => t.advanced).length, 7, '7 others advance (8 total with you)');
  });
  assert.ok(bc.bracket && bc.bracket.rounds.length === 3, 'champion has a QF/SF/Final bracket');
  assert.strictEqual(bc.bracket.rounds[0].matches.length, 4, '4 quarterfinals');
  const fnl = bc.bracket.rounds[2].matches[0];
  assert.ok(fnl.mine && fnl.winner === 'top', 'your winning Grand Final is the bracket final');

  const out = [mk('SWISS STAGE 1', false, "x '20", '5 – 13'), mk('SWISS STAGE 1', false, "y '20", '7 – 13'), mk('SWISS STAGE 1', false, "z '20", '9 – 13')];
  const bc2 = Engine.buildBroadcast(out);
  assert.strictEqual(bc2.stages.length, 1, 'one stage field when out in stage 1');
  assert.ok(!bc2.stages[0].youAdvanced && bc2.stages[0].youRecord === '0-3', 'shown as 0-3 eliminated');
  assert.strictEqual(bc2.bracket, null, 'no bracket if you never reach playoffs');
  assert.strictEqual(bc2.stages[0].teams.filter((t) => t.advanced).length, 8, '8 others advance when you are out');
  passed += 10;
}

// 3) opponents are real squads shown with their era year (e.g. "NAVI '21")
const r = Engine.computeResults(mockRoster);
assert.ok(r.every((m) => /'\d{2}$/.test(m.opp)), 'each opponent shows its year, got: ' + r.map((m) => m.opp).join(', '));
assert.ok(SQUADS.length >= 18, 'enough squads to draw a full run of opponents');
passed++;

console.log('OK — ' + passed + ' assertions/playthroughs passed');
