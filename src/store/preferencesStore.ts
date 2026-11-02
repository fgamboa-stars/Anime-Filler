import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface PreferencesState {
  /** Blur episode titles to avoid spoilers until hovered/focused. */
  hideEpisodeTitles: boolean;
  /** Watch-order defaults. */
  includeMixed: boolean;
  includeAnimeCanon: boolean;
  /**
   * Last filter query string used per anime (e.g. "type=filler&arc=chunin-exams").
   * The URL is always the source of truth; this only powers "resume my last filters".
   */
  lastFilters: Record<string, string>;
  setHideEpisodeTitles: (v: boolean) => void;
  setIncludeMixed: (v: boolean) => void;
  setIncludeAnimeCanon: (v: boolean) => void;
  rememberFilters: (slug: string, search: string) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      hideEpisodeTitles: false,
      includeMixed: true,
      includeAnimeCanon: true,
      lastFilters: {},
      setHideEpisodeTitles: (hideEpisodeTitles) => set({ hideEpisodeTitles }),
      setIncludeMixed: (includeMixed) => set({ includeMixed }),
      setIncludeAnimeCanon: (includeAnimeCanon) => set({ includeAnimeCanon }),
      rememberFilters: (slug, search) =>
        set((s) => {
          if ((s.lastFilters[slug] ?? '') === search) return s;
          const lastFilters = { ...s.lastFilters };
          if (search) lastFilters[slug] = search;
          else delete lastFilters[slug];
          return { lastFilters };
        }),
    }),
    { name: 'aff:preferences', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);
