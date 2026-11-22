import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("Fool Me Twice could not start: the page is missing its root element.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
