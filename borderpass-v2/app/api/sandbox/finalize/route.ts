import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateBuildPlan } from "@/lib/generateBuildPlan";
import { renderDockerfile } from "@/lib/renderDockerFile";
import { createDockerAssets } from "@/lib/createDockerAssets";

type Feature = {
  id: string;
  name: string;
  description?: string;
  roles?: string[];
  entities?: string[];
  routes?: string[];
  priority?: number;
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

function filterSelectedFeatures(
  features: Feature[] = [],
  selectedFeatureIds: string[] = []
) {
  const selected = new Set(selectedFeatureIds);
  return features.filter((feature) => selected.has(feature.id));
}

function filterPaletteControls(
  controls: PaletteControl[] = [],
  selectedFeatureIds: string[] = []
) {
  const selected = new Set(selectedFeatureIds);

  return controls.filter((control) => {
    if (control.feature_id) {
      return selected.has(control.feature_id);
    }

    if (Array.isArray(control.feature_ids) && control.feature_ids.length > 0) {
      return control.feature_ids.some((id) => selected.has(id));
    }

    return true;
  });
}

function mergePaletteDefaults(
  controls: PaletteControl[],
  paletteValues: Record<string, any>
) {
  const merged: Record<string, any> = {};

  for (const control of controls) {
    merged[control.id] =
      paletteValues[control.id] !== undefined
        ? paletteValues[control.id]
        : control.default_value;
  }

  return merged;
}

function buildFeatureFlags(
  allFeatures: Feature[],
  selectedFeatureIds: string[]
): Record<string, boolean> {
  const selected = new Set(selectedFeatureIds);

  return allFeatures.reduce<Record<string, boolean>>((acc, feature) => {
    acc[feature.id] = selected.has(feature.id);
    return acc;
  }, {});
}

function inferSeedData(values: Record<string, any>) {
  return {
    orgName: values.orgName ?? "Demo Org",
    workspaceName: values.workspaceName ?? "Sandbox Workspace",
    region: values.region ?? "ca",
    demoMode: values.demoMode ?? true,
    userCount: values.userCount ?? 8,
    adminCount: values.adminCount ?? 1,
    recordCount: values.recordCount ?? 25,
  };
}

function inferMockManifest(input: {
  allFeatures: Feature[];
  selectedFeatures: Feature[];
  selectedFeatureIds: string[];
  controls: PaletteControl[];
  paletteValues: Record<string, any>;
}) {
  return {
    enabledFeatures: input.selectedFeatures.map((feature) => ({
      id: feature.id,
      name: feature.name,
      routes: feature.routes ?? [],
      roles: feature.roles ?? [],
    })),
    featureFlags: buildFeatureFlags(
      input.allFeatures,
      input.selectedFeatureIds
    ),
    controls: input.controls.map((control) => ({
      id: control.id,
      type: control.type,
      label: control.label,
      value:
        input.paletteValues[control.id] !== undefined
          ? input.paletteValues[control.id]
          : control.default_value,
    })),
    seedData: inferSeedData(input.paletteValues),
  };
}

function renderComposeFallback(input: {
  port: number;
  dependencies?: Dependency[];
  selectedFeatureIds: string[];
  paletteValues: Record<string, any>;
}) {
  const deps = input.dependencies ?? [];

  const hasPostgres = deps.some(
    (d) =>
      d.kind === "database" && /postgres|postgresql/i.test(d.name || "")
  );

  const hasRedis = deps.some(
    (d) => d.kind === "cache" && /redis/i.test(d.name || "")
  );

  const needsMockServer = true;

  const appDependsOn = [
    hasPostgres ? "postgres" : null,
    hasRedis ? "redis" : null,
    needsMockServer ? "mock-server" : null,
  ].filter(Boolean) as string[];

  const serializedFeatures = JSON.stringify(input.selectedFeatureIds);
  const serializedPalette = JSON.stringify(input.paletteValues);

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
    `      SANDBOX_FEATURES_JSON: '${serializedFeatures}'`,
    `      SANDBOX_PALETTE_JSON: '${serializedPalette}'`,
    hasPostgres
      ? `      DATABASE_URL: postgres://sandbox:sandbox@postgres:5432/sandboxdb`
      : null,
    hasRedis ? `      REDIS_URL: redis://redis:6379` : null,
    `      MOCK_SERVER_URL: http://mock-server:4010`,
    appDependsOn.length
      ? `    depends_on:\n${appDependsOn.map((s) => `      - ${s}`).join("\n")}`
      : null,

    [
      `  mock-server:`,
      `    image: node:20-alpine`,
      `    working_dir: /app`,
      `    command: sh -c "node server.js"`,
      `    ports:`,
      `      - "4010:4010"`,
    ].join("\n"),

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

export async function POST(req: NextRequest) {
  try {
    const { sessionId, selectedFeatureIds, paletteValues } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(selectedFeatureIds) || selectedFeatureIds.length === 0) {
      return NextResponse.json(
        { error: "At least one selected feature is required" },
        { status: 400 }
      );
    }

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const result = session.analysis_result ?? {};
    const repoContext = session.repo_context ?? {};

    const allFeatures: Feature[] = result.features ?? [];
    const allControls: PaletteControl[] = result.palette_controls ?? [];
    const dependencies: Dependency[] = result.dependencies ?? [];

    const selectedFeatures = filterSelectedFeatures(
      allFeatures,
      selectedFeatureIds
    );
    const relevantControls = filterPaletteControls(
      allControls,
      selectedFeatureIds
    );
    const mergedPaletteValues = mergePaletteDefaults(
      relevantControls,
      paletteValues ?? {}
    );

    const keyFiles = extractKeyFiles(repoContext.files ?? "");

    const buildPlan = await generateBuildPlan({
      repoUrl: session.repo_url,
      repoSummary: {
        name: repoContext.name,
        description: repoContext.description,
        language: repoContext.language,
        topics: repoContext.topics,
        runtime: repoContext.runtime,
        frameworkHints: repoContext.frameworkHints,
        serviceHints: repoContext.serviceHints,
        appType: result.app_type,
        runtimeInfo: result.runtime,
        dependencies,
        selectedFeatures,
        selectedFeatureIds,
        paletteValues: mergedPaletteValues,
      },
      keyFiles,
    });

    const mockManifest = inferMockManifest({
      allFeatures,
      selectedFeatures,
      selectedFeatureIds,
      controls: relevantControls,
      paletteValues: mergedPaletteValues,
    });

    const dockerAssets = await createDockerAssets({
      buildPlan,
      selectedFeatures,
      selectedFeatureIds,
      paletteValues: mergedPaletteValues,
      controls: relevantControls,
      mockManifest,
      dependencies,
    });

    const dockerfile =
      dockerAssets?.dockerfile || renderDockerfile(buildPlan);

    const composeFile =
      dockerAssets?.composeFile ||
      dockerAssets?.dockerCompose ||
      renderComposeFallback({
        port: buildPlan.port || result?.runtime?.port || 3000,
        dependencies,
        selectedFeatureIds,
        paletteValues: mergedPaletteValues,
      });

    const seedFiles = dockerAssets?.seedFiles ?? [];

    const { error: updateError } = await supabaseAdmin
      .from("sessions")
      .update({
        selected_feature_ids: selectedFeatureIds,
        palette_values: mergedPaletteValues,
        build_plan: buildPlan,
        dockerfile,
        compose_file: composeFile,
        mock_manifest: {
          ...mockManifest,
          seedFiles,
        },
        docker_status: "ready",
      })
      .eq("id", sessionId);

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      buildPlan,
      dockerfile,
      composeFile,
      mockManifest: {
        ...mockManifest,
        seedFiles,
      },
      dockerStatus: "ready",
    });
  } catch (err: any) {
    console.error("Finalize sandbox error:", err);

    return NextResponse.json(
      { error: err?.message || "Failed to finalize sandbox" },
      { status: 500 }
    );
  }
}
