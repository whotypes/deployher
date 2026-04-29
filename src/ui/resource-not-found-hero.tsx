import { useId, type ReactNode } from "react";
import { Link } from "@/spa/routerCompat";
import { cn } from "@/lib/utils";

export const HeroBackdropShell = ({ children }: { children: ReactNode }): React.ReactElement => (
  <div className="relative min-h-svh w-full overflow-hidden bg-zinc-950 text-foreground">
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="animate-hero-bg-drift absolute inset-[-12%] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/hero-bg.webp)" }}
      />
      <div className="absolute inset-0 bg-linear-to-b from-black/50 via-black/60 to-black/75" />
    </div>
    <div className="relative z-10 flex min-h-svh flex-col items-center justify-center px-4 py-16">
      {children}
    </div>
  </div>
);

export type ResourceNotFoundHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: { to: string; label: string; ariaLabel?: string };
  secondaryCta?: { to: string; label: string; ariaLabel?: string };
  showStatus404?: boolean;
};

export const ResourceNotFoundHero = ({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  showStatus404 = true
}: ResourceNotFoundHeroProps): React.ReactElement => {
  const headingId = useId();
  return (
    <HeroBackdropShell>
      <article
        className={cn(
          "w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950/65 px-8 py-10 shadow-2xl shadow-black/40 backdrop-blur-md",
          "text-center md:px-10 md:py-12"
        )}
        aria-labelledby={headingId}
      >
        <p className="eyebrow-label mb-3 text-zinc-400">{eyebrow}</p>
        {showStatus404 ? (
          <p
            className="font-serif text-[clamp(4rem,16vw,6.5rem)] font-semibold leading-none tracking-tight text-white/90"
            aria-hidden="true"
          >
            404
          </p>
        ) : null}
        <h1
          id={headingId}
          className={cn(
            "font-serif text-2xl font-semibold tracking-tight text-white md:text-3xl",
            showStatus404 ? "mt-4" : "mt-1"
          )}
        >
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300 md:text-base">{description}</p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center">
          <Link
            to={primaryCta.to}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground no-underline ring-1 ring-primary/35 transition-[opacity,transform] duration-200 hover:no-underline hover:opacity-95 active:scale-[0.99]"
            aria-label={primaryCta.ariaLabel ?? primaryCta.label}
          >
            {primaryCta.label}
          </Link>
          {secondaryCta ? (
            <Link
              to={secondaryCta.to}
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white no-underline backdrop-blur-sm transition-[opacity,transform,background-color] duration-200 hover:bg-white/10 hover:no-underline active:scale-[0.99]"
              aria-label={secondaryCta.ariaLabel ?? secondaryCta.label}
            >
              {secondaryCta.label}
            </Link>
          ) : null}
        </div>
      </article>
    </HeroBackdropShell>
  );
};
