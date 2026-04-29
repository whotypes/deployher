"use client";

import type { TFunction } from "i18next";
import { Eye, EyeOff, Mail, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitHubMark } from "./GitHubMark";

const oauthDescriptionMaxLen = 280;
const characterFill = "#050505";
const characterBorder = "rgba(255,255,255,0.82)";
const characterFeature = "#ffffff";
const characterFeatureDark = "#050505";

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

type PupilProps = {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
};

type EyeBallProps = {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
};

type CharacterPosition = {
  faceX: number;
  faceY: number;
  bodySkew: number;
};

const Pupil = ({
  size = 12,
  maxDistance = 5,
  pupilColor = characterFeatureDark,
  forceLookX,
  forceLookY
}: PupilProps) => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMouseX(event.clientX);
      setMouseY(event.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const calculatePupilPosition = () => {
    if (!pupilRef.current) return { x: 0, y: 0 };

    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }

    const pupil = pupilRef.current.getBoundingClientRect();
    const pupilCenterX = pupil.left + pupil.width / 2;
    const pupilCenterY = pupil.top + pupil.height / 2;
    const deltaX = mouseX - pupilCenterX;
    const deltaY = mouseY - pupilCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance
    };
  };

  const pupilPosition = calculatePupilPosition();

  return (
    <div
      ref={pupilRef}
      className="rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
        transition: "transform 0.1s ease-out"
      }}
    />
  );
};

const EyeBall = ({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = characterFeature,
  pupilColor = characterFeatureDark,
  isBlinking = false,
  forceLookX,
  forceLookY
}: EyeBallProps) => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMouseX(event.clientX);
      setMouseY(event.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const calculatePupilPosition = () => {
    if (!eyeRef.current) return { x: 0, y: 0 };

    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }

    const eye = eyeRef.current.getBoundingClientRect();
    const eyeCenterX = eye.left + eye.width / 2;
    const eyeCenterY = eye.top + eye.height / 2;
    const deltaX = mouseX - eyeCenterX;
    const deltaY = mouseY - eyeCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance
    };
  };

  const pupilPosition = calculatePupilPosition();

  return (
    <div
      ref={eyeRef}
      className="flex items-center justify-center rounded-full transition-all duration-150"
      style={{
        width: `${size}px`,
        height: isBlinking ? "2px" : `${size}px`,
        backgroundColor: eyeColor,
        overflow: "hidden"
      }}
    >
      {!isBlinking ? (
        <div
          className="rounded-full"
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
            transition: "transform 0.1s ease-out"
          }}
        />
      ) : null}
    </div>
  );
};

export const LoginPage = ({ callbackURL, oauth }: LoginPageProps) => {
  const { t } = useTranslation();
  const loggedIn = oauth?.loggedIn ?? false;
  const oauthMessage =
    oauth !== undefined ? loginOauthUserMessage(oauth.error, oauth.errorDescription, t) : null;
  const showLoggedInOauthRecovery = loggedIn && oauthMessage;
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isBlackBlinking, setIsBlackBlinking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMouseX(event.clientX);
      setMouseY(event.clientY);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    let blinkEndTimeout: ReturnType<typeof setTimeout> | undefined;

    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(
        () => {
          setIsPurpleBlinking(true);
          blinkEndTimeout = setTimeout(() => {
            setIsPurpleBlinking(false);
            scheduleBlink();
          }, 150);
        },
        Math.random() * 4000 + 3000
      );

      return blinkTimeout;
    };

    const blinkTimeout = scheduleBlink();

    return () => {
      clearTimeout(blinkTimeout);
      if (blinkEndTimeout !== undefined) clearTimeout(blinkEndTimeout);
    };
  }, []);

  useEffect(() => {
    let blinkEndTimeout: ReturnType<typeof setTimeout> | undefined;

    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(
        () => {
          setIsBlackBlinking(true);
          blinkEndTimeout = setTimeout(() => {
            setIsBlackBlinking(false);
            scheduleBlink();
          }, 150);
        },
        Math.random() * 4000 + 3000
      );

      return blinkTimeout;
    };

    const blinkTimeout = scheduleBlink();

    return () => {
      clearTimeout(blinkTimeout);
      if (blinkEndTimeout !== undefined) clearTimeout(blinkEndTimeout);
    };
  }, []);

  useEffect(() => {
    if (!isTyping) {
      setIsLookingAtEachOther(false);
      return;
    }

    setIsLookingAtEachOther(true);
    const timer = setTimeout(() => {
      setIsLookingAtEachOther(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [isTyping]);

  useEffect(() => {
    if (password.length === 0 || !showPassword) {
      setIsPurplePeeking(false);
      return;
    }

    const peekTimeout = setTimeout(
      () => {
        setIsPurplePeeking(true);
        window.setTimeout(() => {
          setIsPurplePeeking(false);
        }, 800);
      },
      Math.random() * 3000 + 2000
    );

    return () => clearTimeout(peekTimeout);
  }, [password, showPassword, isPurplePeeking]);

  const calculatePosition = (ref: RefObject<HTMLDivElement | null>): CharacterPosition => {
    if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;
    const deltaX = mouseX - centerX;
    const deltaY = mouseY - centerY;

    return {
      faceX: Math.max(-15, Math.min(15, deltaX / 20)),
      faceY: Math.max(-10, Math.min(10, deltaY / 30)),
      bodySkew: Math.max(-6, Math.min(6, -deltaX / 120))
    };
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setIsLoading(true);
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    setIsLoading(false);
    setFormError("Email and password sign-in is not enabled yet. Please continue with GitHub.");
  };

  const purplePos = calculatePosition(purpleRef);
  const blackPos = calculatePosition(blackRef);
  const yellowPos = calculatePosition(yellowRef);
  const orangePos = calculatePosition(orangeRef);
  const isPasswordVisibleWithValue = password.length > 0 && showPassword;
  const isPasswordHiddenWithValue = password.length > 0 && !showPassword;

  return (
    <div className="min-h-svh bg-background text-foreground font-sans">
      <a
        href={showLoggedInOauthRecovery ? "#continue-dashboard" : "#sign-in"}
        className="bg-background text-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {showLoggedInOauthRecovery ? t("login.skipContinue") : t("login.skipSignIn")}
      </a>
      <div className="grid min-h-svh lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-linear-to-br from-primary/90 via-primary to-primary/80 p-12 text-primary-foreground lg:flex">
          <div className="relative z-20">
            <Link
              to="/"
              className="flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/90 px-3 py-2 text-lg font-semibold text-black shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-black text-white">
                <Sparkles className="size-4" />
              </span>
              <span>{t("common.deployherBrand")}</span>
            </Link>
          </div>

          <div className="relative z-20 flex h-[500px] items-end justify-center" aria-hidden>
            <div className="relative" style={{ width: "550px", height: "400px" }}>
              <div
                ref={purpleRef}
                className="absolute bottom-0 transition-all duration-700 ease-in-out"
                style={{
                  left: "70px",
                  width: "180px",
                  height: isTyping || isPasswordHiddenWithValue ? "440px" : "400px",
                  backgroundColor: characterFill,
                  border: `2px solid ${characterBorder}`,
                  borderRadius: "10px 10px 0 0",
                  zIndex: 1,
                  transform: isPasswordVisibleWithValue
                    ? "skewX(0deg)"
                    : isTyping || isPasswordHiddenWithValue
                      ? `skewX(${purplePos.bodySkew - 12}deg) translateX(40px)`
                      : `skewX(${purplePos.bodySkew}deg)`,
                  transformOrigin: "bottom center"
                }}
              >
                <div
                  className="absolute flex gap-8 transition-all duration-700 ease-in-out"
                  style={{
                    left: isPasswordVisibleWithValue
                      ? "20px"
                      : isLookingAtEachOther
                        ? "55px"
                        : `${45 + purplePos.faceX}px`,
                    top: isPasswordVisibleWithValue
                      ? "35px"
                      : isLookingAtEachOther
                        ? "65px"
                        : `${40 + purplePos.faceY}px`
                  }}
                >
                  <EyeBall
                    size={18}
                    pupilSize={7}
                    maxDistance={5}
                    eyeColor={characterFeature}
                    pupilColor={characterFeatureDark}
                    isBlinking={isPurpleBlinking}
                    forceLookX={isPasswordVisibleWithValue ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
                    forceLookY={isPasswordVisibleWithValue ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
                  />
                  <EyeBall
                    size={18}
                    pupilSize={7}
                    maxDistance={5}
                    eyeColor={characterFeature}
                    pupilColor={characterFeatureDark}
                    isBlinking={isPurpleBlinking}
                    forceLookX={isPasswordVisibleWithValue ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
                    forceLookY={isPasswordVisibleWithValue ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
                  />
                </div>
              </div>

              <div
                ref={blackRef}
                className="absolute bottom-0 transition-all duration-700 ease-in-out"
                style={{
                  left: "240px",
                  width: "120px",
                  height: "310px",
                  backgroundColor: characterFill,
                  border: `2px solid ${characterBorder}`,
                  borderRadius: "8px 8px 0 0",
                  zIndex: 2,
                  transform: isPasswordVisibleWithValue
                    ? "skewX(0deg)"
                    : isLookingAtEachOther
                      ? `skewX(${blackPos.bodySkew * 1.5 + 10}deg) translateX(20px)`
                      : isTyping || isPasswordHiddenWithValue
                        ? `skewX(${blackPos.bodySkew * 1.5}deg)`
                        : `skewX(${blackPos.bodySkew}deg)`,
                  transformOrigin: "bottom center"
                }}
              >
                <div
                  className="absolute flex gap-6 transition-all duration-700 ease-in-out"
                  style={{
                    left: isPasswordVisibleWithValue
                      ? "10px"
                      : isLookingAtEachOther
                        ? "32px"
                        : `${26 + blackPos.faceX}px`,
                    top: isPasswordVisibleWithValue
                      ? "28px"
                      : isLookingAtEachOther
                        ? "12px"
                        : `${32 + blackPos.faceY}px`
                  }}
                >
                  <EyeBall
                    size={16}
                    pupilSize={6}
                    maxDistance={4}
                    eyeColor={characterFeature}
                    pupilColor={characterFeatureDark}
                    isBlinking={isBlackBlinking}
                    forceLookX={isPasswordVisibleWithValue ? -4 : isLookingAtEachOther ? 0 : undefined}
                    forceLookY={isPasswordVisibleWithValue ? -4 : isLookingAtEachOther ? -4 : undefined}
                  />
                  <EyeBall
                    size={16}
                    pupilSize={6}
                    maxDistance={4}
                    eyeColor={characterFeature}
                    pupilColor={characterFeatureDark}
                    isBlinking={isBlackBlinking}
                    forceLookX={isPasswordVisibleWithValue ? -4 : isLookingAtEachOther ? 0 : undefined}
                    forceLookY={isPasswordVisibleWithValue ? -4 : isLookingAtEachOther ? -4 : undefined}
                  />
                </div>
              </div>

              <div
                ref={orangeRef}
                className="absolute bottom-0 transition-all duration-700 ease-in-out"
                style={{
                  left: "0px",
                  width: "240px",
                  height: "200px",
                  zIndex: 3,
                  backgroundColor: characterFill,
                  border: `2px solid ${characterBorder}`,
                  borderRadius: "120px 120px 0 0",
                  transform: isPasswordVisibleWithValue ? "skewX(0deg)" : `skewX(${orangePos.bodySkew}deg)`,
                  transformOrigin: "bottom center"
                }}
              >
                <div
                  className="absolute flex gap-8 transition-all duration-200 ease-out"
                  style={{
                    left: isPasswordVisibleWithValue ? "50px" : `${82 + orangePos.faceX}px`,
                    top: isPasswordVisibleWithValue ? "85px" : `${90 + orangePos.faceY}px`
                  }}
                >
                  <Pupil
                    size={12}
                    maxDistance={5}
                    pupilColor={characterFeature}
                    forceLookX={isPasswordVisibleWithValue ? -5 : undefined}
                    forceLookY={isPasswordVisibleWithValue ? -4 : undefined}
                  />
                  <Pupil
                    size={12}
                    maxDistance={5}
                    pupilColor={characterFeature}
                    forceLookX={isPasswordVisibleWithValue ? -5 : undefined}
                    forceLookY={isPasswordVisibleWithValue ? -4 : undefined}
                  />
                </div>
              </div>

              <div
                ref={yellowRef}
                className="absolute bottom-0 transition-all duration-700 ease-in-out"
                style={{
                  left: "310px",
                  width: "140px",
                  height: "230px",
                  backgroundColor: characterFill,
                  border: `2px solid ${characterBorder}`,
                  borderRadius: "70px 70px 0 0",
                  zIndex: 4,
                  transform: isPasswordVisibleWithValue ? "skewX(0deg)" : `skewX(${yellowPos.bodySkew}deg)`,
                  transformOrigin: "bottom center"
                }}
              >
                <div
                  className="absolute flex gap-6 transition-all duration-200 ease-out"
                  style={{
                    left: isPasswordVisibleWithValue ? "20px" : `${52 + yellowPos.faceX}px`,
                    top: isPasswordVisibleWithValue ? "35px" : `${40 + yellowPos.faceY}px`
                  }}
                >
                  <Pupil
                    size={12}
                    maxDistance={5}
                    pupilColor={characterFeature}
                    forceLookX={isPasswordVisibleWithValue ? -5 : undefined}
                    forceLookY={isPasswordVisibleWithValue ? -4 : undefined}
                  />
                  <Pupil
                    size={12}
                    maxDistance={5}
                    pupilColor={characterFeature}
                    forceLookX={isPasswordVisibleWithValue ? -5 : undefined}
                    forceLookY={isPasswordVisibleWithValue ? -4 : undefined}
                  />
                </div>
                <div
                  className="absolute h-[4px] w-20 rounded-full transition-all duration-200 ease-out"
                  style={{
                    left: isPasswordVisibleWithValue ? "10px" : `${40 + yellowPos.faceX}px`,
                    top: isPasswordVisibleWithValue ? "88px" : `${88 + yellowPos.faceY}px`,
                    backgroundColor: characterFeature
                  }}
                />
              </div>
            </div>
          </div>

          <div className="relative z-20 flex items-center gap-8 text-sm text-primary-foreground/60">
            <Link
              to="/"
              className="transition-colors hover:text-primary-foreground"
            >
              Privacy Policy
            </Link>
            <Link to="/" className="transition-colors hover:text-primary-foreground">
              Terms of Service
            </Link>
            <Link to="/" className="transition-colors hover:text-primary-foreground">
              Contact
            </Link>
          </div>

          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-size-[20px_20px]" />
          <div className="absolute right-1/4 top-1/4 size-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-1/4 left-1/4 size-96 rounded-full bg-white/5 blur-3xl" />
        </div>

        <div className="flex items-center justify-center bg-background p-8">
          <div className="w-full max-w-[420px]">
            <div className="mb-12 flex items-center justify-center gap-2 text-lg font-semibold lg:hidden">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="size-4 text-primary" />
              </span>
              <span>{t("common.deployherBrand")}</span>
            </div>

            <div className="mb-10 text-center">
              <h1 className="mb-2 text-3xl font-bold tracking-tight">Welcome back!</h1>
              <p className="text-sm text-muted-foreground">Please enter your details</p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="anna@gmail.com"
                  value={email}
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  required
                  className="h-12 border-border/60 bg-background focus-visible:border-primary"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    autoComplete="current-password"
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => setIsTyping(false)}
                    required
                    className="h-12 border-border/60 bg-background pr-10 focus-visible:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox id="remember" />
                  <Label htmlFor="remember" className="cursor-pointer text-sm font-normal">
                    Remember for 30 days
                  </Label>
                </div>
                <Link to="/" className="text-sm font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>

              {oauthMessage ? (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {oauthMessage}
                </p>
              ) : null}

              {formError ? (
                <p role="alert" className="rounded-lg border border-red-900/30 bg-red-950/20 p-3 text-sm text-red-400">
                  {formError}
                </p>
              ) : null}

              {showLoggedInOauthRecovery ? (
                <Button asChild size="lg" className="h-12 w-full text-base font-medium">
                  <a id="continue-dashboard" href={callbackURL}>
                    {t("login.continueDashboard")}
                  </a>
                </Button>
              ) : (
                <Button type="submit" className="h-12 w-full text-base font-medium" size="lg" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Log in"}
                </Button>
              )}
            </form>

            {!showLoggedInOauthRecovery ? (
              <div className="mt-6 space-y-3">
                <Button
                  id="sign-in"
                  type="button"
                  variant="outline"
                  className="h-12 w-full border-border/60 bg-background text-base font-medium hover:bg-accent"
                  onClick={handleSignInClick}
                  aria-label={t("login.signInGithubAria")}
                >
                  <GitHubMark className="mr-2 size-5" />
                  {t("login.signInGithub")}
                </Button>
                <p className="text-center font-mono text-xs leading-relaxed text-muted-foreground">
                  <Mail className="mr-1 inline size-3.5" aria-hidden />
                  {t("common.oauthRepoScopedAccess")}
                </p>
              </div>
            ) : null}

            <div className="mt-8 text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={handleSignInClick}
                className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Sign Up
              </button>
            </div>
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
