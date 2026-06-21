# 12-0 — CS2 Fantasy Major

A free, single-player browser game in the spirit of **7a0 (Sete a Zero)**, but for
Counter-Strike 2. Draft a dream roster of CS legends and try to win a CS2 Major
completely undefeated — a perfect **12-0** run (three Swiss stages + three
playoff rounds = twelve wins, zero losses).

No login, no multiplayer, no build step. Plain HTML/CSS/JS.

## Run it

Open `index.html` in a browser — that's it. (Or serve the folder for clean
relative paths and working clipboard:)

```sh
cd 12-0
python3 -m http.server 8000
# then open http://localhost:8000
```

## How to play

1. **Pick a setup** — one of four team shapes (Standard, Double AWP, Firepower,
   Rifle-heavy). Each locks five role slots.
2. **Draft 5 legends** — each draw reveals a real historic squad (team + event +
   year). Pick one eligible player and place them in a role they play.
3. **Run the Major** — three Swiss stages (advance at 3 wins, out at 3 losses)
   then single-elimination playoffs (QF / SF / Final). Win it all without
   dropping a map for a perfect **12-0**.

There's also a **Memory mode** toggle on the setup screen that hides ratings, so
you draft from memory.

## Architecture

The UI and game logic were designed in Claude Design (`12-0.dc.html`) and ported
here to a standalone app — same visuals, same rules, no design-runtime
dependency.

| File | Responsibility |
|------|----------------|
| `index.html`      | Shell: fonts, styles, script order. |
| `src/styles.css`  | Base, keyframes, hover states. |
| `src/data.js`     | Catalog: setups, squads, Major phases, opponents. Pure data. |
| `src/engine.js`   | Game rules: eligibility, drafting, strength, simulation, sharing. Pure logic, no DOM. |
| `src/view.js`     | `computeView(state)` + screen renderers (returns HTML strings). |
| `src/app.js`      | State, actions, and event delegation (`data-action`). Re-renders on change. |

Data flows one way: `state → computeView → HTML`. Clicks hit a single delegated
listener that dispatches on `data-action`, mutates state via `setState`, and
re-renders.

## Test

A dependency-free headless test loads the scripts into a `vm` sandbox with a DOM
stub and drives the real click handler through full playthroughs (every setup,
many times) plus engine invariants:

```sh
node test/smoke.test.js
```

## Roadmap / ideas

- Player photos and team logos (currently stylized placeholders).
- Bigger squad catalog (the design ships 15 squads as a starting set).
- Persist run history / achievements (local only).
- Multiplayer / shared seeds (explicitly out of scope for this first version).
