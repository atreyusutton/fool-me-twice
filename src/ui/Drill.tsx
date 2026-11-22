import { Chess } from "chess.js";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { OpeningData } from "../app/opening-data.ts";
import { playerPath } from "../app/router.ts";
import type { PlayerSession, SessionState } from "../app/session.ts";
import { bookMoves, checkDrillMove, familyKey, likelyReply, lineName, opponentReplies, type BookMove, type OpeningReport } from "../core/openings.ts";
import type { Color, ParsedGame } from "../core/types.ts";
import { Board } from "./Board.tsx";
import type { Mood } from "./coaches/Figure.tsx";
import { Say } from "./coaches/Say.tsx";
import { plural } from "./format.ts";
import { Link } from "./Link.tsx";
import { numbered, sideOf } from "./Openings.tsx";

/** What Blundy says about his own move. Fixed lines; the move's name is put in by code from the book. */
const BLUNDY_MOVES: ((move: ReactNode) => ReactNode)[] = [
  (move) => <>I play {move}. I meant to do that.</>,
  (move) => <>{move}! Is that good? It felt good.</>,
  (move) => <>Behold: {move}. Somebody told me it is in the book.</>,
  (move) => <>{move}. I have never lost with this move. I have never won with it either.</>,
  (move) => <>Here comes {move}. My trousers are full of moves like this.</>,
];

interface DrillProgress {
  /** Lines finished, and lines finished without leaving the book once, by opening. */
  [openingKey: string]: { lines: number; clean: number };
}

type Feedback =
  | { kind: "start" }
  | { kind: "blundy"; san: string; variant: number }
  | { kind: "right"; san: string; name: string | null }
  | { kind: "not_book"; san: string; book: BookMove[] }
  | { kind: "other"; san: string; name: string | null; book: BookMove[] }
  | { kind: "done"; name: string | null; slips: number };

const Move = ({ san, kind }: { san: string; kind?: "played" | "best" }) => <span className={`san fact${kind ? ` ${kind}` : ""}`}>{san}</span>;

export function Drill({
  session,
  state,
  data,
  reports,
  games,
  openingKey,
}: {
  session: PlayerSession;
  state: SessionState;
  data: OpeningData;
  reports: OpeningReport[];
  games: ParsedGame[];
  openingKey: string;
}) {
  const to = (sub: string) => playerPath(state.username, state.demo, sub);
  const report = reports.find((candidate) => candidate.key === openingKey);
  const family = report?.family ?? [...data.book.families.keys()].find((name) => familyKey(name) === openingKey);
  const [side, setSide] = useState<Color>(() => sideOf(report));
  const [round, setRound] = useState(0);
  const [progress, setProgress] = useState<DrillProgress>({});
  useEffect(() => {
    let live = true;
    void session.loadProgress<DrillProgress>("drill").then((saved) => {
      if (live && saved) setProgress(saved);
    });
    return () => {
      live = false;
    };
  }, [session]);
  const replies = useMemo(() => opponentReplies(games), [games]);

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
  const mine = progress[openingKey] ?? { lines: 0, clean: 0 };
  return (
    <>
      <header className="row between" style={{ alignItems: "end" }}>
        <div className="stack tight">
          <Link className="backlink" href={to(`openings/${openingKey}`)}>
            ← {family}
          </Link>
          <h1 className="h1-small">
            Drill: <span className="hl">{family}</span>
          </h1>
          <p className="muted">Blundy plays likely book moves. Your job: stay in the book. Any book move of this opening counts.</p>
        </div>
        <div className="stack tight" style={{ justifyItems: "end" }}>
          <div className="segmented" role="group" aria-label="Your side">
            {(["white", "black"] as const).map((color) => (
              <button
                key={color}
                aria-pressed={side === color}
                onClick={() => {
                  setSide(color);
                  setRound((value) => value + 1);
                }}
              >
                Play {color}
              </button>
            ))}
          </div>
          <span className="muted small num">
            {plural(mine.lines, "line")} finished, {mine.clean} without a slip
          </span>
        </div>
      </header>
      <Line
        key={`${side}|${round}`}
        data={data}
        family={family}
        side={side}
        replies={replies}
        onDone={(clean) => {
          const next = { ...progress, [openingKey]: { lines: mine.lines + 1, clean: mine.clean + (clean ? 1 : 0) } };
          setProgress(next);
          void session.saveProgress("drill", next);
        }}
        onAgain={() => setRound((value) => value + 1)}
        guideHref={to(`openings/${openingKey}`)}
      />
    </>
  );
}

function sanOf(fen: string, uci: string): { san: string; fen: string } | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return { san: move.san, fen: chess.fen() };
  } catch {
    // The board only offers legal moves, so this is a move the rules library refused: ignore it.
    return null;
  }
}

function uciOf(fen: string, san: string): { uci: string; fen: string } {
  const chess = new Chess(fen);
  const move = chess.move(san);
  return { uci: `${move.from}${move.to}${move.promotion ?? ""}`, fen: chess.fen() };
}

const START_FEN = new Chess().fen();

/** One run through one line of the book. */
function Line({
  data,
  family,
  side,
  replies,
  onDone,
  onAgain,
  guideHref,
}: {
  data: OpeningData;
  family: string;
  side: Color;
  replies: ReturnType<typeof opponentReplies>;
  onDone: (clean: boolean) => void;
  onAgain: () => void;
  guideHref: string;
}) {
  const { book } = data;
  // The drill starts from the position that defines the opening, so every line played belongs to it.
  const opening = useMemo(() => {
    const moves = book.families.get(family)?.moves ?? [];
    let fen = START_FEN;
    let last: string | null = null;
    for (const san of moves) {
      const played = uciOf(fen, san);
      fen = played.fen;
      last = played.uci;
    }
    return { moves, fen, last };
  }, [book, family]);
  const [line, setLine] = useState<string[]>(opening.moves);
  const [fen, setFen] = useState(opening.fen);
  const [lastMove, setLastMove] = useState<string | null>(opening.last);
  const [feedback, setFeedback] = useState<Feedback>({ kind: "start" });
  const [slips, setSlips] = useState(0);
  const [showBook, setShowBook] = useState(false);
  const blundyToMove = feedback.kind !== "done" && (line.length % 2 === 0 ? "white" : "black") !== side;

  // Blundy's turn: a likely book reply after a short pause, or the end of the line when the book runs out.
  useEffect(() => {
    if (!blundyToMove) return;
    const timer = window.setTimeout(() => {
      const reply = likelyReply(book, line, family, replies, Math.random);
      if (!reply) {
        setFeedback({ kind: "done", name: lineName(book, line), slips });
        onDone(slips === 0);
        return;
      }
      const played = uciOf(fen, reply.san);
      const nextLine = [...line, reply.san];
      setLine(nextLine);
      setFen(played.fen);
      setLastMove(played.uci);
      if (bookMoves(book, nextLine, family).length === 0) {
        setFeedback({ kind: "done", name: lineName(book, nextLine), slips });
        onDone(slips === 0);
      } else {
        setFeedback({ kind: "blundy", san: reply.san, variant: Math.floor(Math.random() * BLUNDY_MOVES.length) });
      }
    }, 800);
    return () => window.clearTimeout(timer);
    // Runs once each time it becomes Blundy's turn; the other values are read as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blundyToMove, line.length]);

  const onMove = (uci: string) => {
    const played = sanOf(fen, uci);
    if (!played) return;
    const check = checkDrillMove(book, line, family, played.san);
    if (check.kind === "book") {
      setLine([...line, played.san]);
      setFen(played.fen);
      setLastMove(uci);
      setShowBook(false);
      setFeedback({ kind: "right", san: played.san, name: check.move.name });
      return;
    }
    setSlips((value) => value + 1);
    setFeedback(check.kind === "not_book" ? { kind: "not_book", san: played.san, book: check.book } : { kind: "other", san: played.san, name: check.name, book: check.book });
  };

  let mood: Mood;
  let speech: ReactNode;
  if (feedback.kind === "start") {
    speech = blundyToMove
      ? `This is the ${family}. It is my move. Stand back.`
      : `This is the ${family}. It is your move. Take your time. I certainly would not.`;
    mood = "talking";
  } else if (feedback.kind === "blundy") {
    speech = BLUNDY_MOVES[feedback.variant]!(<Move san={feedback.san} />);
    mood = "talking";
  } else if (feedback.kind === "right") {
    speech = (
      <>
        <Move san={feedback.san} kind="best" />. Hmph. That is in the book.{feedback.name ? ` You have reached the ${feedback.name}.` : ""} Let me think.
      </>
    );
    mood = "thinking";
  } else if (feedback.kind === "not_book") {
    speech = (
      <>
        Ha! <Move san={feedback.san} kind="played" /> is not in the book. Even I know that, and I am me. Take it back and try again.
      </>
    );
    mood = "pleased";
  } else if (feedback.kind === "other") {
    speech = (
      <>
        <Move san={feedback.san} kind="played" /> is a book move, but it belongs to {feedback.name ? `the ${feedback.name}` : "another opening"}. We are
        drilling the {family}. Again!
      </>
    );
    mood = "pleased";
  } else {
    speech =
      feedback.slips === 0 ? (
        <>That is the end of the book for this line{feedback.name ? `: the ${feedback.name}` : ""}. You never left it. I am as surprised as you are.</>
      ) : (
        <>
          End of the line{feedback.name ? `: the ${feedback.name}` : ""}. You wandered off {plural(feedback.slips, "time")}, but you got there. I wandered
          off years ago.
        </>
      );
    mood = "wince";
  }
  const slipped = feedback.kind === "not_book" || feedback.kind === "other";
  const options = slipped ? feedback.book : bookMoves(book, line, family);
  const name = lineName(book, line);

  return (
    <div className="review">
      <div className="review-board stack">
        <Board
          fen={fen}
          orientation={side}
          lastMove={lastMove}
          label={`Opening drill, seen from ${side}'s side${line.length ? `, after ${numbered(line)}` : ""}`}
          onMove={!blundyToMove && feedback.kind !== "done" ? onMove : undefined}
        />
        <p className="muted small" style={{ textAlign: "center" }} aria-live="polite">
          {feedback.kind === "done" ? "Line finished." : blundyToMove ? "Blundy is thinking, in his way." : "Your move. Play a book move."}
        </p>
      </div>

      <div className="review-coach stack">
        <div aria-live="polite">
          <Say who="blundy" mood={mood} size={88}>
            <p>{speech}</p>
          </Say>
        </div>

        <div className="card stack tight">
          <p className="eyebrow">Where you are</p>
          <p>
            <strong>{name ?? "The starting position"}</strong>
          </p>
          <p className="san small" style={{ wordSpacing: "0.15em" }}>
            {line.length ? numbered(line) : "No moves yet"}
          </p>
        </div>

        {feedback.kind === "done" ? (
          <div className="row">
            <button className="btn" onClick={onAgain} autoFocus>
              Another line →
            </button>
            <Link className="btn ghost" href={guideHref}>
              Back to the guide
            </Link>
          </div>
        ) : (
          !blundyToMove && (
            <div className="stack tight">
              {showBook || slipped ? (
                <>
                  <p className="eyebrow">The book moves here</p>
                  <ul className="book-moves">
                    {options.slice(0, 6).map((move) => (
                      <li key={move.san}>
                        <span className="san fact best">{move.san}</span>
                        <span className="muted small">{move.name ?? `${plural(move.lines, "named line")} ${move.lines === 1 ? "continues" : "continue"} this way`}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div>
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      setShowBook(true);
                      setSlips((value) => value + 1);
                    }}
                  >
                    Show me the book moves
                  </button>
                </div>
              )}
            </div>
          )
        )}

        <p className="source-note">
          A move counts when a named line of the {family} in the{" "}
          <a href={data.bookFile.source} target="_blank" rel="noreferrer">
            Lichess chess-openings
          </a>{" "}
          dataset contains it. Blundy picks among those lines at random, leaning towards what your own opponents played. Being in the book says nothing
          about whether a move is best.
        </p>
      </div>
    </div>
  );
}
