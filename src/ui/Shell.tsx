import { useEffect, useState, type ReactNode } from "react";
import { Link } from "./Link.tsx";

type Theme = "auto" | "light" | "dark";
const THEME_KEY = "motif-theme";

function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch (error) {
    console.warn("Motif: could not read the saved theme.", error);
    return "auto";
  }
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1f3a4d" />
      <path d="M6 21c3-9 5-9 7-4s4 5 6-2 4-7 7 0" fill="none" stroke="#f2b84b" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      if (theme === "auto") window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      console.warn("Motif: could not save the theme choice.", error);
    }
  }, [theme]);

  const next: Theme = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
  const label = theme === "auto" ? "Theme: follows your device" : theme === "dark" ? "Theme: dark" : "Theme: light";

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Motif home">
          <Logo />
          Motif
        </Link>
        <nav aria-label="Main">
          <Link href="/demo" className="navlink optional">
            Demo
          </Link>
          <Link href="/how" className="navlink">
            How this was built
          </Link>
          <button className="iconbtn" onClick={() => setTheme(next)} aria-label={`${label}. Change theme.`} title={label}>
            <span aria-hidden="true">{theme === "auto" ? "◐" : theme === "dark" ? "☾" : "☀"}</span>
          </button>
        </nav>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">
        Motif is a take-home project and is not affiliated with Chess.com. Chess facts come from Stockfish and the game
        record. Free software under GPL-3.0.
      </footer>
    </div>
  );
}
