/**
 * Reads a JSON bootstrap payload from a script#id element (SSR pattern).
 * Use with dangerouslySetInnerHTML JSON.stringify(...).replace(/</g, "\\u003c").
 */
export const readBootstrapJson = <T>(scriptId: string, fallback: T): T => {
  const el = document.getElementById(scriptId);
  const raw = el?.textContent?.trim();
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};
