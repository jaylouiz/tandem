// Maps a comment's rendered images (GitHub `bodyHTML`: signed, short-lived URLs on private repos) back to the
// screenshots parsed from its Markdown body. Alt text is the join key; the k-th duplicate pairs with the k-th.
import type { Screenshot } from "./types.ts";

export interface HtmlImage {
  alt: string;
  src: string;
}

const unescapeHtml = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/gi, "'").replace(/&amp;/g, "&");

/** `<img>` tags of rendered HTML, in document order. */
export function parseHtmlImages(html: string): HtmlImage[] {
  const out: HtmlImage[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = /\bsrc="([^"]+)"/i.exec(m[0])?.[1];
    const alt = /\balt="([^"]*)"/i.exec(m[0])?.[1] ?? "";
    if (src) out.push({ alt: unescapeHtml(alt).trim(), src: unescapeHtml(src) });
  }
  return out;
}

/** One src per screenshot: the rendered URL where the alt text matches, else the screenshot's own src. */
export function alignImages(shots: Screenshot[], rendered: HtmlImage[] | null): string[] {
  const pool = new Map<string, string[]>();
  for (const img of rendered ?? []) pool.set(img.alt, [...(pool.get(img.alt) ?? []), img.src]);
  return shots.map((s) => pool.get(s.alt.trim())?.shift() ?? s.src);
}
