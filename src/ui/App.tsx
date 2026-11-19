import { getSession } from "../app/session.ts";
import { parseRoute, usePathname } from "../app/router.ts";
import { Home } from "./Home.tsx";
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
      {(route.name === "missing" || route.name === "how" || route.name === "game") && (
        <div className="status">
          <h2>Nothing here yet</h2>
          <p className="muted">This page does not exist.</p>
          <Link className="btn" href="/">
            Back to the start
          </Link>
        </div>
      )}
    </Shell>
  );
}
