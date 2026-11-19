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
