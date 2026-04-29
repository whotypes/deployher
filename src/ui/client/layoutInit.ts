import {
  applyLayoutDisplayPrefsToDocument,
  type LayoutDisplayPrefKey,
  readLayoutDisplayPref,
  writeLayoutDisplayPref
} from "@/lib/layoutDisplayPrefs";
import { navigateSpa } from "@/spa/spaNavigationBridge";

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

export const initLayout = (): void => {
  const shell = document.getElementById("deployher-shell");
  const sidebar = document.getElementById("deployher-sidebar");
  const backdrop = document.getElementById("deployher-sidebar-backdrop");
  const openBtn = document.getElementById("deployher-sidebar-open-mobile");
  const closeBtn = document.getElementById("deployher-sidebar-close-mobile");
  const desktopToggle = document.getElementById("deployher-sidebar-toggle-desktop");
  const sidebarRail = document.getElementById("deployher-sidebar-rail");
  const prefButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-layout-pref][data-value]")
  );

  const syncPrefButtons = () => {
    prefButtons.forEach((button) => {
      const pref = button.dataset.layoutPref as LayoutDisplayPrefKey | undefined;
      const value = button.dataset.value;
      if (!pref || !value) return;
      const active = readLayoutDisplayPref(pref) === value;
      button.dataset.active = active ? "true" : "false";
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };

  const setDisplayPref = (key: LayoutDisplayPrefKey, value: string) => {
    writeLayoutDisplayPref(key, value);
    applyLayoutDisplayPrefsToDocument();
    syncPrefButtons();
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

  openBtn?.addEventListener("click", () => setMobileOpen(true));
  closeBtn?.addEventListener("click", () => setMobileOpen(false));
  backdrop?.addEventListener("click", () => setMobileOpen(false));

  desktopToggle?.addEventListener("click", () => toggleDesktopCollapsed());
  sidebarRail?.addEventListener("click", () => toggleDesktopCollapsed());

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

  prefButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const pref = button.dataset.layoutPref as LayoutDisplayPrefKey | undefined;
      const value = button.dataset.value;
      if (!pref || !value) return;
      setDisplayPref(pref, value);
    });
  });

  document.addEventListener("keydown", (e: KeyboardEvent) => {
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
  });

  const signoutForm = document.getElementById("signout-form");
  if (signoutForm) {
    signoutForm.addEventListener("submit", (e) => {
      e.preventDefault();
      fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).then(() => {
        navigateSpa("/login");
      });
    });
  }
};
