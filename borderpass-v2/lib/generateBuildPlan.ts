import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type BuildPlan = {
  appType: "frontend" | "backend" | "fullstack" | "unknown";
  runtime: "node" | "python" | "go" | "ruby" | "php" | "unknown";
  framework: string;
  baseImage: string;
  builderImage?: string;
  workdir: string;
  packageManager?: string;
  installCommand: string;
  runnerInstallCommand?: string;
  buildCommand?: string;
  startCommand: string;
  port: number;
  needsBuildStage: boolean;
  copyPaths: string[];
  manifestCopyGlobs: string[];
  systemPackages: string[];
  envHints: string[];
};

export async function generateBuildPlan(input: {
  repoUrl: string;
  repoSummary: Record<string, unknown>;
  keyFiles: Array<{
    path: string;
    content: string;
  }>;
}) {
  const response = await client.responses.create({
    model: process.env.OPENAI_BUILD_MODEL || "gpt-5.0",
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You analyze software repos and return only valid JSON. " +
              "Infer the best Docker build plan for a sandboxed web application. " +
              "Prefer production-safe defaults. Prefer multi-stage builds when a build artifact is needed. " +
              "Return commands that are realistic for the detected package manager and framework.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(input),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "build_plan",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            appType: {
              type: "string",
              enum: ["frontend", "backend", "fullstack", "unknown"],
            },
            runtime: {
              type: "string",
              enum: ["node", "python", "go", "ruby", "php", "unknown"],
            },
            framework: { type: "string" },
            baseImage: { type: "string" },
            builderImage: { type: "string" },
            workdir: { type: "string" },
            packageManager: { type: "string" },
            installCommand: { type: "string" },
            runnerInstallCommand: { type: "string" },
            buildCommand: { type: "string" },
            startCommand: { type: "string" },
            port: { type: "number" },
            needsBuildStage: { type: "boolean" },
            copyPaths: {
              type: "array",
              items: { type: "string" },
            },
            manifestCopyGlobs: {
              type: "array",
              items: { type: "string" },
            },
            systemPackages: {
              type: "array",
              items: { type: "string" },
            },
            envHints: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "appType",
            "runtime",
            "framework",
            "baseImage",
            "workdir",
            "installCommand",
            "startCommand",
            "port",
            "needsBuildStage",
            "copyPaths",
            "manifestCopyGlobs",
            "systemPackages",
            "envHints",
          ],
        },
      },
    },
  });

  return JSON.parse(response.output_text) as BuildPlan;
}
