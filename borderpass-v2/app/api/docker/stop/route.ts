import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { spawn } from "child_process";
import * as path from "path";
import * as os from "os";

function runCompose(
  cwd: string,
  args: string[]
): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["compose", ...args], { cwd });
    proc.on("error", () => resolve(1));
    proc.on("close", (code) => resolve(code ?? 1));
  });
}

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const sandboxDir = path.join(os.tmpdir(), "borderpass", sessionId);

  // Best-effort — don't throw if directory doesn't exist
  try {
    await runCompose(sandboxDir, ["down", "--remove-orphans"]);
  } catch {
    // Ignore
  }

  await supabaseAdmin
    .from("sessions")
    .update({ docker_status: "stopped" })
    .eq("id", sessionId)
    .catch(() => null);

  return NextResponse.json({ ok: true });
}