export const currentSchemaVersion = 1 as const;

export class StateVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateVersionError";
  }
}

export function readSchemaVersion(value: unknown, stateName: string): number {
  if (!isRecord(value) || !Number.isInteger(value.schemaVersion)) {
    throw new StateVersionError(
      `${stateName} is missing a valid schemaVersion`,
    );
  }
  return value.schemaVersion as number;
}

export function requireCurrentSchemaVersion(
  value: unknown,
  stateName: string,
): void {
  const version = readSchemaVersion(value, stateName);
  if (version > currentSchemaVersion) {
    throw new StateVersionError(
      `${stateName} uses unsupported newer schema version ${version} (current: ${currentSchemaVersion})`,
    );
  }
  if (version < currentSchemaVersion) {
    throw new StateVersionError(
      `${stateName} uses unsupported older schema version ${version}; no migration is available`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
