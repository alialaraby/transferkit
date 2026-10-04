import type { Evidence } from "./index.js";
import type { OnboardingTrace } from "./onboarding-trace.js";

export type OnboardingStoryClaimKind =
  | "purpose"
  | "role"
  | "entry"
  | "artifact"
  | "output"
  | "boundary"
  | "observation";

export interface OnboardingStoryClaim {
  kind: OnboardingStoryClaimKind;
  text: string;
  basis: "repository-statement" | "code-observation";
  evidence: Evidence[];
  name?: string;
}

export interface OnboardingStoryTerm {
  name: string;
  codeRole: string;
  meaning?: OnboardingStoryClaim;
  evidence: Evidence[];
  relationCount: number;
  relations: { property: string; target: string; evidence: Evidence[] }[];
}

export interface OnboardingStoryEvidence {
  claims: OnboardingStoryClaim[];
  terms: OnboardingStoryTerm[];
  rejectedDescriptions: {
    text: string;
    evidence: Evidence[];
    reason: string;
  }[];
}

export interface OnboardingStoryInventory {
  purpose?: OnboardingStoryClaim;
  roles: OnboardingStoryClaim[];
  entries: OnboardingStoryClaim[];
  artifacts: OnboardingStoryClaim[];
  outputs: OnboardingStoryClaim[];
  boundaries: OnboardingStoryClaim[];
  observations: OnboardingStoryClaim[];
  terms: OnboardingStoryTerm[];
  rejectedDescriptions: OnboardingStoryEvidence["rejectedDescriptions"];
  unknowns: string[];
}

export type OnboardingStoryConnectionKind =
  | "direct-call"
  | "possible-async-continuation"
  | "shared-artifact"
  | "documented-relation"
  | "unproven-association";

export interface OnboardingStoryConnection {
  from: string;
  to: string;
  kind: OnboardingStoryConnectionKind;
  explanation: string;
  evidence: Evidence[];
}

export interface OnboardingStoryChapter {
  id: string;
  role: "representative" | "complementary" | "focused";
  entry: OnboardingStoryClaim;
  input?: OnboardingStoryClaim;
  output?: OnboardingStoryClaim;
  trace?: OnboardingTrace;
  reason: string;
  decision?: Evidence;
  result?: Evidence;
  alternate?: Evidence;
  firstUnsupportedBoundary?: { reason: string; evidence: Evidence[] };
  inspectNext: Evidence[];
}

export interface OnboardingStorySelection {
  chapters: OnboardingStoryChapter[];
  connections: OnboardingStoryConnection[];
  rejected: { entry: string; reason: string }[];
}
