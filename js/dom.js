// js/dom.js — cached element references + small DOM helpers.

export const el = {
  toast: document.getElementById("toast"),
  themeToggle: document.getElementById("theme-toggle"),
  modeBadge: document.getElementById("mode-badge"),
  timerChip: document.getElementById("timer-chip"),

  screenCollections: document.getElementById("screen-collections"),
  screenTopics: document.getElementById("screen-topics"),
  screenQuiz: document.getElementById("screen-quiz"),
  screenResults: document.getElementById("screen-results"),

  collectionsEmpty: document.getElementById("collections-empty"),
  collectionsGrid: document.getElementById("collections-grid"),
  btnShowImport: document.getElementById("btn-show-import"),
  importPanel: document.getElementById("import-panel"),
  btnHideImport: document.getElementById("btn-hide-import"),

  fileInput: document.getElementById("file-input"),
  btnLoadSample: document.getElementById("btn-load-sample"),
  pasteArea: document.getElementById("paste-area"),
  btnLoadPaste: document.getElementById("btn-load-paste"),
  setupStatus: document.getElementById("setup-status"),
  setupError: document.getElementById("setup-error"),
  setupErrorsList: document.getElementById("setup-errors-list"),

  configForm: document.getElementById("config-form"),
  cfgName: document.getElementById("cfg-name"),
  cfgExamLimit: document.getElementById("cfg-exam-limit"),
  cfgExamTime: document.getElementById("cfg-exam-time"),
  btnSaveCollection: document.getElementById("btn-save-collection"),
  btnCancelImport: document.getElementById("btn-cancel-import"),

  btnImportBackup: document.getElementById("btn-import-backup"),
  backupInput: document.getElementById("backup-input"),

  topicsGrid: document.getElementById("topics-grid"),
  topicsTitle: document.getElementById("topics-title"),
  btnTopicsBack: document.getElementById("btn-topics-back"),

  btnExit: document.getElementById("btn-exit"),
  progressText: document.getElementById("progress-text"),
  progressFill: document.getElementById("progress-fill"),
  btnFinishExam: document.getElementById("btn-finish-exam"),
  pageSize: document.getElementById("page-size"),
  topicFilterWrap: document.getElementById("topic-filter-wrap"),
  topicFilter: document.getElementById("topic-filter"),
  sortWrap: document.getElementById("sort-wrap"),
  sortSelect: document.getElementById("sort-select"),
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),
  flagFilter: document.getElementById("flag-filter"),
  flagFilterWrap: document.getElementById("flag-filter-wrap"),
  savedFilter: document.getElementById("saved-filter"),
  btnToggleNavigator: document.getElementById("btn-toggle-navigator"),
  quizSidebar: document.getElementById("quiz-sidebar"),
  sidebarAnswered: document.getElementById("sidebar-answered"),
  sidebarFlagged: document.getElementById("sidebar-flagged"),
  sidebarSaved: document.getElementById("sidebar-saved"),
  sidebarFill: document.getElementById("sidebar-fill"),
  navigatorGrid: document.getElementById("navigator-grid"),
  questionList: document.getElementById("question-list"),
  pagination: document.getElementById("pagination"),

  resultsSummary: document.getElementById("results-summary"),
  resultsFilter: document.getElementById("results-filter"),
  resultsList: document.getElementById("results-list"),
  btnRetake: document.getElementById("btn-retake"),
  btnPracticeWrong: document.getElementById("btn-practice-wrong"),
  btnBackTopics: document.getElementById("btn-back-topics"),
  btnBackCollections: document.getElementById("btn-back-collections"),

  editModal: document.getElementById("edit-modal"),
  editForm: document.getElementById("edit-form"),
  editName: document.getElementById("edit-name"),
  editExamLimit: document.getElementById("edit-exam-limit"),
  editExamTime: document.getElementById("edit-exam-time"),
  btnCancelEdit: document.getElementById("btn-cancel-edit"),
};

let toastTimer = null;
export function toast(message, type = "info") {
  el.toast.textContent = message;
  el.toast.dataset.type = type;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 3600);
}

export function showScreen(name) {
  el.screenCollections.hidden = name !== "collections";
  el.screenTopics.hidden = name !== "topics";
  el.screenQuiz.hidden = name !== "quiz";
  el.screenResults.hidden = name !== "results";
  el.modeBadge.hidden = name !== "quiz" && name !== "results";
  el.timerChip.hidden = !(name === "quiz" || name === "results");
}

export function focusMain() {
  const screen = [el.screenCollections, el.screenTopics, el.screenQuiz, el.screenResults].find((s) => s && !s.hidden);
  if (!screen) return;
  const heading = screen.querySelector("h1, h2");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "collection";
}
