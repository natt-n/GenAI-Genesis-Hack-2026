import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// ─── Streaming helpers ───────────────────────────────────────────────────────

function encode(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function logEvent(
  controller: ReadableStreamDefaultController,
  text: string,
  level: "info" | "error" | "success" = "info"
) {
  controller.enqueue(encode({ type: "log", text, level }));
}

function statusEvent(
  controller: ReadableStreamDefaultController,
  status: string,
  extras: Record<string, unknown> = {}
) {
  controller.enqueue(encode({ type: "status", status, ...extras }));
}

// ─── Sandbox directory helpers ───────────────────────────────────────────────

async function prepareSandboxDir(
  sessionId: string,
  session: Record<string, any>
): Promise<string> {
  const dir = path.join(os.tmpdir(), "borderpass", sessionId);
  await fs.mkdir(dir, { recursive: true });

  // Write Dockerfile
  if (session.dockerfile) {
    await fs.writeFile(path.join(dir, "Dockerfile"), session.dockerfile, "utf8");
  }

  // Write docker-compose.yml
  if (session.compose_file) {
    await fs.writeFile(
      path.join(dir, "docker-compose.yml"),
      session.compose_file,
      "utf8"
    );
  }

  // Write seed files (mock manifest, server.js, .env.sandbox, etc.)
  const seedFiles: Array<{ path: string; content: string }> =
    session.mock_manifest?.seedFiles ?? [];

  for (const file of seedFiles) {
    const filePath = path.join(dir, file.path);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content, "utf8");
  }

  return dir;
}

// ─── Docker compose helpers ──────────────────────────────────────────────────

function runCompose(
  cwd: string,
  args: string[],
  controller: ReadableStreamDefaultController,
  signal: AbortSignal
): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", ["compose", ...args], {
      cwd,
      env: { ...process.env, COMPOSE_ANSI: "never" },
    });

    signal.addEventListener("abort", () => {
      proc.kill("SIGTERM");
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) logEvent(controller, line);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        // Docker compose sends normal progress to stderr — only flag real errors
        const isError =
          /error|failed|fatal/i.test(line) && !/warning/i.test(line);
        logEvent(controller, line, isError ? "error" : "info");
      }
    });

    proc.on("error", reject);
    proc.on("close", (code) => resolve(code ?? 1));
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!session.dockerfile || !session.compose_file) {
    return new Response(
      JSON.stringify({ error: "Session has no Docker assets — run finalize first" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const port: number =
    session.build_plan?.port ?? session.analysis_result?.runtime?.port ?? 3000;

  const stream = new ReadableStream({
    async start(controller) {
      const abort = new AbortController();

      req.signal.addEventListener("abort", () => abort.abort());

      try {
        logEvent(controller, "Preparing sandbox directory…");
        const sandboxDir = await prepareSandboxDir(sessionId, session);
        logEvent(controller, `Sandbox dir: ${sandboxDir}`);

        // Pull images first so build output is clean
        logEvent(controller, "Pulling base images…");
        await runCompose(sandboxDir, ["pull", "--quiet"], controller, abort.signal);

        // Build
        logEvent(controller, "Building Docker image…");
        const buildCode = await runCompose(
          sandboxDir,
          ["build", "--progress=plain"],
          controller,
          abort.signal
        );

        if (buildCode !== 0) {
          statusEvent(controller, "error", { message: `Build exited with code ${buildCode}` });
          controller.close();
          return;
        }

        logEvent(controller, "Build complete. Starting services…");

        // Start containers (detached)
        const upCode = await runCompose(
          sandboxDir,
          ["up", "-d", "--remove-orphans"],
          controller,
          abort.signal
        );

        if (upCode !== 0) {
          statusEvent(controller, "error", { message: `docker compose up exited with code ${upCode}` });
          controller.close();
          return;
        }

        // Update session status in Supabase
        await supabaseAdmin
          .from("sessions")
          .update({ docker_status: "running" })
          .eq("id", sessionId);

        const url = `http://localhost:${port}`;
        logEvent(controller, `All services up. App → ${url}`, "success");
        statusEvent(controller, "running", { url });
      } catch (err: any) {
        const msg = err?.message || "Unexpected error";
        logEvent(controller, msg, "error");
        statusEvent(controller, "error", { message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}