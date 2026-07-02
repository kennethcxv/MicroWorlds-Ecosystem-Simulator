import { describe, it, expect } from "vitest";
import { flockAccel, type FlockAgent, type FlockParams } from "../src/habitats/creatures/FlockMath";

const P: FlockParams = {
  radius: 0.4,
  sepRadius: 0.1,
  cohesion: 1.0,
  alignment: 1.0,
  separation: 2.0,
  maxAccel: 3.0,
};

const agent = (pos: [number, number, number], vel: [number, number, number] = [0, 0, 0]): FlockAgent => ({ pos, vel });

describe("flock steering math", () => {
  it("no neighbours → zero acceleration", () => {
    expect(flockAccel(agent([0, 0, 0], [0.1, 0, 0]), [], P)).toEqual([0, 0, 0]);
  });

  it("neighbours outside the sense radius are ignored", () => {
    const a = flockAccel(agent([0, 0, 0]), [agent([5, 0, 0], [1, 0, 0])], P);
    expect(a).toEqual([0, 0, 0]);
  });

  it("cohesion pulls toward a distant-but-sensed group centre", () => {
    const a = flockAccel(agent([0, 0, 0]), [agent([0.3, 0, 0]), agent([0.3, 0.1, 0])], P);
    expect(a[0]).toBeGreaterThan(0); // pulled +x toward the pair
  });

  it("separation pushes away from a too-close neighbour and beats cohesion", () => {
    const a = flockAccel(agent([0, 0, 0]), [agent([0.04, 0, 0])], P);
    expect(a[0]).toBeLessThan(0); // pushed -x away
  });

  it("alignment steers velocity toward the neighbours' heading", () => {
    const self = agent([0, 0, 0], [0, 0, 0]);
    const a = flockAccel(self, [agent([0.2, 0, 0], [0, 0, 1]), agent([-0.2, 0, 0], [0, 0, 1])], P);
    expect(a[2]).toBeGreaterThan(0); // pulled toward +z motion
    // Symmetric neighbours: cohesion cancels on x.
    expect(Math.abs(a[0])).toBeLessThan(1e-9);
  });

  it("output is clamped to maxAccel", () => {
    const crowd: FlockAgent[] = [];
    for (let i = 0; i < 12; i++) crowd.push(agent([0.02 + i * 0.001, 0, 0], [2, 0, 0]));
    const a = flockAccel(agent([0, 0, 0]), crowd, P);
    const len = Math.hypot(a[0], a[1], a[2]);
    expect(len).toBeLessThanOrEqual(P.maxAccel + 1e-9);
    expect(len).toBeGreaterThan(0);
  });
});
