const GH = `Bearer ${process.env.GITHUB_PAT}`;

export function parseRepoUrl(url: string) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("Invalid GitHub URL");
  return { owner: match[1], repo: match[2].replace(".git", "") };
}

async function gh(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: GH, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
  return res.json();
}

async function getContent(owner: string, repo: string, path: string) {
  try {
    const data = await gh(`/repos/${owner}/${repo}/contents/${path}`);
    return Buffer.from(data.content, "base64").toString("utf-8").slice(0, 3000);
  } catch {
    return "";
  }
}

export async function collectContext(owner: string, repo: string) {
  const [meta, treeData] = await Promise.all([
    gh(`/repos/${owner}/${repo}`),
    gh(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`),
  ]);

  const tree: string[] = treeData.tree
    .filter((f: any) => f.type === "blob")
    .map((f: any) => f.path);

  const toFetch = tree
    .filter((p) => {
      const name = p.split("/").pop() || "";
      return (
        name === "README.md" ||
        name === "package.json" ||
        name === "schema.prisma" ||
        name === ".env.example" ||
        (p.includes("app/api") && p.endsWith(".ts")) ||
        (p.includes("pages/api") && p.endsWith(".ts")) ||
        (p.includes("routes") && p.endsWith(".ts")) ||
        (p.includes("models") && p.endsWith(".ts"))
      );
    })
    .slice(0, 15);

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
    tree: tree.slice(0, 100).join("\n"),
    files: contents.filter(Boolean).join(""),
  };
}