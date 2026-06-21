/* ============================================================================
 * 12-0 — View layer
 *
 * computeView(state) mirrors the mockup's renderVals(): it turns raw state
 * into a flat view-model. The render* functions emit the exact markup (and
 * inline styles) from the approved Claude Design mockup, with {{ }} bindings
 * resolved and sc-if / sc-for expanded.
 *
 * Interactions are wired by data-action / data-idx / data-id attributes and
 * handled via event delegation in app.js — no inline handlers, no framework.
 *
 * Depends on globals: STEPS, SETUPS (data.js) and Engine (engine.js).
 * ==========================================================================*/

const View = (() => {
  const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ENT[c]);

  // ---- view-model (state -> flat values the renderers consume) ----------
  function computeView(state) {
    const st = state;
    const screen = st.screen;
    const roster = st.roster;
    const filledCount = roster.filter((s) => s.player).length;
    const allFilled = filledCount >= 5;
    const pending = st.pendingPick;
    const showR = !st.hideRatings;

    const sample = { initial: 's', name: 's1mple', country: 'UKR', team: "NAVI — Major '21", rating: '1.30', role: 'AWP' };

    const setupCards = SETUPS.map((s) => ({
      id: s.id, name: s.name, sub: s.sub, roles: s.roles,
      selected: s.id === st.selectedSetup, unselected: s.id !== st.selectedSetup,
    }));

    const rosterSlots = roster.map((slot, i) => {
      const filled = !!slot.player;
      const elig = pending ? Engine.eligible(slot.role, pending) : false;
      return {
        idx: i + 1, slotIndex: i, label: slot.role.label, code: slot.role.code,
        filled,
        placeEligible: !filled && !!pending && elig,
        placeIneligible: !filled && !!pending && !elig,
        open: !filled && !pending,
        name: filled ? slot.player.n : '',
        initial: filled ? slot.player.n[0] : '',
        rating: filled ? Engine.fmt(slot.player.r) : '',
        team: filled ? slot.player.team + " '" + String(slot.player.yr).slice(2) : '',
      };
    });

    const progressDots = roster.map((slot) => ({ on: !!slot.player, off: !slot.player }));

    const draw = st.draw;
    const options = draw && !allFilled
      ? draw.ps.map((p, pi) => {
          const placeable = Engine.isPlaceable(roster, p);
          const selected = !!pending && pending.n === p.n;
          return {
            idx: pi, name: p.n, country: p.c, rating: Engine.fmt(p.r), awp: p.awp, initial: p.n[0],
            roleTags: p.roles.join(' · ').toUpperCase(),
            selected, disabled: !placeable, available: placeable && !selected,
          };
        })
      : [];

    const reveal = st.reveal;
    const revealed = st.results.slice(0, reveal).map((m, i) => ({
      phase: m.ph, opp: m.opp, score: m.score, bo: m.bo, win: m.win, loss: !m.win,
      isLast: i === reveal - 1,
    }));
    const liveWins = revealed.filter((m) => m.win).length;
    const liveLosses = revealed.filter((m) => m.loss).length;
    const simDone = reveal >= st.results.length && st.results.length > 0;
    const pendingMsgs = ['Scouting the next opponent…', 'Veto in progress…', 'Players warming up…', 'Knife round…'];

    const sum = screen === 'result' || simDone ? Engine.summary(st.results) : { perfect: false, champion: false, record: '', title: '', sub: '' };
    const result = { perfect: sum.perfect, champion: sum.champion, eliminated: !sum.champion, record: sum.record, title: sum.title, sub: sum.sub };
    const resultRoster = roster.map((s) => ({
      code: s.role.code, name: s.player ? s.player.n : '—', initial: s.player ? s.player.n[0] : '',
      rating: s.player ? Engine.fmt(s.player.r) : '', team: s.player ? s.player.team + " '" + String(s.player.yr).slice(2) : '',
    }));

    return {
      isHome: screen === 'home', isSetup: screen === 'setup', isDraft: screen === 'draft', isSim: screen === 'sim', isResult: screen === 'result',
      steps: STEPS, sample,
      setupCards, canContinue: !!st.selectedSetup,
      modeShown: !st.hideRatings, modeMemory: st.hideRatings,
      showRatings: showR, hideRatings: st.hideRatings, memoryOn: st.hideRatings,
      setupName: st.setup ? st.setup.name : '',
      progressText: 'PICKED ' + filledCount + ' / 5',
      progressDots,
      allFilled, draftDrawShown: !allFilled && !!draw,
      pendingActive: !!pending, pendingIdle: !pending, pendingName: pending ? pending.n : '',
      rosterSlots,
      rosterStrengthLabel: filledCount ? Engine.rosterStrength(roster).toFixed(2) : '0.00',
      drawTeam: draw ? draw.team : '', drawEvent: draw ? draw.ev : '', drawYear: draw ? draw.yr : '',
      drawMono: draw ? draw.team.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() : '',
      drawNum: 'PICK ' + Math.min(filledCount + 1, 5) + ' / 5',
      canRerollTeam: !st.rerollUsed && Engine.hasReroll(draw, 'team'),
      canRerollYear: !st.rerollUsed && Engine.hasReroll(draw, 'year'),
      options,
      revealed, liveWins, liveLosses, simDone, simPending: !simDone,
      pendingLabel: pendingMsgs[reveal % pendingMsgs.length],
      result, resultRoster,
      shared: st.copied, notShared: !st.copied,
    };
  }

  // ---- shared style fragments -------------------------------------------
  const F_BARLOW = "font-family:'Barlow Condensed',sans-serif";
  const F_MONO = "font-family:'JetBrains Mono',monospace";
  const CLIP = (n) => `clip-path:polygon(0 0,100% 0,100% calc(100% - ${n}px),calc(100% - ${n}px) 100%,0 100%)`;

  // ============================ HOME ====================================
  function renderHome(v) {
    return `
<div data-screen-label="Home" style="max-width:1180px;margin:0 auto;padding:clamp(22px,5vw,60px) clamp(18px,5vw,48px)">
  <div style="display:flex;align-items:center;gap:10px;animation:fadeIn .5s ease both">
    <div style="width:13px;height:13px;background:#ff8a1f;transform:skewX(-12deg)"></div>
    <span style="${F_MONO};font-size:12px;letter-spacing:.34em;color:#9aa1ac;font-weight:500">FANTASY MAJOR &nbsp;·&nbsp; CS2</span>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:clamp(28px,5vw,64px);align-items:center;margin-top:clamp(26px,5vw,52px)">
    <div style="flex:1 1 380px;min-width:300px">
      <h1 style="${F_BARLOW};font-weight:800;font-size:clamp(58px,12vw,128px);line-height:.84;letter-spacing:-.01em;margin:0;text-transform:uppercase;animation:fadeUp .6s ease both">
        <span style="display:block;color:#f4f6f8">Run the</span>
        <span style="display:block;color:#ff8a1f">Major</span>
        <span style="display:block;color:#f4f6f8">Twelve&ndash;Zero</span>
      </h1>
      <p style="font-size:clamp(15px,2.4vw,19px);line-height:1.5;color:#aab1bb;max-width:440px;margin:22px 0 0;animation:fadeUp .6s ease .08s both">Draft a dream roster of CS legends and try to win a CS2 Major completely undefeated. Three Swiss stages, three playoff rounds, one perfect record.</p>
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:30px;animation:fadeUp .6s ease .16s both">
        <button class="btn-primary" data-action="start" style="${F_BARLOW};font-weight:800;font-size:23px;letter-spacing:.06em;text-transform:uppercase;color:#160b02;background:linear-gradient(180deg,#ffa63d,#f07d12);border:none;padding:17px 40px;cursor:pointer;${CLIP(11)};animation:glowPulse 3s ease-in-out infinite">Start Draft &nbsp;&rarr;</button>
        <span style="${F_MONO};font-size:12px;letter-spacing:.18em;color:#6b727c">FREE · NO LOGIN · SOLO</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:18px;margin-top:clamp(34px,5vw,52px)">
        ${v.steps.map((step) => `
        <div style="flex:1 1 150px;min-width:140px;border-top:2px solid #2a2f37;padding-top:12px;animation:fadeUp .6s ease both">
          <div style="${F_MONO};font-size:12px;color:#ff8a1f;letter-spacing:.16em">${esc(step.num)}</div>
          <div style="${F_BARLOW};font-weight:700;font-size:21px;letter-spacing:.02em;text-transform:uppercase;margin-top:5px;color:#e9ebee">${esc(step.title)}</div>
          <div style="font-size:13px;color:#8b929c;line-height:1.45;margin-top:4px">${esc(step.body)}</div>
        </div>`).join('')}
      </div>
    </div>
    <div style="flex:0 1 380px;min-width:300px;display:flex;flex-direction:column;gap:22px;animation:fadeUp .7s ease .1s both">
      <div style="position:relative;background:linear-gradient(180deg,#13171d,#0e1116);border:1px solid #2a2f37;${CLIP(16)};padding:18px 20px 22px;overflow:hidden">
        <div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent,rgba(255,138,31,.06));height:40%;animation:scan 4.5s linear infinite"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;${F_MONO};font-size:11px;letter-spacing:.2em;color:#6b727c">
          <span>MAJOR · GRAND FINAL</span><span style="color:#ff8a1f;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;background:#ff8a1f;border-radius:50%;animation:pulseDot 1.4s infinite"></span>LIVE</span>
        </div>
        <div style="display:flex;align-items:stretch;gap:10px;margin-top:14px">
          <div style="flex:1;text-align:center;background:#0b0d10;border:1px solid #232830;padding:14px 0 10px">
            <div style="${F_MONO};font-size:10px;letter-spacing:.24em;color:#8b929c">WINS</div>
            <div style="${F_BARLOW};font-weight:800;font-size:84px;line-height:.8;color:#46a7f0;margin-top:6px;text-shadow:0 0 26px rgba(70,167,240,.45)">12</div>
          </div>
          <div style="display:flex;align-items:center;${F_BARLOW};font-weight:800;font-size:54px;color:#3a4049">&ndash;</div>
          <div style="flex:1;text-align:center;background:#0b0d10;border:1px solid #232830;padding:14px 0 10px">
            <div style="${F_MONO};font-size:10px;letter-spacing:.24em;color:#8b929c">LOSSES</div>
            <div style="${F_BARLOW};font-weight:800;font-size:84px;line-height:.8;color:#ff8a1f;margin-top:6px;text-shadow:0 0 26px rgba(255,138,31,.45)">0</div>
          </div>
        </div>
        <div style="text-align:center;${F_MONO};font-size:11px;letter-spacing:.22em;color:#2ee6a0;margin-top:14px">PERFECT MAJOR RUN</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;${F_MONO};font-size:11px;letter-spacing:.2em;color:#6b727c"><span style="width:18px;height:1px;background:#2a2f37"></span>SAMPLE LEGEND</div>
      <div style="background:#13171d;border:1px solid #2a2f37;${CLIP(13)};display:flex;overflow:hidden">
        <div style="width:96px;flex:none;position:relative;background:repeating-linear-gradient(135deg,#1a1f26 0 8px,#161a20 8px 16px);display:flex;align-items:center;justify-content:center">
          <span style="${F_BARLOW};font-weight:800;font-size:62px;color:#2a313a">${esc(v.sample.initial)}</span>
          <span style="position:absolute;top:6px;left:6px;${F_MONO};font-size:9px;letter-spacing:.1em;color:#9aa1ac;background:#0b0d10;padding:2px 5px">${esc(v.sample.country)}</span>
          <span style="position:absolute;top:6px;right:6px;${F_MONO};font-size:9px;font-weight:700;letter-spacing:.06em;color:#0b0d10;background:#ff8a1f;padding:2px 5px">AWP</span>
        </div>
        <div style="flex:1;padding:12px 14px;display:flex;flex-direction:column;justify-content:center">
          <div style="${F_BARLOW};font-weight:700;font-size:26px;letter-spacing:.02em;line-height:1;text-transform:uppercase">${esc(v.sample.name)}</div>
          <div style="${F_MONO};font-size:11px;color:#8b929c;margin-top:4px">${esc(v.sample.team)}</div>
          <div style="display:flex;align-items:flex-end;gap:14px;margin-top:10px">
            <div><div style="${F_MONO};font-size:9px;letter-spacing:.16em;color:#6b727c">RATING</div><div style="${F_MONO};font-weight:700;font-size:24px;color:#46a7f0;line-height:1">${esc(v.sample.rating)}</div></div>
            <div style="${F_MONO};font-size:10px;letter-spacing:.1em;color:#0b0d10;background:#46a7f0;padding:3px 7px;margin-bottom:2px">${esc(v.sample.role)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
  }

  // ============================ SETUP ===================================
  function renderSetup(v) {
    const mode = `
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:clamp(22px,4vw,34px)">
        <span style="${F_MONO};font-size:11px;letter-spacing:.2em;color:#6b727c">GAME MODE</span>
        <div style="display:inline-flex;border:1px solid #2a2f37">
          ${v.modeShown
            ? `<span style="${F_BARLOW};font-weight:700;font-size:17px;letter-spacing:.04em;text-transform:uppercase;color:#160b02;background:#ff8a1f;padding:9px 17px">Ratings shown</span>`
            : `<button data-action="showRatings" style="${F_BARLOW};font-weight:700;font-size:17px;letter-spacing:.04em;text-transform:uppercase;color:#9aa1ac;background:none;border:none;padding:9px 17px;cursor:pointer">Ratings shown</button>`}
          ${v.modeMemory
            ? `<span style="${F_BARLOW};font-weight:700;font-size:17px;letter-spacing:.04em;text-transform:uppercase;color:#0b0d10;background:#46a7f0;padding:9px 17px">Memory mode</span>`
            : `<button data-action="memoryMode" style="${F_BARLOW};font-weight:700;font-size:17px;letter-spacing:.04em;text-transform:uppercase;color:#9aa1ac;background:none;border:none;padding:9px 17px;cursor:pointer">Memory mode</button>`}
        </div>
        <span style="${F_MONO};font-size:11px;color:#6b727c">hide ratings &amp; draft from memory</span>
      </div>`;

    const card = (c) => {
      const roles = c.roles.map((role) => `
        <div style="display:flex;align-items:center;gap:10px"><span style="${F_MONO};font-weight:700;font-size:10px;color:${c.selected ? '#ff8a1f' : '#9aa1ac'};background:${c.selected ? '#2a1c0c' : '#1b2026'};border:1px solid ${c.selected ? '#3d2810' : '#2a2f37'};width:38px;text-align:center;padding:4px 0;letter-spacing:.04em">${esc(role.code)}</span><span style="font-size:13.5px;color:${c.selected ? '#dfe3e8' : '#aab1bb'}">${esc(role.label)}</span></div>`).join('');
      if (c.selected) {
        return `
        <button data-action="selectSetup" data-id="${esc(c.id)}" style="text-align:left;cursor:pointer;background:linear-gradient(180deg,#1c2128,#15191f);border:1px solid #ff8a1f;${CLIP(14)};padding:20px;display:flex;flex-direction:column;box-shadow:0 0 0 1px #ff8a1f,0 14px 34px -16px rgba(255,138,31,.6)">
          <div style="display:flex;align-items:center;justify-content:space-between"><span style="${F_BARLOW};font-weight:800;font-size:27px;text-transform:uppercase;color:#fff;letter-spacing:.01em">${esc(c.name)}</span><span style="${F_MONO};font-size:10px;color:#0b0d10;background:#ff8a1f;padding:3px 7px;letter-spacing:.08em">SELECTED</span></div>
          <div style="font-size:12.5px;color:#c2c8d0;margin-top:3px">${esc(c.sub)}</div>
          <div style="display:flex;flex-direction:column;gap:7px;margin-top:16px">${roles}</div>
        </button>`;
      }
      return `
        <button class="card-setup" data-action="selectSetup" data-id="${esc(c.id)}" style="text-align:left;cursor:pointer;background:#13171d;border:1px solid #2a2f37;${CLIP(14)};padding:20px;display:flex;flex-direction:column">
          <div style="display:flex;align-items:center;justify-content:space-between"><span style="${F_BARLOW};font-weight:800;font-size:27px;text-transform:uppercase;color:#e9ebee;letter-spacing:.01em">${esc(c.name)}</span></div>
          <div style="font-size:12.5px;color:#8b929c;margin-top:3px">${esc(c.sub)}</div>
          <div style="display:flex;flex-direction:column;gap:7px;margin-top:16px">${roles}</div>
        </button>`;
    };

    return `
<div data-screen-label="Setup Select" style="max-width:1100px;margin:0 auto;padding:clamp(20px,4vw,44px) clamp(16px,4vw,40px)">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:clamp(20px,4vw,36px)">
    <button data-action="home" style="${F_MONO};font-size:12px;letter-spacing:.16em;color:#8b929c;background:none;border:none;cursor:pointer;padding:0">&larr; HOME</button>
    <span style="${F_MONO};font-size:12px;letter-spacing:.2em;color:#6b727c">STEP 01 / 03</span>
  </div>
  <h2 style="${F_BARLOW};font-weight:800;font-size:clamp(40px,7vw,70px);line-height:.9;text-transform:uppercase;margin:0;letter-spacing:-.005em">Choose your <span style="color:#ff8a1f">setup</span></h2>
  <p style="color:#9aa1ac;font-size:15px;margin:12px 0 22px;max-width:560px">Like picking a formation. Each setup locks five role slots you'll draft into. Pick the shape of your dream team.</p>
  ${mode}
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:16px">
    ${v.setupCards.map(card).join('')}
  </div>
  <div style="display:flex;justify-content:flex-end;margin-top:26px">
    ${v.canContinue
      ? `<button class="btn-primary" data-action="confirm" style="${F_BARLOW};font-weight:800;font-size:22px;letter-spacing:.06em;text-transform:uppercase;color:#160b02;background:linear-gradient(180deg,#ffa63d,#f07d12);border:none;padding:15px 38px;cursor:pointer;${CLIP(10)}">To the draft &nbsp;&rarr;</button>`
      : `<div style="${F_MONO};font-size:12px;letter-spacing:.14em;color:#6b727c;padding:18px 0">SELECT A SETUP TO CONTINUE</div>`}
  </div>
</div>`;
  }

  // ============================ DRAFT ===================================
  function rosterSlotHtml(slot, v) {
    if (slot.filled) {
      const ratingBit = v.showRatings
        ? `<div style="${F_MONO};font-weight:700;font-size:17px;color:#46a7f0">${esc(slot.rating)}</div>`
        : `<div style="${F_MONO};font-weight:700;font-size:15px;color:#3a4049">★</div>`;
      return `
      <div style="flex:1 1 100%;min-width:150px;background:linear-gradient(100deg,#171c22,#13171d);border:1px solid #2a3b46;${CLIP(9)};display:flex;align-items:center;gap:11px;padding:10px 12px;animation:flipIn .45s ease both">
        <div style="width:40px;height:40px;flex:none;background:repeating-linear-gradient(135deg,#1c222a 0 6px,#171c23 6px 12px);display:flex;align-items:center;justify-content:center;${F_BARLOW};font-weight:800;font-size:24px;color:#39424d">${esc(slot.initial)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px"><span style="${F_MONO};font-weight:700;font-size:9px;color:#ff8a1f;background:#2a1c0c;padding:2px 5px;letter-spacing:.04em">${esc(slot.code)}</span><span style="${F_BARLOW};font-weight:700;font-size:19px;text-transform:uppercase;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(slot.name)}</span></div>
          <div style="${F_MONO};font-size:10px;color:#717983;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(slot.team)}</div>
        </div>
        ${ratingBit}
      </div>`;
    }
    if (slot.placeEligible) {
      return `
      <button class="slot-eligible" data-action="placeSlot" data-idx="${slot.slotIndex}" style="flex:1 1 100%;min-width:150px;text-align:left;cursor:pointer;background:#0f1a14;border:1px solid #2ee6a0;${CLIP(9)};display:flex;align-items:center;gap:11px;padding:10px 12px;box-shadow:0 0 16px -6px rgba(46,230,160,.7);animation:glowPulse 1.5s ease-in-out infinite">
        <div style="width:40px;height:40px;flex:none;border:1px dashed #2ee6a0;display:flex;align-items:center;justify-content:center;${F_MONO};font-size:11px;color:#2ee6a0">${slot.idx}</div>
        <div style="flex:1"><span style="${F_MONO};font-weight:700;font-size:9px;color:#2ee6a0;background:#10271d;padding:2px 5px;letter-spacing:.04em">${esc(slot.code)}</span><div style="${F_BARLOW};font-weight:700;font-size:18px;text-transform:uppercase;color:#2ee6a0;margin-top:4px">${esc(slot.label)}</div></div>
        <span style="${F_MONO};font-size:9px;letter-spacing:.06em;color:#2ee6a0;text-align:right;line-height:1.3">TAP TO<br>PLACE</span>
      </button>`;
    }
    if (slot.placeIneligible) {
      return `
      <div style="flex:1 1 100%;min-width:150px;background:#0c0e12;border:1px dashed #232830;${CLIP(9)};display:flex;align-items:center;gap:11px;padding:10px 12px;opacity:.4">
        <div style="width:40px;height:40px;flex:none;border:1px dashed #232830;display:flex;align-items:center;justify-content:center;${F_MONO};font-size:11px;color:#4d545d">${slot.idx}</div>
        <div style="flex:1"><span style="${F_MONO};font-weight:700;font-size:9px;color:#717983;background:#1b2026;padding:2px 5px;letter-spacing:.04em">${esc(slot.code)}</span><div style="${F_BARLOW};font-weight:700;font-size:18px;text-transform:uppercase;color:#5a626c;margin-top:4px">${esc(slot.label)}</div></div>
        <span style="${F_MONO};font-size:9px;letter-spacing:.06em;color:#717983;text-align:right;line-height:1.3">CAN'T<br>PLAY</span>
      </div>`;
    }
    return `
      <div style="flex:1 1 100%;min-width:150px;background:#0e1116;border:1px dashed #2f3640;${CLIP(9)};display:flex;align-items:center;gap:11px;padding:10px 12px">
        <div style="width:40px;height:40px;flex:none;border:1px dashed #2f3640;display:flex;align-items:center;justify-content:center;${F_MONO};font-size:11px;color:#5a626c">${slot.idx}</div>
        <div style="flex:1"><span style="${F_MONO};font-weight:700;font-size:9px;color:#9aa1ac;background:#1b2026;padding:2px 5px;letter-spacing:.04em">${esc(slot.code)}</span><div style="${F_BARLOW};font-weight:700;font-size:18px;text-transform:uppercase;color:#8b929c;margin-top:4px">${esc(slot.label)}</div></div>
        <span style="${F_MONO};font-size:9px;letter-spacing:.1em;color:#4d545d">OPEN</span>
      </div>`;
  }

  function optionHtml(opt, v) {
    const awpBadge = opt.awp ? `<span style="position:absolute;top:6px;right:6px;${F_MONO};font-size:9px;font-weight:700;color:#0b0d10;background:#ff8a1f;padding:2px 5px">AWP</span>` : '';
    if (opt.available) {
      const rating = v.showRatings
        ? `<div><div style="${F_MONO};font-size:8px;letter-spacing:.14em;color:#6b727c">RATING</div><div style="${F_MONO};font-weight:700;font-size:20px;color:#46a7f0;line-height:1">${esc(opt.rating)}</div></div>`
        : `<div style="${F_MONO};font-weight:700;font-size:18px;letter-spacing:.1em;color:#2a313a">★ ?</div>`;
      return `
      <button class="card-option" data-action="pick" data-idx="${opt.idx}" style="text-align:left;cursor:pointer;background:#13171d;border:1px solid #2a2f37;${CLIP(12)};padding:0;overflow:hidden;display:flex;flex-direction:column;animation:popIn .4s ease both">
        <div style="position:relative;height:78px;background:repeating-linear-gradient(135deg,#1b212a 0 9px,#161b22 9px 18px);display:flex;align-items:center;justify-content:center">
          <span style="${F_BARLOW};font-weight:800;font-size:52px;color:#2b333d">${esc(opt.initial)}</span>
          <span style="position:absolute;top:6px;left:6px;${F_MONO};font-size:9px;color:#aab1bb;background:#0b0d10;padding:2px 5px">${esc(opt.country)}</span>
          ${awpBadge}
        </div>
        <div style="padding:10px 11px 12px;flex:1;display:flex;flex-direction:column">
          <div style="${F_BARLOW};font-weight:700;font-size:21px;text-transform:uppercase;line-height:1;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(opt.name)}</div>
          <div style="${F_MONO};font-size:9.5px;color:#717983;margin-top:4px">${esc(opt.roleTags)}</div>
          <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:auto;padding-top:10px">
            ${rating}
            <span style="${F_MONO};font-size:9px;letter-spacing:.06em;color:#ff8a1f">PICK &rarr;</span>
          </div>
        </div>
      </button>`;
    }
    if (opt.selected) {
      const rating = v.showRatings
        ? `<div><div style="${F_MONO};font-size:8px;letter-spacing:.14em;color:#a98a4f">RATING</div><div style="${F_MONO};font-weight:700;font-size:20px;color:#ffce4d;line-height:1">${esc(opt.rating)}</div></div>`
        : `<div style="${F_MONO};font-weight:700;font-size:18px;color:#5a3d12">★ ?</div>`;
      return `
      <button data-action="pick" data-idx="${opt.idx}" style="text-align:left;cursor:pointer;background:#1a1207;border:1px solid #ff8a1f;${CLIP(12)};padding:0;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 0 22px -6px rgba(255,138,31,.8)">
        <div style="position:relative;height:78px;background:repeating-linear-gradient(135deg,#2a1c0c 0 9px,#211608 9px 18px);display:flex;align-items:center;justify-content:center">
          <span style="${F_BARLOW};font-weight:800;font-size:52px;color:#5a3d12">${esc(opt.initial)}</span>
          <span style="position:absolute;top:6px;left:6px;${F_MONO};font-size:9px;color:#aab1bb;background:#0b0d10;padding:2px 5px">${esc(opt.country)}</span>
          ${awpBadge}
        </div>
        <div style="padding:10px 11px 12px;flex:1;display:flex;flex-direction:column">
          <div style="${F_BARLOW};font-weight:700;font-size:21px;text-transform:uppercase;line-height:1;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(opt.name)}</div>
          <div style="${F_MONO};font-size:9.5px;color:#a98a4f;margin-top:4px">${esc(opt.roleTags)}</div>
          <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:auto;padding-top:10px">
            ${rating}
            <span style="${F_MONO};font-size:9px;font-weight:700;letter-spacing:.04em;color:#0b0d10;background:#ff8a1f;padding:3px 6px">✓ PLACING</span>
          </div>
        </div>
      </button>`;
    }
    // disabled
    return `
      <div style="background:#0e1116;border:1px solid #1c2026;${CLIP(12)};padding:0;overflow:hidden;display:flex;flex-direction:column;opacity:.42;cursor:not-allowed">
        <div style="position:relative;height:78px;background:repeating-linear-gradient(135deg,#15191f 0 9px,#11151a 9px 18px);display:flex;align-items:center;justify-content:center">
          <span style="${F_BARLOW};font-weight:800;font-size:52px;color:#22282f">${esc(opt.initial)}</span>
          <span style="position:absolute;top:6px;left:6px;${F_MONO};font-size:9px;color:#717983;background:#0b0d10;padding:2px 5px">${esc(opt.country)}</span>
        </div>
        <div style="padding:10px 11px 12px;flex:1;display:flex;flex-direction:column">
          <div style="${F_BARLOW};font-weight:700;font-size:21px;text-transform:uppercase;line-height:1;color:#8b929c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(opt.name)}</div>
          <div style="${F_MONO};font-size:9.5px;color:#4d545d;margin-top:4px">${esc(opt.roleTags)}</div>
          <div style="margin-top:auto;padding-top:10px"><span style="${F_MONO};font-size:9px;letter-spacing:.06em;color:#717983;border:1px solid #232830;padding:3px 6px">NO OPEN SLOT</span></div>
        </div>
      </div>`;
  }

  function renderDraft(v) {
    const dots = v.progressDots.map((d) => `<span style="width:22px;height:5px;background:${d.on ? '#ff8a1f' : '#2a2f37'}"></span>`).join('');
    const strength = v.showRatings
      ? `<span style="${F_MONO};font-weight:700;font-size:18px;color:#2ee6a0">${esc(v.rosterStrengthLabel)}</span>`
      : `<span style="${F_MONO};font-weight:700;font-size:13px;letter-spacing:.1em;color:#5a626c">★ HIDDEN</span>`;
    const rerollBtn = (action, on, label) =>
      on
        ? `<button class="btn-reshuffle" data-action="${action}" style="${F_MONO};font-size:11px;letter-spacing:.06em;color:#9aa1ac;background:#1c2026;border:1px solid #2a2f37;padding:7px 10px;cursor:pointer;white-space:nowrap">${label}</button>`
        : `<span title="no other option" style="${F_MONO};font-size:11px;letter-spacing:.06em;color:#4d545d;background:#15181d;border:1px solid #1c2026;padding:7px 10px;white-space:nowrap;opacity:.6;cursor:not-allowed">${label}</span>`;

    const pendingBar = v.pendingActive
      ? `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:18px 0 11px;background:#1a1207;border:1px solid #ff8a1f;padding:11px 14px;${CLIP(8)};animation:popIn .3s ease both">
           <span style="${F_MONO};font-size:12px;letter-spacing:.04em;color:#ffce4d">PLACING <span style="${F_BARLOW};font-weight:800;font-size:20px;color:#fff;text-transform:uppercase;vertical-align:-1px">${esc(v.pendingName)}</span> &nbsp;&mdash; tap a highlighted slot &uarr;</span>
           <button data-action="cancelPick" style="${F_MONO};font-size:11px;letter-spacing:.08em;color:#9aa1ac;background:none;border:1px solid #3d2810;padding:6px 11px;cursor:pointer">CANCEL</button>
         </div>`
      : `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:18px 0 11px;${F_MONO};font-size:11px;letter-spacing:.1em;color:#8b929c"><span style="color:#ff8a1f;font-weight:700">1.</span> PICK A PLAYER <span style="color:#3a4049">&rarr;</span> <span style="color:#ff8a1f;font-weight:700">2.</span> PLACE IN A SLOT THEY PLAY</div>`;

    const drawZone = v.draftDrawShown
      ? `
        <div style="background:linear-gradient(110deg,#1a1f26,#13171d);border:1px solid #2a2f37;${CLIP(14)};padding:16px 18px;display:flex;align-items:center;gap:16px;animation:drawIn .5s ease both">
          <div style="width:62px;height:62px;flex:none;background:repeating-linear-gradient(45deg,#222831 0 7px,#1a1f27 7px 14px);border:1px solid #2f3640;display:flex;align-items:center;justify-content:center;${F_BARLOW};font-weight:800;font-size:22px;color:#5a636e;letter-spacing:.02em">${esc(v.drawMono)}</div>
          <div style="flex:1;min-width:0">
            <div style="${F_MONO};font-size:10px;letter-spacing:.22em;color:#ff8a1f">THE DRAW &nbsp;·&nbsp; ${esc(v.drawNum)}</div>
            <div style="${F_BARLOW};font-weight:800;font-size:clamp(30px,5vw,42px);text-transform:uppercase;line-height:.92;margin-top:2px;color:#fff">${esc(v.drawTeam)}</div>
            <div style="${F_MONO};font-size:12px;color:#9aa1ac;margin-top:3px">${esc(v.drawEvent)} &nbsp;·&nbsp; ${esc(v.drawYear)}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px">
            <div style="${F_MONO};font-size:11px;color:#ff8a1f;letter-spacing:.14em;font-weight:700">${esc(v.drawNum)}</div>
            <div style="display:flex;gap:6px">
              ${rerollBtn('rerollTeam', v.canRerollTeam, '&#8635; TEAM')}
              ${rerollBtn('rerollYear', v.canRerollYear, '&#8635; YEAR')}
            </div>
          </div>
        </div>
        ${pendingBar}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,158px),1fr));gap:11px">
          ${v.options.map((o) => optionHtml(o, v)).join('')}
        </div>`
      : '';

    const allFilledCard = v.allFilled
      ? `
        <div style="background:linear-gradient(160deg,#1a1f26,#0f1318);border:1px solid #2a3b46;${CLIP(16)};padding:clamp(28px,5vw,48px);text-align:center;animation:popIn .5s ease both">
          <div style="${F_MONO};font-size:11px;letter-spacing:.26em;color:#2ee6a0">ROSTER COMPLETE</div>
          <h3 style="${F_BARLOW};font-weight:800;font-size:clamp(34px,6vw,54px);text-transform:uppercase;margin:10px 0 6px;line-height:.92">Five legends.<br>One shot at <span style="color:#ff8a1f">12&ndash;0</span>.</h3>
          <p style="color:#9aa1ac;font-size:14px;max-width:380px;margin:0 auto 26px">Your draft is locked. Every pick shifts the odds. Time to find out if this roster can run the table.</p>
          <button class="btn-primary" data-action="run" style="${F_BARLOW};font-weight:800;font-size:25px;letter-spacing:.06em;text-transform:uppercase;color:#160b02;background:linear-gradient(180deg,#ffa63d,#f07d12);border:none;padding:18px 46px;cursor:pointer;${CLIP(11)};animation:glowPulse 2.6s ease-in-out infinite">Run the Major &nbsp;&rarr;</button>
        </div>`
      : '';

    return `
<div data-screen-label="Draft" style="max-width:1240px;margin:0 auto;padding:clamp(16px,3vw,32px) clamp(14px,3vw,36px)">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="${F_BARLOW};font-weight:800;font-size:26px;letter-spacing:.04em;color:#fff">12<span style="color:#ff8a1f">&ndash;</span>0</div>
      <span style="${F_MONO};font-size:11px;letter-spacing:.16em;color:#8b929c;border:1px solid #2a2f37;padding:5px 9px">${esc(v.setupName)}</span>
      ${v.memoryOn ? `<span style="${F_MONO};font-size:10px;letter-spacing:.14em;color:#0b0d10;background:#46a7f0;padding:5px 8px">★ MEMORY</span>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <span style="${F_MONO};font-size:12px;letter-spacing:.16em;color:#ff8a1f;font-weight:700">${esc(v.progressText)}</span>
      <div style="display:flex;gap:5px">${dots}</div>
    </div>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start">
    <div style="flex:1 1 280px;max-width:340px;min-width:240px">
      <div style="${F_MONO};font-size:11px;letter-spacing:.22em;color:#6b727c;margin-bottom:10px">ROSTER BOARD</div>
      <div style="display:flex;flex-wrap:wrap;gap:9px">
        ${v.rosterSlots.map((s) => rosterSlotHtml(s, v)).join('')}
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;border-top:1px solid #1c2026;padding-top:12px">
        <span style="${F_MONO};font-size:11px;letter-spacing:.16em;color:#6b727c">PROJECTED STRENGTH</span>
        ${strength}
      </div>
    </div>
    <div style="flex:2 1 440px;min-width:300px">
      ${drawZone}
      ${allFilledCard}
    </div>
  </div>
</div>`;
  }

  // ========================= SIMULATION =================================
  function matchHtml(m) {
    const anim = m.isLast ? 'animation:matchIn .42s ease both' : '';
    const stampAnim = m.isLast ? 'animation:stampIn .45s ease both' : '';
    if (m.win) {
      return `
      <div style="display:flex;align-items:stretch;gap:0;border:1px solid #1c3a30;background:linear-gradient(100deg,#101a16,#0e1316);${CLIP(10)};overflow:hidden;${anim}">
        <div style="width:54px;flex:none;background:#143026;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <span style="${F_BARLOW};font-weight:800;font-size:34px;color:#2ee6a0;line-height:.9;${stampAnim}">W</span>
        </div>
        <div style="flex:1;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0">
          <div style="min-width:0"><div style="${F_MONO};font-size:9.5px;letter-spacing:.14em;color:#5f8a78">${esc(m.phase)} · ${esc(m.bo)}</div><div style="${F_BARLOW};font-weight:700;font-size:23px;text-transform:uppercase;line-height:1;margin-top:2px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">vs ${esc(m.opp)}</div></div>
          <div style="${F_MONO};font-weight:700;font-size:21px;color:#2ee6a0;white-space:nowrap">${esc(m.score)}</div>
        </div>
      </div>`;
    }
    return `
      <div style="display:flex;align-items:stretch;gap:0;border:1px solid #3a1c1c;background:linear-gradient(100deg,#1a1011,#160e10);${CLIP(10)};overflow:hidden;${anim}">
        <div style="width:54px;flex:none;background:#3a1414;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <span style="${F_BARLOW};font-weight:800;font-size:34px;color:#ff4d4d;line-height:.9;${stampAnim}">L</span>
        </div>
        <div style="flex:1;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0">
          <div style="min-width:0"><div style="${F_MONO};font-size:9.5px;letter-spacing:.14em;color:#8a5f5f">${esc(m.phase)} · ${esc(m.bo)}</div><div style="${F_BARLOW};font-weight:700;font-size:23px;text-transform:uppercase;line-height:1;margin-top:2px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">vs ${esc(m.opp)}</div></div>
          <div style="${F_MONO};font-weight:700;font-size:21px;color:#ff4d4d;white-space:nowrap">${esc(m.score)}</div>
        </div>
      </div>`;
  }

  function renderSim(v) {
    const pendingLoader = v.simPending
      ? `<div style="display:flex;align-items:center;gap:12px;border:1px dashed #262b33;padding:16px 16px;${CLIP(10)}">
           <div style="display:flex;gap:5px"><span style="width:8px;height:8px;background:#ff8a1f;border-radius:50%;animation:pulseDot 1s infinite"></span><span style="width:8px;height:8px;background:#ff8a1f;border-radius:50%;animation:pulseDot 1s .2s infinite"></span><span style="width:8px;height:8px;background:#ff8a1f;border-radius:50%;animation:pulseDot 1s .4s infinite"></span></div>
           <span style="${F_MONO};font-size:12px;letter-spacing:.16em;color:#9aa1ac">${esc(v.pendingLabel)}</span>
         </div>`
      : '';
    const skipBtn = v.simPending
      ? `<button data-action="skip" style="${F_MONO};font-size:11px;letter-spacing:.12em;color:#9aa1ac;background:none;border:1px solid #2a2f37;padding:7px 12px;cursor:pointer">SKIP &raquo;</button>`
      : '';
    const doneBtn = v.simDone
      ? `<div style="display:flex;justify-content:center;margin-top:24px;animation:fadeUp .5s ease both">
           <button class="btn-primary" data-action="result" style="${F_BARLOW};font-weight:800;font-size:23px;letter-spacing:.06em;text-transform:uppercase;color:#160b02;background:linear-gradient(180deg,#ffa63d,#f07d12);border:none;padding:16px 42px;cursor:pointer;${CLIP(10)}">See result &nbsp;&rarr;</button>
         </div>`
      : '';

    return `
<div data-screen-label="Simulation" style="max-width:720px;margin:0 auto;padding:clamp(18px,4vw,40px) clamp(16px,4vw,32px)">
  <div style="position:sticky;top:0;z-index:5;background:linear-gradient(180deg,#0b0d10 70%,transparent);padding-bottom:14px;margin-bottom:8px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div style="${F_MONO};font-size:11px;letter-spacing:.22em;color:#6b727c">THE MAJOR RUN</div>
      <div style="display:flex;align-items:center;gap:14px">
        <div style="display:flex;align-items:baseline;gap:6px"><span style="${F_BARLOW};font-weight:800;font-size:40px;color:#2ee6a0;line-height:1">${v.liveWins}</span><span style="${F_BARLOW};font-weight:800;font-size:28px;color:#3a4049">&ndash;</span><span style="${F_BARLOW};font-weight:800;font-size:40px;color:#ff4d4d;line-height:1">${v.liveLosses}</span></div>
        ${skipBtn}
      </div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:11px">
    ${v.revealed.map(matchHtml).join('')}
    ${pendingLoader}
  </div>
  ${doneBtn}
</div>`;
  }

  // ============================ RESULT ==================================
  function renderResult(v) {
    const r = v.result;
    const goldLabel = r.perfect ? '★ FLAWLESS ★' : '★ MAJOR CHAMPION ★';
    const hero = r.champion
      ? `
      <div style="position:relative;text-align:center;background:linear-gradient(180deg,#1c1407,#0f0c07);border:1px solid #5a3d12;${CLIP(18)};padding:clamp(26px,5vw,44px) clamp(18px,4vw,32px);overflow:hidden;animation:popIn .6s ease both">
        <div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(60% 50% at 50% 0%,rgba(255,138,31,.22),transparent)"></div>
        <div style="position:relative">
          <div style="${F_MONO};font-size:12px;letter-spacing:.3em;color:#ffce4d">${goldLabel}</div>
          <div style="${F_BARLOW};font-weight:800;font-size:clamp(96px,22vw,168px);line-height:.78;color:#ff8a1f;text-shadow:0 0 50px rgba(255,138,31,.5);margin:10px 0 0">${esc(r.record)}</div>
          <div style="${F_BARLOW};font-weight:800;font-size:clamp(28px,6vw,44px);text-transform:uppercase;color:#fff;letter-spacing:.02em;line-height:1">${esc(r.title)}</div>
          <div style="${F_MONO};font-size:13px;color:#c9b27a;margin-top:8px">${esc(r.sub)}</div>
        </div>
      </div>`
      : `
      <div style="text-align:center;background:linear-gradient(180deg,#15181d,#0f1216);border:1px solid #2a2f37;${CLIP(18)};padding:clamp(26px,5vw,44px) clamp(18px,4vw,32px);animation:popIn .6s ease both">
        <div style="${F_MONO};font-size:12px;letter-spacing:.3em;color:#ff4d4d">RUN ENDED</div>
        <div style="${F_BARLOW};font-weight:800;font-size:clamp(90px,20vw,150px);line-height:.8;color:#e9ebee;margin:8px 0 0">${esc(r.record)}</div>
        <div style="${F_BARLOW};font-weight:800;font-size:clamp(26px,5vw,40px);text-transform:uppercase;color:#ff8a1f;letter-spacing:.02em;line-height:1">${esc(r.title)}</div>
        <div style="${F_MONO};font-size:13px;color:#9aa1ac;margin-top:8px">${esc(r.sub)}</div>
      </div>`;

    const roster = v.resultRoster.map((p) => `
      <div style="display:flex;align-items:center;gap:12px;background:#13171d;border:1px solid #2a2f37;${CLIP(8)};padding:9px 13px;animation:fadeUp .4s ease both">
        <span style="${F_MONO};font-weight:700;font-size:9px;color:#ff8a1f;background:#2a1c0c;width:38px;text-align:center;padding:5px 0;letter-spacing:.04em">${esc(p.code)}</span>
        <div style="width:34px;height:34px;flex:none;background:repeating-linear-gradient(135deg,#1c222a 0 6px,#171c23 6px 12px);display:flex;align-items:center;justify-content:center;${F_BARLOW};font-weight:800;font-size:20px;color:#39424d">${esc(p.initial)}</div>
        <div style="flex:1;min-width:0"><div style="${F_BARLOW};font-weight:700;font-size:21px;text-transform:uppercase;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div><div style="${F_MONO};font-size:10px;color:#717983;margin-top:3px">${esc(p.team)}</div></div>
        <div style="${F_MONO};font-weight:700;font-size:18px;color:#46a7f0">${esc(p.rating)}</div>
      </div>`).join('');

    const shareBtn = v.shared
      ? `<button style="flex:1 1 180px;${F_BARLOW};font-weight:800;font-size:21px;letter-spacing:.05em;text-transform:uppercase;color:#0b0d10;background:#2ee6a0;border:none;padding:15px 24px;cursor:pointer;${CLIP(10)}">✓ Copied to clipboard</button>`
      : `<button class="btn-primary" data-action="share" style="flex:1 1 180px;${F_BARLOW};font-weight:800;font-size:21px;letter-spacing:.05em;text-transform:uppercase;color:#160b02;background:linear-gradient(180deg,#ffa63d,#f07d12);border:none;padding:15px 24px;cursor:pointer;${CLIP(10)}">Share result</button>`;

    return `
<div data-screen-label="Result" style="max-width:640px;margin:0 auto;padding:clamp(18px,4vw,44px) clamp(16px,4vw,32px)">
  ${hero}
  <div style="${F_MONO};font-size:11px;letter-spacing:.22em;color:#6b727c;margin:26px 0 12px">YOUR ROSTER · ${esc(v.setupName)}</div>
  <div style="display:flex;flex-direction:column;gap:8px">${roster}</div>
  <div style="display:flex;flex-wrap:wrap;gap:11px;margin-top:22px">
    ${shareBtn}
    <button class="btn-secondary" data-action="playAgain" style="flex:1 1 180px;${F_BARLOW};font-weight:800;font-size:21px;letter-spacing:.05em;text-transform:uppercase;color:#e9ebee;background:#1c2026;border:1px solid #2a2f37;padding:15px 24px;cursor:pointer;${CLIP(10)}">Play again</button>
  </div>
</div>`;
  }

  // ---- top-level dispatch ------------------------------------------------
  function render(state) {
    const v = computeView(state);
    if (v.isHome) return renderHome(v);
    if (v.isSetup) return renderSetup(v);
    if (v.isDraft) return renderDraft(v);
    if (v.isSim) return renderSim(v);
    if (v.isResult) return renderResult(v);
    return '';
  }

  return { render, computeView };
})();
