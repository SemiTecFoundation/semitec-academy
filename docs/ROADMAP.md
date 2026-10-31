# Roadmap

SemiTec Academy's first public release is **2.2.0**. The version starts at 2.2.0, not 1.0.0, because
course packages already built with the Academy Templates declare `minAppVersion: "2.1.0"`; keeping the
number lets every existing package install. Earlier internal builds are not published.

## 2.2.1 — packages renamed to .zip (done)
- [x] File picker, drag and drop and catalog folders accept a package renamed to `.zip`; the content checks are the same. Ordinary ZIP files in a catalog folder are ignored; adding one directly says it is not a package. Only `.stlp` is associated with the app.

## 2.2.0 — initial public release (done)
### Foundations
- [x] First-run data folder, move data folder, local accounts (create on first login), change name / password
- [x] Library: add `.stlp` by button, drag & drop, or double-click (file association), update, remove
- [x] Package content hashes and validation; current releases accept packages without publisher keys
- [x] Version checks: pack format, item formats, minimum app version
- [x] Training player = web training template engine (platform mode), progress per user in SQLite
- [x] PDF reader (pdf.js): outline, zoom, page jump, resume, read tracking, mark as finished
- [x] Labs: manual PDF, steps checklist with code / hints / manual links, check quiz with review links
- [x] Packer CLI: init, add-training, add-reading, add-lab, validate, build (target app), inspect
- [x] Sample pack, end-to-end tests (Playwright + Electron)

### Sections, videos, materials, pack specs
- [x] Pack page in sections by type (Trainings, Labs, Readings, Videos, Other materials) + course-order view
- [x] Video items: local mp4/webm with resume and watched tracking, or online links
- [x] Other materials: PDF / image / text-code viewers, save a copy, open with default app, links
- [x] Pack spec (`pack-spec.json`): `stlp check` (material checker) and `stlp create`
- [x] Course-pack skill for AI assistants (now the `package` skill of the Skills repository)

### Labs with files
- [x] Lab source files (`"files"` in lab.json, lab format 2): Files tab with viewer and copy; *Download folder* includes the complete lab
- [x] Compact lab header (auto while scrolling, or pinned)
- [x] PDF reader keeps pages centred when the outline is hidden
- [x] Lab-manual template + skill (`skills/lab-manual`): PDF manual and app lab in sync

### SemiTec Academy, Markdown
- [x] App named **SemiTec Academy**, moved to `Foundation/Products/` (now the `semitec-academy` repository)
- [x] File type `.stlp` (SemiTec Learning Package; `.stp` is STEP CAD); CLI `packer/stlp.js`
- [x] Markdown readings (reading format 2): outline, tables, code with *Copy*, images, links between documents, text size, read tracking
- [x] Markdown materials open in the same reader
- [x] Skill `academy-templates:package` in the [Skills repository](https://github.com/SemiTecFoundation/semitec-academy-skills), released with the app (CHANGELOG, VERSION.json)
- [x] Feature proposals documented: [`PROPOSALS.md`](PROPOSALS.md) (self-study scope; multi-user ideas moved to the platform)

### Library, study plans, calendar, projects, certificates, installers
- [x] Library: search (courses and everything inside), filters All / In progress / Not started / Finished, content type, sorting
- [x] Enrollment with a start date: author's plan (`schedule` / `plannedWeeks`), finish-by date or self-paced (A4)
- [x] Study-plan view per course, training topic weeks (`training.json` schedule)
- [x] Calendar (month view with plan bars, agenda), Today panel, reminder on opening, badge in the menu
- [x] Projects (item type `project` from the project-brief template): a separate plan for advanced lab-style work, weekly dates, notes, milestones, deliverables, rubric, learning path and brief PDF; Projects page
- [x] Certificates page: training certificates and publisher-provided course certificates (A8, local), print / save as PDF
- [x] Installers (below)

#### Distribution
- [x] Installers with `electron-builder`: Windows one-click NSIS, macOS DMG / zip (arm64 + x64), Linux AppImage / deb (RELEASING.md)
- [x] App icon and `.stlp` file icon
- [x] Build script for the current system and a GitHub Actions workflow for all three
- [x] Packaged app tested end to end (`E2E_EXECUTABLE=…`)
- [x] Native DMG build on a Mac (CI, `macos-latest`); the Mac DMG was started on an Apple-silicon Mac
- [ ] Start the Windows installer on a real Windows machine
- [ ] Code-sign the installers (Windows certificate, Apple Developer ID + notarisation)
- [ ] Auto-update check (GitHub releases or Foundation server)

### Dashboard, catalog, publishers, groups
- [x] Dashboard as the main page (numbers, continue learning, Today, next 14 days, certificates, catalog news)
- [x] Catalog: folders and catalog links (`stlp catalog`), install / update with one click (A16)
- [x] Publisher name + logo on every package; filter by publisher (library, catalog, projects)
- [x] Library: *My packages* and *Explore*; user groups of packages (several groups per package), search by group name / description
- [x] Materials attached to labs (`for`): shown under the lab and in the lab's Materials tab
- [x] Project categories (research, diploma, thesis, course project, capstone, internship) with filter; fixed the My / All projects switch
- [x] Settings split into My account · Application · About

### Prerequisites and course order
- [x] Prerequisites (`"prerequisite": true`): shown before the course, not counted in progress,
      status or the certificate (A7); attached materials (`for`) no longer count either
- [x] Course-order view with modules; reset the progress of a package
- [x] Markdown readings load images from the package; packer `catalog` command
- [x] Installers built on real Windows, macOS and Linux runners and attached to each release;
      first native macOS DMGs
- [x] Real contact details in the installer metadata

### Open partner publishing
- [x] Independent partner publishing without a Foundation agreement or approval queue.
- [x] Optional publisher feedback contact (`name`, e-mail, site or instructions) shown in package details.
- [x] Optional package certificate: a package without `certificate` is complete and has no course
      certificate; training certificates still work.
- [x] Projects are tracked separately as harder, independent lab-style work. They start a project plan;
      they have no supervisor, application or approval workflow.

### Trainings, downloads and previews
- [x] Two training formats with independent optional HTML certificates and author previews.
- [x] Complete-folder downloads from package rows and viewers, including project sources/attachments.
- [x] Preview-only password scope alongside full-package access.
- [x] Manual progress for custom web presentations; required course order and study plan checks at build/import.
- [x] PDF text selection/copy, internal links/bookmarks and external website links.
- [x] Preview-password unlock opens all training sections in Academy without changing learner progress.
- [x] Release tests use an isolated Electron profile and safely preserve an empty system clipboard on every supported platform.

### Open distribution
- [x] Packages from any publisher install without keys or a Foundation approval
- [x] The SemiTec Foundation catalog is added as the initial catalog source

## Next — self-study basics (PROPOSALS.md)
- [ ] My mistakes (A1), notes and bookmarks (A2), backup / move (A15), Armenian UI (A13), dark mode and text size (A14)

## Then — learn better
- [ ] Review / flashcards (A5), practice tests (A6), search inside a course (A3)

## Then — hands-on
- [ ] HDL playground and exercises (A9), lab bench tools (A10), glossary (A11)
- [ ] Stream large videos from the package instead of loading the whole package into memory at install

## Later — connected (with the Foundation platform)
- [x] Package catalogue and updates (A16) — included (folders and catalog links); syncing with
      a Foundation server is what remains
- [ ] Optional sign-in with a platform account; sync progress and certificates
      (same state JSON as `training_progress`; design: academy-to-platform.md, an internal note published in neither repository, PL5)
