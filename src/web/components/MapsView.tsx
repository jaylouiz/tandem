// Wayfinder maps with their decision tickets, read-only (brief job 11). Tickets are not Cards (GLOSSARY).
import type { TicketStatus, WayfinderMap, WayfinderTicket } from "../../core/types.ts";
import { useMaps } from "../store.ts";
import { Ext, Markdown, shortRepo } from "./bits.tsx";

const GROUPS: { status: TicketStatus[]; label: string }[] = [
  { status: ["frontier"], label: "Frontier" },
  { status: ["claimed"], label: "Claimed" },
  { status: ["blocked"], label: "Blocked" },
  { status: ["decided", "dropped"], label: "Decided" },
];

function Ticket({ t }: { t: WayfinderTicket }) {
  return (
    <a className="ticket" href={t.url} target="_blank" rel="noreferrer" data-testid={`ticket-${t.number}`} data-status={t.status}>
      <span className="muted mono">#{t.number}</span>
      <span className="ticket-main">
        <span className="title">{t.title}</span>
        {t.status === "blocked" && (
          <span className="muted">
            Blocked by {t.blockedBy.map((b) => (b.title === `#${b.number}` ? b.title : `#${b.number} ${b.title}`)).join("; ")}
          </span>
        )}
        {t.status === "decided" && <span className="muted">{t.gist ?? "Not in the map's index yet"}</span>}
      </span>
      <span className="ticket-side">
        {t.kind && <span className="chip">{t.kind}</span>}
        {t.status === "dropped" && <span className="chip">Not planned</span>}
        {t.assignees.length > 0 && <span className="chip accent">{t.assignees.join("; ")}</span>}
      </span>
    </a>
  );
}

function MapSection({ map }: { map: WayfinderMap }) {
  const count = (s: TicketStatus[]) => map.tickets.filter((t) => s.includes(t.status)).length;
  const summary = GROUPS.map((g) => [g.label.toLowerCase(), count(g.status)] as const)
    .filter(([, n]) => n > 0)
    .map(([l, n]) => `${n} ${l}`)
    .join(" · ");
  return (
    <section className="section" aria-label={`${shortRepo(map.repo)}#${map.number} ${map.title}`} data-testid={`map-${map.number}`}>
      <div className="section-title">
        {shortRepo(map.repo)}#{map.number} {map.title}
        {map.state === "closed" && <span className="chip">Closed</span>}
        <span className="muted" style={{ fontWeight: 400 }} data-testid="map-summary">
          {summary}
        </span>
        <a href={map.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontWeight: 400 }}>
          GitHub<Ext />
        </a>
      </div>
      {map.tickets.length === 0 && <div className="muted">No decision tickets yet.</div>}
      {GROUPS.map((g) => {
        const tickets = map.tickets
          .filter((t) => g.status.includes(t.status))
          .sort((a, b) => (g.label === "Decided" ? (b.closedAt ?? "").localeCompare(a.closedAt ?? "") : a.number - b.number));
        return tickets.length ? (
          <div key={g.label} data-testid={`group-${g.label}`}>
            <div className="group-head" role="heading" aria-level={3} style={{ padding: "4px 0" }}>
              {g.label}
              <span className="faint">{tickets.length}</span>
            </div>
            {tickets.map((t) => (
              <Ticket key={t.number} t={t} />
            ))}
          </div>
        ) : null;
      })}
      <details>
        <summary className="muted">Map</summary>
        <Markdown text={map.body} />
      </details>
    </section>
  );
}

export function MapsView() {
  const maps = useMaps();
  if (!maps.length) return <div className="empty">No wayfinder maps. Maps are issues labelled wayfinder:map.</div>;
  const open = maps.filter((m) => m.state === "open");
  const closed = maps.filter((m) => m.state === "closed");
  return (
    <div data-testid="maps" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      {open.map((m) => (
        <MapSection key={m.key} map={m} />
      ))}
      {closed.length > 0 && (
        <details>
          <summary className="muted">Closed maps · {closed.length}</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            {closed.map((m) => (
              <MapSection key={m.key} map={m} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
