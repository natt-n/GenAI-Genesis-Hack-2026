import { create } from "zustand";
import type { DockerSandboxAnalysis } from "@/lib/aiForDocker";

// ---------------------------------------------------------------------------
// RepoAnalysisResult — mirrors exactly what lib/ai.ts returns.
// lib/ai.ts exports no named type so we define it here.
// ---------------------------------------------------------------------------
export interface RepoFeature {
  id: string;
  name: string;
  description: string;
  roles: string[];
}

export interface RepoRole {
  id: string;
  name: string;
  description: string;
}

export interface RepoEntity {
  name: string;
  fields: { name: string; type: string }[];
}

export interface RepoAnalysisResult {
  app_name: string;
  app_description: string;
  compatibility: "green" | "yellow" | "red";
  compatibility_reason: string;
  features: RepoFeature[];
  roles: RepoRole[];
  entities: RepoEntity[];
  // palette_controls, walkthrough_steps and sandbox_html are NOT present here —
  // they are generated later by separate API calls after user input.
}

// ---------------------------------------------------------------------------
// PaletteControl — mirrors what generatePaletteConfig returns.
// Defined here so palette/page.tsx can import from the store rather than
// from a lib file that may not exist yet.
// ---------------------------------------------------------------------------
export interface PaletteControl {
  id: string;
  group: string;
  type: "select" | "slider" | "toggle";
  label: string;
  description: string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  default_value: string | number | boolean;
  value: string | number | boolean | null;
}

export interface PaletteConfig {
  controls: PaletteControl[];
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
interface SessionState {
  // Set after api/analyse completes
  sessionId: string | null;
  repoUrl: string;
  result: RepoAnalysisResult | null;          // from lib/ai.ts
  dockerResult: DockerSandboxAnalysis | null; // from lib/aiForDocker.ts

  // Set after scenarios/page — user picks 1-8 features
  selectedFeatureIds: string[];

  // Set after api/palette — LLM generates controls for chosen features + deps
  paletteConfig: PaletteConfig | null;

  // Set after palette/page — user fills in values
  paletteValues: Record<string, string | number | boolean>;

  // Actions
  setSessionId: (id: string) => void;
  setRepoUrl: (url: string) => void;
  setResult: (result: RepoAnalysisResult | null) => void;
  setDockerResult: (result: DockerSandboxAnalysis | null) => void;
  setSelectedFeatureIds: (ids: string[]) => void;
  setPaletteConfig: (config: PaletteConfig | null) => void;
  setPaletteValues: (values: Record<string, string | number | boolean>) => void;
  reset: () => void;
}

const initialState = {
  sessionId: null,
  repoUrl: "",
  result: null,
  dockerResult: null,
  selectedFeatureIds: [],
  paletteConfig: null,
  paletteValues: {},
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setRepoUrl: (url) => set({ repoUrl: url }),
  setResult: (result) => set({ result }),
  setDockerResult: (result) => set({ dockerResult: result }),
  setSelectedFeatureIds: (ids) => set({ selectedFeatureIds: ids }),
  setPaletteConfig: (config) => set({ paletteConfig: config }),
  setPaletteValues: (values) => set({ paletteValues: values }),
  reset: () => set(initialState),
}));