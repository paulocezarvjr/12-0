/* ============================================================================
 * 12-0 — App controller
 *
 * Holds game state, exposes the same actions the mockup's component had, and
 * re-renders the current screen on every state change. Events are handled by a
 * single delegated click listener on the root, dispatching on data-action.
 *
 * Depends on globals: SETUPS (data.js), Engine (engine.js), View (view.js).
 * ==========================================================================*/

const App = (() => {
  const initialState = () => ({
    screen: 'home',
    selectedSetup: null,
    setup: null,
    roster: [],
    pickIndex: 0,
    draw: null,
    drawCount: 0,
    usedSquadIds: [],
    results: [],
    reveal: 0,
    copied: false,
    pendingPick: null,
    rerollUsed: false,
    hideRatings: false,
  });

  let state = initialState();
  let root = null;
  let revealTimer = null;
  let copyTimer = null;

  /** Merge a patch (object or prev=>patch) into state and re-render. */
  function setState(patch, cb) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = Object.assign({}, state, next);
    render();
    if (cb) cb();
  }

  function render() {
    if (root) root.innerHTML = View.render(state);
  }

  // ---- navigation -------------------------------------------------------
  function reset() {
    clearTimeout(revealTimer);
    setState(initialState());
  }

  // ---- setup ------------------------------------------------------------
  function confirmSetup() {
    const setup = SETUPS.find((s) => s.id === state.selectedSetup);
    if (!setup) return;
    const roster = setup.roles.map((r) => ({ role: r, player: null }));
    setState(
      { setup, roster, pickIndex: 0, drawCount: 0, usedSquadIds: [], pendingPick: null, screen: 'draft' },
      newDraw
    );
  }

  // ---- draft ------------------------------------------------------------
  function newDraw() {
    if (!Engine.openSlots(state.roster).length) return;
    const sq = Engine.pickDraw(state.roster, state.usedSquadIds);
    setState((s) => ({
      draw: sq,
      usedSquadIds: [...s.usedSquadIds, sq.id],
      drawCount: s.drawCount + 1,
      pendingPick: null,
      rerollUsed: false, // fresh pick -> reroll available again
    }));
  }

  function reroll(axis) {
    const draw = state.draw;
    if (!draw || state.rerollUsed) return; // one reroll per pick
    const sq = Engine.pickReroll(state.roster, draw, state.usedSquadIds, axis);
    if (!sq) return;
    setState((s) => ({
      draw: sq,
      usedSquadIds: s.usedSquadIds.includes(sq.id) ? s.usedSquadIds : [...s.usedSquadIds, sq.id],
      drawCount: s.drawCount + 1,
      pendingPick: null,
      rerollUsed: true, // reroll spent for this pick
    }));
  }

  /** Pick a player from the current draw; auto-place if only one slot fits. */
  function selectPick(p) {
    const draw = state.draw;
    if (!draw || Engine.isPicked(state.roster, p)) return; // no duplicate players
    const full = { ...p, team: draw.team, yr: draw.yr, ev: draw.ev, srcId: draw.id };
    const elig = Engine.openSlots(state.roster).filter((s) => Engine.eligible(s.role, p));
    if (!elig.length) return;
    if (elig.length === 1) placeAt(elig[0].i, full);
    else setState({ pendingPick: full });
  }

  function placeSlot(i) {
    if (state.pendingPick) placeAt(i, state.pendingPick);
  }

  function placeAt(slotIndex, full) {
    const roster = state.roster.slice();
    if (roster[slotIndex].player || Engine.isPicked(roster, full) || !Engine.eligible(roster[slotIndex].role, full)) return;
    roster[slotIndex] = Object.assign({}, roster[slotIndex], { player: full });
    const filled = roster.filter((s) => s.player).length;
    setState({ roster, pendingPick: null }, () => {
      if (filled < 5) newDraw();
    });
  }

  // ---- simulation -------------------------------------------------------
  function runMajor() {
    const results = Engine.computeResults(state.roster);
    clearTimeout(revealTimer);
    setState({ screen: 'sim', results, reveal: 0, copied: false }, scheduleReveal);
  }

  function scheduleReveal() {
    if (state.reveal >= state.results.length) return;
    const delay = state.reveal === 0 ? 480 : 820;
    revealTimer = setTimeout(() => {
      setState((s) => ({ reveal: Math.min(s.reveal + 1, s.results.length) }), scheduleReveal);
    }, delay);
  }

  function skip() {
    clearTimeout(revealTimer);
    setState((s) => ({ reveal: s.results.length }));
  }

  // ---- result -----------------------------------------------------------
  function share() {
    const txt = Engine.shareText(state);
    try {
      navigator.clipboard.writeText(txt);
    } catch (e) {
      /* clipboard may be unavailable (e.g. file://) — ignore */
    }
    setState({ copied: true });
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => setState({ copied: false }), 2600);
  }

  // ---- event delegation -------------------------------------------------
  const actions = {
    start: () => setState({ screen: 'setup' }),
    home: reset,
    showRatings: () => setState({ hideRatings: false }),
    memoryMode: () => setState({ hideRatings: true }),
    selectSetup: (el) => setState({ selectedSetup: el.getAttribute('data-id') }),
    confirm: confirmSetup,
    rerollTeam: () => reroll('team'),
    rerollYear: () => reroll('year'),
    cancelPick: () => setState({ pendingPick: null }),
    pick: (el) => {
      const i = Number(el.getAttribute('data-idx'));
      if (state.draw && state.draw.ps[i]) selectPick(state.draw.ps[i]);
    },
    placeSlot: (el) => placeSlot(Number(el.getAttribute('data-idx'))),
    run: runMajor,
    skip,
    result: () => setState({ screen: 'result' }),
    share,
    playAgain: reset,
  };

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = actions[el.getAttribute('data-action')];
    if (fn) {
      e.preventDefault();
      fn(el);
    }
  }

  function mount(el) {
    root = el;
    root.addEventListener('click', onClick);
    render();
  }

  return { mount };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.mount(document.getElementById('app'));
});
