import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCoach } from "../app/coach-choice.ts";
import { gamePath, playerPath, useSearch } from "../app/router.ts";
import type { PlayerSession, SessionState } from "../app/session.ts";
import { fixedLine, type FixedLine } from "../app/voice.ts";
import { THEME_COPY } from "../core/profile.ts";
import { buildPuzzles, judgeAttempt, playMove, practiceQueue, recordResult, type PracticeProgress, type Puzzle, type Verdict } from "../core/puzzles.ts";
import type { FactTable, PatternTag } from "../core/types.ts";
import { Board } from "./Board.tsx";
import type { Mood } from "./coaches/Figure.tsx";
import { Say } from "./coaches/Say.tsx";
import { OUTCOME_WORD, plural } from "./format.ts";
import { LineText } from "./LineText.tsx";
import { Link } from "./Link.tsx";
import { Loading } from "./Status.tsx";

const Move = ({ san, kind }: { san: string; kind?: "played" | "best" }) => <span className={`san fact${kind ? ` ${kind}` : ""}`}>{san}</span>;

export function Practice({ session, state, theme }: { session: PlayerSession; state: SessionState; theme: string | null }) {
  const first = new URLSearchParams(useSearch()).get("p");
  const [progress, setProgress] = useState<PracticeProgress | null>(null);
  useEffect(() => {
    let live = true;
    void session.loadProgress<PracticeProgress>("puzzles").then((saved) => {
      if (live) setProgress(saved ?? {});
    });
    return () => {
      live = false;
    };
  }, [session]);

  const tables = Object.values(state.facts) as FactTable[];
  const puzzles = useMemo(() => buildPuzzles(tables), [tables.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = new Map<PatternTag, number>();
  for (const puzzle of puzzles) for (const tag of puzzle.patterns) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const to = (sub = "") => playerPath(state.username, state.demo, sub);
  const solved = progress ? puzzles.filter((puzzle) => progress[puzzle.id]?.lastRight).length : 0;

  if (!progress) return <Loading title="Setting up your puzzles" />;

  return (
    <>
      <header className="stack tight">
        <p className="eyebrow">Practice</p>
        <h1 className="h1-small">
          Take it <span className="hl">again</span>
        </h1>
        <p className="muted">Your own positions, at the moment it went wrong. The engine checks your answer; no AI decides what is right.</p>
      </header>

      {puzzles.length > 0 && (
        <nav className="row" aria-label="Choose what to practise">
          <Link className="pill" href={to("practice")} aria-current={theme === null ? "page" : undefined}>
            All mistakes <span className="num">{puzzles.length}</span>
          </Link>
          {[...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([tag, count]) => (
              <Link key={tag} className="pill" href={to(`practice/${tag}`)} aria-current={theme === tag ? "page" : undefined}>
                {THEME_COPY[tag].label} <span className="num">{count}</span>
              </Link>
            ))}
          <span className="muted small" style={{ marginLeft: "auto" }}>
            {solved} of {puzzles.length} solved first time
          </span>
        </nav>
      )}

      {puzzles.length === 0 ? (
        <div className="card stack">
          <h2>{state.engine.status === "done" ? "No clear mistakes to practise" : "Your puzzles are on their way"}</h2>
          <p className="muted">
            {state.engine.status === "done"
              ? "The engine found no move in these games that clearly gave away winning chance. Puzzles are only made from clear mistakes."
              : `The engine is still checking your games (${state.engine.gamesDone} done). Puzzles appear here as mistakes are found.`}
          </p>
        </div>
      ) : (
        <Run
          key={`${theme ?? "all"}|${first ?? ""}|${puzzles.length}`}
          session={session}
          state={state}
          queue={practiceQueue(puzzles, progress, theme, first)}
          progress={progress}
          onProgress={(next) => {
            setProgress(next);
            void session.saveProgress("puzzles", next);
          }}
        />
      )}
    </>
  );
}

type Step =
  | { kind: "ask" }
  | { kind: "checking"; uci: string; san: string; fen: string }
  | { kind: "judged"; uci: string; san: string; fen: string; verdict: Verdict }
  | { kind: "shown" };

function Run({
  session,
  state,
  queue: initialQueue,
  progress,
  onProgress,
}: {
  session: PlayerSession;
  state: SessionState;
  queue: Puzzle[];
  progress: PracticeProgress;
  onProgress: (next: PracticeProgress) => void;
}) {
  const coach = useCoach();
  // The queue is fixed when the run starts. A missed puzzle is added once more at the end, so it comes back.
  const [queue, setQueue] = useState(initialQueue);
  const [position, setPosition] = useState(0);
  const [step, setStep] = useState<Step>({ kind: "ask" });
  const [missedThisGo, setMissedThisGo] = useState(false);
  const [tally, setTally] = useState({ right: 0, missed: 0 });
  const puzzle = queue[position];
  const to = (sub = "") => playerPath(state.username, state.demo, sub);

  if (!puzzle) {
    return (
      <div className="card lift stack">
        <Say who={coach} mood={tally.missed === 0 ? "pleased" : "talking"} voice={fixedLine("practice.set", coach, tally).voice}>
          <p className="bubble-title">That is the set.</p>
          <p>
            {plural(tally.right, "position")} right first time{tally.missed > 0 ? `, ${tally.missed} to see again.` : "."}
          </p>
        </Say>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              setQueue(practiceQueue(initialQueue, progress, null));
              setPosition(0);
              setTally({ right: 0, missed: 0 });
            }}
          >
            Go again, missed ones first
          </button>
          <Link className="btn ghost" href={to("openings")}>
            Drill your openings
          </Link>
          <Link className="btn ghost" href={to()}>
            Back to your read
          </Link>
        </div>
      </div>
    );
  }

  const game = state.games.find((candidate) => candidate.uuid === puzzle.gameId);
  const side = puzzle.color === "white" ? "White" : "Black";

  const finish = (right: boolean) => {
    const firstTime = right && !missedThisGo;
    onProgress(recordResult(progress, puzzle.id, firstTime, Date.now()));
    setTally((before) => ({ right: before.right + (firstTime ? 1 : 0), missed: before.missed + (firstTime ? 0 : 1) }));
    // Bring a missed position back once, at the end of this run.
    if (!firstTime && queue.filter((item) => item.id === puzzle.id).length === 1) setQueue((before) => [...before, puzzle]);
  };

  const attempt = (uci: string) => {
    const played = playMove(puzzle.fen, uci);
    if (!played) return;
    const settle = (verdict: Verdict) => {
      setStep({ kind: "judged", uci, san: played.san, fen: played.fen, verdict });
      if (verdict.kind === "best" || verdict.kind === "good") finish(true);
      else setMissedThisGo(true);
    };
    // The engine's move and the game's move are already in the fact table; anything else goes to the engine.
    if (uci === puzzle.answerUci || uci === puzzle.playedUci) {
      settle(judgeAttempt(puzzle, uci, null));
      return;
    }
    setStep({ kind: "checking", uci, san: played.san, fen: played.fen });
    void session.evaluate(played.fen).then((result) => settle(judgeAttempt(puzzle, uci, result)));
  };

  const next = () => {
    setPosition(position + 1);
    setStep({ kind: "ask" });
    setMissedThisGo(false);
  };

  const done = step.kind === "shown" || (step.kind === "judged" && (step.verdict.kind === "best" || step.verdict.kind === "good"));
  const boardFen = step.kind === "checking" || step.kind === "judged" ? step.fen : puzzle.fen;
  const lastMove = step.kind === "checking" || step.kind === "judged" ? step.uci : null;
  const tint = step.kind === "judged" ? (step.verdict.kind === "best" || step.verdict.kind === "good" ? "right" : step.verdict.kind === "wrong" ? "wrong" : null) : null;

  // What the coach says is one of the app's fixed lines; the moves and numbers are put in by code.
  let mood: Mood = "talking";
  let said: FixedLine | null = null;
  if (step.kind === "ask") {
    said = fixedLine("practice.ask", coach, { played: puzzle.playedSan });
  } else if (step.kind === "checking") {
    mood = "thinking";
  } else if (step.kind === "shown") {
    said = fixedLine("practice.shown", coach, { best: puzzle.answerSan });
  } else if (step.verdict.kind === "best") {
    mood = "pleased";
    said = fixedLine("practice.best", coach, { move: step.san });
  } else if (step.verdict.kind === "good") {
    mood = "pleased";
    said = fixedLine("practice.good", coach, { move: step.san, best: puzzle.answerSan, loss: step.verdict.loss });
  } else if (step.verdict.kind === "wrong") {
    mood = "wince";
    said = fixedLine(step.verdict.sameAsGame ? "practice.same" : "practice.wrong", coach, { move: step.san, loss: step.verdict.loss });
  } else {
    mood = "thinking";
    said = fixedLine("practice.unchecked", coach, { move: step.san });
  }
  const speech: ReactNode = said ? (
    <p>
      <LineText parts={said.parts} />
    </p>
  ) : (
    step.kind === "checking" && (
      <p>
        <span className="spinner tiny" aria-hidden="true" />
        Checking <Move san={step.san} /> with the engine.
      </p>
    )
  );

  return (
    <div className="review">
      <div className="review-board stack">
        <Board
          fen={boardFen}
          orientation={puzzle.color}
          lastMove={lastMove}
          tint={tint}
          arrows={step.kind === "shown" ? [{ uci: puzzle.answerUci, kind: "best" }] : []}
          label={`Practice position, ${side} to move, seen from ${side}'s side`}
          onMove={step.kind === "ask" ? attempt : undefined}
        />
        <p className="muted small" style={{ textAlign: "center" }}>
          {step.kind === "ask" ? `${side} to move. Click or drag a piece.` : " "}
        </p>
      </div>

      <div className="review-coach stack">
        <div className="stack tight">
          <div className="row between">
            <span className="eyebrow">
              Position {Math.min(position + 1, queue.length)} of {queue.length}
            </span>
            <span className="row">
              {puzzle.patterns.map((tag) => (
                <span className="chip warn" key={tag}>
                  {THEME_COPY[tag].label}
                </span>
              ))}
            </span>
          </div>
          <div className="bar" aria-hidden="true">
            <i style={{ width: `${(position / queue.length) * 100}%` }} />
          </div>
        </div>

        <div aria-live="polite">
          <Say who={coach} mood={mood} size={88} voice={said?.voice}>
            {speech}
          </Say>
        </div>

        <div className="row">
          {done ? (
            <button className="btn" onClick={next} autoFocus>
              {position + 1 < queue.length ? "Next position →" : "Finish"}
            </button>
          ) : (
            step.kind === "judged" && (
              <>
                <button className="btn" onClick={() => setStep({ kind: "ask" })} autoFocus>
                  Try again
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setStep({ kind: "shown" });
                    finish(false);
                  }}
                >
                  Show the answer
                </button>
              </>
            )
          )}
          {step.kind === "ask" && (
            <button
              className="btn ghost small"
              onClick={() => {
                setStep({ kind: "shown" });
                finish(false);
              }}
            >
              Show the answer
            </button>
          )}
        </div>

        <p className="source-note">
          Move {puzzle.moveNumber}, {puzzle.phase}
          {game && `, from the game you ${OUTCOME_WORD[game.outcome].toLowerCase()} against ${game.opponentName}`}. In the game this move
          gave up {Math.round(puzzle.loss)} points of winning chance.{" "}
          <Link href={gamePath(state.username, state.demo, puzzle.gameId, puzzle.ply)}>See it in the game</Link>
        </p>
      </div>
    </div>
  );
}
