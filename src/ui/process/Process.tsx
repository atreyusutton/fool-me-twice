import type { ProcessPage } from "../../app/router.ts";
import { Link } from "../Link.tsx";
import { Story } from "./Story.tsx";
import { Transcripts } from "./Transcripts.tsx";
import { Truth } from "./Truth.tsx";

const PAGES: { page: ProcessPage; label: string; href: string }[] = [
  { page: "story", label: "The story", href: "/process" },
  { page: "transcripts", label: "Transcripts", href: "/process/transcripts" },
  { page: "truth", label: "How it stays truthful", href: "/process/truth" },
];

/** The reviewer's tab: how this was thought about and built, and how the coach is kept honest. */
export function Process({ page, session }: { page: ProcessPage; session: string | null }) {
  return (
    <div className="stack loose">
      <nav className="row" aria-label="Process pages">
        {PAGES.map((item) => (
          <Link key={item.page} className="pill" href={item.href} aria-current={item.page === page ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      {page === "story" && <Story />}
      {page === "transcripts" && <Transcripts sessionId={session} />}
      {page === "truth" && <Truth />}
    </div>
  );
}
