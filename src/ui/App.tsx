import { parseRoute, usePathname, type Route } from "../app/router.ts";
import { getSession } from "../app/session.ts";
import { Games } from "./Games.tsx";
import { Home } from "./Home.tsx";
import { Link } from "./Link.tsx";
import { Player } from "./Player.tsx";
import { Review } from "./Review.tsx";
import { Shell } from "./Shell.tsx";
import { You } from "./You.tsx";
import "./styles.css";

function Missing() {
  return (
    <div className="status">
      <h2>Nothing here</h2>
      <p className="muted">This page does not exist.</p>
      <Link className="btn" href="/">
        Back to the start
      </Link>
    </div>
  );
}

function PlayerScreens({ route }: { route: Extract<Route, { name: "player" }> }) {
  const session = getSession(route.username, route.demo);
  const view = route.view;
  return (
    <Player key={route.username} session={session}>
      {(state) => {
        if (view.name === "you") return <You session={session} state={state} />;
        if (view.name === "games") return <Games state={state} />;
        if (view.name === "game") return <Review key={view.gameId} session={session} state={state} gameId={view.gameId} />;
        return <Missing />;
      }}
    </Player>
  );
}

export function App() {
  const route = parseRoute(usePathname());
  return (
    <Shell route={route}>
      {route.name === "home" && <Home />}
      {route.name === "player" && <PlayerScreens route={route} />}
      {(route.name === "missing" || route.name === "process") && <Missing />}
    </Shell>
  );
}
