// proto #17 (never merged). The round's questions and which option of each is on screen: `?variant=1B.2B.3B.4B`.
// Without `?variant` everything is A (today) and the switcher is not rendered.
import { useSyncExternalStore } from "react";

export const QUESTIONS = [
  { n: 1, label: "Sheet", about: "what the Card sheet shows, and where", options: { A: "Tabs (today)", B: "One page", C: "Ask and rail" } },
  { n: 2, label: "Phase", about: "how the Phase reads in the head", options: { A: "Breadcrumb (today)", B: "Track", C: "Name only" } },
  { n: 3, label: "Answer", about: "a decision with several questions", options: { A: "One ok tile (today)", B: "All questions", C: "One at a time" } },
  { n: 4, label: "Prefix", about: "what an answer to a round starts with", options: { A: "R1: (today)", B: "D1:", C: "Decision D1:" } },
] as const;

export interface Variant {
  on: boolean;
  sheet: "A" | "B" | "C";
  phase: "A" | "B" | "C";
  answer: "A" | "B" | "C";
  prefix: "A" | "B" | "C";
  bar: boolean;
}

const KEYS = ["sheet", "phase", "answer", "prefix"] as const;
let cache: { search: string; v: Variant } | null = null;

function read(): Variant {
  const search = typeof location === "undefined" ? "" : location.search;
  if (cache?.search === search) return cache.v;
  const q = new URLSearchParams(search);
  const raw = q.get("variant");
  const v: Variant = { on: raw !== null, sheet: "A", phase: "A", answer: "A", prefix: "A", bar: q.get("bar") !== "0" };
  for (const m of (raw ?? "").matchAll(/([1-4])([A-C])/g)) v[KEYS[Number(m[1]) - 1]!] = m[2] as "A";
  cache = { search, v };
  return v;
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("popstate", emit);
  // routing.ts rewrites the URL through the History API: the switcher follows it
  for (const fn of ["pushState", "replaceState"] as const) {
    const orig = history[fn].bind(history);
    history[fn] = (...args: Parameters<History["pushState"]>) => {
      orig(...args);
      emit();
    };
  }
}

export const useVariant = (): Variant => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), read);
export const variantNow = read;

export function setVariant(n: number, letter: string) {
  const v = read();
  const next = KEYS.map((k, i) => `${i + 1}${i + 1 === n ? letter : v[k]}`).join(".");
  const q = new URLSearchParams(location.search);
  q.set("variant", next);
  history.replaceState(null, "", `${location.pathname}?${q.toString().replace(/%2F/gi, "/")}`);
}
