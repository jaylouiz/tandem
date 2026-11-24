import { describe, expect, it } from "vitest";
import { ago, agoText } from "./ago.ts";

const now = Date.parse("2026-11-24T12:00:00Z");
const before = (s: number) => new Date(now - s * 1000).toISOString();

describe("agoText (#20)", () => {
  it("says `just now` under a minute, never `now ago`", () => {
    expect(agoText(before(0), now)).toBe("just now");
    expect(agoText(before(59), now)).toBe("just now");
    expect(ago(before(59), now)).toBe("now");
  });
  it("says `<age> ago` from a minute on", () => {
    expect(agoText(before(60), now)).toBe("1m ago");
    expect(agoText(before(3 * 3600), now)).toBe("3h ago");
    expect(agoText(before(2 * 86400), now)).toBe("2d ago");
  });
  it("is empty without a time", () => expect(agoText(null, now)).toBe(""));
});
