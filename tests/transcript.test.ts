import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTranscript } from "../src/core/transcript.ts";
import { SESSIONS } from "../src/ui/process/highlights.ts";

const SAMPLE = `# Session 09: a test

- Date: 2026-11-22

---

## Turn 1

### User

> first line
>
> second line with a typo

### Agent: what was done

1. Read a file.

#### Step 1: something

Did it.

### Agent: reply (condensed)

- Done.

---

## Turn 2

### User: answers

- Yes
`;

describe("transcript parser", () => {
  it("splits a file into turns and messages without changing the words", () => {
    const parsed = parseTranscript(SAMPLE);
    expect(parsed.title).toBe("Session 09: a test");
    expect(parsed.intro).toBe("- Date: 2026-11-22");
    expect(parsed.turns.map((turn) => turn.number)).toEqual([1, 2]);
    expect(parsed.turns[0]!.messages).toEqual([
      { role: "user", label: "User", text: "first line\n\nsecond line with a typo" },
      { role: "work", label: "Agent: what was done", text: "1. Read a file.\n\n#### Step 1: something\n\nDid it." },
      { role: "agent", label: "Agent: reply (condensed)", text: "- Done." },
    ]);
    expect(parsed.turns[1]!.messages).toEqual([{ role: "user", label: "User: answers", text: "- Yes" }]);
  });
});

describe("the session summaries shown on the Process tab", () => {
  const dir = new URL("../transcripts/", import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith(".md"));

  it("cover every transcript file, and only files that exist", () => {
    expect(SESSIONS.map((session) => session.file).sort()).toEqual(files.sort());
  });

  it("quote the user's messages word for word from the transcript", () => {
    // Collapse whitespace only: a quote may run across lines in the file.
    const squash = (text: string) => text.replace(/\s+/g, " ").trim();
    for (const session of SESSIONS) {
      const transcript = parseTranscript(readFileSync(new URL(session.file, dir), "utf8"));
      const said = squash(transcript.turns.flatMap((turn) => turn.messages.filter((message) => message.role === "user").map((message) => message.text)).join(" "));
      for (const message of session.messages) {
        if (message.who !== "user") continue;
        for (const part of message.text.split("…")) {
          const quote = squash(part);
          if (quote) expect(said, `${session.file}: "${quote}"`).toContain(quote);
        }
      }
    }
  });
});
