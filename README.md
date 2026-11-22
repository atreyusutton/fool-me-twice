# Fool Me Twice

Fool me once, bad luck. Fool me twice? Let's look at that.

Fool Me Twice is an AI chess coach that remembers. It reads your recent Chess.com games, finds the mistakes that keep coming back, reviews a game with a coach character, and turns your own mistakes and openings into practice.

It is my take-home project (Option B) for the Chess.com engineering internship. It has two jobs: **be a good chess coach**, and **show the process behind it**. The process is in the app under **Process**, and in `transcripts/` and `docs/`.

Version 1 was called Motif. Version 2 is a rebuild of the interface and the scope on the same truthful core; the story of why is in the app and in `docs/DECISIONS.md`.

**Live:** https://fool-me-twice.atreyusutton.workers.dev (the demo needs nothing; a live username runs the engine in your browser). The coach is live there too: for any username its sentences are written by Claude and checked before you see them, limited to 20 requests a minute per address. Version 1 is still up at https://motif.atreyusutton.workers.dev.

## Run it

You need Node 22 or newer.

```bash
npm install && npm run dev
```

Open the address it prints (usually `http://localhost:5173`).

- **Without an API key:** click **See the demo**. It plays back 25 real games of one public player, with the engine's results and each of the four coaches' checked replies, from a file. Practice and the opening drill work in the demo too. You can also enter any Chess.com username: the engine runs in your browser, and the coach's text is then built by code from the facts.
- **With an API key:** copy `.dev.vars.example` to `.dev.vars`, put your Anthropic API key in it, and restart. Now the coach's sentences are written by Claude, in the voice of the coach you picked, and checked before you see them. `.dev.vars` is git-ignored.

| Command | What it does |
|---|---|
| `npm test` | 117 tests: pattern detectors on known positions, the validator against hand-written bad replies, puzzles, the opening book and drill, the fetch layer, the transcript reader, and the recorded demo for all four coaches |
| `npm run eval` | Checks every recorded coach reply and attacks the validator with broken replies. No key needed. Output below |
| `npm run record-demo` | Re-records the demo for all four coaches (needs a key) |
| `npm run build-openings` | Fetches the opening book and the quoted opening notes again |
| `npm run deploy` | Builds and deploys to Cloudflare Workers |

## The flow

The same six tabs are on every page, so you can always get back to Home and see everything. From Home and Process, the coaching tabs open the last player you loaded, or the demo player.

1. **Home.** A username or the demo, and a coach: Sherlock Holmes, Winnie-the-Pooh, Captain Hook or Count Dracula. You can change coach on any screen.
2. **You.** Your coach's read, as a short story: what to work on first, at most three things that keep coming back (each with **Show me** and **Practice this**), and what is going well. The tables are behind **See the numbers**.
3. **Review.** One game, the board beside your coach, one key moment at a time. Each moment has **Try it again**.
4. **Practice.** Your own positions at the moment it went wrong. Find the better move; the engine checks it. Missed ones come back.
5. **Openings.** For each opening you really play: where you leave the book, your first clear mistake, the ideas (quoted from a named source), and a drill against Blundy McBlunderpants, who plays likely book moves while you try to stay in the book.
6. **Process.** The story, the three working sessions as conversations (an AI-written summary first, the whole transcript on request), and how the coach is kept honest, with a real reply you can try to break.

## How it stays truthful

A chess coach that invents a move loses your trust the first time. So the rule is **engine truth**: the chess engine and the game record are the only sources of chess facts. The language model explains; it never decides.

1. **The engine decides.** Stockfish checks every position of every game, in your browser. Code turns the results into a *fact table*: one row per move you played, with the move, the engine's preferred move, and how many points of winning chance the move gave up.
2. **Patterns are proven by code.** Six mistakes (piece left hanging, free material not taken, checkmate missed, checkmate allowed, mistake with the clock running out, mistake played too fast) and two strengths are each a small function with tests on positions where it must fire and where it must not.
3. **Only what is clear, only what repeats.** The coach talks about moves that gave up at least 25 points of winning chance, plus missed and allowed mates. A theme needs at least 3 occurrences in at least 3 games and always shows its count. Below that, the coach says the evidence is thin.
4. **The model points; the screen fills in.** The model gets fact rows with IDs like `F1` and themes like `T1`. It writes `[[played:F1]]` or `[[count:T1]]`, and the screen puts in the value from the table.
5. **Every reply is checked by code.** The validator rejects a reply if:
   1. it is not in the required shape, is too short to say anything, or a moment never cites its own fact;
   2. it cites a fact or theme ID that was not in the request;
   3. a placeholder does not resolve to a real value;
   4. its own words contain a digit, a number word, a square, or anything shaped like a move;
   5. it ties a moment to a theme that moment is not evidence for;
   6. it names a piece the fact row does not involve;
   7. it names a phase of the game or a result that does not match the facts.

   A rejected reply is sent back once with the reason. If the second also fails, you get text built by code from the same facts. An unchecked reply is never shown.

What version 2 adds, and how each part stays inside the rule:

- **Coach characters change the wording only.** The character is a block in the prompt. Every line still cites fact IDs and passes the same validator. The figure's expression (wince, think, pleased) is picked by code from the fact row; the model has no say.
- **Puzzles involve no model.** They are built from clear-mistake fact rows. An answer is accepted when the engine, run in your browser, says it gives up fewer than 8 points of winning chance against the engine's own move. If no engine can start, only the engine's move counts, and the screen says so.
- **Book moves come from an open dataset,** the Lichess chess-openings list (3,865 named lines, public domain), replayed with the rules library when the data is built. A move is "book" only if a named line contains it. The app never says a book move is best.
- **Opening ideas are a second kind of truth: sourced text.** An engine cannot prove ideas, and the model is not allowed to write theory from memory. They are quoted as written from Wikibooks *Chess Opening Theory* (CC BY-SA 4.0), with the page and licence beside them. Where the source has no page, the app says it has nothing.
- **What coaches and Blundy say in practice and the drill is fixed text** written for the app, with the moves and numbers put in by code. Where right or wrong must be instant and certain, the model is not called.

## System design

```
Browser
  fetch layer   -> Chess.com public API (direct)
  engine        -> Stockfish (WebAssembly) in Web Workers: up to 3 for games, 1 for practice answers
  core          -> fact table, detectors, themes, puzzles, opening book   (src/core, pure TypeScript)
  cache         -> IndexedDB: archives, engine results, fact tables, coach replies, practice progress
  static data   -> recorded demo, opening book, quoted opening notes
  UI            -> React

Cloudflare Worker
  static files
  POST /api/coach -> Claude API (the only reason a server exists: the key never reaches a browser)
```

- **Your games stay in your browser.** The Worker receives only the compact fact payload for the coach, and stores nothing.
- **The Worker is not a general door to the model.** It accepts only a size-limited payload in which every field is a number, a fixed choice (including which of the four coaches), a chess move, a plain name or the app's own wording. It builds the prompt itself and limits each address to 20 requests a minute.
- **Four caches, so a second visit costs nothing:** monthly game archives, engine results by position, fact tables by game, coach replies by a hash of prompt version, model and request. The coach is part of the request, so each coach's words are kept apart.
- **Analysis never blocks the page.** Games are analysed newest first in the background; each opens as soon as it is done. Measured in version 1 on the demo player's 25 games: 47 seconds with three engines, under a second on a reload.

Code map: `src/core/` (facts, detectors, themes, puzzles, openings, transcript reader, coach prompt and validator; shared by the app, the Worker, the scripts and the tests), `src/app/` (session, cache, engine workers), `src/ui/` (screens, `coaches/` figures, `process/` pages), `worker/` (the one route), `scripts/`, `tests/`, `_archive/v1/` (the version 1 screens, kept, not used).

## Context and prompting strategy

- **Context engineering.** The model sees a compact profile (rating band, themes with counts) and at most six fact rows for one game. It never sees a raw game file. A game with no key moments is not sent at all.
- **Prompt layout for caching.** Stable first: (1) instructions, identical for everyone; (2) the coach's character, one of four; (3) the player's profile; (4) the one game. Cache breakpoints sit after 1, 2 and 3. In the recording below, 392,719 input tokens were read from the cache against 49,600 new.
- **One file, one version.** Every word the model is given is in `src/core/coach/prompt.ts` and `personas.ts`, with a version string that is part of the reply cache key.
- **Structured output.** The API guarantees the reply's shape; the validator checks its content.
- **Tuned on measured rejections, not by feel.** In version 1 three prompt versions were run on the same 20 requests (55%, 60%, 80% first-time pass). In version 2 a live reply passed with a one-letter answer, so the validator gained a rule instead of the prompt gaining a plea.
- **Characters from the books.** Each style guide is written from the out-of-copyright book, never from a film version, and tells the model that the character changes how things are said, never what is true.
- **Model:** `claude-sonnet-5-5`, low effort. The task is wording, not problem solving.

## Eval results

Output of `npm run eval`, exactly as printed. The same numbers are written to `public/demo/eval.json`, which the app's "How it stays truthful" page reads.

```
Fool Me Twice eval
==================
Recording: antwacky, 25 rapid games, recorded 2026-11-22
Model: claude-sonnet-5-5 · prompt 2026-11-22.1 · engine sf19-lite-single/d14/h16

1. Recorded coach replies
   Requests the app can make:        76 (4 coaches × 19: 1 profile summary and 18 game reviews each)
   Found in the recording:           76 of 76
   Passed the validator first time:  59 of 76 (77.6%)
   Passed after one retry:           17 of 76 (22.4%)
   Replaced by code-built text:      0 of 76 (0.0%)
   Replies shown that pass today:    76 of 76 (100.0%)
   By coach (first time / after retry / code-built):
     Sherlock Holmes    10 /  9 /  0
     Winnie-the-Pooh    18 /  1 /  0
     Captain Hook       16 /  3 /  0
     Count Dracula      15 /  4 /  0
   Rejected attempts by rule:        rule 1 × 6, rule 2 × 2, rule 4 × 7, rule 6 × 1, rule 7 × 1
     - sherlock, rule 6: the text for T1 names a piece; a theme summary may not name pieces
     - sherlock, rule 4: the text for F3 spells out a number ("Two"); use a token instead
     - sherlock, rule 4: the text for F3 spells out a number ("third"); use a token instead
     - sherlock, rule 7: the text for F1 says "middlegame", but that move was in the opening
     - sherlock, rule 2: unknown fact F3
     - sherlock, rule 1: F1 appears more than once
     - sherlock, rule 1: F2 appears more than once
     - sherlock, rule 4: the headline spells out a number ("twice"); use a token instead
     - sherlock, rule 1: F2 appears more than once
     - pooh, rule 2: unknown fact F5
     - hook, rule 1: F3 appears more than once
     - hook, rule 4: the text for F3 spells out a number ("third"); use a token instead
     - hook, rule 4: the text for F2 spells out a number ("two"); use a token instead
     - dracula, rule 4: the headline spells out a number ("twice"); use a token instead
     - dracula, rule 1: F3 appears more than once
     - dracula, rule 4: the headline spells out a number ("twice"); use a token instead
     - dracula, rule 1: F4 appears more than once
   Model calls: 93 · tokens: 392,719 read from cache, 6,649 written to cache, 49,600 new input, 38,934 output

2. Validator against deliberately broken replies
   an invented move                            76 of  76 rejected
   an invented square                          76 of  76 rejected
   castling written out                        76 of  76 rejected
   a number in digits                          76 of  76 rejected
   a count in words                            76 of  76 rejected
   an unknown fact or theme ID                 76 of  76 rejected
   a token for an unknown ID                   76 of  76 rejected
   a token for a field that does not exist     76 of  76 rejected
   a theme the moment is not evidence for      72 of  72 rejected
   a piece the fact row does not involve       76 of  76 rejected
   a piece named in the headline               76 of  76 rejected
   the wrong phase of the game                 64 of  64 rejected
   the wrong result                            72 of  72 rejected
   an extra field                              76 of  76 rejected
   a missing moment or theme                   76 of  76 rejected
   Total: 1120 of 1120 rejected (100.0%)

PASSED
```

What this does and does not show: every reply the demo shows passes the validator, and every deliberately broken reply was rejected. A retry is the design working: the checker caught something and the second reply passed. Sherlock Holmes needed the most retries; his manner of speech invites counting ("twice", "the third"). It does not measure whether the advice is *good*; that was judged by reading it. It is one player, so the rates will move between runs.

## Limitations

- **The engine search is shallow** (depth 14, small network) next to a full analysis. That is why only clear mistakes are discussed, and why a puzzle's "engine move" may not be the very best move.
- **The pattern list is short on purpose.** Many clear mistakes match no pattern. For those the coach says what the engine preferred and what it cost, not why.
- **Hanging-piece detection counts the captures on one square.** It does not see a piece lost or saved by a tactic elsewhere.
- **25 games supports common themes only,** and the demo is one player rated about 800.
- **The validator cannot check everything.** It blocks invented moves, numbers, pieces, phases and results. It cannot prove that a general sentence of advice is wise, or that a character's joke lands.
- **Practice answers near the 8-point line can go either way,** because the check is a quick search.
- **"In the book" is not "best".** The dataset files some transpositions under an opening family; the drill starts from the position that defines the opening to avoid them.
- **Opening notes exist for 76 of the 90 largest opening families.** They are introductions, quoted and cut to at most three paragraphs.
- **The session summaries on the Process tab were written by AI.** My messages in them are quotes, and a test checks each against the transcript; the agent's side is a summary, which is why the whole transcript is one click away.
- **The coaches are from out-of-copyright books and drawn from the books.** Winnie-the-Pooh carries the most risk, because of trademarks on later versions. This is not legal advice.
- **Not checked:** Safari and Firefox, a real phone (only a phone-sized window), a screen reader, the closed-account screen in a browser, and the deployed rate limit under load.

## What comes next

- **Scout an opponent.** Study one opponent's games and prepare for their style. My reason: I have never beaten my dad, who is rated about 1500, and I want to.
- **A level ladder.** Run it on stronger players, with their permission, and re-tune.
- **Spaced repetition over days** for missed puzzles and opening lines; today a missed position only comes back within the same run.

The full list is in `docs/IDEAS.md`.

## How this was built

I planned this with Claude Code, an AI coding agent, and it wrote the code from a written specification (`docs/SPEC.md`) and a short list of rules (`CLAUDE.md`). My part was the idea, the rules and the decisions. The planning happened in my application folder, which already held my context; the build happened here, in a clean repository that carries only what the build needs. The same story, with the sessions as conversations, is in the app under **Process**.

- `transcripts/`: the three working sessions. 01 is the brainstorm, 02 the version 1 build, 03 the rescoping and rebuild.
- `docs/DECISIONS.md`: every choice that changed or was made during the builds, with what was given up.
- `docs/TIMELOG.md`: the time log.
- `docs/STORY.md`, `docs/IDEAS.md`, `TODO.md`: the story notes, the ideas for later, the rebuild checklist.

### Time

From `docs/TIMELOG.md`. The planning time is my estimate; the build times were logged by the agent as it worked.

**Version 1 (the take-home as first handed in)**

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

**Version 2 (the rebuild, logged separately)**

| Minutes | What |
|---|---|
| 40 | Rescoping: name, cast, flow, sources, checking the opening data, plan |
| 35 | Design system, shell and navigation, five character figures, home page |
| 45 | Coach characters in the prompt and cache key, two new checker rules, demo re-recorded for four coaches; You page, games list, review screen |
| 30 | Puzzles: core and tests, interactive board, engine-checked answers |
| 45 | Openings: book core and tests, data builder, guide, drill against Blundy |
| 45 | Process tab: story, transcripts as conversations, truth page with a live checker |
| 35 | README, records, browser checks, clean-clone check |
| 10 | Deploy as a new Worker, live checks, repository rename, push |
| 20 | After the deploy: key rotation checks, live coach on the deployment, one consistent navigation bar |
| **305** | **Total: 5 h 5 min** |

## Licences and credits

- Fool Me Twice is free software under the GPL-3.0 (`LICENSE`), because it includes Stockfish.
- Chess engine: [Stockfish](https://stockfishchess.org/) via the `stockfish` npm package, GPL-3.0.
- Piece images: the cburnett set by Colin M.L. Burnett, GPLv2+, from the Lichess repository.
- Winning-chance formula: the one Lichess publishes.
- Opening names and book lines: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0.
- Opening notes: quoted from [Wikibooks, Chess Opening Theory](https://en.wikibooks.org/wiki/Chess_Opening_Theory), CC BY-SA 4.0, credited on each page where they appear.
- Heading typeface: Fraunces, SIL Open Font License (`public/fonts/README.txt`).
- Coaches: Sherlock Holmes (Arthur Conan Doyle), Winnie-the-Pooh (A. A. Milne, 1926), Captain Hook (J. M. Barrie), Count Dracula (Bram Stoker), from the books. Blundy McBlunderpants and all five drawings were made for this app.
- Game data: Chess.com's public API. Fool Me Twice is not affiliated with Chess.com, and does not use its interface, colours or move-quality names.
