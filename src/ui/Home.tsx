import { useState, type FormEvent } from "react";
import { navigate, profilePath } from "../app/router.ts";
import { Link } from "./Link.tsx";

export function Home() {
  const [username, setUsername] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = username.trim();
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(clean)) {
      setProblem("Enter a Chess.com username: letters, numbers, hyphens and underscores only.");
      return;
    }
    navigate(profilePath(clean, false));
  };

  return (
    <>
      <section className="hero">
        <p className="eyebrow">A chess coach that remembers</p>
        <h1>Find the mistakes that keep coming back.</h1>
        <p className="lead">
          Motif reads your recent Chess.com games, finds the themes that repeat across them, and reviews any one game in
          that light.
        </p>
        <form className="lookup" onSubmit={submit} noValidate>
          <label className="sr-only" htmlFor="username">
            Chess.com username
          </label>
          <input
            id="username"
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
            Review my games
          </button>
          <Link className="btn secondary" href="/demo">
            See the demo
          </Link>
        </form>
        {problem && (
          <p className="notice" id="username-problem" role="alert">
            {problem}
          </p>
        )}
        <p className="muted small">
          How it stays truthful: every move, number and pattern on screen comes from a chess engine or from the game
          record. The AI coach only explains them, and its words are checked before you see them.
        </p>
      </section>

      <section className="how-strip grid-3" aria-label="How Motif works">
        <div className="card">
          <div className="step-num">1</div>
          <h3>Your games, in your browser</h3>
          <p className="muted small">
            Games come straight from Chess.com&apos;s public data. They are analysed and stored on your device, not on a
            server.
          </p>
        </div>
        <div className="card">
          <div className="step-num">2</div>
          <h3>Patterns proven by code</h3>
          <p className="muted small">
            A chess engine checks every position. Short, tested rules find repeats, such as a piece left where it could
            be taken for free.
          </p>
        </div>
        <div className="card">
          <div className="step-num">3</div>
          <h3>A coach that cannot invent a move</h3>
          <p className="muted small">
            The coach points at engine facts; the screen fills in the moves. If there is not enough evidence, it says
            so.
          </p>
        </div>
      </section>
    </>
  );
}
