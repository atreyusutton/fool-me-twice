import { useEffect, useSyncExternalStore } from "react";
import { gamePath, profilePath } from "../app/router.ts";
import { ENGINE_GAME_STEPS, type PlayerSession, type SessionState } from "../app/session.ts";
import type { ProfileSummary, ProfileSummaryRequest } from "../core/coach/types.ts";
import { isKeyMoment } from "../core/facts.ts";
import { evidenceRows, type Profile as PlayerProfile, type Theme } from "../core/profile.ts";
import type { Tier1Stats } from "../core/tier1.ts";
import type { Ending, FactTable } from "../core/types.ts";
import { CoachSource } from "./CoachSource.tsx";
import { CoachText } from "./CoachText.tsx";
import { ENDING_WORD, OUTCOME_WORD, formatClock, formatDate, formatPercent, formatShortDate, plural } from "./format.ts";
import { Link } from "./Link.tsx";
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

      <DemoBanner state={state} />
      <AnalysisProgress session={session} state={state} />
      <Themes session={session} state={state} />
      <Record tier1={state.tier1} gameCount={state.games.length} />
      <GamesList state={state} />
    </div>
  );
}

/** Shown on every demo screen, so recorded results are never mistaken for live ones. */
export function DemoBanner({ state }: { state: SessionState }) {
  if (!state.recording) return null;
  return (
    <div className="notice calm demo-banner" role="note">
      <strong>Recorded demo.</strong> These are {state.player?.displayName ?? state.username}&apos;s real games, analysed and coached on{" "}
      {formatDate(Date.parse(state.recording.recordedAt) / 1000)} and played back from a file. No engine or language model is running, and
      no API key is needed. <Link href={profilePath(state.username, false)}>Run it live instead</Link>
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

function AnalysisProgress({ session, state }: { session: PlayerSession; state: SessionState }) {
  const engine = state.engine;
  const total = Math.min(engine.target, state.games.length);
  if (engine.status === "failed" && engine.error) {
    return (
      <div className="notice" role="alert">
        <strong>The chess engine stopped.</strong> {engine.error.message} The record below needs no engine and is still
        correct. {plural(engine.gamesDone, "game")} finished before it stopped.{" "}
        <button className="btn small secondary" onClick={() => void session.analyse(engine.target)}>
          Start the engine again
        </button>
      </div>
    );
  }
  if (engine.status === "done" && state.recording) {
    return (
      <p className="muted small" role="status">
        {plural(total, "game")} analysed by the engine when the demo was recorded. Nothing is being computed now.
      </p>
    );
  }
  if (engine.status === "done") {
    const next = ENGINE_GAME_STEPS.find((step) => step > engine.target && state.games.length > engine.target);
    const seconds = engine.startedAt && engine.finishedAt ? Math.round((engine.finishedAt - engine.startedAt) / 1000) : null;
    return (
      <div className="row muted small" role="status">
        <span>
          {plural(total, "game")} analysed by the engine
          {engine.gamesFromCache === total
            ? ", all from this device's saved results"
            : seconds !== null
              ? ` in ${seconds}s (${engine.searched} positions searched, ${engine.fromCache} reused)`
              : ""}
          .
        </span>
        {next && (
          <button className="btn small secondary" onClick={() => void session.analyse(next)}>
            Analyse the latest {Math.min(next, state.games.length)}
          </button>
        )}
      </div>
    );
  }
  if (engine.status !== "running") return null;
  const fraction = engine.positionsTotal > 0 ? Math.min(1, engine.positionsDone / engine.positionsTotal) : 0;
  return (
    <div className="card progress" role="status" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>
          {engine.gamesDone} of {total} games analysed
        </strong>
        <span className="muted small">
          {engine.engines > 1 ? `${engine.engines} engines are` : "The engine is"} checking every position. Finished games can be
          opened now.
        </span>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${fraction * 100}%` }} />
      </div>
      <span className="muted small">
        This is slowest on the first visit. Results are saved on this device, so the next visit is instant.
      </span>
    </div>
  );
}

function themeNumbers(theme: Theme): string {
  if (theme.comparison) {
    const c = theme.comparison;
    return `${c.a}: ${c.aScore}% score in ${plural(c.aGames, "game")}. ${c.b}: ${c.bScore}% in ${plural(c.bGames, "game")}.`;
  }
  const where = theme.phase ? `, mostly in the ${theme.phase}` : "";
  if (theme.kind === "strength" && theme.chances !== null) {
    return `${theme.count} of the ${plural(theme.chances, "chance")} taken, across ${plural(theme.games, "game")}${where}.`;
  }
  return `In ${theme.games} of ${plural(theme.gamesAnalysed, "game")}${where}.`;
}

/** The coach's sentence for one theme, if a checked summary exists and still describes this exact theme. */
function coachThemeText(theme: Theme, state: SessionState): { text: string; request: ProfileSummaryRequest } | null {
  const entry = state.coach.profile;
  if (!entry || entry.request.kind !== "profile") return null;
  const sent = entry.request.profile.themes.find((candidate) => candidate.key === theme.key);
  if (!sent || sent.count !== theme.count || sent.games !== theme.games || sent.gamesAnalysed !== theme.gamesAnalysed) return null;
  const item = (entry.result.reply as ProfileSummary).themes.find((candidate) => candidate.theme === sent.id);
  return item ? { text: item.text, request: entry.request } : null;
}

function CoachSummary({ session, state }: { session: PlayerSession; state: SessionState }) {
  const done = state.engine.status === "done";
  const hasThemes = (state.profile?.themes.length ?? 0) > 0;
  useEffect(() => {
    if (done && hasThemes) session.ensureCoach("profile");
  }, [session, done, hasThemes, state.profile]);
  const entry = state.coach.profile;
  if (!done || !entry || entry.request.kind !== "profile") return null;
  const summary = entry.result.reply as ProfileSummary;
  const focus = entry.request.profile.themes.find((theme) => theme.id === summary.focus.theme);
  return (
    <section className="card stack coach-summary" aria-labelledby="coach-summary-title">
      <div>
        <p className="eyebrow">The coach&apos;s read</p>
        <h2 id="coach-summary-title">{summary.headline}</h2>
      </div>
      <p className="coach-line">
        <CoachText text={summary.focus.text} request={entry.request} />
      </p>
      {focus && <p className="muted small">Work on first: {focus.label}</p>}
      <CoachSource entry={entry} recorded={state.recording !== null} />
    </section>
  );
}

function ThemeCard({ theme, state }: { theme: Theme; state: SessionState }) {
  const coach = coachThemeText(theme, state);
  const tables = Object.values(state.facts) as FactTable[];
  const evidence = evidenceRows(theme, tables, 6);
  const gameOf = (gameId: string) => state.games.find((game) => game.uuid === gameId);
  return (
    <article className={`card theme-card ${theme.kind}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>{theme.label}</h3>
        <span className={`chip ${theme.kind === "weakness" ? "signal" : theme.kind === "strength" ? "good" : ""}`}>
          {theme.kind === "weakness" ? "Keeps coming back" : theme.kind === "strength" ? "Going well" : "From the record"}
        </span>
      </div>
      {!theme.comparison && (
        <div className="count num">
          {theme.count}
          <small>{theme.count === 1 ? "time" : "times"}</small>
        </div>
      )}
      <p className="muted small">{themeNumbers(theme)}</p>
      {coach && (
        <p className="coach-line small-coach">
          <CoachText text={coach.text} request={coach.request} />
        </p>
      )}
      {evidence.length > 0 && (
        <div>
          <p className="eyebrow" style={{ marginBottom: 6 }}>
            {theme.kind === "weakness" ? "The costliest moments" : "Examples"}
          </p>
          <div className="evidence">
            {evidence.map((row) => {
              const game = gameOf(row.gameId);
              return (
                <Link key={row.id} href={`${gamePath(state.username, state.demo, row.gameId)}?ply=${row.ply}`}>
                  <span className="san">
                    {row.moveNumber}
                    {row.color === "white" ? "." : "…"} {row.played}
                  </span>
                  {game && <span className="muted">vs {game.opponentName}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      <details className="why">
        <summary>What exactly was counted</summary>
        {theme.definition}
      </details>
    </article>
  );
}

function Themes({ session, state }: { session: PlayerSession; state: SessionState }) {
  const profile: PlayerProfile | null = state.profile;
  const running = state.engine.status === "running";
  const weaknesses = profile?.themes.filter((theme) => theme.kind === "weakness") ?? [];
  const featured = weaknesses.filter((theme) => theme.featured);
  const others = profile?.themes.filter((theme) => !theme.featured) ?? [];
  const next = state.demo ? undefined : ENGINE_GAME_STEPS.find((step) => step > state.engine.target && state.games.length > state.engine.target);

  return (
    <section aria-labelledby="themes-title">
      <div className="section-head">
        <h2 id="themes-title">Themes</h2>
        <span className="muted small">
          {profile && profile.gamesAnalysed > 0
            ? `From ${plural(profile.gamesAnalysed, "game")}: ${plural(profile.clearMistakes, "clear mistake")} in ${plural(profile.movesAnalysed, "move")}`
            : "Patterns the engine and code can prove"}
        </span>
      </div>
      <CoachSummary session={session} state={state} />
      {featured.length > 0 ? (
        <div className="grid-3">
          {featured.map((theme) => (
            <ThemeCard key={theme.key} theme={theme} state={state} />
          ))}
        </div>
      ) : (
        <div className="card empty-themes">
          {running ? (
            <>
              <h3>Looking for patterns</h3>
              <p className="muted">
                A theme appears once it has happened at least three times in three different games. Nothing yet.
              </p>
            </>
          ) : state.engine.status === "failed" ? (
            <>
              <h3>No themes without the engine</h3>
              <p className="muted">Themes need engine analysis. Start the engine again above.</p>
            </>
          ) : (
            <>
              <h3>Not enough evidence yet</h3>
              <p className="muted">
                No pattern happened at least three times in three different games across the{" "}
                {plural(profile?.gamesAnalysed ?? 0, "game")} analysed. Motif would rather say that than guess.
              </p>
              {next && (
                <button className="btn" onClick={() => void session.analyse(next)}>
                  Analyse the latest {Math.min(next, state.games.length)} games
                </button>
              )}
            </>
          )}
        </div>
      )}
      {others.length > 0 && (
        <div className="grid-3" style={{ marginTop: 16 }}>
          {others.map((theme) => (
            <ThemeCard key={theme.key} theme={theme} state={state} />
          ))}
        </div>
      )}
      {profile && profile.belowMinimum.length > 0 && (
        <p className="muted small" style={{ marginTop: 12 }}>
          Seen, but too rarely to call a theme:{" "}
          {profile.belowMinimum.map((item) => `${item.label.toLowerCase()} (${item.count} in ${plural(item.games, "game")})`).join("; ")}.
        </p>
      )}
    </section>
  );
}

function GamesList({ state }: { state: SessionState }) {
  const shown = state.games.slice(0, Math.max(state.engine.target, 25));
  return (
    <section aria-labelledby="games-title">
      <div className="section-head">
        <h2 id="games-title">Games</h2>
        <span className="muted small">Newest first. A game opens once the engine has finished it.</span>
      </div>
      <div className="card games">
        {shown.map((game) => {
          const table = state.facts[game.uuid];
          const moments = table ? table.rows.filter(isKeyMoment).length : null;
          const body = (
            <>
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
              <span className="aside row small">
                {moments === null ? (
                  <span className="chip">{state.engine.activeGameIds.includes(game.uuid) ? "Analysing…" : "Waiting"}</span>
                ) : moments === 0 ? (
                  <span className="chip good">No clear mistakes</span>
                ) : (
                  <span className="chip signal">{plural(moments, "key moment")}</span>
                )}
                <span className="muted num">{formatShortDate(game.endTime)}</span>
              </span>
            </>
          );
          return table ? (
            <Link className="game-row" key={game.uuid} href={gamePath(state.username, state.demo, game.uuid)}>
              {body}
            </Link>
          ) : (
            <div className="game-row" key={game.uuid} aria-disabled="true">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
