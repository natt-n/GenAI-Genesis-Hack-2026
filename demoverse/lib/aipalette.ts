import OpenAI from "openai";
import type { ExternalDependencyMock } from "@/lib/aiForDocker";
import type { PaletteConfig, PaletteControl } from "@/store/session";
import type { RepoFeature, RepoRole, RepoEntity } from "@/store/session";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "test",
  baseURL: process.env.OPENAI_BASE_URL,
});

export interface GeneratePaletteInput {
  selectedFeatures: RepoFeature[];
  roles: RepoRole[];
  entities: RepoEntity[];
  externalDependencies: ExternalDependencyMock[];
}

/**
 * Uses AI to determine what the control palette should allow to update in terms of
 * mock data, based on selected features and extended dependencies from aiForDocker.
 * Returns a PaletteConfig (controls) that the palette page can render.
 */
export async function generatePaletteConfig(
  input: GeneratePaletteInput
): Promise<PaletteConfig> {
  const { selectedFeatures, roles, entities, externalDependencies } = input;

  const featuresJson = JSON.stringify(
    selectedFeatures.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      roles: f.roles,
    })),
    null,
    2
  );
  const rolesJson = JSON.stringify(roles, null, 2);
  const entitiesJson = JSON.stringify(entities, null, 2);
  const depsJson = JSON.stringify(
    externalDependencies.map((d) => ({
      id: d.id,
      type: d.type,
      service: d.service,
      mockStrategy: d.mockStrategy,
      envVars: d.envVars,
    })),
    null,
    2
  );

  const response = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    max_tokens: 4000,
    messages: [
      {
        role: "system",
        content: `You are BorderPass. You generate a "data palette" — a set of controls that let a user configure mock/sandbox data for a demo. You respond with valid JSON only: { "controls": [ ... ] }. No markdown, no explanation.`,
      },
      {
        role: "user",
        content: `Given the SELECTED FEATURES (only these are active in the sandbox), ROLES, ENTITIES (data models), and EXTERNAL DEPENDENCIES (from Docker/sandbox analysis), determine what the control palette should allow the user to update.

SELECTED FEATURES (only these matter for the palette):
${featuresJson}

ROLES:
${rolesJson}

ENTITIES (data models — use these to suggest controls for record counts, status toggles, etc.):
${entitiesJson}

EXTERNAL DEPENDENCIES (mock strategies — each suggests what can be controlled, e.g. DB seed size, auth demo user, payment success/failure, email volume):
${depsJson}

Return a JSON object with a single key "controls", an array of palette controls. Each control must have:
- id: slug (e.g. "user_count", "invoice_status", "stripe_success_rate")
- group: short group name (e.g. "User data", "Payments", "Scenario state")
- type: "select" | "slider" | "toggle"
- label: plain English label for a salesperson
- description: what changing this does to the demo
- default_value: appropriate default (string for select, number for slider, true/false or "on"/"off" for toggle)
- value: null (UI will fill from default_value)

For "select" also include: options (array of strings).
For "slider" also include: min (number), max (number), optional unit (e.g. "items").

Rules:
- Maximum 12 controls. Prefer controls that affect mock data (record counts, statuses, feature toggles) and that map to the selected features and external dependencies.
- Groups could be: "User / auth", "Data density", "Payments", "Scenario state", "Integrations", etc.
- Return ONLY valid JSON: { "controls": [ ... ] }`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "";
  let parsed: { controls: unknown[] };
  try {
    parsed = JSON.parse(raw.replace(/^```json\n?|^```\n?|```$/gm, "").trim());
  } catch {
    throw new Error("AI palette returned invalid JSON: " + raw.slice(0, 200));
  }

  const controls: PaletteControl[] = (parsed.controls || []).map((c: any) => ({
    id: String(c.id ?? "control"),
    group: String(c.group ?? "General"),
    type: ["select", "slider", "toggle"].includes(c.type) ? c.type : "toggle",
    label: String(c.label ?? "Control"),
    description: String(c.description ?? ""),
    options: Array.isArray(c.options) ? c.options.map(String) : undefined,
    min: typeof c.min === "number" ? c.min : undefined,
    max: typeof c.max === "number" ? c.max : undefined,
    unit: typeof c.unit === "string" ? c.unit : undefined,
    default_value: c.default_value ?? (c.type === "toggle" ? "on" : ""),
    value: null,
  }));

  return { controls };
}
