# Version 2 rebuild: Fool Me Twice

Plan approved 22 November 2026. Details: `docs/SPEC.md` section 13.

## Done

- [x] 1. Records and rules, rename in app text
- [x] 2. Design system, shell, navigation, coach figures, Home and coach picker
- [x] 3. You page
- [x] 4. Review with coaches (persona prompt, cache key, figure states)
- [x] 5. Practice: interactive board, puzzles from the player's mistakes
- [x] 6. Openings: book data, guide, drill against Blundy
- [x] 7. Process tab: story, transcripts as a messaging app, how it stays truthful
- [x] 8. Eval per coach written to a file, README, final checks
- [x] 9. Deployed as a new Worker `fool-me-twice`; repo renamed and branch pushed

## Next

- [x] API key rotated; new key set as the Worker secret, live coach on
- [ ] Confirm the `[CONFIRM]` items in `docs/STORY.md`

## After user testing (done)

- [x] Review: time control, both clocks, clock left at each key moment, newer and older game buttons
- [x] Practice: lead-up replay, look back through the game, previous and skip, game info, winning-chance graph, try once more
- [x] A first coach read after the newest five games, with a time estimate
- [x] "Why" from the engine's lines, and playing a line out against the engine
