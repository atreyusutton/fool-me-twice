import { Link } from "../Link.tsx";
import { PRINCIPLES, type Principle } from "./highlights.ts";

const WHERE: Record<Principle, string> = {
  context:
    "The coach model sees a compact profile of the player and the fact rows for one game. It never sees a raw game file. The build agent, too, got a clean repository with a spec and a short list of rules, not my whole application folder.",
  prompt:
    "The instructions put what never changes first (the rules, then the coach's character, then the player's profile) and the one game last, and the model must answer in a fixed structure. The prompt lives in one file with a version string.",
  grounding:
    "Every sentence points at engine facts by ID. The screen fills in each move and number from the fact table. Opening ideas are quoted from a named source. The model is never in a position to supply a chess fact.",
  caching:
    "Four levels: game archives, engine results by position, fact tables by game, coach replies by content. The stable part of the prompt is reused across requests. A second visit costs nothing.",
  evaluation:
    "A checker runs on every reply before a player sees it. One command re-checks every recorded reply and then breaks each one on purpose to prove the checker catches it.",
  checking:
    "The agent ran the app in a browser and looked at the screens after each step. Several of the bugs in the transcripts were found that way, not by tests.",
};

export function Story() {
  return (
    <article className="prose">
      <header className="stack tight">
        <p className="eyebrow">Process · the story</p>
        <h1>
          How I built a chess coach that <span className="hl">cannot make up chess</span>
        </h1>
        <p className="lead">
          This is my take-home project for the Chess.com engineering internship. The brief judges the process as well as the result, so this
          tab shows the process: what I thought about, what I decided, and the working sessions with the AI agent that wrote the code.
        </p>
      </header>

      <section>
        <h2>It started in a different folder</h2>
        <p>
          Before this project there was one working folder for my internship application. I work in it with Claude Code, an AI coding agent
          that runs in my terminal. Over about a week that folder came to hold my application answers and the reasoning behind them, a private
          interview practice app built from my real resume and project pages, and a small memory of notes the agent keeps between sessions:
          decisions I made, corrections I gave it, what was still open.
        </p>
        <p>
          That is the first AI principle here, before any code: <strong>context is the product.</strong> The agent was useful because the right
          facts were in reach, and because a wrong fact got corrected and written down once instead of repeated.
        </p>
        <p>
          When the take-home arrived I did the planning in that same folder, so the agent already knew my background and what I wanted to
          build. Then I moved to a clean repository for the build, carrying only what the build needs.
        </p>

        <figure className="repos" aria-label="Two repositories: the application folder produced the prompt and rules that started this repository">
          <div className="repo">
            <p className="eyebrow">Repository one</p>
            <h3>The application folder</h3>
            <ul>
              <li>My application answers</li>
              <li>An interview practice app</li>
              <li>The agent&apos;s notes between sessions</li>
              <li>
                <strong>Session 01:</strong> the brainstorm
              </li>
            </ul>
            <p className="faint small">Stays private. Interview notes and people&apos;s names do not leave it.</p>
          </div>
          <div className="repo-arrow">
            <p className="eyebrow">Carried over</p>
            <ul>
              <li>The kickoff prompt</li>
              <li>Rules for the agent</li>
              <li>The specification</li>
              <li>This story</li>
            </ul>
            <span aria-hidden="true">→</span>
          </div>
          <div className="repo here">
            <p className="eyebrow">Repository two</p>
            <h3>This one</h3>
            <ul>
              <li>The rules and the spec, in the repo</li>
              <li>
                <strong>Session 02:</strong> building version 1
              </li>
              <li>
                <strong>Session 03:</strong> the rebuild
              </li>
              <li>The app you are looking at</li>
            </ul>
            <p className="faint small">Everything a reviewer needs, and nothing else.</p>
          </div>
        </figure>
        <p>
          <Link href="/process/transcripts">Read the three sessions as conversations →</Link>
        </p>
      </section>

      <section>
        <h2>The idea</h2>
        <p>
          The take-home offered two tracks: predict game results with a machine-learning model, or build an AI chess coach on a language model
          and Chess.com&apos;s public API. I chose the coach, because applied AI is where my experience is.
        </p>
        <p>
          Chess.com&apos;s game review explains one game. Its statistics show totals. Nothing connects them: the coach does not know you. I wanted
          a coach that remembers, one that reviews a game and tells you which of your mistakes keep coming back. I brainstormed alternatives
          with the agent and kept my original idea.
        </p>
      </section>

      <section>
        <h2>The principle I would not trade</h2>
        <p>
          Chess.com&apos;s first value is “Mission First”. I read that as: the player&apos;s experience and their trust come first. A chess coach
          that invents a move, or disagrees with the engine, loses that trust the first time it happens.
        </p>
        <p>
          So the rule is <strong>engine truth</strong>. The chess engine and the game record are the only sources of chess facts. The language
          model explains; it never decides. It does not write a move, a square or a number. It points at rows in a table of facts, and the
          screen fills in the values. Code checks every reply before a player sees it.
        </p>
        <p>
          <Link href="/process/truth">See how that works, and try to break it →</Link>
        </p>
      </section>

      <section>
        <h2>First decisions, and why</h2>
        <ul className="decisions">
          <li>
            <strong>Look at the data first.</strong> The public API returns games with clock times, ratings and openings, but no engine
            analysis. So engine truth had to be computed by the app. That one finding shaped the design.
          </li>
          <li>
            <strong>Themes come only from patterns code can prove.</strong> Language models are unreliable at naming tactics. The list of
            patterns is short, each one is defined in code, and each has tests.
          </li>
          <li>
            <strong>Small samples are stated, not hidden.</strong> A theme needs a minimum count and always shows its numbers. With too little
            evidence, the coach says so.
          </li>
          <li>
            <strong>Only clear mistakes.</strong> A quick engine search can misjudge close decisions, so the coach talks about the ones that
            are not close.
          </li>
          <li>
            <strong>The engine runs in the browser.</strong> Nothing to install or host, and a player&apos;s games never leave their machine. The
            cost is a wait the first time, handled with progress and caching.
          </li>
          <li>
            <strong>A recorded demo.</strong> Anyone can run the app with one command and no API key.
          </li>
          <li>
            <strong>Start at my own level.</strong> I am rated about 750 on a new account with too few games to study, so development started
            with a public account rated about 800, where I can check the chess by eye.
          </li>
        </ul>
      </section>

      <section>
        <h2>Version 1, then version 2</h2>
        <p>
          Version 1 was called Motif. It did what the rule demanded, and it read like a dashboard: it showed data well and coached badly. So I
          rescoped it to two jobs, <strong>be a good chess coach</strong> and <strong>show the process</strong>, and had the interface rebuilt
          from a blank page.
        </p>
        <ul className="decisions">
          <li>
            <strong>A flow, not a display.</strong> Your read, then a review with your coach, then practice on your own mistakes, then your
            openings. One main action per screen.
          </li>
          <li>
            <strong>Coaches with character.</strong> I first asked for coaches modelled on well-known chess personalities. The agent pointed
            out that nobody else can give permission for a real person&apos;s name and manner, so the coaches are characters from books that are
            out of copyright: Sherlock Holmes, Winnie-the-Pooh, Captain Hook and Count Dracula, drawn from the books and not from any film. A
            character changes the wording only. Every line passes the same checker.
          </li>
          <li>
            <strong>Voices, last.</strong> I first dropped spoken coaches on purpose, in favour of small animated figures with speech
            bubbles. Once the rest worked I added them back: one voice per coach, designed from a written description of the book character
            and never cloned from a real person. A voice reads only text that has already passed the checker.
          </li>
          <li>
            <strong>A second source of truth.</strong> Opening ideas cannot be proven by an engine, and I did not want the model writing theory
            from memory. So they are quoted, as written, from a named open source with its licence beside them.
          </li>
          <li>
            <strong>Blundy McBlunderpants.</strong> The app&apos;s own character, and your opponent in the opening drill, where a plausible,
            imperfect opponent is exactly the job.
          </li>
          <li>
            <strong>A new name.</strong> Fool Me Twice says what the app is for: the mistake you make once is bad luck; the one that keeps
            coming back is the one worth fixing.
          </li>
        </ul>
      </section>

      <section>
        <h2>The AI principles, in plain words</h2>
        <div className="grid-2">
          {(Object.keys(PRINCIPLES) as Principle[]).map((key) => (
            <div className="card stack tight" key={key}>
              <h3>{PRINCIPLES[key].label}</h3>
              <p className="muted">{PRINCIPLES[key].meaning}</p>
              <p className="small">{WHERE[key]}</p>
            </div>
          ))}
        </div>
        <p className="small muted">The same six labels mark the moments in the session summaries where each one shows up.</p>
      </section>

      <section>
        <h2>Who did what</h2>
        <p>
          The planning, the trade-offs and the specification were worked out in conversation with Claude Code. The code in this repository was
          written by the agent from that specification and a short list of rules. My part was the idea, the rules and the decisions. The
          transcripts, the decision log and the time log are in the repository, and the transcripts are on the next page.
        </p>
        <p>
          Time: version 1 took 4 hours 50 minutes by the time log, against a guideline of four. The version 2 rebuild is logged separately in{" "}
          <code>docs/TIMELOG.md</code>.
        </p>
      </section>

      <section>
        <h2>Honest limits</h2>
        <ul className="decisions">
          <li>The engine search is shallow next to a full analysis, which is why only clear mistakes are discussed.</li>
          <li>The list of patterns is short on purpose: six mistakes and two strengths that code can prove.</li>
          <li>Twenty-five games support common themes only.</li>
          <li>The demo is one player, rated about 800.</li>
          <li>Opening ideas are quoted only for openings the source has a page for. For the rest the app says it has nothing.</li>
          <li>“In the book” means a named line contains the move. It does not mean the move is best.</li>
        </ul>
      </section>

      <section>
        <h2>What I want to build next</h2>
        <p>
          Scouting an opponent: study one player&apos;s games and prepare for their style. My reason is simple. I have never beaten my dad, who
          is rated about 1500, and I want to. After that, a ladder of stronger demo players, with their permission.
        </p>
      </section>
    </article>
  );
}
