// js/ui.js — navigation + screen rendering.
// Kept as a single module (no framework) to avoid circular imports between
// route handlers and the views that trigger them.

import { el, toast, showScreen, focusMain, downloadJson, slugify } from "./dom.js";
import * as storage from "./storage.js";
import {
  state,
  markDone,
  flushProgress,
  isDone,
  isPageDone,
  isSaved,
  toggleSaved,
  savedCount,
  getNote,
  setNote,
} from "./state.js";
import * as sessionStore from "./session.js";
import {
  validateAndNormalize,
  computeResults,
  totalPages,
  getPaginationRange,
  groupByTopic,
} from "./model.js";
import { escapeHtml, formatText, shuffle, formatDuration, formatDate, clamp, uid, debounce } from "./utils.js";

let pendingImport = null;

// ---------------------------------------------------------------------------
// Collections (home)
// ---------------------------------------------------------------------------

export async function refreshCollections() {
  state.collections = await storage.listCollections();
  state.collections.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const progressMap = await storage.getAllProgress();
  renderCollectionCards(progressMap);
}

function renderCollectionCards(progressMap) {
  el.collectionsGrid.innerHTML = "";
  el.collectionsEmpty.hidden = state.collections.length > 0;

  state.collections.forEach((meta) => {
    const progress = progressMap[meta.id] || {};
    const total = meta.count || 0;
    const done = Object.keys(progress).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    const card = document.createElement("article");
    card.className = "card collection-card";
    card.innerHTML = `
      <div class="collection-card-head">
        <h3>${escapeHtml(meta.name)}</h3>
        <span class="pill">${total} questions</span>
      </div>
      <div class="collection-meta">
        <span class="pill pill-soft">Exam: ${meta.examQuestionLimit} q · ${meta.examTimeMinutes} min</span>
        <span class="pill pill-soft">Added ${escapeHtml(formatDate(meta.createdAt))}</span>
      </div>
      <div class="progress-bar collection-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progress">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <p class="muted small">${done} / ${total} done (${pct}%)</p>
      <div class="collection-card-actions">
        <button type="button" class="btn btn-primary" data-action="study">📖 Study</button>
        <button type="button" class="btn btn-ghost" data-action="learn">🎯 Learn</button>
        <button type="button" class="btn btn-ghost" data-action="exam">⏱️ Exam</button>
      </div>
      <div class="collection-card-tools">
        <button type="button" class="btn btn-icon" data-action="export" title="Export backup" aria-label="Export backup">⬇</button>
        <button type="button" class="btn btn-icon" data-action="edit" title="Edit settings" aria-label="Edit settings">✏️</button>
        <button type="button" class="btn btn-icon btn-icon-danger" data-action="delete" title="Delete collection" aria-label="Delete collection">🗑</button>
      </div>
    `;
    card.querySelector('[data-action="study"]').addEventListener("click", () => startSession(meta.id, "study"));
    card.querySelector('[data-action="learn"]').addEventListener("click", () => showTopics(meta.id));
    card.querySelector('[data-action="exam"]').addEventListener("click", () => startSession(meta.id, "exam"));
    card.querySelector('[data-action="export"]').addEventListener("click", () => exportCollectionById(meta.id));
    card.querySelector('[data-action="edit"]').addEventListener("click", () => openEditModal(meta));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteCollection(meta.id));
    el.collectionsGrid.appendChild(card);
  });
}

export function showCollections() {
  state.filter = "all";
  el.modeBadge.hidden = true;
  showScreen("collections");
  refreshCollections().then(focusMain);
}

export async function deleteCollection(id) {
  const meta = state.collections.find((m) => m.id === id);
  if (!meta) return;
  if (!confirm(`Delete the collection "${meta.name}"? This cannot be undone.`)) return;
  try {
    await storage.deleteCollection(id);
    toast("Collection deleted.", "success");
  } catch (err) {
    toast(`Could not delete: ${err.message}`, "error");
  }
  refreshCollections();
}

export async function exportCollectionById(id) {
  try {
    const data = await storage.exportCollection(id);
    downloadJson(`${slugify(data.name)}-backup.json`, data);
    toast("Backup downloaded.", "success");
  } catch (err) {
    toast(`Export failed: ${err.message}`, "error");
  }
}

// ---------------------------------------------------------------------------
// Edit settings modal (Sprint 3, P1.3)
// ---------------------------------------------------------------------------

let editingId = null;

function openEditModal(meta) {
  editingId = meta.id;
  el.editName.value = meta.name;
  el.editExamLimit.value = String(meta.examQuestionLimit);
  el.editExamLimit.max = String(meta.count);
  el.editExamTime.value = String(meta.examTimeMinutes);
  el.editModal.hidden = false;
  el.editName.focus();
}

function closeEditModal() {
  editingId = null;
  el.editModal.hidden = true;
}

export function bindEditModal() {
  el.editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const meta = state.collections.find((m) => m.id === editingId);
    if (!meta) return closeEditModal();
    const name = el.editName.value.trim() || meta.name;
    let limit = parseInt(el.editExamLimit.value, 10);
    let minutes = parseInt(el.editExamTime.value, 10);
    if (!Number.isFinite(limit) || limit < 1) limit = meta.count;
    if (!Number.isFinite(minutes) || minutes < 1) minutes = meta.examTimeMinutes;
    const updated = {
      ...meta,
      name,
      examQuestionLimit: Math.min(limit, meta.count),
      examTimeMinutes: minutes,
    };
    storage
      .updateMeta(updated)
      .then(() => {
        toast("Settings saved.", "success");
        closeEditModal();
        refreshCollections();
      })
      .catch((err) => toast(`Could not save: ${err.message}`, "error"));
  });
  el.btnCancelEdit.addEventListener("click", closeEditModal);
  el.editModal.addEventListener("click", (event) => {
    if (event.target === el.editModal) closeEditModal();
  });
}

// ---------------------------------------------------------------------------
// Import panel (file picker, paste, bundled samples, backup import)
// ---------------------------------------------------------------------------

function resetImportPanel() {
  el.importPanel.hidden = true;
  el.configForm.hidden = true;
  el.setupStatus.textContent = "";
  el.setupError.hidden = true;
  el.setupErrorsList.hidden = true;
  el.setupErrorsList.innerHTML = "";
  el.pasteArea.value = "";
  el.fileInput.value = "";
  el.backupInput.value = "";
  pendingImport = null;
}

function renderSetupErrors(errors) {
  const shown = errors.slice(0, 30);
  el.setupErrorsList.hidden = false;
  el.setupErrorsList.innerHTML = `
    <details>
      <summary>${errors.length} question(s) skipped — show details</summary>
      <ul>${shown.map((e) => `<li>${escapeHtml(e.message)}</li>`).join("")}</ul>
      ${errors.length > shown.length ? `<p class="muted small">…and ${errors.length - shown.length} more.</p>` : ""}
    </details>
  `;
}

function showSetupError(message, errors) {
  el.setupError.hidden = false;
  el.setupError.textContent = message;
  el.setupStatus.textContent = "";
  el.configForm.hidden = true;
  pendingImport = null;
  if (errors && errors.length) renderSetupErrors(errors);
}

function onDataParsed(sourceName, questions, errors) {
  const baseName = sourceName.replace(/\.json$/i, "");
  if (!questions.length) {
    showSetupError(`No valid questions found in "${sourceName}".`, errors);
    return;
  }
  pendingImport = { name: baseName, questions };

  el.setupError.hidden = true;
  el.setupStatus.textContent =
    `Parsed ${questions.length} valid question(s)` + (errors.length ? ` — ${errors.length} skipped (see details).` : ".");
  el.cfgName.value = baseName;
  el.cfgExamLimit.value = String(Math.min(65, questions.length));
  el.cfgExamLimit.max = String(questions.length);
  el.cfgExamTime.value = "90";
  el.configForm.hidden = false;
  if (errors.length) renderSetupErrors(errors);
  else {
    el.setupErrorsList.hidden = true;
    el.setupErrorsList.innerHTML = "";
  }
}

async function loadSampleFile(path, label) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const { questions, errors } = validateAndNormalize(data);
    onDataParsed(label, questions, errors);
  } catch (err) {
    showSetupError(
      `Could not auto-load "${path}". If the page was opened as a local file (file://), run a local server (see README) or use the file picker instead.\nDetails: ${err.message}`
    );
  }
}

async function saveCollectionFromConfig() {
  if (!pendingImport) return;
  const name = el.cfgName.value.trim() || pendingImport.name || "Untitled collection";
  const total = pendingImport.questions.length;
  let limit = parseInt(el.cfgExamLimit.value, 10);
  let minutes = parseInt(el.cfgExamTime.value, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = total;
  if (!Number.isFinite(minutes) || minutes < 1) minutes = 90;
  limit = Math.min(limit, total);

  const meta = {
    id: uid("col"),
    name,
    createdAt: new Date().toISOString(),
    examQuestionLimit: limit,
    examTimeMinutes: minutes,
    count: total,
  };

  try {
    await storage.saveCollection({ meta, questions: pendingImport.questions, progress: {} });
    resetImportPanel();
    toast(`Collection "${name}" saved.`, "success");
    refreshCollections();
  } catch (err) {
    showSetupError(err.name === "QuotaExceededError" ? err.message : `Could not save: ${err.message}`);
  }
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    const name = data.name || file.name.replace(/\.json$/i, "");
    const rawQuestions = Array.isArray(data) ? data : data.questions;
    const { questions, errors } = validateAndNormalize(rawQuestions);
    if (!questions.length) {
      showSetupError(`Backup "${file.name}" contains no valid questions.`, errors);
      return;
    }
    const meta = {
      id: uid("col"),
      name,
      createdAt: new Date().toISOString(),
      examQuestionLimit: Math.min(data.examQuestionLimit || questions.length, questions.length),
      examTimeMinutes: data.examTimeMinutes || 90,
      count: questions.length,
    };
    await storage.saveCollection({
      meta,
      questions,
      progress: data.progress || {},
      saved: data.saved || {},
      notes: data.notes || {},
    });
    resetImportPanel();
    toast(`Imported backup "${name}".`, "success");
    refreshCollections();
  } catch (err) {
    showSetupError(`Could not import backup: ${err.message}`);
  }
}

export function bindImportPanel() {
  el.btnShowImport.addEventListener("click", () => {
    el.importPanel.hidden = false;
    el.importPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  el.btnHideImport.addEventListener("click", resetImportPanel);
  el.btnCancelImport.addEventListener("click", resetImportPanel);
  el.btnSaveCollection.addEventListener("click", saveCollectionFromConfig);

  el.fileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { questions, errors } = validateAndNormalize(JSON.parse(String(reader.result)));
        onDataParsed(file.name, questions, errors);
      } catch (err) {
        showSetupError(`Failed to load "${file.name}": ${err.message}`);
      }
    };
    reader.onerror = () => showSetupError(`Could not read the file "${file.name}".`);
    reader.readAsText(file);
  });

  el.btnLoadPaste.addEventListener("click", () => {
    const text = el.pasteArea.value.trim();
    if (!text) {
      showSetupError("Paste box is empty.");
      return;
    }
    try {
      const { questions, errors } = validateAndNormalize(JSON.parse(text));
      onDataParsed("Pasted quiz", questions, errors);
    } catch (err) {
      showSetupError(`Failed to parse pasted JSON: ${err.message}`);
    }
  });

  el.btnLoadSample.addEventListener("click", () => loadSampleFile("samples/quiz-sample.json", "Sample quiz"));
  el.btnImportBackup.addEventListener("click", () => el.backupInput.click());
  el.backupInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) importBackup(file);
  });
}

// ---------------------------------------------------------------------------
// Topics screen (Learn mode)
// ---------------------------------------------------------------------------

export async function showTopics(collectionId) {
  const record = await storage.fetchCollection(collectionId);
  if (!record) {
    toast("Collection not found.", "error");
    showCollections();
    return;
  }
  state.active = record;
  el.topicsTitle.textContent = `Learn — ${record.meta.name}`;
  el.topicsGrid.innerHTML = "";

  groupByTopic(record.questions, record.progress).forEach(({ topic, total, done }) => {
    const pct = total ? Math.round((done / total) * 100) : 0;
    const card = document.createElement("article");
    card.className = "card topic-card";
    card.innerHTML = `
      <div class="collection-card-head">
        <h3>${escapeHtml(topic)}</h3>
        <span class="pill">${total}</span>
      </div>
      <div class="progress-bar collection-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
      <p class="muted small">${done}/${total} done (${pct}%)</p>
      <div class="collection-card-actions">
        <button type="button" class="btn btn-primary">📖 Learn this topic</button>
      </div>
    `;
    card.querySelector("button").addEventListener("click", () => startSession(collectionId, "learn", topic));
    el.topicsGrid.appendChild(card);
  });

  showScreen("topics");
  focusMain();
}

// ---------------------------------------------------------------------------
// Quiz session lifecycle (start / resume / persist)
// ---------------------------------------------------------------------------

export async function startSession(collectionId, mode, topic) {
  const record = await storage.fetchCollection(collectionId);
  if (!record || !record.questions.length) {
    toast("This collection has no questions.", "error");
    return;
  }
  state.active = record;
  state.mode = mode;
  state.topic = mode === "learn" ? topic || null : null;
  state.page = 0;

  if (mode === "exam") {
    // Exam Mode is the only mode that randomly selects/orders questions.
    const shuffled = shuffle(record.questions);
    state.quizQuestions = shuffled.slice(0, Math.min(record.meta.examQuestionLimit, shuffled.length));
  } else if (mode === "learn" && state.topic) {
    state.quizQuestions = record.questions.filter((q) => q.topic === state.topic);
  } else {
    state.quizQuestions = record.questions.slice();
  }

  state.answers = state.quizQuestions.map(() => new Set());
  state.flags = state.quizQuestions.map(() => false);
  state.locked = state.quizQuestions.map(() => false);
  state.filter = "all";

  stopExamTimer();
  if (mode === "exam") {
    state.examDeadline = Date.now() + record.meta.examTimeMinutes * 60000;
    startExamTimer();
  } else {
    state.examDeadline = 0;
  }

  el.btnFinishExam.hidden = mode !== "exam";
  el.flagFilterWrap.hidden = mode !== "exam";
  el.flagFilter.checked = false;
  state.onlySaved = false;
  el.savedFilter.checked = false;
  el.quizSidebar.classList.remove("sidebar-open");
  el.btnToggleNavigator.setAttribute("aria-expanded", "false");

  showScreen("quiz");
  renderQuizPage();
  saveCurrentSession();
}

export async function tryResumeSession() {
  const saved = sessionStore.loadSession();
  if (!saved || !saved.collectionId) return false;

  const record = await storage.fetchCollection(saved.collectionId);
  if (!record) {
    sessionStore.clearSession();
    return false;
  }
  const byId = new Map(record.questions.map((q) => [String(q.id), q]));
  const order = (saved.order || []).map((id) => byId.get(String(id))).filter(Boolean);
  if (!order.length) {
    sessionStore.clearSession();
    return false;
  }

  const answered = (saved.answers || []).filter((a) => a && a.length).length;
  const expired = saved.mode === "exam" && saved.deadline && saved.deadline <= Date.now();
  const message =
    `Resume your ${saved.mode} session on "${record.meta.name}"?\n\n${answered} of ${order.length} answered.` +
    (expired ? "\n\nThe exam timer has already run out — the exam will be submitted when you resume." : "");
  if (!confirm(message)) {
    sessionStore.clearSession();
    return false;
  }

  state.active = record;
  state.mode = saved.mode;
  state.topic = saved.topic || null;
  state.quizQuestions = order;
  state.answers = order.map((_, i) => new Set((saved.answers && saved.answers[i]) || []));
  state.flags = order.map((_, i) => !!(saved.flags && saved.flags[i]));
  state.locked = order.map((_, i) => !!(saved.locked && saved.locked[i]));
  state.page = clamp(saved.page || 0, 0, totalPages(order.length) - 1);
  state.filter = "all";

  el.btnFinishExam.hidden = saved.mode !== "exam";
  el.flagFilterWrap.hidden = saved.mode !== "exam";
  el.flagFilter.checked = false;
  state.onlySaved = false;
  el.savedFilter.checked = false;
  el.quizSidebar.classList.remove("sidebar-open");
  el.btnToggleNavigator.setAttribute("aria-expanded", "false");

  stopExamTimer();
  if (saved.mode === "exam" && saved.deadline > Date.now()) {
    state.examDeadline = saved.deadline;
    startExamTimer();
  }

  showScreen("quiz");
  renderQuizPage();
  if (expired) finishQuiz();
  return true;
}

function saveCurrentSession() {
  if (!state.active) return;
  sessionStore.saveSession({
    collectionId: state.active.meta.id,
    mode: state.mode,
    topic: state.topic,
    page: state.page,
    order: state.quizQuestions.map((q) => q.id),
    answers: state.answers.map((set) => Array.from(set)),
    flags: state.flags.slice(),
    locked: state.locked.slice(),
    deadline: state.examDeadline,
    savedAt: Date.now(),
  });
}
const saveSessionSoon = debounce(saveCurrentSession, 300);

export function clearCurrentSession() {
  sessionStore.clearSession();
}

// ---------------------------------------------------------------------------
// Quiz rendering
// ---------------------------------------------------------------------------

function buildQuestionBlock(qIndex) {
  const q = state.quizQuestions[qIndex];
  const selected = state.answers[qIndex];
  const locked = state.locked[qIndex];
  const flagged = state.flags[qIndex];
  const isStudyLike = state.mode === "study" || state.mode === "learn";
  const revealed = isStudyLike && locked;
  const done = isDone(q);

  const block = document.createElement("article");
  block.className = "card question-block";
  block.dataset.qindex = String(qIndex);
  block.id = `question-${qIndex}`;

  const note = getNote(q.id);
  const notesWrap = document.createElement("div");
  notesWrap.className = "notes-panel";
  notesWrap.hidden = true;
  notesWrap.innerHTML = `
    <label class="notes-label" for="note-${qIndex}">Your note (private, saved in this browser)</label>
    <textarea id="note-${qIndex}" class="notes-input" rows="3" placeholder="Write a note for this question…"></textarea>
  `;
  const noteInput = notesWrap.querySelector("textarea");
  noteInput.value = note;
  noteInput.addEventListener("input", () => setNote(q.id, noteInput.value));

  const header = document.createElement("div");
  header.className = "question-block-header";
  header.innerHTML = `
    <span class="question-number">Question ${qIndex + 1} of ${state.quizQuestions.length}
      <span class="question-id-badge">ID #${escapeHtml(String(q.id))}</span>
    </span>
    <span class="question-header-right">
      <span class="topic-badge">${escapeHtml(q.topic)}</span>
      ${done ? `<span class="done-badge">✓ Done</span>` : ""}
      <span class="q-actions">
        <button type="button" class="btn btn-icon btn-sm${isSaved(q) ? " is-on" : ""}" data-save aria-pressed="${isSaved(q)}" title="Save question" aria-label="Save question">🔖</button>
        <button type="button" class="btn btn-icon btn-sm${note ? " is-on" : ""}" data-notes aria-expanded="false" title="Notes" aria-label="Notes">📝</button>
        <button type="button" class="btn btn-icon btn-sm" data-copy-link title="Copy link to this question" aria-label="Copy link to this question">🔗</button>
        ${state.mode === "exam" ? `<button type="button" class="btn btn-icon btn-sm btn-flag${flagged ? " active" : ""}" data-flag aria-pressed="${flagged}" title="Mark for review" aria-label="Mark for review">🚩</button>` : ""}
      </span>
    </span>
  `;
  block.appendChild(header);

  header.querySelector("[data-save]").addEventListener("click", () => toggleSave(qIndex));
  const notesBtn = header.querySelector("[data-notes]");
  notesBtn.addEventListener("click", () => {
    notesWrap.hidden = !notesWrap.hidden;
    notesBtn.setAttribute("aria-expanded", String(!notesWrap.hidden));
    if (!notesWrap.hidden) noteInput.focus();
  });
  header.querySelector("[data-copy-link]").addEventListener("click", () => copyQuestionLink(q.id));
  if (state.mode === "exam") {
    header.querySelector("[data-flag]").addEventListener("click", () => toggleFlag(qIndex));
  }

  const qText = document.createElement("div");
  qText.className = "question-text";
  qText.innerHTML = formatText(q.question);
  block.appendChild(qText);

  const optionsList = document.createElement("div");
  optionsList.className = "options-list";
  optionsList.setAttribute("role", q.isMulti ? "group" : "radiogroup");
  q.options.forEach((opt) => {
    const isChecked = selected.has(opt.key);
    const isCorrect = q.correctKeys.includes(opt.key);

    const wrapper = document.createElement("label");
    wrapper.className = "option";
    if (revealed) {
      if (isCorrect) wrapper.classList.add("correct");
      if (isChecked && !isCorrect) wrapper.classList.add("incorrect");
    }

    const input = document.createElement("input");
    input.type = q.isMulti ? "checkbox" : "radio";
    input.name = `q_${qIndex}`;
    input.value = opt.key;
    input.checked = isChecked;
    input.disabled = revealed;
    input.addEventListener("change", () => onOptionChange(qIndex, opt.key, q.isMulti));

    const textSpan = document.createElement("span");
    textSpan.className = "option-text";
    textSpan.innerHTML = `<span class="option-key">${escapeHtml(opt.key.toUpperCase())}</span>${formatText(opt.text)}`;

    wrapper.appendChild(input);
    wrapper.appendChild(textSpan);
    optionsList.appendChild(wrapper);
  });
  block.appendChild(optionsList);

  if (isStudyLike && !locked) {
    const actions = document.createElement("div");
    actions.className = "question-actions";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary";
    btn.textContent = "Check Answer";
    btn.addEventListener("click", () => checkAnswer(qIndex));
    actions.appendChild(btn);
    block.appendChild(actions);
  }

  if (revealed && q.explanation) {
    const exp = document.createElement("div");
    exp.className = "explanation";
    exp.innerHTML = `<h4>Explanation</h4><div>${formatText(q.explanation)}</div>`;
    block.appendChild(exp);
  }

  block.appendChild(notesWrap);

  return block;
}

export function renderQuizPage(scrollIntoView = false) {
  const pages = totalPages(state.quizQuestions.length, state.pageSize);
  state.page = clamp(state.page, 0, pages - 1);

  el.modeBadge.textContent =
    state.mode === "study" ? "Study Mode" : state.mode === "learn" ? `Learn Mode — ${state.topic}` : "Exam Mode";
  el.modeBadge.className = `mode-badge ${state.mode}`;
  el.timerChip.hidden = state.mode !== "exam";

  const start = state.page * state.pageSize;
  const end = Math.min(start + state.pageSize, state.quizQuestions.length);

  el.questionList.innerHTML = "";
  for (let i = start; i < end; i++) {
    el.questionList.appendChild(buildQuestionBlock(i));
  }

  updateProgressUI();
  renderPagination();
  updateSidebarStats();
  buildNavigator();
  if (scrollIntoView) el.questionList.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateProgressUI() {
  const total = state.quizQuestions.length;
  const answered = state.answers.filter((set) => set.size > 0).length;
  const flagged = state.flags.filter(Boolean).length;
  const pages = totalPages(total, state.pageSize);
  const start = state.page * state.pageSize + 1;
  const end = Math.min(start + state.pageSize - 1, total);

  let text = `Page ${state.page + 1} of ${pages} · Questions ${start}-${end} of ${total} · Answered ${answered}/${total}`;
  if (state.mode === "exam" && flagged) text += ` · 🚩 ${flagged} flagged`;
  el.progressText.textContent = text;
  el.progressFill.style.width = `${total ? (answered / total) * 100 : 0}%`;
  updateSidebarStats();
}

function renderPagination() {
  const pages = totalPages(state.quizQuestions.length, state.pageSize);
  el.pagination.innerHTML = "";
  if (pages <= 1) return;
  const current = state.page + 1;

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "page-btn";
  prevBtn.textContent = "‹ Prev";
  prevBtn.disabled = current === 1;
  prevBtn.addEventListener("click", () => gotoPage(state.page - 1));
  el.pagination.appendChild(prevBtn);

  getPaginationRange(current, pages).forEach((p) => {
    if (p === "...") {
      const span = document.createElement("span");
      span.className = "page-ellipsis";
      span.textContent = "…";
      span.setAttribute("aria-hidden", "true");
      el.pagination.appendChild(span);
      return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-btn" + (p === current ? " current" : "") + (isPageDone(p) ? " done" : "");
    btn.textContent = String(p);
    btn.setAttribute("aria-label", `Page ${p}`);
    btn.addEventListener("click", () => gotoPage(p - 1));
    el.pagination.appendChild(btn);
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "page-btn";
  nextBtn.textContent = "Next ›";
  nextBtn.disabled = current === pages;
  nextBtn.addEventListener("click", () => gotoPage(state.page + 1));
  el.pagination.appendChild(nextBtn);
}

function gotoPage(page) {
  const pages = totalPages(state.quizQuestions.length);
  state.page = clamp(page, 0, pages - 1);
  renderQuizPage(true);
  saveSessionSoon();
}

// ---------------------------------------------------------------------------
// Question navigator + answer interactions
// ---------------------------------------------------------------------------

const NAV_MAX = 120;

function buildNavigator() {
  el.navigatorGrid.innerHTML = "";
  const total = state.quizQuestions.length;
  const onlyFlagged = el.flagFilter.checked && state.mode === "exam";

  // Render every question for small sets (e.g. exams); for large banks only the
  // current page, so the sidebar stays fast with 1000+ questions.
  let indices = [];
  if (total <= NAV_MAX) {
    for (let i = 0; i < total; i++) indices.push(i);
  } else {
    const start = state.page * state.pageSize;
    const end = Math.min(start + state.pageSize, total);
    for (let i = start; i < end; i++) indices.push(i);
  }
  if (onlyFlagged) indices = indices.filter((i) => state.flags[i]);
  if (state.onlySaved) indices = indices.filter((i) => isSaved(state.quizQuestions[i]));

  if (!indices.length) {
    el.navigatorGrid.innerHTML = `<p class="muted small">No flagged questions yet.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  indices.forEach((i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const classes = ["nav-chip"];
    if (state.answers[i].size > 0) classes.push("answered");
    if (state.flags[i]) classes.push("flagged");
    if (Math.floor(i / state.pageSize) === state.page) classes.push("current");
    btn.className = classes.join(" ");
    btn.textContent = String(i + 1);
    btn.title = `Question ${i + 1}${state.flags[i] ? " (flagged for review)" : ""}`;
    btn.addEventListener("click", () => gotoQuestion(i));
    fragment.appendChild(btn);
  });
  el.navigatorGrid.appendChild(fragment);
}

function updateSidebarStats() {
  const total = state.quizQuestions.length;
  const answered = state.answers.filter((set) => set.size > 0).length;
  const flagged = state.flags.filter(Boolean).length;
  el.sidebarAnswered.textContent = `${answered} / ${total}`;
  el.sidebarFlagged.textContent = String(flagged);
  el.sidebarSaved.textContent = String(savedCount());
  el.sidebarFill.style.width = `${total ? (answered / total) * 100 : 0}%`;
}

function gotoQuestion(index) {
  state.page = Math.floor(index / state.pageSize);
  renderQuizPage(false);
  const node = document.getElementById(`question-${index}`);
  if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
  saveSessionSoon();
}

function onOptionChange(qIndex, key, isMulti) {
  const set = state.answers[qIndex];
  if (isMulti) {
    if (set.has(key)) set.delete(key);
    else set.add(key);
  } else {
    set.clear();
    set.add(key);
  }
  updateProgressUI();
  buildNavigator();
  saveSessionSoon();
}

function checkAnswer(qIndex) {
  if (state.answers[qIndex].size === 0) {
    toast("Select an answer first.");
    return;
  }
  state.locked[qIndex] = true;
  markDone(state.quizQuestions[qIndex].id);
  const oldBlock = el.questionList.querySelector(`[data-qindex="${qIndex}"]`);
  if (oldBlock) oldBlock.replaceWith(buildQuestionBlock(qIndex));
  updateProgressUI();
  renderPagination();
  buildNavigator();
  saveSessionSoon();
}

function toggleFlag(qIndex) {
  state.flags[qIndex] = !state.flags[qIndex];
  const oldBlock = el.questionList.querySelector(`[data-qindex="${qIndex}"]`);
  if (oldBlock) oldBlock.replaceWith(buildQuestionBlock(qIndex));
  updateProgressUI();
  buildNavigator();
  saveSessionSoon();
}

function toggleSave(qIndex) {
  const q = state.quizQuestions[qIndex];
  const nowSaved = toggleSaved(q.id);
  toast(nowSaved ? "Saved." : "Removed from saved.");
  const oldBlock = el.questionList.querySelector(`[data-qindex="${qIndex}"]`);
  if (oldBlock) oldBlock.replaceWith(buildQuestionBlock(qIndex));
  updateSidebarStats();
  buildNavigator();
}

async function copyQuestionLink(questionId) {
  if (!state.active) return;
  const url = `${location.origin}${location.pathname}#q/${encodeURIComponent(state.active.meta.id)}/${encodeURIComponent(questionId)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Question link copied.", "success");
  } catch (err) {
    toast("Couldn't copy the link in this browser.", "error");
  }
}

// ---------------------------------------------------------------------------
// Exam timer + toolbar
// ---------------------------------------------------------------------------

export function startExamTimer() {
  updateTimerDisplay();
  stopExamTimer();
  state.timerId = setInterval(() => {
    const remaining = state.examDeadline - Date.now();
    if (remaining <= 0) {
      stopExamTimer();
      toast("Time's up — the exam was submitted automatically.", "error");
      finishQuiz();
      return;
    }
    updateTimerDisplay();
  }, 1000);
}

export function stopExamTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

export function refreshExamTimer() {
  if (state.mode === "exam" && state.timerId) updateTimerDisplay();
}

function updateTimerDisplay() {
  const remaining = Math.max(0, state.examDeadline - Date.now());
  el.timerChip.textContent = `⏳ ${formatDuration(remaining)}`;
  el.timerChip.classList.toggle("low-time", remaining <= 60000);
  el.timerChip.classList.toggle("mid-time", remaining <= 300000 && remaining > 60000);
}

export function bindQuizToolbar() {
  el.btnToggleNavigator.addEventListener("click", () => {
    const open = el.quizSidebar.classList.toggle("sidebar-open");
    el.btnToggleNavigator.setAttribute("aria-expanded", String(open));
  });

  el.flagFilter.addEventListener("change", buildNavigator);

  el.savedFilter.addEventListener("change", () => {
    state.onlySaved = el.savedFilter.checked;
    buildNavigator();
  });

  el.pageSize.addEventListener("change", () => {
    const size = parseInt(el.pageSize.value, 10);
    if (!Number.isFinite(size) || size < 1) return;
    const firstIndex = state.page * state.pageSize;
    state.pageSize = size;
    state.page = Math.floor(firstIndex / size);
    renderQuizPage(true);
    saveSessionSoon();
    storage.setSetting("pageSize", size).catch(() => {});
  });

  el.btnFinishExam.addEventListener("click", () => {
    const answered = state.answers.filter((set) => set.size > 0).length;
    const total = state.quizQuestions.length;
    if (answered < total && !confirm(`You have answered ${answered} of ${total} questions. Submit the exam anyway?`)) return;
    finishQuiz();
  });

  el.btnExit.addEventListener("click", () => {
    if (!confirm("Exit to your collections? This discards the current session (your done-progress stays saved).")) return;
    stopExamTimer();
    clearCurrentSession();
    showCollections();
  });
}

// ---------------------------------------------------------------------------
// Finishing + results screen
// ---------------------------------------------------------------------------

export function finishQuiz() {
  stopExamTimer();
  if (state.mode === "exam") {
    // Sprint 1 (P1.5): only questions that were actually answered count as done,
    // so a skipped question does not inflate the progress bar.
    const answeredIds = state.quizQuestions.filter((_, i) => state.answers[i].size > 0).map((q) => q.id);
    markDone(answeredIds);
  }
  clearCurrentSession();
  flushProgress();
  showScreen("results");
  renderResults();
  focusMain();
}

let lastResults = null;

export function renderResults() {
  lastResults = computeResults(state.quizQuestions, state.answers);
  const { correctCount, total } = lastResults;
  const pct = total ? Math.round((correctCount / total) * 100) : 0;
  const passClass = pct >= 70 ? "pass" : "fail";
  const flaggedCount = state.flags.filter(Boolean).length;
  const modeLabel = state.mode === "exam" ? "Exam" : state.mode === "learn" ? "Learn Session" : "Study Session";

  el.modeBadge.textContent =
    state.mode === "study" ? "Study Mode" : state.mode === "learn" ? `Learn Mode — ${state.topic}` : "Exam Mode";
  el.modeBadge.className = `mode-badge ${state.mode}`;
  el.timerChip.hidden = true;
  el.btnBackTopics.hidden = state.mode !== "learn";
  el.btnRetake.textContent = state.mode === "exam" ? "Retake (new random set)" : "Retake";

  el.resultsSummary.innerHTML = `
    <h1>${escapeHtml(state.active.meta.name)} — ${modeLabel} Complete</h1>
    <div class="score-big ${passClass}">${correctCount} / ${total}</div>
    <p class="muted">${pct}% correct${flaggedCount ? ` · 🚩 ${flaggedCount} flagged` : ""}</p>
  `;

  state.filter = "all"; // reset filter each time the screen opens
  renderResultFilters();
  renderResultItems();
}

function renderResultFilters() {
  const filters = [
    ["all", "All"],
    ["incorrect", "Incorrect"],
    ["correct", "Correct"],
    ["flagged", "🚩 Flagged"],
    ["saved", "🔖 Saved"],
  ];
  el.resultsFilter.innerHTML = "";
  filters.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-btn" + (state.filter === value ? " active" : "");
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(state.filter === value));
    btn.addEventListener("click", () => {
      state.filter = value;
      renderResultFilters();
      renderResultItems();
    });
    el.resultsFilter.appendChild(btn);
  });
}

function renderResultItems() {
  if (!lastResults) return;
  const { details } = lastResults;
  el.resultsList.innerHTML = "";
  let shown = 0;

  details.forEach(({ q, selected, isCorrect }, i) => {
    const flagged = state.flags[i];
    if (state.filter === "correct" && !isCorrect) return;
    if (state.filter === "incorrect" && isCorrect) return;
    if (state.filter === "flagged" && !flagged) return;
    if (state.filter === "saved" && !isSaved(q)) return;
    shown += 1;

    const item = document.createElement("article");
    item.className = "card result-item";

    const header = document.createElement("div");
    header.className = "result-item-header";
    header.innerHTML = `
      <span class="result-item-title">
        <strong>Question ${i + 1}</strong>
        <span class="question-id-badge">ID #${escapeHtml(String(q.id))}</span>
        <span class="topic-badge">${escapeHtml(q.topic)}</span>
        ${flagged ? `<span class="flag-badge">🚩 Flagged</span>` : ""}
      </span>
      <span class="result-tag ${isCorrect ? "correct" : "incorrect"}">${isCorrect ? "Correct" : "Incorrect"}</span>
    `;
    item.appendChild(header);

    const qText = document.createElement("div");
    qText.className = "question-text";
    qText.innerHTML = formatText(q.question);
    item.appendChild(qText);

    const optionsList = document.createElement("div");
    optionsList.className = "options-list";
    q.options.forEach((opt) => {
      const isChecked = selected.has(opt.key);
      const isCorrectOpt = q.correctKeys.includes(opt.key);
      const row = document.createElement("div");
      row.className = "option option-static";
      if (isCorrectOpt) row.classList.add("correct");
      if (isChecked && !isCorrectOpt) row.classList.add("incorrect");
      row.innerHTML = `
        <span class="option-marker">${isChecked ? "☑" : "☐"}</span>
        <span class="option-text"><span class="option-key">${escapeHtml(opt.key.toUpperCase())}</span>${formatText(opt.text)}</span>
      `;
      optionsList.appendChild(row);
    });
    item.appendChild(optionsList);

    if (q.explanation) {
      const exp = document.createElement("div");
      exp.className = "explanation";
      exp.innerHTML = `<h4>Explanation</h4><div>${formatText(q.explanation)}</div>`;
      item.appendChild(exp);
    }

    el.resultsList.appendChild(item);
  });

  if (!shown) {
    el.resultsList.innerHTML = `<p class="muted empty-filter">No questions match this filter.</p>`;
  }
}

export function bindResultsActions() {
  el.btnRetake.addEventListener("click", () => startSession(state.active.meta.id, state.mode, state.topic));
  el.btnBackTopics.addEventListener("click", () => showTopics(state.active.meta.id));
  el.btnBackCollections.addEventListener("click", showCollections);
}

// Keyboard shortcuts for quiz page navigation (accessibility).
export function handleGlobalKeydown(event) {
  if (el.screenQuiz.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
  const tag = (event.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (event.key === "ArrowRight") gotoPage(state.page + 1);
  else if (event.key === "ArrowLeft") gotoPage(state.page - 1);
}

// Deep link: #q/<collectionId>/<questionId> opens that question in Study mode.
export async function handleDeepLink() {
  const match = location.hash.match(/^#q\/([^/]+)\/([^/]+)$/);
  if (!match) return false;

  const collectionId = decodeURIComponent(match[1]);
  const questionId = decodeURIComponent(match[2]);
  const record = await storage.fetchCollection(collectionId);
  if (!record) {
    toast("The linked collection is no longer available.", "error");
    return false;
  }

  await startSession(collectionId, "study");
  const index = state.quizQuestions.findIndex((q) => String(q.id) === String(questionId));
  if (index >= 0) {
    gotoQuestion(index);
    toast(`Jumped to question #${questionId}.`, "success");
  } else {
    toast("That question was not found in this collection.", "error");
  }

  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch (err) {
    /* ignore */
  }
  return true;
}











