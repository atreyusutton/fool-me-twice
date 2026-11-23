import { useEffect, useState, type ReactNode } from "react";
import type { PlayerSession } from "../app/session.ts";
import { winChance } from "../core/facts.ts";
import { playMove } from "../core/puzzles.ts";
import type { Color } from "../core/types.ts";
import { explain, followLine, materialSwing, type LineOutcome, type Why } from "../core/why.ts";
import { LineText } from "./LineText.tsx";

/** One move to explain: the position it was played in, and the move itself. */
export interface Subject {
  id: string;
  /** The position before the move. */
  fen: string;
  playedUci: string;
  playedSan: string;
  color: Color;
}

type Loaded =
  | { id: string; ok: true; playedFen: string; afterPlayed: LineOutcome; fromBefore: LineOutcome; why: Why }
  | { id: string; ok: false };

/** A position reached while playing a line out, and how it was reached. */
interface Spot {
  fen: string;
  uci: string | null;
  san: string | null;
  by: "start" | "line" | "you" | "engine";
  /** The player's winning chance here, when the engine was asked. */
  win: number | null;
}
interface Walk {
  id: string;
  which: "played" | "best";
  spots: Spot[];
  at: number;
  busy: boolean;
  note: string | null;
}

export interface Explore {
  /** The explanation card: both lines, what they come to, and the buttons to play them out. */
  why: ReactNode;
  /** True while a line is on the board in place of the game or the puzzle. */
  active: boolean;
  fen: string;
  lastMove: string | null;
  slide: boolean;
  onMove: ((uci: string) => void) | undefined;
  /** The controls that go under the board while a line is on it. */
  controls: ReactNode;
}

/**
 * Explains one move with the engine's own lines and lets the player play them out. The lines come
 * from the engine at its usual depth; the words about them are built by code (`src/core/why.ts`).
 * When the player plays a move of their own, the engine answers it. No language model is involved.
 *
 * With `full` false (a puzzle not yet answered) only what went wrong with the move played is shown,
 * and only when it lost material or was checkmated. The engine's own move stays hidden.
 */
export function useExplore(session: PlayerSession, subject: Subject | null, backLabel: string, full = true): Explore {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [walk, setWalk] = useState<Walk | null>(null);
  const id = subject?.id ?? null;

  useEffect(() => {
    if (!subject) return;
    let live = true;
    void (async () => {
      const played = playMove(subject.fen, subject.playedUci);
      const before = await session.line(subject.fen);
      const after = played ? await session.line(played.fen) : null;
      if (!live) return;
      if (!played || !before?.pv) {
        setLoaded({ id: subject.id, ok: false });
        return;
      }
      const fromBefore = followLine(subject.fen, before.pv, subject.color);
      const afterPlayed = followLine(played.fen, after?.pv ?? [], subject.color);
      setLoaded({ id: subject.id, ok: true, playedFen: played.fen, afterPlayed, fromBefore, why: explain(subject.playedSan, afterPlayed, fromBefore) });
    })();
    return () => {
      live = false;
    };
    // One explanation per move: the subject's other fields never change for the same id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, id]);

  const lines = loaded && loaded.id === id ? loaded : null;
  const current = walk && walk.id === id ? walk : null;

  const start = (which: "played" | "best") => {
    if (!subject || !lines?.ok) return;
    const first: Spot = { fen: subject.fen, uci: null, san: null, by: "start", win: null };
    const line = (steps: LineOutcome["steps"]): Spot[] => steps.map((step) => ({ fen: step.fen, uci: step.uci, san: step.san, by: "line", win: null }));
    const spots =
      which === "best"
        ? [first, ...line(lines.fromBefore.steps)]
        : [first, { fen: lines.playedFen, uci: subject.playedUci, san: subject.playedSan, by: "line" as const, win: null }, ...line(lines.afterPlayed.steps)];
    setWalk({ id: subject.id, which, spots, at: Math.min(1, spots.length - 1), busy: false, note: null });
  };

  const spot = current?.spots[current.at];
  const toMove: Color | null = spot ? (spot.fen.split(" ")[1] === "b" ? "black" : "white") : null;
  const yourTurn = current !== null && !current.busy && toMove === subject?.color;

  const onMove = (uci: string) => {
    if (!current || !spot) return;
    const made = playMove(spot.fen, uci);
    if (!made) return;
    const spots: Spot[] = [...current.spots.slice(0, current.at + 1), { fen: made.fen, uci, san: made.san, by: "you", win: null }];
    setWalk({ ...current, spots, at: spots.length - 1, busy: true, note: null });
    void session.evaluate(made.fen).then((result) => {
      setWalk((now) => {
        // A different line, or a different move, has been chosen while the engine was thinking.
        if (!now || now.spots !== spots) return now;
        if (!result) return { ...now, busy: false, note: "The engine could not be started, so it cannot answer here." };
        const win = Math.round(100 - winChance(result));
        const mine = spots.map((item, index) => (index === spots.length - 1 ? { ...item, win } : item));
        const reply = result.best ? playMove(made.fen, result.best) : null;
        if (!reply || !result.best) return { ...now, spots: mine, busy: false, note: "The game is over in this line." };
        const answered: Spot[] = [...mine, { fen: reply.fen, uci: result.best, san: reply.san, by: "engine", win }];
        return { ...now, spots: answered, at: answered.length - 1, busy: false };
      });
    });
  };

  const step = (by: number) => {
    if (current) setWalk({ ...current, at: Math.max(0, Math.min(current.spots.length - 1, current.at + by)), note: null });
  };

  let why: ReactNode = null;
  if (subject && !full) {
    const costly = lines?.ok && (lines.afterPlayed.mated === "player" || materialSwing(lines.afterPlayed) < 0);
    if (lines?.ok && costly) {
      why = (
        <div className="card stack tight why-card">
          <h3>What went wrong in the game</h3>
          <p>
            <LineText parts={lines.why.played} />
          </p>
          <div className="row">
            <button className="btn ghost small" onClick={() => start("played")} aria-pressed={current?.which === "played"}>
              Show me on the board
            </button>
          </div>
          <p className="source-note">Built by code from the engine&apos;s own line. The better move is yours to find.</p>
        </div>
      );
    }
  } else if (subject) {
    why = (
      <div className="card stack tight why-card">
        <h3>Why, as far as the engine can show</h3>
        {!lines ? (
          <p className="muted small" role="status">
            <span className="spinner tiny" aria-hidden="true" />
            Working out both lines with the engine.
          </p>
        ) : !lines.ok ? (
          <p className="muted small">The engine could not be started on this device, so the lines cannot be shown.</p>
        ) : (
          <>
            <p>
              <LineText parts={lines.why.played} />
            </p>
            <p>
              <LineText parts={lines.why.best} />
            </p>
            <p className={lines.why.proven ? "why-verdict" : "muted"}>{lines.why.verdict}</p>
            <div className="row">
              <button className="btn small" onClick={() => start("best")} aria-pressed={current?.which === "best"}>
                Play out the engine&apos;s move
              </button>
              <button className="btn ghost small" onClick={() => start("played")} aria-pressed={current?.which === "played"}>
                Play out your move
              </button>
            </div>
            <p className="source-note">Built by code from the engine&apos;s own lines, at its usual depth. No language model wrote this.</p>
          </>
        )}
      </div>
    );
  }

  let controls: ReactNode = null;
  if (current && spot) {
    const known = [...current.spots.slice(0, current.at + 1)].reverse().find((item) => item.win !== null);
    const who = spot.by === "you" ? "You played" : spot.by === "engine" ? "The engine answers" : spot.by === "start"
            ? "The position"
            : current.at === 1
              ? current.which === "best"
                ? "The engine\u2019s move"
                : "Your move in the game"
              : "The engine expects";
    controls = (
      <>
        <div className="board-controls" role="group" aria-label="Step through the line">
          <button className="iconbtn" onClick={() => step(-1)} disabled={current.at === 0} aria-label="One move back in the line">
            ◀
          </button>
          <span className="muted small board-where" aria-live="polite">
            {who}
            {spot.san && (
              <>
                {" "}
                <span className="san">{spot.san}</span>
              </>
            )}
            {known && known.win !== null && ` · ${known.win}%`}
          </span>
          <button className="iconbtn" onClick={() => step(1)} disabled={current.at === current.spots.length - 1} aria-label="One move forward in the line">
            ▶
          </button>
        </div>
        <p className="muted small" style={{ textAlign: "center" }} role="status">
          {current.note ?? (current.busy ? "The engine is answering." : yourTurn ? "Your turn: play a move and the engine answers it." : "Step forward to follow the line.")}
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn small" onClick={() => setWalk(null)}>
            {backLabel}
          </button>
        </div>
      </>
    );
  }

  return {
    why,
    active: current !== null,
    fen: spot?.fen ?? subject?.fen ?? "",
    lastMove: spot?.uci ?? null,
    slide: spot !== undefined && spot.by !== "you",
    onMove: yourTurn ? onMove : undefined,
    controls,
  };
}
