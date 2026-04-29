export const parseRunnerPreviewEnabled = (
  flag: string | undefined,
  url: string | undefined
): boolean => {
  const f = (flag ?? "").trim().toLowerCase();
  if (f === "0" || f === "false" || f === "no" || f === "off") {
    return false;
  }
  if (f === "1" || f === "true" || f === "yes" || f === "on") {
    return true;
  }
  return (url ?? "").trim().length > 0;
};
