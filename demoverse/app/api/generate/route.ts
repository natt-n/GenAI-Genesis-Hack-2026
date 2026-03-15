import { NextRequest, NextResponse } from "next/server";
import { generateDockerfiles } from "@/lib/dockerfilemaker";
import type { DockerSandboxAnalysis } from "@/lib/aiForDocker";
import type { MockPlan } from "@/lib/mockgenerator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dockerAnalysis, mockPlan } = body as {
      dockerAnalysis: DockerSandboxAnalysis;
      mockPlan: MockPlan;
    };

    if (!dockerAnalysis) {
      return NextResponse.json(
        { error: "dockerAnalysis is required" },
        { status: 400 }
      );
    }
    if (!mockPlan) {
      return NextResponse.json(
        { error: "mockPlan is required (call /api/mock first)" },
        { status: 400 }
      );
    }

    const artifact = await generateDockerfiles(dockerAnalysis, mockPlan);

    return NextResponse.json({
      artifact,
      codeSandboxReady: artifact.summary.codeSandboxReady,
    });
  } catch (err: any) {
    console.error("[api/generate]", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate Docker artifacts" },
      { status: 500 }
    );
  }
}
