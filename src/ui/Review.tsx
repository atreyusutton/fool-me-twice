import { useEffect, useMemo, useRef, useState } from "react";
import { useCoach } from "../app/coach-choice.ts";
import { gamePath, playerPath } from "../app/router.ts";
import { coachSlot, type PlayerSession, type SessionState } from "../app/session.ts";
import { voiceLine } from "../app/voice.ts";
import { fallbackGameReview } from "../core/coach/fallback.ts";
import { gameReviewRequest } from "../core/coach/request.ts";
import type { GameReview as GameReviewReply, GameReviewRequest } from "../core/coach/types.ts";
import { isKeyMoment } from "../core/facts.ts";
import { buildProfile, THEME_COPY } from "../core/profile.ts";
import type { FactRow } from "../core/types.ts";
import { Board, type BoardArrow } from "./Board.tsx";
import { moodFor } from "./coaches/Figure.tsx";
import { Say } from "./coaches/Say.tsx";
import { CoachSource } from "./CoachSource.tsx";
import { CoachText } from "./CoachText.tsx";
import { ENDING_WORD, OUTCOME_WORD, formatClock, formatDate, gameLength, plural } from "./format.ts";
import { Link } from "./Link.tsx";
import { useExplore } from "./Explore.tsx";
import { ErrorScreen } from "./Status.tsx";
import { WinChart } from "./WinChart.tsx";

export function Review({ session, state, gameId }: { session: PlayerSession; state: SessionState; gameId: string }) {
  const table = state.facts[gameId];
  const summary = state.games.find((game) => game.uuid === gameId);
  const back = playerPath(state.username, state.demo, "games");

  if (!summary) {
    return (
      <div className="status">
        <h2>That game is not in this player&apos;s recent games</h2>
        <p className="muted">Fool Me Twice reviews the latest games in the chosen time class.</p>
        <Link className="btn" href={back}>
          All games
        </Link>
      </div>
    );
  }
  if (!table) {
    const engine = state.engine;
    if (engine.status === "failed" && engine.error) {
      return (
        <ErrorScreen error={engine.error} onRetry={() => void session.analyse(engine.target)}>
          <Link href={back}>All games</Link>
        </ErrorScreen>
      );
    }
    const inQueue = state.games.slice(0, engine.target).some((game) => game.uuid === gameId);
    return (
      <div className="status" role="status">
        {inQueue ? <div className="spinner" aria-hidden="true" /> : null}
        <h2>{inQueue ? "The engine has not reached this game yet" : "This game has not been checked"}</h2>
        <p className="muted">
          {inQueue
            ? `${engine.gamesDone} of ${Math.min(engine.target, state.games.length)} games checked. The review opens here as soon as it is ready.`
            : "Only the latest games are checked by the engine."}
        </p>
        <Link className="btn ghost" href={back}>
          All games
        </Link>
      </div>
    );
  }
  return <ReviewBody key={gameId} session={session} state={state} gameId={gameId} />;
}

function initialIndex(lastIndex: number): number {
  const wanted = Number(new URLSearchParams(window.location.search).get("ply"));
  return Number.isInteger(wanted) && wanted >= 1 && wanted <= lastIndex ? wanted - 1 : 0;
}

function ReviewBody({ session, state, gameId }: { session: PlayerSession; state: SessionState; gameId: string }) {
  const coach = useCoach();
  const table = state.facts[gameId]!;
  const summary = state.games.find((game) => game.uuid === gameId)!;
  const game = useMemo(() => session.getGame(gameId), [session, gameId]);
  const basis = state.coachProfile ?? state.profile;
  const profile = useMemo(() => basis ?? buildProfile([], state.tier1), [basis, state.tier1]);
  const local = useMemo(() => gameReviewRequest(summary, table, profile, coach), [summary, table, profile, coach]);
  const localReview = useMemo(() => fallbackGameReview(local.request), [local]);
  // The coach's words are always rendered against the exact request they were written and checked for.
  const entry = state.coach[coachSlot(coach, gameId)];
  const request = entry ? (entry.request as GameReviewRequest) : local.request;
  const factIds = entry ? entry.factIds : local.factIds;
  const review = entry ? (entry.result.reply as GameReviewReply) : localReview;
  useEffect(() => session.ensureCoach(gameId, coach), [session, gameId, coach]);

  const moves = game?.moves ?? [];
  const lastIndex = moves.length;
  // `slide` is true only for a single step forward, so that move is shown arriving on the board.
  const [place, setPlace] = useState(() => ({ index: initialIndex(lastIndex), slide: false }));
  const index = place.index;
  const setIndex = (next: number | ((value: number) => number)) =>
    setPlace((before) => {
      const index = typeof next === "function" ? next(before.index) : next;
      return { index, slide: index === before.index + 1 };
    });
  const rowByPly = useMemo(() => new Map(table.rows.map((row) => [row.ply, row])), [table]);
  const currentMoveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.getAttribute("role") === "slider")) return;
      if (event.metaKey || event.ctrlKey || event.altKey || document.querySelector("dialog[open]")) return;
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
      else if (event.key === "ArrowRight") setIndex((value) => Math.min(lastIndex, value + 1));
      else if (event.key === "Home") setIndex(0);
      else if (event.key === "End") setIndex(lastIndex);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lastIndex]);

  useEffect(() => {
    // Keep the current move visible inside the move list without scrolling the page itself.
    const button = currentMoveRef.current;
    const list = button?.parentElement;
    if (!button || !list) return;
    if (button.offsetTop < list.scrollTop) list.scrollTop = button.offsetTop;
    else if (button.offsetTop + button.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = button.offsetTop + button.offsetHeight - list.clientHeight;
    }
  }, [index]);

  // The key moment on the board, if the engine had a different move there: the move that can be explained.
  const explained =
    review.moments
      .map((moment) => table.rows.find((row) => row.id === factIds[moment.fact]))
      .find((row) => row !== undefined && row.ply - 1 === index && row.bestUci !== null && !row.playedBest) ?? null;
  const explore = useExplore(
    session,
    explained ? { id: explained.id, fen: explained.fenBefore, playedUci: explained.playedUci, playedSan: explained.played, color: explained.color } : null,
    "Back to the game",
  );

  if (!game || moves.length === 0) {
    return (
      <div className="status" role="alert">
        <h2>This game could not be replayed</h2>
        <p className="muted">The game record is missing its moves.</p>
        <Link className="btn" href={playerPath(state.username, state.demo, "games")}>
          All games
        </Link>
      </div>
    );
  }

  // The moments the coach talks about, each tied back to its real fact row.
  const moments = review.moments
    .map((moment) => ({ moment, row: table.rows.find((row) => row.id === factIds[moment.fact]) }))
    .filter((item): item is { moment: GameReviewReply["moments"][number]; row: FactRow } => item.row !== undefined);
  const at = moments.findIndex((item) => item.row.ply - 1 === index);
  const current = at >= 0 ? moments[at]! : null;
  const nextMoment = moments.find((item) => item.row.ply - 1 > index);
  const previousMoment = [...moments].reverse().find((item) => item.row.ply - 1 < index);

  const fen = index === 0 ? moves[0]!.fenBefore : moves[index - 1]!.fenAfter;
  const lastMove = index > 0 ? moves[index - 1]!.uci : null;
  const upcoming = rowByPly.get(index + 1);
  const upcomingKey = upcoming && isKeyMoment(upcoming) ? upcoming : null;
  const arrows: BoardArrow[] = [];
  if (upcomingKey) {
    arrows.push({ uci: upcomingKey.playedUci, kind: "played" });
    if (upcomingKey.bestUci && upcomingKey.bestUci !== upcomingKey.playedUci) arrows.push({ uci: upcomingKey.bestUci, kind: "best" });
  }
  const describe = (position: number): string => {
    if (position === 0) return "Start";
    const move = moves[position - 1]!;
    return `${move.moveNumber}${move.color === "white" ? "." : "…"} ${move.san}`;
  };
  const win = Math.round(table.winLine[index] ?? 50);
  // Each side's clock as it stood in this position, from the game record.
  const clockOf = (color: "white" | "black"): number | null => {
    for (let at = index - 1; at >= 0; at--) {
      const move = moves[at]!;
      if (move.color === color) return move.clockLeft;
    }
    return summary.timeControl && moves.some((move) => move.clockLeft !== null) ? summary.timeControl.base : null;
  };
  const myClock = clockOf(summary.playerColor);
  const theirClock = clockOf(summary.playerColor === "white" ? "black" : "white");
  // The games on either side of this one that the engine has finished, newest first.
  const checked = state.games.filter((candidate) => state.facts[candidate.uuid]);
  const here = checked.findIndex((candidate) => candidate.uuid === gameId);
  const newer = here > 0 ? checked[here - 1] : undefined;
  const older = here >= 0 ? checked[here + 1] : undefined;
  const length = gameLength(summary.timeControl);
  const keyRows = table.rows.filter(isKeyMoment);
  const pairs: { no: number; white?: (typeof moves)[number]; black?: (typeof moves)[number] }[] = [];
  for (const move of moves) {
    const pair = (pairs[move.moveNumber - 1] ??= { no: move.moveNumber });
    pair[move.color] = move;
  }
  const loading = entry?.status === "loading";
  // What the bubble shows can be read aloud once the text is final. The voice route checks it again.
  const line =
    entry?.status === "ready"
      ? voiceLine(request, review, current ? [review.moments.indexOf(current.moment)] : ["headline", "closing"])
      : null;
  // The figure's expression is chosen here, from the fact row. The model has no say in it.
  const mood = loading
    ? "thinking"
    : current
      ? moodFor({ loss: current.row.loss, strength: current.row.strengths.length > 0 && current.row.loss < 1, speaking: true })
      : "talking";
  const theme = current?.moment.theme ? request.profile.themes.find((candidate) => candidate.id === current.moment.theme) : null;
  const practiceHref = current?.row.clear && current.row.bestUci ? playerPath(state.username, state.demo, `practice?p=${encodeURIComponent(current.row.id)}`) : null;

  return (
    <>
      <header className="stack tight">
        <Link className="backlink" href={playerPath(state.username, state.demo, "games")}>
          ← All games
        </Link>
        <h1 className="h1-small">
          {OUTCOME_WORD[summary.outcome]} against {summary.opponentName}
        </h1>
        <p className="muted small">
          {summary.playerColor === "white" ? "White" : "Black"} · {summary.playerRating} vs {summary.opponentRating}
          {summary.outcome !== "draw" && ` · by ${ENDING_WORD[summary.ending]}`}
          {length && ` · ${length}`} · {summary.openingFull ?? "Opening not named"} ·{" "}
          {formatDate(summary.endTime)} ·{" "}
          <a href={summary.url} target="_blank" rel="noreferrer">
            Open on Chess.com
          </a>
        </p>
        <nav className="row game-nav" aria-label="Other games">
          {newer ? (
            <Link className="btn ghost small" href={gamePath(state.username, state.demo, newer.uuid)}>
              ← Newer
            </Link>
          ) : (
            <span className="btn ghost small" aria-disabled="true">
              ← Newer
            </span>
          )}
          <span className="muted small num">
            Game {here + 1} of {checked.length}
          </span>
          {older ? (
            <Link className="btn ghost small" href={gamePath(state.username, state.demo, older.uuid)}>
              Older →
            </Link>
          ) : (
            <span className="btn ghost small" aria-disabled="true">
              Older →
            </span>
          )}
        </nav>
      </header>

      <div className="review">
        <div className="review-board stack">
          <Board
            fen={explore.active ? explore.fen : fen}
            orientation={summary.playerColor}
            lastMove={explore.active ? explore.lastMove : lastMove}
            slide={explore.active ? explore.slide : place.slide}
            arrows={explore.active ? [] : arrows}
            label={explore.active ? `A line from move ${explained?.moveNumber}, seen from ${summary.playerColor}'s side` : `Board after ${describe(index)}, seen from ${summary.playerColor}'s side`}
            onMove={explore.active ? explore.onMove : undefined}
          />
          {explore.controls}
          <div className="board-controls" role="group" aria-label="Step through the game" hidden={explore.active}>
            <button className="iconbtn" onClick={() => setIndex(0)} disabled={index === 0} aria-label="Go to the start">
              ⏮
            </button>
            <button className="iconbtn" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous move">
              ◀
            </button>
            <span className="muted small num board-where" aria-live="polite">
              {describe(index)} · {win}%
            </span>
            <button className="iconbtn" onClick={() => setIndex(Math.min(lastIndex, index + 1))} disabled={index === lastIndex} aria-label="Next move">
              ▶
            </button>
            <button className="iconbtn" onClick={() => setIndex(lastIndex)} disabled={index === lastIndex} aria-label="Go to the end">
              ⏭
            </button>
          </div>
          {!explore.active && myClock !== null && theirClock !== null && (
            <p className="clocks small num" aria-label="Clocks in this position">
              <span>
                You <strong>{formatClock(myClock)}</strong>
              </span>
              <span>
                {summary.opponentName} <strong>{formatClock(theirClock)}</strong>
              </span>
            </p>
          )}
          {!explore.active && upcomingKey && (
            <p className="small" style={{ textAlign: "center" }}>
              <span className="arrow-key">
                <i className="played" aria-hidden="true" /> You played <span className="san">{upcomingKey.played}</span>
              </span>
              {upcomingKey.best && upcomingKey.best !== upcomingKey.played && (
                <span className="arrow-key">
                  <i aria-hidden="true" /> Engine preferred <span className="san">{upcomingKey.best}</span>
                </span>
              )}
            </p>
          )}
        </div>

        <div className="review-coach stack">
          <div aria-live="polite">
            <Say who={coach} mood={mood} size={88} voice={line}>
              {current ? (
                <>
                  <p className="bubble-kicker">
                    Key moment {at + 1} of {moments.length} · move {current.row.moveNumber} · {current.row.phase}
                  </p>
                  <p>
                    <CoachText text={current.moment.text} request={request} />
                  </p>
                </>
              ) : (
                <>
                  <p className="bubble-title">{review.headline}</p>
                  <p>
                    <CoachText text={review.takeaway.text} request={request} />
                  </p>
                </>
              )}
            </Say>
          </div>

          {current && (
            <div className="moment-facts row">
              {current.row.patterns.map((tag) => (
                <span className="chip warn" key={tag}>
                  {THEME_COPY[tag].label}
                </span>
              ))}
              {current.row.loss >= 1 && <span className="chip num">−{Math.round(current.row.loss)} points of winning chance</span>}
              {current.row.clockLeft !== null && (
                <span className="chip num">
                  {formatClock(current.row.clockLeft)} left{summary.timeControl ? ` of ${formatClock(summary.timeControl.base)}` : ""}
                </span>
              )}
              {current.row.timeSpent !== null && <span className="chip num">{current.row.timeSpent}s on the move</span>}
              {theme && (
                <span className="chip hot">
                  {theme.label}: {theme.count}× in {theme.games} of {plural(theme.gamesAnalysed, "game")}
                </span>
              )}
            </div>
          )}

          <div className="row">
            {previousMoment && (
              <button className="btn ghost small" onClick={() => setIndex(previousMoment.row.ply - 1)}>
                ← Previous moment
              </button>
            )}
            {practiceHref && (
              <Link className="btn hot small" href={practiceHref}>
                Try it again
              </Link>
            )}
            {nextMoment ? (
              <button className="btn small" onClick={() => setIndex(nextMoment.row.ply - 1)}>
                {current || previousMoment ? "Next key moment →" : "Show me the first key moment →"}
              </button>
            ) : (
              current && (
                <button className="btn small" onClick={() => setIndex(lastIndex)}>
                  Wrap up →
                </button>
              )
            )}
          </div>

          {explore.why}

          <CoachSource entry={entry} recorded={state.recording !== null} extra={`${plural(keyRows.length, "key moment")} out of ${plural(table.rows.length, "move")} you played.`} />

          <div className="card stack tight">
            <h3>Your winning chance</h3>
            <WinChart
              line={table.winLine}
              current={index}
              markers={keyRows.map((row) => ({ index: row.ply - 1, label: row.played }))}
              describe={describe}
              onSelect={setIndex}
            />
          </div>

          <details className="more">
            <summary>All moves</summary>
            <div className="movelist">
              {pairs.map((pair) => (
                <MoveRow key={pair.no} pair={pair} index={index} setIndex={setIndex} rowByPly={rowByPly} currentRef={currentMoveRef} />
              ))}
            </div>
          </details>
        </div>
      </div>
    </>
  );
}

function MoveRow({
  pair,
  index,
  setIndex,
  rowByPly,
  currentRef,
}: {
  pair: { no: number; white?: { ply: number; san: string }; black?: { ply: number; san: string } };
  index: number;
  setIndex: (index: number) => void;
  rowByPly: Map<number, FactRow>;
  currentRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const cell = (move: { ply: number; san: string } | undefined) => {
    if (!move) return <span />;
    const row = rowByPly.get(move.ply);
    const key = row !== undefined && isKeyMoment(row);
    const current = index === move.ply;
    return (
      <button ref={current ? currentRef : undefined} aria-current={current} onClick={() => setIndex(move.ply)}>
        {move.san}
        {key && <span className="dot" role="img" aria-label="key moment" />}
      </button>
    );
  };
  return (
    <>
      <span className="no">{pair.no}.</span>
      {cell(pair.white)}
      {cell(pair.black)}
    </>
  );
}
