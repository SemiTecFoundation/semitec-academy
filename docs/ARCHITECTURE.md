# Architecture

**Electron** desktop app (Chromium + Node.js), plain JavaScript, no build step. One window, three
layers, a private URL scheme and a single SQLite file.

```
┌───────────────────────── main process (Node) ───────────────────────────┐
│ main.js     window, stl:// protocol, IPC handlers, single instance,     │
│             .stlp file association (open-file / argv)                 │
│ db.js       SQLite via sql.js (WebAssembly) → <data>/learning.db        │
│ auth.js     local accounts, scrypt password hashes                      │
│ library.js  verify + install packs, list, remove, progress              │
│ planner.js  enrollment, study plans, calendar, Today, projects, certs   │
│ catalog.js  catalog sources (folders, catalog.json links), install     │
│ mine.js     each user's My packages and groups of packages             │
│ shared/     packfmt.js (zip + hashes + Ed25519) · versions.js · validate │
│             · spec.js · schedule.js (plans → dates)                      │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ IPC (invoke) — only through preload.js → window.api
┌───────────────▼──────────── renderer: stl://app ────────────────────────┐
│ app.js      setup, login/register, library (search, filters, Today),    │
│             pack page (sections / course order / study plan), settings  │
│ plan.js     Enroll dialog, study-plan view, Today panel, Calendar page  │
│ projects.js Projects page, project view (plan, notes, brief, rubric)    │
│ certs.js    Certificates page (training + course), save as PDF         │
│ dashboard.js main page · catalogview.js Catalog page                   │
│ media.js    video player (resume, watched tracking), material viewers   │
│ lab.js      lab: manual / steps / files (viewer, zip) / quiz            │
│ pdfview.mjs PDF reader (pdf.js): pages, zoom, outline, read tracking    │
│ markdown.js Markdown reader (marked + DOMPurify): outline, code, images │
│   └─ <iframe stl://pack/<id>/trainings/<t>/index.html>                  │
│        training engine in platform mode ⇄ postMessage (requestState,    │
│        init, progress) — the app saves the state in the DB              │
└─────────────────────────────────────────────────────────────────────────┘
```

## The `stl://` scheme

| URL | Served from |
|---|---|
| `stl://app/…` | `src/renderer/` (the UI) |
| `stl://app/engine/…` | `src/engine/training/` (engine JS/CSS reused by the UI for quizzes and styles) |
| `stl://app/vendor/pdfjs/…` | `node_modules/pdfjs-dist/` (build, fonts, cmaps, wasm) |
| `stl://app/vendor/marked/…`, `…/vendor/dompurify/…` | `node_modules/marked/lib/`, `node_modules/dompurify/dist/` (Markdown → sanitised HTML) |
| `stl://pack/<packId>/<path>` | `<data>/packs/<packId>/<path>` (with HTTP Range support so videos can seek); for a training folder, `index.html`, `js/`, `css/` come from the engine and the app injects `window.TRAINING_CONFIG = { mode: 'platform', progress: 'postMessage', … }` |

`stl://app` and `stl://pack` are different origins: training content runs isolated from the app UI
and cannot reach `window.api`. All paths are resolved inside their root folder (no `..` escapes).

## Data folder

Chosen at first start (default `Documents/SemiTec Academy`), movable in Settings; its location is kept
in the Electron `userData/config.json`. `--data-dir=<path>` overrides it (portable / lab PCs).

```
SemiTec Academy/
├── learning.db                 SQLite: users, packs, progress, settings
└── packs/<pack id>/            extracted, verified pack content (+ .manifest.json)
```

### Database (schema version 3, `PRAGMA user_version`)

| Table | Columns |
|---|---|
| `users` | id, username (unique, case-insensitive), display_name, pass_hash, pass_salt, created_at, last_login |
| `packs` | id, version, title, publisher, signature (trusted / untrusted-key / unsigned), signed_by, manifest (JSON), installed_at, installed_by |
| `progress` | user_id, pack_id, item_id, item_type, state (JSON), percent, completed_at, updated_at — PK (user, pack, item) |
| `settings` | key, value (JSON): lastUser, devMode, catalogSources (application settings, shared by all users) |
| `user_packs` (v3, app 1.5.0) | user_id, pack_id, added_at — the user's *My packages* (installing, enrolling or starting a package adds it) |
| `pack_groups` (v3) | id, user_id, name (unique per user), description, created_at, updated_at |
| `pack_group_items` (v3) | group_id, pack_id, position — a package can be in several groups |
| `enrollments` (v2, app 1.4.0) | user_id, pack_id, item_id (`''` = the package, or a project id), start_date (YYYY-MM-DD), plan (JSON: `mode` package / finishBy / self, `finishBy`), enrolled_at |

Study plans are not stored: `planner.js` computes them on request from the manifest (or `project.json`),
the enrollment and the progress (`shared/schedule.js`), so a package update with a changed schedule
moves the dates automatically. Certificates are derived from progress too (training state
`certificate` / `completedAt`; a course certificate when every item is completed).

Migrations are numbered SQL blocks in `db.js`; the file is written atomically (temp + rename) 0.4 s
after each change and on exit. Progress `state` JSON per item type: see PACKAGE-FORMAT.md. The
training state is the exact *schema 1* object of the training template (`INTEGRATION.md` there), so
it can later be synchronised with the web platform's `training_progress` table unchanged.

## Accounts and security

- Local accounts per computer; passwords hashed with **scrypt** (N=16384, r=8, p=1, 16-byte salt),
  constant-time comparison. No password recovery: a teacher can create a new account; progress
  can be exported per user (JSON).
- Packs install only with a valid signature from a key in `trusted-keys/` (developer mode excepted).
- Renderer: `contextIsolation`, `sandbox`, no Node integration, CSP, navigation to external URLs
  opens the system browser, IPC handlers accept calls only from `stl://app` and check the logged-in user.
- Limits: local accounts protect against other *students* on a shared PC, not against an administrator
  of that PC who can read the data folder. Quiz answers are in the pack content (fine for learning,
  not for graded exams).

## Why these choices

| Choice | Reason |
|---|---|
| Electron | same Chromium on every OS → trainings look identical; Node crypto (Ed25519, scrypt); mature installers |
| sql.js instead of native SQLite | no native modules to rebuild per Electron/OS version; DB is small (KB–MB) |
| pdf.js instead of the built-in viewer | page tracking, outline, resume, consistent UI |
| engine copied, not inside each pack | packs stay small; one engine update improves all trainings; formats versioned explicitly |
| fflate | pure-JS zip, same code in app and packer |
