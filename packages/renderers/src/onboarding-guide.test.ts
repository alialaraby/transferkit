import { describe, expect, it } from "vitest";
import type { Finding, ProjectModel } from "@transferkit/core";
import { renderOnboardingGuide } from "./onboarding-guide.js";

const evidence = [{ file: "src/debt/debt.controller.ts", line: 12 }];
const model: ProjectModel = {
  domains: [
    {
      id: "domain:debt",
      name: "Debt",
      modules: ["module"],
      controllers: ["controller"],
      services: ["service"],
      entities: [],
      integrations: ["hyperpay"],
      jobs: [],
      evidence,
    },
  ],
  components: [
    { id: "module", name: "DebtModule", kind: "MODULE", evidence },
    { id: "controller", name: "DebtController", kind: "CONTROLLER", evidence },
    { id: "service", name: "DebtService", kind: "SERVICE", evidence },
    { id: "hyperpay", name: "HyperPay", kind: "INTEGRATION", evidence },
    {
      id: "hyperpay-duplicate",
      name: "HyperPay",
      kind: "INTEGRATION",
      evidence,
    },
    { id: "axios", name: "axios", kind: "INTEGRATION", evidence },
    { id: "fetch", name: "fetch", kind: "INTEGRATION", evidence },
    {
      id: "unknown",
      name: "Unknown HTTP Integration",
      kind: "INTEGRATION",
      evidence,
    },
  ],
  relationships: [
    {
      id: "controller-service",
      kind: "CONTROLLER_SERVICE",
      from: "controller",
      to: "service",
      evidence,
    },
  ],
  candidateFlows: [
    {
      id: "flow:debt",
      title: "Debt creation",
      domainIds: ["domain:debt"],
      componentIds: ["controller", "service"],
      entryPoints: ["POST /debt"],
      integrationIds: [],
      entityIds: [],
      jobIds: [],
      confidence: "CANDIDATE",
      sourceFindingIds: ["route"],
      evidence,
      steps: [],
    },
  ],
  operationalCapabilities: [],
};
const findings: Finding[] = [
  {
    id: "entry",
    kind: "application.entry-point",
    data: { module: "AppModule" },
    evidence: [{ file: "src/main.ts", line: 5 }],
  },
  {
    id: "container",
    kind: "containerization",
    data: { file: "docker-compose.yml" },
    evidence: [{ file: "docker-compose.yml", line: 1 }],
  },
];

describe("repository-only onboarding guide", () => {
  it("labels evidence and uncertainty without asserting an explained flow or working setup", () => {
    const guide = renderOnboardingGuide(model, findings);
    expect(guide).toContain("## System overview");
    expect(guide).toContain("## Architecture relationships");
    expect(guide).toContain("## Candidate flows");
    expect(guide).toContain(
      "**Observed in code:** Bootstrap file: src/main.ts; creates AppModule",
    );
    expect(guide).toContain(
      "**Inferred from declarations:** DebtController → DebtService",
    );
    expect(guide).toContain("**Inferred candidate:** POST /debt");
    expect(guide).toContain(
      "Method calls, decisions, persistence order, and runtime outcomes are unverified",
    );
    expect(guide).toContain("Repository documentation and configuration only");
    expect(guide).toContain("`src/debt/debt.controller.ts:12`");
    expect(guide).toContain(
      "<details><summary>Repository references</summary>",
    );
    expect(guide).not.toContain("verified end-to-end");
  });

  it("keeps generic HTTP clients out of named integrations", () => {
    const guide = renderOnboardingGuide(model, findings);
    expect(guide).toContain(
      "Named external integrations to investigate: HyperPay",
    );
    expect(guide).not.toContain("HyperPay, HyperPay");
    expect(guide).not.toContain("integrations to investigate: axios");
    expect(guide).not.toContain("integrations to investigate: fetch");
    expect(guide).not.toContain("Unknown HTTP Integration");
  });

  it("renders one numbered explained flow with step-specific citations", () => {
    const guide = renderOnboardingGuide(model, findings, [
      {
        routeFindingId: "route",
        title: "Debt creation",
        entryPoint: "POST /debt",
        steps: [
          {
            text: "The handler directly calls the service method.",
            evidence: [
              { file: "src/debt/debt.controller.ts", line: 25 },
              { file: "src/debt/debt.service.ts", line: 40 },
            ],
          },
          {
            text: "The method awaits `DebtRepository.save`.",
            evidence: [{ file: "src/debt/debt.service.ts", line: 60 }],
          },
        ],
        gaps: ["Delivery unverified."],
      },
    ]);
    const explained = guide
      .split("## Explained flow\n")[1]!
      .split("## Candidate flows")[0];
    expect(explained).toContain(
      "1. The handler directly calls the service method. [Step 1]",
    );
    expect(explained).toContain(
      "2. The method awaits `DebtRepository.save`. [Step 2]",
    );
    expect(explained).toContain(
      "Step 1: `src/debt/debt.controller.ts:25`, `src/debt/debt.service.ts:40`",
    );
    expect(explained).toContain("Step 2: `src/debt/debt.service.ts:60`");
    expect(explained).not.toContain("src/debt/debt.controller.ts:12");
    expect(guide).not.toContain("**Inferred candidate:** POST /debt");
  });

  it("selects at most two complementary traces and leaves unsupported routes as candidates", () => {
    const routes = [
      ["Debt add", "POST /debt/add", "debt-add", "controller", "domain:debt"],
      [
        "Debt consent",
        "POST /debt/consent",
        "debt-consent",
        "controller",
        "domain:debt",
      ],
      [
        "Payment submit",
        "POST /payment/submit",
        "payment-submit",
        "payment-controller",
        "domain:payment",
      ],
    ] as const;
    const expanded: ProjectModel = {
      ...model,
      domains: [
        ...model.domains,
        {
          ...model.domains[0]!,
          id: "domain:payment",
          name: "Payment",
          controllers: ["payment-controller"],
        },
      ],
      components: [
        ...model.components,
        {
          id: "payment-controller",
          name: "PaymentController",
          kind: "CONTROLLER",
          evidence,
        },
      ],
      candidateFlows: routes.map(([title, entry, id, controller, domain]) => ({
        ...model.candidateFlows[0]!,
        id,
        title,
        entryPoints: [entry],
        sourceFindingIds: [id],
        componentIds: [controller],
        domainIds: [domain],
      })),
    };
    const explanations = routes.map(([title, entry, id]) => ({
      title,
      entryPoint: entry,
      routeFindingId: id,
      steps: [
        {
          text: "Directly supported call.",
          evidence: [
            { file: "src/handler.ts", line: 1 },
            { file: "src/method.ts", line: 2 },
            { file: "src/method.ts", line: 3 },
            { file: "src/method.ts", line: 4 },
          ],
        },
      ],
      gaps: ["Runtime unverified."],
    }));
    const guide = renderOnboardingGuide(expanded, findings, explanations);
    const explained = guide
      .split("## Explained flow\n")[1]!
      .split("## Candidate flows")[0];
    const candidate = guide
      .split("## Candidate flows\n")[1]!
      .split("## Setup and operations")[0];
    expect(explained).toContain("### Debt add");
    expect(explained).toContain("### Debt consent");
    expect(explained).not.toContain("### Payment submit");
    expect(candidate).toContain("### Payment submit");
    expect(explained).not.toContain("src/method.ts:4");
    const weakSecond = renderOnboardingGuide(expanded, findings, [
      explanations[0]!,
    ]);
    expect(weakSecond.split("## Candidate flows\n")[1]).toContain(
      "### Debt consent",
    );
  });

  it("selects meaningful routes independent of discovery order and keeps the guide compact", () => {
    const candidates = [
      ["Debt lookup", "GET /debt/:id", "domain:debt"],
      ["Auth login", "POST /auth/login", "domain:auth"],
      [
        "Debt approve extension",
        "POST /debt/extension/:id/approve",
        "domain:debt",
      ],
      ["Debt consent", "POST /debt/consent", "domain:debt"],
      ["Debt add", "POST /debt/add", "domain:debt"],
      ["Payment submit", "POST /payment/submit", "domain:payment"],
    ] as const;
    const expanded: ProjectModel = {
      ...model,
      domains: [
        ...model.domains,
        {
          ...model.domains[0]!,
          id: "domain:payment",
          name: "Payment",
          controllers: ["payment-controller"],
        },
        {
          ...model.domains[0]!,
          id: "domain:auth",
          name: "Auth",
          controllers: ["auth-controller"],
        },
      ],
      components: [
        ...model.components,
        {
          id: "payment-controller",
          name: "PaymentController",
          kind: "CONTROLLER",
          evidence,
        },
        {
          id: "auth-controller",
          name: "AuthController",
          kind: "CONTROLLER",
          evidence,
        },
        ...Array.from({ length: 20 }, (_, index) => ({
          id: `module-${index}`,
          name: `Feature${index}Module`,
          kind: "MODULE" as const,
          evidence,
        })),
      ],
      candidateFlows: candidates.map(([title, entry, domain]) => ({
        ...model.candidateFlows[0]!,
        id: title,
        title,
        entryPoints: [entry],
        domainIds: [domain],
        componentIds: [
          domain === "domain:payment"
            ? "payment-controller"
            : domain === "domain:auth"
              ? "auth-controller"
              : "controller",
        ],
        steps: Array.from({ length: 4 }, () => ({
          componentId:
            domain === "domain:payment"
              ? "payment-controller"
              : domain === "domain:auth"
                ? "auth-controller"
                : "controller",
          evidence,
        })),
      })),
    };
    const guide = renderOnboardingGuide(expanded, [
      ...findings,
      ...Array.from({ length: 130 }, (_, index) => ({
        id: `config-${index}`,
        kind: "configuration",
        data: { name: `UNRELATED_${index}` },
        evidence,
      })),
    ]);
    const flows = guide
      .split("## Candidate flows\n")[1]!
      .split("## Setup and operations")[0];
    expect(flows).toContain("### Debt add");
    expect(flows).toContain("### Debt approve extension");
    expect(flows).toContain("### Payment submit");
    expect(flows).not.toContain("### Debt lookup");
    expect(flows).not.toContain("### Auth login");
    expect(
      renderOnboardingGuide(
        { ...expanded, candidateFlows: [...expanded.candidateFlows].reverse() },
        findings,
      )
        .split("## Candidate flows\n")[1]!
        .split("## Setup and operations")[0],
    ).toBe(flows);
    expect(guide).toContain("Feature19Module");
    expect(guide).not.toMatch(/130 configuration references|UNRELATED_/u);
    expect(guide.length).toBeLessThan(7000);
  });
});

it("renders the port contradiction as a question and redacts configuration values", () => {
  const guide = renderOnboardingGuide(model, [
    ...findings,
    {
      id: "install",
      kind: "setup.command",
      data: { command: "npm install", purpose: "install" },
      evidence: [{ file: "README.md", line: 10 }],
    },
    {
      id: "map",
      kind: "setup.port",
      data: { service: "app", hostPort: "3000", containerPort: "3000" },
      evidence: [{ file: "docker-compose.yml", line: 4 }],
    },
    {
      id: "fallback",
      kind: "setup.port",
      data: { service: "app", defaultPort: "5000", variable: "PORT" },
      evidence: [{ file: "src/main.ts", line: 5 }],
    },
    {
      id: "env",
      kind: "environment.variable",
      data: { name: "DB_PASSWORD", value: "private-value" },
      evidence: [{ file: "src/config.ts", line: 8 }],
    },
  ]);
  const setup = guide
    .split("## Setup and operations\n")[1]!
    .split("## Unknowns")[0]!;
  expect(setup).toContain("Documented, runtime unverified — install");
  expect(setup).toContain("Is PORT set to the mapped container port?");
  expect(setup).toContain("DB_PASSWORD");
  expect(setup).not.toContain("private-value");
});

it("distinguishes root imports, cites jobs and candidate method bodies, and asks about partial outcomes", () => {
  const guide = renderOnboardingGuide(
    {
      ...model,
      components: [
        ...model.components,
        {
          id: "root-module",
          name: "AppModule",
          kind: "MODULE",
          evidence: [{ file: "src/app.module.ts", line: 10 }],
        },
      ],
    },
    [
      ...findings,
      {
        id: "root",
        kind: "application.module",
        data: {
          name: "AppModule",
          imports: "DebtModule, ConfigModule",
          importNames: "DebtModule, ConfigModule",
        },
        evidence: [{ file: "src/app.module.ts", line: 10 }],
      },
      {
        id: "job",
        kind: "scheduled-job",
        data: { name: "ReminderJob.run" },
        evidence: [{ file: "src/reminder.job.ts", line: 22 }],
      },
      {
        id: "route",
        kind: "application.route",
        data: { path: "/debt" },
        evidence: [
          { file: "src/debt/debt.controller.ts", line: 20 },
          { file: "src/routes.ts", line: 3 },
        ],
      },
      {
        id: "trace",
        kind: "application.route-trace",
        data: {
          routeFindingId: "route",
          handler: "DebtController.create",
          serviceMethod: "DebtService.create",
          gaps: [],
          operations: [
            {
              kind: "call",
              category: "repository",
              target: "DebtRepository",
              method: "save",
              awaited: true,
              evidence: [{ file: "src/debt/debt.service.ts", line: 40 }],
            },
            {
              kind: "call",
              category: "repository",
              target: "ConsentRepository",
              method: "save",
              awaited: true,
              evidence: [{ file: "src/debt/debt.service.ts", line: 50 }],
            },
            {
              kind: "call",
              category: "service",
              target: "StorageService",
              method: "upload",
              catchDepth: 1,
              evidence: [{ file: "src/debt/debt.service.ts", line: 60 }],
            },
          ],
        },
        evidence: [
          { file: "src/debt/debt.controller.ts", line: 25 },
          { file: "src/debt/debt.service.ts", line: 30 },
        ],
      },
    ],
  );
  expect(guide).toContain("Root module imports: DebtModule, ConfigModule");
  expect(guide).toContain("ReminderJob.run: `src/reminder.job.ts:22`");
  expect(guide).toContain(
    "Integration signal HyperPay: `src/debt/debt.controller.ts:12`",
  );
  expect(guide).toContain("Direct service method: DebtService.create");
  expect(guide).toContain("`src/routes.ts:3`");
  expect(guide).toContain("`src/debt/debt.service.ts:30`");
  expect(guide).toContain(
    "Can one path execute both? If so, could a later failure leave partial state",
  );
  expect(guide).toContain("If that call fails, what state remains");
  expect(guide).not.toContain("incident occurred");
});

it("shows source-backed setup prerequisites without environment values", () => {
  const guide = renderOnboardingGuide(model, [
    ...findings,
    {
      id: "env",
      kind: "setup.requirement",
      data: { type: "envFile", service: "app", path: ".env", value: "secret" },
      evidence: [{ file: "docker-compose.yml", line: 10 }],
    },
    {
      id: "init",
      kind: "setup.requirement",
      data: { type: "initMount", service: "postgres", path: "./db/init.sql" },
      evidence: [{ file: "docker-compose.yml", line: 11 }],
    },
    {
      id: "built",
      kind: "setup.requirement",
      data: { type: "builtOutput", service: "app" },
      evidence: [{ file: "docker-compose.yml", line: 20 }],
    },
  ]);
  expect(guide).toContain("requires .env");
  expect(guide).toContain("mounts initialization file ./db/init.sql");
  expect(guide).toContain("What build step produces the compiled output");
  expect(guide).not.toContain("secret");
});

it("links port and dependency questions to the detected service rather than an app name", () => {
  const guide = renderOnboardingGuide(model, [
    {
      id: "web",
      kind: "setup.service",
      data: { name: "web", dependsOn: "cache" },
      evidence: [{ file: "compose.yaml", line: 2 }],
    },
    {
      id: "cache",
      kind: "setup.service",
      data: { name: "cache" },
      evidence: [{ file: "compose.yaml", line: 6 }],
    },
    {
      id: "mapping",
      kind: "setup.port",
      data: { service: "web", hostPort: "4100", containerPort: "4100" },
      evidence: [{ file: "compose.yaml", line: 4 }],
    },
    {
      id: "default",
      kind: "setup.port",
      data: { defaultPort: "5100", variable: "PORT" },
      evidence: [{ file: "src/main.ts", line: 3 }],
    },
    {
      id: "built",
      kind: "setup.requirement",
      data: { type: "builtOutput", service: "web" },
      evidence: [{ file: "compose.yaml", line: 5 }],
    },
  ]);
  expect(guide).toContain("web depends on cache");
  expect(guide).toContain("Compose maps web host 4100 to container 4100");
  expect(guide).not.toContain("app dependencies include");
});

it("asks about saves on a possible path without pairing an earlier throwing branch", () => {
  const guide = renderOnboardingGuide(model, [
    ...findings,
    {
      id: "trace",
      kind: "application.route-trace",
      data: {
        routeFindingId: "route",
        handler: "DebtController.create",
        serviceMethod: "DebtService.create",
        gaps: [],
        operations: [
          {
            kind: "call",
            category: "repository",
            target: "DebtRepository",
            method: "save",
            awaited: true,
            conditional: "when expired",
            evidence: [{ file: "service.ts", line: 10 }],
          },
          {
            kind: "call",
            category: "repository",
            target: "DebtRepository",
            method: "save",
            awaited: true,
            evidence: [{ file: "service.ts", line: 20 }],
          },
          {
            kind: "call",
            category: "repository",
            target: "DebtRepository",
            method: "save",
            awaited: true,
            conditional: "when accepted",
            evidence: [{ file: "service.ts", line: 30 }],
          },
        ],
      },
      evidence: [
        { file: "controller.ts", line: 4 },
        { file: "service.ts", line: 5 },
      ],
    },
  ]);
  expect(guide).toContain("`service.ts:20`, `service.ts:30`");
  expect(guide).not.toContain("`service.ts:20`, `service.ts:10`");
});

it("does not ask partial-outcome questions for mutually exclusive saves or uncaught calls", () => {
  const unrelated: ProjectModel = {
    ...model,
    candidateFlows: [
      {
        ...model.candidateFlows[0]!,
        id: "flow:orders",
        title: "Order update",
        entryPoints: ["PATCH /orders/:id"],
        sourceFindingIds: ["orders-route"],
      },
    ],
  };
  const guide = renderOnboardingGuide(unrelated, [
    {
      id: "orders-trace",
      kind: "application.route-trace",
      data: {
        routeFindingId: "orders-route",
        handler: "OrderController.update",
        serviceMethod: "OrderService.update",
        gaps: [],
        operations: [
          {
            kind: "call",
            category: "repository",
            target: "OrderRepository",
            method: "save",
            awaited: true,
            conditional: "when approved",
            evidence: [{ file: "src/orders.ts", line: 10 }],
          },
          {
            kind: "call",
            category: "repository",
            target: "OrderRepository",
            method: "save",
            awaited: true,
            conditional: "when rejected",
            evidence: [{ file: "src/orders.ts", line: 20 }],
          },
          {
            kind: "call",
            category: "service",
            target: "MessageService",
            method: "send",
            catchDepth: 0,
            evidence: [{ file: "src/orders.ts", line: 30 }],
          },
        ],
      },
      evidence: [
        { file: "src/orders.controller.ts", line: 4 },
        { file: "src/orders.ts", line: 5 },
      ],
    },
  ]);
  expect(guide).not.toContain("partial state");
  expect(guide).not.toContain("If that call fails");
});

it("ranks a source-rich route without using payment or consent vocabulary", () => {
  const routes = ["create", "approve", "decide", "verify-email"].map(
    (action) => ({
      ...model.candidateFlows[0]!,
      id: `order-${action}`,
      title: `Order ${action}`,
      entryPoints: [`POST /orders/${action}`],
      sourceFindingIds: [`route-${action}`],
    }),
  );
  const richTrace = (action: string): Finding => ({
    id: `rich-${action}`,
    kind: "application.route-trace",
    data: {
      routeFindingId: `route-${action}`,
      handler: `OrderController.${action}`,
      serviceMethod: `OrderService.${action}`,
      gaps: [],
      operations: Array.from({ length: 12 }, (_, index) => ({
        kind: "guard",
        condition: `check${index}`,
        evidence: [{ file: "src/orders.ts", line: index + 1 }],
      })),
    },
    evidence: [
      { file: "src/orders.controller.ts", line: 1 },
      { file: "src/orders.ts", line: 1 },
    ],
  });
  const guide = renderOnboardingGuide({ ...model, candidateFlows: routes }, [
    richTrace("decide"),
    richTrace("verify-email"),
  ]);
  const candidates = guide
    .split("## Candidate flows\n")[1]!
    .split("## Setup and operations")[0]!;
  expect(candidates).toContain("### Order decide");
  expect(candidates).not.toContain("### Order create");
  expect(candidates).not.toContain("### Order verify-email");
});
