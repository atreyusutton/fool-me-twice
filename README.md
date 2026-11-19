# Motif

Motif is an AI chess coach that remembers. It reviews one of your Chess.com games in the light of your recent games, and tells you which of your mistakes keep coming back.

It is my take-home project (Option B) for the Chess.com engineering internship. The way it was built is part of the hand-in: see [How this was built](#how-this-was-built), `transcripts/` and `docs/`.

## Run it

You need Node 22 or newer.

```bash
npm install && npm run dev
```

Open the address it prints (usually `http://localhost:5173`).

- **Without an API key:** click **See the demo**. It plays back 25 real games of one public player with the engine's results and the coach's checked replies, recorded to a file. Nothing is fetched or computed. You can also enter any Chess.com username: the engine runs in your browser, the themes and reviews work, and the coach's sentences are built by code instead of a language model.
- **With an API key:** copy `.dev.vars.example` to `.dev.vars`, put your Anthropic API key in it, and restart. Now the coach's sentences are written by Claude and checked before you see them. `.dev.vars` is git-ignored.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | 93 tests: the pattern detectors on known positions, the validator against hand-written bad replies, the fetch layer, the fact table with the real engine, and the recorded demo |
| `npm run eval` | Checks the recorded coach replies and attacks the validator with broken replies. No key needed. Output below |
| `npm run record-demo` | Re-records the demo (needs a key) |
| `npm run deploy` | Builds and deploys to Cloudflare Workers |

## How it stays truthful

A chess coach that invents a move loses your trust the first time. So the rule here is **engine truth**: the chess engine and the game record are the only sources of chess facts. The language model explains; it never decides. Five layers enforce that.

1. **The engine decides.** Stockfish checks every position of every game, in your browser. Code turns the results into a *fact table*: one row per move you played, with the move, the engine's preferred move, and how many points of winning chance the move gave up.
2. **Patterns are proven by code.** "Left a piece hanging" is not something the model is asked to spot. Six patterns (piece left hanging, free material not taken, checkmate missed, checkmate allowed, mistake with the clock running out, mistake played too fast) are each a small function with tests on positions where it must fire and positions where it must not.
3. **Only what is clear, only what repeats.** A quick engine search misjudges close decisions, so the coach only talks about moves that gave up at least 25 points of winning chance, plus missed and allowed mates. A theme needs at least 3 occurrences in at least 3 different games, and always shows its count. Below that, Motif says there is not enough evidence.
4. **The model points; the screen fills in.** The model receives rows of the fact table with IDs like `F1` and themes with IDs like `T1`. It never writes a move or a number. It writes `[[played:F1]]` or `[[count:T1]]`, and the screen replaces that with the value from the table.
5. **Every reply is checked by code.** The validator rejects a reply if:
   1. it is not in the required shape;
   2. it cites a fact or theme ID that was not in the request;
   3. a placeholder does not resolve to a real value;
   4. its own words contain a digit, a number word, a square, or anything shaped like a move;
   5. it ties a moment to a theme that moment is not evidence for;
   6. it names a piece the fact row does not involve;
   7. it names a phase of the game or a result that does not match the facts.

   A rejected reply is sent back once with the reason. If the second also fails, you get text built by code from the same facts (which passes the same validator). An unchecked reply is never shown. The browser runs the check again on everything it receives or reads from its cache.

Under every piece of coach text is a line saying where it came from, and a "What this text cost" section with the token counts the API reported and any rejected reply.

## System design

```
Browser
  fetch layer   -> Chess.com public API (direct)
  engine        -> Stockfish (WebAssembly) in up to 3 Web Workers
  facts         -> fact table, pattern detectors, themes      (src/core, pure TypeScript)
  cache         -> IndexedDB
  UI            -> React

Cloudflare Worker
  static files
  POST /api/coach -> Claude API (the only reason a server exists: the key never reaches a browser)
```

- **Your games stay in your browser.** The Worker receives only the compact fact payload for the coach, and stores nothing.
- **The Worker is not a general door to the model.** It accepts only a size-limited payload in which every field is a number, a fixed choice, a chess move, a plain name or Motif's own wording. It builds the prompt itself, and limits each address to 20 requests a minute.
- **Four caches, so a second visit costs nothing:** monthly game archives (a finished month is kept for good), engine results by position, fact tables by game, coach replies by a hash of prompt version, model and request. If Chess.com is unreachable, saved games still open.
- **Analysis never blocks the page.** Games are analysed newest first, in the background; each game opens as soon as it is done. Measured on the demo player's 25 games (1,741 positions): 47 seconds with three engines, under a second on a reload.
- **Engine setting, measured not guessed.** Depth 14 and the 25-point threshold were chosen by comparing depths 12, 14 and 16 on the demo player: all 38 clear mistakes at depth 14 are also clear at depth 16. Details in `docs/DECISIONS.md`.

Code map: `src/core/` (facts, detectors, themes, coach prompt and validator; shared by the app, the Worker, the scripts and the tests), `src/app/` (session, cache, engine workers), `src/ui/` (screens), `worker/` (the one route), `scripts/` (demo recorder, eval), `tests/`.

## Context and prompting strategy

- **Context engineering.** The model sees a compact profile (rating band, themes with counts) and the key fact rows for one game: at most six rows. It never sees a raw game file. A game with no key moments is not sent at all.
- **Prompt layout for caching.** Every request is laid out stable-first: (1) instructions, identical for everyone; (2) the player's profile, identical for every game of that player; (3) the one game. Cache breakpoints sit after 1 and 2. In the recording below, about 4,000 tokens per request were read from the cache and a few hundred were new.
- **One file, one version.** Every word the model is given is in `src/core/coach/prompt.ts` with a version string. The version is part of the reply cache key, so changing the prompt never serves a stale reply.
- **Structured output.** The API guarantees the reply's shape (one schema for both request types, so the cached prefix never changes); the validator checks its content.
- **The prompt was tuned on measured rejections,** not by feel. Three versions were run on the same 20 requests: 55%, 60% and 80% passed first time. The fixes were tokens for the numbers the model kept wanting to write, and repeating the two most-broken rules at the end of each request. The validator was not loosened to raise the number.
- **Model:** `claude-sonnet-5-5`, low effort. The task is wording, not problem solving.

## Eval results

Output of `npm run eval`, exactly as printed:

```
Motif eval
==========
Recording: antwacky, 25 rapid games, recorded 2026-11-19
Model: claude-sonnet-5-5 · prompt 2026-11-19.6 · engine sf19-lite-single/d14/h16

1. Recorded coach replies
   Requests the app can make:        20 (1 profile summary, 19 game reviews)
   Found in the recording:           20 of 20
   Passed the validator first time:  16 of 20 (80.0%)
   Passed after one retry:           3 of 20 (15.0%)
   Replaced by code-built text:      1 of 20 (5.0%)
   Replies shown that pass today:    20 of 20 (100.0%)
   Rejected attempts by rule:        rule 1 × 1, rule 4 × 1, rule 6 × 3
     - rule 6: the text for T2 names a piece; a theme summary may not name pieces
     - rule 6: the headline names a piece; pieces may only be named in the text for a fact that involves them
     - rule 6: the headline names a piece; pieces may only be named in the text for a fact that involves them
     - rule 4: the text for F2 spells out a number ("Two"); use a token instead
     - rule 1: F2 appears more than once
   Model calls: 24 · tokens: 97,704 read from cache, 0 written to cache, 12,631 new input, 10,239 output

2. Validator against deliberately broken replies
   an invented move                            19 of  19 rejected
   an invented square                          19 of  19 rejected
   castling written out                        19 of  19 rejected
   a number in digits                          19 of  19 rejected
   a count in words                            19 of  19 rejected
   an unknown fact or theme ID                 19 of  19 rejected
   a token for an unknown ID                   19 of  19 rejected
   a token for a field that does not exist     19 of  19 rejected
   a theme the moment is not evidence for      18 of  18 rejected
   a piece the fact row does not involve       19 of  19 rejected
   a piece named in the headline               19 of  19 rejected
   the wrong phase of the game                 16 of  16 rejected
   the wrong result                            18 of  18 rejected
   an extra field                              19 of  19 rejected
   a missing moment or theme                   19 of  19 rejected
   Total: 280 of 280 rejected (100.0%)

PASSED
```

"0 written to cache" is because the shared part of the prompt was still cached from the run a few minutes before; on a cold start the first request writes about 3,700 tokens to the cache once.

What this does and does not show: every reply the demo shows passes the validator, and every deliberately broken reply was rejected. It does not measure whether the coach's advice is *good*; that was judged by reading it. It is 20 requests from one player, so the rates will move between runs.

## Limitations

- **The engine search is shallow** (depth 14, small network) compared with a full analysis. That is why only clear mistakes are discussed. At depth 14, 3 of the 38 clear mistakes had a different preferred move than at depth 16: the mistake is real, the suggested alternative may not be the very best one.
- **The pattern list is short on purpose.** Many clear mistakes match no pattern. For those the coach says what the engine preferred and what it cost, and does not say why.
- **Hanging-piece detection counts the captures on one square.** It does not see a piece that is lost or saved by a tactic elsewhere on the board.
- **25 games supports common themes only.** For the demo player, the "clock running out" pattern never fired and "checkmates allowed" stayed below the minimum.
- **Tuned on one player rated about 800.** Thresholds may need to change for stronger players.
- **The validator is strict, so it rejects some harmless sentences** (a headline that says "two", a closing that says "king"). One in five replies needed its retry, and one in twenty fell back to code-built text.
- **The validator cannot check everything.** It blocks invented moves, numbers, pieces, phases and results. It cannot prove that a general sentence of advice is wise.
- **Not checked in a browser:** the closed-account screen (covered by a test only), Safari and Firefox, and a real phone (only a phone-sized window).
- **The deployed rate limit and the Worker secret** were not load-tested.

## What comes next

- **Puzzles from your own blunders.** Practice positions from your own games for the theme the coach found. The engine's move is the answer, so nothing is invented.
- **Scout an opponent.** Study one opponent's games and prepare for their style. My reason: I have never beaten my dad, who is rated about 1500, and I want to.
- **A level ladder.** Run it on stronger players, with their permission, and re-tune.

The full list is in `docs/IDEAS.md`.

## How this was built

I planned this with Claude Code, an AI coding agent, and it wrote the code from a written specification (`docs/SPEC.md`) and a short list of rules (`CLAUDE.md`). My part was the idea, the rules and the decisions. The same story, in more detail, is in the app under **How this was built**.

- `transcripts/`: both working sessions, readable. Session 01 is the brainstorm and planning; session 02 is the build.
- `docs/DECISIONS.md`: every choice that changed or was made during the build, with what was given up.
- `docs/TIMELOG.md`: the time log.
- `docs/STORY.md`, `docs/IDEAS.md`: the story notes and the ideas for later.

### Time

From `docs/TIMELOG.md`. The planning time is my estimate; the build times were logged by the agent as it worked.

| Minutes | What |
|---|---|
| 60 | Planning with Claude Code before the repo existed: reading the assignment, brainstorm, checking the API, choosing the demo player, writing the spec and kickoff prompt (transcript: session 01) |
| 15 | Session 02: reading the repo, pre-build questions, key and branch setup |
| 10 | Step 1: scaffold (Vite, React, Worker, tests, lint), checked in a browser |
| 15 | Step 2: Chess.com fetch layer, archive cache, no-engine profile, tests |
| 25 | Steps 3 and 4: engine wrapper, fact table, detectors, profile, tests; measuring depth 12, 14 and 16 on the demo player and tuning |
| 25 | Step 5: game review screen (board, move list, winning-chance chart, key moments with code-built text), browser checks on desktop and phone widths, parallel engines |
| 40 | Step 6: coach prompt, validator and tests, Worker route, reply cache, cost disclosure, live checks in the browser |
| 35 | Step 7: demo recorder, recorded demo playback, eval command, three measured prompt versions, browser check of all 25 demo games |
| 30 | Step 8: "How this was built" page, README, licence |
| 25 | Step 9: browser checks of error states, dark theme and phone layout; fix so saved games open when Chess.com is unreachable |
| 10 | Clean-clone check, deploy to Cloudflare, push to GitHub |
| **290** | **Total: 4 h 50 min** |

The guideline was four hours. I treated it as a guide to scope, and this is the real time.

## Licences and credits

- Motif is free software under the GPL-3.0 (`LICENSE`), because it includes Stockfish.
- Chess engine: [Stockfish](https://stockfishchess.org/) via the `stockfish` npm package, GPL-3.0.
- Piece images: the cburnett set by Colin M.L. Burnett, GPLv2+, from the Lichess repository.
- Winning-chance formula: the one Lichess publishes.
- Game data: Chess.com's public API. Motif is not affiliated with Chess.com, and does not use its interface, colours or move-quality names.
