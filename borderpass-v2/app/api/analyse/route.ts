import { NextRequest, NextResponse } from "next/server";
import { parseRepoUrl, collectContext } from "@/lib/github";
import { analyseRepo } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { repoUrl } = await req.json();
    if (!repoUrl) {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 }
      );
    }

    const { owner, repo } = parseRepoUrl(repoUrl);
    const context = await collectContext(owner, repo);
    const result = await analyseRepo(context);

    const { data: session, error } = await supabaseAdmin
      .from("sessions")
      .insert({ repo_url: repoUrl, analysis_result: result })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ sessionId: session.id, result });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}