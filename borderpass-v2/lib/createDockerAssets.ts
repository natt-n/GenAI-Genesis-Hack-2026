import { renderDockerfile } from "./renderDockerFile";
import type { BuildPlan } from "./generateBuildPlan";

type Feature = {
  id: string;
  name: string;
  description?: string;
  routes?: string[];
  roles?: string[];
};

type PaletteControl = {
  id: string;
  feature_id?: string;
  feature_ids?: string[];
  group?: string;
  type: "select" | "slider" | "toggle";
  label: string;
  description?: string;
  options?: string[];
  min?: number;
  max?: number;
  default_value?: any;
};

type Dependency = {
  id?: string;
  name?: string;
  kind?: string;
  mode?: string;
  evidence?: string[];
  env_vars?: string[];
  notes?: string;
};

function needsMockServer(dependencies: Dependency[] = []) {
  if (!dependencies.length) return true;

  return dependencies.some(
    (dep) => dep.mode === "mock" || dep.mode === "emulated"
  );
}

function hasPostgres(dependencies: Dependency[] = []) {
  return dependencies.some(
    (dep) =>
      dep.kind === "database" && /postgres|postgresql/i.test(dep.name || "")
  );
}

function hasRedis(dependencies: Dependency[] = []) {
  return dependencies.some(
    (dep) => dep.kind === "cache" && /redis/i.test(dep.name || "")
  );
}

function buildEnvFile(input: {
  port: number;
  selectedFeatureIds: string[];
  paletteValues: Record<string, any>;
}) {
  return [
    `PORT=${input.port}`,
    `NODE_ENV=production`,
    `SANDBOX_MODE=mock`,
    `SANDBOX_FEATURES_JSON=${JSON.stringify(input.selectedFeatureIds)}`,
    `SANDBOX_PALETTE_JSON=${JSON.stringify(input.paletteValues)}`,
  ].join("\n");
}

function renderComposeFile(input: {
  port: number;
  dependencies?: Dependency[];
  selectedFeatureIds: string[];
  paletteValues: Record<string, any>;
}) {
  const deps = input.dependencies ?? [];
  const postgres = hasPostgres(deps);
  const redis = hasRedis(deps);
  const mockServer = needsMockServer(deps);

  const appDependsOn = [
    postgres ? "postgres" : null,
    redis ? "redis" : null,
    mockServer ? "mock-server" : null,
  ].filter(Boolean) as string[];

  const featureJson = JSON.stringify(input.selectedFeatureIds);
  const paletteJson = JSON.stringify(input.paletteValues);

  return [
    `services:`,
    `  app:`,
    `    build:`,
    `      context: .`,
    `      dockerfile: Dockerfile`,
    `    ports:`,
    `      - "${input.port}:${input.port}"`,
    `    environment:`,
    `      PORT: ${input.port}`,
    `      SANDBOX_MODE: mock`,
    `      SANDBOX_FEATURES_JSON: '${featureJson}'`,
    `      SANDBOX_PALETTE_JSON: '${paletteJson}'`,
    postgres
      ? `      DATABASE_URL: postgres://sandbox:sandbox@postgres:5432/sandboxdb`
      : null,
    redis ? `      REDIS_URL: redis://redis:6379` : null,
    mockServer ? `      MOCK_SERVER_URL: http://mock-server:4010` : null,
    appDependsOn.length
      ? `    depends_on:\n${appDependsOn.map((s) => `      - ${s}`).join("\n")}`
      : null,

    mockServer
      ? [
          `  mock-server:`,
          `    image: node:20-alpine`,
          `    working_dir: /app`,
          `    command: sh -c "node /app/server.js"`,
          `    ports:`,
          `      - "4010:4010"`,
          `    volumes:`,
          `      - ./sandbox:/app`,
        ].join("\n")
      : null,

    postgres
      ? [
          `  postgres:`,
          `    image: postgres:16`,
          `    environment:`,
          `      POSTGRES_USER: sandbox`,
          `      POSTGRES_PASSWORD: sandbox`,
          `      POSTGRES_DB: sandboxdb`,
          `    ports:`,
          `      - "5433:5432"`,
        ].join("\n")
      : null,

    redis
      ? [
          `  redis:`,
          `    image: redis:7`,
          `    ports:`,
          `      - "6380:6379"`,
        ].join("\n")
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderMockServerFile(input: {
  selectedFeatures: Feature[];
  paletteValues: Record<string, any>;
  mockManifest: Record<string, any>;
}) {
  const seedData = JSON.stringify(input.mockManifest.seedData ?? {}, null, 2);
  const features = JSON.stringify(input.selectedFeatures, null, 2);
  const controls = JSON.stringify(input.paletteValues, null, 2);

  return `const http = require("http");

const PORT = 4010;
const seedData = ${seedData};
const enabledFeatures = ${features};
const controls = ${controls};

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    return json(res, 200, { ok: true, service: "mock-server" });
  }

  if (req.url === "/sandbox/config") {
    return json(res, 200, {
      mode: "mock",
      enabledFeatures,
      controls,
      seedData,
    });
  }

  if (req.url === "/api/demo/users") {
    const count = Number(seedData.userCount || 8);
    const users = Array.from({ length: count }).map((_, i) => ({
      id: i + 1,
      name: \`Demo User \${i + 1}\`,
      role: i === 0 ? "Admin" : "Member",
      region: seedData.region || "ca",
    }));

    return json(res, 200, { users });
  }

  return json(res, 404, {
    error: "Not found",
    path: req.url,
  });
});

server.listen(PORT, () => {
  console.log(\`Mock server listening on \${PORT}\`);
});
`;
}

export async function createDockerAssets(input: {
  buildPlan: BuildPlan;
  selectedFeatures: Feature[];
  selectedFeatureIds: string[];
  paletteValues: Record<string, any>;
  controls?: PaletteControl[];
  mockManifest: Record<string, any>;
  dependencies?: Dependency[];
}) {
  const dockerfile = renderDockerfile(input.buildPlan);
  const composeFile = renderComposeFile({
    port: input.buildPlan.port || 3000,
    dependencies: input.dependencies ?? [],
    selectedFeatureIds: input.selectedFeatureIds,
    paletteValues: input.paletteValues,
  });

  const envFile = buildEnvFile({
    port: input.buildPlan.port || 3000,
    selectedFeatureIds: input.selectedFeatureIds,
    paletteValues: input.paletteValues,
  });

  const seedFiles = [
    {
      path: "sandbox/mock-manifest.json",
      content: JSON.stringify(input.mockManifest, null, 2),
    },
    {
      path: "sandbox/server.js",
      content: renderMockServerFile({
        selectedFeatures: input.selectedFeatures,
        paletteValues: input.paletteValues,
        mockManifest: input.mockManifest,
      }),
    },
    {
      path: "sandbox/.env.sandbox",
      content: envFile,
    },
  ];

  return {
    dockerfile,
    composeFile,
    envFile,
    mockManifest: input.mockManifest,
    seedFiles,
  };
}
