export interface OnboardingTraceLocation {
  file: string;
  line: number;
  endLine: number;
  symbol?: string;
  origin: "code";
}

export interface OnboardingTraceEvent {
  kind: "branch" | "return" | "throw" | "call" | "assignment";
  detail: string;
  at: OnboardingTraceLocation;
  path: string[];
  awaited?: boolean;
  effect?: "read-like" | "write-like" | "transaction-like";
}

export interface OnboardingTraceCallEdge {
  caller: string;
  site: OnboardingTraceLocation;
  declaredTarget?: string;
  declaration?: OnboardingTraceLocation;
  kind: "direct" | "declared-target" | "candidate" | "unresolved";
  evaluation?: "nested-argument";
  path: string[];
}

export interface OnboardingTraceGap {
  reason: string;
  at: OnboardingTraceLocation;
  path: string[];
}

export interface OnboardingTraceMethod {
  symbol: string;
  declaration: OnboardingTraceLocation;
  events: OnboardingTraceEvent[];
}

export interface OnboardingTrace {
  id: string;
  entry: {
    symbol: string;
    kind?: "route" | "scheduled";
    verb?: string;
    path?: string;
    schedule?: string;
    declaration: OnboardingTraceLocation;
  };
  methods: OnboardingTraceMethod[];
  calls: OnboardingTraceCallEdge[];
  gaps: OnboardingTraceGap[];
}

export interface OnboardingRepositoryNote {
  kind: "description" | "entry" | "comment" | "test" | "migration";
  text: string;
  file: string;
  line: number;
  journey?: string;
}

export interface OnboardingEntity {
  name: string;
  declaration: OnboardingTraceLocation;
  fields: { name: string; at: OnboardingTraceLocation }[];
  relations: {
    property: string;
    target: string;
    kind: string;
    at: OnboardingTraceLocation;
  }[];
}

export interface OnboardingRepositoryBinding {
  repository: string;
  entity: string;
  at: OnboardingTraceLocation;
}

export interface OnboardingRepositoryMethodResult {
  repository: string;
  method: string;
  entity: string;
  at: OnboardingTraceLocation;
}

export interface OnboardingInjectedRepository {
  owner: string;
  property: string;
  repository: string;
  at: OnboardingTraceLocation;
}

export interface OnboardingConceptEvidence {
  entities: OnboardingEntity[];
  repositories: OnboardingRepositoryBinding[];
  methodResults: OnboardingRepositoryMethodResult[];
  injections: OnboardingInjectedRepository[];
}

export interface OnboardingSelectedConcept {
  entity: OnboardingEntity;
  calls: {
    effect: "read-like" | "write-like" | "unspecified";
    at: OnboardingTraceLocation;
  }[];
}

export interface OnboardingQueuePublication {
  caller: string;
  queue: string;
  job: string;
  at: OnboardingTraceLocation;
  injection: OnboardingTraceLocation;
  path?: string[];
}

export interface OnboardingQueueHandler {
  queue: string;
  symbol: string;
  registration: OnboardingTraceLocation;
  declaration: OnboardingTraceLocation;
}

export interface OnboardingQueueEvidence {
  publications: OnboardingQueuePublication[];
  handlers: OnboardingQueueHandler[];
}

export interface OnboardingQueueContinuation {
  publication: OnboardingQueuePublication;
  handler?: OnboardingQueueHandler;
  reason?: string;
}

export interface OnboardingScheduledCall {
  job: string;
  schedule?: string;
  registration: OnboardingTraceLocation;
  at: OnboardingTraceLocation;
  detail: string;
  effect?: "read-like" | "write-like";
}

export interface OnboardingScheduledConcept {
  job: string;
  schedule?: string;
  registration: OnboardingTraceLocation;
  entity: string;
  effect: "read-like" | "write-like" | "unspecified";
  at: OnboardingTraceLocation;
}
