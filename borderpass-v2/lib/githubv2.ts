const GH = `Bearer ${process.env.GITHUB_PAT}`;

export function parseRepoUrl(url: string) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("Invalid GitHub URL");
  return { owner: match[1], repo: match[2].replace(".git", "") };
}

async function gh(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: GH,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
  return res.json();
}

async function getContent(owner: string, repo: string, path: string) {
  try {
    const data = await gh(`/repos/${owner}/${repo}/contents/${path}`);
    return Buffer.from(data.content, "base64")
      .toString("utf-8")
      .slice(0, 4000);
  } catch {
    return "";
  }
}

function detectRuntime(tree: string[]) {
  if (tree.includes("package.json")) return "node";
  if (tree.includes("requirements.txt") || tree.includes("pyproject.toml"))
    return "python";
  if (tree.includes("go.mod")) return "go";
  if (tree.includes("Gemfile")) return "ruby";
  if (tree.includes("composer.json")) return "php";
  return "unknown";
}

function detectFrameworkHints(tree: string[]) {
  const hints: string[] = [];

  if (tree.includes("next.config.js")) hints.push("nextjs");
  if (tree.includes("nuxt.config.ts")) hints.push("nuxt");
  if (tree.includes("vite.config.ts")) hints.push("vite");
  if (tree.includes("angular.json")) hints.push("angular");

  if (tree.some((p) => p.includes("pages/api"))) hints.push("next-api");
  if (tree.some((p) => p.includes("app/api"))) hints.push("next-app-router");

  if (tree.includes("prisma/schema.prisma")) hints.push("prisma");

  return hints;
}

function detectServices(tree: string[]) {
  const services: string[] = [];

  if (tree.some((p) => p.includes("stripe"))) services.push("stripe");
  if (tree.some((p) => p.includes("sendgrid"))) services.push("sendgrid");
  if (tree.some((p) => p.includes("twilio"))) services.push("twilio");
  if (tree.some((p) => p.includes("supabase"))) services.push("supabase");
  if (tree.some((p) => p.includes("firebase"))) services.push("firebase");
  if (tree.some((p) => p.includes("s3"))) services.push("s3");

  return services;
}

export async function collectContext(owner: string, repo: string) {
  const [meta, treeData] = await Promise.all([
    gh(`/repos/${owner}/${repo}`),
    gh(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`),
  ]);

  const tree: string[] = treeData.tree
    .filter((f: any) => f.type === "blob")
    .map((f: any) => f.path);

  const runtime = detectRuntime(tree);
  const frameworkHints = detectFrameworkHints(tree);
  const serviceHints = detectServices(tree);

  const highSignalFiles = tree.filter((p) => {
    const name = p.split("/").pop() || "";

    return (
      name === "README.md" ||
      name === "package.json" ||
      name === "package-lock.json" ||
      name === "pnpm-lock.yaml" ||
      name === "yarn.lock" ||
      name === "requirements.txt" ||
      name === "pyproject.toml" ||
      name === "go.mod" ||
      name === "Dockerfile" ||
      name === "docker-compose.yml" ||
      name === ".env.example" ||
      name === ".env.sample" ||
      name === "schema.prisma" ||
      p.includes("config") ||
      p.includes("app/api") ||
      p.includes("pages/api") ||
      p.includes("routes") ||
      p.includes("controllers") ||
      p.includes("models") ||
      p.includes("services")
    );
  });

  const toFetch = highSignalFiles.slice(0, 20);

  const contents = await Promise.all(
    toFetch.map(async (p) => {
      const c = await getContent(owner, repo, p);
      return c ? `\n\n--- ${p} ---\n${c}` : "";
    })
  );

  return {
    name: meta.name,
    description: meta.description || "",
    language: meta.language || "",
    topics: meta.topics || [],

    runtime,
    frameworkHints,
    serviceHints,

    tree: tree.slice(0, 200).join("\n"),

    files: contents.filter(Boolean).join(""),
  };
}
