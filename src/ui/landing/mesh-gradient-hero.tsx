import { cn } from "@/lib/utils"

type LandingMeshGradientHeroProps = {
  className?: string
}

// css-only "lamp" + grid + noise. faster than webgl, less generic than mesh shaders.
export const LandingMeshGradientHero = ({ className }: LandingMeshGradientHeroProps) => {
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      {/* central glow disc */}
      <div
        className="absolute left-1/2 top-[-12%] h-176 w-176 -translate-x-1/2 rounded-full opacity-70 blur-[120px] dark:opacity-90"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--chart-2) 60%, transparent) 0%, transparent 70%)"
        }}
      />
      {/* twin conic cones — Linear-style lamp */}
      <div
        className="absolute left-1/2 top-0 h-112 w-5xl -translate-x-1/2 opacity-60 dark:opacity-80"
        style={{
          background:
            "conic-gradient(from 290deg at 50% 0%, transparent 0deg, color-mix(in oklab, var(--chart-2) 45%, transparent) 70deg, transparent 90deg)",
          maskImage: "linear-gradient(to bottom, black, transparent 78%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 78%)"
        }}
      />
      <div
        className="absolute left-1/2 top-0 h-112 w-5xl -translate-x-1/2 opacity-60 dark:opacity-80"
        style={{
          background:
            "conic-gradient(from 70deg at 50% 0%, transparent 0deg, color-mix(in oklab, var(--chart-2) 45%, transparent) 18deg, transparent 90deg)",
          maskImage: "linear-gradient(to bottom, black, transparent 78%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 78%)"
        }}
      />
      {/* hot horizontal seam at the top */}
      <div
        className="absolute left-1/2 top-20 h-px w-md -translate-x-1/2"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in oklab, var(--chart-2) 90%, white), transparent)",
          boxShadow: "0 0 28px 2px color-mix(in oklab, var(--chart-2) 60%, transparent)"
        }}
      />
    </div>
  )
}
