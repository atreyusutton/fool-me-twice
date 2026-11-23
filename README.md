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
- **With a voice key (optional):** add `ELEVENLABS_API_KEY` to `.dev.vars` and a speaker button appears in the top bar and a play button on each coach bubble. Sound is off until you turn it on, except that the coach you pick says their one line. The four voice IDs in `src/core/voice.ts` belong to my ElevenLabs account; with your own key, design or pick your own voices and put their IDs there.

| Command | What it does |
|---|---|
| `npm test` | 151 tests: pattern detectors on known positions, the validator against hand-written bad replies, puzzles, the opening book and drill, spoken notation, the fixed lines and the voice request check, following an engine line and the "why" wording, the fetch layer, the transcript reader, and the recorded demo for all four coaches |
| `npm run eval` | Checks every recorded coach reply and attacks the validator with broken replies. No key needed. Output below |
| `npm run record-demo` | Re-records the demo for all four coaches (needs a key) |
| `npm run build-openings` | Fetches the opening book and the quoted opening notes again |
| `npm run deploy` | Builds and deploys to Cloudflare Workers |

## The flow

Home and Process are on every page. Inside a player the four coaching tabs sit between them; outside one, a single tab leads to the demo or to the last player you loaded.

1. **Home.** A username or the demo, and a coach: Sherlock Holmes, Winnie-the-Pooh, Captain Hook or Count Dracula. You can change coach on any screen.
2. **You.** Your coach's read, as a short story: what to work on first, at most three things that keep coming back (each with **Show me** and **Practice this**), and what is going well. The tables are behind **See the numbers**.
3. **Review.** One game, the board beside your coach, one key moment at a time, with both clocks and the time control in view. Each moment shows **why** from the engine's own lines, lets you **play the line out** against the engine, and has **Try it again**. Buttons step to the newer or older game.
4. **Practice.** Your own positions at the moment it went wrong. Each opens with your opponent's last move arriving and your game move in red; you are told what that move lost (from the engine's line, without giving the answer away), can step back through the game, see which game it was and how much time you had, and move between positions. Find the better move; the engine checks it, then the same **why** and **play it out** appear. Missed ones come back.
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
- **Voices read only checked text.** Each coach has one designed voice (made from a written description of the book character; no real person is imitated). The voice route gets the coach request and the reply, runs the same validator again, fills in the values from the fact table, writes each move out in words by code ("Nxe5+" becomes "knight takes E5, check"), and only then asks for speech. It refuses free text. The fixed practice, guide and drill lines are spoken the same way: the route is sent the name of a line and the values for its slots, builds the words itself from `src/core/lines.ts`, and refuses a slot value that is not a chess move, a small whole number or an opening name.
- **What coaches and Blundy say in practice and the drill is fixed text** written for the app, with the moves and numbers put in by code. Where right or wrong must be instant and certain, the model is not called.

**Why a move was worse** is not written by the model. The engine gives the line it expects after your move and after its own; code plays both out with the rules library and counts what is taken and whether it ends in checkmate (`src/core/why.ts`). When the two lines differ only in position, the app says it cannot prove the reason and does not guess.

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
  POST /api/coach -> Claude API      (a server exists so that the keys never reach a browser)
  POST /api/voice -> ElevenLabs API  (reads checked text aloud; cached by voice, model and words)
```

- **Your games stay in your browser.** The Worker receives only the compact fact payload for the coach (and, for a voice, that payload with the reply to be read), and stores nothing but cached audio.
- **The Worker is not a general door to the model.** It accepts only a size-limited payload in which every field is a number, a fixed choice (including which of the four coaches), a chess move, a plain name or the app's own wording. It builds the prompt itself and limits each address to 20 requests a minute.
- **Four caches, so a second visit costs nothing:** monthly game archives, engine results by position, fact tables by game, coach replies by a hash of prompt version, model and request. The coach is part of the request, so each coach's words are kept apart. Spoken lines are a fifth: the same voice, model and words are generated once and then served from Cloudflare's cache.
- **Analysis never blocks the page.** Games are analysed newest first in the background; each opens as soon as it is done. Measured in version 1 on the demo player's 25 games: 47 seconds with three engines, under a second on a reload.

Code map: `src/core/` (facts, detectors, themes, puzzles, openings, transcript reader, coach prompt and validator; shared by the app, the Worker, the scripts and the tests), `src/app/` (session, cache, engine workers), `src/ui/` (screens, `coaches/` figures, `process/` pages), `worker/` (the coach and voice routes), `scripts/`, `tests/`, `_archive/v1/` (the version 1 screens, kept, not used).

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
- **I chose the voices by ear.** Nothing measures whether a voice suits its character. The waiting and "not enough games yet" lines on the You page are not voiced.
- **A spoken line takes one to two seconds the first time anyone asks for it.** After that it comes from a cache.
- **"Why" covers material and checkmate only.** It counts what is taken along two engine lines of about six moves at depth 14. A line can stop in the middle of an exchange, so the sentence says it counts only what is shown. A positional reason is never given.
- **The first read uses five games.** A pattern needs three occurrences in three games, so the first read is often "still collecting"; the full read replaces it when all games are in. On a very old computer the full set still takes minutes; the engine's depth was not lowered to hide that.
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

Time here means **how long the coding agent worked**, measured from its session log, not how much time passed. A request runs from a message I typed to the agent's last action before my next message, with the model calls and the tools it ran included. A silent stretch of more than ten minutes inside a request is left out, because that is the agent waiting for me. The script is `scripts/agent-time.ts`; the log itself stays on my computer because it holds keys I pasted.

| Agent working time | What |
|---|---|
| 1 h 8 min | Version 1: the take-home as first built (19 November) |
| 2 h 36 min | Version 2: the rebuild, the voices, and the changes after user testing (22 November) |
| **3 h 44 min** | **Total** |

What this number leaves out:

- **The planning session** before the repository existed: about an hour, my estimate, in a different folder (transcript: session 01).
- **My own time** between requests: reading, deciding, testing in the browser, and the user testing.

The guideline for the take-home was four hours. Version 1 is the part built to that guideline; everything on 22 November was a choice to keep going.

An earlier version of this README gave 4 h 50 min and 9 h 35 min. Those were per-step estimates the agent wrote into `docs/TIMELOG.md` as it went. The session log shows they overstated the working time, so the measured figures replace them here. The estimates are still in the time log.

## Licences and credits

- Fool Me Twice is free software under the GPL-3.0 (`LICENSE`), because it includes Stockfish.
- Chess engine: [Stockfish](https://stockfishchess.org/) via the `stockfish` npm package, GPL-3.0.
- Piece images: the cburnett set by Colin M.L. Burnett, GPLv2+, from the Lichess repository.
- Winning-chance formula: the one Lichess publishes.
- Opening names and book lines: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0.
- Opening notes: quoted from [Wikibooks, Chess Opening Theory](https://en.wikibooks.org/wiki/Chess_Opening_Theory), CC BY-SA 4.0, credited on each page where they appear.
- Voices: generated with [ElevenLabs](https://elevenlabs.io); each voice was designed from a text description for this app.
- Heading typeface: Fraunces, SIL Open Font License (`public/fonts/README.txt`).
- Coaches: Sherlock Holmes (Arthur Conan Doyle), Winnie-the-Pooh (A. A. Milne, 1926), Captain Hook (J. M. Barrie), Count Dracula (Bram Stoker), from the books. Blundy McBlunderpants and all five drawings were made for this app.
- Game data: Chess.com's public API. Fool Me Twice is not affiliated with Chess.com, and does not use its interface, colours or move-quality names.
