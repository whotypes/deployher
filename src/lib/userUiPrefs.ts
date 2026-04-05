export const USER_UI_PREF_KEYS = {
  createMode: "deployher-project-create-mode",
  openAfterCreate: "deployher-open-after-create",
  preferredBranch: "deployher-preferred-branch"
} as const;

export type CreateModePref = "import" | "manual";

export const readOpenAfterCreate = (): boolean => {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(USER_UI_PREF_KEYS.openAfterCreate) !== "0";
};

export const writeOpenAfterCreate = (value: boolean): void => {
  window.localStorage.setItem(USER_UI_PREF_KEYS.openAfterCreate, value ? "1" : "0");
};

export const readPreferredBranch = (): string => {
  if (typeof window === "undefined") return "main";
  const v = window.localStorage.getItem(USER_UI_PREF_KEYS.preferredBranch)?.trim();
  return v && v.length > 0 ? v : "main";
};

export const writePreferredBranch = (value: string): void => {
  const trimmed = value.trim() || "main";
  window.localStorage.setItem(USER_UI_PREF_KEYS.preferredBranch, trimmed);
};

export const writeCreateModePref = (value: CreateModePref): void => {
  window.localStorage.setItem(USER_UI_PREF_KEYS.createMode, value);
};

export const readProjectsCreateModeInitial = (hasRepoAccess: boolean): CreateModePref => {
  if (typeof window === "undefined") return hasRepoAccess ? "import" : "manual";
  const raw = window.localStorage.getItem(USER_UI_PREF_KEYS.createMode);
  if (raw === "import" || raw === "manual") return raw;
  return hasRepoAccess ? "import" : "manual";
};
