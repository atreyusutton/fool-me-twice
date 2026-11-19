# Kickoff prompt

Paste everything below the line into a new Claude Code session opened in this repository.

---

You are building Motif, an AI chess coach web app, in this repository. It is my take-home for the Chess.com engineering internship, and the process is judged along with the result: the transcripts, the time log and the commit history are all handed in.

**Read first, in this order:** `CLAUDE.md`, `docs/SPEC.md`, `docs/STORY.md`, `docs/IDEAS.md`, and the earlier planning transcript in `transcripts/`. The spec is the plan; you do not need to re-plan it. If you find a real problem with it, say what and why, propose the change, record it in `docs/DECISIONS.md`, and carry on.

**What I want.** A player enters a Chess.com username and gets a coach that remembers: recurring themes across their recent games, and a review of any one game that says how each key moment fits those themes. Quality matters more than speed. I would rather have fewer features that are right than more that are shaky.

**The rule that outranks everything else: engine truth.** The engine and the game record are the only sources of chess facts. The language model never writes a move, a square, a number or an evaluation; it cites fact IDs and the interface renders the values. Every model reply is validated in code before anyone sees it, with one retry and then a code-built fallback. If you are ever choosing between a nicer sentence and a verified one, choose verified. I care about this because a coach that is wrong once loses the player's trust, and trust is the product.

**Keep these visible in the work,** because they are what the reviewers are looking for: context engineering (the model sees a compact profile and one game's facts, never raw PGN), prompt engineering (stable content first, changing content last, fixed output structure, versioned prompts), caching at all four levels in the spec, and efficiency (background analysis, results as they arrive).

**How to work**
- Follow the build order in section 11 of the spec. Commit at each step with a conventional commit message. Each step should run before you start the next.
- After step 5 the app must be useful and truthful with no language model at all. Only then add the coach.
- Before writing the model call, the engine wrapper or the Cloudflare setup, check the current documentation for each. Do not rely on memory for model IDs, prompt-caching rules or package builds.
- Start the engine at the setting in the spec, then measure on the demo player (`Antwacky`): time per game, and whether the clear-mistake threshold and each detector give results that look right when you step through the games. Tune, and record what you found in `docs/DECISIONS.md`.
- The interface is yours to design. Make it something a player would choose to use: calm, legible, fast, good on a phone, with its own identity. Do not imitate Chess.com's look or its move-quality names. Design the waiting, empty and error states with the same care as the main path.
- Run the app in a browser and look at it before you call a step done. Tell me plainly what you checked and what you did not.

**Records, kept as you go**
- `transcripts/YYYY-MM-DD-session-NN-topic.md`: my messages verbatim, a short summary of what you did, your replies. Start one now for this session and append every turn.
- `docs/TIMELOG.md`: a line per block of work.
- `docs/DECISIONS.md`: a short entry for every changed or new trade-off.

**The story is part of the app.** Build the "How this was built" page and the README from `docs/STORY.md`, in my first-person voice, so a beginner can understand what the app does, how it stays truthful, how AI was used to build it, and how to run it. Use only facts from that file, the transcripts, the time log and the code. Ask me about anything marked `[CONFIRM]`.

**Finished means** `npm install && npm run dev` runs everything and the recorded demo works with no API key; `npm test` and `npm run eval` pass; the README quotes the eval output exactly and states the limitations honestly.

You will need an Anthropic API key for step 6. Ask me for it then; I will put it in `.dev.vars` myself. Until then, nothing needs a key.

Begin with step 1. Give me a one-line plan, then start.
