import type { BuildPlan } from "./generateBuildPlan";

function renderSystemPackageInstall(plan: BuildPlan): string {
  if (!plan.systemPackages.length) return "";

  if (plan.baseImage.includes("alpine")) {
    return `RUN apk add --no-cache ${plan.systemPackages.join(" ")}`;
  }

  return [
    "RUN apt-get update && apt-get install -y \\",
    ...plan.systemPackages.map((pkg, i, arr) =>
      i === arr.length - 1
        ? `  ${pkg} && rm -rf /var/lib/apt/lists/*`
        : `  ${pkg} \\`
    ),
  ].join("\n");
}

function renderCopyManifest(globs: string[]): string[] {
  const unique = Array.from(new Set(globs.filter(Boolean)));

  if (!unique.length) return [];

  return unique.map((glob) => `COPY ${glob} ./`);
}

function defaultRunnerInstallCommand(plan: BuildPlan): string {
  const pm = (plan.packageManager || "").toLowerCase();

  if (pm === "pnpm") return "pnpm install --prod --frozen-lockfile";
  if (pm === "yarn") return "yarn install --production --frozen-lockfile";
  if (pm === "npm") return "npm ci --omit=dev";

  return plan.runnerInstallCommand || "";
}

export function renderDockerfile(plan: BuildPlan): string {
  const manifestLines = renderCopyManifest(plan.manifestCopyGlobs);
  const copyPaths = plan.copyPaths?.length ? plan.copyPaths : ["."];
  const copyAppLines = copyPaths.map((copyPath) =>
    copyPath === "." ? "COPY . ." : `COPY ${copyPath} ${copyPath}`
  );

  if (plan.runtime === "node") {
    if (plan.needsBuildStage) {
      const runnerInstall = defaultRunnerInstallCommand(plan);

      return [
        `FROM ${plan.builderImage || plan.baseImage} AS builder`,
        `WORKDIR ${plan.workdir}`,
        renderSystemPackageInstall(plan),
        ...manifestLines,
        `RUN ${plan.installCommand}`,
        ...copyAppLines,
        plan.buildCommand ? `RUN ${plan.buildCommand}` : "",
        "",
        `FROM ${plan.baseImage} AS runner`,
        `WORKDIR ${plan.workdir}`,
        `ENV NODE_ENV=production`,
        renderSystemPackageInstall(plan),
        ...manifestLines,
        runnerInstall ? `RUN ${runnerInstall}` : "",
        `COPY --from=builder ${plan.workdir} ${plan.workdir}`,
        `EXPOSE ${plan.port}`,
        `CMD ["sh", "-c", "${plan.startCommand.replace(/"/g, '\\"')}"]`,
        "",
      ]
        .filter(Boolean)
        .join("\n");
    }

    return [
      `FROM ${plan.baseImage}`,
      `WORKDIR ${plan.workdir}`,
      renderSystemPackageInstall(plan),
      ...manifestLines,
      `RUN ${plan.installCommand}`,
      ...copyAppLines,
      `EXPOSE ${plan.port}`,
      `CMD ["sh", "-c", "${plan.startCommand.replace(/"/g, '\\"')}"]`,
      "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `FROM ${plan.baseImage}`,
    `WORKDIR ${plan.workdir}`,
    renderSystemPackageInstall(plan),
    ...copyAppLines,
    `EXPOSE ${plan.port}`,
    `CMD ["sh", "-c", "${plan.startCommand.replace(/"/g, '\\"')}"]`,
    "",
  ]
    .filter(Boolean)
    .join("\n");
}
