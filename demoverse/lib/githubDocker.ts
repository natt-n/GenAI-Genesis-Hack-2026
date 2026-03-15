export type GitHubTreeItem = {
  path: string;
  type: "blob" | "tree";
};

export interface DockerRepoContext {
  owner: string;
  repo: string;
  branch: string;
  repoUrl: string;
  tree: GitHubTreeItem[];
  importantFiles: Record<string, string>;
  sourceFileSample: Record<string, string>; // sampled source files for deeper service scanning
  packageManagers: string[];
  detectedFrameworks: string[];
  possibleEntryPoints: string[];
  envFiles: string[];
  serviceHints: string[]; // unified, deduplicated hint list consumed by aiForDocker
}

// ---------------------------------------------------------------------------
// Config / manifest files — always fetched in full
// ---------------------------------------------------------------------------
const IMPORTANT_FILE_CANDIDATES = [
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "requirements.txt",
  "Pipfile",
  "Pipfile.lock",
  "pyproject.toml",
  "poetry.lock",
  "Gemfile",
  "Gemfile.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Dockerfile",
  ".dockerignore",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  ".env",
  ".env.example",
  ".env.local",
  ".env.sample",
  "README.md",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "vite.config.ts",
  "vite.config.js",
  "webpack.config.js",
  "tsconfig.json",
  "Procfile",
  "prisma/schema.prisma",
  "manage.py",
  // Extra config locations that commonly reveal services
  "config/database.yml",
  "config/application.rb",
  "src/config/index.ts",
  "src/config/index.js",
  "src/lib/db.ts",
  "src/lib/db.js",
  "lib/db.ts",
  "lib/db.js",
];

// Source file extensions worth sampling
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs"];

// Max source files to fetch (avoids hammering the GitHub API on large repos)
const SOURCE_SAMPLE_LIMIT = 30;

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------
function getGitHubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function parseRepoUrl(repoUrl: string) {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
  if (!match) throw new Error("Invalid GitHub repo URL");
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

async function fetchDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: getGitHubHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    let message = `Failed to fetch repo metadata: ${res.status}`;
    if (res.status === 403) {
      try {
        const json = JSON.parse(body);
        if (json.message) message += ` — ${json.message}`;
      } catch {
        // ignore parse error
      }
      if (!process.env.GITHUB_TOKEN && !process.env.GITHUB_PAT) {
        message += ". Set GITHUB_TOKEN or GITHUB_PAT in .env.local for higher rate limits and private repo access.";
      }
    }
    throw new Error(message);
  }
  const data = await res.json();
  return data.default_branch ?? "main";
}

async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubTreeItem[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: getGitHubHeaders(), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Failed to fetch repo tree: ${res.status}`);
  const data = await res.json();
  return (data.tree || []).map((item: any) => ({
    path: item.path,
    type: item.type,
  }));
}

async function fetchFileContent(
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers: getGitHubHeaders(), cache: "no-store" }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.content) return null;
  try {
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source file sampling
// Prioritises src/, lib/, app/, server/ so we scan the most relevant files
// first before hitting the limit.
// ---------------------------------------------------------------------------
function pickSourceFilesToSample(paths: string[]): string[] {
  const priorityPrefixes = ["src/", "lib/", "app/", "server/", "api/", "backend/"];

  const isSource = (p: string) =>
    SOURCE_EXTENSIONS.some((ext) => p.endsWith(ext)) &&
    !p.includes("node_modules/") &&
    !p.includes(".test.") &&
    !p.includes(".spec.") &&
    !p.includes("__tests__") &&
    !p.includes(".d.ts");

  const prioritised = paths.filter(
    (p) => isSource(p) && priorityPrefixes.some((pre) => p.startsWith(pre))
  );
  const rest = paths.filter(
    (p) => isSource(p) && !priorityPrefixes.some((pre) => p.startsWith(pre))
  );

  return [...prioritised, ...rest].slice(0, SOURCE_SAMPLE_LIMIT);
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------
function detectPackageManagers(paths: string[]): string[] {
  const managers = new Set<string>();
  if (paths.includes("package-lock.json")) managers.add("npm");
  if (paths.includes("yarn.lock")) managers.add("yarn");
  if (paths.includes("pnpm-lock.yaml")) managers.add("pnpm");
  if (paths.includes("bun.lockb")) managers.add("bun");
  if (paths.includes("requirements.txt") || paths.includes("pyproject.toml"))
    managers.add("pip");
  if (paths.includes("Pipfile")) managers.add("pipenv");
  if (paths.includes("poetry.lock")) managers.add("poetry");
  if (paths.includes("Gemfile")) managers.add("bundler");
  if (paths.includes("go.mod")) managers.add("go");
  if (paths.includes("Cargo.toml")) managers.add("cargo");
  return [...managers];
}

function detectFrameworks(
  paths: string[],
  importantFiles: Record<string, string>
): string[] {
  const frameworks = new Set<string>();
  const pkg = importantFiles["package.json"] || "";
  const requirements = importantFiles["requirements.txt"] || "";
  const pyproject = importantFiles["pyproject.toml"] || "";
  const gemfile = importantFiles["Gemfile"] || "";

  // Node / JS
  if (pkg.includes('"next"')) frameworks.add("nextjs");
  if (pkg.includes('"react"')) frameworks.add("react");
  if (pkg.includes('"express"')) frameworks.add("express");
  if (pkg.includes('"@nestjs/core"')) frameworks.add("nestjs");
  if (pkg.includes('"vite"')) frameworks.add("vite");
  if (pkg.includes('"@remix-run')) frameworks.add("remix");
  if (pkg.includes('"nuxt"')) frameworks.add("nuxt");
  if (pkg.includes('"fastify"')) frameworks.add("fastify");
  if (pkg.includes('"hono"')) frameworks.add("hono");

  // Python
  const pyLower = (requirements + pyproject).toLowerCase();
  if (paths.includes("manage.py") || pyLower.includes("django")) frameworks.add("django");
  if (pyLower.includes("flask")) frameworks.add("flask");
  if (pyLower.includes("fastapi")) frameworks.add("fastapi");

  // Ruby
  if (paths.includes("Gemfile")) frameworks.add("ruby");
  if (gemfile.includes("rails")) frameworks.add("rails");

  // Go / Rust
  if (importantFiles["go.mod"]) frameworks.add("go");
  if (importantFiles["Cargo.toml"]) frameworks.add("rust");

  return [...frameworks];
}

function detectEntryPoints(paths: string[]): string[] {
  const candidates = [
    "app/page.tsx",
    "src/main.ts",
    "src/main.tsx",
    "src/index.ts",
    "src/index.tsx",
    "src/index.js",
    "src/index.jsx",
    "src/app.ts",
    "src/app.js",
    "server.ts",
    "server.js",
    "index.ts",
    "index.js",
    "main.py",
    "manage.py",
    "app.py",
    "main.go",
    "cmd/main.go",
    "src/main.rs",
  ];
  return candidates.filter((f) => paths.includes(f));
}

// ---------------------------------------------------------------------------
// Service hint detection
// Scans BOTH importantFiles AND sourceFileSample so nothing is missed.
// This is the single source of truth consumed by aiForDocker.
// ---------------------------------------------------------------------------
export function detectServiceHints(
  paths: string[],
  importantFiles: Record<string, string>,
  sourceFileSample: Record<string, string> = {}
): string[] {
  const hints = new Set<string>();

  const combined = [
    ...Object.values(importantFiles),
    ...Object.values(sourceFileSample),
  ]
    .join("\n")
    .toLowerCase();

  // --- Databases ---
  if (combined.includes("postgres") || combined.includes('"pg"') || combined.includes("'pg'"))
    hints.add("postgres");
  if (combined.includes("mysql")) hints.add("mysql");
  if (combined.includes("mongodb") || combined.includes("mongoose")) hints.add("mongodb");
  if (combined.includes("sqlite")) hints.add("sqlite");
  if (combined.includes("planetscale")) hints.add("planetscale");
  if (combined.includes("neon") && combined.includes("database")) hints.add("neon");

  // --- Cache / queues ---
  if (combined.includes("redis")) hints.add("redis");
  if (combined.includes("bullmq") || combined.includes('"bull"') || combined.includes("'bull'"))
    hints.add("bullmq");
  if (combined.includes("rabbitmq") || combined.includes("amqp")) hints.add("rabbitmq");
  if (combined.includes("kafka")) hints.add("kafka");

  // --- Auth ---
  if (combined.includes("auth0")) hints.add("auth0");
  if (combined.includes("nextauth") || combined.includes("next-auth")) hints.add("nextauth");
  if (combined.includes("clerk")) hints.add("clerk");
  if (combined.includes("lucia")) hints.add("lucia");
  if (combined.includes("passport")) hints.add("passport");
  if (combined.includes("firebase") && combined.includes("auth")) hints.add("firebase-auth");
  if (combined.includes("supabase") && combined.includes("auth")) hints.add("supabase-auth");

  // --- Payments ---
  if (combined.includes("stripe")) hints.add("stripe");
  if (combined.includes("lemonsqueezy")) hints.add("lemonsqueezy");
  if (combined.includes("paddle")) hints.add("paddle");

  // --- Email ---
  if (combined.includes("sendgrid")) hints.add("sendgrid");
  if (combined.includes("resend")) hints.add("resend");
  if (combined.includes("nodemailer")) hints.add("nodemailer");
  if (combined.includes("postmark")) hints.add("postmark");
  if (combined.includes("mailgun")) hints.add("mailgun");
  if (combined.includes("smtp")) hints.add("smtp");

  // --- SMS ---
  if (combined.includes("twilio")) hints.add("twilio");

  // --- Storage ---
  if (
    combined.includes('"s3"') ||
    combined.includes("aws-sdk") ||
    combined.includes("@aws-sdk") ||
    combined.includes("s3client") ||
    combined.includes("putobject")
  )
    hints.add("aws-s3");
  if (combined.includes("cloudinary")) hints.add("cloudinary");
  if (combined.includes("uploadthing")) hints.add("uploadthing");
  if (combined.includes("minio")) hints.add("minio");

  // --- AI / LLM ---
  if (combined.includes("openai")) hints.add("openai");
  if (combined.includes("anthropic")) hints.add("anthropic");
  if (combined.includes("replicate")) hints.add("replicate");
  if (combined.includes("huggingface") || combined.includes("@huggingface"))
    hints.add("huggingface");

  // --- BaaS ---
  if (combined.includes("supabase")) hints.add("supabase");
  if (combined.includes("firebase")) hints.add("firebase");
  if (combined.includes("appwrite")) hints.add("appwrite");

  // --- Analytics ---
  if (combined.includes("segment")) hints.add("segment");
  if (combined.includes("posthog")) hints.add("posthog");
  if (combined.includes("mixpanel")) hints.add("mixpanel");
  if (combined.includes("plausible")) hints.add("plausible");

  // --- Search ---
  if (combined.includes("algolia")) hints.add("algolia");
  if (combined.includes("elasticsearch") || combined.includes("opensearch"))
    hints.add("elasticsearch");
  if (combined.includes("typesense")) hints.add("typesense");

  // --- ORM / schema (signals a real DB is in use) ---
  if (paths.includes("prisma/schema.prisma") || combined.includes("prisma"))
    hints.add("prisma");
  if (combined.includes("drizzle-orm") || combined.includes("drizzle")) hints.add("drizzle");
  if (combined.includes("typeorm")) hints.add("typeorm");
  if (combined.includes("sequelize")) hints.add("sequelize");
  if (combined.includes("sqlalchemy")) hints.add("sqlalchemy");

  // --- Infra ---
  if (
    paths.some((p) =>
      ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].includes(p)
    )
  )
    hints.add("compose");

  return [...hints];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function collectDockerContext(
  repoUrl: string
): Promise<DockerRepoContext> {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const branch = await fetchDefaultBranch(owner, repo);
  const tree = await fetchRepoTree(owner, repo, branch);
  const paths = tree.map((t) => t.path);

  // 1. Fetch config / manifest files
  const importantPaths = IMPORTANT_FILE_CANDIDATES.filter((f) => paths.includes(f));
  const envFiles = paths.filter(
    (p) =>
      p.startsWith(".env") ||
      p.endsWith(".env") ||
      p.includes(".env.") ||
      p.includes("/.env")
  );

  const configEntries = await Promise.all(
    importantPaths.map(async (path) => [path, await fetchFileContent(owner, repo, path)] as const)
  );
  const importantFiles: Record<string, string> = {};
  for (const [path, content] of configEntries) {
    if (content) importantFiles[path] = content;
  }

  // 2. Sample source files for broader service detection
  const sourcePathsToFetch = pickSourceFilesToSample(paths);
  const sourceEntries = await Promise.all(
    sourcePathsToFetch.map(async (path) => [path, await fetchFileContent(owner, repo, path)] as const)
  );
  const sourceFileSample: Record<string, string> = {};
  for (const [path, content] of sourceEntries) {
    if (content) sourceFileSample[path] = content;
  }

  return {
    owner,
    repo,
    branch,
    repoUrl,
    tree,
    importantFiles,
    sourceFileSample,
    packageManagers: detectPackageManagers(paths),
    detectedFrameworks: detectFrameworks(paths, importantFiles),
    possibleEntryPoints: detectEntryPoints(paths),
    envFiles,
    // Single unified scan across config + source files
    serviceHints: detectServiceHints(paths, importantFiles, sourceFileSample),
  };
}