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
