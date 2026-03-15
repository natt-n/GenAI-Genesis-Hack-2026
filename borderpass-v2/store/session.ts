import { create } from "zustand";

export interface RepoAnalysisResult {
  [key: string]: any;
}

export interface DockerAnalysisResult {
  [key: string]: any;
}

interface SessionState {
  sessionId: string | null;
  repoUrl: string;
  result: RepoAnalysisResult | null;
  dockerResult: DockerAnalysisResult | null;
  selectedFeatureIds: string[];
  paletteValues: Record<string, any>;

  setSessionId: (id: string) => void;
  setRepoUrl: (url: string) => void;
  setResult: (result: RepoAnalysisResult | null) => void;
  setDockerResult: (result: DockerAnalysisResult | null) => void;
  setSelectedFeatureIds: (ids: string[]) => void;
  setPaletteValues: (values: Record<string, any>) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  repoUrl: "",
  result: null,
  dockerResult: null,
  selectedFeatureIds: [],
  paletteValues: {},

  setSessionId: (id) => set({ sessionId: id }),
  setRepoUrl: (url) => set({ repoUrl: url }),
  setResult: (result) => set({ result }),
  setDockerResult: (result) => set({ dockerResult: result }),
  setSelectedFeatureIds: (ids) => set({ selectedFeatureIds: ids }),
  setPaletteValues: (values) => set({ paletteValues: values }),

  reset: () =>
    set({
      sessionId: null,
      repoUrl: "",
      result: null,
      dockerResult: null,
      selectedFeatureIds: [],
      paletteValues: {},
    }),
}));