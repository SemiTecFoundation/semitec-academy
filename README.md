# SemiTec Academy

**SemiTec Academy** is the SemiTec Foundation's desktop learning app. Students install it once, create a
local account, and add **SemiTec Learning Packages** (`.stlp`) — one signed file per course with
trainings, labs, readings, videos and other materials. Progress is saved per student in a local database.
New packages and new versions of packages can be added at any time; the app does not need to change.

```
  Foundation/Products/Skills/AcademyTemplates/  Foundation/Products/Academy/                student PC
 ┌──────────────────────────────────┐        ┌──────────────────────────────┐      ┌──────────────────────────────┐
 │ skills/training                   ─┐      │ packs/<name>/pack-spec.json  │      │ SemiTec Academy              │
 │ skills/lab-manual                   ┤ ───► │ packer/stlp.js check/create  │ ───► │  account → library → package │
 │ PDFs, Markdown, videos, files     ─┘      │ dist/<id>-<version>.stlp     │ .stlp│  sections, progress, quizzes │
 │ skills/package (AI skill)         ──────► │                              │      │  local DB (SQLite)           │
 └──────────────────────────────────┘        └──────────────────────────────┘      └──────────────────────────────┘
```

## Install

One file per system, no questions asked — details in [`docs/INSTALLING.md`](docs/INSTALLING.md):

Downloads: **[latest release](https://github.com/SemiTecFoundation/semitec-academy/releases/latest)**.

| System | Installer |
|---|---|
| Windows 10 / 11 | `SemiTec-Academy-Setup-<v>.exe` — one click: installs for the user, shortcuts, `.stlp` files, starts the app |
| macOS (Apple chip / Intel) | `SemiTec-Academy-<v>-mac-arm64.dmg` / `-x64.dmg` — drag to Applications |
| Linux | `.AppImage` (run) or `.deb` (`sudo apt install ./…deb`) |

Building them: [`docs/RELEASING.md`](docs/RELEASING.md) — push a tag `v<version>` and the
[Build installers](../../actions/workflows/build-installers.yml) workflow builds all three on real
Windows, macOS and Linux machines and attaches them to the release. Locally:
`npm run dist:win|mac|linux`, or `app/tools/build-installers.sh` for this computer's system.

## What the student does

1. Installs **SemiTec Academy** and chooses a data folder (accounts, progress, packages live there).
2. Types a username: an existing user logs in with the password; a new username creates an account.
3. Starts on the **Dashboard**: numbers, *Continue learning*, the **Today** panel (what is due this week and
   what is overdue, for courses and projects), the next 14 days, latest certificates and news from the catalog.
4. Gets packages from the **Catalog** — folders (shared drive, OneDrive, USB) and catalog links published by
   the SemiTec Foundation or partner companies, set in *Settings → Application* — or adds a `.stlp` file
   (button, drag and drop, double-click). Every package shows its **publisher with logo**.
5. Uses the **Library**: *My packages* (the student's own list, sorted into **groups** they create — a
   package can be in several groups) and *Explore* (every package installed on the computer, marked when it is
   already in My packages, enrolled or in progress). Both have search (also by group name / description),
   filters *All · In progress · Not started · Finished*, publisher, content type and sorting.
6. **Enrolls** in a course (start date; the author's week plan, a finish date, or self-paced) — the plan
   appears in the course's *Study plan* view and in the **Calendar**; a reminder shows when the app opens.
7. Opens the package. It is shown in **sections** — Trainings, Labs, Readings, Videos, Other materials
   (only those the package has) — or, if the author defined modules, in **course order**:
   - **trainings** — the interactive training of the web template; quizzes unlock topics, certificate;
   - **labs** — manual PDF (steps link to their page), steps checklist, **source files** (viewer,
     *Download all* as zip) and a check quiz; the lab header shrinks to one line while scrolling;
   - **readings** — PDF reader (outline, zoom, resume, pages read) or **Markdown reader** (outline,
     tables, code with *Copy*, images, text size, read tracking);
   - **videos** — player that resumes and tracks how much was watched, or a link to an online video;
   - **other materials** — PDF / image / code / Markdown viewers, *Save a copy*, *Open with default app*, links;
   - **projects** — diploma / research projects from a project brief: enroll, weekly plan with dates,
     tick weeks, notes for the supervisor meeting, milestones, deliverables, rubric, learning path, brief PDF.
8. Collects **certificates**: one per completed training and one per completed course; view, print,
   save as PDF. **Projects** lists all projects of the installed packages and the ones the student is in.

## Folder

```
Academy/
├── README.md                 ← you are here
├── docs/
│   ├── ARCHITECTURE.md       processes, stl:// protocol, database, security
│   ├── PACK-SPEC.md          pack-spec.json: all materials of a package in one file (check / create)
│   ├── PACKAGE-FORMAT.md     the .stlp file: manifest, signature, item formats
│   ├── VERSIONING.md         app versions ↔ content formats ↔ package versions
│   ├── AUTHORING.md          how authors make packages (+ lab.json reference)
│   ├── INSTALLING.md         installing on Windows / macOS / Linux (for students)
│   ├── RELEASING.md          building and signing the installers, release checklist
│   ├── KEYS.md               signing keys: development vs. production
│   ├── ROADMAP.md            done and planned releases
│   └── PROPOSALS.md          proposed self-study features (mistakes, notes, planner, review, HDL playground, …)
├── app/                      the Electron application (source; version in app/package.json)
│   ├── src/main/             window, stl:// protocol, database, accounts, library
│   ├── src/preload/          the safe bridge (window.api)
│   ├── src/renderer/         UI: login, library (search, filters, Today), package page + study plan, calendar,
│   │                         projects, certificates, PDF / Markdown readers, lab, video, materials
│   ├── src/engine/training/  training engine copied from Products/Skills/AcademyTemplates/skills/training
│   ├── src/shared/           package format, versions, validation — shared with the packer and the skill
│   ├── trusted-keys/         public keys whose signatures the app accepts
│   ├── build/                app and .stlp file icons for the installers
│   ├── tools/sync-engine.js  refreshes the training engine from the template
│   ├── tools/build-installers.sh  fresh install + tests + installers for this system
│   └── test/e2e.js           end-to-end test (Playwright + Electron)
├── packer/stlp.js            CLI: check · create · inspect · keygen · bundle-skill (+ step-by-step commands)
├── packs/demo-partner/       sample package of another publisher (MBIST primer + diploma project) for the catalog
├── packs/fpga-starter/       sample package source: pack-spec.json + 2 trainings, 2 labs, 3 readings, 2 videos, 4 materials, 1 project, 7-week plan
├── dist/                     built packages (.stlp)
├── installers/<version>/     built installers, local only — released ones are attached to the release
├── .github/workflows/        GitHub Actions: build + release the installers on Windows, macOS, Linux
├── ci/build-installers.yml   the same workflow as a template for a monorepo checkout
└── keys/README.md            where signing keys live (public halves only; see docs/KEYS.md)
```

The AI skill that builds packages is part of the **Academy Templates** plugin
([`Products/Skills/AcademyTemplates`](https://github.com/SemiTecFoundation/semitec-academy-skills/blob/main/AcademyTemplates/README.md)):
[`Products/Skills/AcademyTemplates/skills/package`](https://github.com/SemiTecFoundation/semitec-academy-skills/blob/main/AcademyTemplates/skills/package/README.md)
(skill `academy-templates:package`, released together with the app).

## Quick start (developer)

Requires **Node.js 20+**.

```bash
cd app
npm install                       # Electron, pdf.js, sql.js, fflate, marked, DOMPurify
npm start                         # run the app
npm test                          # 73 end-to-end checks (Linux CI: xvfb-run -a npm test)
```

Build the sample package and add it in the app:

```bash
node packer/stlp.js check  packs/fpga-starter/pack-spec.json
node packer/stlp.js create packs/fpga-starter/pack-spec.json --key <offline>/semitec-foundation.key.pem --out dist
#   no key at hand? add --unsigned instead and turn on Developer mode in Settings
# → dist/org.semitec.fpga-starter-1.6.0.stlp   (drag it onto the app window)
```

## Make a package (author)

One **pack spec** lists all materials with their paths; `check` validates everything, `create` builds
and signs. Format: [`docs/PACK-SPEC.md`](docs/PACK-SPEC.md) · guide: [`docs/AUTHORING.md`](docs/AUTHORING.md).
With an AI assistant: the `academy-templates:package` skill writes the spec, runs the checker, fixes
what it can and creates the package.

## Versions

The **app version** (`app/package.json`) decides which **content formats** it can open
(`app/src/shared/versions.js`); the packer writes the formats used and the **minimum app version** into
every package; a package has its own **content version** for updates. See [`docs/VERSIONING.md`](docs/VERSIONING.md).

| App | Added |
|---|---|
| 1.0.0 | accounts, library, signed packages, trainings, labs, PDF readings |
| 1.1.0 | sections by type, videos, other materials, pack specs |
| 1.2.0 | lab source files, compact lab header |
| 1.3.0 | name **SemiTec Academy**, `.stlp` packages, Markdown readings and materials |
| 1.4.0 | installers; library search and filters; enrollment and study plans; calendar; Today panel and reminders; projects; certificates page |
| 1.5.0 | dashboard; catalog (folders + catalog links); publishers with logos; My packages / Explore with groups; materials attached to labs; project categories; settings *My account / Application / About* |
| 1.6.1 | new development signing key — the first one was published by mistake and is no longer trusted |
| 1.6.2 | production signing key `4c71eba82f86fcca`, the only trusted key; no development key is trusted any more; real contact details |

## Status

Working prototype (v1.5.0), all features covered by `npm test`; installers for Windows, macOS and Linux.
Next: code signing (RELEASING.md), and the proposals in [`docs/PROPOSALS.md`](docs/PROPOSALS.md) — self-study features first; multi-user features belong to the Foundation platform.
