"use client";

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    deriveSelectedProjectId,
    getProjectSwitcherTrigger,
    type ProjectSwitcherInput
} from "@/lib/projectSwitcherDisplay";
import { ProjectSiteGlyph } from "@/ui/client/ProjectSiteGlyph";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@/spa/routerCompat";
type Bootstrap = ProjectSwitcherInput & {
  user?: unknown;
};

const readBootstrap = (): Bootstrap | null => {
  const el = document.getElementById("deployher-sidebar-props");
  if (!el?.textContent?.trim()) return null;
  try {
    return JSON.parse(el.textContent) as Bootstrap;
  } catch {
    return null;
  }
};

export const ProjectSwitcher = ({ input }: { input?: ProjectSwitcherInput | null }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const bootstrap = input ?? readBootstrap();
  if (!bootstrap) return null;

  const projects = bootstrap.sidebarProjects ?? [];
  const selectedId = deriveSelectedProjectId(bootstrap);
  const trigger = getProjectSwitcherTrigger(bootstrap);
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-9 max-w-[min(100vw-8rem,12rem)] items-center gap-2 rounded-lg border border-border/70 bg-muted/35 px-2.5 text-sm font-medium text-foreground outline-none ring-ring transition-colors hover:bg-muted/55 focus-visible:ring-2 sm:max-w-[16rem]"
          )}
          aria-label={t("projectSwitcher.currentProjectAria", { label: trigger.label })}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <ProjectSiteGlyph
            name={trigger.label}
            siteIconUrl={trigger.siteIconUrl}
            previewUrl={trigger.previewUrl}
            className="size-6 ring-0"
            imgClassName="size-6 shrink-0 rounded-md object-cover"
            letterClassName="flex size-6 items-center justify-center rounded-md bg-primary/20 text-xs font-semibold text-primary"
          />
          <span className="min-w-0 truncate">{trigger.label}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-45" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(calc(100vw-1.5rem),22rem)] p-0" align="start" sideOffset={6}>
        <Command>
          <div className="relative border-b px-3 [&_[cmdk-input-wrapper]]:border-0">
            <CommandInput
              placeholder={t("projectSwitcher.findPlaceholder")}
              className="h-10 border-0 shadow-none focus:ring-0 sm:pr-14"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border/80 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
              {t("projectSwitcher.esc")}
            </kbd>
          </div>
          <CommandList className="max-h-[min(50vh,20rem)]">
            <CommandEmpty>{t("projectSwitcher.noMatch")}</CommandEmpty>
            <CommandGroup>
              {sorted.map((p) => {
                return (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.id}`}
                    onSelect={() => {
                      setOpen(false);
                      navigate(`/projects/${p.id}`);
                    }}
                  >
                    <ProjectSiteGlyph
                      name={p.name}
                      siteIconUrl={p.siteIconUrl}
                      previewUrl={p.previewUrl ?? null}
                      className="size-6 ring-0"
                      imgClassName="size-6 shrink-0 rounded-md object-cover"
                      letterClassName="flex size-6 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.id === selectedId ? (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden />
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          <div className="border-t border-border/60 p-1">
            <Link
              to="/projects/new"
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground no-underline outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setOpen(false)}
            >
              <Plus className="size-4 shrink-0 opacity-70" aria-hidden />
              {t("projectSwitcher.createProject")}
            </Link>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
