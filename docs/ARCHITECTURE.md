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
│   └─ <iframe stl://pack/<id>/trainings/<t>/<entry>.html>                │
│        format 1: Academy training engine in platform mode; format 2:│
│        local publisher web page + limited progress bridge               │
└─────────────────────────────────────────────────────────────────────────┘
```

## The `stl://` scheme

| URL | Served from |
|---|---|
| `stl://app/…` | `src/renderer/` (the UI) |
| `stl://app/engine/…` | `src/engine/training/` (engine JS/CSS reused by the UI for quizzes and styles) |
| `stl://app/vendor/pdfjs/…` | `node_modules/pdfjs-dist/` (build, fonts, cmaps, wasm) |
| `stl://app/vendor/marked/…`, `…/vendor/dompurify/…` | `node_modules/marked/lib/`, `node_modules/dompurify/dist/` (Markdown → sanitised HTML) |
| `stl://pack/<packId>/<path>` | `<data>/packs/<packId>/<path>` (with HTTP Range support so videos can seek). Training format 1 receives the Academy engine and injected `window.TRAINING_CONFIG`; formats 2 and 3 receive their own local entry page with an injected `window.SemiTecAcademy` progress bridge and a network-blocking CSP. |

`stl://app` and `stl://pack` are different origins: training content runs isolated from the app UI
and cannot reach `window.api`. Format 2 and 3 training pages additionally run in an iframe sandbox; their only
Academy interface is the progress bridge. All paths are resolved inside their root folder (no `..` escapes).

## Data folder

Chosen at first start (default `Documents/SemiTec Academy`), movable in Settings; its location is kept
in the Electron `userData/config.json`. `--data-dir=<path>` overrides it (portable / lab PCs).

```
SemiTec Academy/
├── learning.db                 SQLite: users, packs, progress, settings
└── packs/<pack id>/            extracted, verified pack content (+ .manifest.json)
```

### Database (schema version 5, `PRAGMA user_version`)

| Table | Columns |
|---|---|
| `users` | id, username (unique, case-insensitive), display_name, pass_hash, pass_salt, created_at, last_login |
| `packs` | id, version, title, publisher, legacy compatibility columns, manifest (JSON), installed_at, installed_by |
| `progress` | user_id, pack_id, item_id, item_type, state (JSON), percent, completed_at, updated_at — PK (user, pack, item) |
| `settings` | key, value (JSON): lastUser, catalogSources (application settings, shared by all users) |
| `user_packs` (v3, app 1.5.0) | user_id, pack_id, added_at — the user's *My packages* (installing, enrolling or starting a package adds it) |
| `pack_groups` (v3) | id, user_id, name (unique per user), description, created_at, updated_at |
| `pack_group_items` (v3) | group_id, pack_id, position — a package can be in several groups |
| `enrollments` (v2, app 1.4.0) | user_id, pack_id, item_id (`''` = the package, or a project id), start_date (YYYY-MM-DD), plan (JSON: `mode` package / finishBy / self, `finishBy`), enrolled_at |
| `package_access` (v5, app 2.0.0) | user_id, pack_id, pack_version, unlocked_at — no password or verifier is stored; all rows for a package are cleared when it is installed again |

Study plans are not stored: `planner.js` computes them on request from the manifest (or `project.json`),
the enrollment and the progress (`shared/schedule.js`), so a package update with a changed schedule
moves the dates automatically. Certificates are derived from progress too (standard JSON-training state
`certificate` / `completedAt`; a course certificate only when the package manifest includes the optional
`certificate` object and every required item is completed). Both training formats may declare an optional individual certificate. New designs use local HTML/CSS/JS
in an isolated script-only iframe; legacy JSON designs remain supported. Custom training progress is either
bridge-reported or calculated by Academy from a manual checklist. Optional preview access stores only a
successful unlock for the current user until that package is installed again. Complete-folder export filters preview files when
not unlocked. The shared content checker runs against staging files before installation replaces content.


Migrations are numbered SQL blocks in `db.js`; the file is written atomically (temp + rename) 0.4 s
after each change and on exit. Progress `state` JSON per item type: see PACKAGE-FORMAT.md. The
training state is the exact *schema 1* object of the training template (`INTEGRATION.md` there), so
it can later be synchronised with the web platform's `training_progress` table unchanged.

## Accounts and security

- Local accounts per computer; passwords hashed with **scrypt** (N=16384, r=8, p=1, 16-byte salt),
  constant-time comparison. No password recovery: a teacher can create a new account; progress
  can be exported per user (JSON).
- Packages from any publisher may be installed after format, path, content hash and metadata checks. These checks do not authenticate publisher identity.
- A package may include an optional scrypt password verifier. The main process checks it and stores only
  an unlock record per learner; a successful package install clears its previous unlock records, while locked content, progress and download IPC calls are
  refused. This is access control inside Academy, not encryption of the `.stlp` archive.
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
| engine copied for training format 1 | packs stay small; one engine update improves all standard JSON trainings; formats are versioned explicitly |
| isolated custom runtime for training format 2 | existing local interactive lessons can work without Electron/Node/network access, while the app keeps control of user progress; both formats can opt into HTML certificates |
| fflate | pure-JS zip, same code in app and packer |

## Loading and PDF rendering

Keep SQLite/sql.js for this local desktop workload. Library cards fetch the user's progress in one query,
then group it by package. PDF pages render lazily, release offscreen canvases/text/link layers, and cancel
outstanding work on close. TextLayer enables selection/copy; link annotations and bookmarks route internal
destinations within the viewer and permitted external URLs through the system browser. Image-only PDFs
still require OCR from their publisher. Database replacement is not needed for these rendering issues.

The custom-web progress bridge lives in `app/src/main/academy-bridge.js`, outside the template-synced JSON engine. It is injected before publisher head scripts. HTML certificates print through a separate sandboxed document, with completion data re-derived by the main process; this avoids blank or clipped iframe PDF output.
