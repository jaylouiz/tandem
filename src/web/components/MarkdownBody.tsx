import DOMPurify from "dompurify";
import { marked } from "marked";

/** The renderer behind `Markdown` and `Inline` (bits.tsx): its own chunk with marked and DOMPurify (#7). `inline`: one line, never a block. */
export default function MarkdownBody({ text, breaks, inline }: { text: string; breaks: boolean; inline?: boolean }) {
  if (inline) return <span className="markdown-inline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parseInline(text, { async: false, gfm: true }) as string) }} />;
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks }) as string);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
