export type PropertySnapshot = {
  id: string;
  agentId: string;
  city: string;
  type: string;
  title: string;
  description: string;
  address: string;
  price: number;
  surfaceM2: number;
};

export type PeerSnapshot = { price: number; surfaceM2: number };

export type CandidateSnapshot = {
  id: string;
  agentId: string;
  title: string;
  description: string;
  address: string;
};

const avg = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

const normalized = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export const evaluateLowPricePerM2 = (
  property: PropertySnapshot,
  peers: PeerSnapshot[],
  thresholdRatio = 0.55
) => {
  if (peers.length < 5) return null;
  const peerPpm2 = peers.map((p) => p.price / p.surfaceM2);
  const baseline = avg(peerPpm2);
  const thisPpm2 = property.price / property.surfaceM2;
  if (thisPpm2 >= baseline * thresholdRatio) return null;
  const drop = Math.round(((baseline - thisPpm2) / baseline) * 100);
  return {
    ruleCode: "LOW_PRICE_PER_M2",
    confidence: Math.min(95, 60 + drop),
    reasons: [`Price per m2 is ${drop}% below local baseline`],
    details: { baseline, thisPpm2 },
  };
};

export const evaluateCrossAgentDuplicate = (
  property: PropertySnapshot,
  candidates: CandidateSnapshot[]
) => {
  const ownSig = `${normalized(property.title)}|${normalized(property.description).slice(0, 140)}`;
  const ownAddress = normalized(property.address);
  for (const candidate of candidates) {
    if (candidate.agentId === property.agentId) continue;
    const candidateSig = `${normalized(candidate.title)}|${normalized(candidate.description).slice(0, 140)}`;
    if (candidateSig === ownSig || normalized(candidate.address) === ownAddress) {
      return {
        ruleCode: "CROSS_AGENT_DUPLICATE",
        confidence: 85,
        reasons: ["Possible duplicate listing from another agent"],
        details: { duplicatePropertyId: candidate.id },
      };
    }
  }
  return null;
};