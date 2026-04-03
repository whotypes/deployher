import * as React from "react";
import { Settings2 } from "lucide-react";
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
          aria-label="Workspace display settings"
        >
          <Settings2 className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" sideOffset={8} collisionPadding={12}>
        <DropdownMenuLabel className="font-normal">
          <span className="block text-xs font-semibold text-foreground">Display</span>
          <span className="block pt-0.5 text-[0.7rem] font-normal leading-snug text-muted-foreground">
            Local to this browser. More options on your account page.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <p className="px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Content width
        </p>
        <DropdownMenuRadioGroup
          value={contentWidth}
          onValueChange={(value) => {
            setContentWidth(value);
            setPref("contentWidth", value);
          }}
        >
          <DropdownMenuRadioItem value="contained">Focused</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="wide">Wide</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <p className="px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Density
        </p>
        <DropdownMenuRadioGroup
          value={density}
          onValueChange={(value) => {
            setDensity(value);
            setPref("density", value);
          }}
        >
          <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <p className="px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Ambient surface
        </p>
        <DropdownMenuRadioGroup
          value={ambient}
          onValueChange={(value) => {
            setAmbient(value);
            setPref("ambient", value);
          }}
        >
          <DropdownMenuRadioItem value="rich">Alive</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="muted">Muted</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/account#display" className="cursor-pointer">
            Open account settings…
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
