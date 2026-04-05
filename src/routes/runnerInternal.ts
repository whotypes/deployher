import { timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { json } from "../http/helpers";
import { rehydratePreviewRunnerAfterAppStart } from "../lib/previewRunnerRehydrate";

const verifyRunnerSecret = (req: Request): boolean => {
  const expected = (config.runner.sharedSecret ?? "").trim();
  if (!expected) {
    return true;
  }
  const got = req.headers.get("x-deployher-runner-secret") ?? "";
  try {
    const a = Buffer.from(got, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
};

export const postTriggerPreviewRehydrate = async (req: Request): Promise<Response> => {
  if (!verifyRunnerSecret(req)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  void rehydratePreviewRunnerAfterAppStart().catch((err) => {
    console.error("Preview runner rehydrate (trigger) failed:", err);
  });
  return json({ ok: true });
};
