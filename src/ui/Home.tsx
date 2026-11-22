import { useState, type FormEvent } from "react";
import { useCoach } from "../app/coach-choice.ts";
import { navigate, playerPath } from "../app/router.ts";
import { CoachPicker } from "./coaches/CoachPicker.tsx";
import { Say } from "./coaches/Say.tsx";
import { Link } from "./Link.tsx";

const WELCOME = {
  sherlock: "Give me your games. The same mistake, made often enough, is as good as a signed confession.",
  pooh: "Hallo. Show me your games, and we shall look for the mistakes that keep coming back, slowly, and then have a little something.",
  hook: "Your games, my hearty. Let us see what bad form you have been repeating, and put an end to it.",
  dracula: "Welcome. Enter freely. Show me your games; I have all night, and your mistakes, I think, have been here before.",
} as const;

export function Home() {
  const [username, setUsername] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const coach = useCoach();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = username.trim();
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(clean)) {
      setProblem("Enter a Chess.com username: letters, numbers, hyphens and underscores only.");
      return;
    }
    navigate(playerPath(clean, false));
  };

  return (
    <>
      <section className="hero">
        <p className="eyebrow">A chess coach that remembers</p>
        <h1>
          Fool me once, bad luck. Fool me <span className="hl">twice</span>? Let&apos;s look at that.
        </h1>
        <p className="lead">
          Fool Me Twice reads your recent Chess.com games, finds the mistakes that keep coming back, reviews them with a coach, and turns
          them into practice on your own positions.
        </p>
        <form className="lookup" onSubmit={submit} noValidate>
          <label className="sr-only" htmlFor="username">
            Chess.com username
          </label>
          <input
            id="username"
            className="field"
            name="username"
            placeholder="Your Chess.com username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setProblem(null);
            }}
            aria-invalid={problem !== null}
            aria-describedby={problem ? "username-problem" : undefined}
          />
          <button className="btn" type="submit">
            Read my games
          </button>
        </form>
        {problem && (
          <p className="notice" id="username-problem" role="alert">
            {problem}
          </p>
        )}
        <p className="or">
          No account handy?
          <Link className="btn hot small" href="/demo">
            See the demo
          </Link>
          <span>25 real games, nothing to set up.</span>
        </p>
      </section>

      <section className="section" aria-labelledby="coach-title">
        <div className="section-head">
          <h2 id="coach-title">Pick your coach</h2>
          <p className="muted small">Same facts, same checks, different voice.</p>
        </div>
        <div className="stack loose">
          <CoachPicker />
          <Say who={coach} mood="talking">
            {WELCOME[coach]}
          </Say>
        </div>
      </section>

      <section className="section" aria-labelledby="loop-title">
        <div className="section-head">
          <h2 id="loop-title">How it goes</h2>
        </div>
        <div className="grid-4 steps">
          <div className="step">
            <h3>Your read</h3>
            <p className="muted small">A chess engine checks every position of your recent games. Code finds what repeats.</p>
          </div>
          <div className="step">
            <h3>Review with your coach</h3>
            <p className="muted small">Go through a game. Your coach explains each key moment and how it fits your pattern.</p>
          </div>
          <div className="step">
            <h3>Take it again</h3>
            <p className="muted small">Puzzles from the exact positions you got wrong. The engine checks your answer.</p>
          </div>
          <div className="step">
            <h3>Drill your openings</h3>
            <p className="muted small">Play your own openings against Blundy McBlunderpants until the book moves stick.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card stack">
          <h2>A coach that cannot make up chess</h2>
          <p className="muted" style={{ maxWidth: "62ch" }}>
            Every move, number and puzzle answer on screen comes from a chess engine or from your game record. The AI coach only puts
            them into words, and code checks every sentence before you see it. How that works, and how this was built with AI, is on
            the Process page.
          </p>
          <div>
            <Link className="btn ghost" href="/process">
              See the process
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
