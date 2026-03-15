import OpenAI from "openai";
import type { DockerSandboxAnalysis } from "@/lib/aiForDocker";
import type { MockPlan, ServiceMock } from "@/lib/mockgenerator";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "test",
  baseURL: process.env.OPENAI_BASE_URL,
});

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------
export interface DockerfileArtifact {
  dockerfile: string;
  dockerCompose: string | null;
  envSandbox: string;
  entrypointSh: string | null;
  seedFiles: { filename: string; content: string; mountPath: string }[];
  summary: {
    baseImage: string;
    exposedPort: number;
    composeServices: string[];
    needsMigrations: boolean;
    needsSeedData: boolean;
    migrationCommand: string | null;
    codeSandboxReady: boolean;
    notes: string[];
  };
}

// ---------------------------------------------------------------------------
// Prompt section builders — use the explicit fields added in the Gap 3 fix
// ---------------------------------------------------------------------------
function buildRuntimeSection(analysis: DockerSandboxAnalysis): string {
  const { runtime, containerization } = analysis;
  return `RUNTIME:
  repo name: ${runtime.repoName}
  workdir: ${runtime.workdir}
  languages: ${runtime.languages.join(", ")}
  base images: ${containerization.recommendedBaseImages.join(", ")}
  install: ${runtime.installCommands.join(" && ") || "none"}
  build: ${runtime.buildCommands.join(" && ") || "none"}
  start: ${runtime.startCommands.join(" && ") || "MISSING — use framework default"}
  ports: ${runtime.ports.join(", ")}
  multi-stage build needed: ${containerization.needsMultiStageBuild}
  compose needed: ${containerization.needsCompose}
  existing docker artifacts: ${containerization.existingDockerArtifacts.join(", ") || "none"}`;
}

function buildMockSection(mockPlan: MockPlan): string {
  if (mockPlan.serviceMocks.length === 0) return "MOCK SERVICES: none";

  const sections = mockPlan.serviceMocks.map((m: ServiceMock) => {
    const compose = m.composeServiceName
      ? `compose service: ${m.composeServiceName}`
      : "no compose service";
    const stubs =
      m.stubRoutes.length > 0
        ? `stub routes: ${m.stubRoutes.map((r) => `${r.method} ${r.path}`).join(", ")}`
        : "no HTTP stubs";
    const seeds =
      m.seedFiles.length > 0
        ? `seed files: ${m.seedFiles.map((f) => f.filename).join(", ")}`
        : "no seed files";
    const ormNote = m.orm ? `orm: ${m.orm}` : "";
    return `- ${m.service} (${m.type})${ormNote ? " [" + ormNote + "]" : ""}: ${m.notes}
    ${compose} | ${stubs} | ${seeds}`;
  });

  return `MOCK SERVICES:\n${sections.join("\n")}`;
}

function buildEnvSection(mockPlan: MockPlan): string {
  if (mockPlan.allEnvOverrides.length === 0) return "ENV VARS: none";
  return `ENV VARS TO INJECT:\n${mockPlan.allEnvOverrides
    .map((e) => `  ${e.key}=${e.value}  # ${e.comment}`)
    .join("\n")}`;
}

function buildComposeServiceNames(mockPlan: MockPlan): string[] {
  return [
    ...new Set(
      mockPlan.serviceMocks
        .map((m) => m.composeServiceName)
        .filter((s): s is string => s !== null)
    ),
  ];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function generateDockerfiles(
  analysis: DockerSandboxAnalysis,
  mockPlan: MockPlan
): Promise<DockerfileArtifact> {
  const composeServices = buildComposeServiceNames(mockPlan);
  const needsCompose = analysis.containerization.needsCompose || composeServices.length > 0;
  const needsMigrations = analysis.mockPlan.shouldMockDatabase;

  // Gap 1 + 3 fix: use the pre-computed migrationCommand from aiForDocker
  // instead of having the LLM guess it from context.
  const migrationCommand = analysis.mockPlan.migrationCommand;

  const hasSeedFiles = mockPlan.serviceMocks.some((m) => m.seedFiles.length > 0);

  const response = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    max_tokens: 6000,
    messages: [
      {
        role: "system",
        content:
          "You are a Docker infrastructure engineer specialising in demo sandbox environments. You always respond with valid JSON only — no markdown, no explanation.",
      },
      {
        role: "user",
        content: `Generate all Docker artifacts for this sandbox environment.

REPO: ${mockPlan.repo}
APP: ${mockPlan.appName}

${buildRuntimeSection(analysis)}

${buildMockSection(mockPlan)}

${buildEnvSection(mockPlan)}

COMPOSE SERVICES NEEDED: ${composeServices.join(", ") || "none"}
NEEDS MIGRATIONS AT STARTUP: ${needsMigrations}
MIGRATION COMMAND: ${migrationCommand ?? "none"}
HAS SEED DATA: ${hasSeedFiles}

Generate the following artifacts:

1. DOCKERFILE — production-quality, sandbox-ready. Rules:
   - FROM the recommended base image
   - WORKDIR ${analysis.runtime.workdir}
   - Multi-stage if needsMultiStageBuild is true: builder stage installs + builds, runtime stage copies output
   - COPY package files first, then RUN install (layer cache optimisation)
   - COPY remaining source
   - RUN build command if present
   - All env vars injected via ENV instructions (one per line)
   - If migration command is not "none": COPY entrypoint.sh and set ENTRYPOINT ["sh", "entrypoint.sh"]
   - Otherwise: CMD with the exact start command from RUNTIME above
   - If start command is "MISSING": use the framework-appropriate default
   - EXPOSE the first port from RUNTIME
   - Non-root user: RUN addgroup -S appgroup && adduser -S appuser -G appgroup, then USER appuser
   - HEALTHCHECK: TCP check on the exposed port with 30s interval, 10s timeout, 3 retries
   - .dockerignore-safe: never COPY node_modules, .git, .env, dist before build

2. DOCKER-COMPOSE — only if compose services are needed, otherwise return null. Rules:
   - version: "3.9"
   - "app" service: build: . | ports: expose only the app port | env_file: .env.sandbox
   - depends_on each sidecar with condition: service_healthy
   - One sidecar service per compose service name with correct images:
     postgres → postgres:16-alpine, redis → redis:7-alpine, mongodb → mongo:7,
     mysql → mysql:8, minio → minio/minio, mailpit → axllent/mailpit,
     rabbitmq → rabbitmq:3-management-alpine, redpanda → redpandadata/redpanda,
     elasticsearch → elasticsearch:8.13.0, typesense → typesense/typesense:0.25.2
   - Healthchecks on every sidecar
   - Named volumes for data persistence
   - All services on a bridge network named "sandbox-net"

3. ENV_SANDBOX — full .env.sandbox file content:
   - One KEY=value per line
   - Group by service with a comment header
   - Include every env var from ENV VARS TO INJECT above

4. ENTRYPOINT_SH — only if migration command is not "none". A shell script that:
   - #!/bin/sh
   - set -e
   - Waits for DB readiness using the correct check for the DB type:
     postgres → pg_isready -U postgres -h localhost
     mysql → mysqladmin ping -h localhost
     mongodb → mongosh --eval "db.adminCommand('ping')"
   - Uses a retry loop: up to 30 attempts, 2s sleep between each
   - Runs exactly: ${migrationCommand ?? "(no migration command — set to null)"}
   - exec the start command last so it receives signals correctly

Return exactly this JSON structure:
{
  "dockerfile": "# Dockerfile content with \\n for newlines",
  "dockerCompose": "# docker-compose.yml content, or null",
  "envSandbox": "# .env.sandbox content",
  "entrypointSh": "#!/bin/sh\\n...or null",
  "summary": {
    "baseImage": "node:20-alpine",
    "exposedPort": 3000,
    "composeServices": ["postgres", "redis"],
    "needsMigrations": ${needsMigrations},
    "needsSeedData": ${hasSeedFiles},
    "migrationCommand": ${migrationCommand ? `"${migrationCommand}"` : "null"},
    "codeSandboxReady": true,
    "notes": ["one note per important decision made"]
  }
}

Rules:
- All file contents use \\n for newlines — no actual line breaks inside JSON strings
- dockerfile and envSandbox are always non-null strings
- dockerCompose is null if no compose services are needed
- entrypointSh is null if migrationCommand is "none" or null
- codeSandboxReady is true only if the Dockerfile alone (no compose) can boot the app
- Return ONLY valid JSON`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "";

  let parsed: Omit<DockerfileArtifact, "seedFiles">;
  try {
    parsed = JSON.parse(raw.replace(/^```json\n?|^```\n?|```$/gm, "").trim());
  } catch {
    throw new Error("dockerfileGenerator returned invalid JSON: " + raw.slice(0, 300));
  }

  // Collect seed files from the mock plan so they travel with the artifact
  const seedFiles = mockPlan.serviceMocks.flatMap((m) => m.seedFiles);

  return { ...parsed, seedFiles };
}