# Motif: project rules for coding agents

Motif is an AI chess coach that remembers. It reviews one game in the context of a player's recent games and reports the recurring themes behind their results. It is a take-home project for an engineering internship, and the way it is built is judged along with the result.

Read `docs/SPEC.md` before writing code. Read `docs/STORY.md` before writing the README or the in-app "How this was built" page.

## The one rule: engine truth

The chess engine and the game record are the only sources of chess facts. The language model explains; it never decides.

- The model never writes a move, a square, an evaluation or a count. It cites fact IDs, and the interface renders the values from the fact table.
- Every reply from the model passes the validator in `docs/SPEC.md` before a player sees it. A reply that fails is retried once, then replaced with text built by code. An unchecked reply is never shown.
- Patterns ("left a piece hanging") come only from detectors written in code and covered by tests on known positions. Do not ask the model to name tactics.
- The coach speaks only about clear mistakes and about themes that meet the minimum count. When the data is thin, it says so.
- If a shortcut would let unverified chess text reach the screen, stop and choose the slower path.

Why: a coach that is wrong once about a move loses the player. Trust and a good experience come before anything clever.

## What to keep in front while building

- **Context engineering.** The model sees a compact profile and one game's fact rows. It never sees raw PGN.
- **Prompt engineering.** Stable content first (instructions, then the profile), the changing content last (one game), so the stable part is reused across requests. Prompts live in one file with a version string.
- **Caching.** Four levels: game archives, engine results by position, fact tables by game, coach replies by content hash. A second visit should cost nothing.
- **Efficiency.** Analyse in a background worker, show results as each game finishes, never block the page.

## Stack

TypeScript throughout. Vite and React for the app, chess.js for rules, Stockfish compiled for the web in a Web Worker, IndexedDB for caching, one Cloudflare Worker route for the language model call, Zod for validating model output, Vitest for tests. Details and the reasons are in `docs/SPEC.md`.

Check current documentation before relying on memory for: the Claude API (model IDs, prompt caching rules and minimum cacheable length, structured output), the Stockfish web build, and the Cloudflare Vite tooling.

## Working agreements

- Use Node 22 (`/opt/homebrew/opt/node@22/bin` on this machine; the system Node 18 is too old for Wrangler).
- Work on a feature branch. Conventional commit messages, one logical change per commit. Do not push unless asked.
- Never write secrets to the repo. The API key lives in `.dev.vars` locally and in a Worker secret when deployed. `.dev.vars` is git-ignored; commit `.dev.vars.example`.
- Handle errors explicitly. No empty `catch` blocks. A failed fetch, engine crash or model error must show the player a clear message and a way forward.
- Prefer integration tests. The pattern detectors and the validator are the exceptions: each needs focused tests, because trust depends on them.
- Do not delete files; move them to `_archive/` and say so.
- Do not imitate Chess.com's interface, colours, move-quality names or icons. Motif has its own look and its own words.

## Records to keep (they are part of the hand-in)

- `transcripts/`: one readable file per working session, `YYYY-MM-DD-session-NN-topic.md`. The user's messages verbatim, a short summary of what the agent did, and the agent's replies. Append each turn before ending it.
- `docs/TIMELOG.md`: one line per block of work: date, minutes, what it went to.
- `docs/DECISIONS.md`: one short entry whenever a choice in the spec changes or a new trade-off is made: what, why, what was given up.
- `docs/IDEAS.md`: features for later. Add to it; do not build from it without being asked.

## Done means

- `npm install && npm run dev` starts everything, and the demo player works with no API key.
- `npm test` and `npm run eval` pass, and the eval numbers in the README are the ones the command prints.
- The README lets a beginner run the app and understand how it stays truthful.
- You ran the app in a browser and looked at it. If something was not checked, say so plainly.
