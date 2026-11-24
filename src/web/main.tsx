import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { preloadMarkdown } from "./components/bits.tsx";
import { startRouting } from "./routing.ts";
import { connect } from "./store.ts";
import { TooltipProvider } from "./ui/Tooltip.tsx";
import "./styles.css";

try {
  const theme = localStorage.getItem("tandem.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {}

startRouting();
connect();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);

// the Markdown renderer is its own chunk (#7): the Board does not need it for its first paint; fetch it once the page is idle
const idle = (f: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(f) : setTimeout(f, 200));
idle(preloadMarkdown);
