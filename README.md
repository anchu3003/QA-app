# Quiz Practice

A lightweight, **offline-first** web app for drilling question-and-answer sets (for example AWS SAA
exam-prep banks). Built with **vanilla JS ES modules — no build step, no framework, no dependencies**.
Deploys as plain static files to **GitHub Pages** and **Vercel**.

## Features

- 🗂️ **Saved collections** stored in **IndexedDB** (falls back to `localStorage`), so you import a set once.
- 📥 **Import** any Q&A JSON — file picker, paste box, bundled samples, or a previously **exported backup**.
- 🧩 **Robust validation** — every broken row is reported (with a details list) while the valid rows still import.
- 📄 **Paginated** question list (25 per page) with page navigation; done pages turn green.
- 🔢 **Unlimited options** per question and **multi-correct answers** (radio vs. checkbox is automatic).
- 🖼️ **Markdown-lite rendering** — `**bold**`, `` `code` ``, bullet lists, `![images](url)` and `[links](url)`.
- 📖 **Study Mode** — instant color-coded feedback + explanation.
- 🎯 **Learn Mode** — drill one topic at a time with the same instant-feedback flow.
- ⏱️ **Exam Mode** — timed, random subset of questions. Includes a **🚩 Mark-for-review** flag and a
  **question navigator** (answered / flagged / unanswered at a glance).
- 💾 **Saved progress** — per-question done state, page coloring and `done / total` bars; exam mode only
  marks questions you actually answered.
- 🔖 **Saved questions** — bookmark individual questions (persisted, in every mode) and filter the sidebar
  navigator or the results list to just your saved ones.
- 📝 **Private notes** — attach a note to any question; stored locally and included in exports.
- 🔗 **Deep links** — copy a link to a specific question; opening it jumps straight to that question.
- 🔢 **Configurable page size** — show 10 / 25 / 50 / 100 questions per page.
- 🗂️ **Topic filter & sort** — narrow Study to one topic, and switch between question-number or random order.
- 🔎 **Search** — jump straight to the first question matching a keyword.
- ⌨️ **Keyboard shortcuts** — `←/→` change page, `1–9` pick an answer, `Enter` check, `F` flag, `S` save.
- 🔁 **Practice incorrect** — after a session, drill only the questions you got wrong.
- 📊 **Per-topic progress bars** on every collection card.
- ↩️ **Resume sessions** — a refresh or accidental close can be resumed (including a running exam timer).
- 🔀 **Backup & restore** — export a collection (with progress) to JSON and import it back or on another device.
- 🌗 **Modern UI with light / dark / auto theme**, accessible (ARIA, focus management, keyboard page nav).
- 📲 **Installable (PWA)** with offline caching via a service worker.

## Quick start (local)

ES modules need an HTTP origin (not `file://`), so run a tiny static server from this folder:

```bash
# Python 3 (already available on most machines)
python -m http.server 8000
# then open http://localhost:8000
```

> ℹ️ Opening `index.html` directly via `file://` will **not** work anymore: browsers block ES modules
> and service workers on `file://`. Use the local server above (or deploy — see below).

## Deploying

### GitHub Pages

1. Push this folder to a GitHub repository.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Choose branch `main` and folder `/ (root)` → **Save**.
4. Your app is live at `https://<user>.github.io/<repo>/` (HTTPS is enabled automatically).

`.nojekyll` is included so GitHub Pages serves the files as-is. All paths are **relative**, so the site
works correctly from a sub-path.

### Vercel

1. Push this folder to GitHub, then on Vercel: **Add New → Project → Import Git Repository**.
2. Framework Preset: **Other**. Leave **Build Command** empty and **Output Directory** as `.` (root).
3. Deploy — Vercel serves the static files over HTTPS. No environment variables needed.

Both platforms provide the secure HTTPS origin required for service workers/PWA.

## Using the app

1. **+ Import New Collection** → choose a file, paste JSON, or load a bundled sample.
2. Set the **collection name**, **exam question count** and **exam time limit** → **Save Collection**.
3. From a collection card:
   - **Study** – immediate feedback for every question. Use the **Topic** filter and **Sort** (number/random)
     controls, or **Find** to jump to a keyword match.
   - **Learn** – pick a topic first.
   - **Exam** – timed random subset; use **🧭 Navigate** to jump around and **🚩 Flag** to mark for review.
   - **⬇ / ✏️ / 🗑** – export a backup, edit settings, or delete.
4. At the end you get a score, filters (All / Incorrect / Correct / Flagged / Saved) and per-question review.
   Use **🔁 Practice incorrect** to re-drill just the questions you missed.

## Quiz JSON format

Each quiz file is a JSON array of question objects:

```jsonc
[
  {
    "question": "Which AWS service is a fully managed NoSQL database?",
    "options": { "a": "Amazon RDS", "b": "Amazon DynamoDB", "c": "Amazon Redshift", "d": "Amazon Aurora" },
    "answer": "b",                 // single correct answer -> string key
    "topic": "Databases",          // optional, groups questions for Learn Mode
    "explanation": "DynamoDB is a managed key-value/NoSQL database.",
    "id": 1                        // optional, defaults to import position
  },
  {
    "question": "Which of the following are AWS compute services? (Select TWO)\n\n- EC2\n- Lambda",
    "options": { "a": "Amazon EC2", "b": "Amazon S3", "c": "AWS Lambda", "d": "Amazon Route 53" },
    "answer": ["a", "c"],          // multiple correct answers -> array of keys
    "topic": "Compute",
    "explanation": "EC2 and Lambda are compute; S3 is storage and Route 53 is DNS."
  }
]
```

Rules:

- `question` (string, required) — supports `**bold**`, `` `code` ``, `- ` bullet lists, `\n\n` paragraphs,
  `![alt](https://image-url)` images and `[text](https://url)` links.
- `options` (object, required) — any number of keys (≥ 2). Keys are matched **case-insensitively** to `answer`.
- `answer` (required) — a key (string) or an array of keys for multi-answer questions.
- `topic` (string, optional) — defaults to `"Uncategorized"`.
- `explanation` (string, optional) — shown after the answer is revealed.
- `id` (optional) — shown in the app; duplicate ids are automatically de-duplicated.

## Storage & privacy

Everything (questions, settings, per-question progress, saved questions and notes) is stored locally in
**IndexedDB** (or `localStorage` as a fallback) — nothing is uploaded anywhere. Storage is scoped to the
origin, so data saved on `localhost` is separate from your deployed site. Use **⬇ Export** for backups
(the export includes your saved list and notes).

## Project structure

```
index.html               Screens + PWA wiring
manifest.webmanifest     PWA manifest
sw.js                    Service worker (offline app-shell cache)
.nojekyll                Keeps GitHub Pages from running Jekyll
css/styles.css           UI theme (light/dark, responsive)
js/
  main.js                Entry point: bootstrap, theme, global events
  ui.js                  Navigation + all screen rendering
  dom.js                 Cached element refs + DOM helpers
  state.js               Central state + debounced progress persistence
  storage.js             IndexedDB layer with localStorage fallback
  model.js               Pure logic: validation, scoring, pagination (unit-tested)
  utils.js               Markdown-lite, shuffle, debounce, formatting
  session.js             Resume-session persistence
  pwa.js                 Service-worker registration
samples/quiz-sample.json Bundled sample question set
tests/tests.html         Browser unit tests for the pure modules
scripts/                 Optional Node-free dev checks (run_unit_tests.py, validate.py)
```

## Testing

Open **`tests/tests.html`** (e.g. `http://localhost:8000/tests/tests.html`). The pure modules
(`model.js`, `utils.js`) are covered by assertions that run in the browser — no Node required.

Optional Node-free checks (require `pip install quickjs`):

```bash
python scripts/run_unit_tests.py   # runs the same pure-logic assertions via QuickJS
python scripts/validate.py         # JS syntax, DOM ids, import/export graph, JSON validity, file refs
```

## Development notes

- **No build step.** Edit files and refresh. ES modules and the service worker require an HTTP origin,
  so use the local server (`python -m http.server`).
- The large AWS SAA bank used during development lives in the git-ignored `my-collection/` folder, so it
  is **not** deployed. Deploy the repo as-is (the bundled `samples/quiz-sample.json` ships with the site);
  to use your own bank, import it through the **file picker**.

## Browser support

Any modern evergreen browser (Chrome, Edge, Firefox, Safari). Uses only standard web APIs —
ES modules, IndexedDB, `fetch`, `localStorage`/`sessionStorage`, Blob downloads, and Service Workers.


