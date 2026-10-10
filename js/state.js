// js/state.js — central app state + debounced persistence of learning progress.
// Progress is written at most every 500ms (Sprint 2, P0.2) so answering a
// question no longer re-serializes the whole database.

import * as storage from "./storage.js";
import { debounce } from "./utils.js";

export const state = {
  collections: [], // meta records (no questions) for the home screen
  active: null, // { meta, questions, progress, saved, notes }

  mode: "study", // 'study' | 'learn' | 'exam' | 'review'
  topic: null,
  reviewIds: null, // question ids for a "practice incorrect" review session

  sessionQuestions: [], // full list for this session (before sort/topic filter)
  sortedQuestions: [], // session list after the sort option is applied
  quizQuestions: [], // visible list after the topic filter is applied

  // Derived arrays (parallel to quizQuestions) kept in sync by rebuildDerived().
  answers: [],
  flags: [],
  locked: [],
  // Source of truth keyed by question id — survives filtering/sorting.
  answersById: new Map(),
  flagsById: new Set(),
  lockedById: new Set(),

  page: 0,
  pageSize: 25, // questions per page (user-selectable)
  filter: "all", // results filter: all | correct | incorrect | flagged | saved
  sort: "number", // 'number' | 'random'
  topicFilter: "", // "" = all topics

  examDeadline: 0,
  timerId: null,

  theme: "auto", // auto | light | dark
  onlySaved: false, // sidebar: show only saved questions
  focusIndex: 0, // question targeted by keyboard shortcuts
};

export function getSelected(questionId) {
  const key = String(questionId);
  let set = state.answersById.get(key);
  if (!set) {
    set = new Set();
    state.answersById.set(key, set);
  }
  return set;
}

export function resetSessionMaps() {
  state.answersById = new Map();
  state.flagsById = new Set();
  state.lockedById = new Set();
}

// Rebuilds the index-based arrays from the id-keyed maps. Cheap, so it can be
// called whenever the visible question set/order changes.
export function rebuildDerived() {
  state.answers = state.quizQuestions.map((q) => getSelected(q.id));
  state.flags = state.quizQuestions.map((q) => state.flagsById.has(String(q.id)));
  state.locked = state.quizQuestions.map((q) => state.lockedById.has(String(q.id)));
  if (state.focusIndex >= state.quizQuestions.length) state.focusIndex = 0;
}

function snapshotActive() {
  return {
    done: (state.active && state.active.progress) || {},
    saved: (state.active && state.active.saved) || {},
    notes: (state.active && state.active.notes) || {},
  };
}

const persistStudyState = debounce((collectionId, data) => {
  storage.saveStudyState(collectionId, data).catch((err) => {
    console.error("Failed to save study state:", err);
  });
}, 500);

function persistActive() {
  if (!state.active) return;
  persistStudyState(state.active.meta.id, snapshotActive());
}

export function markDone(ids) {
  if (!state.active) return;
  const progress = state.active.progress || (state.active.progress = {});
  const list = Array.isArray(ids) ? ids : [ids];
  let changed = false;
  list.forEach((id) => {
    const key = String(id);
    if (!progress[key]) {
      progress[key] = true;
      changed = true;
    }
  });
  if (changed) persistActive();
}

export function isSaved(question) {
  return !!(state.active && state.active.saved && state.active.saved[String(question.id)]);
}

export function toggleSaved(questionId) {
  if (!state.active) return false;
  const saved = state.active.saved || (state.active.saved = {});
  const key = String(questionId);
  if (saved[key]) delete saved[key];
  else saved[key] = true;
  persistActive();
  return !!saved[key];
}

export function savedCount() {
  return state.active && state.active.saved ? Object.keys(state.active.saved).length : 0;
}

export function getNote(questionId) {
  if (!state.active || !state.active.notes) return "";
  return state.active.notes[String(questionId)] || "";
}

export function setNote(questionId, text) {
  if (!state.active) return;
  const notes = state.active.notes || (state.active.notes = {});
  const key = String(questionId);
  const value = String(text || "").trim();
  if (value) notes[key] = value;
  else delete notes[key];
  persistActive();
}

export function flushProgress() {
  if (state.active) persistStudyState.flush(state.active.meta.id, snapshotActive());
}

export function isDone(question) {
  return !!(state.active && state.active.progress && state.active.progress[String(question.id)]);
}

export function isPageDone(pageNumber) {
  const size = state.pageSize;
  const start = (pageNumber - 1) * size;
  const end = Math.min(start + size, state.quizQuestions.length);
  if (end <= start) return false;
  for (let i = start; i < end; i++) {
    if (!isDone(state.quizQuestions[i])) return false;
  }
  return true;
}
