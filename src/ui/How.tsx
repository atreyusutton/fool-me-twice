import { Link } from "./Link.tsx";

/**
 * "How this was built". Written from docs/STORY.md, the transcripts, the time log and the code.
 * Nothing here may claim more than those sources say.
 */
export function How() {
  return (
    <article className="prose">
      <p className="eyebrow">How this was built</p>
      <h1>A coach that is not allowed to make up chess</h1>
      <p className="lead">
        Motif is my take-home project for the Chess.com engineering internship. This page explains the idea, the one rule I
        would not trade, and how AI was used to plan and build it.
      </p>

      <h2>The idea</h2>
      <p>
        Chess.com&apos;s game review explains one game. Its statistics show totals. Nothing connects them: the coach does not
        know you. I wanted a coach that remembers, one that reviews a game and tells you which of your mistakes keep coming
        back.
      </p>
      <p>
        The take-home offered two tracks: predict game results with a machine-learning model, or build an AI chess coach
        using a language model and Chess.com&apos;s public API. I chose the coach because applied AI is where my experience
        is. I brainstormed alternatives with a coding agent and kept my original idea. The others are logged for later.
      </p>

      <h2>The rule: engine truth</h2>
      <p>
        Chess.com&apos;s first value is &quot;Mission First&quot;. I read that as: the player&apos;s experience and their
        trust come first. A chess coach that invents a move, or disagrees with the engine, loses that trust the first time
        it happens.
      </p>
      <p>
        So the chess engine and the game record are the only sources of chess facts here, and the language model is never in
        a position to make one up. That is done in five layers:
      </p>
      <ol>
        <li>
          <strong>The engine decides.</strong> Stockfish checks every position of every game, in your browser. Code turns
          its results into a table of facts: the move you played, the move the engine preferred, and how much winning
          chance the move gave up.
        </li>
        <li>
          <strong>Patterns are proven by code.</strong> Language models are unreliable at naming tactics. So the list of
          patterns is short (a piece left hanging, free material not taken, a checkmate missed or allowed, a mistake played
          too fast or with the clock running out), each one is defined in code, and each has tests on known positions.
        </li>
        <li>
          <strong>Only what is clear, only what repeats.</strong> A quick engine search can misjudge close decisions, so the
          coach talks only about mistakes that are not close. A theme needs at least three occurrences in three different
          games, and always shows its count. If there is not enough evidence, the coach says so.
        </li>
        <li>
          <strong>The model points; the screen fills in.</strong> The model gets rows from the fact table and may only
          point to them by ID. Where it wants a move or a number it writes a placeholder, and the screen fills in the
          value from the table. The highlighted moves and numbers in the coach&apos;s text are those values.
        </li>
        <li>
          <strong>Every reply is checked.</strong> A checker written in code rejects any reply that contains a move, a
          square or a number of its own, that names a piece the fact does not involve, or that ties a moment to a theme
          it is not evidence for. A rejected reply is sent back once with the reason. If it fails again, you get text
          built by code from the same facts. An unchecked reply is never shown.
        </li>
      </ol>
      <p>
        Under each piece of coach text there is a line saying where it came from, and a &quot;What this text cost&quot;
        section with the token counts the API reported, including any reply that was rejected and why.
      </p>

      <h2>First decisions, and why</h2>
      <ul>
        <li>
          <strong>The first thing we did was look at the data.</strong> The public API returns games with clock times,
          ratings and openings, but no engine analysis. So engine truth had to be computed by this app. That one finding
          shaped the design.
        </li>
        <li>
          <strong>The engine runs in the browser.</strong> Nothing to install, nothing to host, and a player&apos;s games
          never leave their machine. The trade-off is a wait the first time, handled with progress and caching.
        </li>
        <li>
          <strong>TypeScript, not Chess.com&apos;s backend languages.</strong> I considered building in their stack to
          show range and decided a clean build in a language I know, which is also on their list, says more than a rushed
          one in a language I don&apos;t.
        </li>
        <li>
          <strong>A recorded demo.</strong> Anyone can run the app with one command and no API key.
        </li>
        <li>
          <strong>Start at my own level.</strong> I am rated about 750 on a new account with too few games to study. So
          development started with a public account rated about 800 with more than 2,000 rapid games, where I can check
          the chess by eye, before moving to stronger players. That account, Antwacky, is the <Link href="/demo">demo</Link>.
        </li>
      </ul>

      <h2>How AI was used, in plain terms</h2>
      <dl className="terms">
        <dt>Context is the product</dt>
        <dd>
          Before this project there was a single working folder for my internship application, where I work with Claude
          Code, an AI coding agent that runs in my terminal. It held my application answers and the reasoning behind them,
          a private interview practice app, and a small memory of notes the agent keeps between sessions. The agent was
          useful because it had the right facts in reach, and because wrong facts got corrected and written down once
          instead of repeated. I planned the take-home in that folder, then moved to a clean repository for the build,
          carrying only what the build needs.
        </dd>
        <dt>Planning with an agent</dt>
        <dd>The brainstorm, the trade-offs and the specification were worked out in conversation with Claude Code.</dd>
        <dt>Building with an agent</dt>
        <dd>
          The code in this repository was written by a coding agent from a written specification and a short list of
          rules. My part was the idea, the rules and the decisions. The transcripts of both sessions are in the
          repository, so you can read exactly what I asked for and what the agent did.
        </dd>
        <dt>Context engineering</dt>
        <dd>
          Giving a model the right information and nothing else. The coach model sees a compact profile of the player and
          the facts for one game. It never sees raw game files.
        </dd>
        <dt>Prompt engineering</dt>
        <dd>
          Writing instructions so the output is predictable. The instructions put the unchanging parts first and the
          changing part last, and the model must answer in a fixed structure.
        </dd>
        <dt>Grounding</dt>
        <dd>Tying what a model says to a source that can be checked. Every sentence points to engine facts by ID.</dd>
        <dt>Caching</dt>
        <dd>
          Not paying twice for the same work. Games, engine results, fact tables and coach replies are each stored after
          the first time.
        </dd>
        <dt>Evaluation</dt>
        <dd>
          Checking the output instead of trusting it. The checker runs on every reply, and one command reports how often
          replies pass, and confirms that deliberately broken replies are rejected.
        </dd>
      </dl>

      <h2>Honest limits</h2>
      <ul>
        <li>The engine search is shallow compared with a full analysis. That is why only clear mistakes are discussed.</li>
        <li>
          The pattern list is short on purpose. Many mistakes match no pattern, and for those the coach can say what the
          engine preferred and what it cost, but not why.
        </li>
        <li>25 games supports common themes only. Rare habits will not reach the minimum count.</li>
        <li>The demo and the measurements are from one player rated about 800.</li>
        <li>The checker is strict, so it sometimes rejects a harmless sentence. Then the reply is retried or replaced.</li>
      </ul>

      <h2>What I want to build next</h2>
      <ul>
        <li>
          <strong>Puzzles from your own blunders.</strong> Practice positions taken from your own games, for the theme the
          coach found. The engine&apos;s move is the answer.
        </li>
        <li>
          <strong>Scout an opponent.</strong> Study one opponent&apos;s games and prepare for their style. My reason: I
          have never beaten my dad, who is rated about 1500, and I want to.
        </li>
        <li>
          <strong>A level ladder.</strong> After the 800-level demo, run it on stronger players, with their permission.
        </li>
      </ul>
      <p className="muted small">
        Chess facts come from Stockfish (GPL-3.0). Piece images are the cburnett set by Colin M.L. Burnett (GPLv2+). Motif
        is not affiliated with Chess.com.
      </p>
    </article>
  );
}
