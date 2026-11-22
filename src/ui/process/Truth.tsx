import { useEffect, useState } from "react";
import { DEMO_USERNAME } from "../../app/router.ts";
import { coachSlot, getSession } from "../../app/session.ts";
import { gameReviewToWire } from "../../core/coach/schema.ts";
import type { GameReview, GameReviewRequest } from "../../core/coach/types.ts";
import { validateReply } from "../../core/coach/validator.ts";
import { EVAL_REPORT_PATH, type EvalReport } from "../../core/demo.ts";
import { isKeyMoment } from "../../core/facts.ts";
import { CoachText } from "../CoachText.tsx";
import { useSession } from "../hooks.ts";
import { Link } from "../Link.tsx";

const RULES: { rule: number; name: string; text: string }[] = [
  { rule: 1, name: "The shape", text: "The reply must have exactly the expected fields, one item per fact in order, and text long enough to say something that cites its own fact." },
  { rule: 2, name: "Known IDs only", text: "Every fact and theme the reply points at must be one it was given." },
  { rule: 3, name: "Tokens resolve", text: "Every placeholder, like the move played in fact one, must name a real field of a real fact." },
  { rule: 4, name: "No chess facts in its own words", text: "No digits, no numbers written as words, no squares, no moves. Those only ever come from placeholders." },
  { rule: 5, name: "Honest theme links", text: "A moment may be tied to a recurring theme only if code already counted it as evidence for that theme." },
  { rule: 6, name: "Pieces", text: "A piece may be named only where the fact involves that piece, and never in a headline or summary." },
  { rule: 7, name: "Phase and result", text: "It may not say “endgame” about an opening move, or “won” about a lost game." },
];

const LAYERS = [
  { name: "Games", by: "Chess.com public API", text: "The game record: moves, clocks, ratings, results." },
  { name: "Engine", by: "Stockfish, in your browser", text: "Every position searched at one fixed setting, cached by position." },
  { name: "Facts", by: "Code", text: "One row per move: what was played, the engine's move, what it cost. Patterns come from tested detectors." },
  { name: "Profile", by: "Code", text: "What repeats, with counts and a minimum before it is called a theme." },
  { name: "Words", by: "The language model", text: "It sees the profile and one game's fact rows. It writes sentences that point at facts by ID." },
  { name: "Checker", by: "Code", text: "Seven rules. A failed reply is sent back once, then replaced by text built from the facts." },
];

const BREAKS = [
  { label: "Invent a move", add: " Better was Nf3." },
  { label: "Write a number", add: " That cost about 40 points." },
  { label: "Count in words", add: " You did this three times." },
  { label: "Name a square", add: " Watch the weak point on e5." },
];

function useEvalReport(): { report: EvalReport | null; problem: string | null } {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(EVAL_REPORT_PATH)
      .then((response) => {
        if (!response.ok) throw new Error(`the file returned ${response.status}`);
        return response.json() as Promise<EvalReport>;
      })
      .then(
        (data) => live && setReport(data),
        (error: unknown) => live && setProblem(error instanceof Error ? error.message : String(error)),
      );
    return () => {
      live = false;
    };
  }, []);
  return { report, problem };
}

const percent = (part: number, whole: number) => (whole === 0 ? "n/a" : `${Math.round((100 * part) / whole)}%`);

export function Truth() {
  const { report, problem } = useEvalReport();
  return (
    <article className="prose">
      <header className="stack tight">
        <p className="eyebrow">Process · how it stays truthful</p>
        <h1>
          The model explains. It never <span className="hl">decides</span>.
        </h1>
        <p className="lead">
          A coach that is wrong once about a move loses the player. So the language model in this app is never in a position to supply a chess
          fact. Here is how, with a real reply you can try to break.
        </p>
      </header>

      <section>
        <h2>Six layers, one of them a language model</h2>
        <ol className="layers">
          {LAYERS.map((layer, index) => (
            <li key={layer.name} className={layer.name === "Words" ? "model" : undefined}>
              <span className="layer-no num">{index + 1}</span>
              <div>
                <h3>{layer.name}</h3>
                <p className="faint small">{layer.by}</p>
                <p className="small">{layer.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="small muted">
          Opening ideas are a second, separate source: text quoted as written from a named open source, with its licence. The model does not
          write or reword it. Practice answers and book moves never touch the model at all.
        </p>
      </section>

      <Playground />

      <section>
        <h2>The checker&apos;s rules</h2>
        <ol className="rules">
          {RULES.map((rule) => (
            <li key={rule.rule}>
              <strong>{rule.name}.</strong> {rule.text}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Measured, not promised</h2>
        {problem && (
          <p className="notice" role="alert">
            The measurements file could not be loaded ({problem}). Run <code>npm run eval</code> to write it again.
          </p>
        )}
        {report && (
          <div className="stack">
            <p>
              These numbers are read from the file <code>npm run eval</code> writes, so this page and that command cannot disagree. Recorded{" "}
              {report.recordedAt.slice(0, 10)} on {report.games} {report.timeClass} games of the demo player, with {report.model}, prompt version{" "}
              {report.promptVersion}.
            </p>
            <div className="grid-4">
              <Stat value={`${report.shownValid} of ${report.found}`} label="recorded replies pass today's checker" />
              <Stat value={percent(report.firstTime, report.requests)} label={`passed first time (${report.firstTime} of ${report.requests})`} />
              <Stat value={percent(report.afterRetry, report.requests)} label={`passed after one retry (${report.afterRetry})`} />
              <Stat value={String(report.codeBuilt)} label="needed text built by code instead" />
            </div>
            <div className="grid-2">
              <div className="card">
                <h3>By coach</h3>
                <div className="scroll-x">
                  <table className="plain">
                    <thead>
                      <tr>
                        <th>Coach</th>
                        <th className="r">First time</th>
                        <th className="r">After retry</th>
                        <th className="r">Code-built</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byCoach.map((row) => (
                        <tr key={row.coach}>
                          <td>{row.name}</td>
                          <td className="r num">{row.firstTime}</td>
                          <td className="r num">{row.afterRetry}</td>
                          <td className="r num">{row.codeBuilt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="source-note" style={{ marginTop: 10 }}>
                  A retry is the design working, not failing: the checker caught something and the second reply passed. First replies were
                  rejected {report.rejectedByRule.map((item) => `${item.count === 1 ? "once" : `${item.count} times`} by rule ${item.rule}`).join(", ")}.
                </p>
              </div>
              <div className="card">
                <h3>Broken on purpose</h3>
                <p className="small muted">
                  Every passing reply is damaged in {report.mutations.length} known ways. Each damaged version must be rejected.
                </p>
                <p className="finding-count num" style={{ margin: "8px 0" }}>
                  {report.mutationsRejected.toLocaleString()}
                  <span> of {report.mutationsTried.toLocaleString()} rejected</span>
                </p>
                <details className="more small">
                  <summary>Each kind of damage</summary>
                  <table className="plain">
                    <tbody>
                      {report.mutations.map((row) => (
                        <tr key={row.name}>
                          <td>{row.name}</td>
                          <td className="r num">
                            {row.rejected} of {row.tried}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            </div>
            <p className="source-note">
              Cost of recording all {report.requests} replies: {report.usage.calls} model calls. {report.usage.cacheRead.toLocaleString()} input tokens
              were read from the prompt cache, {report.usage.cacheWrite.toLocaleString()} written to it, {report.usage.input.toLocaleString()} were new
              input, and {report.usage.output.toLocaleString()} were output. Playing the demo back costs nothing.
            </p>
          </div>
        )}
      </section>

      <section>
        <h2>What the checker cannot do</h2>
        <p>
          It proves that every move, number and piece on screen came from the fact table. It does not prove the advice around them is wise,
          only that it stays inside what the facts support: the right move, the right phase, the right result, a theme the code really
          counted. The honest limits are listed at the end of <Link href="/process">the story</Link>.
        </p>
      </section>
    </article>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="card stat">
      <p className="stat-value num">{value}</p>
      <p className="muted small">{label}</p>
    </div>
  );
}

/** A real recorded reply from the demo, editable, run through the real checker as you type. */
function Playground() {
  const session = getSession(DEMO_USERNAME, true);
  const state = useSession(session);
  const ready = state.phase === "ready" && state.engine.status === "done";
  const game = ready ? state.games.find((candidate) => (state.facts[candidate.uuid]?.rows.filter(isKeyMoment).length ?? 0) >= 2) : undefined;
  useEffect(() => {
    if (game) session.ensureCoach(game.uuid, "sherlock");
  }, [session, game]);
  const entry = game ? state.coach[coachSlot("sherlock", game.uuid)] : undefined;
  const usable = entry && entry.status === "ready" && entry.request.kind === "game" && entry.result.source !== "code" && entry.result.source !== "code_no_model";

  if (state.phase === "error") {
    return (
      <section>
        <h2>Try to break it</h2>
        <p className="notice">The recorded demo did not load, so there is no reply to try this on. {state.error?.message}</p>
      </section>
    );
  }
  if (!usable) {
    return (
      <section>
        <h2>Try to break it</h2>
        <p className="muted" role="status">
          <span className="spinner tiny" aria-hidden="true" />
          Loading a recorded reply from the demo
        </p>
      </section>
    );
  }
  return <PlaygroundBody request={entry.request as GameReviewRequest} review={entry.result.reply as GameReview} opponent={game!.opponentName} />;
}

function PlaygroundBody({ request, review, opponent }: { request: GameReviewRequest; review: GameReview; opponent: string }) {
  const wire = gameReviewToWire(review);
  const original = wire.items[0]!.text;
  const [text, setText] = useState(original);
  const edited = { ...wire, items: wire.items.map((item, index) => (index === 0 ? { ...item, text } : item)) };
  const verdict = validateReply(request, edited);
  return (
    <section>
      <h2>Try to break it</h2>
      <p>
        This is a real reply from the recorded demo: Sherlock Holmes on the first key moment of the game against {opponent}. The top box is
        what the model wrote. Notice it holds no moves and no numbers, only placeholders in double brackets. Edit it, or use the buttons,
        and the real checker runs as you type.
      </p>
      <div className="grid-2 playground">
        <div className="stack tight">
          <label className="eyebrow" htmlFor="play-text">
            What the model wrote
          </label>
          <textarea id="play-text" className="play-text" value={text} onChange={(event) => setText(event.target.value)} rows={7} spellCheck={false} />
          <div className="row">
            {BREAKS.map((item) => (
              <button key={item.label} className="btn ghost small" onClick={() => setText(`${text}${item.add}`)}>
                {item.label}
              </button>
            ))}
            <button className="btn small" onClick={() => setText(original)} disabled={text === original}>
              Reset
            </button>
          </div>
        </div>
        <div className="stack tight" aria-live="polite">
          <p className="eyebrow">What happens</p>
          {verdict.ok ? (
            <div className="verdict pass">
              <p>
                <strong>Passes all seven rules.</strong> The player sees this, with the values filled in from the fact table:
              </p>
              <p className="verdict-shown">
                <CoachText text={text} request={request} />
              </p>
            </div>
          ) : (
            <div className="verdict fail">
              <p>
                <strong>Rejected by rule {verdict.rule}.</strong> {verdict.detail.charAt(0).toUpperCase() + verdict.detail.slice(1)}.
              </p>
              <p className="small">
                The player never sees this. The model is told which rule failed and gets one more try. If that fails too, the text is built by
                code from the same facts.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
