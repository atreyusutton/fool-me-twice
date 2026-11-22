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

## Step 7: recorded demo and eval (session 02)

- **The demo is one file**, `public/demo/recording.json` (about 870 KB): 25 analysed games as Chess.com returned them, summaries of 75 older games for the record, 1,636 engine results, 25 fact tables and 20 coach replies with every raw attempt and token count. The app plays it back through the same code paths as a live visit, with the recording layered over an in-memory cache. Checked in a browser: no request to the Worker, Chess.com or the engine.
- **The demo is fixed at 25 games** and never starts an engine. "Analyse more" is hidden there. Given up: extending the demo.
- **Games with no key moments do not call the model.** Code writes the one-line note. Why: nothing to explain, so nothing to pay for or get wrong. Applies live too.
- **`npm run eval` needs no key.** It re-checks every recorded reply and raw attempt with today's validator, reports first-pass, retry and fallback rates, then breaks each passing reply in 15 known ways and requires every broken version to be rejected. `npm test` also fails if the recording falls behind the prompt or facts version.
- **Three prompt versions were measured on the same 20 requests.** First-pass rate 55% (version .4), 60% (.5: added `[[time:F1]]` and `[[mistakes:G1]]` tokens and a checklist), 80% (.6: the two most-broken rules repeated at the end of each request). Rejections were almost all number words in headlines and piece names in headlines or closings. The piece rule was kept strict rather than loosened to raise the rate: a headline has no single fact row to check a piece against. Small sample, one player; the numbers will move between runs.

## Steps 8 and 9, deploy (session 02)

- **Player lookup, ratings and the month list are kept on the device.** Found in a browser check: with Chess.com unreachable, saved games did not open although the error message said they would. Now they do, with a notice.
- **README and "How this was built" do not say the user checked the result.** `docs/STORY.md` marked that sentence and the final hours as needing confirmation; the build ran without a pause, so both pages state only what the records show. To be confirmed by Atreyu.
- **Deployed as the Worker `motif`** at https://motif.atreyusutton.workers.dev, with the API key as a Worker secret. Checked in a browser after deploy: the demo (no outside requests) and one live run with the coach. Trade-off: the address is public, so anyone who finds it can spend the key through the coach route, limited to 20 requests a minute per address and to Motif's own fact payloads. Remove the secret (`npx wrangler secret delete ANTHROPIC_API_KEY --name motif`) to turn the live coach off; the demo and code-built text keep working.
- **Development tools kept in `scripts/`:** `tune.ts`, `measure-engine.ts`, `try-coach.ts`. They are how the measured settings were produced.

# Version 2: Fool Me Twice (session 03, 22 November 2026)

## Before the rebuild

- **Renamed to Fool Me Twice.** "Motif" was abstract, an art word before a chess word, and in chess means the tactical motif the model is not allowed to name. Two naming rounds (one by a separate agent) produced Takeback, Hindsight and others; Atreyu chose Fool Me Twice from a "funnier" round because it states the thesis: the coach remembers, so the repeat gets caught. A quick search found no chess product with the name; not a trademark check. The repo and Worker are renamed at the end.
- **Coaches are book characters, not real people.** Atreyu first asked for coaches modelled on well-known chess personalities. The agent raised that Chess.com's permission could not cover those individuals' names and personas on a public site. Atreyu chose out-of-copyright characters instead: Sherlock Holmes, Winnie-the-Pooh, Captain Hook, Count Dracula. Given up: the pull of famous chess names. Gained: no permission question, and a cast with its own look.
- **Winnie-the-Pooh is the one with risk.** The 1926 book is out of copyright in the United States; Disney holds trademarks and the red-shirt design. He is drawn from the book (no shirt) and credited to A. A. Milne. Atreyu accepted the risk after it was raised twice. Not legal advice.
- **No voice.** Atreyu dropped the speech buttons deliberately, in favour of animated figures with speech bubbles.
- **Blundy McBlunderpants** is the opening-drill opponent, not a coach: a bot that plays likely moves, not perfect ones.
- **A second source of truth: sourced text.** Opening ideas cannot be proven by the engine, and the model is not allowed to write theory from memory. They are quoted as written from Wikibooks, with source and licence. Book lines come from the Lichess openings dataset (CC0).
- **The Lichess opening explorer is not used.** It now refuses requests without a login (checked: HTTP 401). "Likely replies" come from the player's own opponents first, then from how many named lines follow each move. Given up: population statistics by rating.
- **The application repo is described, not shown.** The Process tab tells the two-repo story from `docs/STORY.md` only.
- **Transcripts as a messaging app,** with an AI-written summary first and the whole conversation on request. Summaries are written once at build time, labelled as AI-written, and Atreyu's messages in them are real quotes.
- **Time is logged as a separate version 2 block.** Version 1 stays at 4 h 50 min.
- **The build runs without a pause,** at Atreyu's request; the planned design checkpoint became a progress note.

## During the rebuild

- **One highlighter, no brand colour.** Paper background, ink, and a single yellow used the way a marker is used: on the word that matters and on the one main action. Orange (your move) and blue (the engine's move) are kept only for chess facts, so colour always means something.
- **The coach is part of the cache key.** The chosen character is a field of the request, so each coach's words are stored and recorded separately and the Worker refuses an unknown coach. Cost: the recorded demo holds four sets of replies (76 instead of 20).
- **The character block sits between the shared instructions and the profile.** Four fixed blocks, each cached once and shared by every player who picks that coach. Given up: a single cached prefix for everyone.
- **Two new checker rules, from a real failure.** A live reply passed with the one-letter item "x". Now a text must be at least 20 characters after tokens are removed, and a moment's text must cite its own fact. They run last, so a more specific rule is reported first.
- **Expressions are chosen by code.** A loss of 40 points or more makes the figure wince, 25 or more makes it think, a strength pleases it. The model has no field for it.
- **Practice and drill lines are fixed text, not model output.** What the coaches and Blundy say there was written for the app and holds no chess facts; moves and numbers are put in by code. Why: right or wrong must be instant, free and impossible to get wrong. Given up: variety. This replaces the plan's "one validated framing line" on the opening guide, which would have needed a third request kind and another full re-recording for one sentence.
- **A practice answer is accepted within 8 points of the engine's move.** Clear mistakes start at 25, so a near-equal second move counts and a real slip does not. With no engine, only the engine's own move is accepted and the screen says so.
- **The demo may start an engine for practice only.** Reviews in the demo are still played back from the file. Checking a new answer cannot be recorded in advance.
- **Book moves are replayed with the rules library when the data is built,** so every line in `public/openings/book.json` is known to be legal and written the same way as the game records.
- **"In the book" is never called "best".** The guide says leaving the book is not a mistake in itself; mistakes are the engine's call. The drill says the same.
- **The drill starts from the position that defines the opening.** Found in the first browser run: the dataset files some transpositions under a family (the English Opening reached from a king's pawn start), so starting from move one offered the wrong first move.
- **Opening ideas are quoted for the families Wikibooks has a page for.** The rest say plainly that there is no sourced text. Given up: coverage.
- **Session summaries are written once, by AI, and say so.** They live in one data file. The user's messages in them are quotes, and a test checks each quote against the transcript; the agent's side is summarised. Given up: a fully human-written account. The whole transcript is one click away for that reason.
- **The truth page reads its numbers from a file the eval command writes.** Nothing on that page is typed by hand, so it cannot drift from what `npm run eval` prints.
- **The "try to break it" box runs the real checker in the browser,** on a real recorded reply. It is the same function the Worker runs, not a demonstration copy.
- **The opening framing line from the model was dropped.** The plan had the coach add one validated sentence to each opening guide. The guide now uses fixed text per coach with facts put in by code, the same as practice. Why: the guide already quotes a source, and a third voice on that screen blurred which words came from where.
- **Version 2 is a new Worker, not a replacement.** `fool-me-twice` was deployed beside `motif`, so a link to version 1 that someone already has keeps working. It has its own rate-limit namespace and, for now, no API key: the demo is complete without one, and a live username gets code-built text until the key has been rotated.
- **One navigation bar on every page.** Home, You, Review, Practice, Openings, Process. Before, Home and Process showed a shorter set, so a reviewer who started on Process never saw that Practice and Openings exist. From Home and Process the four coaching tabs open the last player loaded on this device, or the demo player, and a small label says which. A player is remembered only once their games have loaded, so a mistyped name is not. On a phone the bottom bar keeps five tabs and the logo is Home. Given up: a tab that says "Demo" in plain words.
- **The six-tab bar was tried and taken back.** With all six tabs on Home and Process the bar was busier and four of the tabs pointed at a player nobody had chosen. Back to two sets: Home, one player tab and Process outside a player; the four coaching tabs inside one. Two things were kept from the attempt: Home is now a tab inside a player too (desktop; the logo on a phone), and the player tab is named for where it goes ("Demo", or the last username loaded).
