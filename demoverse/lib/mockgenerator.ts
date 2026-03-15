import OpenAI from "openai";
import type { DockerSandboxAnalysis, ExternalDependencyMock } from "@/lib/aiForDocker";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "test",
  baseURL: process.env.OPENAI_BASE_URL,
});

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------
export interface EnvMock {
  key: string;
  value: string;
  comment: string;
}

export interface SeedFile {
  filename: string;    // e.g. "seed.sql", "fixtures.json"
  content: string;     // full file content as a string
  mountPath: string;   // where it lands inside the container
}

export interface StubRoute {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  statusCode: number;
  responseBody: string; // JSON string
}

export interface ServiceMock {
  dependencyId: string;
  type: ExternalDependencyMock["type"];
  service: string;
  orm: ExternalDependencyMock["orm"]; // passed through so dockerfileGenerator has it
  envOverrides: EnvMock[];
  seedFiles: SeedFile[];
  stubRoutes: StubRoute[];
  composeServiceName: string | null;
  notes: string;
}

export interface MockPlan {
  appName: string;
  repo: string;
  serviceMocks: ServiceMock[];
  // Flat deduplicated list across all mocks — used by dockerfileGenerator
  // to write the ENV block and .env.sandbox file without re-iterating.
  allEnvOverrides: EnvMock[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildDependencySummary(deps: ExternalDependencyMock[]): string {
  return deps
    .map(
      (d) =>
        `- id: ${d.id}
  type: ${d.type}
  service: ${d.service}
  orm: ${d.orm ?? "none"}
  reason: ${d.reason}
  mockStrategy: ${d.mockStrategy}
  envVars: ${d.envVars.join(", ")}`
    )
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export interface GenerateMockPlanOptions {
  /** User's palette choices (e.g. user_count=5, invoice_status=sent) — tailor seed data and stubs to these. */
  paletteValues?: Record<string, string | number | boolean>;
}

export async function generateMockPlan(
  analysis: DockerSandboxAnalysis,
  options?: GenerateMockPlanOptions
): Promise<MockPlan> {
  const { externalDependencies, summary } = analysis;
  const paletteValues = options?.paletteValues;

  if (externalDependencies.length === 0) {
    return {
      appName: summary.repo.split("/")[1] ?? summary.repo,
      repo: summary.repo,
      serviceMocks: [],
      allEnvOverrides: [],
    };
  }

  const paletteSection =
    paletteValues && Object.keys(paletteValues).length > 0
      ? `\nUSER PALETTE CHOICES (tailor seed data and stub responses to these):\n${Object.entries(paletteValues)
          .map(([k, v]) => `  ${k}: ${v}`)
          .join("\n")}\n`
      : "";

  const response = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    max_tokens: 6000,
    messages: [
      {
        role: "system",
        content:
          "You are a sandbox infrastructure engineer. You generate realistic mock data, seed files, and HTTP stub configurations for demo sandboxes. You always respond with valid JSON only — no markdown, no explanation.",
      },
      {
        role: "user",
        content: `Generate a complete mock plan for this repo's sandbox environment.
${paletteSection}
REPO: ${summary.repo}
BRANCH: ${summary.branch}
FRAMEWORKS: ${summary.frameworks.join(", ")}

EXTERNAL DEPENDENCIES TO MOCK:
${buildDependencySummary(externalDependencies)}

For each dependency, produce a serviceMock entry. Rules per type:

DATABASE (postgres / mysql / mongodb / sqlite):
- envOverrides: set DATABASE_URL / MONGODB_URI to point at a local container
  e.g. postgres://postgres:sandbox@localhost:5432/sandboxdb
- seedFiles: produce a realistic SQL or JSON seed file with 10-20 rows of synthetic data
  that fits what this kind of app would store. Infer from repo name and frameworks.
  Use realistic names, emails, dates — never "Lorem Ipsum" or "John Doe".
  For postgres/mysql: filename "seed.sql", mountPath "/docker-entrypoint-initdb.d/seed.sql"
  For mongodb: filename "seed.json", mountPath "/docker-entrypoint-initdb.d/seed.json"
  For sqlite: filename "seed.db.sql" (applied at build time)
- If orm is "prisma": do NOT include seed SQL — Prisma manages its own schema.
  Instead set seedFiles to [] and note that prisma db seed will handle data.
- stubRoutes: []
- composeServiceName: "postgres" | "mysql" | "mongodb" as appropriate

CACHE (redis):
- envOverrides: REDIS_URL=redis://localhost:6379
- seedFiles: []
- stubRoutes: []
- composeServiceName: "redis"

QUEUE (bullmq / rabbitmq / kafka):
- envOverrides: point at local container
- seedFiles: []
- stubRoutes: []
- composeServiceName: "redis" for bullmq, "rabbitmq" for rabbitmq, "redpanda" for kafka

AUTH (auth0 / nextauth / clerk / supabase / firebase / lucia):
- envOverrides: inject fake secrets and a sandbox issuer URL
  e.g. AUTH0_DOMAIN=sandbox.auth0.local, NEXTAUTH_SECRET=sandbox-secret-not-real
- seedFiles: if auth system needs a users table, include seed SQL with 3 demo users
  (admin, manager, viewer) with bcrypt-hashed sandbox passwords
- stubRoutes: for OAuth providers stub the token and userinfo endpoints
- composeServiceName: null

PAYMENTS (stripe / lemonsqueezy / paddle):
- envOverrides: obviously fake test/sandbox keys e.g. sk_test_SANDBOX000000
- seedFiles: []
- stubRoutes: stub the key payment API endpoints with realistic fixture responses
  e.g. POST /v1/payment_intents → fixture PaymentIntent, GET /v1/customers/:id → fixture Customer
- composeServiceName: null

EMAIL (sendgrid / resend / nodemailer / smtp):
- envOverrides: SMTP_HOST=mailpit, SMTP_PORT=1025, plus any provider API key as sandbox value
- seedFiles: []
- stubRoutes: []
- composeServiceName: "mailpit"

SMS (twilio):
- envOverrides: TWILIO_ACCOUNT_SID=ACsandbox00000000000000000000000
- seedFiles: []
- stubRoutes: stub POST /2010-04-01/Accounts/:sid/Messages with fixture MessageInstance
- composeServiceName: null

STORAGE (aws-s3 / minio / cloudinary / uploadthing):
- envOverrides: for S3/MinIO point at local MinIO; for others use sandbox keys
- seedFiles: []
- stubRoutes: for cloudinary/uploadthing stub the upload endpoint
- composeServiceName: "minio" for S3-compatible, null for others

AI (openai / anthropic / replicate / huggingface):
- envOverrides: OPENAI_API_KEY=sk-sandbox-not-real, OPENAI_BASE_URL=http://localhost:4010
- seedFiles: []
- stubRoutes: stub key inference endpoints with deterministic fixture responses
  POST /v1/chat/completions → fixture ChatCompletion with a canned helpful answer
  POST /v1/embeddings → fixture embedding array (1536 zeros)
  POST /v1/completions → fixture text completion
- composeServiceName: null

ANALYTICS (segment / posthog / mixpanel):
- envOverrides: obviously sandbox values
- seedFiles: []
- stubRoutes: stub track/identify endpoints returning 200 OK
- composeServiceName: null

SEARCH (algolia / elasticsearch / typesense):
- envOverrides: point at local container or sandbox app keys
- seedFiles: JSON fixture file with 10-20 realistic search index records
- stubRoutes: for algolia stub POST /1/indexes/:name/query
- composeServiceName: "elasticsearch" | "typesense" as appropriate

Return exactly this JSON structure:
{
  "appName": "inferred product name from repo",
  "repo": "${summary.repo}",
  "serviceMocks": [
    {
      "dependencyId": "matches dependency id above",
      "type": "the type value from above",
      "service": "service display name",
      "orm": "prisma | drizzle | typeorm | sequelize | sqlalchemy | mongoose | null",
      "envOverrides": [
        { "key": "ENV_VAR_NAME", "value": "sandbox-value", "comment": "brief explanation" }
      ],
      "seedFiles": [
        {
          "filename": "seed.sql",
          "content": "-- full file content here",
          "mountPath": "/docker-entrypoint-initdb.d/seed.sql"
        }
      ],
      "stubRoutes": [
        {
          "method": "POST",
          "path": "/v1/chat/completions",
          "statusCode": 200,
          "responseBody": "{}"
        }
      ],
      "composeServiceName": "postgres",
      "notes": "one sentence describing what was mocked and how"
    }
  ]
}

Rules:
- If USER PALETTE CHOICES are provided, use them to tailor seed data (e.g. record counts, status values, toggles) and stub responses so the demo matches the user's choices.
- Seed data must be realistic and specific — infer from repo name and frameworks
- Every envOverride value must be obviously fake (contain "sandbox", "test", "local", or "mock")
- stubRoutes responseBody must be a valid JSON string (properly escaped)
- Never include real API keys, secrets, or production URLs
- Return ONLY valid JSON`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "";

  function stripControlChars(str: string): string {
    return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  }

  function preprocess(text: string): string {
    let s = stripControlChars(text).trim();
    s = s.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/gm, "").trim();
    const firstBrace = s.indexOf("{");
    if (firstBrace !== -1) {
      let depth = 0;
      for (let i = firstBrace; i < s.length; i++) {
        const c = s[i];
        if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) {
            s = s.slice(firstBrace, i + 1);
            break;
          }
        }
      }
    }
    return s.replace(/,(\s*[}\]])/g, "$1");
  }

  /** On "Unterminated string", truncate at position and try to close the JSON. */
  function tryRecoverUnterminated(s: string, err: Error): Omit<MockPlan, "allEnvOverrides"> | null {
    const match = err.message.match(/position (\d+)/);
    if (!match) return null;
    const pos = Math.min(parseInt(match[1], 10), s.length);
    const truncated = s.slice(0, pos);
    const closeString = '"';

    function tryParse(suffix: string): Omit<MockPlan, "allEnvOverrides"> | null {
      try {
        const parsed = JSON.parse(truncated + suffix) as Omit<MockPlan, "allEnvOverrides">;
        return parsed && Array.isArray(parsed.serviceMocks) ? parsed : null;
      } catch {
        return null;
      }
    }

    // Order 1: ] then } (e.g. inside array then object)
    for (let ij = 0; ij <= 20; ij++) {
      for (let j = 1; j <= 20; j++) {
        const r = tryParse(closeString + "]".repeat(ij) + "}".repeat(j));
        if (r) return r;
      }
    }
    // Order 2: } then ] alternating (e.g. inside object "value": "" then } ] } ] } to close object, array, object, array, root)
    for (let len = 1; len <= 25; len++) {
      let suffix = closeString;
      let next: "}" | "]" = "}";
      for (let i = 0; i < len; i++) {
        suffix += next;
        next = next === "}" ? "]" : "}";
      }
      const r = tryParse(suffix);
      if (r) return r;
    }
    // Order 3: } only then ] only
    for (let j = 1; j <= 20; j++) {
      for (let ij = 0; ij <= 20; ij++) {
        const r = tryParse(closeString + "}".repeat(j) + "]".repeat(ij));
        if (r) return r;
      }
    }
    return null;
  }

  let parsed: Omit<MockPlan, "allEnvOverrides">;
  try {
    parsed = JSON.parse(preprocess(raw)) as Omit<MockPlan, "allEnvOverrides">;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const preprocessed = preprocess(raw);
    const recovered = tryRecoverUnterminated(preprocessed, err);
    if (recovered !== null) {
      parsed = recovered;
    } else {
      throw new Error("mockGenerator returned invalid JSON: " + raw.slice(0, 300) + " — " + err.message);
    }
  }

  if (!parsed.serviceMocks || !Array.isArray(parsed.serviceMocks)) {
    parsed.serviceMocks = [];
  }
  // Sanitize partial mocks (e.g. envOverrides may be incomplete)
  parsed.serviceMocks = parsed.serviceMocks.map((m) => ({
    ...m,
    envOverrides: Array.isArray(m.envOverrides) ? m.envOverrides.filter((e) => e && typeof e.key === "string") : [],
    seedFiles: Array.isArray(m.seedFiles) ? m.seedFiles : [],
    stubRoutes: Array.isArray(m.stubRoutes) ? m.stubRoutes : [],
  }));

  // Build flat deduplicated env list for dockerfileGenerator
  const seen = new Set<string>();
  const allEnvOverrides: EnvMock[] = [];
  for (const mock of parsed.serviceMocks) {
    for (const env of mock.envOverrides) {
      if (env.value !== undefined && typeof env.value === "string" && !seen.has(env.key)) {
        seen.add(env.key);
        allEnvOverrides.push({ key: env.key, value: env.value, comment: env.comment || "" });
      }
    }
  }

  return { ...parsed, allEnvOverrides };
}