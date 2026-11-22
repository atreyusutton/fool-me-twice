import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCoach } from "../app/coach-choice.ts";
import { useLastPlayer, type PlayerRef } from "../app/last-player.ts";
import { playerPath, type Route } from "../app/router.ts";
import { setSound, useVoice } from "../app/voice.ts";
import { PERSONAS } from "../core/coach/personas.ts";
import { CoachPicker } from "./coaches/CoachPicker.tsx";
import { Figure } from "./coaches/Figure.tsx";
import { Link } from "./Link.tsx";

type Theme = "auto" | "light" | "dark";
const THEME_KEY = "fmt-theme";

function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "auto";
  } catch (error) {
    console.warn("Fool Me Twice: could not read the saved theme.", error);
    return "auto";
  }
}

/** The mark: the same square, twice, the second one highlighted. */
export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="9" width="17" height="17" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <rect x="13" y="4" width="17" height="17" rx="4.5" fill="#ffd43b" stroke="#17171b" strokeWidth="2.6" />
      <path d="M18 12.5 l3.2 3.2 l5 -6" fill="none" stroke="#17171b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  you: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6" />,
  review: <path d="M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5" />,
  practice: <path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.7 6.700 19.600l1.100-6L3.400 9.400l6-.8L12 3Z" />,
  openings: <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4V4Zm0 12a4 4 0 0 1 4-4h10" />,
  process: <path d="M4 6h10M4 12h16M4 18h7M18 4v4M15 16v4" />,
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4v-9Z" />,
};
function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

interface Tab {
  key: string;
  label: string;
  href: string;
  current: boolean;
}

/**
 * Home and Process are on every page. Between them: one tab to a player's pages when no player is
 * on screen (the last player loaded on this device, or the demo), and that player's four coaching
 * tabs once inside.
 */
function tabsFor(route: Route, last: PlayerRef): Tab[] {
  const home: Tab = { key: "home", label: "Home", href: "/", current: route.name === "home" };
  const processTab: Tab = { key: "process", label: "Process", href: "/process", current: route.name === "process" };
  if (route.name !== "player") {
    const label = last.demo ? "Demo" : last.username;
    return [home, { key: "you", label, href: playerPath(last.username, last.demo), current: false }, processTab];
  }
  const to = (sub = "") => playerPath(route.username, route.demo, sub);
  const view = route.view.name;
  return [
    home,
    { key: "you", label: "You", href: to(), current: view === "you" },
    { key: "review", label: "Review", href: to("games"), current: view === "games" || view === "game" },
    { key: "practice", label: "Practice", href: to("practice"), current: view === "practice" },
    { key: "openings", label: "Openings", href: to("openings"), current: view === "openings" || view === "opening" || view === "drill" },
    processTab,
  ];
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const coach = useCoach();
  const voice = useVoice();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      if (theme === "auto") window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      console.warn("Fool Me Twice: could not save the theme choice.", error);
    }
  }, [theme]);

  const next: Theme = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
  const label = theme === "auto" ? "Theme: follows your device" : theme === "dark" ? "Theme: dark" : "Theme: light";
  const last = useLastPlayer();
  const tabs = tabsFor(route, last);
  // A phone's bottom bar holds five tabs at most; there the logo in the top bar is Home.
  const phoneTabs = tabs.length > 5 ? tabs.filter((tab) => tab.key !== "home") : tabs;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Fool Me Twice, home">
          <Logo />
          Fool Me Twice
        </Link>
        <nav className="nav" aria-label="Main">
          {tabs.map((tab) => (
            <Link key={tab.label} href={tab.href} aria-current={tab.current ? "page" : undefined}>
              {tab.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-end">
          <button className="coach-chip" onClick={() => dialog.current?.showModal()} aria-label={`Your coach is ${PERSONAS[coach].name}. Change coach.`}>
            <Figure who={coach} size={32} decorative />
            <span>{PERSONAS[coach].name}</span>
          </button>
          {voice.available && (
            <button
              className="iconbtn"
              onClick={() => setSound(!voice.sound)}
              aria-pressed={voice.sound}
              aria-label={voice.sound ? "Coach voices are on. Turn them off." : "Coach voices are off. Turn them on."}
              title={voice.sound ? "Coach voices: on" : "Coach voices: off"}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9.500h3l5-4v13l-5-4H4z" />
                {voice.sound ? <path d="M15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11" /> : <path d="M16 9.500l5 5M21 9.500l-5 5" />}
              </svg>
            </button>
          )}
          <button className="iconbtn" onClick={() => setTheme(next)} aria-label={`${label}. Change theme.`} title={label}>
            <span aria-hidden="true">{theme === "auto" ? "◐" : theme === "dark" ? "☾" : "☀"}</span>
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">
        Fool Me Twice is a take-home project and is not affiliated with Chess.com. Chess facts come from Stockfish and the game record. The
        coaches are characters from out-of-copyright books. Free software under GPL-3.0.
      </footer>
      <nav className="tabbar" aria-label="Main">
        {phoneTabs.map((tab) => (
          <Link key={tab.label} href={tab.href} aria-current={tab.current ? "page" : undefined}>
            <Icon name={tab.key} />
            {tab.label}
          </Link>
        ))}
      </nav>
      <dialog ref={dialog} className="sheet" aria-labelledby="coach-dialog-title">
        <div className="stack">
          <div className="row between">
            <h2 id="coach-dialog-title">Choose your coach</h2>
            <button className="iconbtn" onClick={() => dialog.current?.close()} aria-label="Close">
              ✕
            </button>
          </div>
          <p className="muted">Same facts, same checks, different voice. You can change this any time.</p>
          <CoachPicker onPick={() => dialog.current?.close()} />
        </div>
      </dialog>
    </div>
  );
}
