import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GitHubMark } from "./GitHubMark";

const oauthDescriptionMaxLen = 280;

const loginOauthUserMessage = (
  error: string | null,
  description: string | null,
  t: TFunction<"translation", undefined>
): string | null => {
  const code = error?.trim() ?? "";
  const hasCode = code.length > 0;
  const descRaw = description?.trim() ?? "";
  if (!hasCode && !descRaw) return null;

  switch (code) {
    case "account_already_linked_to_different_user":
      return t("login.oauth.accountAlreadyLinked");
    case "email_doesn't_match":
      return t("login.oauth.emailMismatch");
    case "unable_to_link_account":
      return t("login.oauth.unableToLink");
    case "state_mismatch":
    case "please_restart_the_process":
      return t("login.oauth.sessionExpired");
    case "invalid_callback_request":
      return t("login.oauth.invalidCallback");
    default:
      break;
  }

  if (descRaw) {
    return descRaw.length > oauthDescriptionMaxLen
      ? `${descRaw.slice(0, oauthDescriptionMaxLen)}…`
      : descRaw;
  }
  if (hasCode) {
    return t("login.oauth.genericWithCode", { code });
  }
  return null;
};

type LoginPageProps = {
  callbackURL: string;
  oauth?: { error: string | null; errorDescription: string | null; loggedIn?: boolean } | undefined;
};

export const LoginPage = ({ callbackURL, oauth }: LoginPageProps) => {
  const { t } = useTranslation();
  const loggedIn = oauth?.loggedIn ?? false;
  const oauthMessage =
    oauth !== undefined ? loginOauthUserMessage(oauth.error, oauth.errorDescription, t) : null;
  const showLoggedInOauthRecovery = loggedIn && oauthMessage;

  const handleSignInClick = useCallback(async () => {
    const btn = document.getElementById("sign-in");
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.disabled = true;
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", callbackURL })
    });
    if (res.redirected) {
      window.location.href = res.url;
      return;
    }
    const loc = res.headers.get("Location");
    if (loc) {
      window.location.href = loc;
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { url?: string };
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    btn.disabled = false;
    window.alert(t("login.signInFailed"));
  }, [callbackURL, t]);

  return (
    <div className="bg-background text-foreground min-h-svh font-sans">
      <a
        href={showLoggedInOauthRecovery ? "#continue-dashboard" : "#sign-in"}
        className="bg-background text-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {showLoggedInOauthRecovery ? t("login.skipContinue") : t("login.skipSignIn")}
      </a>
      <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          aria-hidden
          style={{
            backgroundImage: `linear-gradient(color-mix(in oklab, var(--foreground) 18%, transparent) 1px, transparent 1px),
              linear-gradient(90deg, color-mix(in oklab, var(--foreground) 18%, transparent) 1px, transparent 1px)`,
            backgroundSize: "56px 56px"
          }}
        />
        <div
          className="pointer-events-none absolute -left-1/4 top-1/4 h-[min(520px,70vw)] w-[min(520px,70vw)] rounded-full blur-3xl"
          style={{ background: "color-mix(in oklab, var(--primary) 28%, transparent)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-1/4 bottom-0 h-[min(420px,60vw)] w-[min(420px,60vw)] rounded-full blur-3xl"
          style={{ background: "color-mix(in oklab, var(--chart-2) 22%, transparent)" }}
          aria-hidden
        />

        <div className="relative z-1 w-full max-w-lg">
          <div className="dashboard-surface relative overflow-hidden p-8 md:p-10">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent"
              aria-hidden
            />
            <p className="eyebrow-label deployher-enter mb-4">{t("login.eyebrow")}</p>
            <h1 className="font-serif text-pretty text-3xl font-semibold leading-[1.12] tracking-tight text-foreground md:text-4xl deployher-enter deployher-enter-delay-1">
              {t("login.title")}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground deployher-enter deployher-enter-delay-2">
              {t("login.subtitle")}
            </p>
            {oauthMessage ? (
              <p
                role="alert"
                className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-relaxed text-destructive deployher-enter deployher-enter-delay-2"
              >
                {oauthMessage}
              </p>
            ) : null}
            <div className="mt-8 deployher-enter deployher-enter-delay-3">
              {showLoggedInOauthRecovery ? (
                <a
                  id="continue-dashboard"
                  href={callbackURL}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--primary)_88%,black)] ring-1 ring-primary/35 transition-[opacity,transform] duration-200 hover:opacity-95 active:scale-[0.99] sm:w-auto"
                >
                  {t("login.continueDashboard")}
                </a>
              ) : (
                <>
                  <button
                    id="sign-in"
                    type="button"
                    onClick={handleSignInClick}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--primary)_88%,black)] ring-1 ring-primary/35 transition-[opacity,transform] duration-200 hover:opacity-95 active:scale-[0.99] sm:w-auto"
                    aria-label={t("login.signInGithubAria")}
                  >
                    <GitHubMark className="size-5 shrink-0" />
                    {t("login.signInGithub")}
                  </button>
                  <p className="mt-3 font-mono text-xs text-muted-foreground">{t("common.oauthRepoScopedAccess")}</p>
                </>
              )}
            </div>
            <p className="mt-8 border-t border-border/60 pt-6 text-center text-sm text-muted-foreground">
              <Link to="/" className="font-medium text-primary no-underline underline-offset-4 transition-colors hover:underline">
                {t("login.backHome")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LoginRouteInner = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [sessionUser, setSessionUser] = useState(false);

  const oauthCapture = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return { error: p.get("error"), errorDescription: p.get("error_description") };
  }, []);

  useEffect(() => {
    void fetch("/api/session", { credentials: "include" })
      .then((r) => r.json() as Promise<{ user: unknown }>)
      .then((j) => setSessionUser(j.user != null))
      .catch(() => setSessionUser(false));
  }, []);

  useEffect(() => {
    if (!searchParams.has("error") && !searchParams.has("error_description")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("error");
    next.delete("error_description");
    navigate({ search: next.toString() ? `?${next.toString()}` : "" }, { replace: true });
  }, [navigate, searchParams]);

  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const callbackURL = `${window.location.origin}${redirect.startsWith("/") ? redirect : `/${redirect}`}`;

  const oauth = {
    error: oauthCapture.error,
    errorDescription: oauthCapture.errorDescription,
    loggedIn: sessionUser
  };

  return <LoginPage callbackURL={callbackURL} oauth={oauth} />;
};
