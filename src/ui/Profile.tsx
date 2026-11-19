import { useSyncExternalStore } from "react";
import type { PlayerSession, SessionState } from "../app/session.ts";
import type { Tier1Stats } from "../core/tier1.ts";
import type { Ending, GameSummary } from "../core/types.ts";
import { ENDING_WORD, OUTCOME_WORD, formatClock, formatDate, formatPercent, formatShortDate, plural } from "./format.ts";
import { ErrorScreen, Loading } from "./Status.tsx";
import { TallyBar, TallyLegend } from "./Tally.tsx";

export function useSession(session: PlayerSession): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}

export function Profile({ session }: { session: PlayerSession }) {
  const state = useSession(session);

  if (state.phase === "error" && state.error) {
    return <ErrorScreen error={state.error} onRetry={() => void session.load()} />;
  }
  if (state.phase === "loading" || !state.tier1 || !state.player) {
    return <Loading title={state.loadingStep} detail={state.notices.at(-1) ?? `Player: ${state.username}`} />;
  }

  const rating = state.ratings.find((entry) => entry.timeClass === state.timeClass);
  return (
    <div className="stack-lg">
      <header className="player-head">
        <div>
          <p className="eyebrow">Player profile</p>
          <h1>{state.player.displayName}</h1>
          <p className="muted">
            {plural(state.games.length, `${state.timeClass} game`)}
            {state.tier1.from && state.tier1.to && `, ${formatDate(state.tier1.from)} to ${formatDate(state.tier1.to)}`}
            {rating && ` · rated ${rating.rating}`}
          </p>
        </div>
        {state.timeClasses.length > 1 && (
          <div className="segmented" role="group" aria-label="Time class">
            {state.timeClasses.map((name) => (
              <button key={name} aria-pressed={name === state.timeClass} onClick={() => void session.load(name)}>
                {name}
              </button>
            ))}
          </div>
        )}
      </header>

      {state.notices.map((notice) => (
        <p className="notice" key={notice}>
          {notice}
        </p>
      ))}
      {!state.cachePersistent && (
        <p className="notice">
          This browser is not letting Motif save its work, so the analysis will start again if you reload the page.
        </p>
      )}

      <Record tier1={state.tier1} gameCount={state.games.length} />
      <GamesList games={state.games} />
    </div>
  );
}

function endingList(counts: Partial<Record<Ending, number>>): string {
  const entries = (Object.entries(counts) as [Ending, number][]).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "none yet";
  return entries.map(([ending, count]) => `${count} by ${ENDING_WORD[ending]}`).join(", ");
}

function Record({ tier1, gameCount }: { tier1: Tier1Stats; gameCount: number }) {
  const openings = tier1.byOpening.slice(0, 6);
  return (
    <section aria-labelledby="record-title">
      <div className="section-head">
        <h2 id="record-title">The record</h2>
        <span className="muted small">Counted from the last {plural(gameCount, "game")}. No engine needed.</span>
      </div>
      <div className="grid-2">
        <div className="card stack">
          <TallyBar label="All games" tally={tier1.total} />
          <TallyBar label="As White" tally={tier1.byColor.white} />
          <TallyBar label="As Black" tally={tier1.byColor.black} />
          <TallyBar label="Against higher-rated players" tally={tier1.vsHigherRated} />
          <TallyBar label="Against lower-rated players" tally={tier1.vsLowerRated} />
          <TallyLegend />
        </div>
        <div className="card stack">
          <div>
            <h3>How games end</h3>
            <p className="muted small">
              Wins: {endingList(tier1.winsByEnding)}.
              <br />
              Losses: {endingList(tier1.lossesByEnding)}.
            </p>
          </div>
          {tier1.clockAtEnd && (
            <div>
              <h3>Clock at the end</h3>
              <p className="muted small">
                On average {formatClock(tier1.clockAtEnd.average)} left; the lowest was {formatClock(tier1.clockAtEnd.lowest)}
                . From {plural(tier1.clockAtEnd.games, "game")} with clock times.
              </p>
            </div>
          )}
          {tier1.findings.map((finding) => (
            <div key={finding.key}>
              <h3>{finding.label}</h3>
              <p className="muted small">
                {finding.a.name}: {formatPercent(finding.a.tally.score)} score over {plural(finding.a.tally.games, "game")}.{" "}
                {finding.b.name}: {formatPercent(finding.b.tally.score)} over {plural(finding.b.tally.games, "game")}.
              </p>
            </div>
          ))}
        </div>
      </div>
      {openings.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Openings played most</h3>
          <table className="plain">
            <thead>
              <tr>
                <th>Opening</th>
                <th className="r">Games</th>
                <th className="r">Won–drawn–lost</th>
                <th className="r">Score</th>
              </tr>
            </thead>
            <tbody>
              {openings.map((opening) => (
                <tr key={opening.name}>
                  <td>{opening.name}</td>
                  <td className="r num">{opening.tally.games}</td>
                  <td className="r num">
                    {opening.tally.wins}–{opening.tally.draws}–{opening.tally.losses}
                  </td>
                  <td className="r num">{formatPercent(opening.tally.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GamesList({ games }: { games: GameSummary[] }) {
  return (
    <section aria-labelledby="games-title">
      <div className="section-head">
        <h2 id="games-title">Games</h2>
        <span className="muted small">Newest first</span>
      </div>
      <div className="card games">
        {games.slice(0, 25).map((game) => (
          <div className="game-row" key={game.uuid}>
            <span className={`outcome ${game.outcome}`}>
              <i aria-hidden="true" />
              {OUTCOME_WORD[game.outcome]}
            </span>
            <span className="game-main">
              <span className="title">
                vs {game.opponentName} <span className="muted num">({game.opponentRating})</span>
              </span>
              <span className="muted small">
                {game.playerColor === "white" ? "White" : "Black"} · {game.opening ?? "Opening not named"}
                {game.outcome !== "draw" && ` · by ${ENDING_WORD[game.ending]}`}
              </span>
            </span>
            <span className="aside muted small num">{formatShortDate(game.endTime)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
