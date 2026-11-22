import { useState } from "react";
import { navigate } from "../../app/router.ts";
import { parseTranscript, type Transcript } from "../../core/transcript.ts";
import { Link } from "../Link.tsx";
import { Md } from "./Md.tsx";
import { PRINCIPLES, SESSIONS, type SessionSummary } from "./highlights.ts";

// The transcript files themselves, loaded only when someone asks for the whole conversation.
const FILES = import.meta.glob<string>("/transcripts/*.md", { query: "?raw", import: "default" });

type Loaded = { status: "idle" } | { status: "loading" } | { status: "ready"; transcript: Transcript } | { status: "error"; message: string };

function Avatar({ who }: { who: "user" | "agent" }) {
  return (
    <span className={`chat-avatar ${who}`} aria-hidden="true">
      {who === "user" ? "A" : "AI"}
    </span>
  );
}

export function Transcripts({ sessionId }: { sessionId: string | null }) {
  const session = SESSIONS.find((candidate) => candidate.id === sessionId) ?? null;
  // On a wide screen a conversation is always open; on a phone the list comes first.
  const shown = session ?? SESSIONS[0]!;
  return (
    <div className={`chat-app${session ? " has-open" : ""}`}>
      <aside className="chat-list" aria-label="Sessions">
        <p className="chat-list-title">Sessions</p>
        {SESSIONS.map((item) => (
          <Link key={item.id} href={`/process/transcripts/${item.id}`} className="chat-thread" aria-current={item.id === shown.id ? "page" : undefined}>
            <Avatar who="agent" />
            <span className="chat-thread-text">
              <strong>{item.title}</strong>
              <span className="muted small">
                {item.date} · {item.where}
              </span>
              <span className="faint small">{item.blurb}</span>
            </span>
          </Link>
        ))}
        <TwoRepos />
      </aside>
      <Conversation key={shown.id} session={shown} />
    </div>
  );
}

function TwoRepos() {
  return (
    <div className="chat-aside-note">
      <p className="eyebrow">Two repositories</p>
      <p className="small">
        Session 01 happened in my <strong>application folder</strong>, which already held my context. It produced the prompt and the rules.
        Sessions 02 and 03 happened <strong>here</strong>, in a clean repository that carries only what the build needs.
      </p>
      <Link className="small" href="/process">
        The story behind that →
      </Link>
    </div>
  );
}

function Conversation({ session }: { session: SessionSummary }) {
  const [full, setFull] = useState(false);
  const [loaded, setLoaded] = useState<Loaded>({ status: "idle" });

  // Loading starts from the click, not from an effect: the file is fetched once, when first asked for.
  const load = () => {
    const file = Object.entries(FILES).find(([path]) => path.endsWith(session.file))?.[1];
    if (!file) {
      setLoaded({ status: "error", message: `The file transcripts/${session.file} is not part of this build.` });
      return;
    }
    setLoaded({ status: "loading" });
    file().then(
      (markdown) => setLoaded({ status: "ready", transcript: parseTranscript(markdown) }),
      (error: unknown) => setLoaded({ status: "error", message: error instanceof Error ? error.message : String(error) }),
    );
  };
  const showFull = () => {
    setFull(true);
    if (loaded.status === "idle") load();
  };

  return (
    <section className="chat" aria-label={session.title}>
      <header className="chat-head">
        <button className="iconbtn chat-back" onClick={() => navigate("/process/transcripts")} aria-label="All sessions">
          ←
        </button>
        <Avatar who="agent" />
        <div className="chat-head-text">
          <strong>{session.title}</strong>
          <span className="muted small">
            Session {session.id} · {session.date} · {session.where}
          </span>
        </div>
        <div className="segmented" role="group" aria-label="How much to show">
          <button aria-pressed={!full} onClick={() => setFull(false)}>
            Summary
          </button>
          <button aria-pressed={full} onClick={showFull}>
            Whole conversation
          </button>
        </div>
      </header>

      <div className="chat-body">
        {!full ? (
          <>
            <p className="chat-system">
              <strong>Summarised by AI</strong> from the full transcript. My messages are real quotes, typos included. Switch to “Whole conversation”
              to check it against the record.
            </p>
            {session.messages.map((message, index) =>
              message.who === "note" ? (
                <div className="chat-note" key={index}>
                  <span className="chat-note-label">What the agent did</span>
                  <p>{message.text}</p>
                  <Tags tags={message.tags} />
                </div>
              ) : (
                <div className={`chat-row ${message.who}`} key={index}>
                  {message.who === "agent" && <Avatar who="agent" />}
                  <div className="chat-bubble">
                    <span className="sr-only">{message.who === "user" ? "Atreyu wrote:" : "The agent replied, in summary:"}</span>
                    <p>{message.text}</p>
                    <Tags tags={message.tags} />
                  </div>
                </div>
              ),
            )}
            <p className="chat-system">
              End of the summary.{" "}
              <button className="linkbtn" onClick={showFull}>
                Read the whole conversation
              </button>
            </p>
          </>
        ) : loaded.status === "ready" ? (
          <>
            <div className="chat-system">
              <strong>The whole conversation</strong>, as kept in <code>transcripts/{session.file}</code>.
              <Md text={loaded.transcript.intro} />
            </div>
            {loaded.transcript.turns.map((turn) => (
              <div key={turn.number} className="chat-turn">
                <p className="chat-divider">Turn {turn.number}</p>
                {turn.messages.map((message, index) =>
                  message.role === "work" ? (
                    <div className="chat-note" key={index}>
                      <span className="chat-note-label">What the agent did</span>
                      <Md text={message.text} />
                    </div>
                  ) : (
                    <div className={`chat-row ${message.role}`} key={index}>
                      {message.role === "agent" && <Avatar who="agent" />}
                      <div className="chat-bubble">
                        <span className="chat-label">{message.label}</span>
                        <Md text={message.text} />
                      </div>
                    </div>
                  ),
                )}
              </div>
            ))}
          </>
        ) : loaded.status === "error" ? (
          <p className="notice" role="alert">
            The transcript could not be loaded. {loaded.message}{" "}
            <button className="linkbtn" onClick={load}>
              Try again
            </button>
          </p>
        ) : (
          <p className="chat-system" role="status">
            <span className="spinner tiny" aria-hidden="true" />
            Loading the transcript
          </p>
        )}
      </div>
    </section>
  );
}

function Tags({ tags }: { tags?: SummaryMessage_Tags }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span className="chat-tags">
      {tags.map((tag) => (
        <span key={tag} className="chip" title={PRINCIPLES[tag].meaning}>
          {PRINCIPLES[tag].label}
        </span>
      ))}
    </span>
  );
}
type SummaryMessage_Tags = SessionSummary["messages"][number]["tags"];
