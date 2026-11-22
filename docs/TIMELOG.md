# Time log

One line per block of work: date, minutes, what it went to. The README's time breakdown is built from this file.

| Date | Minutes | What |
|---|---|---|
| 2026-11-19 | 60 (approximate, confirmed by Atreyu) | Planning with Claude Code before the repo existed: reading the assignment, brainstorm, checking the API, choosing the demo player, writing the spec and kickoff prompt (transcript: session 01) |
| 2026-11-19 | 15 | Session 02: reading the repo, pre-build questions, key and branch setup |
| 2026-11-19 | 10 | Step 1: scaffold (Vite, React, Worker, tests, lint), checked in a browser |
| 2026-11-19 | 15 | Step 2: Chess.com fetch layer, archive cache, no-engine profile, tests |
| 2026-11-19 | 25 | Steps 3 and 4: engine wrapper, fact table, detectors, profile, tests; measuring depth 12, 14 and 16 on the demo player and tuning |
| 2026-11-19 | 25 | Step 5: game review screen (board, move list, winning-chance chart, key moments with code-built text), browser checks on desktop and phone widths, parallel engines |
| 2026-11-19 | 40 | Step 6: coach prompt, validator and tests, Worker route, reply cache, cost disclosure, live checks in the browser |
| 2026-11-19 | 35 | Step 7: demo recorder, recorded demo playback, eval command, three measured prompt versions, browser check of all 25 demo games |
| 2026-11-19 | 30 | Step 8: "How this was built" page, README, licence |
| 2026-11-19 | 25 | Step 9: browser checks of error states, dark theme and phone layout; fix so saved games open when Chess.com is unreachable |
| 2026-11-19 | 10 | Clean-clone check, deploy to Cloudflare, push to GitHub |

## Version 2: Fool Me Twice (separate from the take-home time above)

| Date | Minutes | What |
|---|---|---|
| 2026-11-22 | 40 | Session 03: rescoping with Atreyu (name, cast, flow, sources), two naming rounds, checking the opening data sources, plan |
| 2026-11-22 | 35 | Step 2: new design system, shell and navigation, five character figures (drawn, rendered, corrected), home page and coach picker |
| 2026-11-22 | 45 | Steps 3 and 4: coach characters in the request, prompt and cache key; two new checker rules; live voice checks; demo re-recorded for four coaches; You page, games list, review screen with the reacting coach |
| 2026-11-22 | 30 | Step 5: puzzle core and tests, interactive board, engine-checked answers, practice screen, browser run |
| 2026-11-22 | 45 | Step 6: opening book core and tests, data builder (Lichess lines, Wikibooks text), opening guide, drill against Blundy, browser run and fixes |
| 2026-11-22 | 45 | Step 7: Process tab (story, transcripts as a messaging app with AI-written summaries and the full files, truth page with a live checker), eval numbers written to a file, tests that the summary quotes are verbatim |
| 2026-11-22 | 35 | Step 8: README, records, browser checks on desktop, phone width and dark theme, clean-clone check, deploy |
| 2026-11-22 | 10 | Step 9: deploy as a new Worker, live checks, repository rename, push |
| 2026-11-22 | 20 | After hand-in checks: key rotation checks, live coach on the deployment, one consistent navigation bar |
| 2026-11-22 | 75 | Coach voices: choosing a service, designing and picking five voices, spoken-notation code and tests, a checked voice route with caching, player and controls, browser checks |
| 2026-11-22 | 35 | Voices for practice, the opening guide and Blundy: fixed lines in shared code with typed slots, tests, browser checks |
