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
import { OUTCOME_WORD, formatClock, formatDate, gameLength, plural } from "./format.ts";
import { LineText } from "./LineText.tsx";
import { Link } from "./Link.tsx";
import { Loading } from "./Status.tsx";
import { WinChart } from "./WinChart.tsx";

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

/**
 * How a position is introduced: the board before the opponent's last move, that move arriving, then
 * the move played in the game shown in red, then the position again for the player to try.
 */
type Intro = "before" | "opponent" | "mistake" | "done";
const INTRO_STEPS: { stage: Intro; afterMs: number }[] = [
  { stage: "opponent", afterMs: 600 },
  { stage: "mistake", afterMs: 1500 },
  { stage: "done", afterMs: 3000 },
];

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
  // Each position is counted once per visit, however often it is retried.
  const [counted, setCounted] = useState(false);
  // The stage reached, tagged with the showing it belongs to; a new position or a replay starts from "before".
  const [introAt, setIntroAt] = useState<{ showing: string; stage: Intro } | null>(null);
  const [replays, setReplays] = useState(0);
  // Looking back through the game: the number of moves played, or null when the puzzle itself is on the board.
  const [view, setView] = useState<number | null>(null);
  const puzzle = queue[position];
  const puzzleId = puzzle?.id;
  const record = useMemo(() => (puzzle ? session.getGame(puzzle.gameId) : null), [session, puzzle]);
  const hasLeadUp = record !== null && puzzle !== undefined && puzzle.ply >= 2;

  const showing = `${puzzleId}|${replays}`;
  const intro: Intro = !hasLeadUp ? "done" : introAt?.showing === showing ? introAt.stage : "before";

  useEffect(() => {
    if (!hasLeadUp) return;
    const timers = INTRO_STEPS.map((step) => window.setTimeout(() => setIntroAt({ showing, stage: step.stage }), step.afterMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [showing, hasLeadUp]);

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
    if (counted) return;
    setCounted(true);
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

  const goTo = (target: number) => {
    setPosition(target);
    setStep({ kind: "ask" });
    setMissedThisGo(false);
    setCounted(false);
    setView(null);
  };
  const next = () => goTo(position + 1);
  const retry = () => {
    setStep({ kind: "ask" });
    setView(null);
  };

  const done = step.kind === "shown" || (step.kind === "judged" && (step.verdict.kind === "best" || step.verdict.kind === "good"));
  const moves = record?.moves ?? [];
  // The position the puzzle starts from is the one after `puzzle.ply - 1` moves of the game.
  const puzzleAt = puzzle.ply - 1;
  const opponentMove = hasLeadUp ? moves[puzzleAt - 1] : undefined;
  const introducing = step.kind === "ask" && intro !== "done";
  const looking = view !== null && view !== puzzleAt;

  let boardFen = puzzle.fen;
  let lastMove: string | null = opponentMove?.uci ?? null;
  let tint: "right" | "wrong" | null = null;
  let slide = false;
  if (looking) {
    boardFen = view === 0 ? moves[0]!.fenBefore : moves[view - 1]!.fenAfter;
    lastMove = view > 0 ? moves[view - 1]!.uci : null;
  } else if (introducing && intro === "before" && opponentMove) {
    boardFen = opponentMove.fenBefore;
    lastMove = null;
  } else if (introducing && intro === "opponent") {
    slide = true;
  } else if (introducing && intro === "mistake") {
    const played = playMove(puzzle.fen, puzzle.playedUci);
    if (played) {
      boardFen = played.fen;
      lastMove = puzzle.playedUci;
      tint = "wrong";
      slide = true;
    }
  } else if (step.kind === "checking" || step.kind === "judged") {
    boardFen = step.fen;
    lastMove = step.uci;
    tint = step.kind === "judged" ? (step.verdict.kind === "best" || step.verdict.kind === "good" ? "right" : step.verdict.kind === "wrong" ? "wrong" : null) : null;
  }
  const describe = (at: number): string => {
    if (at === 0) return "Start";
    const move = moves[at - 1]!;
    return `${move.moveNumber}${move.color === "white" ? "." : "…"} ${move.san}`;
  };
  const table = state.facts[puzzle.gameId];
  const under = looking
    ? `Looking back: ${describe(view)}.`
    : introducing
      ? intro === "mistake"
        ? "In the game you played this."
        : "Your opponent has just moved."
      : step.kind === "ask"
        ? `${side} to move. Click or drag a piece.`
        : " ";

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
          slide={slide}
          arrows={step.kind === "shown" && !looking ? [{ uci: puzzle.answerUci, kind: "best" }] : []}
          label={`Practice position, ${side} to move, seen from ${side}'s side`}
          onMove={step.kind === "ask" && !introducing && !looking ? attempt : undefined}
        />
        {hasLeadUp && (
          <div className="board-controls" role="group" aria-label="Look back through the game">
            <button className="iconbtn" onClick={() => setView(Math.max(0, (view ?? puzzleAt) - 1))} disabled={(view ?? puzzleAt) === 0} aria-label="One move back">
              ◀
            </button>
            <span className="muted small board-where" aria-live="polite">
              {under}
            </span>
            <button className="iconbtn" onClick={() => setView((view ?? puzzleAt) + 1)} disabled={!looking} aria-label="One move forward">
              ▶
            </button>
          </div>
        )}
        {!hasLeadUp && (
          <p className="muted small" style={{ textAlign: "center" }}>
            {under}
          </p>
        )}
        {hasLeadUp && (
          <div className="row" style={{ justifyContent: "center" }}>
            {looking ? (
              <button className="btn small" onClick={() => setView(null)}>
                Back to the position
              </button>
            ) : (
              <button
                className="btn ghost small"
                disabled={introducing}
                onClick={() => {
                  retry();
                  setReplays(replays + 1);
                }}
              >
                Replay the lead-up
              </button>
            )}
          </div>
        )}
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
            <>
              <button className="btn" onClick={next} autoFocus>
                {position + 1 < queue.length ? "Next position →" : "Finish"}
              </button>
              <button className="btn ghost" onClick={retry}>
                Try it once more
              </button>
            </>
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

        <nav className="row between" aria-label="Other positions">
          <button className="btn ghost small" onClick={() => goTo(position - 1)} disabled={position === 0}>
            ← Previous position
          </button>
          <button className="btn ghost small" onClick={next} disabled={done || position + 1 >= queue.length}>
            Skip this one →
          </button>
        </nav>

        <div className="card stack tight">
          <h3>Where this comes from</h3>
          <dl className="facts-list">
            {game && (
              <>
                <dt>Game</dt>
                <dd>
                  {OUTCOME_WORD[game.outcome]} against {game.opponentName} ({game.opponentRating}), {formatDate(game.endTime)}
                </dd>
                {game.timeControl && (
                  <>
                    <dt>Time</dt>
                    <dd>
                      {gameLength(game.timeControl)}
                      {puzzle.clockLeft !== null && `, ${formatClock(puzzle.clockLeft)} left on your clock`}
                      {puzzle.timeSpent !== null && `, ${puzzle.timeSpent}s spent on the move`}
                    </dd>
                  </>
                )}
              </>
            )}
            <dt>Move</dt>
            <dd>
              Move {puzzle.moveNumber}, {puzzle.phase}. In the game it gave up {Math.round(puzzle.loss)} points of winning chance.{" "}
              <Link href={gamePath(state.username, state.demo, puzzle.gameId, puzzle.ply)}>See it in the game</Link>
            </dd>
          </dl>
        </div>

        {table && record && (
          <div className="card stack tight">
            <h3>Your winning chance in that game</h3>
            <WinChart
              line={table.winLine}
              current={view ?? puzzleAt}
              markers={[{ index: puzzleAt, label: "this position" }]}
              describe={describe}
              // Only the game up to this position can be opened here; what came after would give the game away.
              onSelect={(at) => setView(Math.min(at, puzzleAt))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
