import * as React from "react";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  applyLayoutDisplayPrefsToDocument,
  type LayoutDisplayPrefKey,
  readLayoutDisplayPref,
  writeLayoutDisplayPref
} from "@/lib/layoutDisplayPrefs";
import { cn } from "@/lib/utils";

const setPref = (key: LayoutDisplayPrefKey, value: string) => {
  writeLayoutDisplayPref(key, value);
  applyLayoutDisplayPrefsToDocument();
};

export const LayoutPrefsMenu = () => {
  const { t, i18n } = useTranslation();
  const [contentWidth, setContentWidth] = React.useState(() => readLayoutDisplayPref("contentWidth"));
  const [density, setDensity] = React.useState(() => readLayoutDisplayPref("density"));
  const [ambient, setAmbient] = React.useState(() => readLayoutDisplayPref("ambient"));

  React.useEffect(() => {
    applyLayoutDisplayPrefsToDocument();
  }, []);

  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    setContentWidth(readLayoutDisplayPref("contentWidth"));
    setDensity(readLayoutDisplayPref("density"));
    setAmbient(readLayoutDisplayPref("ambient"));
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("size-9 shrink-0 border-border/70 bg-background/60 shadow-none")}
          aria-label={t("layoutPrefs.triggerAria")}
        >
          <Settings2 className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" sideOffset={8} collisionPadding={12}>
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs font-semibold text-foreground">{t("layoutPrefs.display")}</span>
          <span className="block pt-0.5 text-[0.7rem] font-normal leading-snug text-muted-foreground">
            {t("layoutPrefs.displayHint")}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <p className="px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("layoutPrefs.contentWidth")}
        </p>
        <DropdownMenuRadioGroup
          value={contentWidth}
          onValueChange={(value) => {
            setContentWidth(value);
            setPref("contentWidth", value);
          }}
        >
          <DropdownMenuRadioItem value="contained">{t("layoutPrefs.focused")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="wide">{t("layoutPrefs.wide")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <p className="px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("layoutPrefs.density")}
        </p>
        <DropdownMenuRadioGroup
          value={density}
          onValueChange={(value) => {
            setDensity(value);
            setPref("density", value);
          }}
        >
          <DropdownMenuRadioItem value="comfortable">{t("layoutPrefs.comfortable")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">{t("layoutPrefs.compact")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <p className="px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("layoutPrefs.ambientSurface")}
        </p>
        <DropdownMenuRadioGroup
          value={ambient}
          onValueChange={(value) => {
            setAmbient(value);
            setPref("ambient", value);
          }}
        >
          <DropdownMenuRadioItem value="rich">{t("layoutPrefs.alive")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="muted">{t("layoutPrefs.muted")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <p className="px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("layoutPrefs.language")}
        </p>
        <DropdownMenuRadioGroup
          value={i18n.language.startsWith("fr") ? "fr" : "en"}
          onValueChange={(lng) => {
            void i18n.changeLanguage(lng);
          }}
        >
          <DropdownMenuRadioItem value="en">{t("layoutPrefs.english")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fr">{t("layoutPrefs.french")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account#display" className="cursor-pointer">
            {t("layoutPrefs.openAccount")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
