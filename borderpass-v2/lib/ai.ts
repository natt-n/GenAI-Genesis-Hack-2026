import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "test",
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function analyseRepo(context: {
  name: string;
  description: string;
  language: string;
  topics: string[];
  tree: string;
  files: string;
}): Promise<Record<string, unknown>> {
  const response = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    max_tokens: 8000,
    messages: [
      {
        role: "system",
        content:
          "You are BorderPass, a tool that analyses GitHub repos and generates demo sandbox configurations. You always respond with valid JSON only — no markdown, no explanation.",
      },
      {
        role: "user",
        content: `Analyse this GitHub repo and return a single JSON object.

REPO NAME: ${context.name}
REPO DESCRIPTION: ${context.description}
LANGUAGE: ${context.language}
TOPICS: ${context.topics.join(", ")}

FILE TREE:
${context.tree}

KEY FILE CONTENTS:
${context.files}

Return exactly this JSON structure:

{
  "app_name": "product name",
  "app_description": "one sentence — what this product does for a business user",
  "compatibility": "green",
  "compatibility_reason": "one sentence explaining why this repo is a good sandbox target",
  "features": [
    {
      "id": "slug",
      "name": "business-level name — not technical",
      "description": "what a salesperson would say about this feature",
      "roles": ["which roles can access this"]
    }
  ],
  "roles": [
    { "id": "slug", "name": "display name", "description": "what this role does" }
  ],
  "entities": [
    { "name": "EntityName", "fields": [{ "name": "field", "type": "string" }] }
  ],
  "palette_controls": [
    {
      "id": "slug",
      "group": "group name e.g. User profile / Data density / Scenario states",
      "type": "select or slider or toggle",
      "label": "plain English label for a salesperson",
      "description": "what changing this does to the demo",
      "options": ["only for select type"],
      "min": 0,
      "max": 10,
      "default_value": "any"
    }
  ],
  "walkthrough_steps": [
    {
      "step": 1,
      "feature_id": "matches a feature id above",
      "title": "step title",
      "caption": "what the salesperson says at this step",
      "route": "/example",
      "highlight": "what element to draw attention to"
    }
  ],
  "sandbox_html": "FULL self-contained HTML page simulating this product dashboard. Inline CSS and JS only. Realistic navigation and data. Must look like a real product. At least 400 lines."
}

Rules:
- Maximum 8 features
- Maximum 10 palette_controls
- Maximum 6 walkthrough_steps
- sandbox_html must be a COMPLETE working HTML page
- Use realistic synthetic data — no Lorem Ipsum or John Doe
- Return ONLY valid JSON`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "";

  function extractAndParseJson(text: string): unknown {
    let s = text.trim();
    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    s = s.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/gm, "").trim();
    // If there's still leading/trailing text, try to find the JSON object by matching braces
    const firstBrace = s.indexOf("{");
    if (firstBrace !== -1) {
      let depth = 0;
      for (let i = firstBrace; i < s.length; i++) {
        const c = s[i];
        if (c === "{" || c === "[") depth++;
        else if (c === "}" || c === "]") {
          depth--;
          if (depth === 0) {
            s = s.slice(firstBrace, i + 1);
            break;
          }
        }
      }
    }
    // Remove trailing commas before ] or } (common LLM mistake)
    s = s.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(s);
  }

  try {
    return extractAndParseJson(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error("AI returned invalid JSON: " + raw.slice(0, 200) + (e instanceof Error ? " — " + e.message : ""));
  }
} 