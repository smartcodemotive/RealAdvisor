import { describe, expect, it } from "vitest";
import { evaluateCrossAgentDuplicate, evaluateLowPricePerM2 } from "./detectionRules.js";

describe("scam detection rules", () => {
  it("does not flag duplicates from the same agent", () => {
    const property = {
      id: "p1",
      agentId: "a1",
      city: "Zurich",
      type: "apartment",
      title: "Nice flat",
      description: "Bright and central",
      address: "1 Main",
      price: 500000,
      surfaceM2: 80,
    };
    const candidates = [
      {
        id: "p2",
        agentId: "a1",
        title: "Nice flat",
        description: "Bright and central",
        address: "1 Main",
      },
    ];
    expect(evaluateCrossAgentDuplicate(property, candidates)).toBeNull();
  });

  it("does not compute low price baseline with too few peers", () => {
    const property = {
      id: "p1",
      agentId: "a1",
      city: "Zurich",
      type: "apartment",
      title: "Flat",
      description: "Ok",
      address: "1 Main",
      price: 1000,
      surfaceM2: 100,
    };
    const peers = Array.from({ length: 4 }).map(() => ({ price: 10000, surfaceM2: 50 }));
    expect(evaluateLowPricePerM2(property, peers)).toBeNull();
  });
});