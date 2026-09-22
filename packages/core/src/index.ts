export const packageName = "@transferkit/core";

export interface Evidence {
  file: string;
  line?: number;
  description?: string;
}

export interface Finding<T = unknown> {
  id: string;
  kind: string;
  data: T;
  evidence: Evidence[];
}

export interface TransferKitProject {
  name: string;
  initializedAt: string;
}

export interface TransferKitProjectState {
  schemaVersion: 1;
  project: TransferKitProject;
}

export function createProjectState(
  projectName: string,
  initializedAt: Date,
): TransferKitProjectState {
  return {
    schemaVersion: 1,
    project: {
      name: projectName,
      initializedAt: initializedAt.toISOString(),
    },
  };
}

export function serializeProjectState(state: TransferKitProjectState): string {
  return [
    `schemaVersion: ${state.schemaVersion}`,
    "",
    "project:",
    `  name: ${JSON.stringify(state.project.name)}`,
    `  initializedAt: ${JSON.stringify(state.project.initializedAt)}`,
    "",
  ].join("\n");
}
