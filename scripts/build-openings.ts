// Fetches the two open sources behind the Openings screens and writes them as static files:
//   public/openings/book.json   named opening lines, from the Lichess chess-openings dataset (CC0)
//   public/openings/ideas.json  introductions quoted from Wikibooks "Chess Opening Theory" (CC BY-SA 4.0)
// Nothing here is written or rewritten by a language model. Usage: npm run build-openings
import { mkdirSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";
import { buildBook, familyKey, type BookFile, type IdeasFile, type OpeningIdea } from "../src/core/openings.ts";

const USER_AGENT = "fool-me-twice/0.2 (take-home project; opening data builder)";
const BOOK_SOURCE = "https://github.com/lichess-org/chess-openings";
const out = new URL("../public/openings/", import.meta.url);

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetches text. When the server asks us to slow down, waits as long as it says and tries again. */
async function getText(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.status === 429 && attempt < 6) {
      const wait = Number(response.headers.get("retry-after")) || 5 * attempt;
      await pause(wait * 1000);
      continue;
    }
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.text();
  }
}

// 1. The book.
const lines: BookFile["lines"] = [];
for (const letter of ["a", "b", "c", "d", "e"]) {
  const text = await getText(`https://raw.githubusercontent.com/lichess-org/chess-openings/master/${letter}.tsv`);
  for (const row of text.split("\n").slice(1)) {
    const [eco, name, pgn] = row.split("\t");
    if (!eco || !name || !pgn) continue;
    // Replay each line with the rules library, so every book move is known to be legal and uniformly written.
    const chess = new Chess();
    const moves: string[] = [];
    for (const token of pgn.trim().split(/\s+/)) {
      if (/^\d+\.+$/.test(token)) continue;
      moves.push(chess.move(token).san);
    }
    lines.push([eco, name.trim(), moves.join(" ")]);
  }
}
const bookFile: BookFile = { source: BOOK_SOURCE, licence: "CC0 1.0 (public domain)", fetchedAt: new Date().toISOString(), lines };
const book = buildBook(bookFile);
console.log(`Book: ${lines.length} named lines in ${book.families.size} opening families.`);

// 2. The ideas. Wikibooks pages are addressed by the moves, so each family's defining line gives its page.
function wikibooksTitle(moves: string[]): string {
  const parts = moves.map((move, index) => (index % 2 === 0 ? `${index / 2 + 1}. ${move}` : `${(index + 1) / 2}...${move}`));
  return ["Chess Opening Theory", ...parts].join("/");
}

/** The introduction of a page: its paragraphs up to the first section that is not the opening's own heading. */
function introduction(extract: string): string[] {
  const paragraphs: string[] = [];
  let headings = 0;
  for (const raw of extract.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^=+.*=+$/.test(line)) {
      headings++;
      // The first heading names the opening itself; the text under it is the introduction.
      if (headings > 1) break;
      continue;
    }
    // Skip bare move lists; keep every line of prose, so a paragraph is never quoted without the one before it.
    if (line.length < 20 || /^\d+\.\s*\S+(\s+\S+)?$/.test(line)) continue;
    paragraphs.push(line);
    if (paragraphs.join(" ").length > 900) break;
  }
  return paragraphs.slice(0, 3);
}

const ranked = [...book.families.values()]
  .map((family) => ({ ...family, size: lines.filter(([, name]) => name === family.name || name.startsWith(`${family.name}:`)).length }))
  .filter((family) => family.moves.length <= 8)
  .sort((a, b) => b.size - a.size)
  .slice(0, 90);

const ideas: Record<string, OpeningIdea> = {};
let missing = 0;
for (const family of ranked) {
  const title = wikibooksTitle(family.moves);
  const api = `https://en.wikibooks.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  try {
    const data = JSON.parse(await getText(api)) as { query?: { pages?: Record<string, { title?: string; extract?: string; missing?: string }> } };
    const page = Object.values(data.query?.pages ?? {})[0];
    const paragraphs = page?.extract ? introduction(page.extract) : [];
    if (!page || page.missing !== undefined || paragraphs.length === 0) {
      missing++;
      continue;
    }
    const pageTitle = page.title ?? title;
    ideas[familyKey(family.name)] = {
      family: family.name,
      paragraphs,
      source: "Wikibooks, Chess Opening Theory",
      title: pageTitle,
      url: `https://en.wikibooks.org/wiki/${encodeURI(pageTitle.replace(/ /g, "_"))}`,
      licence: "CC BY-SA 4.0",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    };
  } catch (error) {
    console.warn(`  could not fetch ${title}: ${error instanceof Error ? error.message : String(error)}`);
    missing++;
  }
  await pause(1200);
}
const ideasFile: IdeasFile = { fetchedAt: new Date().toISOString(), ideas };
console.log(`Ideas: ${Object.keys(ideas).length} of ${ranked.length} families have a Wikibooks introduction (${missing} without).`);

mkdirSync(out, { recursive: true });
writeFileSync(new URL("book.json", out), JSON.stringify(bookFile));
writeFileSync(new URL("ideas.json", out), JSON.stringify(ideasFile, null, 1));
console.log(`Wrote ${new URL("book.json", out).pathname} and ideas.json.`);
