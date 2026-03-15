# DEMOVERSE: GenAI-Genesis-Hack-2026

**Demoverse** — Paste a GitHub repo. Get a live demo sandbox in minutes.

The app lives in `demoverse/`: a Next.js app that analyses any GitHub repo, infers business features and external dependencies, lets you pick scenarios and a data “palette,” then generates Docker artifacts and mock data ready for CodeSandbox.

---

## Project Demo Video

_[Add link to your demo video here.]_

---

## Inspiration

Sales and success teams need to demo products in a safe, repeatable way without touching production or manually wiring stubs. We wanted to go from “paste repo URL” to “configurable demo sandbox” with minimal steps: AI figures out what the app does, what to mock (DB, auth, payments, email, etc.), and produces a Docker-based sandbox tailored to the user’s chosen features and data knobs.

---

## What it does — Features, User Experience, Novel Aspects

### User flow (4 steps)

1. **Home** — User pastes a GitHub repo URL. The app runs two analyses in sequence:
   - **Repo analysis** (`/api/analyse`): fetches repo context (tree, key files), then uses an LLM to infer app name, description, compatibility, **features** (business-level, with roles), **roles**, and **entities** (data models).
   - **Docker analysis** (`/api/dockeranalyse`): collects full repo tree and important config files via GitHub API, infers languages, frameworks, install/build/start commands, and **external dependencies** (Postgres, Redis, Auth0, Stripe, etc.) with mock strategies. Results are stored in Supabase and in the client store.

2. **Scenarios** (`/scenarios`) — User selects 1–8 business features. “Configure data” calls `/api/palette` with selected features, roles, entities, and external dependencies. An LLM returns a **palette config** (controls: select, slider, toggle) that define what mock data can be tuned. Selection is saved and user is sent to the palette page.

3. **Data palette** (`/palette`) — Renders the AI-generated controls (e.g. user count, invoice status, payment success rate). User adjusts values and clicks “Continue to generate.” Values are stored and user is sent to the generate page.

4. **Generate** (`/generate`) — Shows an overview of chosen features and palette inputs. “Generate sandbox”:
   - Calls `/api/mock` with Docker analysis + palette values → LLM produces a **mock plan** (env overrides, seed files, HTTP stubs per dependency).
   - Calls `/api/generate` with Docker analysis + mock plan → LLM produces **Dockerfile**, optional **docker-compose**, **.env.sandbox**, **entrypoint.sh**, and seed files. Summary indicates CodeSandbox readiness and exposed ports.

### Features

- **Single-URL onboarding**: One GitHub URL drives both product analysis and sandbox analysis.
- **Business-level feature extraction**: LLM describes features and roles in sales-friendly language, not just tech labels.
- **Dependency inference**: Detects databases (Postgres, MongoDB, MySQL, SQLite), caches (Redis), auth (Auth0, NextAuth, Clerk, Supabase, Firebase, Lucia), payments (Stripe, Lemon Squeezy), email, SMS, storage (S3, MinIO, Cloudinary, UploadThing), AI (OpenAI, Anthropic, Replicate), queues (BullMQ, RabbitMQ, Kafka), search (Algolia, Elasticsearch, Typesense), and analytics — each with a concrete mock strategy.
- **Palette-driven mock data**: User choices (e.g. “5 users”, “invoice status: sent”) are passed into the mock generator so seed data and stubs match the demo scenario.
- **Full Docker artifact output**: Production-style Dockerfile (multi-stage when needed), compose for sidecars, env file, and entrypoint for DB wait + migrations.
- **Session persistence**: Supabase stores session, repo context, analysis result, Docker context, and Docker analysis for later use.

### Novel aspects

- **Two-phase analysis**: Product semantics (features, roles, entities) and infra semantics (dependencies, commands, ports) are separate; the palette LLM ties them together by suggesting controls that affect mock data relevant to the selected features and dependencies.
- **Single source of truth for “what to mock”**: `aiForDocker` infers a list of external dependencies with types and strategies; that list feeds both the palette (what can be controlled) and the mock generator (how to generate seeds and stubs).

---

## How we built it — Technology Stack

### Languages

- **TypeScript** (app, API routes, libs)
- **HTML/CSS** (Tailwind for UI; generated sandbox HTML is inline when used)

### Frameworks and Libraries

- **Next.js 16** (App Router) — pages: `/`, `/scenarios`, `/palette`, `/generate`; API routes: `/api/analyse`, `/api/dockeranalyse`, `/api/palette`, `/api/mock`, `/api/generate`.
- **React 19** — client components for form state and navigation.
- **Zustand** — global session store (sessionId, repoUrl, result, dockerResult, selectedFeatureIds, paletteConfig, paletteValues).
- **Tailwind CSS 4** — styling (dark theme, indigo accents).
- **Supabase (JS client)** — session persistence; admin client for server-side inserts/updates.
- **OpenAI SDK** — all LLM calls (repo analysis, palette config, mock plan, Dockerfile generation); model used: `openai/gpt-oss-120b` (configurable via `OPENAI_BASE_URL`).

### Platforms

- **Vercel** (or any Node host) for the Next.js app.
- **Supabase** for database (sessions table).
- **GitHub API** for repo metadata, tree, and file contents (optional `GITHUB_TOKEN` for higher rate limits and private repos).
- **CodeSandbox** (target consumer of the generated Dockerfile and env).

### Tools + AI Use

- **AI for repo analysis** (`lib/ai.ts`): Takes repo name, description, language, topics, file tree, and key file contents; returns structured JSON (features, roles, entities, etc.). Includes robust JSON extraction (strip markdown, find first `{` to matching `}`, remove trailing commas).
- **AI for Docker context** (`lib/aiForDocker.ts`): No LLM here — rule-based inference from repo tree and file contents: languages, package managers, frameworks, install/build/start commands, ports, and a full list of external dependencies with type, service, mock strategy, env vars, and ORM when applicable. Produces `DockerSandboxAnalysis`.
- **AI for palette** (`lib/aipalette.ts`): Takes selected features, roles, entities, and external dependencies; returns a list of controls (id, group, type, label, description, default_value, options/min/max) so the UI can render toggles, selects, and sliders.
- **AI for mock plan** (`lib/mockgenerator.ts`): Takes `DockerSandboxAnalysis` and optional `paletteValues`; returns a mock plan per dependency: env overrides, seed files (SQL/JSON), HTTP stub routes. Palette values are injected into the prompt so the LLM can tailor record counts and statuses.
- **AI for Docker artifacts** (`lib/dockerfilemaker.ts`): Takes `DockerSandboxAnalysis` and `MockPlan`; returns Dockerfile, docker-compose (or null), .env.sandbox content, entrypoint script (or null), and a summary (base image, port, compose services, migration command, CodeSandbox-ready flag).
- **GitHub** (`lib/github.ts`, `lib/githubDocker.ts`): Repo URL parsing, context collection (tree + selected files for analyse), and full Docker-oriented context (tree, important config files, source file sampling) with service-hint extraction for `aiForDocker`. Uses `GITHUB_TOKEN` when set to avoid 403 rate limits.

---

## Challenges we ran into

- **GitHub API 403s**: Unauthenticated requests hit rate limits quickly; private repos require a token. We added clear error messages and documented `GITHUB_TOKEN`; the client uses the same token for both analyse and dockeranalyse flows where applicable.
- **LLM returning invalid JSON**: Repo analysis sometimes returned markdown-wrapped or slightly malformed JSON. We added a resilient parser: strip code fences, locate the outermost `{ ... }`, remove trailing commas, then parse, with better error messages for debugging.
- **Keeping product and infra in sync**: Features (business) and dependencies (infra) are produced by different pipelines. We made the palette step explicitly take both so the “control palette” is derived from selected features and external dependencies together, and the generate step uses the same Docker analysis and mock plan end to end.
- **Default branch and missing Docker context**: When GitHub metadata failed (e.g. 403), we improved `fetchDefaultBranch` to suggest setting `GITHUB_TOKEN` and to fall back to `"main"` when `default_branch` is missing.

---

## Accomplishments that we're proud of

- **End-to-end flow**: From repo URL to downloadable Dockerfile + compose + env in four clear steps, with no manual editing required.
- **Dependency coverage**: One codebase (`aiForDocker`) that infers a wide set of external services and assigns each a mock strategy, then reuses that list in palette and mock generation.
- **Palette values flow through to mock data**: The choices on the palette page are not just for display — they are passed into the mock generator so seed data and stubs reflect “user count”, “invoice status”, etc.
- **Structured, typed pipeline**: Session store and API contracts are typed (RepoAnalysisResult, DockerSandboxAnalysis, PaletteConfig, MockPlan, DockerfileArtifact), making it easier to add steps or change prompts without breaking the flow.
- **Graceful degradation**: Clear errors for missing Docker analysis or palette config; generate page explains when Docker analysis is missing and points users back to the home step.

---

## What we learned

- Separating “what the product does” (features, roles, entities) from “what the stack needs” (dependencies, commands) gives a cleaner pipeline and lets the palette LLM combine them in one place.
- Rule-based dependency inference (from file names, frameworks, and env vars) is reliable and avoids extra LLM calls for Docker context; LLMs are used where natural language and structure matter (features, palette, mock content, Dockerfile text).
- Resilient JSON parsing and explicit error messages save a lot of debugging when integrating with any LLM that might wrap or slightly corrupt JSON.
- Using a single session store (Zustand) for the whole wizard keeps the API simple: each route receives only what it needs (e.g. `dockerAnalysis` + `paletteValues` for mock, `dockerAnalysis` + `mockPlan` for generate), while the client keeps the full context.

---

## What's next for GenAI Genesis Hack 2026

- **CodeSandbox integration**: One-click “Open in CodeSandbox” with the generated Dockerfile and env, or use CodeSandbox’s API to create a box from the artifact.
- **Walkthrough step editor**: Use the repo analysis’s walkthrough_steps (or a new step) to define a guided demo script and optionally tie highlights to the generated sandbox UI.
- **Sandbox HTML**: Persist and serve the LLM-generated `sandbox_html` (or a variant) so users can preview a fake dashboard before opening the real repo in CodeSandbox.
- **Retry and partial results**: If Docker analysis fails (e.g. 403), still show repo analysis and allow “Generate without Docker” (e.g. env-only or instructions) or retry with backoff.
- **Templates**: Predefined palette presets (“demo for enterprise”, “empty state”, “high volume”) to seed palette values and speed up demos.

---

## Running the project (demoverse))

```bash
cd demoverse
npm install
cp .env.example .env.local   # if present
# Set: OPENAI_API_KEY, OPENAI_BASE_URL, NEXT_PUBLIC_SUPABASE_URL,
#      NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#      GITHUB_TOKEN (optional but recommended for GitHub API)
npm run dev
```

Open the app, paste a public GitHub repo URL, and follow the four steps: Analyse → Scenarios → Palette → Generate.
