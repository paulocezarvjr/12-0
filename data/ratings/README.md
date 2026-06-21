# Real per-event HLTV ratings — manual overlay

HLTV blocks automated fetching (403), so the collected ratings are mostly
**estimates** (`est:true`). HLTV does publish the exact **rating of every player
at every event** — paste those here and they overwrite the estimates with the
real "rating da época" (`src:"hltv"`, `est:false`).

## How to do one Major

1. On HLTV: **Stats → Events →** open the Major below → the player table shows a
   **Rating** column for that event.
2. Select that table and copy it.
3. Paste into `data/ratings/<id>.txt` (the `id` from the table below), e.g.
   `data/ratings/rio2022.txt`. Raw paste is fine — the parser takes the
   **nickname** (first token of each row) and the **last `x.xx`** number as the
   rating. Partial pastes are fine; unmatched names are reported, not fatal.
4. Apply + rebuild + test:
   ```sh
   node scripts/import-hltv-ratings.js
   node scripts/build-data.js
   node test/smoke.test.js
   ```

## Major IDs

| id | Event | Year | roster |
|----|-------|------|--------|
| dhw2013 | DreamHack Winter 2013 | 2013 | ✅ |
| kat2014 | EMS One Katowice 2014 | 2014 | ✅ |
| col2014 | ESL One Cologne 2014 | 2014 | ✅ |
| dhw2014 | DreamHack Winter 2014 | 2014 | ✅ |
| kat2015 | ESL One Katowice 2015 | 2015 | ✅ |
| col2015 | ESL One Cologne 2015 | 2015 | ✅ |
| clj2015 | DreamHack Cluj-Napoca 2015 | 2015 | ✅ |
| clm2016 | MLG Columbus 2016 | 2016 | ✅ |
| col2016 | ESL One Cologne 2016 | 2016 | ✅ |
| atl2017 | ELEAGUE Atlanta 2017 | 2017 | ✅ |
| kra2017 | PGL Kraków 2017 | 2017 | ✅ |
| bos2018 | ELEAGUE Boston 2018 | 2018 | ✅ |
| lon2018 | FACEIT London 2018 | 2018 | ✅ |
| kat2019 | IEM Katowice 2019 | 2019 | ✅ |
| ber2019 | StarLadder Berlin 2019 | 2019 | ✅ |
| sto2021 | PGL Stockholm 2021 | 2021 | ✅ |
| ant2022 | PGL Antwerp 2022 | 2022 | ✅ |
| rio2022 | IEM Rio 2022 | 2022 | ✅ |
| par2023 | BLAST.tv Paris 2023 | 2023 | ✅ |
| sha2024 | Perfect World Shanghai 2024 | 2024 | ✅ |
| cph2024 | PGL Copenhagen 2024 | 2024 | ❌ missing roster |
| aus2025 | BLAST.tv Austin 2025 | 2025 | ❌ missing roster |
| bud2025 | StarLadder Budapest 2025 | 2025 | ❌ missing roster |
| y2026 | CS2 Major(s) 2026 | 2026 | ❌ missing roster |

Ratings can be filled for any ✅ Major right now; the ❌ ones need their roster
collected first.
