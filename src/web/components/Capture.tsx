import { useEffect, useRef, useState } from "react";
import { Dialog } from "../ui/Dialog.tsx";
import { Btn } from "./bits.tsx";
import { NO_REPOS, api, useStore, write } from "../store.ts";

/** Capture an idea as a new `inbox` issue (brief job 9). */
export function Capture() {
  const open = useStore((s) => s.modal === "capture");
  const setOpen = useStore((s) => s.setCapture);
  const repos = useStore((s) => s.board?.repos ?? NO_REPOS);
  const filter = useStore((s) => s.repoFilter);
  const setNotice = useStore((s) => s.setNotice);
  const [repo, setRepo] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false); // read in the same event as the first call: `busy` is still the old render's
  const titleRef = useRef<HTMLInputElement>(null);
  /** why the last Capture failed; the dialog and the text stay so it can be sent again */
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setError(null); // a failure shown last time is not shown again on the next Capture
  }, [open]);
  const target = repo || filter || repos[0] || "";
  const save = async () => {
    if (!title.trim() || !target || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const sent = { title, body };
    const res = await write(() => api.post<{ number: number }>("/api/issues", { repo: target, title: title.trim(), body }), { what: `capture the idea in ${target}`, notify: false });
    sending.current = false;
    setBusy(false);
    if (!res.ok) {
      // closed while it was on its way: no dialog to show the error in, so the notice says it (the text is still there for the next Capture)
      if (useStore.getState().modal !== "capture") setNotice({ key: "", text: res.message, canStart: false, failed: true });
      else {
        setError(res.error);
        titleRef.current?.focus(); // the Capture button was busy and may have dropped focus: keep Esc and ⌘↵ working
      }
      return;
    }
    setOpen(false);
    // text typed into a reopened dialog meanwhile is not the idea that was just captured
    setTitle((t) => (t === sent.title ? "" : t));
    setBody((b) => (b === sent.body ? "" : b));
    setNotice({ key: `${target}#${res.value.number}`, text: `Captured ${target}#${res.value.number} in the Inbox`, canStart: false });
  };
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      label="Capture an idea"
      className="dialog"
      initialFocus={titleRef}
      onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && void save()}
    >
      <div className="dialog-body">
        <div className="actions">
          <strong>Capture an idea</strong>
          <span className="spacer" />
          <select className="btn" value={target} onChange={(e) => setRepo(e.target.value)} aria-label="Repo">
            {repos.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <input
          ref={titleRef}
          className="input"
          autoFocus // at the commit, so what is typed right after `c` is not lost (the library moves focus a frame later)
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.metaKey && !e.ctrlKey && void save()}
        />
        <textarea className="input" placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
        {error && (
          <div className="section failed" role="alert" data-testid="capture-error">
            <div>
              <strong>Not captured:</strong> {error}
            </div>
          </div>
        )}
        <div className="actions">
          <span className="faint">Lands in the Inbox · ⌘↵ to save</span>
          <span className="spacer" />
          <Btn className="btn primary" onClick={() => void save()} why={busy ? "Already capturing this idea" : !title.trim() ? "Give the idea a title" : !target ? "Choose a Repo first" : null}>
            {busy ? "Capturing…" : "Capture"}
          </Btn>
        </div>
      </div>
    </Dialog>
  );
}
