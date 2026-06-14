import { timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { json } from "../http/helpers";

const timingSafeEqualStr = (a: string, b: string): boolean => {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
};

export const isRunnerSecretConfigured = (): boolean => Boolean((config.runner.sharedSecret ?? "").trim());

export const verifyRunnerSecretOrDeny = (req: Request): Response | null => {
  const expected = (config.runner.sharedSecret ?? "").trim();

  if (!expected) {
    if (config.env === "production") {
      return json({ error: "Runner secret not configured" }, { status: 503 });
    }
    return null;
  }

  const got = req.headers.get("x-deployher-runner-secret") ?? "";
  if (!timingSafeEqualStr(got, expected)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
};
