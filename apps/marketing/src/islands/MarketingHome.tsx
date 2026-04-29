import { StrictMode } from "react";
import { I18nextProvider } from "react-i18next";
import { ThemeProvider } from "next-themes";
import { LandingPage } from "@/ui/LandingPage";
import { i18n } from "@/spa/i18n";
import "@/ui/client/globals.css";

export default function MarketingHome() {
  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
          <LandingPage authenticated={false} />
        </ThemeProvider>
      </I18nextProvider>
    </StrictMode>
  );
}
