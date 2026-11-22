import { gamePath, playerPath } from "../app/router.ts";
import type { SessionState } from "../app/session.ts";
import { isKeyMoment } from "../core/facts.ts";
import type { GameSummary } from "../core/types.ts";
import { ENDING_WORD, OUTCOME_WORD, formatShortDate, plural } from "./format.ts";
import { Link } from "./Link.tsx";

/** The game with the most to learn from: the lost game with the most key moments. Chosen by code. */
function suggested(state: SessionState): GameSummary | null {
  let best: GameSummary | null = null;
  let bestCount = 0;
  for (const game of state.games) {
    const table = state.facts[game.uuid];
    if (!table || game.outcome === "win") continue;
    const count = table.rows.filter(isKeyMoment).length;
    if (count > bestCount) {
      best = game;
      bestCount = count;
    }
  }
  return best;
}

/** The Review tab: pick a game to go through with the coach. */
export function Games({ state }: { state: SessionState }) {
  const start = suggested(state);
  const analysed = state.games.filter((game) => state.facts[game.uuid]);
  const waiting = Math.min(state.engine.target, state.games.length) - analysed.length;
  return (
    <>
      <header className="stack tight">
        <p className="eyebrow">Review</p>
        <h1>Pick a game to go through</h1>
        <p className="lead">Your coach walks you through the moments that decided it, and how they fit what keeps coming back.</p>
      </header>

      {start && (
        <section className="card lift row between" aria-label="Suggested game">
          <div className="stack tight">
            <span className="chip hot">Start here</span>
            <h2>
              {OUTCOME_WORD[start.outcome]} against {start.opponentName}
            </h2>
            <p className="muted">
              {plural(state.facts[start.uuid]!.rows.filter(isKeyMoment).length, "key moment")} · {start.opening ?? "Opening not named"} ·{" "}
              {formatShortDate(start.endTime)}. The lost game with the most to learn from.
            </p>
          </div>
          <Link className="btn" href={gamePath(state.username, state.demo, start.uuid)}>
            Review this game
          </Link>
        </section>
      )}

      <section aria-labelledby="all-games">
        <div className="section-head">
          <h2 id="all-games">Your latest games</h2>
          <p className="muted small" role="status">
            {state.engine.status === "running" && waiting > 0
              ? `${analysed.length} ready, ${waiting} still being checked by the engine.`
              : `${plural(analysed.length, "game")} checked by the engine.`}
          </p>
        </div>
        <ul className="game-list">
          {state.games.map((game) => {
            const table = state.facts[game.uuid];
            const moments = table ? table.rows.filter(isKeyMoment).length : null;
            const body = (
              <>
                <span className={`result ${game.outcome}`} aria-hidden="true" />
                <span className="game-main">
                  <strong>
                    {OUTCOME_WORD[game.outcome]} against {game.opponentName}
                  </strong>
                  <span className="muted small">
                    {game.playerColor === "white" ? "White" : "Black"} · {game.opening ?? "Opening not named"}
                    {game.outcome !== "draw" && ` · by ${ENDING_WORD[game.ending]}`} · {formatShortDate(game.endTime)}
                  </span>
                </span>
                {moments === null ? (
                  <span className="chip">Not checked yet</span>
                ) : moments === 0 ? (
                  <span className="chip good">No clear mistakes</span>
                ) : (
                  <span className="chip warn">{plural(moments, "key moment")}</span>
                )}
              </>
            );
            return (
              <li key={game.uuid}>
                {table ? (
                  <Link className="game-row" href={gamePath(state.username, state.demo, game.uuid)}>
                    {body}
                  </Link>
                ) : (
                  <div className="game-row idle">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        {state.games.length > analysed.length && state.engine.status === "done" && (
          <p className="muted small" style={{ marginTop: 12 }}>
            Only the latest games are checked. You can read more of them from <Link href={playerPath(state.username, state.demo)}>your page</Link>.
          </p>
        )}
      </section>
    </>
  );
}
