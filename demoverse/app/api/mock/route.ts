import { NextRequest, NextResponse } from "next/server";
import { generateMockPlan } from "@/lib/mockgenerator";
import type { DockerSandboxAnalysis } from "@/lib/aiForDocker";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dockerAnalysis, paletteValues } = body as {
      dockerAnalysis: DockerSandboxAnalysis;
      paletteValues?: Record<string, string | number | boolean>;
    };

    if (!dockerAnalysis) {
      return NextResponse.json(
        { error: "dockerAnalysis is required" },
        { status: 400 }
      );
    }

    const mockPlan = await generateMockPlan(dockerAnalysis, {
      paletteValues: paletteValues ?? undefined,
    });

    return NextResponse.json({ mockPlan });
  } catch (err: any) {
    console.error("[api/mock]", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate mock data" },
      { status: 500 }
    );
  }
}
