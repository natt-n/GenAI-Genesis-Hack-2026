import { NextRequest, NextResponse } from "next/server";
import { generatePaletteConfig } from "@/lib/aipalette";
import type { RepoFeature, RepoRole, RepoEntity } from "@/store/session";
import type { ExternalDependencyMock } from "@/lib/aiForDocker";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      sessionId,
      selectedFeatures,
      roles,
      entities,
      externalDependencies,
    } = body as {
      sessionId?: string;
      selectedFeatures?: RepoFeature[];
      roles?: RepoRole[];
      entities?: RepoEntity[];
      externalDependencies?: ExternalDependencyMock[];
    };

    if (!selectedFeatures || !Array.isArray(selectedFeatures) || selectedFeatures.length === 0) {
      return NextResponse.json(
        { error: "selectedFeatures (non-empty array) is required" },
        { status: 400 }
      );
    }

    const paletteConfig = await generatePaletteConfig({
      selectedFeatures,
      roles: Array.isArray(roles) ? roles : [],
      entities: Array.isArray(entities) ? entities : [],
      externalDependencies: Array.isArray(externalDependencies) ? externalDependencies : [],
    });

    return NextResponse.json({ paletteConfig });
  } catch (err: any) {
    console.error("[api/palette]", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate palette" },
      { status: 500 }
    );
  }
}
