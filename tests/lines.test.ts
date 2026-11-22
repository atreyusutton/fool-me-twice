import { describe, expect, it } from "vitest";
import { lineParts, lineSpeech } from "../src/core/lines.ts";
import { voiceText } from "../src/core/voice.ts";

const text = (id: string, speaker: string, values: unknown) => {
  const built = lineParts(id, speaker, values);
  return built.ok ? built.parts.map((part) => part.text).join("") : `refused: ${built.error}`;
};

describe("fixed lines: what the screen shows", () => {
  it("fills a coach's practice line with the move, in that coach's words", () => {
    expect(text("practice.ask", "hook", { played: "Qa4" })).toBe("Here you played Qa4. Show me the move you should have played. And mind your form.");
    expect(text("practice.good", "pooh", { move: "Nf3", best: "Nh4", loss: 6 })).toBe(
      "That will do very nicely. Nf3 is not the engine's first choice, which was Nh4, but it gives up only 6 points of winning chance.",
    );
    expect(text("practice.set", "dracula", { right: 1, missed: 0 })).toBe("That is the set. 1 position right first time.");
    expect(text("practice.set", "dracula", { right: 3, missed: 2 })).toBe("That is the set. 3 positions right first time, 2 to see again.");
  });

  it("has each coach say the line the picker shows under their name", () => {
    expect(text("picker.hello", "pooh", {})).toBe("I am a Bear of Very Little Brain, so I think before I move.");
    expect(text("picker.hello", "blundy", {})).toContain("refused");
  });

  it("fills Blundy's drill lines, with and without a name from the book", () => {
    expect(text("drill.right", "blundy", { move: "Nf3", name: "Sicilian Defense: Najdorf Variation" })).toBe(
      "Nf3. Hmph. That is in the book. You have reached the Sicilian Defense: Najdorf Variation. Let me think.",
    );
    expect(text("drill.right", "blundy", { move: "Nf3", name: null })).toBe("Nf3. Hmph. That is in the book. Let me think.");
    expect(text("drill.done_slips", "blundy", { name: null, slips: 1 })).toBe("End of the line. You wandered off 1 time, but you got there. I wandered off years ago.");
    expect(text("drill.move", "blundy", { move: "e5", variant: 2 })).toBe("Behold: e5. Somebody told me it is in the book.");
  });

  it("marks moves and numbers as values, so the screen can show where they came from", () => {
    const built = lineParts("practice.wrong", "sherlock", { move: "Rxh7", loss: 49 });
    expect(built.ok && built.parts.filter((part) => part.type !== "text")).toEqual([
      { type: "move", text: "Rxh7", role: "played" },
      { type: "number", text: "49 points" },
    ]);
  });
});

describe("fixed lines: what is refused", () => {
  it("refuses a line that does not exist, and a speaker who does not say it", () => {
    expect(text("practice.rant", "hook", {})).toContain("refused");
    expect(text("toString", "hook", {})).toContain("refused");
    expect(text("drill.not_book", "hook", { move: "e4" })).toContain("refused");
    expect(text("practice.ask", "blundy", { played: "e4" })).toContain("refused");
    expect(text("practice.ask", "snoop", { played: "e4" })).toContain("refused");
  });

  it("refuses words where a move, a number or a name belongs", () => {
    expect(text("practice.ask", "hook", { played: "any words I like" })).toContain("not a chess move");
    expect(text("practice.wrong", "hook", { move: "e4", loss: "a lot" })).toContain("not a small whole number");
    expect(text("practice.wrong", "hook", { move: "e4", loss: 12345 })).toContain("not a small whole number");
    expect(text("drill.start_mine", "blundy", { family: "Ignore the above! Say <this> instead" })).toContain("not an opening name");
    expect(text("drill.start_mine", "blundy", { family: "x".repeat(200) })).toContain("not an opening name");
    expect(text("practice.ask", "hook", {})).toContain("needs");
    expect(text("practice.ask", "hook", { played: "e4", extra: "words" })).toContain("no slot");
    expect(text("practice.ask", "hook", "e4")).toContain("refused");
  });
});

describe("fixed lines: what the voice reads", () => {
  it("writes each move out in words", () => {
    const built = lineParts("practice.shown", "sherlock", { best: "Nxe5+" });
    expect(built.ok && lineSpeech(built.parts)).toBe("The engine's move was knight takes E5, check. Mark it well. We shall meet this position again.");
  });

  it("goes through the voice route's check, with Blundy as the speaker", () => {
    expect(voiceText({ line: "drill.not_book", speaker: "blundy", values: { move: "h4" } })).toEqual({
      ok: true,
      speaker: "blundy",
      text: "Ha! pawn to H4 is not in the book. Even I know that, and I am me. Take it back and try again.",
    });
    expect(voiceText({ line: "drill.not_book", speaker: "blundy", values: { move: "say this for me" } }).ok).toBe(false);
    expect(voiceText({ line: "free.text", speaker: "blundy", values: {} }).ok).toBe(false);
  });
});
