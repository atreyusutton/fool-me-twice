import type { Color, FactRow, FactTable, Outcome, ParsedGame } from "./types.ts";

/**
 * The opening book. Lines and names come from the Lichess chess-openings dataset (public domain),
 * fetched by `npm run build-openings` into a static file. The language model never names an opening
 * and never supplies a book move: a move is "book" only if a named line in the dataset contains it.
 */
export interface BookFile {
  source: string;
  licence: string;
  fetchedAt: string;
  /** One row per named line: ECO code, name, and the moves in standard notation separated by spaces. */
  lines: [eco: string, name: string, moves: string][];
}

export interface BookNode {
  children: Map<string, BookNode>;
  /** The name of the line that ends exactly here, when there is one. */
  name: string | null;
  eco: string | null;
  /** How many named lines pass through or end at this position. */
  lines: number;
  /** The opening families that have a line through or ending at this position. */
  families: Set<string>;
}

export interface Book {
  root: BookNode;
  /** Every family with its shortest line, which is the position that defines it. */
  families: Map<string, { name: string; moves: string[] }>;
}

/** "Sicilian Defense: Najdorf Variation" belongs to the family "Sicilian Defense". */
export function familyOf(name: string): string {
  return name.split(":")[0]!.trim();
}

/** A family's name as it appears in an address: "Queen's Gambit Declined" becomes "queens-gambit-declined". */
export function familyKey(family: string): string {
  return family
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const newNode = (): BookNode => ({ children: new Map(), name: null, eco: null, lines: 0, families: new Set() });

export function buildBook(file: BookFile): Book {
  const root = newNode();
  const families = new Map<string, { name: string; moves: string[] }>();
  for (const [eco, name, text] of file.lines) {
    const moves = text.split(" ").filter(Boolean);
    const family = familyOf(name);
    let node = root;
    node.lines++;
    node.families.add(family);
    for (const move of moves) {
      let child = node.children.get(move);
      if (!child) {
        child = newNode();
        node.children.set(move, child);
      }
      child.lines++;
      child.families.add(family);
      node = child;
    }
    // The dataset lists some positions under more than one name; the first one listed is kept.
    if (node.name === null) {
      node.name = name;
      node.eco = eco;
    }
    const known = families.get(family);
    if (!known || moves.length < known.moves.length) families.set(family, { name: family, moves });
  }
  return { root, families };
}

export function nodeAt(book: Book, moves: string[]): BookNode | null {
  let node: BookNode | undefined = book.root;
  for (const move of moves) {
    node = node.children.get(move);
    if (!node) return null;
  }
  return node;
}

export interface BookMove {
  san: string;
  /** Named lines that continue with this move. */
  lines: number;
  /** The name of the position after the move, when the move completes a named line. */
  name: string | null;
}

/** The book moves in a position, most common in the dataset first. With `family`, only moves that stay in it. */
export function bookMoves(book: Book, moves: string[], family: string | null = null): BookMove[] {
  const node = nodeAt(book, moves);
  if (!node) return [];
  return [...node.children.entries()]
    .filter(([, child]) => family === null || child.families.has(family))
    .map(([san, child]) => ({ san, lines: child.lines, name: child.name }))
    .sort((a, b) => b.lines - a.lines || a.san.localeCompare(b.san));
}

export interface BookWalk {
  /** How many of the game's moves (counted in plies) are in the book. */
  depth: number;
  /** The deepest named position the game reached, and its family. */
  name: string | null;
  eco: string | null;
  family: string | null;
}

/** Follows a game's moves through the book until it leaves it. */
export function walkBook(book: Book, moves: string[]): BookWalk {
  let node = book.root;
  let depth = 0;
  let name: string | null = null;
  let eco: string | null = null;
  for (const move of moves) {
    const child = node.children.get(move);
    if (!child) break;
    node = child;
    depth++;
    if (child.name) {
      name = child.name;
      eco = child.eco;
    }
  }
  return { depth, name, eco, family: name ? familyOf(name) : null };
}

export interface Departure {
  /** The moves that led to the position, all in the book. */
  line: string[];
  /** The move the player chose there, which no named line contains. */
  played: string;
  moveNumber: number;
  /** How many of the player's games in this opening left the book with this move in this position. */
  games: number;
  gameIds: string[];
  /** The book moves that were available. */
  book: BookMove[];
}

export interface OpeningReport {
  family: string;
  key: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Games with each colour, to offer the side the player usually has. */
  asWhite: number;
  asBlack: number;
  gameIds: string[];
  /** Named lines the player reached, most often first. */
  variations: { name: string; games: number }[];
  /** Where the player (not the opponent) most often leaves the book. Null when that never happened twice in one place and never at all. */
  departure: Departure | null;
  /** How many games left the book by the player's move, and by the opponent's. */
  leftByPlayer: number;
  leftByOpponent: number;
  /** The earliest clear mistake in the opening phase of an analysed game of this opening, costliest first on a tie. */
  firstMistake: FactRow | null;
}

const colorOfPly = (ply: number): Color => (ply % 2 === 1 ? "white" : "black");

/**
 * What the player's own games say about each opening they play. Counted from the game records and the
 * book; the clear mistake comes from the engine's fact tables. Families are the book's, so the names
 * here match the names in the drill.
 */
export function openingReports(book: Book, games: ParsedGame[], tables: FactTable[]): OpeningReport[] {
  const rowsByGame = new Map(tables.map((table) => [table.gameId, table.rows]));
  const byFamily = new Map<string, { report: OpeningReport; departures: Map<string, Departure>; variations: Map<string, number> }>();
  for (const game of games) {
    const sans = game.moves.map((move) => move.san);
    const walk = walkBook(book, sans);
    if (!walk.family) continue;
    let entry = byFamily.get(walk.family);
    if (!entry) {
      entry = {
        report: {
          family: walk.family, key: familyKey(walk.family), games: 0, wins: 0, draws: 0, losses: 0, asWhite: 0, asBlack: 0, gameIds: [],
          variations: [], departure: null, leftByPlayer: 0, leftByOpponent: 0, firstMistake: null,
        },
        departures: new Map(),
        variations: new Map(),
      };
      byFamily.set(walk.family, entry);
    }
    const { report } = entry;
    const outcome: Outcome = game.summary.outcome;
    report.games++;
    report.gameIds.push(game.summary.uuid);
    if (outcome === "win") report.wins++;
    else if (outcome === "draw") report.draws++;
    else report.losses++;
    if (game.summary.playerColor === "white") report.asWhite++;
    else report.asBlack++;
    if (walk.name) entry.variations.set(walk.name, (entry.variations.get(walk.name) ?? 0) + 1);

    // The first move outside the book, if the game went on that long.
    const leaving = game.moves[walk.depth];
    if (leaving) {
      if (colorOfPly(leaving.ply) === game.summary.playerColor) {
        report.leftByPlayer++;
        const line = sans.slice(0, walk.depth);
        const id = `${line.join(" ")}|${leaving.san}`;
        const known = entry.departures.get(id);
        if (known) {
          known.games++;
          known.gameIds.push(game.summary.uuid);
        } else {
          entry.departures.set(id, { line, played: leaving.san, moveNumber: leaving.moveNumber, games: 1, gameIds: [game.summary.uuid], book: bookMoves(book, line) });
        }
      } else {
        report.leftByOpponent++;
      }
    }

    const mistake = (rowsByGame.get(game.summary.uuid) ?? []).find((row) => row.clear && row.phase === "opening" && row.best !== null);
    if (mistake) {
      const current = report.firstMistake;
      if (!current || mistake.moveNumber < current.moveNumber || (mistake.moveNumber === current.moveNumber && mistake.loss > current.loss)) {
        report.firstMistake = mistake;
      }
    }
  }
  return [...byFamily.values()]
    .map(({ report, departures, variations }) => ({
      ...report,
      variations: [...variations.entries()].map(([name, count]) => ({ name, games: count })).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
      departure: [...departures.values()].sort((a, b) => b.games - a.games || a.line.length - b.line.length)[0] ?? null,
    }))
    .sort((a, b) => b.games - a.games || a.family.localeCompare(b.family));
}

/** How often the player's opponents played each move in each position the player has had, by line. */
export type ReplyCounts = Map<string, Map<string, number>>;

export function opponentReplies(games: ParsedGame[], maxPlies = 24): ReplyCounts {
  const counts: ReplyCounts = new Map();
  for (const game of games) {
    const line: string[] = [];
    for (const move of game.moves.slice(0, maxPlies)) {
      if (colorOfPly(move.ply) !== game.summary.playerColor) {
        const key = line.join(" ");
        const replies = counts.get(key) ?? new Map<string, number>();
        replies.set(move.san, (replies.get(move.san) ?? 0) + 1);
        counts.set(key, replies);
      }
      line.push(move.san);
    }
  }
  return counts;
}

/** How much one game of the player's own counts against one named line when choosing a likely reply. */
export const OWN_GAME_WEIGHT = 5;

/**
 * The drill opponent's move: a random book move that stays in the chosen opening, weighted towards
 * what this player's real opponents played and towards moves that more named lines continue with.
 * `random` returns a number from 0 up to 1. Null when the book has no move left in this opening.
 */
export function likelyReply(book: Book, line: string[], family: string, replies: ReplyCounts, random: () => number): BookMove | null {
  const options = bookMoves(book, line, family);
  if (options.length === 0) return null;
  const seen = replies.get(line.join(" "));
  const weights = options.map((option) => option.lines + OWN_GAME_WEIGHT * (seen?.get(option.san) ?? 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let index = 0; index < options.length; index++) {
    roll -= weights[index]!;
    if (roll < 0) return options[index]!;
  }
  return options[options.length - 1]!;
}

export type DrillCheck =
  /** A book move that stays in the opening being drilled. */
  | { kind: "book"; move: BookMove }
  /** A book move, but of a different opening. */
  | { kind: "other_opening"; name: string | null; book: BookMove[] }
  /** Not in any named line. */
  | { kind: "not_book"; book: BookMove[] };

/** Checks the player's move in the drill against the book. */
export function checkDrillMove(book: Book, line: string[], family: string, san: string): DrillCheck {
  const inFamily = bookMoves(book, line, family);
  const match = inFamily.find((move) => move.san === san);
  if (match) return { kind: "book", move: match };
  const anywhere = nodeAt(book, [...line, san]);
  if (anywhere) return { kind: "other_opening", name: walkBook(book, [...line, san]).name, book: inFamily };
  return { kind: "not_book", book: inFamily };
}

/** The name of the deepest named position along a line, for showing where the drill is. */
export function lineName(book: Book, line: string[]): string | null {
  return walkBook(book, line).name;
}

/** Text quoted from an open source about one opening. Shown as written, with its source and licence. */
export interface OpeningIdea {
  family: string;
  /** Paragraphs, exactly as fetched. */
  paragraphs: string[];
  source: string;
  title: string;
  url: string;
  licence: string;
  licenceUrl: string;
}
export interface IdeasFile {
  fetchedAt: string;
  ideas: Record<string, OpeningIdea>;
}
