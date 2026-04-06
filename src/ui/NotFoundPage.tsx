import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export const NotFoundPage = () => {
  const { t } = useTranslation();
  return (
    <div className="bg-background text-foreground min-h-svh font-sans">
      <div className="flex min-h-svh flex-col items-center justify-center px-4 py-16">
        <div className="dashboard-surface w-full max-w-md px-8 py-10 text-center">
          <p className="eyebrow-label mb-3">{t("notFound.eyebrow")}</p>
          <p
            className="font-serif text-[clamp(4.5rem,18vw,7rem)] font-semibold leading-none tracking-tight text-primary/90"
            aria-hidden="true"
          >
            404
          </p>
          <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight text-foreground">{t("notFound.title")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t("notFound.body")}</p>
          <Link
            to="/dashboard"
            className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground no-underline ring-1 ring-primary/30 transition-[opacity,transform] duration-200 hover:no-underline hover:opacity-95 active:scale-[0.99]"
            aria-label={t("notFound.goDashboardAria")}
          >
            {t("notFound.backDashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
};
