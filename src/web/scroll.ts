// Each view remembers where it was scrolled while the page lives (#48); a reload starts at the top.
import { useLayoutEffect, type RefObject } from "react";
import type { View } from "./store.ts";

const memory = new Map<View, number>();

/** `ref`'s element shows `view`: it starts where that view was left, and writes its position down as it scrolls. Nothing else moves it (a snapshot or a mark never does). */
export function useScrollMemory(ref: RefObject<HTMLElement | null>, view: View, active = true) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    el.scrollTop = memory.get(view) ?? 0;
    const onScroll = () => memory.set(view, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, view, active]);
}
