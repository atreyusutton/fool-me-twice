import type { PatternTag } from "../types.ts";
import type { CoachFact, CoachTheme, GameReview, GameReviewRequest, ProfileSummary, ProfileSummaryRequest } from "./types.ts";

/**
 * Text built by code from the fact rows. It is what the player sees when there is no language model,
 * and what replaces a model reply that fails the check twice. It uses the same tokens as the model,
 * so it goes through the same check and the same renderer.
 */

function patternSentence(fact: CoachFact, tag: PatternTag): string {
  switch (tag) {
    case "hung_piece":
      return fact.lostPiece ? `It left your ${fact.lostPiece} where it could be taken.` : "It left a piece where it could be taken.";
    case "missed_capture":
      return "The engine's move was a capture that wins material.";
    case "missed_mate":
      return "A forced checkmate was available here.";
    case "allowed_mate":
      return "It gave your opponent a forced checkmate.";
    case "time_trouble":
      return "Your clock was nearly out.";
    case "rushed":
      return "It was played in a few seconds with plenty of time left.";
  }
}

function themeTie(theme: CoachTheme): string {
  return `This is part of a theme, ${theme.label.toLowerCase()}: [[count:${theme.id}]] times across [[games:${theme.id}]] of your last [[total:${theme.id}]] games.`;
}

function momentText(fact: CoachFact, theme: CoachTheme | null): string {
  const sentences = [
    `On move [[move:${fact.id}]] you played [[played:${fact.id}]]; the engine preferred [[best:${fact.id}]].`,
    fact.loss > 0 ? `That gave up [[loss:${fact.id}]] of winning chance.` : "",
    ...fact.patterns.map((tag) => patternSentence(fact, tag)),
    theme ? themeTie(theme) : "",
  ];
  return sentences.filter(Boolean).join(" ");
}

/** The theme a moment is tied to: the first weakness it is evidence for, in the profile's own ranking. */
function themeFor(fact: CoachFact, themes: CoachTheme[]): CoachTheme | null {
  return themes.find((theme) => theme.kind === "weakness" && fact.themes.includes(theme.id)) ?? null;
}

export function fallbackGameReview(request: GameReviewRequest): GameReview {
  const themes = request.profile.themes;
  const moments = request.facts.map((fact) => {
    const theme = themeFor(fact, themes);
    return { fact: fact.id, theme: theme?.id ?? null, text: momentText(fact, theme) };
  });
  if (moments.length === 0) {
    return {
      headline: "No clear mistakes in this game",
      moments: [],
      takeaway: { theme: null, text: "The engine found no move of yours that clearly gave away winning chance. Smaller slips are left out on purpose." },
    };
  }
  // The takeaway points at the theme this game touched most.
  const tally = new Map<string, number>();
  for (const moment of moments) if (moment.theme) tally.set(moment.theme, (tally.get(moment.theme) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const topTheme = top ? (themes.find((theme) => theme.id === top[0]) ?? null) : null;
  return {
    headline: moments.length === 1 ? "One key moment decided the shape of this game" : "The key moments of this game",
    moments,
    takeaway: topTheme
      ? { theme: topTheme.id, text: `The pattern to watch from this game is ${topTheme.label.toLowerCase()}. It has come up [[count:${topTheme.id}]] times in your recent games.` }
      : { theme: null, text: "None of these moments belongs to a theme that has repeated often enough to name yet." },
  };
}

function themeSummaryText(theme: CoachTheme): string {
  const where = theme.phase ? ` Most of them came in the ${theme.phase}.` : "";
  if (theme.kind === "weakness") {
    return `This happened [[count:${theme.id}]] times, in [[games:${theme.id}]] of your last [[total:${theme.id}]] games.${where}`;
  }
  if (theme.kind === "strength") {
    return `You did this [[count:${theme.id}]] times, across [[games:${theme.id}]] games.${where}`;
  }
  return "Your results differ between the groups of games compared here. The numbers are shown beside this note.";
}

export function fallbackProfileSummary(request: ProfileSummaryRequest): ProfileSummary {
  const themes = request.profile.themes;
  const featured = themes.filter((theme) => theme.featured);
  const focus = featured[0] ?? themes[0];
  if (!focus) {
    // The schema needs at least one theme; callers do not ask for a summary without one.
    throw new Error("A profile summary needs at least one theme.");
  }
  return {
    headline: featured.length > 0 ? "The patterns that keep coming back" : "What the record shows so far",
    themes: themes.map((theme) => ({ theme: theme.id, text: themeSummaryText(theme) })),
    focus: {
      theme: focus.id,
      text:
        focus.kind === "weakness"
          ? `Start with ${focus.label.toLowerCase()}: it has cost the most winning chance in your recent games.`
          : `The clearest finding so far is ${focus.label.toLowerCase()}.`,
    },
  };
}
