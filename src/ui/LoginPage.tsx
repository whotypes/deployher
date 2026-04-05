import { renderToReadableStream } from "react-dom/server";
import { GitHubMark } from "./GitHubMark";
import { GoogleFontsLinks } from "./GoogleFontsLinks";

const oauthDescriptionMaxLen = 280;

const loginOauthUserMessage = (error: string | null, description: string | null): string | null => {
  const code = error?.trim() ?? "";
  const hasCode = code.length > 0;
  const descRaw = description?.trim() ?? "";
  if (!hasCode && !descRaw) return null;

  switch (code) {
    case "account_already_linked_to_different_user":
      return "That GitHub account is already linked to another Deployher user. Sign out at github.com/logout, or choose another GitHub account when prompted.";
    case "email_doesn't_match":
      return "GitHub’s email on this authorization did not match your Deployher email. If this persists, check GitHub → Settings → Email (primary address and “Keep my email addresses private”).";
    case "unable_to_link_account":
      return "We could not link GitHub. Try again from the dashboard.";
    case "state_mismatch":
    case "please_restart_the_process":
      return "The sign-in session expired. Try signing in again.";
    case "invalid_callback_request":
      return "The OAuth callback was invalid. Try signing in again.";
    default:
      break;
  }

  if (descRaw) {
    return descRaw.length > oauthDescriptionMaxLen
      ? `${descRaw.slice(0, oauthDescriptionMaxLen)}…`
      : descRaw;
  }
  if (hasCode) {
    return `Something went wrong (${code}). Please try again.`;
  }
  return null;
};

const buildLoginScript = (callbackURL: string): string =>
  `
(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.has("error") || params.has("error_description")) {
      params.delete("error");
      params.delete("error_description");
      var q = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (q ? "?" + q : "") + window.location.hash);
    }
  } catch (e) {}
  var btn = document.getElementById("sign-in");
  if (!btn) return;
  var callback = ${JSON.stringify(callbackURL)};
  btn.addEventListener("click", async function () {
    this.disabled = true;
    var res = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", callbackURL: callback })
    });
    if (res.redirected) {
      window.location.href = res.url;
      return;
    }
    var loc = res.headers.get("Location");
    if (loc) {
      window.location.href = loc;
      return;
    }
    var data = await res.json().catch(function () {
      return {};
    });
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    this.disabled = false;
    alert("Sign-in failed. Please try again.");
  });
})();
`.trim();

type LoginPageProps = {
  callbackURL: string;
  oauth?: { error: string | null; errorDescription: string | null; loggedIn?: boolean } | undefined;
};

const LoginPage = ({ callbackURL, oauth }: LoginPageProps) => {
  const loggedIn = oauth?.loggedIn ?? false;
  const oauthMessage =
    oauth !== undefined ? loginOauthUserMessage(oauth.error, oauth.errorDescription) : null;
  const showLoggedInOauthRecovery = loggedIn && oauthMessage;

  return (
    <html lang="en" className="dark font-sans">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#000000" />
        <title>Sign in · Deployher</title>
        <GoogleFontsLinks />
        <link rel="stylesheet" href="/assets/app.css" />
      </head>
      <body className="bg-background text-foreground min-h-svh font-sans">
        <a
          href={showLoggedInOauthRecovery ? "#continue-dashboard" : "#sign-in"}
          className="bg-background text-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {showLoggedInOauthRecovery ? "Skip to continue" : "Skip to sign in"}
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
              <p className="eyebrow-label deployher-enter mb-4">Authentication</p>
              <h1 className="font-serif text-pretty text-3xl font-semibold leading-[1.12] tracking-tight text-foreground md:text-4xl deployher-enter deployher-enter-delay-1">
                Sign in to Deployher
              </h1>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground deployher-enter deployher-enter-delay-2">
                Continue with GitHub to link your account and deploy from repositories you can access.
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
                    Continue to dashboard
                  </a>
                ) : (
                  <>
                    <button
                      id="sign-in"
                      type="button"
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--primary)_88%,black)] ring-1 ring-primary/35 transition-[opacity,transform] duration-200 hover:opacity-95 active:scale-[0.99] sm:w-auto"
                      aria-label="Sign in with GitHub"
                    >
                      <GitHubMark className="size-5 shrink-0" />
                      Sign in with GitHub
                    </button>
                    <p className="mt-3 font-mono text-xs text-muted-foreground">OAuth · repo-scoped access</p>
                  </>
                )}
              </div>
              <p className="mt-8 border-t border-border/60 pt-6 text-center text-sm text-muted-foreground">
                <a
                  href="/"
                  className="font-medium text-primary no-underline underline-offset-4 transition-colors hover:underline"
                >
                  ← Back to home
                </a>
              </p>
            </div>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: buildLoginScript(callbackURL) }} />
      </body>
    </html>
  );
};

export const renderLoginPage = (
  callbackURL: string,
  oauth?: { error: string | null; errorDescription: string | null; loggedIn?: boolean }
) => renderToReadableStream(<LoginPage callbackURL={callbackURL} oauth={oauth} />);
