# Motif: specification

## 1. What it is

A web app. A player enters a Chess.com username. Motif fetches their recent games, analyses them with a chess engine in the browser, finds recurring themes, and reviews any single game in the light of those themes: "you left a knight undefended here; that is the fourth time in your last 25 games."

The assignment (Chess.com engineering internship, AI/ML take-home, Option B) asks for "a self-contained AI chess coach web application powered by an LLM and Chess.com's public API" and values "a working, useful core experience, thoughtful prompt/context engineering, and grounding the AI's responses in real game data over covering every possible feature."

### Not in this version
Puzzles from the player's own mistakes, scouting an opponent, open chat, accounts or sign-in, any server-side storage of players' data. See `docs/IDEAS.md`.

## 2. The player's path

1. **Home.** One field for a username, and a "See the demo" button for the recorded demo player. One sentence on what the app does and one on how it stays truthful.
2. **Profile.** Appears at once with the no-engine statistics (section 6, tier 1). Engine themes fill in as games finish analysing, with visible progress ("12 of 25 games analysed"). Up to three themes are featured, each with its count, a one-line coach explanation, and links to the moments behind it. A list of games to open.
3. **Game review.** A board, the move list, a chart of winning chance across the game, and the key moments. Each key moment shows the move played, the engine's move, what it cost, and the coach's explanation, including how it fits a theme. Stepping through moves works by click and by arrow keys.
4. **How this was built.** A page in the app for a newcomer: what the app does, how it stays truthful, how AI was used to build it, what comes next. Source material is `docs/STORY.md`.

The interface is the agent's to design. Aim for something a player would choose to use: calm, legible, fast, good on a phone, usable by keyboard, with light and dark themes. It must have its own identity (see `CLAUDE.md`).

States that must be designed, not left to chance: first load with a long analysis ahead, player not found, player with too few games, account closed, API rate limit, engine failed to load, model unavailable (the review still works, with text built by code), offline with cached data.

## 3. Architecture

```
Browser
  fetch layer     -> Chess.com public API (direct; the API allows browser requests)
  engine worker   -> Stockfish (WebAssembly) in a Web Worker
  facts + profile -> plain TypeScript, no I/O, fully testable
  cache           -> IndexedDB
  UI              -> React

Cloudflare Worker
  static files
  POST /api/coach -> validates the request, builds the prompt, calls the Claude API
```

Everything about a player's games stays in their browser. The Worker exists only so the API key is never sent to the browser.

### Why these choices
- **Engine in the browser:** nothing for a reviewer to install, no server compute, deploys as static files. The cost is speed on first load, handled by progress display and caching.
- **TypeScript:** one language across app, worker and tests, and it is on the role's listed stack.
- **Pure functions for facts and profile:** the part that carries the truth is the part that is easiest to test.
- **Stockfish is GPL-3.0**, so this repository is licensed GPL-3.0. Confirm the licence of the exact web build used and record it in the README.

## 4. Data: fetch layer

- `GET https://api.chess.com/pub/player/{username}`: use `status` to refuse closed accounts (some are closed for fair-play violations; do not coach from those games).
- `GET /pub/player/{username}/stats`: current ratings.
- `GET /pub/player/{username}/games/archives`: list of monthly archive URLs.
- `GET /pub/player/{username}/games/{YYYY}/{MM}`: games with `pgn` (including `[%clk]` clock comments), `white`/`black` (`username`, `rating`, `result`), `time_class`, `time_control`, `rated`, `rules`, `eco` (opening URL), `uuid`, `url`, `end_time`.
- The API returns no engine evaluations. All engine truth is computed here.

Rules:
- Request archives one at a time, newest first, until enough games are collected. On HTTP 429, wait and retry with backoff, and tell the player.
- A finished month never changes: store it permanently. Re-check only the current month, using the `ETag` the API returns (`If-None-Match`).
- Keep only standard chess (`rules === "chess"`). Default to the player's most-played time class; let them switch.
- Tier 1 uses up to the latest 100 games. Engine analysis uses the latest 25 by default, extendable to 50 and 100.

## 5. Engine and the fact table

### Engine
- One Stockfish instance in a Web Worker, single-threaded build (no special page headers needed). Fixed search limit for every position so results are repeatable. Start at depth 12 and adjust after measuring speed and stability on the demo player; record the final setting in `docs/DECISIONS.md`.
- Evaluate every position in the game once. Store by position (FEN) plus engine setting, so shared openings are analysed once across games.
- Queue newest game first. Emit progress after each game. The player can open a game as soon as it is done.

### From evaluation to winning chance
Convert centipawns to winning chance for the side to move with the published Lichess formula:

```
winChance = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)
```

Mate scores map to 100 or 0. Always express the result from the player's side.

### Fact rows
One row per move by the player:

| Field | Meaning |
|---|---|
| `id` | Stable ID: game uuid plus ply |
| `ply`, `moveNumber`, `color` | Where in the game |
| `played` | The move played (SAN), from the game record |
| `best` | The engine's preferred move (SAN), verified legal with chess.js |
| `winBefore`, `winAfter`, `loss` | Winning chance before and after, and the drop |
| `phase` | `opening` (first 10 moves), `endgame` (little material left), else `middlegame` |
| `clockLeft`, `timeSpent` | From `[%clk]`, allowing for increment |
| `clear` | `true` when `loss` is at least 20 points |
| `patterns` | Tags from section 6, only on clear mistakes |
| `pieces` | Piece types involved (moved, captured, lost), for the wording check |

`clear` exists because a quick engine search misjudges close decisions. The coach talks only about rows where `clear` is true, plus missed and allowed mates. The 20-point threshold is a starting value; tune it on the demo player and record the result.

## 6. Themes

### Tier 1: no engine, immediate, up to 100 games
Results by colour; by opening (from the `eco` URL); by how the game ended (checkmate, resignation, time, abandonment); against higher- and lower-rated opponents; average and lowest clock at the end.

### Tier 2: engine patterns, proven by code
Each detector is a pure function over the position, the move played and the engine output. Each needs tests with known positions, including positions where it must **not** fire.

| Tag | Fires when |
|---|---|
| `hung_piece` | A clear mistake, and the engine's reply captures a knight, bishop, rook or queen that the move left undefended or defended too thinly (static exchange on that square loses material) |
| `missed_capture` | A clear mistake, and the engine's move was a capture that wins a piece's worth of material by static exchange, and the player played something else |
| `missed_mate` | The engine showed a forced mate in three or fewer for the player before the move, and none after it |
| `allowed_mate` | No forced mate against the player before the move; a forced mate in three or fewer against them after it |
| `time_trouble` | A clear mistake with less than 10% of the starting time left |
| `rushed` | A clear mistake played in under 3 seconds with more than half the starting time left |

Keep this list short. A new tag is added only with a definition code can prove and tests to match.

### Profile
A theme is a tag or tier-1 finding with its count, its rate (per game or per 100 moves), the phase where it concentrates, and the fact IDs behind it.

- A tier-2 theme exists only with at least 3 occurrences in at least 3 different games. Tier-1 comparisons need at least 8 games on each side.
- Rank themes by total winning chance lost. Feature at most three.
- Always show the numbers: "4 times in 25 games". If nothing meets the minimum, the profile says there is not enough evidence yet, and suggests analysing more games.
- Include strengths on the same terms (for example, mates found when available), so the coach is not only negative.

## 7. The coach: language model

### Calls
Two kinds, both through `POST /api/coach`:
1. **Profile summary:** once per profile version. Explains the featured themes.
2. **Game review:** once per game. Explains the key moments and ties each to a theme where the facts support it.

### Context layout
In this order, so the stable parts are reused:
1. **System instructions** (identical for every request): role, the rules below, the output shape, tone guidance by rating band, two short examples.
2. **Player profile** (changes only when new games are analysed): themes with IDs, counts and rates.
3. **The request** (changes every time): for a game review, the game's summary and its key fact rows with short local IDs (`F1`, `F2`, ...).

Mark cache breakpoints after parts 1 and 2. Check the current minimum cacheable length; if the stable part is below it, caching silently does nothing. Log the cache-read and cache-write token counts from each response and show them in a small "cost" disclosure in the app, so the claim is visible, not asserted.

The model receives only what it needs: no raw PGN, no moves outside the key rows, no other games.

### What the model may write
Structured output, validated with Zod:

```
GameReview {
  headline: string
  moments: [{ fact: "F3", theme: "T1" | null, text: string }]
  takeaway: { theme: "T1" | null, text: string }
}
ProfileSummary {
  headline: string
  themes: [{ theme: "T1", text: string }]
  focus: { theme: "T1", text: string }
}
```

In `text`, the model refers to values with tokens the interface fills in: `[[played:F3]]`, `[[best:F3]]`, `[[loss:F3]]`, `[[count:T1]]`, `[[games:T1]]`. It writes no move, square, digit or evaluation itself.

Default model: read from configuration, starting with `claude-sonnet-5-5`. Verify the ID and the structured-output method against current documentation.

### The validator (runs on every reply, in code)
Reject the reply if any of these is true:
1. It does not match the schema.
2. A cited fact or theme ID is not in the request.
3. A token does not resolve, or names a field that does not exist.
4. Any `text` contains a digit, a square name, or anything shaped like a chess move (SAN, castling notation).
5. A `moments` entry links a fact to a theme whose evidence does not include that fact.
6. A piece name appears in a moment's text that is not in that fact row's `pieces`.

On rejection: retry once, telling the model which rule failed. If it fails again, show text assembled by code from the fact rows (a plain template), and mark it as such in the cost disclosure. The player always gets a correct review.

### Protecting the endpoint
The Worker builds the prompt itself from a validated, size-limited fact payload; it is not a general proxy to the model. Add a simple per-address rate limit. Keys stay in Worker secrets.

## 8. Caching

| What | Key | Lifetime |
|---|---|---|
| Monthly archive | username + month | Permanent for past months; ETag re-check for the current month |
| Engine result | FEN + engine setting | Permanent |
| Fact table | game uuid + engine setting + facts version | Permanent |
| Coach reply | hash of prompt version + profile + request | Permanent |
| Model prefix | handled by the API's prompt caching | Short, set by the API |

Changing the engine setting, the fact logic or the prompt changes the key, so stale results are never reused.

## 9. Demo mode

The demo player is the public account `Antwacky` (rapid, about 800). Record their latest 25 rapid games, the engine results, the fact tables and the coach replies into `public/demo/`, with a script (`npm run record-demo`) that can regenerate them. The demo runs with no API key and no waiting, and it is clearly labelled as recorded, with the date.

Show only what the public API shows. Keep the demo copy respectful: it describes patterns in games, not the person.

## 10. Checks

- `npm test`: detectors (fire and must-not-fire positions), winning-chance conversion, clock parsing, PGN-to-fact-table on a known game, the validator against hand-written bad replies (invented move, unknown ID, digit, wrong theme link, wrong piece).
- `npm run eval`: runs every recorded coach reply through the validator and reports the pass rate, retries used and fallbacks used. With an API key, it can also generate fresh replies for the demo games and report the same numbers. The README quotes this output.
- One browser check of the whole path before calling a milestone done.

## 11. Build order

Commit at each step; each should run.

1. Scaffold: Vite, React, TypeScript, Worker, tests, lint, `npm run dev` as one command.
2. Fetch layer and archive cache, with the tier-1 profile on screen.
3. Engine worker, fact table, engine cache, progress display.
4. Detectors and the profile, with tests.
5. Game review screen: board, move list, winning-chance chart, key moments with code-built text.
6. Coach: Worker route, prompts, validator, retry and fallback, reply cache, cost disclosure.
7. Record the demo. Run the eval.
8. "How this was built" page and the README.
9. Polish: empty and error states, phone layout, keyboard use, dark theme.

After step 5 the app is already useful and already truthful with no model at all. The model is added on top of a working, checked base.

## 12. README must contain

What it is, in two sentences. How to run it with one command, with and without a key. How it stays truthful (the five layers and the validator), in words a beginner follows. System design, context and prompting strategy. Limitations, honestly. What comes next. Time breakdown from `docs/TIMELOG.md`. Where the transcripts are. Eval results as printed.

## 13. Version 2: Fool Me Twice (22 November 2026)

This section overrides earlier sections where they differ. The approved plan is summarised here; decisions are in `docs/DECISIONS.md`.

### Two jobs

1. Be a good chess coach. 2. Explain and show the process. Version 1 showed data well and did neither job fully.

### The flow

| Screen | What it is for | Leads to |
|---|---|---|
| Home | Username or the demo, then pick a coach | You |
| You | The coach's read of the player: at most three findings in sentences, then strengths. Numbers and the game list on request | Review ("Show me"), Practice ("Practice this") |
| Review | One game with the chosen coach; the figure reacts as you step through key moments | Practice ("Try it again") |
| Practice | Puzzles from the player's own mistakes, grouped by theme; missed ones return | Review |
| Openings | A guide to the openings the player plays, and a drill against Blundy McBlunderpants | Practice |
| Process | Story, Transcripts (as a messaging app: AI-written summary first, whole conversation on request), How it stays truthful | |

Top bar on desktop, bottom tab bar on a phone. One primary action per screen.

### Coaches

Sherlock Holmes, Winnie-the-Pooh, Captain Hook, Count Dracula. Each is a layered SVG figure with states (idle, talking, wince, pleased, thinking, one signature move) chosen by code. The prompt gains a persona block after the shared instructions with its own cache breakpoint; the reply cache key gains the coach ID; the validator is unchanged; a reply that fails twice becomes plain code-built text.

### Puzzles

Built by code from fact rows that are clear mistakes with an engine move. The attempt is checked by the engine in the browser at the fixed depth: accepted when it gives up less than `PUZZLE_TOLERANCE` points of winning chance compared with the engine's move. If the engine cannot load, only the engine's own move is accepted. Progress is stored on the device.

### Openings

- Book lines and names: the Lichess `chess-openings` dataset (CC0).
- Ideas: Wikibooks "Chess Opening Theory" (CC BY-SA), quoted as written with a link.
- Likely replies for the drill: how often the player's own opponents played each book move, then how many named lines follow it.
- All fetched once by `npm run build-openings` into `public/openings/`.
- The guide shows the player's record in each opening, where they most often leave the book and what the book moves were, their first clear mistake in the opening, and the quoted ideas.
- The drill: Blundy plays a likely book reply; the player must stay in the book. Any book move is accepted and named.

### Out of scope

Voice, coaches modelled on real people, accounts, server storage of player data, chat with your games, scouting an opponent.
