"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ChevronDown, ExternalLink, MoreHorizontal, Search } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@/spa/routerCompat";
import type { ProjectDeploymentRowBootstrap } from "./ProjectDetailPageClient";

const STATUS_ORDER = ["success", "failed", "building", "queued"] as const;

const PAGE_SIZE = 8;

const deploymentPreviewModeKey = (
  row: ProjectDeploymentRowBootstrap
): "static" | "server" => {
  if (row.buildPreviewMode === "server" || row.buildPreviewMode === "static") {
    return row.buildPreviewMode;
  }
  return row.serveStrategy;
};

const statusDotClass = (status: string): string => {
  switch (status) {
    case "success":
      return "bg-emerald-500";
    case "failed":
      return "bg-red-500";
    case "building":
      return "bg-amber-400";
    case "queued":
      return "bg-muted-foreground/45";
    default:
      return "bg-slate-400";
  }
};

const formatCreatedShort = (iso: string): string => {
  const d = new Date(iso);
  const nowY = new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== nowY ? { year: "2-digit" as const } : {})
  });
};

const sortStatusOptions = (uniq: string[]): string[] => {
  const rank = (s: string): number => {
    const i = (STATUS_ORDER as readonly string[]).indexOf(s);
    return i === -1 ? 100 : i;
  };
  return [...uniq].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

export const ProjectDeploymentsPanel = ({
  deployments,
  currentDeploymentId
}: {
  deployments: ProjectDeploymentRowBootstrap[];
  currentDeploymentId: string | null;
}): React.ReactElement => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const statusOptions = React.useMemo(
    () => sortStatusOptions([...new Set(deployments.map((d) => d.status))]),
    [deployments]
  );
  const [enabledStatuses, setEnabledStatuses] = React.useState<Set<string>>(
    () => new Set(deployments.map((d) => d.status))
  );
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  React.useEffect(() => {
    setEnabledStatuses((prev) => {
      const next = new Set(prev);
      for (const d of deployments) {
        next.add(d.status);
      }
      return next;
    });
  }, [deployments]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return deployments.filter((d) => {
      if (!enabledStatuses.has(d.status)) return false;
      if (!q) return true;
      return (
        d.shortId.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q)
      );
    });
  }, [deployments, enabledStatuses, search]);

  const visibleRows = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const handleToggleStatus = (status: string, checked: boolean): void => {
    setEnabledStatuses((prev) => {
      const next = new Set(prev);
      if (checked) next.add(status);
      else next.delete(status);
      return next;
    });
  };

  const statusTriggerDots = statusOptions.filter((s) => enabledStatuses.has(s)).slice(0, 6);

  const handleDeploymentRowNavigate = (
    e: React.MouseEvent<HTMLTableRowElement>,
    deploymentId: string
  ): void => {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest("a, button, input, textarea, select, [data-row-nav-ignore]")) return;
    navigate(`/deployments/${deploymentId}`);
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder={t("projectDeployments.searchPlaceholder")}
            className="h-11 border-border/70 bg-background pl-10 text-base shadow-sm"
            aria-label={t("projectDeployments.searchAria")}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 shrink-0 gap-2 border-dashed px-4 text-sm sm:min-w-44"
              aria-label={t("projectDeployments.filterAria", {
                selected: enabledStatuses.size,
                total: statusOptions.length
              })}
            >
              <span className="flex -space-x-1" aria-hidden>
                {statusTriggerDots.map((s) => (
                  <span
                    key={s}
                    className={cn("size-2 rounded-full ring-2 ring-background", statusDotClass(s))}
                  />
                ))}
              </span>
              <span className="text-muted-foreground">{t("projectDeployments.statusLabel")}</span>
              <span className="tabular-nums text-foreground">
                {enabledStatuses.size}/{statusOptions.length}
              </span>
              <ChevronDown className="size-4 opacity-60" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 space-y-3 p-4" align="end">
            <p className="text-sm font-semibold text-muted-foreground">{t("projectDeployments.popoverTitle")}</p>
            <ul className="space-y-2">
              {statusOptions.map((status) => (
                <li key={status}>
                  <label className="flex cursor-pointer items-center gap-3 text-base">
                    <Checkbox
                      checked={enabledStatuses.has(status)}
                      onCheckedChange={(v) => handleToggleStatus(status, v === true)}
                      aria-label={t("projectDeployments.showStatusDeployments", {
                        status: t(`deployment.status.${status}`, { defaultValue: status })
                      })}
                    />
                    <span
                      className={cn("size-2.5 shrink-0 rounded-full", statusDotClass(status))}
                      aria-hidden
                    />
                    <span className="capitalize">
                      {t(`deployment.status.${status}`, { defaultValue: status })}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      <div className="max-h-[min(32rem,65vh)] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow className="hover:bg-transparent">
              <TableHead className="whitespace-nowrap py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("projectDeployments.colDeployment")}
              </TableHead>
              <TableHead className="hidden py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">
                {t("projectDeployments.colKind")}
              </TableHead>
              <TableHead className="whitespace-nowrap py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("projectDeployments.colPreview")}
              </TableHead>
              <TableHead className="hidden py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell whitespace-nowrap">
                {t("projectDeployments.colCreated")}
              </TableHead>
              <TableHead className="whitespace-nowrap py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("projectDeployments.colCurrent")}
              </TableHead>
              <TableHead className="w-12 p-3 text-right">
                <span className="sr-only">{t("projectDeployments.actionsSr")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-28 text-center text-base text-muted-foreground">
                  {enabledStatuses.size === 0
                    ? t("projectDeployments.emptyStatusOff")
                    : t("projectDeployments.emptyNoMatch")}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((d) => {
                const isCurrent = d.id === currentDeploymentId;
                const hasOverflowMenu =
                  (d.status === "success" && Boolean(d.previewUrl)) ||
                  (d.status === "success" && !isCurrent);
                return (
                  <TableRow
                    key={d.id}
                    className="group cursor-pointer border-border/50 hover:bg-muted/45"
                    aria-label={`${t("projectDeployments.openDeployment")}: ${d.shortId}`}
                    onClick={(e) => handleDeploymentRowNavigate(e, d.id)}
                  >
                    <TableCell className="align-middle py-4">
                      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        <span
                          className={cn("size-3 shrink-0 rounded-full", statusDotClass(d.status))}
                          title={t(`deployment.status.${d.status}`, { defaultValue: d.status })}
                          aria-hidden
                        />
                        <span className="font-mono text-base font-semibold underline-offset-4 group-hover:underline">
                          {d.shortId}
                        </span>
                        {isCurrent ? (
                          <Badge variant="secondary" className="text-xs font-medium uppercase tracking-wide">
                            {t("projectDeployments.badgeCurrent")}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden align-middle py-4 md:table-cell">
                      <Badge variant="outline" className="px-2.5 py-1 text-sm font-normal capitalize">
                        {t(`deployment.previewMode.${deploymentPreviewModeKey(d)}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-middle py-4">
                      {d.status === "success" && d.previewUrl ? (
                        <Button variant="outline" size="sm" className="h-10 gap-2 px-3 text-sm" asChild>
                          <a
                            href={d.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-row-nav-ignore
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {t("projectDeployments.preview")}
                            <ExternalLink className="size-3.5 opacity-70" aria-hidden />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not available</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden align-middle py-4 text-base tabular-nums text-muted-foreground sm:table-cell">
                      {formatCreatedShort(d.createdAt)}
                    </TableCell>
                    <TableCell className="align-middle py-4">
                      {d.status === "success" && !isCurrent ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-10 px-3 text-sm"
                          data-set-current-deployment={d.id}
                        >
                          {t("projectDeployments.setAsCurrent")}
                        </Button>
                      ) : d.status === "success" && isCurrent ? (
                        <span className="text-sm font-medium text-muted-foreground">{t("projectDeployments.yes")}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell className="p-3 text-right align-middle">
                      {hasOverflowMenu ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9 text-muted-foreground"
                              aria-label={t("projectDeployments.actionsFor", { shortId: d.shortId })}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {d.status === "success" && d.previewUrl ? (
                              <DropdownMenuItem asChild>
                                <a href={d.previewUrl} target="_blank" rel="noopener noreferrer">
                                  {t("projectDeployments.openPreview")}
                                </a>
                              </DropdownMenuItem>
                            ) : null}
                            {d.status === "success" && !isCurrent ? (
                              <DropdownMenuItem data-set-current-deployment={d.id}>
                                {t("projectDeployments.setAsCurrent")}
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {hasMore ? (
        <div className="border-t border-border/70 bg-muted/10 p-4">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full text-base font-medium"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            {t("projectDeployments.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
