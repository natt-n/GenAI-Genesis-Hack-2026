import { NextRequest, NextResponse } from "next/server";
import { parseRepoUrl, collectContext } from "@/lib/githubv2";
import { analyseRepo } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase";
import { generateBuildPlan } from "@/lib/generateBuildPlan";
import { renderDockerfile } from "@/lib/renderDockerFile";

type Dependency = {
  id?: string;
  name?: string;
  kind?: string;
  mode?: string;
  evidence?: string[];
  env_vars?: string[];
  notes?: string;
};

function renderComposePreview(input: {
  port: number;
  dependencies?: Dependency[];
}) {
  const deps = input.dependencies ?? [];

  const hasPostgres = deps.some(
    (d) =>
      d.kind === "database" && /postgres|postgresql/i.test(d.name || "")
  );

  const hasRedis = deps.some(
    (d) => d.kind === "cache" && /redis/i.test(d.name || "")
  );

  const needsMockServer = deps.some(
    (d) => d.mode === "mock" || d.mode === "emulated"
  );

  const appDependsOn = [
    hasPostgres ? "postgres" : null,
    hasRedis ? "redis" : null,
    needsMockServer ? "mock-server" : null,
  ].filter(Boolean) as string[];

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
    hasPostgres
      ? `      DATABASE_URL: postgres://sandbox:sandbox@postgres:5432/sandboxdb`
      : null,
    hasRedis ? `      REDIS_URL: redis://redis:6379` : null,
    needsMockServer ? `      MOCK_SERVER_URL: http://mock-server:4010` : null,
    appDependsOn.length
      ? `    depends_on:\n${appDependsOn.map((s) => `      - ${s}`).join("\n")}`
      : null,

    needsMockServer
      ? [
          `  mock-server:`,
          `    image: node:20-alpine`,
          `    working_dir: /app`,
          `    command: sh -c "node server.js"`,
          `    ports:`,
          `      - "4010:4010"`,
        ].join("\n")
      : null,

    hasPostgres
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

    hasRedis
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

function extractKeyFiles(
  filesBlob: string
): Array<{ path: string; content: string }> {
  if (!filesBlob?.trim()) return [];

  const matches = [
    ...filesBlob.matchAll(
      /---\s+(.+?)\s+---\n([\s\S]*?)(?=\n---\s+.+?\s+---\n|$)/g
    ),
  ];

  return matches.map((match) => ({
    path: match[1].trim(),
    content: match[2].trim(),
  }));
}

export async function POST(req: NextRequest) {
  try {
    const { repoUrl } = await req.json();

    if (!repoUrl?.trim()) {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 }
      );
    }

    const normalizedRepoUrl = repoUrl.trim();
    const { owner, repo } = parseRepoUrl(normalizedRepoUrl);

    const context = await collectContext(owner, repo);
    const result = await analyseRepo(context);

    const keyFiles = extractKeyFiles(context.files);

    const buildPlan = await generateBuildPlan({
      repoUrl: normalizedRepoUrl,
      repoSummary: {
        name: context.name,
        description: context.description,
        language: context.language,
        topics: context.topics,
        runtime: context.runtime,
        frameworkHints: context.frameworkHints,
        serviceHints: context.serviceHints,
        appType: result.app_type,
        runtimeInfo: result.runtime,
        dependencies: result.dependencies,
      },
      keyFiles,
    });

    const dockerfile = renderDockerfile(buildPlan);

    const composeFile = renderComposePreview({
      port: buildPlan.port || result?.runtime?.port || 3000,
      dependencies: result?.dependencies ?? [],
    });

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .insert({
        repo_url: normalizedRepoUrl,
        repo_owner: owner,
        repo_name: repo,
        repo_context: context,
        analysis_result: result,
        sandbox_html: result?.sandbox_html ?? null,
        build_plan: buildPlan,
        dockerfile,
        compose_file: composeFile,
        docker_status: "planned",
        selected_feature_ids: [],
        palette_values: {},
        mock_manifest: null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      sessionId: session.id,
      result,
      buildPlan,
      dockerfile,
      composeFile,
      dockerStatus: "planned",
    });
  } catch (err: any) {
    console.error("Analyse error:", err);

    return NextResponse.json(
      { error: err?.message || "Failed to analyse repository" },
      { status: 500 }
    );
  }
}
