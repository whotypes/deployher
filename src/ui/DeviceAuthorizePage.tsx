import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "@/spa/routerCompat";
import { fetchWithCsrf } from "@/ui/client/fetchWithCsrf";

type FlowState = "loading" | "needs_login" | "ready" | "submitting" | "done" | "error";

export const DeviceAuthorizePage = () => {
  const [state, setState] = useState<FlowState>("loading");
  const [message, setMessage] = useState<string>("");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userCode = searchParams.get("user_code")?.trim() ?? "";

  const devicePathWithCode = useCallback(() => {
    const next = userCode ? `/device?user_code=${encodeURIComponent(userCode)}` : "/device";
    return next;
  }, [userCode]);

  useEffect(() => {
    if (!userCode) {
      setState("error");
      setMessage("Missing user_code.");
      return;
    }

    const verifySession = async () => {
      const sessionRes = await fetchWithCsrf("/api/session");
      const body = (await sessionRes.json()) as { user: { id: string } | null };
      if (!body.user) {
        setState("needs_login");
        return;
      }
      setState("ready");
    };

    void verifySession();
  }, [userCode]);

  useEffect(() => {
    if (state !== "needs_login" || !userCode) return;
    const redirect = encodeURIComponent(devicePathWithCode());
    navigate(`/login?redirect=${redirect}`, { replace: true });
  }, [devicePathWithCode, navigate, state, userCode]);

  const handleApprove = async () => {
    if (!userCode) return;
    setState("submitting");
    setMessage("");
    try {
      const res = await fetchWithCsrf("/api/auth/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode })
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error_description?: string; message?: string } | null;
        setState("error");
        setMessage(errBody?.error_description ?? errBody?.message ?? `Request failed (${res.status})`);
        return;
      }
      setState("done");
      setMessage("Approved. You can return to the terminal.");
    } catch {
      setState("error");
      setMessage("Network error.");
    }
  };

  const handleDeny = async () => {
    if (!userCode) return;
    setState("submitting");
    setMessage("");
    try {
      const res = await fetchWithCsrf("/api/auth/device/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode })
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error_description?: string; message?: string } | null;
        setState("error");
        setMessage(errBody?.error_description ?? errBody?.message ?? `Request failed (${res.status})`);
        return;
      }
      setState("done");
      setMessage("Denied.");
    } catch {
      setState("error");
      setMessage("Network error.");
    }
  };

  if (state === "loading" || state === "needs_login") {
    return (
      <div className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Authorize CLI</h1>
        <p className="text-muted-foreground text-sm">
          Code <span className="text-foreground font-mono">{userCode}</span>
        </p>
      </div>
      {state === "error" ? (
        <p className="text-destructive max-w-md text-center text-sm" role="alert">
          {message}
        </p>
      ) : null}
      {state === "done" ? (
        <p className="text-muted-foreground max-w-md text-center text-sm">{message}</p>
      ) : null}
      {state === "ready" || state === "submitting" ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={state === "submitting"}
            onClick={() => void handleApprove()}
          >
            Approve
          </button>
          <button
            type="button"
            className="border-input bg-background hover:bg-accent rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={state === "submitting"}
            onClick={() => void handleDeny()}
          >
            Deny
          </button>
        </div>
      ) : null}
    </div>
  );
};
