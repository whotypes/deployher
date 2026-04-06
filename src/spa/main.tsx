import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "@/ui/client/globals.css";
import { i18n } from "./i18n";
import { App } from "./App";

const HtmlLang = () => {
  const { i18n: i18nInstance } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18nInstance.language;
  }, [i18nInstance.language]);
  return null;
};

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
          <BrowserRouter>
            <HtmlLang />
            <App />
          </BrowserRouter>
          <Toaster />
        </ThemeProvider>
      </I18nextProvider>
    </StrictMode>
  );
}
