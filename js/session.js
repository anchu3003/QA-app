// js/session.js — persists the in-progress quiz session so a refresh/accidental
// close can be resumed (Sprint 3, P1.1). Uses sessionStorage (per tab).

const KEY = "qpa:session";

export function saveSession(session) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch (err) {
    console.warn("Failed to save session:", err);
  }
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Failed to load session:", err);
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch (err) {
    /* ignore */
  }
}
