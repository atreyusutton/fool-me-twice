import { getSession } from "../app/session.ts";
import { parseRoute, usePathname } from "../app/router.ts";
import { GameReview } from "./GameReview.tsx";
import { Home } from "./Home.tsx";
import { How } from "./How.tsx";
import { Link } from "./Link.tsx";
import { Profile } from "./Profile.tsx";
import { Shell } from "./Shell.tsx";
import "./styles.css";

export function App() {
  const route = parseRoute(usePathname());
  return (
    <Shell>
      {route.name === "home" && <Home />}
      {route.name === "profile" && <Profile key={route.username} session={getSession(route.username, route.demo)} />}
      {route.name === "game" && (
        <GameReview key={`${route.username}/${route.gameId}`} session={getSession(route.username, route.demo)} gameId={route.gameId} />
      )}
      {route.name === "how" && <How />}
      {route.name === "missing" && (
        <div className="status">
          <h2>Nothing here</h2>
          <p className="muted">This page does not exist.</p>
          <Link className="btn" href="/">
            Back to the start
          </Link>
        </div>
      )}
    </Shell>
  );
}
