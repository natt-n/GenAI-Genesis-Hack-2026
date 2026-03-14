import { create } from "zustand";

interface SessionState {
  sessionId: string | null;
  repoUrl: string;
  result: any | null;
  selectedFeatureIds: string[];
  paletteValues: Record<string, any>;
  setSessionId: (id: string) => void;
  setRepoUrl: (url: string) => void;
  setResult: (result: any) => void;
  setSelectedFeatureIds: (ids: string[]) => void;
  setPaletteValues: (values: Record<string, any>) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  repoUrl: "",
  result: null,
  selectedFeatureIds: [],
  paletteValues: {},
  setSessionId: (id) => set({ sessionId: id }),
  setRepoUrl: (url) => set({ repoUrl: url }),
  setResult: (result) => set({ result }),
  setSelectedFeatureIds: (ids) => set({ selectedFeatureIds: ids }),
  setPaletteValues: (values) => set({ paletteValues: values }),
  reset: () =>
    set({
      sessionId: null,
      repoUrl: "",
      result: null,
      selectedFeatureIds: [],
      paletteValues: {},
    }),
}));