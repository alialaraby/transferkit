# Scanner development

Scanners inspect a repository and emit structured `Finding` objects with `Evidence`. They belong in `packages/scanners` and may depend on `packages/core` contracts.

## Responsibilities

A scanner may detect a technology or capability, extract statically available metadata, record source evidence, and return no finding when evidence is insufficient.

A scanner must not ask interactive questions, render handover documentation, decide whether human knowledge is complete, persist state directly, make network calls, upload source, or collect secret and environment-variable values.

## Findings and evidence

Use the shared contracts:

```ts
interface Finding<TData, TKind extends string> {
  id: string;
  kind: TKind;
  data: TData;
  evidence: Evidence[];
}

interface Evidence {
  file: string;
  line?: number;
  description?: string;
}
```

Finding IDs must be deterministic and stable for the same repository entity so rescans preserve associated knowledge. Prefer repository-relative paths and include line numbers when they can be determined reliably.

## Adding detection

1. Add a focused fixture for positive and negative cases.
2. Implement the narrowest static detection that supports the use case.
3. Test extracted data and evidence, not parser implementation details.
4. Include the finding in `scanRepository` when it belongs in the combined scan.
5. Map it to the canonical system model only when the current product uses that entity.

Use `fixtures/realistic-nestjs` for combined integration coverage. Keep malformed and unsupported cases in focused fixtures so failures remain easy to diagnose.
