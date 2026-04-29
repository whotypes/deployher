export const requestUsesCliBearerAuth = (req: Request): boolean => {
  const raw = req.headers.get("authorization")?.trim() ?? "";
  return raw.length > 8 && raw.toLowerCase().startsWith("bearer ");
};
