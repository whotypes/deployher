export const LandingHeroPhotoLayer = () => {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="animate-hero-bg-drift absolute inset-[-12%] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/hero-bg.webp)" }}
      />
      <div className="absolute inset-0 bg-black/45" />
    </div>
  )
}
