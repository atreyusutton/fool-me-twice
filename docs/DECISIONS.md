# Decisions

Short entries: what was decided, why, what was given up. Newest last. The starting decisions are explained in `docs/SPEC.md` and `docs/STORY.md`; record changes and new trade-offs here.

## 2026-11-19: starting decisions (planning session 01)

- **Build the coach that remembers; log the other ideas.** Gave up: puzzles and opponent scouting in this version.
- **Engine in the browser.** Why: nothing to install or host. Gave up: analysis speed and depth.
- **The model cites fact IDs and never writes a move.** Why: engine truth by construction. Gave up: some freedom in the coach's wording.
- **Patterns only from code-proven detectors.** Why: models misname tactics. Gave up: a richer vocabulary of themes.
- **TypeScript, not Chess.com's backend stack.** Why: a clean build in a known, listed language. Gave up: showing range in PHP, Go or Java.
- **Demo player `Antwacky`, recorded.** Why: about 800 rated, so the chess can be checked by eye, with plenty of games; runs with no key. Open: a public account's games are shown without the owner being asked; revisit before the project page goes public.
- **25 games for engine themes, 100 for no-engine statistics.** Why: engine time in a browser. Gave up: confidence in rarer themes.
- **Four hours treated as a guideline.** Why: quality first. Actual time is in `TIMELOG.md`.

## 2026-11-19: before the build (session 02)

- **Demo player stays `Antwacky`, shown by username.** Confirmed by Atreyu. The open point above stands: revisit before the project page goes public.
- **Repository `motif-chess-coach` on GitHub, private until hand-in.** Why: it holds the planning transcripts. Gave up: nothing; it can be made public later.
- **Deployed as a Cloudflare Worker named `motif` on its workers.dev address.** Why: it does not touch the personal site's routing. Gave up: a custom domain for now.
- **Planning time recorded as about 60 minutes.** Atreyu's estimate, not measured.
- **The agent wrote the API key to `.dev.vars`.** The kickoff prompt said Atreyu would; they pasted it into the chat instead. The key is git-ignored and removed from the transcript.

## 2026-11-19: build, steps 1 and 2 (session 02)

- **Engine build: Stockfish 19, "lite single-threaded" from the `stockfish` npm package (GPL-3.0).** Why: 1.8 MB instead of 96 MB, no special page headers, and its README recommends it for this use. Gave up: the full network's strength. The files are copied from `node_modules` into `public/engine/` by a script, not committed.
- **Current month re-checked with the browser's own conditional request, not a hand-written `If-None-Match` header.** The spec asked for the header. Why changed: a custom request header makes the browser send a preflight request first, which the API's edge did not answer cleanly in testing; `fetch(url, { cache: "no-cache" })` makes the browser send the same ETag check itself with no preflight. Gave up: Motif cannot tell a "not modified" answer from a fresh one, so it re-parses the month either way (cheap).
- **Piece images: the "cburnett" set by Colin M.L. Burnett (GPLv2+), copied from the Lichess repository.** Why: free, legible, and compatible with this project's GPL-3.0 licence. The board colours and everything else are Motif's own.
- **Win/draw/loss charts use blue and orange around a neutral grey, never colour alone.** Why: the pair stays distinct for colour-blind readers, and the numbers are always written beside the bar.

## 2026-11-19: build, steps 3 and 4: engine setting and detectors, measured (session 02)

Measured on the demo player's latest 25 rapid games (1,741 positions), same engine build in Node as in the browser.

| Depth | Engine time, 25 games | Per position |
|---|---|---|
| 12 | 35 s | about 20 ms |
| 14 | 118 s while another run shared the CPU | about 70 ms |
| 16 | 379 s | about 220 ms |

- **Depth 14, not the starting value of 12.** Depth 16 was used as the reference. At depth 12 with a 20-point threshold, 46 of 49 "clear" mistakes were also clear at depth 16 (94%). At depth 14 with a 25-point threshold, all 38 were (100%), and the engine's preferred move was the same in 35 of them. Depth 16 costs about three times as long for no change in that set. Gave up: speed (depth 12 is about three times faster).
- **Clear-mistake threshold 25 points of winning chance, not 20.** Why: at 20, three rows in 53 were not clear at depth 16; at 25, none. Gave up: about 15 borderline mistakes across 25 games that the coach now stays quiet about.
- **Known limit, kept:** in 3 of the 38 clear mistakes the preferred move differs between depth 14 and depth 16. The mistake is real in both; the suggested alternative is the depth-14 one. Stated in the README.
- **The engine's memory is cleared before every position** (`ucinewgame`). Why: the answer then depends only on the position, so a result cached by position is exactly what a fresh search would give. Checked: re-analysing a game in reverse order gave identical results for all positions. Gave up: some speed from reusing earlier search work.
- **Positions are cached without their move counters** and searched with fresh counters. Why: two games reaching the same position share one result. Gave up: the engine does not see the fifty-move count or earlier repetitions.
- **Detector refinements after stepping through the games:**
  - `missed_capture` and the strength `took_free_piece` ignore taking back on the square where the opponent just captured. Before this, completing an ordinary trade counted as "free material" (44 times in 25 games; now 18).
  - A chance that stays on the board is counted once: a rook left hanging for five moves was five `missed_capture` rows and is now one; consecutive `missed_mate` rows count once; a mating sequence counts as one `found_mate`.
  - `hung_piece` needs the opponent's best reply to win at least 2 pawns' worth by static exchange (a rook for a knight counts; a bishop for a knight does not).
  - `time_trouble` and `rushed` use the clock before the move, allowing for the increment.
- **Two strengths added on the same terms as the weaknesses:** `found_mate` and `took_free_piece`, each the mirror of a weakness, so the profile can say what is going well with the same proof.
- **Result on the demo player (25 games):** 38 clear mistakes; rushed 7 times in 6 games, pieces left hanging 6 in 5, checkmates missed 5 in 4, free material not taken 3 in 3, checkmates allowed 2 in 2 (below the minimum, so not a theme). `time_trouble` never fired: this player finishes ten-minute games with over five minutes left on average.

## 2026-11-19: build, step 5 (session 02)

- **Up to three engines side by side, not one.** The spec asked for one instance. Measured in a headless Chrome on this machine at depth 14: 25 games took 140 s with one engine and 47 s with three. Each engine takes the next game from the queue, newest first, and all share the position cache. The count is the processor's cores minus one, capped at three. Gave up: more memory and battery use during the first analysis.
- **Code-built review text uses the same tokens and the same check as the model's text.** Why: one renderer, one validator, and the fallback is tested to always pass. The app is useful with no model at all from this step on.
- **A key moment is shown as the position before the move with two arrows** (dashed orange for the move played, solid blue for the engine's move), with the same information in words under the board, so it never depends on colour alone.

## Step 6: the coach (session 02)

- **The validator has more rules than the spec listed.** The spec's rule 4 banned digits, squares and move shapes. Added: number words ("two", "twice", "third"; only "one", "once", "first", "second" pass), because a spelled-out count is still a number the model wrote. Added rule 7: a phase of the game or a result may only be named where it matches the facts. Piece names are banned outright in headlines, closings and theme summaries, where there is no single fact row to check them against. Why: each is a way a wrong chess fact could reach the screen in words. Given up: some natural phrasing, and a higher retry rate (the first live calls were rejected for "Two" and "twice" in headlines; the prompt now says so explicitly).
- **Two more tokens than planned:** `[[move:F1]]` (move number) and `[[total:T1]]` (games analysed), so the model never needs to write those numbers. `[[loss:F1]]` renders as "N points".
- **One reply shape for both requests** (`headline`, `items`, `closing`). Why: the output format is part of the cached prefix; one shape means one cache entry for the instructions. Given up: field names that read naturally for each case; code maps them.
- **The Worker accepts only enums, moves matching a SAN pattern, names with a fixed alphabet, and Motif's own theme wording.** Why: the route must not be a general door to the model. Given up: openings whose names contain other characters are sent as "not named".
- **Structured output plus the validator, both.** The API guarantees the JSON shape; the validator checks the content. Model `claude-sonnet-5-5`, effort low, thinking left at the default (this model rejects turning it off), default sampling.
- **A refusal or a cut-off reply goes straight to code-built text**, with no retry for a refusal. Why: simpler and always truthful. Given up: a second model as a fallback.
- **Rate limit: 20 coach requests a minute per address**, using the Workers rate limit binding. It only applies when deployed.
- **The coach is asked only after the engine finishes.** Why: the profile is part of every request and its cached prefix; asking while it changes would waste calls and cache writes. Given up: coach text during analysis (code-built text shows meanwhile).
- **The browser re-checks every reply**, including cached ones, against the request it was written for, and renders tokens against that same request.
- **Measured caching** (first live calls): instructions plus profile are 3,680 to 3,896 tokens, written to the cache once; each later game review read them from the cache and paid for 294 to 544 new input tokens.
