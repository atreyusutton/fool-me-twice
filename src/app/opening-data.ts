import { useEffect, useState } from "react";
import { MotifError, toMotifError } from "../core/errors.ts";
import { buildBook, type Book, type BookFile, type IdeasFile } from "../core/openings.ts";

export interface OpeningData {
  book: Book;
  bookFile: BookFile;
  ideas: IdeasFile;
}

let loading: Promise<OpeningData> | null = null;

async function getJson<T>(path: string, what: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch (error) {
    throw new MotifError("network", `Could not load ${what}.`, { cause: error });
  }
  if (!response.ok) throw new MotifError("api", `Could not load ${what} (${response.status}).`);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new MotifError("api", `${what} could not be read. Run "npm run build-openings" to fetch it again.`, { cause: error });
  }
}

/** The opening book and the sourced ideas: two static files, fetched once per visit. */
export function loadOpeningData(): Promise<OpeningData> {
  loading ??= (async () => {
    const [bookFile, ideas] = await Promise.all([
      getJson<BookFile>("/openings/book.json", "the opening book"),
      getJson<IdeasFile>("/openings/ideas.json", "the opening notes"),
    ]);
    return { book: buildBook(bookFile), bookFile, ideas };
  })();
  // A failed load is not kept, so "Try again" really tries again.
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export type OpeningDataState = { status: "loading" } | { status: "ready"; data: OpeningData } | { status: "error"; error: MotifError };

export function useOpeningData(): { state: OpeningDataState; retry: () => void } {
  const [state, setState] = useState<OpeningDataState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    loadOpeningData().then(
      (data) => live && setState({ status: "ready", data }),
      (error: unknown) => live && setState({ status: "error", error: toMotifError(error) }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  return {
    state,
    retry: () => {
      setState({ status: "loading" });
      setAttempt((value) => value + 1);
    },
  };
}
