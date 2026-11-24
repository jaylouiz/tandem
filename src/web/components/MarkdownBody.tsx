import DOMPurify from "dompurify";
import { marked } from "marked";

/** The renderer behind `Markdown` (bits.tsx): its own chunk with marked and DOMPurify (#7). */
export default function MarkdownBody({ text, breaks }: { text: string; breaks: boolean }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks }) as string);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
