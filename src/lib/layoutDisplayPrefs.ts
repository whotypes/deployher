export const LAYOUT_DISPLAY_PREF_KEYS = {
  contentWidth: "deployher-content-width",
  density: "deployher-density",
  ambient: "deployher-ambient"
} as const;

export type LayoutDisplayPrefKey = keyof typeof LAYOUT_DISPLAY_PREF_KEYS;

export const DEFAULT_LAYOUT_DISPLAY_PREFS = {
  contentWidth: "wide",
  density: "comfortable",
  ambient: "rich"
} as const;

export const readLayoutDisplayPref = (key: LayoutDisplayPrefKey): string => {
  if (typeof window === "undefined") {
    return DEFAULT_LAYOUT_DISPLAY_PREFS[key];
  }
  return window.localStorage.getItem(LAYOUT_DISPLAY_PREF_KEYS[key]) ?? DEFAULT_LAYOUT_DISPLAY_PREFS[key];
};

export const writeLayoutDisplayPref = (key: LayoutDisplayPrefKey, value: string): void => {
  window.localStorage.setItem(LAYOUT_DISPLAY_PREF_KEYS[key], value);
};

export const applyLayoutDisplayPrefsToDocument = (): void => {
  if (typeof document === "undefined") return;
  const body = document.body;
  body.dataset.contentWidth = readLayoutDisplayPref("contentWidth");
  body.dataset.density = readLayoutDisplayPref("density");
  body.dataset.ambient = readLayoutDisplayPref("ambient");
};
