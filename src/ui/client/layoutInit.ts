import {
  applyLayoutDisplayPrefsToDocument,
  type LayoutDisplayPrefKey,
  setLayoutDisplayPreference,
  syncLayoutPrefChoiceDom
} from "@/lib/layoutDisplayPrefs";
import { fetchWithCsrf } from "./fetchWithCsrf";

const STORAGE_KEY = "deployher-sidebar-collapsed";
const SIDEBAR_STATE_COOKIE = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const readSidebarOpenFromCookie = (): boolean | null => {
  const match = document.cookie.match(/(?:^|; )sidebar_state=([^;]*)/);
  if (!match?.[1]) return null;
  const v = decodeURIComponent(match[1]).trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
};

const writeSidebarCookie = (expanded: boolean): void => {
  document.cookie = `${SIDEBAR_STATE_COOKIE}=${expanded}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
};

export const initLayout = (): (() => void) => {
  const abort = new AbortController();
  const { signal } = abort;

  const shell = document.getElementById("deployher-shell");
  const sidebar = document.getElementById("deployher-sidebar");
  const backdrop = document.getElementById("deployher-sidebar-backdrop");
  const openBtn = document.getElementById("deployher-sidebar-open-mobile");
  const closeBtn = document.getElementById("deployher-sidebar-close-mobile");
  const desktopToggle = document.getElementById("deployher-sidebar-toggle-desktop");
  const sidebarRail = document.getElementById("deployher-sidebar-rail");

  const syncPrefButtons = () => {
    syncLayoutPrefChoiceDom();
  };

  const handleLayoutPrefClick = (e: Event) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const button = t.closest<HTMLButtonElement>("[data-layout-pref][data-value]");
    if (!button) return;
    const shellEl = document.getElementById("deployher-shell");
    if (!shellEl || !shellEl.contains(button)) return;
    const pref = button.dataset.layoutPref as LayoutDisplayPrefKey | undefined;
    const value = button.dataset.value;
    if (!pref || !value) return;
    setLayoutDisplayPreference(pref, value);
  };

  const setMobileOpen = (open: boolean) => {
    sidebar?.setAttribute("data-mobile-open", open ? "true" : "false");
    if (backdrop) {
      if (open) backdrop.classList.remove("hidden");
      else backdrop.classList.add("hidden");
    }
    openBtn?.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const syncShellSidebarAttr = (collapsed: boolean) => {
    shell?.setAttribute("data-sidebar", collapsed ? "collapsed" : "expanded");
  };

  const setDesktopCollapsed = (collapsed: boolean) => {
    if (!shell) return;
    if (collapsed) shell.classList.add("sidebar-collapsed");
    else shell.classList.remove("sidebar-collapsed");
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    writeSidebarCookie(!collapsed);
    syncShellSidebarAttr(collapsed);
  };

  const toggleDesktopCollapsed = () => {
    const collapsed = !(shell?.classList.contains("sidebar-collapsed") ?? false);
    setDesktopCollapsed(collapsed);
  };

  let prefSyncRaf = 0;
  const schedulePrefButtonSync = () => {
    if (prefSyncRaf !== 0) cancelAnimationFrame(prefSyncRaf);
    prefSyncRaf = requestAnimationFrame(() => {
      prefSyncRaf = 0;
      syncPrefButtons();
    });
  };

  let prefObserver: MutationObserver | null = null;
  document.addEventListener("click", handleLayoutPrefClick, { capture: true, signal });
  if (shell) {
    prefObserver = new MutationObserver(() => {
      schedulePrefButtonSync();
    });
    prefObserver.observe(shell, { childList: true, subtree: true });
  }

  openBtn?.addEventListener("click", () => setMobileOpen(true), { signal });
  closeBtn?.addEventListener("click", () => setMobileOpen(false), { signal });
  backdrop?.addEventListener("click", () => setMobileOpen(false), { signal });

  desktopToggle?.addEventListener("click", () => toggleDesktopCollapsed(), { signal });
  sidebarRail?.addEventListener("click", () => toggleDesktopCollapsed(), { signal });

  if (shell) {
    let collapsed: boolean;
    if (localStorage.getItem(STORAGE_KEY) !== null) {
      collapsed = localStorage.getItem(STORAGE_KEY) === "1";
    } else {
      const open = readSidebarOpenFromCookie();
      collapsed = open === null ? false : !open;
    }
    if (collapsed) shell.classList.add("sidebar-collapsed");
    syncShellSidebarAttr(collapsed);
  }

  applyLayoutDisplayPrefsToDocument();
  syncPrefButtons();

  document.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        const target = e.target;
        if (
          target instanceof HTMLElement &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggleDesktopCollapsed();
      }
    },
    { signal }
  );

  const signoutForm = document.getElementById("signout-form");
  signoutForm?.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      void fetchWithCsrf("/logout", { method: "POST", redirect: "manual" }).then((res) => {
        if (res.ok || res.status === 303 || res.status === 302) {
          window.location.assign("/");
          return;
        }
        window.alert(res.status === 403 ? "Could not sign out. Refresh the page and try again." : "Could not sign out.");
      });
    },
    { signal }
  );

  return () => {
    if (prefSyncRaf !== 0) {
      cancelAnimationFrame(prefSyncRaf);
      prefSyncRaf = 0;
    }
    prefObserver?.disconnect();
    abort.abort();
  };
};
