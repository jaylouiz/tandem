// PROTOTYPE (issue #8): stand-in screenshots. The demo data's screenshots are flat placeholders ("R1 a desktop"), and a
// surface that is judged by images cannot be judged with those. These are drawn screens of the demo app (a task list) in the
// three layouts the demo round asks about, plus the settings page of the demo Look. Hex colours only (CLAUDE.md).
import type { Screenshot } from "../../core/types.ts";

const P = {
  bg: "#f4f5f8",
  side: "#eceef3",
  panel: "#ffffff",
  line: "#e1e4ea",
  ink: "#1c2230",
  mute: "#6f7889",
  faint: "#b4bcc9",
  accent: "#3f5bd9",
  soft: "#e8ecfc",
  ok: "#2f9e64",
  warn: "#c9772a",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const t = (x: number, y: number, size: number, text: string, fill = P.ink, weight = 400, anchor = "start") =>
  `<text x="${x}" y="${y}" font-family="Inter, Helvetica Neue, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(text)}</text>`;
const r = (x: number, y: number, w: number, h: number, fill: string, rx = 0, stroke = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ""}/>`;
const ring = (cx: number, cy: number, done = false) =>
  done ? `<circle cx="${cx}" cy="${cy}" r="8" fill="${P.ok}"/><path d="M${cx - 3.5} ${cy + 0.5}l2.5 2.5 4.5-5" fill="none" stroke="#ffffff" stroke-width="1.6"/>` : `<circle cx="${cx}" cy="${cy}" r="7.5" fill="none" stroke="${P.faint}" stroke-width="1.5"/>`;
const chip = (x: number, y: number, text: string, fill = P.side, ink = P.mute) => r(x, y, text.length * 6.6 + 16, 22, fill, 6) + t(x + 8, y + 15, 12, text, ink, 500);

const TASKS: [string, string, string][] = [
  ["Send invoice 2031", "Today", "Work"],
  ["Plan the Q3 offsite", "Tomorrow", "Work"],
  ["Draft the talk outline", "Fri", "Work"],
  ["Review the insurance offer", "Mon", "Work"],
  ["Book the dentist", "Today", "Home"],
  ["Fix the bike brakes", "Sat", "Home"],
  ["Call the landlord", "Next week", "Home"],
  ["Renew the passport", "June", "Later"],
  ["Order a standing desk", "June", "Later"],
  ["Update the CV", "July", "Later"],
];

const svg = (w: number, h: number, inner: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${r(0, 0, w, h, P.bg)}${inner}</svg>`)}`;

/** Sidebar and top bar of the demo app, desktop. The content starts at x 220, y 64. */
function chrome(title: string, active: string) {
  const nav = ["Today", "Upcoming", "Projects", "Statistics", "Settings"];
  return (
    r(0, 0, 220, 800, P.side) +
    r(20, 22, 22, 22, P.accent, 6) +
    t(52, 39, 15, "Acme Tasks", P.ink, 600) +
    nav.map((n, i) => (n === active ? r(12, 72 + i * 36, 196, 30, P.panel, 7) : "") + t(26, 92 + i * 36, 13.5, n, n === active ? P.ink : P.mute, n === active ? 600 : 400)).join("") +
    r(220, 0, 1060, 64, P.panel) +
    r(220, 63, 1060, 1, P.line) +
    t(248, 39, 18, title, P.ink, 600) +
    r(900, 16, 220, 32, P.bg, 8, P.line) +
    t(916, 37, 13, "Search", P.faint) +
    r(1136, 16, 116, 32, P.accent, 8) +
    t(1194, 37, 13, "New task", "#ffffff", 600, "middle")
  );
}

function rowsDesktop(x: number, y: number, w: number, tasks: [string, string, string][], selected = -1) {
  return tasks
    .map(([title, due], i) => {
      const yy = y + i * 46;
      return (i === selected ? r(x, yy, w, 46, P.soft, 8) : "") + r(x + 12, yy + 45, w - 24, 1, P.line) + ring(x + 28, yy + 23, i === 0 && selected < 0) + t(x + 50, yy + 28, 14, title, P.ink, 500) + t(x + w - 16, yy + 28, 12.5, due, due === "Today" ? P.warn : P.mute, 400, "end");
    })
    .join("");
}

const desktop: Record<string, (title: string) => string> = {
  // a: one list, grouped under sticky heads
  a: (title) => {
    let y = 84;
    let out = chrome(title, "Today") + r(248, 84, 1004, 692, P.panel, 12, P.line);
    for (const g of ["Work", "Home", "Later"]) {
      const items = TASKS.filter((x) => x[2] === g);
      out += t(272, y + 30, 12, g.toUpperCase(), P.mute, 600) + t(272 + g.length * 9 + 10, y + 30, 12, String(items.length), P.faint, 500) + rowsDesktop(256, y + 42, 988, items);
      y += 42 + items.length * 46 + 12;
    }
    return out;
  },
  // b: list left, the open task right
  b: (title) =>
    chrome(title, "Today") +
    r(220, 64, 400, 736, P.panel) +
    r(620, 64, 1, 736, P.line) +
    rowsDesktop(228, 76, 384, TASKS, 1) +
    t(660, 118, 24, "Plan the Q3 offsite", P.ink, 600) +
    chip(660, 138, "Work") +
    chip(718, 138, "Due tomorrow", "#fbefe2", P.warn) +
    ["Due", "Project", "Repeats", "Reminder"].map((k, i) => t(660, 206 + i * 34, 13, k, P.mute) + t(780, 206 + i * 34, 13, ["Tomorrow, 10:00", "Work", "Never", "1 hour before"][i]!, P.ink, 500) + r(660, 218 + i * 34, 580, 1, P.line)).join("") +
    t(660, 368, 12, "NOTES", P.mute, 600) +
    ["Three venues are shortlisted. Budget needs sign-off before", "the booking window closes on Friday. Ask for dietary needs", "in the same mail as the date poll."].map((l, i) => t(660, 396 + i * 22, 14, l, P.ink)).join("") +
    t(660, 492, 12, "SUBTASKS", P.mute, 600) +
    ["Send the date poll", "Compare the three venues", "Get the budget signed off"].map((l, i) => ring(670, 520 + i * 36, i === 0) + t(692, 525 + i * 36, 14, l, i === 0 ? P.mute : P.ink)).join(""),
  // c: a dense grid of cards
  c: (title) =>
    chrome(title, "Today") +
    TASKS.slice(0, 9)
      .map(([task, due, group], i) => {
        const x = 248 + (i % 3) * 340;
        const y = 88 + Math.floor(i / 3) * 228;
        return r(x, y, 324, 212, P.panel, 12, P.line) + ring(x + 26, y + 30) + t(x + 46, y + 35, 15, task, P.ink, 600) + r(x + 20, y + 62, 250, 8, P.line, 4) + r(x + 20, y + 82, 196, 8, P.line, 4) + r(x + 20, y + 102, 226, 8, P.line, 4) + chip(x + 20, y + 170, group) + t(x + 304, y + 186, 12.5, due, due === "Today" ? P.warn : P.mute, 400, "end");
      })
      .join(""),
};

function phone(title: string, inner: string) {
  return r(0, 0, 390, 96, P.panel) + r(0, 95, 390, 1, P.line) + t(20, 72, 22, title, P.ink, 700) + r(322, 48, 48, 32, P.accent, 8) + t(346, 69, 13, "New", "#ffffff", 600, "middle") + inner + r(0, 772, 390, 72, P.panel) + r(0, 772, 390, 1, P.line) + ["Today", "Upcoming", "Projects", "Settings"].map((n, i) => t(49 + i * 97, 814, 11.5, n, i === 0 ? P.accent : P.mute, i === 0 ? 600 : 400, "middle")).join("");
}
const rowsPhone = (y: number, tasks: [string, string, string][]) => tasks.map(([title, due], i) => r(16, y + i * 52 + 51, 358, 1, P.line) + ring(30, y + i * 52 + 26) + t(52, y + i * 52 + 31, 15, title, P.ink, 500) + t(374, y + i * 52 + 31, 12.5, due, due === "Today" ? P.warn : P.mute, 400, "end")).join("");

const mobile: Record<string, (title: string) => string> = {
  a: (title) => {
    let y = 104;
    let out = "";
    for (const g of ["Work", "Home", "Later"]) {
      const items = TASKS.filter((x) => x[2] === g);
      out += t(20, y + 26, 12, g.toUpperCase(), P.mute, 600) + rowsPhone(y + 36, items);
      y += 36 + items.length * 52 + 8;
    }
    return phone(title, out);
  },
  b: (title) =>
    phone(
      title,
      rowsPhone(104, TASKS.slice(0, 5)) +
        r(0, 380, 390, 392, P.panel, 18, P.line) +
        r(171, 392, 48, 5, P.faint, 3) +
        t(20, 440, 20, "Plan the Q3 offsite", P.ink, 600) +
        chip(20, 456, "Work") +
        chip(78, 456, "Due tomorrow", "#fbefe2", P.warn) +
        ["Due", "Project", "Repeats"].map((k, i) => t(20, 522 + i * 36, 14, k, P.mute) + t(370, 522 + i * 36, 14, ["Tomorrow, 10:00", "Work", "Never"][i]!, P.ink, 500, "end") + r(20, 534 + i * 36, 350, 1, P.line)).join("") +
        ["Send the date poll", "Compare the three venues"].map((l, i) => ring(30, 660 + i * 38, i === 0) + t(52, 665 + i * 38, 15, l, i === 0 ? P.mute : P.ink)).join(""),
    ),
  c: (title) =>
    phone(
      title,
      TASKS.slice(0, 8)
        .map(([task, due], i) => {
          const x = 16 + (i % 2) * 183;
          const y = 112 + Math.floor(i / 2) * 162;
          const [l1, ...rest] = task.split(" ");
          return r(x, y, 175, 150, P.panel, 12, P.line) + ring(x + 22, y + 26) + t(x + 14, y + 62, 14.5, `${l1} ${rest[0] ?? ""}`, P.ink, 600) + t(x + 14, y + 82, 14.5, rest.slice(1).join(" "), P.ink, 600) + t(x + 14, y + 130, 12.5, due, due === "Today" ? P.warn : P.mute);
        })
        .join(""),
    ),
};

const seg = (x: number, y: number, items: string[], on: number, w = 96) =>
  r(x, y, items.length * w + 6, 36, P.bg, 9, P.line) + items.map((it, i) => (i === on ? r(x + 3 + i * w, y + 3, w, 30, P.panel, 7, P.line) : "") + t(x + 3 + i * w + w / 2, y + 23, 13, it, i === on ? P.ink : P.mute, i === on ? 600 : 400, "middle")).join("");

const look: Record<string, Record<string, () => string>> = {
  desktop: {
    default: () =>
      chrome("Settings", "Settings") +
      ["General", "Appearance", "Notifications", "Sync"].map((n, i) => (i === 1 ? r(244, 88 + i * 36, 180, 30, P.side, 7) : "") + t(258, 108 + i * 36, 13.5, n, i === 1 ? P.ink : P.mute, i === 1 ? 600 : 400)).join("") +
      r(448, 84, 804, 692, P.panel, 12, P.line) +
      t(480, 130, 20, "Appearance", P.ink, 600) +
      t(480, 190, 14, "Theme", P.ink, 500) +
      t(480, 212, 13, "Follows your system setting until you choose one.", P.mute) +
      seg(926, 172, ["System", "Light", "Dark"], 0) +
      r(480, 240, 740, 1, P.line) +
      t(480, 284, 14, "Density", P.ink, 500) +
      t(480, 306, 13, "Compact shows more tasks per screen.", P.mute) +
      seg(1022, 266, ["Comfortable", "Compact"], 0, 96) +
      r(480, 334, 740, 1, P.line) +
      t(480, 378, 14, "Week starts on", P.ink, 500) +
      seg(1022, 358, ["Monday", "Sunday"], 0, 96),
    empty: () =>
      chrome("Settings", "Settings") +
      ["General", "Appearance", "Notifications", "Sync"].map((n, i) => (i === 1 ? r(244, 88 + i * 36, 180, 30, P.side, 7) : "") + t(258, 108 + i * 36, 13.5, n, i === 1 ? P.ink : P.mute, i === 1 ? 600 : 400)).join("") +
      r(448, 84, 804, 692, P.panel, 12, P.line) +
      t(480, 130, 20, "Appearance", P.ink, 600) +
      t(480, 190, 14, "Theme", P.ink, 500) +
      seg(926, 172, ["System", "Light", "Dark"], 2) +
      r(480, 240, 740, 1, P.line) +
      t(480, 284, 14, "Custom themes", P.ink, 500) +
      `<rect x="480" y="304" width="740" height="180" rx="12" fill="${P.bg}" stroke="${P.faint}" stroke-dasharray="5 5"/>` +
      t(850, 384, 15, "No custom themes yet", P.ink, 600, "middle") +
      t(850, 408, 13, "Import one, or start from Light or Dark.", P.mute, 400, "middle") +
      r(790, 428, 120, 32, P.panel, 8, P.line) +
      t(850, 449, 13, "Import theme", P.ink, 500, "middle"),
  },
  mobile: {
    default: () =>
      phone(
        "Settings",
        t(20, 138, 12, "APPEARANCE", P.mute, 600) +
          r(16, 152, 358, 208, P.panel, 12, P.line) +
          t(32, 186, 15, "Theme", P.ink, 500) +
          seg(32, 200, ["System", "Light", "Dark"], 0, 106) +
          t(32, 262, 12.5, "Follows your system setting until you choose one.", P.mute) +
          r(32, 280, 326, 1, P.line) +
          t(32, 316, 15, "Density", P.ink, 500) +
          t(358, 316, 14, "Comfortable", P.mute, 400, "end"),
      ),
  },
};

export const NATURAL = { desktop: [1280, 800], mobile: [390, 844] } as const;

/** The drawn stand-in for one screenshot of the demo data: a round's variant, or a Look's state. */
export function mockSrc(shot: Screenshot, title: string): string {
  const vp = shot.viewport ?? "desktop";
  const [w, h] = NATURAL[vp];
  if (shot.variant && (vp === "desktop" ? desktop : mobile)[shot.variant]) return svg(w, h, (vp === "desktop" ? desktop : mobile)[shot.variant]!(title));
  const state = look[vp]?.[shot.state ?? "default"] ?? look.desktop!.default!;
  return svg(w, h, state());
}
