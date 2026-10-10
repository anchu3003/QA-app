// js/pwa.js — service worker registration (offline support).
// Only registers on a secure context (https or localhost), which is exactly
// where GitHub Pages and Vercel serve the app.

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const { protocol, hostname } = window.location;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (protocol !== "https:" && !isLocal) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .catch((err) => console.warn("Service worker registration failed:", err));
  });
}
