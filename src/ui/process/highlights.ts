/**
 * The short version of each working session, shown first on the Transcripts page.
 *
 * Written by the AI agent from the full transcripts in `transcripts/`, and labelled that way on screen.
 * The user's messages here are word-for-word quotes (typos included; "…" marks a cut), and a test
 * checks each one against the transcript file. Agent messages and notes are summaries.
 */
export type Principle = "context" | "prompt" | "grounding" | "caching" | "evaluation" | "checking";

export const PRINCIPLES: Record<Principle, { label: string; meaning: string }> = {
  context: { label: "Context engineering", meaning: "Giving a model the right information and nothing else." },
  prompt: { label: "Prompt engineering", meaning: "Writing instructions so the output is predictable." },
  grounding: { label: "Grounding", meaning: "Tying what a model says to a source that can be checked." },
  caching: { label: "Caching and efficiency", meaning: "Not paying twice, in time or money, for the same work." },
  evaluation: { label: "Evaluation", meaning: "Measuring the output instead of trusting it." },
  checking: { label: "Checking the work", meaning: "Running the thing and looking at it before calling it done." },
};

export interface SummaryMessage {
  who: "user" | "agent" | "note";
  text: string;
  tags?: Principle[];
}

export interface SessionSummary {
  id: string;
  file: string;
  title: string;
  date: string;
  /** Which of the two repositories the session happened in. */
  where: "The application folder" | "This repository";
  blurb: string;
  messages: SummaryMessage[];
}

export const SESSIONS: SessionSummary[] = [
  {
    id: "01",
    file: "2026-11-19-session-01-brainstorm.md",
    title: "Brainstorm and the kickoff prompt",
    date: "19 November 2026",
    where: "The application folder",
    blurb: "Planning in the folder that already held my context. No code yet.",
    messages: [
      {
        who: "user",
        text: "I want to do my initial brainstorming here, build a great prompt for a git repo with the right context keep a log with my agent and make sure to use really good UI … This project needs to be grounded in engine truth at no point can we make up moves, contradict the engine.",
      },
      {
        who: "note",
        text: "Before any brainstorming, the agent called Chess.com's public API to see what the data really holds. Games come with clock times, ratings and openings, but no engine analysis. So engine truth has to be computed by the app itself. That one finding shaped the whole design.",
        tags: ["grounding", "checking"],
      },
      {
        who: "agent",
        text: "Your idea is the right one. Build it in five layers (fetch, engine, facts, profile, narration) so the rule holds by construction: the model only narrates, points at fact IDs, and never writes a move. A check rejects any reply with a move or number of its own.",
        tags: ["grounding", "context"],
      },
      {
        who: "user",
        text: "I plan to stick with my idea because I think it is the best however I want to log some other ideas because they are cool … Find a player around 800 with at least 100 games to back up data.",
      },
      {
        who: "note",
        text: "The API cannot search by rating, so the agent walked outward from my own opponents and checked six candidates. One had been closed for fair-play violations and was excluded; checking account status became a rule of the app.",
        tags: ["checking"],
      },
      {
        who: "agent",
        text: "Is 25 games enough? For common themes, probably; for anything finer, no. So: two tiers. Counts that need no engine run over 100 games at once. Engine themes run over the latest 25, need a minimum count to appear, and always show their numbers.",
        tags: ["evaluation", "caching"],
      },
      {
        who: "user",
        text: "I want a beginner to understand my app how i used AI principles and be able to run the applicaiton. Include this in the propt so its part of the applicaiton created.",
      },
      {
        who: "note",
        text: "The agent wrote a seed for a new, clean repository: a kickoff prompt, standing rules for any coding agent (CLAUDE.md), a specification, the story, and the first decision and time logs. Only what the build needs was carried over from the application folder.",
        tags: ["context", "prompt"],
      },
      {
        who: "agent",
        text: "One thing to settle before this is public: the transcript holds names of people in your own messages. I have replaced them with roles in the repository's copy and said so at the top of the file.",
        tags: ["checking"],
      },
    ],
  },
  {
    id: "02",
    file: "2026-11-19-session-02-build.md",
    title: "Building version 1",
    date: "19 November 2026",
    where: "This repository",
    blurb: "From nine planning files to a deployed app, in nine steps.",
    messages: [
      { who: "user", text: "ask me what you need so when i start it you can run autonmously" },
      {
        who: "agent",
        text: "Four questions, in one batch: the API key, the demo player, the planning time for the log, and where the finish line is. Then the build ran without stopping, one commit per step.",
        tags: ["context"],
      },
      {
        who: "note",
        text: "Engine settings were measured, not guessed: depths 12, 14 and 16 on the demo player's 25 games. Depth 14 with a 25-point threshold was chosen because all 38 clear mistakes were still clear at depth 16. Stepping through games by hand found three kinds of over-counting; each was fixed and given a test.",
        tags: ["evaluation", "checking"],
      },
      {
        who: "note",
        text: "One engine took 140 seconds for 25 games, so up to three run side by side (47 seconds). Every result is cached by position, so a second visit costs nothing.",
        tags: ["caching"],
      },
      {
        who: "note",
        text: "The agent read the current Claude API documentation before writing the coach. The first live replies were rejected by the checker for writing \"Two\" and \"twice\" in headlines, and passed on the retry: the design doing its job.",
        tags: ["grounding", "prompt"],
      },
      {
        who: "note",
        text: "The first recording passed the checker first time on only 11 of 20 requests. The agent read the rejected texts, gave the model tokens for the numbers it kept trying to write, and repeated the two most-broken rules at the end of each request: 12 of 20, then 16 of 20. The strict rule about naming pieces was kept, not loosened.",
        tags: ["prompt", "evaluation"],
      },
      {
        who: "note",
        text: "Browser checks of the failure screens found a real bug: with Chess.com unreachable, saved games did not open although the message said they would. Fixed, with a test.",
        tags: ["checking"],
      },
      {
        who: "agent",
        text: "Done, deployed and pushed. Here is what was not checked (the closed-account screen, Safari, Firefox, a real phone), and two sentences in the README only you can confirm: the final hours, and who did what.",
        tags: ["checking"],
      },
    ],
  },
  {
    id: "03",
    file: "2026-11-22-session-03-rebuild.md",
    title: "Rescoping, and the rebuild as Fool Me Twice",
    date: "22 November 2026",
    where: "This repository",
    blurb: "Version 1 was truthful but read as a data display. This session turned it into a coach.",
    messages: [
      {
        who: "user",
        text: "Function 1) make a good chess coach. Function 2) explain and show my process. Right now you are doing a good job of showing data not really 1 or 2. … Keep in mind the FLOW! This has to be clean.",
      },
      {
        who: "agent",
        text: "Before building, three things to settle. Coaches modelled on real people need those people's permission, which nobody else can give. Opening theory cannot be proven by an engine, and the model should not write it from memory, so it should be quoted from an open source: a second kind of truth. And the name still is not right.",
        tags: ["grounding"],
      },
      {
        who: "user",
        text: "styled after but let's skip the voice tlak feature for now as a deliberate intention. I want to have little figures that go along with the speeches",
      },
      {
        who: "agent",
        text: "Then use characters from out-of-copyright books, drawn from the books and never from a film. A character changes the wording only: every line still cites facts and passes the same checker, and the figure's expression is picked by code.",
        tags: ["grounding", "prompt"],
      },
      { who: "user", text: "yes lets do the 4 coaches the first 4 including pooh but no q of hearts and mcblunderpants with be the opening driller." },
      {
        who: "note",
        text: "The agent tested the three opening data sources before planning. Two answered. The third refused the request, so the plan changed on the spot: Blundy's \"likely moves\" come from the player's own opponents and from the open dataset instead.",
        tags: ["checking", "grounding"],
      },
      { who: "user", text: "make it look really cool in a chat box format? like a messaging system!" },
      {
        who: "note",
        text: "The chosen coach became part of every request and of the cache key, with its own cached block in the prompt. One live reply passed the checker with a one-letter answer, so the checker gained two rules. The demo was then re-recorded for all four coaches: 76 requests, 59 passed first time, 17 after one retry, none needed the code-built fallback.",
        tags: ["prompt", "caching", "evaluation"],
      },
      {
        who: "note",
        text: "Practice answers are judged by the engine in the browser, and book moves by the open dataset. What the coaches say on those screens is fixed text with the moves put in by code: where right or wrong must be instant and certain, the model is not called at all.",
        tags: ["grounding", "caching"],
      },
      { who: "user", text: "Is there a way to get really good voices for each character?" },
      {
        who: "note",
        text: "I had asked about famous voices first. The agent searched, found no licensed option, and pointed out that an unlicensed clone on a public site undercuts a project about not faking things. So each coach got a voice designed from a written description of the book character, picked by ear. The voice service is sent the checked reply, checks it again, writes each move out in words by code, and refuses free text. Four voice models were timed on a real line before one was chosen.",
        tags: ["grounding", "evaluation", "caching"],
      },
      { who: "user", text: "On review and the puzzles I need like one or two more sentences on why the move I made was bad. Explain why the engine made a different move." },
      {
        who: "note",
        text: "This came from user testing on a twelve-year-old laptop. A model's reason for a bad move would be a guess, so the agent proposed something provable instead: keep the line the engine already prints, let code play out the line after my move and after the engine's, and count what is taken or whether it is checkmate. When the lines differ only in position, the app says it cannot prove why. The same lines can be played out on the board. For the slow laptop the engine was left alone; the coach now speaks after the newest five games and reads the rest in the background.",
        tags: ["grounding", "evaluation", "checking"],
      },
      {
        who: "note",
        text: "Each screen was opened in a headless browser and looked at. That caught a drawing cut in half by its own frame, and an opening drill that began with the wrong first move because of how the dataset files transpositions.",
        tags: ["checking"],
      },
    ],
  },
];
