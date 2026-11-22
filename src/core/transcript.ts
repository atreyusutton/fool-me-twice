/**
 * Reads a session transcript (the Markdown files in `transcripts/`) into turns and messages, so the
 * Process tab can show it as a conversation. Nothing is added or reworded: every message is the text
 * that stands in the file under its heading.
 */
export interface TranscriptMessage {
  /** Who is speaking: the user, the agent replying, or a note of the work the agent did. */
  role: "user" | "agent" | "work";
  /** The heading as written, for example "Agent: reply (condensed)". */
  label: string;
  text: string;
}
export interface TranscriptTurn {
  number: number;
  messages: TranscriptMessage[];
}
export interface Transcript {
  title: string;
  /** The notes at the top of the file: date, tool, what was changed for privacy. */
  intro: string;
  turns: TranscriptTurn[];
}

function roleOf(label: string): TranscriptMessage["role"] {
  const lower = label.toLowerCase();
  if (lower.startsWith("user")) return "user";
  if (lower.includes("what was done")) return "work";
  return "agent";
}

/** A user's message is written as a Markdown quote; the "> " marks are removed, nothing else. */
function unquote(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^> ?/, ""))
    .join("\n");
}

const clean = (lines: string[]): string =>
  lines
    .filter((line) => line.trim() !== "---")
    .join("\n")
    .trim();

export function parseTranscript(markdown: string): Transcript {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let title = "";
  const intro: string[] = [];
  const turns: TranscriptTurn[] = [];
  let turn: TranscriptTurn | null = null;
  let label: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (turn && label !== null) {
      const role = roleOf(label);
      const text = clean(buffer);
      if (text) turn.messages.push({ role, label, text: role === "user" ? unquote(text) : text });
    }
    buffer = [];
  };

  for (const line of lines) {
    const turnMatch = /^## Turn (\d+)/.exec(line);
    if (turnMatch) {
      flush();
      label = null;
      turn = { number: Number(turnMatch[1]), messages: [] };
      turns.push(turn);
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      label = line.slice(4).trim();
      continue;
    }
    if (!turn) {
      if (line.startsWith("# ")) title = line.slice(2).trim();
      else intro.push(line);
      continue;
    }
    buffer.push(line);
  }
  flush();
  return { title, intro: clean(intro), turns };
}
