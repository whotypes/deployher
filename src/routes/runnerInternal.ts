import { json } from "../http/helpers";
import { rehydratePreviewRunnerAfterAppStart } from "../lib/previewRunnerRehydrate";
import { verifyRunnerSecretOrDeny } from "../security/requireRunnerSecret";

export const postTriggerPreviewRehydrate = async (req: Request): Promise<Response> => {
  const denied = verifyRunnerSecretOrDeny(req);
  if (denied) return denied;
  void rehydratePreviewRunnerAfterAppStart().catch((err) => {
    console.error("Preview runner rehydrate (trigger) failed:", err);
  });
  return json({ ok: true });
};
