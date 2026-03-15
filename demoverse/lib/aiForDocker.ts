import type { DockerRepoContext } from "@/lib/githubDocker";

export interface ExternalDependencyMock {
  id: string;
  type:
    | "database"
    | "cache"
    | "auth"
    | "payments"
    | "email"
    | "sms"
    | "storage"
    | "ai"
    | "queue"
    | "search"
    | "analytics"
    | "third_party_api";
  service: string;
  reason: string;
  mockStrategy: string;
  envVars: string[];
  // Gap 1 fix: ORM name preserved so mockGenerator/dockerfileGenerator can
  // pick the correct migration command (prisma migrate deploy, drizzle-kit push, etc.)
  orm: "prisma" | "drizzle" | "typeorm" | "sequelize" | "sqlalchemy" | "mongoose" | null;
}

export interface DockerSandboxAnalysis {
  summary: {
    repo: string;
    branch: string;
    frameworks: string[];
    packageManagers: string[];
  };
  runtime: {
    languages: string[];
    installCommands: string[];
    buildCommands: string[];
    startCommands: string[];
    ports: number[];
    // Gap 3 fix: explicit fields so dockerfileGenerator never has to infer these
    repoName: string;
    workdir: string;
  };
  containerization: {
    recommendedBaseImages: string[];
    existingDockerArtifacts: string[];
    needsMultiStageBuild: boolean;
    needsCompose: boolean;
  };
  externalDependencies: ExternalDependencyMock[];
  envRequirements: string[];
  mockPlan: {
    shouldMockDatabase: boolean;
    shouldMockCache: boolean;
    shouldMockAuth: boolean;
    shouldMockPayments: boolean;
    shouldMockEmail: boolean;
    shouldMockStorage: boolean;
    shouldMockAI: boolean;
    shouldMockQueue: boolean;
    shouldMockSearch: boolean;
    // Derived from orm fields — tells dockerfileGenerator exactly which
    // migration command to put in entrypoint.sh
    migrationCommand: string | null;
    notes: string[];
  };
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------
function detectLanguages(ctx: DockerRepoContext): string[] {
  const langs = new Set<string>();
  const paths = ctx.tree.map((t) => t.path);

  if (
    paths.some((p) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx")) ||
    ctx.importantFiles["package.json"]
  )
    langs.add("node");

  if (
    paths.some((p) => p.endsWith(".py")) ||
    ctx.importantFiles["requirements.txt"] ||
    ctx.importantFiles["pyproject.toml"]
  )
    langs.add("python");

  if (ctx.importantFiles["Gemfile"]) langs.add("ruby");
  if (ctx.importantFiles["go.mod"]) langs.add("go");
  if (ctx.importantFiles["Cargo.toml"]) langs.add("rust");

  return [...langs];
}

// ---------------------------------------------------------------------------
// Command detection
// ---------------------------------------------------------------------------
function detectNodeCommands(ctx: DockerRepoContext) {
  const pkg = ctx.importantFiles["package.json"];
  if (!pkg) return { install: [] as string[], build: [] as string[], start: [] as string[] };

  const pm = ctx.packageManagers;
  const exec = (cmd: string) =>
    pm.includes("pnpm") ? `pnpm ${cmd}` :
    pm.includes("yarn") ? `yarn ${cmd}` :
    pm.includes("bun")  ? `bun run ${cmd}` :
                          `npm run ${cmd}`;

  const install = pm.includes("pnpm") ? ["pnpm install --frozen-lockfile"] :
                  pm.includes("yarn") ? ["yarn install --frozen-lockfile"] :
                  pm.includes("bun")  ? ["bun install --frozen-lockfile"] :
                                        ["npm ci"];

  const build: string[] = pkg.includes('"build"') ? [exec("build")] : [];

  // Gap 2 fix: explicit fallback chain — check "start" script first, then
  // framework-specific defaults, then a safe generic fallback so startCommands
  // is never empty for a known framework.
  let start: string[] = [];
  if (pkg.includes('"start"')) {
    start.push(exec("start"));
  } else if (ctx.detectedFrameworks.includes("nextjs")) {
    start.push(pm.includes("pnpm") ? "pnpm next start" : pm.includes("yarn") ? "yarn next start" : pm.includes("bun") ? "bun run next start" : "npx next start");
  } else if (ctx.detectedFrameworks.includes("vite")) {
    start.push(exec("preview") + " -- --host 0.0.0.0");
  } else if (ctx.detectedFrameworks.includes("remix")) {
    start.push(exec("start"));
  } else if (ctx.detectedFrameworks.includes("nuxt")) {
    start.push(pm.includes("pnpm") ? "pnpm nuxt start" : pm.includes("yarn") ? "yarn nuxt start" : "npx nuxt start");
  } else if (ctx.detectedFrameworks.includes("express") || ctx.detectedFrameworks.includes("fastify") || ctx.detectedFrameworks.includes("hono")) {
    // Generic node entrypoint fallback for server frameworks
    const entryPoint = ctx.possibleEntryPoints.find((e) =>
      ["server.js", "server.ts", "index.js", "index.ts", "src/index.js", "src/index.ts"].includes(e)
    );
    if (entryPoint) start.push(`node ${entryPoint.replace(/\.ts$/, ".js")}`);
  }

  return { install, build, start };
}

function detectPythonCommands(ctx: DockerRepoContext) {
  const install: string[] = [];
  const start: string[] = [];

  if (ctx.importantFiles["requirements.txt"])
    install.push("pip install --no-cache-dir -r requirements.txt");
  else if (ctx.importantFiles["Pipfile"])
    install.push("pipenv install --deploy");
  else if (ctx.importantFiles["pyproject.toml"])
    install.push("pip install --no-cache-dir .");

  if (ctx.detectedFrameworks.includes("django"))
    start.push("python manage.py runserver 0.0.0.0:8000");
  else if (ctx.detectedFrameworks.includes("flask"))
    start.push("flask run --host=0.0.0.0 --port=8000");
  else if (ctx.detectedFrameworks.includes("fastapi"))
    start.push("uvicorn main:app --host 0.0.0.0 --port 8000");

  return { install, build: [] as string[], start };
}

function detectGoCommands(ctx: DockerRepoContext) {
  if (!ctx.importantFiles["go.mod"]) return { install: [], build: [], start: [] };
  return { install: [], build: ["go build -o /app/server ./..."], start: ["/app/server"] };
}

function detectPorts(ctx: DockerRepoContext): number[] {
  const ports = new Set<number>();
  const fw = ctx.detectedFrameworks;

  if (fw.some((f) => ["nextjs", "react", "express", "nestjs", "rails", "fastify", "hono", "remix", "nuxt"].includes(f)))
    ports.add(3000);
  if (fw.includes("vite")) ports.add(5173);
  if (fw.some((f) => ["django", "flask", "fastapi"].includes(f))) ports.add(8000);
  if (fw.includes("go")) ports.add(8080);

  const portMatches = JSON.stringify(ctx.importantFiles).matchAll(/port['":\s]+(\d{4,5})/gi);
  for (const m of portMatches) {
    const p = parseInt(m[1]);
    if (p >= 1024 && p <= 65535) ports.add(p);
  }

  if (ports.size === 0) ports.add(3000);
  return [...ports];
}

// ---------------------------------------------------------------------------
// ORM detection helper — returns the highest-priority ORM found in hints
// Priority order matches how likely each is to have a migration CLI command
// ---------------------------------------------------------------------------
function detectOrm(
  h: Set<string>
): ExternalDependencyMock["orm"] {
  if (h.has("prisma")) return "prisma";
  if (h.has("drizzle")) return "drizzle";
  if (h.has("typeorm")) return "typeorm";
  if (h.has("sequelize")) return "sequelize";
  if (h.has("sqlalchemy")) return "sqlalchemy";
  if (h.has("mongoose")) return "mongoose";
  return null;
}

// ---------------------------------------------------------------------------
// Migration command — derived from ORM + language so entrypoint.sh is exact
// ---------------------------------------------------------------------------
function deriveMigrationCommand(
  orm: ExternalDependencyMock["orm"],
  frameworks: string[]
): string | null {
  if (orm === "prisma") return "npx prisma migrate deploy";
  if (orm === "drizzle") return "npx drizzle-kit push";
  if (orm === "typeorm") return "npx typeorm migration:run -d dist/data-source.js";
  if (orm === "sequelize") return "npx sequelize-cli db:migrate";
  if (orm === "sqlalchemy") return "flask db upgrade"; // alembic via flask-migrate
  if (orm === "mongoose") return null; // MongoDB schema-less, no migration needed
  // No ORM detected but DB is present — fall back to framework-level migration
  if (frameworks.includes("django")) return "python manage.py migrate";
  if (frameworks.includes("rails")) return "bundle exec rails db:migrate";
  return null;
}

// ---------------------------------------------------------------------------
// External dependency inference — driven entirely by ctx.serviceHints
// ---------------------------------------------------------------------------
function inferExternalDependencies(ctx: DockerRepoContext): ExternalDependencyMock[] {
  const h = new Set(ctx.serviceHints);
  const deps: ExternalDependencyMock[] = [];
  const add = (d: ExternalDependencyMock) => deps.push(d);

  // --- Databases ---
  if (h.has("postgres") || h.has("prisma") || h.has("drizzle") || h.has("planetscale") || h.has("neon") || h.has("typeorm") || h.has("sequelize")) {
    add({
      id: "postgres",
      type: "database",
      service: h.has("planetscale") ? "PlanetScale" : h.has("neon") ? "Neon (Postgres)" : "PostgreSQL",
      reason: "Repo references a relational database (Postgres/Prisma/Drizzle/PlanetScale/Neon).",
      mockStrategy: "Run a seeded local Postgres container. Apply migrations at startup via an entrypoint script.",
      envVars: ["DATABASE_URL", "POSTGRES_URL", "DIRECT_URL", "POSTGRES_PRISMA_URL"],
      orm: detectOrm(h),
    });
  }

  if (h.has("mongodb") || h.has("mongoose")) {
    add({
      id: "mongodb",
      type: "database",
      service: "MongoDB",
      reason: "Repo references MongoDB or Mongoose.",
      mockStrategy: "Run a local MongoDB container preloaded with fixture documents.",
      envVars: ["MONGODB_URI", "MONGODB_URL", "DATABASE_URL"],
      orm: "mongoose",
    });
  }

  if (h.has("mysql")) {
    add({
      id: "mysql",
      type: "database",
      service: "MySQL",
      reason: "Repo references MySQL drivers or configuration.",
      mockStrategy: "Run a local MySQL container with seeded synthetic data.",
      envVars: ["DATABASE_URL", "MYSQL_URL"],
      orm: detectOrm(h),
    });
  }

  if (h.has("sqlite")) {
    add({
      id: "sqlite",
      type: "database",
      service: "SQLite",
      reason: "Repo uses SQLite — file-based, no separate container needed.",
      mockStrategy: "Bake a pre-seeded .db file into the Docker image.",
      envVars: ["DATABASE_URL"],
      orm: detectOrm(h),
    });
  }

  // --- Cache / Queues ---
  if (h.has("redis")) {
    add({
      id: "redis",
      type: "cache",
      service: "Redis",
      reason: "Repo uses Redis for cache, sessions, or queue backend.",
      mockStrategy: "Run a local Redis container. For queue use, add a no-op worker that drains jobs immediately.",
      envVars: ["REDIS_URL", "REDIS_HOST", "REDIS_PORT"],
      orm: null,
    });
  }

  if (h.has("bullmq")) {
    add({
      id: "bullmq",
      type: "queue",
      service: "BullMQ",
      reason: "Repo uses BullMQ for background job processing.",
      mockStrategy: "Run Redis + a sandbox worker that processes jobs synchronously and logs output.",
      envVars: ["REDIS_URL"],
      orm: null,
    });
  }

  if (h.has("rabbitmq")) {
    add({
      id: "rabbitmq",
      type: "queue",
      service: "RabbitMQ",
      reason: "Repo uses RabbitMQ / AMQP for messaging.",
      mockStrategy: "Run a local RabbitMQ container with a no-op consumer that acks all messages.",
      envVars: ["RABBITMQ_URL", "AMQP_URL"],
      orm: null,
    });
  }

  if (h.has("kafka")) {
    add({
      id: "kafka",
      type: "queue",
      service: "Kafka",
      reason: "Repo references Kafka for event streaming.",
      mockStrategy: "Run a local Redpanda container (single-node, Kafka-compatible).",
      envVars: ["KAFKA_BROKER", "KAFKA_BROKERS"],
      orm: null,
    });
  }

  // --- Auth ---
  if (h.has("auth0")) {
    add({
      id: "auth0",
      type: "auth",
      service: "Auth0",
      reason: "Repo uses Auth0 for authentication.",
      mockStrategy: "Inject a sandbox JWT with demo user claims. Bypass middleware via SANDBOX_AUTH=true env var.",
      envVars: ["AUTH0_DOMAIN", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_AUDIENCE"],
      orm: null,
    });
  }

  if (h.has("nextauth")) {
    add({
      id: "nextauth",
      type: "auth",
      service: "NextAuth.js",
      reason: "Repo uses NextAuth for session management.",
      mockStrategy: "Use the Credentials provider with hardcoded demo users. Set NEXTAUTH_SECRET to a dummy value.",
      envVars: ["NEXTAUTH_SECRET", "NEXTAUTH_URL"],
      orm: null,
    });
  }

  if (h.has("clerk")) {
    add({
      id: "clerk",
      type: "auth",
      service: "Clerk",
      reason: "Repo uses Clerk for auth and user management.",
      mockStrategy: "Use Clerk test-mode keys. Inject a test session token for the demo user.",
      envVars: ["CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      orm: null,
    });
  }

  if (h.has("supabase") || h.has("supabase-auth")) {
    add({
      id: "supabase",
      type: "auth",
      service: "Supabase (Auth + DB)",
      reason: "Repo uses Supabase for auth and/or database.",
      mockStrategy: "Run local Supabase stack via their official Docker Compose, or swap to local Postgres + dummy JWT secret.",
      envVars: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      orm: null,
    });
  }

  if (h.has("firebase") || h.has("firebase-auth")) {
    add({
      id: "firebase",
      type: "auth",
      service: "Firebase",
      reason: "Repo uses Firebase for auth and/or Firestore.",
      mockStrategy: "Use Firebase Local Emulator Suite (auth + firestore) via FIREBASE_EMULATOR=true.",
      envVars: ["FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_PROJECT_ID", "FIREBASE_APP_ID"],
      orm: null,
    });
  }

  if (h.has("lucia")) {
    add({
      id: "lucia",
      type: "auth",
      service: "Lucia Auth",
      reason: "Repo uses Lucia for session-based auth.",
      mockStrategy: "Seed the auth DB with a demo user and session. Runs locally on top of the mocked DB.",
      envVars: ["AUTH_SECRET"],
      orm: null,
    });
  }

  // --- Payments ---
  if (h.has("stripe")) {
    add({
      id: "stripe",
      type: "payments",
      service: "Stripe",
      reason: "Repo integrates Stripe for payments.",
      mockStrategy: "Use Stripe test-mode keys with pre-made test products and prices. Return fixture checkout sessions.",
      envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
      orm: null,
    });
  }

  if (h.has("lemonsqueezy")) {
    add({
      id: "lemonsqueezy",
      type: "payments",
      service: "Lemon Squeezy",
      reason: "Repo integrates Lemon Squeezy for payments.",
      mockStrategy: "Return deterministic fixture checkout URLs and order objects.",
      envVars: ["LEMONSQUEEZY_API_KEY", "LEMONSQUEEZY_WEBHOOK_SECRET"],
      orm: null,
    });
  }

  // --- Email ---
  const emailServices = ["sendgrid", "resend", "nodemailer", "postmark", "mailgun", "smtp"];
  const detectedEmail = emailServices.find((s) => h.has(s));
  if (detectedEmail) {
    add({
      id: "email",
      type: "email",
      service: detectedEmail.charAt(0).toUpperCase() + detectedEmail.slice(1),
      reason: `Repo sends transactional email via ${detectedEmail}.`,
      mockStrategy: "Redirect all outbound email to a local Mailpit SMTP container. No real email is ever sent.",
      envVars: ["SENDGRID_API_KEY", "RESEND_API_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"],
      orm: null,
    });
  }

  // --- SMS ---
  if (h.has("twilio")) {
    add({
      id: "twilio",
      type: "sms",
      service: "Twilio",
      reason: "Repo sends SMS or makes calls via Twilio.",
      mockStrategy: "Log outbound SMS to container stdout. Return a fixture message SID.",
      envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"],
      orm: null,
    });
  }

  // --- Storage ---
  if (h.has("aws-s3") || h.has("minio")) {
    add({
      id: "storage-s3",
      type: "storage",
      service: h.has("minio") ? "MinIO (S3-compatible)" : "AWS S3",
      reason: "Repo uses S3-compatible object storage.",
      mockStrategy: "Run a local MinIO container. Point S3_ENDPOINT at it — no code changes needed.",
      envVars: ["S3_BUCKET", "S3_ENDPOINT", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
      orm: null,
    });
  }

  if (h.has("cloudinary")) {
    add({
      id: "cloudinary",
      type: "storage",
      service: "Cloudinary",
      reason: "Repo uses Cloudinary for image/video management.",
      mockStrategy: "Return fixture CDN URLs. Skip actual upload in sandbox mode via SANDBOX=true.",
      envVars: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
      orm: null,
    });
  }

  if (h.has("uploadthing")) {
    add({
      id: "uploadthing",
      type: "storage",
      service: "UploadThing",
      reason: "Repo uses UploadThing for file uploads.",
      mockStrategy: "Return a fixture signed URL. Store files locally in /tmp inside the container.",
      envVars: ["UPLOADTHING_SECRET", "UPLOADTHING_APP_ID"],
      orm: null,
    });
  }

  // --- AI / LLM ---
  const aiServices = ["openai", "anthropic", "replicate", "huggingface"];
  const detectedAI = aiServices.filter((s) => h.has(s));
  if (detectedAI.length > 0) {
    add({
      id: "ai-llm",
      type: "ai",
      service: detectedAI.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" / "),
      reason: `Repo calls hosted AI inference APIs: ${detectedAI.join(", ")}.`,
      mockStrategy: "Route requests to a local openai-mock stub server. Return deterministic fixture completions.",
      envVars: ["OPENAI_API_KEY", "OPENAI_BASE_URL", "ANTHROPIC_API_KEY", "REPLICATE_API_KEY"],
      orm: null,
    });
  }

  // --- Analytics ---
  const analyticsServices = ["segment", "posthog", "mixpanel", "plausible"];
  const detectedAnalytics = analyticsServices.filter((s) => h.has(s));
  if (detectedAnalytics.length > 0) {
    add({
      id: "analytics",
      type: "analytics",
      service: detectedAnalytics.join(", "),
      reason: "Repo sends analytics events to external services.",
      mockStrategy: "Capture all events to a local log endpoint. Nothing leaves the sandbox.",
      envVars: ["SEGMENT_WRITE_KEY", "NEXT_PUBLIC_POSTHOG_KEY", "POSTHOG_KEY", "MIXPANEL_TOKEN"],
      orm: null,
    });
  }

  // --- Search ---
  if (h.has("algolia")) {
    add({
      id: "algolia",
      type: "search",
      service: "Algolia",
      reason: "Repo uses Algolia for search.",
      mockStrategy: "Return fixture search results keyed by query. Use Algolia sandbox app if available.",
      envVars: ["ALGOLIA_APP_ID", "ALGOLIA_API_KEY", "NEXT_PUBLIC_ALGOLIA_APP_ID", "NEXT_PUBLIC_ALGOLIA_SEARCH_KEY"],
      orm: null,
    });
  }

  if (h.has("elasticsearch")) {
    add({
      id: "elasticsearch",
      type: "search",
      service: "Elasticsearch / OpenSearch",
      reason: "Repo uses Elasticsearch or OpenSearch.",
      mockStrategy: "Run a single-node Elasticsearch container with seeded index data.",
      envVars: ["ELASTICSEARCH_URL", "OPENSEARCH_URL"],
      orm: null,
    });
  }

  if (h.has("typesense")) {
    add({
      id: "typesense",
      type: "search",
      service: "Typesense",
      reason: "Repo uses Typesense for search.",
      mockStrategy: "Run a local Typesense container with pre-seeded collections.",
      envVars: ["TYPESENSE_HOST", "TYPESENSE_API_KEY"],
      orm: null,
    });
  }

  return deps;
}

function recommendBaseImages(languages: string[]): string[] {
  const images: string[] = [];
  if (languages.includes("node")) images.push("node:20-alpine");
  if (languages.includes("python")) images.push("python:3.11-slim");
  if (languages.includes("ruby")) images.push("ruby:3.3-slim");
  if (languages.includes("go")) images.push("golang:1.22-alpine");
  if (languages.includes("rust")) images.push("rust:1.77-slim");
  return images;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function analyseDockerContext(
  ctx: DockerRepoContext
): Promise<DockerSandboxAnalysis> {
  const languages = detectLanguages(ctx);
  const node = detectNodeCommands(ctx);
  const python = detectPythonCommands(ctx);
  const go = detectGoCommands(ctx);

  const installCommands = [...node.install, ...python.install, ...go.install];
  const buildCommands = [...node.build, ...python.build, ...go.build];
  const startCommands = [...node.start, ...python.start, ...go.start];

  const externalDependencies = inferExternalDependencies(ctx);

  const existingDockerArtifacts = Object.keys(ctx.importantFiles).filter((name) =>
    ["Dockerfile", ".dockerignore", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].includes(name)
  );

  const needsCompose =
    externalDependencies.some((d) => ["database", "cache", "queue"].includes(d.type)) ||
    ctx.serviceHints.includes("compose");

  const needsMultiStageBuild =
    ctx.detectedFrameworks.some((f) => ["nextjs", "vite", "react", "remix", "nuxt"].includes(f)) ||
    languages.includes("go") ||
    languages.includes("rust");

  // Derive the migration command from the first database dependency that has an ORM
  const dbDep = externalDependencies.find((d) => d.type === "database");
  const migrationCommand = dbDep
    ? deriveMigrationCommand(dbDep.orm, ctx.detectedFrameworks)
    : null;

  return {
    summary: {
      repo: `${ctx.owner}/${ctx.repo}`,
      branch: ctx.branch,
      frameworks: ctx.detectedFrameworks,
      packageManagers: ctx.packageManagers,
    },
    runtime: {
      languages,
      installCommands,
      buildCommands,
      startCommands,
      ports: detectPorts(ctx),
      repoName: ctx.repo,
      workdir: "/app",
    },
    containerization: {
      recommendedBaseImages: recommendBaseImages(languages),
      existingDockerArtifacts,
      needsMultiStageBuild,
      needsCompose,
    },
    externalDependencies,
    envRequirements: [...new Set(externalDependencies.flatMap((d) => d.envVars))],
    mockPlan: {
      shouldMockDatabase: externalDependencies.some((d) => d.type === "database"),
      shouldMockCache: externalDependencies.some((d) => d.type === "cache"),
      shouldMockAuth: externalDependencies.some((d) => d.type === "auth"),
      shouldMockPayments: externalDependencies.some((d) => d.type === "payments"),
      shouldMockEmail: externalDependencies.some((d) => d.type === "email"),
      shouldMockStorage: externalDependencies.some((d) => d.type === "storage"),
      shouldMockAI: externalDependencies.some((d) => d.type === "ai"),
      shouldMockQueue: externalDependencies.some((d) => d.type === "queue"),
      shouldMockSearch: externalDependencies.some((d) => d.type === "search"),
      migrationCommand,
      notes: [
        "Prefer deterministic fixtures for every outbound third-party API.",
        "Use sandbox-only environment values — never real secrets.",
        "Seed databases and storage with synthetic scenario data before startup.",
        "Email should always be captured locally (Mailpit) — never sent externally.",
        "AI endpoints should return fixture responses so demos work fully offline.",
      ],
    },
  };
}