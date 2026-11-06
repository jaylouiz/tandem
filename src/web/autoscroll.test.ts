import { describe, expect, it } from "vitest";
import { EDGE, MAX_SPEED, axisSpeed, edgeVelocity } from "./autoscroll.ts";

const box = { left: 200, top: 50, right: 1000, bottom: 700 };

describe("edge auto-scroll speed", () => {
  it("is zero away from the edges, in both axes", () => {
    expect(edgeVelocity(600, 400, box)).toEqual({ x: 0, y: 0 });
    expect(axisSpeed(200 + EDGE, 200, 1000)).toBe(0);
  });

  it("points towards the edge, full speed at and beyond it, rising in between", () => {
    expect(edgeVelocity(1000, 400, box).x).toBe(MAX_SPEED);
    expect(edgeVelocity(5000, 400, box).x).toBe(MAX_SPEED); // over the Card pane beside the Board
    expect(edgeVelocity(1000, 700, box)).toEqual({ x: MAX_SPEED, y: MAX_SPEED }); // a corner: both axes
    expect(edgeVelocity(200, 400, box).x).toBe(-MAX_SPEED);
    expect(edgeVelocity(600, 700, box).y).toBe(MAX_SPEED);
    expect(edgeVelocity(600, 50, box).y).toBe(-MAX_SPEED);
    const slow = edgeVelocity(1000 - EDGE / 2, 400, box).x;
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(MAX_SPEED);
    expect(edgeVelocity(1000 - EDGE / 4, 400, box).x).toBeGreaterThan(slow);
  });

  it("the sticky head row (grouped by repo) moves the top zone below it", () => {
    expect(edgeVelocity(600, 50 + 40, box, 40).y).toBe(-MAX_SPEED);
    expect(edgeVelocity(600, 50 + 40 + EDGE, box, 40).y).toBe(0);
    expect(edgeVelocity(600, 50 + 40 + EDGE, box).y).toBe(0);
  });
});
