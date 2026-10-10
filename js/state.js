// js/state.js — central app state + debounced persistence of learning progress.
// Progress is written at most every 500ms (Sprint 2, P0.2) so answering a
// question no longer re-serializes the whole database.

import * as storage from "./storage.js";
import { debounce } from "./utils.js";
import { PAGE_SIZE } from "./model.js";

export const state = {
  collections: [], // meta records (no questions) for the home screen
  active: null, // { meta, questions, progress }

  mode: "study", // 'study' | 'learn' | 'exam'
  topic: null,

  quizQuestions: [],
  answers: [], // Set<string> per question
  flags: [], // boolean per question (mark-for-review)
  locked: [], // boolean per question (study/learn reveal)

  page: 0,
  filter: "all", // results filter: all | correct | incorrect | flagged

  examDeadline: 0,
  timerId: null,

  theme: "auto", // auto | light | dark
  reviewOnly: false, // exam navigator: show only flagged
};

const persistProgress = debounce((collectionId, done) => {
  storage.saveProgress(collectionId, done).catch((err) => {
    console.error("Failed to save progress:", err);
  });
}, 500);

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
  if (changed) persistProgress(state.active.meta.id, progress);
}

export function flushProgress() {
  if (state.active) persistProgress.flush(state.active.meta.id, state.active.progress || {});
}

export function isDone(question) {
  return !!(state.active && state.active.progress && state.active.progress[String(question.id)]);
}

export function isPageDone(pageNumber) {
  const start = (pageNumber - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, state.quizQuestions.length);
  if (end <= start) return false;
  for (let i = start; i < end; i++) {
    if (!isDone(state.quizQuestions[i])) return false;
  }
  return true;
}
