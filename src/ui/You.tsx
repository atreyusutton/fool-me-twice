import { useEffect } from "react";
import { useCoach } from "../app/coach-choice.ts";
import { gamePath, playerPath } from "../app/router.ts";
import { coachSlot, ENGINE_GAME_STEPS, type CoachEntry, type PlayerSession, type SessionState } from "../app/session.ts";
import { voiceLine } from "../app/voice.ts";
import type { CoachId } from "../core/coach/personas.ts";
import type { ProfileSummary } from "../core/coach/types.ts";
import { evidenceRows, type Theme } from "../core/profile.ts";
import type { Tier1Stats } from "../core/tier1.ts";
import type { Ending, FactTable } from "../core/types.ts";
import { Say } from "./coaches/Say.tsx";
import { CoachSource } from "./CoachSource.tsx";
import { CoachText } from "./CoachText.tsx";
import { ENDING_WORD, formatClock, formatDate, formatPercent, plural } from "./format.ts";
import { Link } from "./Link.tsx";
import { TallyBar, TallyLegend } from "./Tally.tsx";

/** What each coach says while the engine is still reading. Fixed lines with no chess facts in them. */
const WAITING: Record<CoachId, string> = {
  sherlock: "A moment. I never guess; I am collecting the evidence.",
  pooh: "I am thinking about your games. It takes a little while, when you are a Bear of Very Little Brain.",
  hook: "Patience, my hearty. I am going through your games for bad form.",
  dracula: "Be patient. I am reading your games. I have all night.",
};
const THIN: Record<CoachId, string> = {
  sherlock: "The evidence is thin. No mistake has repeated often enough for me to name a pattern, and I will not theorise without data.",
  pooh: "I looked, and I could not find a mistake that keeps coming back. Not yet. So I shall not pretend that I did.",
  hook: "No bad form has repeated often enough to charge you with. Play more games, and we shall see.",
  dracula: "Nothing has returned often enough to call it a habit. I can wait. Play more, and come back.",
};

export function You({ session, state }: { session: PlayerSession; state: SessionState }) {
  const coach = useCoach();
  const done = state.engine.status === "done";
  const profile = state.profile;
  const hasThemes = (profile?.themes.length ?? 0) > 0;
  useEffect(() => {
    if (done && hasThemes) session.ensureCoach("profile", coach);
  }, [session, done, hasThemes, coach, profile]);

  const entry = state.coach[coachSlot(coach, "profile")];
  const rating = state.ratings.find((item) => item.timeClass === state.timeClass);
  const weaknesses = profile?.themes.filter((theme) => theme.kind === "weakness" && theme.featured).slice(0, 3) ?? [];
  const strengths = profile?.themes.filter((theme) => theme.kind === "strength") ?? [];
  const records = profile?.themes.filter((theme) => theme.kind === "record") ?? [];
  const to = (sub = "") => playerPath(state.username, state.demo, sub);

  return (
    <>
      <header className="row between" style={{ alignItems: "end" }}>
        <div className="stack tight">
          <p className="eyebrow">Your read</p>
          <h1>{state.player?.displayName}</h1>
          <p className="muted">
            {plural(state.games.length, `${state.timeClass} game`)}
            {state.tier1?.from && state.tier1.to && `, ${formatDate(state.tier1.from)} to ${formatDate(state.tier1.to)}`}
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

      <Read session={session} state={state} coach={coach} entry={entry} />

      {done && weaknesses.length > 0 && (
        <section aria-labelledby="back-title">
          <div className="section-head">
            <h2 id="back-title">
              What keeps <span className="hl">coming back</span>
            </h2>
            <p className="muted small">Found by code in {plural(profile?.gamesAnalysed ?? 0, "game")}. Counted, not guessed.</p>
          </div>
          <div className="grid-3">
            {weaknesses.map((theme) => (
              <Finding key={theme.key} theme={theme} state={state} entry={entry} />
            ))}
          </div>
        </section>
      )}

      {done && (strengths.length > 0 || records.length > 0) && (
        <section aria-labelledby="well-title">
          <div className="section-head">
            <h2 id="well-title">What is going well</h2>
          </div>
          <div className="grid-3">
            {[...strengths, ...records].map((theme) => (
              <Finding key={theme.key} theme={theme} state={state} entry={entry} />
            ))}
          </div>
        </section>
      )}

      {done && (
        <section className="card lift stack" aria-labelledby="next-title">
          <h2 id="next-title">What next</h2>
          <div className="grid-3">
            <NextStep href={to("games")} title="Review a game" text="Step through a game with your coach, one key moment at a time." />
            <NextStep href={to("practice")} title="Practice your mistakes" text="The positions you got wrong, as puzzles. The engine checks your answer." />
            <NextStep href={to("openings")} title="Drill your openings" text="Your own openings against Blundy McBlunderpants, until the book moves stick." />
          </div>
        </section>
      )}

      {state.tier1 && (
        <details className="more">
          <summary>See the numbers</summary>
          <Numbers tier1={state.tier1} gameCount={state.games.length} profile={profile} />
        </details>
      )}
    </>
  );
}

function NextStep({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="next-step">
      <strong>{title} →</strong>
      <span className="muted small">{text}</span>
    </Link>
  );
}

/** The top of the page: the engine's progress while it works, then the coach's read. */
function Read({ session, state, coach, entry }: { session: PlayerSession; state: SessionState; coach: CoachId; entry: CoachEntry | undefined }) {
  const engine = state.engine;
  const total = Math.min(engine.target, state.games.length);

  if (engine.status === "failed" && engine.error) {
    return (
      <div className="notice" role="alert">
        <strong>The chess engine stopped.</strong> {engine.error.message} {plural(engine.gamesDone, "game")} finished before it stopped. The
        numbers below need no engine and are still correct.{" "}
        <button className="btn small ghost" onClick={() => void session.analyse(engine.target)}>
          Start the engine again
        </button>
      </div>
    );
  }
  if (engine.status !== "done") {
    const fraction = engine.positionsTotal > 0 ? Math.min(1, engine.positionsDone / engine.positionsTotal) : 0;
    return (
      <div role="status" aria-live="polite">
        <Say who={coach} mood="thinking" big>
          <p>{WAITING[coach]}</p>
          <div className="stack tight" style={{ marginTop: 14 }}>
            <div className="bar" aria-hidden="true">
              <i style={{ width: `${fraction * 100}%` }} />
            </div>
            <p className="source-note">
              {engine.gamesDone} of {total} games checked by the engine. Slowest on the first visit; results are saved on this device.
              Finished games can already be opened under Review.
            </p>
          </div>
        </Say>
      </div>
    );
  }

  const profile = state.profile;
  if (!profile || profile.themes.length === 0 || !entry || entry.request.kind !== "profile") {
    const waiting = profile && profile.themes.length > 0;
    return (
      <Say who={coach} mood={waiting ? "thinking" : "idle"} big>
        <p>{waiting ? WAITING[coach] : THIN[coach]}</p>
        {!waiting && (
          <p className="source-note" style={{ marginTop: 10 }}>
            A pattern is only named after it shows up at least three times in three different games. {plural(profile?.gamesAnalysed ?? 0, "game")}{" "}
            checked, {plural(profile?.clearMistakes ?? 0, "clear mistake")} found.
          </p>
        )}
        <MoreGames session={session} state={state} />
      </Say>
    );
  }

  const summary = entry.result.reply as ProfileSummary;
  const focus = entry.request.profile.themes.find((theme) => theme.id === summary.focus.theme);
  return (
    <section className="stack" aria-label="Your coach's read">
      <Say
        who={coach}
        mood={entry.status === "loading" ? "thinking" : "talking"}
        big
        voice={entry.status === "ready" ? voiceLine(entry.request, summary, ["headline", "closing"]) : null}
      >
        <p>{summary.headline}</p>
      </Say>
      <div className="read-body stack">
        <p className="lead" style={{ color: "var(--ink)" }}>
          <CoachText text={summary.focus.text} request={entry.request} />
        </p>
        <div className="row">
          {focus && <span className="chip hot">Work on first: {focus.label}</span>}
          <MoreGames session={session} state={state} />
        </div>
        <CoachSource entry={entry} recorded={state.recording !== null} />
      </div>
    </section>
  );
}

function MoreGames({ session, state }: { session: PlayerSession; state: SessionState }) {
  const engine = state.engine;
  if (state.recording || engine.status !== "done") return null;
  const next = ENGINE_GAME_STEPS.find((step) => step > engine.target && state.games.length > engine.target);
  if (!next) return null;
  return (
    <button className="btn small ghost" onClick={() => void session.analyse(next)}>
      Read my latest {Math.min(next, state.games.length)} games
    </button>
  );
}

function themeNumbers(theme: Theme): string {
  if (theme.comparison) {
    const c = theme.comparison;
    return `${c.a}: ${c.aScore}% score in ${plural(c.aGames, "game")}. ${c.b}: ${c.bScore}% in ${plural(c.bGames, "game")}.`;
  }
  const where = theme.phase ? `, mostly in the ${theme.phase}` : "";
  if (theme.kind === "strength" && theme.chances !== null) {
    return `${theme.count} of ${plural(theme.chances, "chance")} taken, across ${plural(theme.games, "game")}${where}.`;
  }
  return `In ${theme.games} of ${plural(theme.gamesAnalysed, "game")}${where}.`;
}

/** The coach's sentence for one theme, if a checked summary exists and still describes this exact theme. */
function coachSentence(theme: Theme, entry: CoachEntry | undefined) {
  if (!entry || entry.request.kind !== "profile") return null;
  const sent = entry.request.profile.themes.find((candidate) => candidate.key === theme.key);
  if (!sent || sent.count !== theme.count || sent.games !== theme.games || sent.gamesAnalysed !== theme.gamesAnalysed) return null;
  const item = (entry.result.reply as ProfileSummary).themes.find((candidate) => candidate.theme === sent.id);
  return item ? { text: item.text, request: entry.request } : null;
}

function Finding({ theme, state, entry }: { theme: Theme; state: SessionState; entry: CoachEntry | undefined }) {
  const sentence = coachSentence(theme, entry);
  const tables = Object.values(state.facts) as FactTable[];
  const worst = evidenceRows(theme, tables, 1)[0];
  const weakness = theme.kind === "weakness";
  return (
    <article className={`card finding ${theme.kind}`}>
      {!theme.comparison && (
        <p className="finding-count num" aria-label={`${theme.count} times`}>
          {theme.count}
          <span>×</span>
        </p>
      )}
      <h3>{theme.label}</h3>
      <p className="faint small">{themeNumbers(theme)}</p>
      <p>{sentence ? <CoachText text={sentence.text} request={sentence.request} /> : theme.definition}</p>
      <div className="row finding-actions">
        {worst && (
          <Link className={`btn small ${weakness ? "" : "ghost"}`} href={gamePath(state.username, state.demo, worst.gameId, worst.ply)}>
            Show me
          </Link>
        )}
        {weakness && (
          <Link className="btn small hot" href={playerPath(state.username, state.demo, `practice/${theme.key}`)}>
            Practice this
          </Link>
        )}
      </div>
      <details className="more small">
        <summary>What exactly was counted</summary>
        <p className="muted">{theme.definition}</p>
      </details>
    </article>
  );
}

function endingList(counts: Partial<Record<Ending, number>>): string {
  const entries = (Object.entries(counts) as [Ending, number][]).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "none yet";
  return entries.map(([ending, count]) => `${count} by ${ENDING_WORD[ending]}`).join(", ");
}

/** The plain record, for anyone who wants it. Counted from the game list; no engine and no model. */
function Numbers({ tier1, gameCount, profile }: { tier1: Tier1Stats; gameCount: number; profile: SessionState["profile"] }) {
  const openings = tier1.byOpening.slice(0, 6);
  return (
    <div className="stack">
      <p className="muted small">Counted from the last {plural(gameCount, "game")}. No engine and no AI involved.</p>
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
                On average {formatClock(tier1.clockAtEnd.average)} left; the lowest was {formatClock(tier1.clockAtEnd.lowest)}. From{" "}
                {plural(tier1.clockAtEnd.games, "game")} with clock times.
              </p>
            </div>
          )}
          {profile && profile.belowMinimum.length > 0 && (
            <div>
              <h3>Seen, but not often enough to name</h3>
              <p className="muted small">
                {profile.belowMinimum.map((item) => `${item.label} (${item.count})`).join(", ")}. The coach does not talk about these.
              </p>
            </div>
          )}
        </div>
      </div>
      {openings.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Openings played most</h3>
          <div className="scroll-x">
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
        </div>
      )}
    </div>
  );
}
