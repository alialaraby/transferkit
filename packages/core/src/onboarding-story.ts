import type { Evidence } from "./index.js";

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
