import { NextRequest, NextResponse } from "next/server";
import { collectDockerContext } from "@/lib/githubDocker";
import { analyseDockerContext } from "@/lib/aiForDocker";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { repoUrl, sessionId } = await req.json();

    if (!repoUrl) {
      return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
    }

    // Step 1: Collect everything we can from GitHub
    const context = await collectDockerContext(repoUrl);

    // Step 2: Analyse the context to produce a sandbox-ready dependency map
    const result = await analyseDockerContext(context);

    let resolvedSessionId = sessionId ?? null;

    if (resolvedSessionId) {
      // Update an existing session — verify the row actually exists
      const { data, error } = await supabaseAdmin
        .from("sessions")
        .update({
          docker_repo_context: context,
          docker_analysis_result: result,
        })
        .eq("id", resolvedSessionId)
        .select("id")
        .single();

      if (error || !data) {
        // Row not found or DB error — treat it as a fresh session
        resolvedSessionId = null;
      }
    }

    if (!resolvedSessionId) {
      // Insert a new session
      const { data, error } = await supabaseAdmin
        .from("sessions")
        .insert({
          repo_url: repoUrl,
          repo_owner: context.owner,
          repo_name: context.repo,
          repo_branch: context.branch,
          docker_repo_context: context,
          docker_analysis_result: result,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "Failed to create session");
      }

      resolvedSessionId = data.id;
    }

    return NextResponse.json({ sessionId: resolvedSessionId, result });
  } catch (error: any) {
    console.error("[dockeranalyze] error:", error);
    return NextResponse.json(
      { error: error?.message ?? "Docker analysis failed" },
      { status: 500 }
    );
  }
}