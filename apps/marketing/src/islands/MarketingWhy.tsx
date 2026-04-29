import { StrictMode } from "react";
import { I18nextProvider } from "react-i18next";
import { ThemeProvider } from "next-themes";
import { WhyPage } from "@/ui/WhyPage";
import { i18n } from "@/spa/i18n";
import "@/ui/client/globals.css";

export default function MarketingWhy() {
  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
          <WhyPage />
        </ThemeProvider>
      </I18nextProvider>
    </StrictMode>
  );
}
