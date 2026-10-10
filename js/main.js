// js/main.js — application entry point (wires everything + bootstraps).

import { el, toast } from "./dom.js";
import * as storage from "./storage.js";
import { state, flushProgress } from "./state.js";
import {
  showCollections,
  bindImportPanel,
  bindEditModal,
  bindQuizToolbar,
  bindResultsActions,
  tryResumeSession,
  handleGlobalKeydown,
  refreshExamTimer,
} from "./ui.js";
import { registerServiceWorker } from "./pwa.js";

const THEME_KEY = "theme";
const THEME_ORDER = ["auto", "light", "dark"];

function applyTheme(theme) {
  state.theme = theme;
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  el.themeToggle.textContent = theme === "dark" ? "☀️" : theme === "light" ? "🌙" : "🌗";
  el.themeToggle.title = `Theme: ${theme} — click to switch`;
  el.themeToggle.setAttribute("aria-label", `Theme: ${theme}. Click to switch.`);
}

async function cycleTheme() {
  const next = THEME_ORDER[(THEME_ORDER.indexOf(state.theme) + 1) % THEME_ORDER.length];
  applyTheme(next);
  try {
    await storage.setSetting(THEME_KEY, next);
  } catch (err) {
    console.warn("Could not save theme:", err);
  }
}

async function boot() {
  const backend = await storage.init();
  const savedTheme = (await storage.getSetting(THEME_KEY, "auto")) || "auto";
  applyTheme(savedTheme);

  bindImportPanel();
  bindEditModal();
  bindQuizToolbar();
  bindResultsActions();

  el.themeToggle.addEventListener("click", cycleTheme);
  document.addEventListener("keydown", handleGlobalKeydown);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshExamTimer();
  });
  window.addEventListener("beforeunload", () => flushProgress());

  showCollections();

  if (backend === "localStorage") {
    toast("Using localStorage (IndexedDB unavailable here). Large collections may hit the size limit.", "info");
  }

  registerServiceWorker();

  try {
    await tryResumeSession();
  } catch (err) {
    console.error("Resume failed:", err);
  }
}

boot().catch((err) => {
  console.error(err);
  toast(`Failed to start the app: ${err.message}`, "error");
});
