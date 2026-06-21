/* ============================================================================
 * 12-0 — Game engine (pure logic, no DOM)
 *
 * All rules ported faithfully from the approved Claude Design mockup. These
 * functions take explicit arguments (roster, results, …) instead of reading
 * shared state, so they stay testable and easy to extend. Randomness uses
 * Math.random directly; inject a seeded RNG here later if you want repeatable
 * runs for tests.
 *
 * Depends on globals from data.js: SQUADS, PHASES, OPP_POOL.
 * ==========================================================================*/

const Engine = (() => {
  /** Format a rating the way HLTV shows it. */
  const fmt = (r) => r.toFixed(2);

  /** A role accepts one `tag`, or a `tags` array meaning any-of (e.g. support OR igl). */
  const roleTags = (role) => (role.tags && role.tags.length ? role.tags : [role.tag]);

  function fitBonusTag(tag, p) {
    if (tag === 'awp') return p.awp ? 0.12 : -0.08;
    if (tag === 'star') return p.roles.includes('star') ? 0.10 : 0;
    return p.roles.includes(tag) ? 0.08 : 0;
  }
  /**
   * Bonus to a player's effective rating in a role — the BEST fit across the
   * role's accepted tags. A natural AWPer in AWP is great; a rifler forced onto
   * AWP is penalised; a support/igl slot rewards whichever the player actually is.
   */
  function fitBonus(role, p) {
    return Math.max(...roleTags(role).map((t) => fitBonusTag(t, p)));
  }

  function eligibleTag(tag, p) {
    if (tag === 'awp') return !!p.awp;
    if (tag === 'star') return p.roles.includes('star');
    return p.roles.includes(tag);
  }
  /** Can this player legally fill a slot? True if they match ANY of its accepted tags. */
  function eligible(role, p) {
    return roleTags(role).some((t) => eligibleTag(t, p));
  }

  /** Sum of effective ratings (rating + fit bonus) across filled slots. */
  function rosterStrength(roster) {
    return roster.reduce((a, s) => a + (s.player ? s.player.r + fitBonus(s.role, s.player) : 0), 0);
  }

  /** Open (unfilled) slots, each tagged with its index in the roster. */
  function openSlots(roster) {
    return roster
      .map((s, i) => ({ role: s.role, player: s.player, i }))
      .filter((s) => !s.player);
  }

  /** Is this exact player (by nickname) already on the roster? No clones. */
  function isPicked(roster, p) {
    return roster.some((s) => s.player && s.player.n === p.n);
  }

  /** Can this player be drafted now — not already picked, and fits an open slot? */
  function isPlaceable(roster, p) {
    return !isPicked(roster, p) && openSlots(roster).some((s) => eligible(s.role, p));
  }

  /** Does this squad have at least one draftable player (fits a slot, not a dup)? */
  function squadUseful(roster, sq) {
    return sq.ps.some((p) => isPlaceable(roster, p));
  }

  /**
   * Draw the next squad: prefer an unused squad that can still help the
   * roster; fall back to any useful squad; finally any squad at all.
   */
  function pickDraw(roster, usedIds) {
    let avail = SQUADS.filter((s) => !usedIds.includes(s.id) && squadUseful(roster, s));
    if (!avail.length) avail = SQUADS.filter((s) => squadUseful(roster, s));
    const pool = avail.length ? avail : SQUADS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Candidate squads for a reroll on one axis (exact team-name identity). */
  function rerollPool(draw, axis) {
    if (!draw) return [];
    return SQUADS.filter((s) =>
      axis === 'team' ? s.yr === draw.yr && s.team !== draw.team : s.team === draw.team && s.yr !== draw.yr
    );
  }

  /** Is a reroll possible — another team for this year, or another year for this team? */
  function hasReroll(draw, axis) {
    return rerollPool(draw, axis).length > 0;
  }

  /**
   * Reroll the current draw on an axis:
   *   'team' keeps the year and swaps the team; 'year' keeps the team and swaps
   * the year. Prefers an unused squad that helps the open slots, then any
   * useful squad, then anything available. Returns null if no candidate exists.
   */
  function pickReroll(roster, draw, usedIds, axis) {
    const pool = rerollPool(draw, axis);
    if (!pool.length) return null;
    const usefulUnused = pool.filter((s) => !usedIds.includes(s.id) && squadUseful(roster, s));
    const useful = pool.filter((s) => squadUseful(roster, s));
    const tier = usefulUnused.length ? usefulUnused : useful.length ? useful : pool;
    return tier[Math.floor(Math.random() * tier.length)];
  }

  /** Fisher–Yates shuffle (returns a new array). */
  function shuffle(a) {
    const x = a.slice();
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  }

  /** A plausible CS2 scoreline for a win/loss in a BO1 (to 13) or BO3 series. */
  function score(win, bo) {
    if (bo === 3) {
      if (win) return Math.random() < 0.55 ? '2 – 0' : '2 – 1';
      return Math.random() < 0.5 ? '0 – 2' : '1 – 2';
    }
    const l = Math.floor(Math.random() * 9) + 3; // loser rounds 3..11
    return win ? '13 – ' + l : l + ' – 13';
  }

  /** Per-map win probability from the strength gap (logistic). */
  const mapProb = (diff) => 1 / (1 + Math.exp(-1.4 * diff));
  /** Best-of-three series win probability given per-map probability p. */
  const seriesProb = (p) => p * p * (3 - 2 * p);

  /**
   * Simulate a whole Major run with the real format:
   *   - Three Swiss stages: play until 3 wins (advance) or 3 losses (out).
   *     A single loss does NOT end the run here.
   *   - Playoffs (QF / SF / Final): best-of-three, single elimination.
   * Returns the flat list of matches in order (3..18 of them). Whether the run
   * was a title or an elimination is derived in summary().
   */
  function computeResults(roster) {
    const myStr = rosterStrength(roster);
    // opponents are real historic squads, shown with their era year (e.g. "NAVI '21")
    const opps = shuffle(SQUADS);
    let ni = 0;
    const nextOpp = () => {
      const s = opps[ni++ % opps.length];
      return s.team + " '" + String(s.yr).slice(2);
    };
    const matches = [];

    const playMatch = (phase, baseOpp, bo) => {
      const oppStr = baseOpp + (Math.random() * 0.3 - 0.15);
      const p = bo === 3 ? seriesProb(mapProb(myStr - oppStr)) : mapProb(myStr - oppStr);
      const win = Math.random() < p;
      matches.push({ ph: phase, bo: bo === 3 ? 'BO3' : 'BO1', opp: nextOpp(), win, score: score(win, bo) });
      return win;
    };

    // Swiss stages — advancement (2-x) and elimination (x-2) deciders are BO3.
    for (const stage of SWISS_STAGES) {
      let w = 0, l = 0;
      while (w < 3 && l < 3) {
        const bo = w === 2 || l === 2 ? 3 : 1;
        if (playMatch(stage.ph, stage.opp, bo)) w++; else l++;
      }
      if (l >= 3) return matches; // knocked out of the Major in this stage
    }

    // Playoffs — single elimination, all best-of-three.
    for (const po of PLAYOFFS) {
      if (!playMatch(po.ph, po.opp, 3)) return matches; // a loss ends the run
    }
    return matches; // won the Grand Final -> champion
  }

  const PHASE_NICE = {
    'SWISS STAGE 1': 'Swiss Stage 1',
    'SWISS STAGE 2': 'Swiss Stage 2',
    'SWISS STAGE 3': 'Swiss Stage 3',
    QUARTERFINAL: 'Quarterfinal',
    SEMIFINAL: 'Semifinal',
    'GRAND FINAL': 'Grand Final',
  };

  /** Final record + headline + flavor text for the result screen. */
  function summary(matches) {
    const wins = matches.filter((m) => m.win).length;
    const losses = matches.filter((m) => !m.win).length;
    const last = matches[matches.length - 1];
    const champion = !!last && last.ph === 'GRAND FINAL' && last.win;
    const perfect = champion && losses === 0;

    let title, sub;
    if (perfect) {
      title = 'Perfect Major Run';
      sub = 'Twelve wins. Zero losses. Immortal.';
    } else if (champion) {
      title = 'Major Champion';
      sub = 'Lifted the trophy — dropped ' + losses + (losses === 1 ? ' map' : ' maps') + ' along the way.';
    } else if (last && last.ph === 'GRAND FINAL') {
      title = 'Runner-up · Grand Final';
      sub = 'One series from it all. Beaten in the final.';
    } else if (last && last.ph === 'SEMIFINAL') {
      title = 'Top 4 · Semifinal';
      sub = 'A deep playoff run, stopped in the semis.';
    } else if (last && last.ph === 'QUARTERFINAL') {
      title = 'Top 8 · Quarterfinal';
      sub = 'Made the playoffs, but out in the quarters.';
    } else {
      title = 'Eliminated · ' + (last ? PHASE_NICE[last.ph] || last.ph : '');
      sub = last && last.ph === 'SWISS STAGE 3'
        ? 'One stage from the playoffs — agonizing.'
        : last && last.ph === 'SWISS STAGE 2'
        ? 'Knocked out in the second Swiss stage.'
        : 'Couldn’t survive the opening Swiss. Re-draft and go again.';
    }

    return { perfect, champion, eliminated: !champion, wins, losses, record: wins + '-' + losses, title, sub };
  }

  /** Shareable, emoji-square result summary (for clipboard). */
  function shareText(state) {
    const r = summary(state.results);
    const squares = state.results.map((m) => (m.win ? '🟩' : '🟥')).join('');
    const head = r.perfect
      ? '12-0 — PERFECT MAJOR RUN'
      : r.champion
      ? r.record + ' — MAJOR CHAMPION'
      : r.record + ' — ' + r.title;
    const lines = state.roster
      .map((s) => (s.player ? s.role.code + ' ' + s.player.n + ' (' + s.player.team + " '" + String(s.player.yr).slice(2) + ')' : ''))
      .filter(Boolean);
    return ['🔫 12-0 · CS2 Fantasy Major', head, state.setup.name + ' setup', squares, '', ...lines, '', 'Can you run it 12-0?'].join('\n');
  }

  return {
    fmt, fitBonus, eligible, rosterStrength, openSlots, isPicked, isPlaceable,
    squadUseful, pickDraw, hasReroll, pickReroll, shuffle, score, computeResults, summary, shareText,
  };
})();
