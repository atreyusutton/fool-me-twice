import { useId } from "react";
import type { CoachId } from "../../core/coach/personas.ts";

/**
 * The coach figures. Each is drawn here from its book, in one flat style, with a face that changes with
 * the mood. The mood is always chosen by code from the facts (see moodFor), never by the language model.
 */
export type Mood = "idle" | "talking" | "wince" | "pleased" | "thinking";
export type FigureId = CoachId | "blundy";

export const COACH_COLOR: Record<FigureId, string> = {
  sherlock: "#2f6f73",
  pooh: "#c98a1e",
  hook: "#b23a48",
  dracula: "#6b4aa0",
  blundy: "#d9a400",
};

interface FaceProps {
  mood: Mood;
  /** Centre of the left and right eye. */
  eyes: [number, number, number, number];
  mouth: [number, number];
  ink?: string;
  eyeSize?: number;
  mouthWidth?: number;
  brows?: boolean;
  teeth?: boolean;
}

/** Eyes, brows and mouth, shared by every figure so they read as one family. */
function Face({ mood, eyes, mouth, ink = "#1c1b1f", eyeSize = 2.6, mouthWidth = 12, brows = true, teeth = false }: FaceProps) {
  const [lx, ly, rx, ry] = eyes;
  const [mx, my] = mouth;
  const half = mouthWidth / 2;
  const look = mood === "thinking" ? { dx: -1.2, dy: -1.4 } : { dx: 0, dy: 0 };
  const browTilt = mood === "wince" ? 16 : mood === "thinking" ? -10 : mood === "pleased" ? -4 : 0;
  const browLift = mood === "pleased" || mood === "thinking" ? -1.5 : 0;
  return (
    <g className="face" stroke={ink} strokeLinecap="round" strokeLinejoin="round" fill="none">
      {mood === "wince" ? (
        <g strokeWidth={2}>
          <path d={`M${lx - 3} ${ly - 2.4} L${lx + 2.4} ${ly} L${lx - 3} ${ly + 2.4}`} />
          <path d={`M${rx + 3} ${ry - 2.4} L${rx - 2.4} ${ry} L${rx + 3} ${ry + 2.4}`} />
        </g>
      ) : mood === "pleased" ? (
        <g strokeWidth={2}>
          <path d={`M${lx - 3} ${ly + 1} Q${lx} ${ly - 3} ${lx + 3} ${ly + 1}`} />
          <path d={`M${rx - 3} ${ry + 1} Q${rx} ${ry - 3} ${rx + 3} ${ry + 1}`} />
        </g>
      ) : (
        <g className="eyes" fill={ink} stroke="none">
          <ellipse className="eye" cx={lx + look.dx} cy={ly + look.dy} rx={eyeSize} ry={eyeSize * 1.15} />
          <ellipse className="eye" cx={rx + look.dx} cy={ry + look.dy} rx={eyeSize} ry={eyeSize * 1.15} />
        </g>
      )}
      {brows && (
        <g strokeWidth={2}>
          <path d={`M${lx - 4} ${ly - 6 + browLift} L${lx + 3.5} ${ly - 6 + browLift}`} transform={`rotate(${browTilt} ${lx} ${ly - 6})`} />
          <path d={`M${rx - 3.5} ${ry - 6 + browLift} L${rx + 4} ${ry - 6 + browLift}`} transform={`rotate(${-browTilt} ${rx} ${ry - 6})`} />
        </g>
      )}
      {mood === "talking" ? (
        <ellipse className="mouth-talk" cx={mx} cy={my} rx={half * 0.55} ry={3} fill={ink} stroke="none" />
      ) : mood === "wince" ? (
        <path strokeWidth={2} d={`M${mx - half * 0.8} ${my + 1.2} l${half * 0.4} -2.6 l${half * 0.4} 2.6 l${half * 0.4} -2.6 l${half * 0.4} 2.6`} />
      ) : mood === "pleased" ? (
        <path strokeWidth={2.2} d={`M${mx - half} ${my - 1} Q${mx} ${my + 6} ${mx + half} ${my - 1}`} fill={teeth ? "#fff" : "none"} />
      ) : mood === "thinking" ? (
        <path strokeWidth={2.2} d={`M${mx - half * 0.5} ${my + 0.5} L${mx + half * 0.6} ${my - 0.8}`} />
      ) : (
        <path strokeWidth={2.2} d={`M${mx - half * 0.7} ${my} Q${mx} ${my + 2.4} ${mx + half * 0.7} ${my}`} />
      )}
      {teeth && (mood === "pleased" || mood === "talking") && (
        <g fill="#fff" stroke={ink} strokeWidth={0.8}>
          <path d={`M${mx - 3.4} ${my + 0.6} l1.3 3.4 l1.3 -3.4 z`} />
          <path d={`M${mx + 0.8} ${my + 0.6} l1.3 3.4 l1.3 -3.4 z`} />
        </g>
      )}
    </g>
  );
}

function Sherlock({ mood }: { mood: Mood }) {
  return (
    <>
      {/* Inverness cape and collar */}
      <path d="M14 120 Q16 92 44 86 L76 86 Q104 92 106 120 Z" fill="#5d5445" />
      <path d="M44 86 L60 104 L76 86 L70 82 H50 Z" fill="#f4efe6" />
      <path d="M40 87 L60 110 L56 120 H30 Q30 98 40 87 Z M80 87 L60 110 L64 120 H90 Q90 98 80 87 Z" fill="#6f6553" />
      {/* Head */}
      <rect x="53" y="74" width="14" height="14" rx="5" fill="#e9c4a2" />
      <path d="M39 50 Q39 80 60 82 Q81 80 81 50 Q81 34 60 34 Q39 34 39 50 Z" fill="#f1d0b0" />
      <path d="M60 52 L56.5 64 H62" fill="none" stroke="#c99a76" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Deerstalker: crown, check, peaks front and back, flaps tied on top */}
      <path d="M37 46 Q36 18 60 18 Q84 18 83 46 Q60 38 37 46 Z" fill="#8a7658" />
      <path d="M48 22 V41 M60 18 V39 M72 22 V41 M39 33 H81" stroke="#6b5a41" strokeWidth="1.6" fill="none" opacity="0.7" />
      <path d="M33 47 Q60 34 87 47 Q60 44 33 47 Z" fill="#6b5a41" />
      <path d="M33 47 Q60 37 87 47 L85 50 Q60 42 35 50 Z" fill="#75644a" />
      <path d="M54 18 q6 -7 12 0 q-6 4 -12 0 z" fill="#6b5a41" />
      <Face mood={mood} eyes={[50, 54, 70, 54]} mouth={[60, 71]} mouthWidth={11} />
      {/* Pipe */}
      <g className="prop">
        <path d="M65 72 Q76 76 82 70" fill="none" stroke="#3b2a1e" strokeWidth="2.6" strokeLinecap="round" />
        <rect x="79" y="61" width="8" height="10" rx="2.5" fill="#5a3a25" />
      </g>
      {/* Magnifying glass, raised when thinking */}
      <g className="signature glass">
        <circle cx="24" cy="92" r="11" fill="rgba(190,225,235,0.55)" stroke="#2b2b2f" strokeWidth="3" />
        <path d="M32 100 L42 112" stroke="#2b2b2f" strokeWidth="4.5" strokeLinecap="round" />
      </g>
    </>
  );
}

function Pooh({ mood }: { mood: Mood }) {
  const fur = "#c9954a";
  const light = "#e6c389";
  return (
    <>
      {/* A stitched teddy bear, as in the 1926 book: no clothes */}
      <ellipse cx="60" cy="116" rx="38" ry="30" fill={fur} />
      <ellipse cx="60" cy="118" rx="22" ry="20" fill={light} />
      <path d="M60 100 V120" stroke="#9a6d2c" strokeWidth="1.6" strokeDasharray="2.5 3" strokeLinecap="round" />
      <circle cx="36" cy="30" r="11" fill={fur} />
      <circle cx="84" cy="30" r="11" fill={fur} />
      <circle cx="36" cy="31" r="5.5" fill="#a87632" />
      <circle cx="84" cy="31" r="5.5" fill="#a87632" />
      <ellipse cx="60" cy="56" rx="31" ry="29" fill={fur} />
      <ellipse cx="60" cy="67" rx="15" ry="11.5" fill={light} />
      <ellipse cx="60" cy="61" rx="4.6" ry="3.4" fill="#2a211a" />
      <Face mood={mood} eyes={[49, 50, 71, 50]} mouth={[60, 71]} eyeSize={2.2} mouthWidth={10} brows={mood !== "idle" && mood !== "talking"} ink="#2a211a" />
      {/* A paw to the head when thinking */}
      <g className="signature paw">
        <ellipse cx="90" cy="52" rx="9" ry="10" fill={fur} />
        <ellipse cx="88" cy="50" rx="4.5" ry="5" fill={light} />
      </g>
    </>
  );
}

function Hook({ mood }: { mood: Mood }) {
  const curl = "#1c1920";
  return (
    <>
      {/* Coat in the style of Charles II, lace at the throat */}
      <path d="M14 120 Q16 92 44 87 L76 87 Q104 92 106 120 Z" fill="#7b2d3a" />
      <path d="M44 87 L60 120 L76 87 Z" fill="#5c1f2a" />
      <path d="M50 86 Q60 96 70 86 L72 98 Q66 94 60 102 Q54 94 48 98 Z" fill="#f7f3ea" />
      <circle cx="41" cy="104" r="2.2" fill="#e2b84f" />
      <circle cx="79" cy="104" r="2.2" fill="#e2b84f" />
      <circle cx="38" cy="114" r="2.2" fill="#e2b84f" />
      <circle cx="82" cy="114" r="2.2" fill="#e2b84f" />
      {/* Long black curls, "like black candles" */}
      <g fill={curl}>
        <path d="M36 44 Q30 60 34 74 Q30 84 36 94 Q44 90 42 78 Q46 66 42 46 Z" />
        <path d="M84 44 Q90 60 86 74 Q90 84 84 94 Q76 90 78 78 Q74 66 78 46 Z" />
      </g>
      <rect x="53" y="74" width="14" height="14" rx="5" fill="#dcb592" />
      <path d="M40 52 Q40 80 60 83 Q80 80 80 52 Q80 36 60 36 Q40 36 40 52 Z" fill="#ecc9a6" />
      {/* Hat */}
      <path d="M40 34 Q42 14 60 14 Q78 14 80 34 Z" fill="#26222b" />
      <ellipse cx="60" cy="36" rx="38" ry="7.5" fill="#1c1920" />
      <path d="M41 33 Q60 38 79 33" stroke="#e2b84f" strokeWidth="2.4" fill="none" />
      <path d="M77 24 Q92 8 99 18 Q90 18 84 30 Z" fill="#e2b84f" />
      {/* Moustache and pointed beard */}
      <path d="M60 66 Q54 62 47 66 Q54 69 60 67 Q66 69 73 66 Q66 62 60 66 Z" fill={curl} />
      <path d="M56 78 L60 88 L64 78 Z" fill={curl} />
      <Face mood={mood} eyes={[51, 54, 69, 54]} mouth={[60, 73]} mouthWidth={9} />
      {/* The hook */}
      <g className="signature hookarm">
        <rect x="88" y="96" width="14" height="10" rx="3" fill="#f7f3ea" />
        <path d="M95 96 V84 a8 8 0 1 0 -8 -8" fill="none" stroke="#b9c0c7" strokeWidth="4.2" strokeLinecap="round" />
      </g>
    </>
  );
}

function Dracula({ mood }: { mood: Mood }) {
  return (
    <>
      {/* "Clad in black from head to foot, without a single speck of colour" */}
      <path d="M12 120 Q14 92 44 87 L76 87 Q106 92 108 120 Z" fill="#17161a" />
      <g className="signature collar" fill="#232128">
        <path d="M44 88 L30 62 Q44 72 52 86 Z" />
        <path d="M76 88 L90 62 Q76 72 68 86 Z" />
      </g>
      <path d="M50 87 L60 100 L70 87 Z" fill="#f4f1ea" />
      {/* Pointed ears */}
      <path d="M40 50 L32 40 L40 62 Z" fill="#cdc8bb" />
      <path d="M80 50 L88 40 L80 62 Z" fill="#cdc8bb" />
      <rect x="53" y="76" width="14" height="13" rx="5" fill="#d9d5cb" />
      <path d="M40 50 Q40 82 60 86 Q80 82 80 50 Q80 30 60 30 Q40 30 40 50 Z" fill="#ebe8e0" />
      {/* White hair, thin at the temples */}
      <path d="M40 46 Q40 24 60 24 Q80 24 80 46 Q74 34 60 38 Q46 34 40 46 Z" fill="#f7f6f2" />
      <path d="M60 38 L56 31 L60 26 L64 31 Z" fill="#f7f6f2" />
      {/* Aquiline nose, heavy brows that almost meet, long white moustache */}
      <path d="M60 52 Q57 62 56 66 Q60 68 64 66" fill="none" stroke="#b9b3a6" strokeWidth="2" strokeLinecap="round" />
      <path d="M45 47 Q52 44 58 49 M62 49 Q68 44 75 47" stroke="#f7f6f2" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <Face mood={mood} eyes={[51, 55, 69, 55]} mouth={[60, 76]} mouthWidth={10} brows={false} teeth ink="#2a1c22" />
      <path d="M60 69 Q52 66 44 76 Q52 73 60 72 Q68 73 76 76 Q68 66 60 69 Z" fill="#f7f6f2" stroke="#d2cdc2" strokeWidth="0.8" />
    </>
  );
}

function Blundy({ mood }: { mood: Mood }) {
  return (
    <>
      {/* A pawn in enormous patched trousers */}
      <path d="M26 120 Q24 92 40 88 H80 Q96 92 94 120 Z" fill="#d9a400" />
      <path d="M60 96 V120" stroke="#9c7600" strokeWidth="2" />
      <rect x="66" y="100" width="14" height="12" rx="2" fill="#2a6fdb" transform="rotate(8 73 106)" />
      <path d="M68 103 l10 6 M78 103 l-10 6" stroke="#f7f3ea" strokeWidth="1.4" transform="rotate(8 73 106)" />
      <path d="M44 88 L50 70 M76 88 L70 70" stroke="#b23a48" strokeWidth="4" strokeLinecap="round" />
      <circle cx="44" cy="89" r="3" fill="#f7f3ea" stroke="#2b2b2f" strokeWidth="1" />
      <circle cx="76" cy="89" r="3" fill="#f7f3ea" stroke="#2b2b2f" strokeWidth="1" />
      <path d="M46 84 Q60 92 74 84 L70 72 H50 Z" fill="#efe6d2" />
      <ellipse cx="60" cy="72" rx="16" ry="4.5" fill="#e0d5bc" />
      <circle cx="60" cy="46" r="25" fill="#f4ecda" />
      <circle cx="49" cy="43" r="7" fill="#fff" stroke="#2b2b2f" strokeWidth="1.6" />
      <circle cx="71" cy="42" r="5" fill="#fff" stroke="#2b2b2f" strokeWidth="1.6" />
      <Face mood={mood} eyes={[51, 44, 70, 43]} mouth={[60, 58]} eyeSize={2.4} mouthWidth={15} brows={mood === "wince" || mood === "thinking"} />
    </>
  );
}

const DRAWINGS: Record<FigureId, (props: { mood: Mood }) => React.ReactNode> = {
  sherlock: Sherlock,
  pooh: Pooh,
  hook: Hook,
  dracula: Dracula,
  blundy: Blundy,
};

const DESCRIPTION: Record<FigureId, string> = {
  sherlock: "Sherlock Holmes in a deerstalker cap, with a pipe",
  pooh: "Winnie-the-Pooh, a stitched teddy bear",
  hook: "Captain Hook, with long black curls and a hook",
  dracula: "Count Dracula, an old man in black with a long white moustache",
  blundy: "Blundy McBlunderpants, a pawn in patched trousers",
};

export function Figure({ who, mood = "idle", size = 96, decorative = false }: { who: FigureId; mood?: Mood; size?: number; decorative?: boolean }) {
  const Drawing = DRAWINGS[who];
  const clipId = useId();
  return (
    <svg
      className={`figure figure-${who} mood-${mood}`}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : DESCRIPTION[who]}
      style={{ "--coach": COACH_COLOR[who] } as React.CSSProperties}
    >
      <defs>
        {/* The figure may rise above the disc (hats, ears) but never spills out below it. */}
        <clipPath id={clipId}>
          <path d="M-10 -20 H130 V62 H116 A56 56 0 0 1 4 62 H-10 Z" />
        </clipPath>
      </defs>
      <circle cx="60" cy="62" r="56" className="figure-disc" />
      <g className="figure-body" clipPath={`url(#${clipId})`}>
        <Drawing mood={mood} />
      </g>
    </svg>
  );
}

/**
 * The figure's expression for a moment, decided from the facts alone:
 * a costly mistake makes any coach wince; a strength pleases them.
 */
export function moodFor(input: { loss?: number; strength?: boolean; speaking?: boolean }): Mood {
  if (input.strength) return "pleased";
  if (input.loss !== undefined && input.loss >= 40) return "wince";
  if (input.loss !== undefined && input.loss >= 25) return "thinking";
  return input.speaking ? "talking" : "idle";
}
