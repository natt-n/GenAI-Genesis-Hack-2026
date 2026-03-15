import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "test",
  baseURL: process.env.OPENAI_BASE_URL,
});

export type RepoContext = {
  name: string;
  description: string;
  language: string;
  topics: string[];
  runtime: string;
  frameworkHints: string[];
  serviceHints: string[];
  tree: string;
  files: string;
};

export async function analyseRepo(context: RepoContext) {
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "openai/gpt-oss-120b",
    max_tokens: 12000,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are BorderPass, a tool that analyses GitHub repos and generates sandbox planning metadata. " +
          "You always respond with valid JSON only. No markdown. No explanation. No code fences. " +
          "Be conservative and evidence-based. Only infer functionality that is reasonably supported by the repo context.",
      },
      {
        role: "user",
        content: `Analyse this GitHub repo and return a single JSON object.

REPO NAME: ${context.name}
REPO DESCRIPTION: ${context.description}
PRIMARY LANGUAGE: ${context.language}
TOPICS: ${context.topics.join(", ")}

RUNTIME: ${context.runtime}
FRAMEWORK HINTS: ${context.frameworkHints.join(", ")}
SERVICE HINTS: ${context.serviceHints.join(", ")}

FILE TREE:
${context.tree}

KEY FILE CONTENTS:
${context.files}

Return exactly this JSON structure:

{
  "app_name": "product name",
  "app_description": "one sentence describing what the product does for a business user",
  "compatibility": "green | yellow | red",
  "compatibility_reason": "one sentence explaining whether this repo is a good sandbox target",
  "app_type": "frontend | backend | fullstack | unknown",
  "runtime": {
    "primary": "node | python | go | ruby | php | unknown",
    "framework": "best guess framework name",
    "package_manager": "npm | pnpm | yarn | pip | poetry | go modules | bundler | composer | unknown",
    "port": 3000,
    "install_command": "best guess install command",
    "build_command": "best guess build command or empty string",
    "start_command": "best guess start command",
    "needs_build_step": true
  },
  "dependencies": [
    {
      "id": "slug",
      "name": "service name",
      "kind": "database | cache | queue | auth | payments | email | storage | analytics | ai | external_api | webhook | unknown",
      "mode": "real-local | mock | emulated | passthrough-disabled",
      "evidence": ["short evidence strings from file names, imports, env vars, or config"],
      "env_vars": ["ENV_VAR_NAME"],
      "notes": "short note about how this should behave in a sandbox"
    }
  ],
  "features": [
    {
      "id": "slug",
      "name": "business-level name, not technical",
      "description": "what a salesperson would say about this feature",
      "roles": ["which roles can access this"],
      "entities": ["related entity names"],
      "routes": ["/example"],
      "priority": 1
    }
  ],
  "roles": [
    {
      "id": "slug",
      "name": "display name",
      "description": "what this role does"
    }
  ],
  "entities": [
    {
      "name": "EntityName",
      "fields": [
        {
          "name": "field",
          "type": "string | number | boolean | date | enum | object | array | unknown"
        }
      ]
    }
  ],
  "palette_controls": [
    {
      "id": "slug",
      "feature_id": "optional single related feature id",
      "feature_ids": ["optional related feature ids"],
      "group": "group name such as User profile / Data density / Scenario states",
      "type": "select | slider | toggle",
      "label": "plain English label",
      "description": "what changing this does to the demo",
      "options": ["only for select type"],
      "min": 0,
      "max": 10,
      "default_value": "any valid default"
    }
  ],
  "walkthrough_steps": [
    {
      "step": 1,
      "feature_id": "matches a feature id above",
      "title": "step title",
      "caption": "what the presenter says at this step",
      "route": "/example",
      "highlight": "what element to draw attention to"
    }
  ],
  "mock_strategy": {
    "summary": "short summary of how to sandbox this repo",
    "feature_flags": {
      "selected_features_supported": true,
      "notes": "how omitted features should be hidden or blocked"
    },
    "seed_recommendations": [
      {
        "scenario_id": "slug",
        "name": "scenario name",
        "description": "what this seeded scenario should show",
        "roles": ["roles included"]
      }
    ]
  },
  "sandbox_html": "FULL self-contained HTML page simulating this product dashboard. Inline CSS and JS only. Realistic navigation and data. Must look like a real product. At least 400 lines."
}

Rules:
- Maximum 8 features
- Maximum 10 palette_controls
- Maximum 6 walkthrough_steps
- Maximum 12 dependencies
- Palette controls should be linked to specific features whenever possible using feature_id or feature_ids
- If uncertain, prefer fewer items and mark unknown conservatively
- Use the provided runtime/framework/service hints, but verify against the tree/files when possible
- For dependencies.mode:
  - databases/caches usually prefer real-local
  - third-party SaaS services usually prefer mock or emulated
  - unsupported/high-risk dependencies can use passthrough-disabled
- sandbox_html must be a COMPLETE working HTML page
- Use realistic synthetic data — no Lorem Ipsum or John Doe
- Return ONLY valid JSON`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "";

  try {
    return JSON.parse(stripCodeFences(raw));
  } catch {
    throw new Error("AI returned invalid JSON: " + raw.slice(0, 500));
  }
}

function stripCodeFences(input: string): string {
  return input.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
}
