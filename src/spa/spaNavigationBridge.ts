type SpaNavigateImpl = (to: string, options?: { replace?: boolean }) => void;

let spaNavigateImpl: SpaNavigateImpl | null = null;

export const setSpaNavigate = (fn: SpaNavigateImpl | null): void => {
  spaNavigateImpl = fn;
};

export const navigateSpa = (to: string, options?: { replace?: boolean }): void => {
  if (spaNavigateImpl) {
    spaNavigateImpl(to, options);
    return;
  }
  if (options?.replace) {
    window.location.replace(to);
    return;
  }
  window.location.assign(to);
};
