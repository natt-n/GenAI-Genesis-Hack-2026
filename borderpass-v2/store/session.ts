import { create } from "zustand";

export interface AnalyseFeature {
  id: string;
  name: string;
  description: string;
  roles: string[];
  entities?: string[];
  routes?: string[];
  priority?: number;
}

export interface AnalysePaletteControl {
  id: string;
  feature_id?: string;
  feature_ids?: string[];
  group: string;
  type: "select" | "slider" | "toggle";
  label: string;
  description: string;
  options?: string[];
  min?: number;
  max?: number;
  default_value?: any;
}

export interface AnalyseRole {
  id: string;
  name: string;
  description: string;
}

export interface AnalyseEntityField {
  name: string;
  type: string;
}

export interface AnalyseEntity {
  name: string;
  fields: AnalyseEntityField[];
}

export interface AnalyseWalkthroughStep {
  step: number;
  feature_id: string;
  title: string;
  caption: string;
  route: string;
  highlight: string;
}

export interface AnalyseDependency {
  id: string;
  name: string;
  kind:
    | "database"
    | "cache"
    | "queue"
    | "auth"
    | "payments"
    | "email"
    | "storage"
    | "analytics"
    | "ai"
    | "external_api"
    | "webhook"
    | "unknown";
  mode: "real-local" | "mock" | "emulated" | "passthrough-disabled";
  evidence?: string[];
  env_vars?: string[];
  notes?: string;
}

export interface AnalyseRuntime {
  primary?: "node" | "python" | "go" | "ruby" | "php" | "unknown";
  framework?: string;
  package_manager?:
    | "npm"
    | "pnpm"
    | "yarn"
    | "pip"
    | "poetry"
    | "go modules"
    | "bundler"
    | "composer"
    | "unknown";
  port?: number;
  install_command?: string;
  build_command?: string;
  start_command?: string;
  needs_build_step?: boolean;
}

export interface AnalyseMockStrategy {
  summary?: string;
  feature_flags?: {
    selected_features_supported?: boolean;
    notes?: string;
  };
  seed_recommendations?: Array<{
    scenario_id: string;
    name: string;
    description: string;
    roles: string[];
  }>;
}

export interface AnalyseResult {
  app_name?: string;
  app_description?: string;
  compatibility?: "green" | "yellow" | "red";
  compatibility_reason?: string;
  app_type?: "frontend" | "backend" | "fullstack" | "unknown";
  features?: AnalyseFeature[];
  roles?: AnalyseRole[];
  entities?: AnalyseEntity[];
  palette_controls?: AnalysePaletteControl[];
  walkthrough_steps?: AnalyseWalkthroughStep[];
  sandbox_html?: string;
  runtime?: AnalyseRuntime;
  dependencies?: AnalyseDependency[];
  mock_strategy?: AnalyseMockStrategy;
}

export interface SessionState {
  sessionId: string | null;
  repoUrl: string;
  result: AnalyseResult | null;

  selectedFeatureIds: string[];
  paletteValues: Record<string, any>;

  buildPlan: Record<string, any> | null;
  dockerfile: string | null;
  composeFile: string | null;
  mockManifest: Record<string, any> | null;
  dockerStatus: string | null;

  setSessionId: (id: string | null) => void;
  setRepoUrl: (url: string) => void;
  setResult: (result: AnalyseResult | null) => void;

  setSelectedFeatureIds: (ids: string[]) => void;
  setPaletteValues: (values: Record<string, any>) => void;
  updatePaletteValue: (key: string, value: any) => void;

  setBuildPlan: (plan: Record<string, any> | null) => void;
  setDockerfile: (dockerfile: string | null) => void;
  setComposeFile: (composeFile: string | null) => void;
  setMockManifest: (manifest: Record<string, any> | null) => void;
  setDockerStatus: (status: string | null) => void;

  setAnalysisPayload: (payload: {
    sessionId?: string | null;
    repoUrl?: string;
    result?: AnalyseResult | null;
    buildPlan?: Record<string, any> | null;
    dockerfile?: string | null;
    composeFile?: string | null;
    mockManifest?: Record<string, any> | null;
    dockerStatus?: string | null;
  }) => void;

  resetSandboxArtifacts: () => void;
  reset: () => void;
}

const initialState = {
  sessionId: null,
  repoUrl: "",
  result: null,

  selectedFeatureIds: [],
  paletteValues: {},

  buildPlan: null,
  dockerfile: null,
  composeFile: null,
  mockManifest: null,
  dockerStatus: null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,

  setSessionId: (id) => set({ sessionId: id }),
  setRepoUrl: (url) => set({ repoUrl: url }),
  setResult: (result) => set({ result }),

  setSelectedFeatureIds: (ids) => set({ selectedFeatureIds: ids }),
  setPaletteValues: (values) => set({ paletteValues: values }),
  updatePaletteValue: (key, value) =>
    set((state) => ({
      paletteValues: {
        ...state.paletteValues,
        [key]: value,
      },
    })),

  setBuildPlan: (plan) => set({ buildPlan: plan }),
  setDockerfile: (dockerfile) => set({ dockerfile }),
  setComposeFile: (composeFile) => set({ composeFile }),
  setMockManifest: (manifest) => set({ mockManifest: manifest }),
  setDockerStatus: (status) => set({ dockerStatus: status }),

  setAnalysisPayload: (payload) =>
    set((state) => ({
      sessionId: payload.sessionId ?? state.sessionId,
      repoUrl: payload.repoUrl ?? state.repoUrl,
      result: payload.result ?? state.result,
      buildPlan: payload.buildPlan ?? state.buildPlan,
      dockerfile: payload.dockerfile ?? state.dockerfile,
      composeFile: payload.composeFile ?? state.composeFile,
      mockManifest: payload.mockManifest ?? state.mockManifest,
      dockerStatus: payload.dockerStatus ?? state.dockerStatus,
    })),

  resetSandboxArtifacts: () =>
    set({
      buildPlan: null,
      dockerfile: null,
      composeFile: null,
      mockManifest: null,
      dockerStatus: null,
    }),

  reset: () => set(initialState),
}));
