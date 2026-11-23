# The story of this project

Source material for the README and the in-app "How this was built" page. Everything here is true as of 19 November 2026. Write the page in Atreyu's first-person voice, in plain words a beginner can follow. Do not add events, numbers or claims that are not in this file, the transcripts, the time log or the code. Items marked `[CONFIRM]` need Atreyu's answer before they are published.

Privacy: do not name or describe interviewers, recruiters or friends. Do not publish interview notes. The demo player is referred to by their public username only.

## 1. Where it started: one folder with my context

Before this project there was a single working folder for my Chess.com internship application. I work in it with Claude Code, an AI coding agent that runs in my terminal. Over about a week that folder came to hold:

- my application answers and the reasoning behind each one;
- a private interview practice app the agent and I built: flashcards, spoken drills and mock interviews, written from my real resume, portfolio and project pages so that it could correct me when I got my own numbers wrong;
- a small memory of notes the agent keeps between sessions: decisions I made, corrections I gave it, what is still open.

That is the first AI principle in this project, before any code: **context is the product.** The agent was useful because it had the right facts about me and the role in reach, and because wrong facts got corrected and written down once instead of repeated.

When the take-home arrived, I did the planning in that same folder, so the agent already knew my background, what I had said I wanted to build, and Chess.com's values. Then I moved to a clean repository for the build, carrying only what the build needs.

## 2. The assignment and my choice

The take-home offered two tracks: predict game results with a machine-learning model, or build an AI chess coach web app using a language model and Chess.com's public API. I chose the coach because applied AI is where my experience is.

The brief asks for a working, useful core, thoughtful prompt and context engineering, and answers grounded in real game data, over a long feature list. It also asks for the agent transcripts, so the process is part of what is handed in.

## 3. The idea

Chess.com's game review explains one game. Its statistics show totals. Nothing connects them: the coach does not know you. I wanted a coach that remembers: one that reviews a game and tells you which of your mistakes keep coming back.

I brainstormed alternatives with the agent and kept my original idea. The others are logged for later (section 7).

## 4. The principle I would not trade

Chess.com's first value is "Mission First". I read that as: the player's experience and their trust come first. A chess coach that invents a move, or disagrees with the engine, loses that trust the first time it happens.

So the rule for this project is **engine truth**: the engine and the game record are the only sources of chess facts, and the language model is never in a position to make one up.

## 5. First decisions, and why

- **The first thing we did was look at the data.** The public API returns games with clock times, ratings and openings, but no engine analysis. So engine truth had to be computed by this app. That one finding shaped the design.
- **The model never writes a move.** Code builds a table of facts from the engine. The model gets rows from that table and may only point to them. The screen fills in the moves and numbers from the table. A checker rejects any reply that contains a move, a square or a number of its own.
- **Themes come only from patterns code can prove.** Language models are unreliable at naming tactics. So the list of patterns is short, each one is defined in code, and each has tests.
- **Small samples are stated, not hidden.** A theme needs a minimum number of occurrences and always shows its count. If there is not enough evidence, the coach says so.
- **Only clear mistakes.** A quick engine search can misjudge close decisions, so the coach talks about the mistakes that are not close.
- **The engine runs in the browser.** Nothing to install, nothing to host, and a player's games never leave their machine. The trade-off is a wait the first time, handled with progress and caching.
- **TypeScript, not Chess.com's backend languages.** I considered building in their stack to show range and decided a clean build in a language I know, which is also on their list, says more than a rushed one in a language I don't.
- **A recorded demo.** Anyone can run the app with one command and no API key.
- **Start at my own level.** I am rated about 750 on a new account with too few games to study. So development started with a public account rated about 800 with more than 2,000 rapid games, where I can check the chess by eye, before moving to stronger players.
- **Four hours was the guideline.** I treated it as a guide to scope. Time is counted as how long the coding agent worked, measured from its session log: 1 h 8 min for version 1 and 2 h 36 min for everything on 22 November, plus about an hour of planning before the repository existed. My own time between requests is not in that number.

## 6. How AI was used, in plain terms

- **Planning with an agent.** The brainstorm, the trade-offs and this specification were worked out in conversation with Claude Code. The transcripts are in `transcripts/`.
- **Building with an agent.** The code in this repository was written by a coding agent from a written specification and a short list of rules (`CLAUDE.md`, `docs/SPEC.md`). My part was the idea, the rules, the decisions, and checking the result. `[CONFIRM: adjust once the build is done]`
- **Context engineering.** Giving a model the right information and nothing else. Here the coach model sees a compact profile of the player and the facts for one game. It never sees raw game files.
- **Prompt engineering.** Writing instructions so the output is predictable. Here the instructions put the unchanging parts first and the changing part last, and the model must answer in a fixed structure.
- **Grounding.** Tying what a model says to a source that can be checked. Here every sentence points to engine facts by ID.
- **Caching.** Not paying twice for the same work. Games, engine results, fact tables and coach replies are each stored after the first time.
- **Evaluation.** Checking the output instead of trusting it. A checker runs on every reply, and one command reports how often replies pass.

## 7. What I want to build next

- **Puzzles from your own blunders.** Practice positions taken from your own games, for the theme the coach found. The engine's move is the answer.
- **Scout an opponent.** Study one opponent's games and prepare for their style. My reason: I have never beaten my dad, who is rated about 1500, and I want to.
- **A level ladder.** After the 800-level demo, run it on stronger players, with their permission.
- **Chat with your games**, and a **clock and tilt** view, are logged as later ideas.

## 8. Honest limits to state

Take these from the finished build and the eval output, not from this file. At minimum: the engine search is shallow compared with a full analysis; the pattern list is short on purpose; 25 games supports common themes only; the demo is one player.
