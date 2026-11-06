// Signed screenshot URLs (private repos): GitHub's `private-user-images` links live about 5 minutes, so they are
// fetched per comment when a Card detail opens, kept in memory only, and refetched once when an image fails.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Card, Screenshot } from "../core/types.ts";
import { api } from "./store.ts";

const FRESH_MS = 240_000;
const RETRY_GAP_MS = 3_000;

interface Entry {
  srcs: string[];
  at: number;
  /** false when the lookup failed and the raw sources stand in */
  signed: boolean;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<boolean>>();
const listeners = new Set<() => void>();
let version = 0;
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
const snapshot = () => version;

/** Fetch (or reuse) the signed sources of one comment. Resolves true when the sources changed. */
export function lookup(cardPath: string, commentId: string, force = false): Promise<boolean> {
  const key = `${cardPath}|${commentId}`;
  const known = cache.get(key);
  const now = Date.now();
  if (known && (force ? now - known.at < RETRY_GAP_MS : known.signed && now - known.at < FRESH_MS)) return Promise.resolve(false);
  const running = inflight.get(key);
  if (running) return running;
  const p = api
    .get<{ srcs: string[]; signed: boolean }>(`${cardPath}/images?comment=${encodeURIComponent(commentId)}`)
    .then((r) => {
      const changed = JSON.stringify(known?.srcs) !== JSON.stringify(r.srcs);
      cache.set(key, { srcs: r.srcs, at: Date.now(), signed: r.signed });
      if (changed) {
        version++;
        listeners.forEach((l) => l());
      }
      return changed;
    })
    .catch(() => {
      cache.set(key, { srcs: known?.srcs ?? [], at: Date.now(), signed: false });
      return false;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Screenshots with the signed sources swapped in where known; the raw `src` otherwise. */
export function useSigned(card: Card | null) {
  useSyncExternalStore(subscribe, snapshot);
  const cardPath = card ? api.cardPath(card) : null;
  const ids = card ? [...card.rounds.map((r) => r.commentId), ...(card.look ? [card.look.commentId] : [])].join(",") : "";
  useEffect(() => {
    if (cardPath) for (const id of ids.split(",").filter(Boolean)) void lookup(cardPath, id);
  }, [cardPath, ids]);
  const shots = (commentId: string, raw: Screenshot[]): Screenshot[] => {
    const srcs = cardPath ? cache.get(`${cardPath}|${commentId}`)?.srcs : undefined;
    return srcs?.length === raw.length ? raw.map((s, i) => ({ ...s, src: srcs[i] ?? s.src })) : raw;
  };
  /** Refetch after an image failed (once per call; the 3 s gap stops a failing image from looping). */
  const retry = useCallback((commentId: string) => (cardPath ? lookup(cardPath, commentId, true) : Promise.resolve(false)), [cardPath]);
  /** Make sure the sources are fresh, e.g. when a gallery opens after a long time on the same Card. */
  const ensure = useCallback((commentId: string) => void (cardPath && lookup(cardPath, commentId)), [cardPath]);
  return { shots, retry, ensure };
}

export type Signed = ReturnType<typeof useSigned>;
