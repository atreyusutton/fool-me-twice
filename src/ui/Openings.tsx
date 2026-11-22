import { Chess } from "chess.js";
import { useMemo, type ReactNode } from "react";
import { useCoach } from "../app/coach-choice.ts";
import { useOpeningData, type OpeningData } from "../app/opening-data.ts";
import { gamePath, playerPath } from "../app/router.ts";
import type { PlayerSession, SessionState } from "../app/session.ts";
import { fixedLine } from "../app/voice.ts";
import { familyKey, openingReports, type OpeningReport } from "../core/openings.ts";
import type { Color, FactTable, ParsedGame } from "../core/types.ts";
import { Board } from "./Board.tsx";
import { Say } from "./coaches/Say.tsx";
import { plural } from "./format.ts";
import { LineText } from "./LineText.tsx";
import { Link } from "./Link.tsx";
import { Loading } from "./Status.tsx";

/** Openings most players meet, offered for the drill even when the player has not played them. */
const CLASSICS = ["Italian Game", "Ruy Lopez", "Sicilian Defense", "French Defense", "Caro-Kann Defense", "Queen's Gambit Declined", "London System", "King's Indian Defense"];

/** Fixed lines for the guide. They hold no chess facts; the facts beside them are put in by code. */
export function fenAfter(sans: string[]): string {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess.fen();
}

/** Moves written with their numbers: "1. e4 c5 2. Nf3". */
export function numbered(sans: string[]): string {
  return sans.map((san, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${san}` : san)).join(" ");
}

function usePlayerGames(session: PlayerSession, state: SessionState): ParsedGame[] {
  return useMemo(
    () => state.games.map((summary) => session.getGame(summary.uuid)).filter((game): game is ParsedGame => game !== null),
    [session, state.games],
  );
}

/** Loads the book and builds the player's opening reports, then hands both to the screen. */
export function WithOpenings({
  session,
  state,
  children,
}: {
  session: PlayerSession;
  state: SessionState;
  children: (data: OpeningData, reports: OpeningReport[], games: ParsedGame[]) => ReactNode;
}) {
  const { state: loaded, retry } = useOpeningData();
  const games = usePlayerGames(session, state);
  const tableCount = Object.keys(state.facts).length;
  const reports = useMemo(
    () => (loaded.status === "ready" ? openingReports(loaded.data.book, games, Object.values(state.facts) as FactTable[]) : []),
    [loaded, games, tableCount], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (loaded.status === "loading") return <Loading title="Opening the book" />;
  if (loaded.status === "error") {
    return (
      <div className="status" role="alert">
        <h2>The opening book did not load</h2>
        <p>{loaded.error.message}</p>
        <p className="muted">Your read, reviews and practice do not need it and still work.</p>
        <button className="btn" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  return <>{children(loaded.data, reports, games)}</>;
}

function Record({ report }: { report: OpeningReport }) {
  return (
    <span className="num">
      {report.wins} won · {report.draws} drawn · {report.losses} lost
    </span>
  );
}

export function sideOf(report: OpeningReport | undefined): Color {
  return report && report.asBlack > report.asWhite ? "black" : "white";
}

/** The Openings tab: the openings the player really plays, each with a guide and a drill. */
export function Openings({ state, data, reports, games }: { state: SessionState; data: OpeningData; reports: OpeningReport[]; games: ParsedGame[] }) {
  const to = (sub: string) => playerPath(state.username, state.demo, sub);
  const played = new Set(reports.map((report) => report.family));
  const others = CLASSICS.filter((family) => data.book.families.has(family) && !played.has(family));
  return (
    <>
      <header className="stack tight">
        <p className="eyebrow">Openings</p>
        <h1>
          The openings <span className="hl">you</span> play
        </h1>
        <p className="lead">
          Where you leave the book, your first clear mistake, the ideas behind the opening, and a drill to make the book moves stick.
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="card">
          <p className="muted">None of your {plural(games.length, "game")} followed a named opening line. You can still drill one of the openings below.</p>
        </div>
      ) : (
        <section aria-labelledby="yours-title">
          <div className="section-head">
            <h2 id="yours-title">From your last {plural(games.length, "game")}</h2>
            <p className="muted small">Named by the opening book, from the moves you played.</p>
          </div>
          <div className="grid-3">
            {reports.slice(0, 9).map((report) => (
              <article key={report.key} className="card finding">
                <div className="row between">
                  <span className="chip">{sideOf(report) === "white" ? "As White" : "As Black"}</span>
                  <span className="faint small">{plural(report.games, "game")}</span>
                </div>
                <h3>{report.family}</h3>
                <p className="faint small">
                  <Record report={report} />
                </p>
                <p className="small">
                  {report.departure
                    ? `You most often leave the book on move ${report.departure.moveNumber}, with ${report.departure.played}.`
                    : report.leftByOpponent > 0
                      ? "In these games it was your opponent who left the book first."
                      : "These games stayed in the book as far as it goes."}
                </p>
                <div className="row finding-actions">
                  <Link className="btn small" href={to(`openings/${report.key}`)}>
                    Guide
                  </Link>
                  <Link className="btn small hot" href={to(`openings/${report.key}/drill`)}>
                    Drill
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="others-title">
          <div className="section-head">
            <h2 id="others-title">Drill another opening</h2>
            <p className="muted small">Not in your recent games, but worth knowing.</p>
          </div>
          <div className="row">
            {others.map((family) => (
              <Link key={family} className="pill" href={to(`openings/${familyKey(family)}/drill`)}>
                {family}
              </Link>
            ))}
          </div>
        </section>
      )}

      <Sources data={data} />
    </>
  );
}

function Sources({ data }: { data: OpeningData }) {
  return (
    <p className="source-note">
      Opening names and book moves: the{" "}
      <a href={data.bookFile.source} target="_blank" rel="noreferrer">
        Lichess chess-openings
      </a>{" "}
      dataset ({data.bookFile.lines.length.toLocaleString()} named lines, {data.bookFile.licence}). Opening ideas: quoted from Wikibooks, Chess Opening
      Theory (CC BY-SA 4.0). Neither is written or changed by AI.
    </p>
  );
}

/** One opening: what the player's games say, the quoted ideas, and the way into the drill. */
export function OpeningGuide({ state, data, reports, openingKey }: { state: SessionState; data: OpeningData; reports: OpeningReport[]; openingKey: string }) {
  const coach = useCoach();
  const to = (sub: string) => playerPath(state.username, state.demo, sub);
  const report = reports.find((candidate) => candidate.key === openingKey);
  const family = report?.family ?? [...data.book.families.keys()].find((name) => familyKey(name) === openingKey);
  if (!family) {
    return (
      <div className="status">
        <h2>The book has no opening by that name</h2>
        <Link className="btn" href={to("openings")}>
          Your openings
        </Link>
      </div>
    );
  }
  const idea = data.ideas.ideas[openingKey];
  const defining = data.book.families.get(family)?.moves ?? [];
  const departure = report?.departure ?? null;
  const mistake = report?.firstMistake ?? null;
  const side = sideOf(report);

  return (
    <>
      <header className="stack tight">
        <Link className="backlink" href={to("openings")}>
          ← Your openings
        </Link>
        <h1 className="h1-small">{family}</h1>
        <p className="muted">
          <span className="san">{numbered(defining)}</span>
          {report && (
            <>
              {" "}
              · {plural(report.games, "game")} · <Record report={report} />
            </>
          )}
        </p>
      </header>

      {report && (
        <Say who={coach} mood="talking" voice={fixedLine("guide.intro", coach).voice}>
          <p>
            <LineText parts={fixedLine("guide.intro", coach).parts} />
          </p>
        </Say>
      )}

      <div className="grid-2">
        <section className="card stack" aria-labelledby="leave-title">
          <h2 id="leave-title">Where you leave the book</h2>
          {departure ? (
            <>
              <div style={{ maxWidth: 340 }}>
                <Board fen={fenAfter(departure.line)} orientation={side} label={`The position after ${numbered(departure.line)}`} />
              </div>
              <p>
                After <span className="san">{numbered(departure.line)}</span> you played <span className="san fact played">{departure.played}</span> in{" "}
                {departure.games} of your {plural(report!.games, "game")}. No named line continues that way.
              </p>
              <div className="stack tight">
                <p className="eyebrow">The book moves here</p>
                <ul className="book-moves">
                  {departure.book.slice(0, 5).map((move) => (
                    <li key={move.san}>
                      <span className="san fact best">{move.san}</span>
                      <span className="muted small">
                        {move.name ?? `${plural(move.lines, "named line")} ${move.lines === 1 ? "continues" : "continue"} this way`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="source-note">
                Leaving the book is not a mistake in itself; it means you are on your own earlier. Whether a move was a mistake is the engine&apos;s
                call, in the next card.
              </p>
            </>
          ) : (
            <p className="muted">
              {report
                ? report.leftByOpponent > 0
                  ? `In your ${plural(report.games, "game")} it was your opponent who left the book first (${report.leftByOpponent} of ${report.games}).`
                  : "Your games stayed in the book as far as it goes."
                : "You have not played this opening in your recent games, so there is nothing of yours to show yet. The drill still works."}
            </p>
          )}
        </section>

        <div className="stack">
          <section className="card stack" aria-labelledby="mistake-title">
            <h2 id="mistake-title">Your first clear mistake</h2>
            {mistake ? (
              <>
                <p>
                  On move {mistake.moveNumber} you played <span className="san fact played">{mistake.played}</span>. The engine preferred{" "}
                  <span className="san fact best">{mistake.best}</span>. It gave up{" "}
                  <span className="num fact">{Math.round(mistake.loss)} points</span> of winning chance.
                </p>
                <div className="row">
                  <Link className="btn small" href={gamePath(state.username, state.demo, mistake.gameId, mistake.ply)}>
                    Show me
                  </Link>
                  <Link className="btn small hot" href={to(`practice?p=${encodeURIComponent(mistake.id)}`)}>
                    Try it again
                  </Link>
                </div>
              </>
            ) : (
              <p className="muted">
                {report
                  ? "The engine found no clear mistake in the first ten moves of the games it checked in this opening."
                  : "Nothing to show: no games of yours in this opening."}
              </p>
            )}
          </section>

          {report && report.variations.length > 0 && (
            <section className="card stack tight" aria-labelledby="lines-title">
              <h2 id="lines-title">Lines you reached</h2>
              <ul className="book-moves">
                {report.variations.slice(0, 5).map((variation) => (
                  <li key={variation.name}>
                    <span>{variation.name}</span>
                    <span className="muted small num">{plural(variation.games, "game")}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <section className="card stack" aria-labelledby="ideas-title">
        <h2 id="ideas-title">The ideas</h2>
        {idea ? (
          <>
            <blockquote className="quoted">
              {idea.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </blockquote>
            <p className="source-note">
              Quoted as written from{" "}
              <a href={idea.url} target="_blank" rel="noreferrer">
                {idea.source}: {idea.title.replace("Chess Opening Theory/", "")}
              </a>
              , under{" "}
              <a href={idea.licenceUrl} target="_blank" rel="noreferrer">
                {idea.licence}
              </a>
              . An engine cannot prove opening ideas, so this text is shown from its source and never written or reworded by AI.
            </p>
          </>
        ) : (
          <p className="muted">
            There is no sourced text for this opening in the app yet, and the coach does not write opening theory of its own. The book moves and
            the drill are available.
          </p>
        )}
      </section>

      <section className="card lift row between">
        <div className="stack tight">
          <h2>Make it stick</h2>
          <p className="muted">Play the {family} against Blundy McBlunderpants. He plays likely book moves; you stay in the book.</p>
        </div>
        <Link className="btn hot" href={to(`openings/${openingKey}/drill`)}>
          Start the drill
        </Link>
      </section>

      <Sources data={data} />
    </>
  );
}
