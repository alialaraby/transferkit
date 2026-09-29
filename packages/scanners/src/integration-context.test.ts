import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { discoverSourceFeatures } from "./source-discovery.js";

it("captures deterministic integration context without exposing configuration values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tk-integration-"));
  await writeFile(
    join(directory, "nafath.ts"),
    `
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
class NafathApiService {
  constructor(private readonly config: ConfigService) {}
  verify() {
    const token = this.config.get('NAFATH_TOKEN');
    return axios.post(this.config.get('NAFATH_BASE_URL'), {}, { headers: { Authorization: token } });
  }
}
`,
  );
  const finding = discoverSourceFeatures(directory).find(
    ({ kind }) => kind === "integration",
  );
  expect(finding?.data).toMatchObject({
    client: "axios",
    owner: "NafathApiService",
    method: "verify",
    operation: "POST",
    configKey: "NAFATH_BASE_URL",
    authConfigKey: "NAFATH_TOKEN",
  });
  expect(finding?.evidence[0]?.file).toBe("nafath.ts");
});

it("handles destructured local variables in outbound call arguments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tk-integration-binding-"));
  await writeFile(
    join(directory, "client.ts"),
    `
import axios from 'axios';
class ExampleClient {
  submit(response: { data: object }) {
    const { data } = response;
    return axios.post('https://example.test/items', { data });
  }
}
`,
  );
  const findings = discoverSourceFeatures(directory);
  expect(findings.filter(({ kind }) => kind === "integration")).toHaveLength(1);
});
