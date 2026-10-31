# SemiTec Academy

**A free, open-source desktop learning app for students.** Students install SemiTec Academy once, add
course packages (`.stlp` files), and study on their own computer: interactive trainings with quizzes, labs
with source files, readings, videos and projects, with their progress saved locally. No server, no sign-up
and no internet connection are needed to study.

**▶ [Introduction and presentation](https://semitecfoundation.github.io/semitec-academy/)** ·
**⬇ [Download the app](https://github.com/SemiTecFoundation/semitec-academy/releases/latest)** ·
**[Install guide](docs/INSTALLING.md)** · **[Learner guide](docs/LEARNING.md)**

Current version: **2.2.1** (2.2.0 was the initial public release). Source code under the [Apache-2.0](LICENSE) license.

## For universities

- **Free and open source.** Use it in your courses at no cost; the source code is public and can be
  reviewed, built and adapted under Apache-2.0.
- **Students work on their own computers.** Windows, macOS and Linux installers; accounts, progress and
  packages stay in a local folder the student chooses. The app only goes online to read the catalogs
  and download the packages the student selects.
- **Course packages, always up to date.** The SemiTec Foundation catalog is already set up in the app
  (*Catalog*). Every package the Foundation publishes in
  [SemiTec Academy Materials](https://github.com/SemiTecFoundation/semitec-academy-materials) appears there
  automatically, with no app update or setup; a newer version of an installed package shows as an update.
  A package can also be shared directly as a file (e-mail, shared drive, USB).
- **Your own materials.** Lecturers can publish their own packages and catalog without any agreement or
  approval from the Foundation, using the [Academy Templates](https://github.com/SemiTecFoundation/semitec-academy-skills)
  and the [publishing guide](docs/PUBLISHING.md). Each publisher remains responsible for its content.
- **Questions and feedback:** open an [issue](https://github.com/SemiTecFoundation/semitec-academy/issues)
  or write to info@semitec.org.

### Getting a class started

1. Each student downloads the installer for their computer from the
   [latest release](https://github.com/SemiTecFoundation/semitec-academy/releases/latest) and installs it
   (macOS needs one extra step, explained in the [install guide](docs/INSTALLING.md#macos)).
2. On first start, the student chooses a data folder and creates a local account (just a username and password).
3. The student opens **Catalog** and installs a package, or drags a `.stlp` file the lecturer shared onto the
   app window.
   If e-mail or a learning platform blocks `.stlp` files, share the package renamed to `.zip`: Academy 2.2.1 and
   newer accept it as it is and check it like any package.
4. The student enrolls, follows the course order or study plan, and continues where they left off each time.

## SemiTec Foundation and source projects

SemiTec Academy is a SemiTec Foundation project. Visit [semitec.org](https://semitec.org) to follow the
Foundation's goals, aims and projects as its public site develops.

- [SemiTec Academy on GitHub](https://github.com/SemiTecFoundation/semitec-academy) — the desktop app,
  package format and local installers.
- [Academy Templates on GitHub](https://github.com/SemiTecFoundation/semitec-academy-skills) — the skills
  and templates used to create standalone learning materials or optional Academy packages.

© 2026 SemiTec Foundation. The source code is [Apache-2.0](LICENSE); SemiTec Foundation and SemiTec Academy
names, marks and logos are reserved as described in [TRADEMARKS.md](TRADEMARKS.md).

This repository contains the app, package-building tools and automated test fixtures. Course sources
and built course packages belong in `semitec-academy-materials`. No course package is distributed here.
The separate [Academy Templates](https://github.com/SemiTecFoundation/semitec-academy-skills) repository
contains the current AI-agent skills and templates for creating learning materials.

![Academy Templates authoring and packaging flow](app/src/renderer/assets/authoring-flow.png)

![Academy package lifecycle](docs/diagrams/package-lifecycle.png)

The [package lifecycle](docs/WORKFLOW.md) and [publishing workflow](docs/PUBLISHING.md) explain where each
part belongs. The app receives finished packages; it never owns or publishes course source material.

## Install

One file per system, no questions asked — details in [`docs/INSTALLING.md`](docs/INSTALLING.md):

Downloads: **[latest release](https://github.com/SemiTecFoundation/semitec-academy/releases/latest)**.

| System | Installer |
|---|---|
| Windows 10 / 11 | `SemiTec-Academy-Setup-<v>.exe` — one click: installs for the user, shortcuts, `.stlp` files, starts the app |
| macOS (Apple chip / Intel) | `SemiTec-Academy-<v>-mac-arm64.dmg` / `-x64.dmg` — drag to Applications, then **one Terminal line** to clear the quarantine mark (the build is not notarised): `xattr -dr com.apple.quarantine "/Applications/SemiTec Academy.app"` |
| Linux | `.AppImage` (run) or `.deb` (`sudo apt install ./…deb`) |

Building them: [`docs/RELEASING.md`](docs/RELEASING.md) — raise the version in `app/package.json` and push to
`main`: the [Build installers](../../actions/workflows/build-installers.yml) workflow builds all three on real
Windows, macOS and Linux machines and publishes the release `v<version>` with them. Locally:
`npm run dist:win|mac|linux`, or `app/tools/build-installers.sh` for this computer's system.

## What the student does

1. Installs **SemiTec Academy** and chooses a data folder (accounts, progress, packages live there).
2. Types a username: an existing user logs in with the password; a new username creates an account.
3. Starts on the **Dashboard**: numbers, *Continue learning*, the **Today** panel (what is due this week and
   what is overdue, for courses and projects), the next 14 days, latest certificates and news from the catalog.
4. Gets packages from the **Catalog** — folders (shared drive, OneDrive, USB) and catalog links published by
   the SemiTec Foundation or partner companies, set in *Settings → Application* — or adds a `.stlp` file
   (button, drag and drop, double-click). Every package shows its **publisher with logo** and cover; a
   publisher may also define accessible accent colours for its own package, labs, projects and materials.
   A publisher may also choose an optional package password. A learner must enter it after every successful
   installation or re-installation of that package before opening protected material or author previews.
5. Uses the **Library**: *My packages* (the student's own list, sorted into **groups** they create — a
   package can be in several groups) and *Explore* (every package installed on the computer, marked when it is
   already in My packages, enrolled or in progress). Both have search (also by group name / description),
   filters *All · In progress · Not started · Finished*, publisher, content type and sorting.
6. **Enrolls** in a course (start date; the author's week plan, a finish date, or self-paced) — the plan
   appears in the course's *Study plan* view and in the **Calendar**; a reminder shows when the app opens.
7. Opens the package. It is shown in **sections** — Trainings, Labs, Readings, Videos, Other materials
   (only those the package has) — in **course order**, or by its mandatory **study plan**:
   - **trainings** — an interactive Academy JSON training (quizzes unlock topics and can issue a training certificate), or a self-contained local web training with its own JavaScript interactions; each can be downloaded for browser-only study;
   - **labs** — manual PDF (steps link to their page), steps checklist, **source files** (viewer and complete-folder download) and a check quiz; the lab header shrinks to one line while scrolling;
   - **readings** — PDF reader (outline, zoom, resume, pages read, selectable text and clickable links) or **Markdown reader** (outline,
     tables, code with *Copy*, images, text size, read tracking);
   - **videos** — player that resumes and tracks how much was watched, or a link to an online video;
   - **other materials** — PDF / image / code / Markdown viewers, *Download folder*, *Open with default app*, links;
   - **projects** — advanced lab-style work: start a separate weekly plan, tick weeks, keep notes,
     follow milestones, deliverables, rubric, learning path and a brief PDF.
   The package page can also download one learner-owned folder with the available PDFs, source files,
   materials and standalone training copies.
8. Shows **certificates** only when the author/publisher offers them. Package and individual training
   certificates are independently optional in both training formats. New certificates use sandboxed
   HTML/CSS/JavaScript designs; view, print and save as PDF. Projects remain part of their package and have
   separate progress trackers.

**Download folder** appears next to every item in By type and Course order and in the item viewer. It
copies the complete lab/project/training with sources and supporting material. Author `index_preview.html` files are
excluded by default, including for packages with no password. A successful package-password unlock allows
previews to be included; normal training downloads remain available with preview scope. Read the [learner guide](docs/LEARNING.md) for downloads, passwords, progress, certificates and PDFs.

## Folder

```text
semitec-academy/
├── README.md                 this guide
├── LICENSE                   Apache-2.0 source license
├── NOTICE.md                 copyright and course-content boundary
├── TRADEMARKS.md             SemiTec name and logo use
├── docs/                     architecture, authoring, package format, install, release and workflow guides
│   ├── diagrams/             PNG/SVG lifecycle diagrams used by the documentation
│   └── presentation/         standalone HTML/CSS/JavaScript product introduction with screenshots
├── app/                      Electron application; version and dependencies in app/package.json
│   ├── src/
│   │   ├── main/             window, stl:// protocol, database, accounts and library
│   │   ├── preload/          the safe bridge (window.api)
│   │   ├── renderer/         student interface, library, calendar, projects, readers and authoring-flow image
│   │   ├── engine/training/  engine copied from the Skills repo's training skill
│   │   └── shared/           package format, versions and validation shared with the packer
│   ├── test/
│   │   ├── fixtures/         fictional packages and a throwaway key for tests only
│   │   ├── packages.test.js  package validation and safe-installation tests
│   │   └── e2e.js            Playwright + Electron desktop checks
│   ├── build/                application and .stlp icons
│   └── tools/                engine sync and local installer build scripts
├── packer/stlp.js            CLI: check · create · inspect · bundle-skill
├── installers/<version>/     local build outputs; published installers are GitHub release assets
├── .github/workflows/        CI and cross-platform installer releases
```

The AI skill that builds packages is part of the **Academy Templates** plugin
([`Academy Templates`](https://github.com/SemiTecFoundation/semitec-academy-skills/blob/main/README.md) in the Skills repository):
[`skills/package`](https://github.com/SemiTecFoundation/semitec-academy-skills/blob/main/skills/package/README.md)
(skill `academy-templates:package`, released as part of the Academy Templates product and compatibility-tested with the app).

The app is the learner-facing end of the workflow. Authors can use the other Academy Templates skills for
standalone labs, trainings and project briefs; the package skill is only needed to collect selected
materials into one Academy course. See [the package lifecycle](docs/WORKFLOW.md).

## Quick start (developer)

Requires **Node.js 20+**.

```bash
cd app
npm install                       # Electron, pdf.js, sql.js, fflate, marked, DOMPurify
npm start                         # run the app
npm test                          # package tests + desktop checks (Linux CI: xvfb-run -a npm test)
npm run test:unit                 # package tests without opening Electron
```

`npm test` needs no second checkout: it builds disposable fixture packages from
[`app/test/fixtures/build.js`](app/test/fixtures/build.js).
The desktop suite uses a temporary profile and data folder and removes its test data after the run.
CI runs the package tests on Windows, macOS and Linux and the desktop checks on Linux for main-branch
updates and pull requests. Built `.stlp` files are ignored and rejected by CI; keep only fixture sources here.

To try a package, build it and add it to the app:

```bash
node packer/stlp.js check    <pack-spec.json>
node packer/stlp.js create   <pack-spec.json> --out /tmp
#   → /tmp/<id>-<version>.stlp   (drag it onto the app window)
```

Anyone can share packages directly or through a catalog. See [`docs/PUBLISHING.md`](docs/PUBLISHING.md)
and the [Foundation catalog sources](docs/CATALOG-SOURCES.md).

`npm run sync-engine` is the one command that needs the
[skills repository](https://github.com/SemiTecFoundation/semitec-academy-skills) cloned next to this
one, so that `semitec-academy/` and `semitec-academy-skills/` share a parent folder.

## Make a package (author)

One **pack spec** lists all materials with their paths; `check` validates everything, `create` builds
the package. Format: [`docs/PACK-SPEC.md`](docs/PACK-SPEC.md) · guide: [`docs/AUTHORING.md`](docs/AUTHORING.md).
With an AI assistant: the `academy-templates:package` skill writes the spec, runs the checker, fixes
what it can and creates the package.

## Versions

The **app version** (`app/package.json`) decides which **content formats** it can open
(`app/src/shared/versions.js`); the packer writes the formats used and the **minimum app version** into
every package; a package has its own **content version** for updates. See [`docs/VERSIONING.md`](docs/VERSIONING.md).

**2.2.0 is the initial public release.** It includes: local accounts and library; dashboard, calendar,
study plans and reminders; catalog sources and publishers; trainings in two formats (Academy JSON and
custom HTML/CSS/JavaScript) with quizzes and optional certificates; labs with manuals and source files;
PDF and Markdown readings; videos; other materials; projects; full-folder downloads; optional package
passwords; and installers for Windows, macOS and Linux. The number starts at 2.2.0 because packages built
by the current Academy Templates require app 2.1.0 or newer. **2.2.1** also accepts a package renamed to `.zip`
(for e-mail or learning platforms that block unknown file types). See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## License, package ownership and partner publishing

SemiTec Academy source and documentation are available under [Apache-2.0](LICENSE). Anyone may build and
share standalone materials or packages without a Foundation agreement or approval. The publisher remains
responsible for the course content, its rights, author attribution, feedback contact and any optional
certificate. Students and universities choose their catalog sources. Read
[the publishing workflow](docs/PUBLISHING.md), [NOTICE.md](NOTICE.md) and [trademark guidance](TRADEMARKS.md).

## Status

Current release: **v2.2.1** (packages renamed to `.zip` are accepted); v2.2.0 was the initial public release. All features are covered by `npm test`; installers
for Windows, macOS and Linux are built on real runners for each system and attached to the release.
Next: code signing ([RELEASING.md](docs/RELEASING.md)) and the self-study proposals in
[`docs/PROPOSALS.md`](docs/PROPOSALS.md); multi-user features belong to the Foundation platform.
