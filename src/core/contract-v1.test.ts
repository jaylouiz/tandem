// Pins the board client contract (agent-workflow docs/contract.md, "Pinning"): every golden fixture in ./contract-fixtures is
// read with Tandem's own readers and must equal the fixture's expectation; every reply in answers.json is built with Tandem's own
// writers. The directory is a byte-for-byte copy at the revision PIN.json names; `npm run contract:update -- <revision>` rewrites it
// (scripts/update-contract-fixtures.mjs). A changed, added or missing file fails here, so a contract change is a deliberate update.
import { describe, expect, it } from "vitest";
import { parseLog } from "./activity.ts";
import { questionsAnswer } from "./answer.ts";
import { CONTRACT_VERSION, answerComment, digestThread, parseMarker, prVerdictComment, roundReactionComment, type PrVerdict } from "./contract.ts";
import { askQuestions, choicesOf, overviewOf, type Notes, type Picks } from "./questions.ts";
import type { Question } from "./types.ts";

const FILES = import.meta.glob("./contract-fixtures/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const file = (name: string): string => {
  const text = FILES[`./contract-fixtures/${name}`];
  if (text === undefined) throw new Error(`no fixture ${name}`);
  return text;
};
const json = <T>(name: string) => JSON.parse(file(name)) as T;

interface Manifest {
  contract: number;
  fixtures: { name: string; body: string; expect: string }[];
  answers: string;
}
interface Pin {
  repo: string;
  revision: string;
  contract: number;
  files: Record<string, string>;
}
interface Answer {
  form: string;
  request: string;
  text: string;
  picks: Record<string, string> | null;
  notes: Record<string, string> | null;
  verdict?: PrVerdict;
  note?: string;
  round?: number;
  round_picks?: string[];
  round_rejects?: string[];
  comment?: string;
}

const manifest = json<Manifest>("manifest.json");
const pin = json<Pin>("PIN.json");
const answers = json<{ contract: number; answers: Answer[] }>("answers.json");

const AT = "2026-01-05T09:00:00Z";
const thread = (...bodies: string[]) => digestThread(bodies.map((body, i) => ({ id: `c${i}`, author: "agent", createdAt: AT, url: `https://example.test/c${i}`, body })));
const sha256 = async (text: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
/** A request's questions as the expectation lists them: the fields its `choices` lines carry. */
const choices = (qs: Question[]) => qs.map((q) => ({ n: q.n, label: q.label, options: q.options.map(({ letter, recommended, today, name }) => ({ letter, recommended, today, name })) }));

const request = (body: string) => {
  const r = thread(body).requests[0]!;
  return { marker: parseMarker(body), question: r.question, preview: r.preview, overview: overviewOf(body), options: r.options, recommendation: r.recommendation, questions: choices(choicesOf(body)) };
};
const afterRequest = (body: string) => thread(file("request-multi.md"), body).requests[0]!;

/** What Tandem reads from each fixture, in the shape of its expectation. One entry per fixture name: a new fixture needs a reader here. */
const READERS: Record<string, (body: string) => unknown> = {
  "request-multi": request,
  "request-single": request,
  "request-open": request,
  record: (body) => ({ marker: parseMarker(body), title: thread(body).agentDecisions[0]!.title }),
  // an answer and a "Resumed" comment take effect on the request before them
  answer: (body) => ({ marker: parseMarker(body), answer: afterRequest(body).answer }),
  resolved: (body) => {
    expect(afterRequest(body).resolved).toBe(true);
    return { marker: parseMarker(body) };
  },
  followup: (body) => ({ marker: parseMarker(body) }),
  // Tandem keeps a log time to the second (`…T09:30:00Z`), the fixture to the minute: the same instant
  "coordination-log": (body) => ({ marker: parseMarker(body), lines: parseLog(body).map((l) => ({ at: Date.parse(l.at), text: l.text })) }),
  round: (body) => {
    const r = thread(body).rounds[0]!;
    return { marker: parseMarker(body), title: r.title, preview: r.preview, variants: r.variants.map((v) => v.key), questions: r.questions, screenshots: r.screenshots };
  },
  look: (body) => {
    const l = thread(body).look!;
    return { marker: parseMarker(body), headline: l.headline, preview: l.preview, path: l.path, checks: l.checks, screenshots: l.screenshots };
  },
};
const expected = (name: string, expectFile: string): unknown => {
  const want = json<Record<string, unknown>>(expectFile);
  if (name !== "coordination-log") return want;
  return { ...want, lines: (want.lines as { at: string; text: string }[]).map((l) => ({ at: Date.parse(l.at), text: l.text })) };
};

describe("the pinned contract", () => {
  it("is the version Tandem implements, in the manifest, the answers and the pin", () => {
    expect(manifest.contract).toBe(CONTRACT_VERSION);
    expect(answers.contract).toBe(CONTRACT_VERSION);
    expect(pin.contract).toBe(CONTRACT_VERSION);
    expect(pin.repo).toBe("jaylouiz/agent-workflow");
    expect(pin.revision).toMatch(/^[0-9a-f]{40}$/);
  });

  it("holds exactly the files of the manifest, each byte for byte as pinned", async () => {
    const present = Object.keys(FILES).map((p) => p.replace("./contract-fixtures/", "")).filter((n) => n !== "PIN.json").sort();
    const listed = ["manifest.json", manifest.answers, ...manifest.fixtures.flatMap((f) => [f.body, f.expect])].sort();
    expect(present).toEqual(listed);
    expect(Object.keys(pin.files).sort()).toEqual(listed);
    for (const name of listed) expect([name, await sha256(file(name))]).toEqual([name, pin.files[name]]);
  });

  it("has a reader for every fixture and no reader without one", () => {
    expect(Object.keys(READERS).sort()).toEqual(manifest.fixtures.map((f) => f.name).sort());
  });
});

describe("what Tandem reads from each golden fixture", () => {
  for (const f of manifest.fixtures) {
    it(`${f.name}: equals ${f.expect}`, () => {
      const read = READERS[f.name];
      expect(read, `no reader for the fixture ${f.name}`).toBeDefined();
      expect(read!(file(f.body))).toEqual(expected(f.name, f.expect));
    });
  }
});

describe("the replies of answers.json", () => {
  /** What the Card asks for the request fixture, as the app derives it. */
  const askOf = (name: string) => {
    const body = file(`${name}.md`);
    const t = thread(body);
    return askQuestions({ waiting: { kind: "decision", since: AT, requestId: t.requests[0]!.id }, requests: t.requests, rounds: [] });
  };
  const numbered = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([n, v]) => [Number(n), v]));
  const idOf = (a: Answer) => parseMarker(file(`${a.request}.md`))!.id!;

  /** The reply Tandem writes for what the user chose, or null for a reply only a person types. */
  const written = (a: Answer): string | null => {
    if (a.verdict) return prVerdictComment(idOf(a), a.verdict, a.note ?? "");
    if (a.round !== undefined) return roundReactionComment({ round: a.round, picks: a.round_picks ?? [], rejects: a.round_rejects ?? [], comment: a.comment ?? "" });
    if (a.picks && a.notes) return answerComment(idOf(a), questionsAnswer(askOf(a.request)!, numbered(a.picks) as Picks, numbered(a.notes) as Notes));
    // free text on a request without options: the words, behind the prefix
    if (a.form === "free-text") return answerComment(idOf(a), a.text.replace(/^Decision D\d+:\s*/, ""));
    return null;
  };

  it("covers every form the contract lists", () => {
    expect([...new Set(answers.answers.map((a) => a.form))].sort()).toEqual(["free-text", "letter", "lines", "ok", "ok-with-changes", "round-reaction", "typed", "verdict"]);
  });

  answers.answers.forEach((a, i) => {
    it(`${i + 1} ${a.form}: ${JSON.stringify(a.text)}`, () => {
      // every reply is the user's: never a marked comment
      expect(parseMarker(a.text)).toBeNull();
      const mine = written(a);
      if (a.form === "typed") expect(mine).toBeNull();
      else expect(mine).toBe(a.text);
      // and it reaches the request it answers
      expect(thread(file(`${a.request}.md`), a.text).requests[0]!.answer).toBe(a.text);
    });
  });

  it("a request with `choices` lines asks its questions; one without options asks none", () => {
    expect(askOf("request-multi")!.questions).toHaveLength(2);
    expect(askOf("request-single")!.questions).toHaveLength(1);
    expect(askOf("request-open")).toBeNull();
  });
});
