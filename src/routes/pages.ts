/** Legacy HTML route helpers — SPA migration: only `wantsHtml` remains for fallthrough. */

export const wantsHtml = (req: Request) => {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/html");
};
