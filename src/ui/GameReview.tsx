import { useEffect, useMemo, useRef, useState } from "react";
import { profilePath } from "../app/router.ts";
import type { PlayerSession } from "../app/session.ts";
import { fallbackGameReview } from "../core/coach/fallback.ts";
import { gameReviewRequest } from "../core/coach/request.ts";
import type { GameReview as GameReviewReply, GameReviewRequest } from "../core/coach/types.ts";
import { isKeyMoment } from "../core/facts.ts";
import { buildProfile, THEME_COPY } from "../core/profile.ts";
import type { FactRow } from "../core/types.ts";
import { Board, type BoardArrow } from "./Board.tsx";
import { CoachSource } from "./CoachSource.tsx";
import { CoachText } from "./CoachText.tsx";
import { ENDING_WORD, OUTCOME_WORD, formatClock, formatDate, plural } from "./format.ts";
import { Link } from "./Link.tsx";
import { useSession } from "./Profile.tsx";
import { ErrorScreen, Loading } from "./Status.tsx";
import { WinChart } from "./WinChart.tsx";

export function GameReview({ session, gameId }: { session: PlayerSession; gameId: string }) {
  const state = useSession(session);
  const table = state.facts[gameId];
  const summary = state.games.find((game) => game.uuid === gameId);
  const back = profilePath(state.username, state.demo);

  if (state.phase === "error" && state.error) return <ErrorScreen error={state.error} onRetry={() => void session.load()} />;
  if (state.phase === "loading") return <Loading title={state.loadingStep} detail={`Player: ${state.username}`} />;
  if (!summary) {
    return (
      <div className="status">
        <h2>That game is not in this player&apos;s recent games</h2>
        <p className="muted">Motif reviews the latest games in the chosen time class.</p>
        <Link className="btn" href={back}>
          Back to the profile
        </Link>
      </div>
    );
  }
  if (!table) {
    const engine = state.engine;
    if (engine.status === "failed" && engine.error) {
      return (
        <ErrorScreen error={engine.error} onRetry={() => void session.analyse(engine.target)}>
          <Link href={back}>Back to the profile</Link>
        </ErrorScreen>
      );
    }
    const inQueue = state.games.slice(0, engine.target).some((game) => game.uuid === gameId);
    return (
      <div className="status" role="status">
        {inQueue ? <div className="spinner" aria-hidden="true" /> : null}
        <h2>{inQueue ? "The engine has not reached this game yet" : "This game has not been analysed"}</h2>
        <p className="muted">
          {inQueue
            ? `${engine.gamesDone} of ${Math.min(engine.target, state.games.length)} games analysed. This page will open the review as soon as it is ready.`
            : "Only the latest games are analysed. You can analyse more from the profile."}
        </p>
        <Link className="btn secondary" href={back}>
          Back to the profile
        </Link>
      </div>
    );
  }
  return <ReviewBody key={gameId} session={session} gameId={gameId} />;
}

function initialIndex(rows: FactRow[], lastIndex: number): number {
  const wanted = Number(new URLSearchParams(window.location.search).get("ply"));
  if (Number.isInteger(wanted) && wanted >= 1 && wanted <= lastIndex) return wanted - 1;
  const first = rows.find(isKeyMoment);
  return first ? first.ply - 1 : 0;
}

function ReviewBody({ session, gameId }: { session: PlayerSession; gameId: string }) {
  const state = useSession(session);
  const table = state.facts[gameId]!;
  const summary = state.games.find((game) => game.uuid === gameId)!;
  const game = useMemo(() => session.getGame(gameId), [session, gameId]);
  const profile = useMemo(() => state.profile ?? buildProfile([], state.tier1), [state.profile, state.tier1]);
  const local = useMemo(() => gameReviewRequest(summary, table, profile), [summary, table, profile]);
  const localReview = useMemo(() => fallbackGameReview(local.request), [local]);
  // The coach's words are always rendered against the exact request they were written and checked for.
  const entry = state.coach[gameId];
  const request = entry ? (entry.request as GameReviewRequest) : local.request;
  const factIds = entry ? entry.factIds : local.factIds;
  const review = entry ? (entry.result.reply as GameReviewReply) : localReview;
  useEffect(() => session.ensureCoach(gameId), [session, gameId]);

  const moves = game?.moves ?? [];
  const lastIndex = moves.length;
  const [index, setIndex] = useState(() => initialIndex(table.rows, lastIndex));
  const rowByPly = useMemo(() => new Map(table.rows.map((row) => [row.ply, row])), [table]);
  const currentMoveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.getAttribute("role") === "slider")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
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

  if (!game || moves.length === 0) {
    return (
      <div className="status" role="alert">
        <h2>This game could not be replayed</h2>
        <p className="muted">The game record is missing its moves.</p>
        <Link className="btn" href={profilePath(state.username, state.demo)}>
          Back to the profile
        </Link>
      </div>
    );
  }

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
  const keyRows = table.rows.filter(isKeyMoment);
  const pairs: { no: number; white?: (typeof moves)[number]; black?: (typeof moves)[number] }[] = [];
  for (const move of moves) {
    const pair = (pairs[move.moveNumber - 1] ??= { no: move.moveNumber });
    pair[move.color] = move;
  }

  return (
    <div>
      <header className="game-head">
        <Link className="backlink" href={profilePath(state.username, state.demo)}>
          ← {state.player?.displayName ?? state.username}&apos;s profile
        </Link>
        <h1>
          {OUTCOME_WORD[summary.outcome]} against {summary.opponentName}
        </h1>
        <p className="muted">
          {summary.playerColor === "white" ? "White" : "Black"} · {summary.playerRating} vs {summary.opponentRating}
          {summary.outcome !== "draw" && ` · by ${ENDING_WORD[summary.ending]}`} · {summary.openingFull ?? "Opening not named"} ·{" "}
          {formatDate(summary.endTime)} ·{" "}
          <a href={summary.url} target="_blank" rel="noreferrer">
            Open on Chess.com
          </a>
        </p>
      </header>

      <div className="review">
        <div className="review-left">
          <Board
            fen={fen}
            orientation={summary.playerColor}
            lastMove={lastMove}
            arrows={arrows}
            label={`Board after ${describe(index)}, seen from ${summary.playerColor}'s side`}
          />
          <div className="board-controls" role="group" aria-label="Step through the game">
            <button className="iconbtn" onClick={() => setIndex(0)} disabled={index === 0} aria-label="Go to the start">
              ⏮
            </button>
            <button className="iconbtn" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous move">
              ◀
            </button>
            <button className="iconbtn" onClick={() => setIndex(Math.min(lastIndex, index + 1))} disabled={index === lastIndex} aria-label="Next move">
              ▶
            </button>
            <button className="iconbtn" onClick={() => setIndex(lastIndex)} disabled={index === lastIndex} aria-label="Go to the end">
              ⏭
            </button>
          </div>
          <div className="board-caption small" aria-live="polite">
            {upcomingKey ? (
              <>
                <div>
                  <span className="arrow-key">
                    <i className="played" aria-hidden="true" /> You played <span className="san">{upcomingKey.played}</span>
                  </span>
                  {upcomingKey.best && upcomingKey.best !== upcomingKey.played && (
                    <span className="arrow-key">
                      <i aria-hidden="true" /> Engine preferred <span className="san">{upcomingKey.best}</span>
                    </span>
                  )}
                </div>
                <div className="muted">
                  Winning chance {Math.round(upcomingKey.winBefore)}% before, {Math.round(upcomingKey.winAfter)}% after
                </div>
              </>
            ) : (
              <span className="muted">
                {describe(index)} · your winning chance {win}% · use the ← and → keys to step
              </span>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>Your winning chance</h3>
            <WinChart
              line={table.winLine}
              current={index}
              markers={keyRows.map((row) => ({ index: row.ply, label: row.played }))}
              describe={describe}
              onSelect={setIndex}
            />
          </div>
        </div>

        <div className="stack">
          <section className="card stack" aria-labelledby="coach-title">
            <div>
              <p className="eyebrow">Review</p>
              <h2 id="coach-title">{review.headline}</h2>
            </div>
            <p className="coach-line">
              <CoachText text={review.takeaway.text} request={request} />
            </p>
            <CoachSource entry={entry} extra={`${plural(keyRows.length, "key moment")} out of ${plural(table.rows.length, "move")} you played.`} />
          </section>

          {review.moments.map((moment) => {
            const row = table.rows.find((entry) => entry.id === factIds[moment.fact]);
            if (!row) return null;
            const theme = moment.theme ? request.profile.themes.find((candidate) => candidate.id === moment.theme) : null;
            return (
              <button key={moment.fact} className="moment" aria-current={index === row.ply - 1} onClick={() => setIndex(row.ply - 1)}>
                <span className="moment-head">
                  <strong>
                    Move {row.moveNumber} · {row.phase}
                  </strong>
                  <span className="row">
                    {row.patterns.map((tag) => (
                      <span className="chip signal" key={tag}>
                        {THEME_COPY[tag].label}
                      </span>
                    ))}
                    {row.loss >= 1 && <span className="chip num">−{Math.round(row.loss)} points</span>}
                  </span>
                </span>
                <span className="moment-moves">
                  <span>
                    Played <span className="san fact played">{row.played}</span>
                  </span>
                  {row.best && (
                    <span>
                      Engine <span className="san fact best">{row.best}</span>
                    </span>
                  )}
                  {row.timeSpent !== null && <span className="num">{row.timeSpent}s on the move</span>}
                  {row.clockLeft !== null && <span className="num">{formatClock(row.clockLeft)} left</span>}
                </span>
                <span>
                  <CoachText text={moment.text} request={request} />
                </span>
                {theme && (
                  <span className="source-note">
                    Theme: {theme.label}, {theme.count} times in {theme.games} of {plural(theme.gamesAnalysed, "game")}
                  </span>
                )}
              </button>
            );
          })}

          <section className="card" aria-labelledby="moves-title">
            <h3 id="moves-title" style={{ marginBottom: 8 }}>
              Moves
            </h3>
            <div className="movelist">
              {pairs.map((pair) => (
                <MoveRow key={pair.no} pair={pair} index={index} setIndex={setIndex} rowByPly={rowByPly} currentRef={currentMoveRef} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
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
