import { parseRoute, usePathname } from "../app/router.ts";
import { Home } from "./Home.tsx";
import { Link } from "./Link.tsx";
import { Shell } from "./Shell.tsx";
import "./styles.css";

export function App() {
  const route = parseRoute(usePathname());
  return (
    <Shell route={route}>
      {route.name === "home" && <Home />}
      {route.name !== "home" && (
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
