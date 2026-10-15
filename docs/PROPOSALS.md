# Proposals for SemiTec Academy

**Scope.** SemiTec Academy is a **personal, offline self-study app**: a student installs it, adds
SemiTec Learning Packages (`.stlp`) and learns on their own, package by package. There are no
teachers, classes, administrators or servers inside the app.

Everything that needs several people and a server belongs to the **Foundation platform**: admin role,
teachers and classes, assignments, graded exams, hand-in of lab reports, calendars, projects,
careers and so on. Those proposals were moved to
`academy-to-platform.md` (an internal document, published in neither repository).
How the two can meet later is described in [the last section](#how-the-app-and-the-platform-fit-together).

**Principles for every proposal below**
- **Offline first.** Everything works without internet; online features are optional extras.
- **Private.** Progress, notes and answers stay on the student's computer, in their data folder.
- **Package-driven.** Authors switch features on in the package (glossary, practice tests, exercises…);
  the app shows only what a package uses.
- **Ready for the platform.** Stable ids and exportable JSON, so a later sync needs no migration.

Size: S ≤ 2 days, M ≤ 1 week, L > 1 week. Status: **proposed** unless noted; what has shipped is
marked done in ROADMAP.md (A7 prerequisites and A16 catalog are implemented).

| # | Proposal | What the student gets | Size | Package format |
|---|---|---|---|---|
| A1 | My mistakes | every wrong quiz answer in one list, with the page to re-read | S | — |
| A2 | Notes, bookmarks, highlights | own notes on PDFs, Markdown, lab steps and trainings | M | — |
| A3 | Search | find any word in a package and jump to it | M | — |
| A4 | Study planner and goals | "finish by 20 Dec" → a weekly plan, reminders, streaks, time spent — **plans, calendar, Today: done in 1.4.0** | M | `schedule` ✓ |
| A5 | Review and flashcards | short spaced-repetition sessions so knowledge stays | M | optional `glossary` |
| A6 | Practice tests | timed self-tests from a question pool, score history | M | optional question pools |
| A7 | Prerequisites and learning paths | items unlock in a sensible order; recommended next item | S | `requires` field |
| A8 | Completion certificates | a certificate for a finished package, printable — **done in 1.4.0 (local)** | M | `certificate` ✓ |
| A9 | HDL playground and self-checked exercises | write and simulate Verilog in the app; tests say what is wrong | L | new item `exercise` |
| A10 | Lab bench tools | serial terminal, waveform viewer, board programmer, PC check | M–L | lab `requirements` |
| A11 | Technical glossary EN / HY / RU | hover a term to see its meaning and translation | S–M | optional `glossary` |
| A12 | AI study helper (optional) | explanations and hints that cite the package; never quiz answers | M | — |
| A13 | Armenian / Russian interface | the app in the student's language | S | — |
| A14 | Accessibility and comfort | dark mode, text size, captions, keyboard, playback speed | S–M | optional `.vtt` |
| A15 | Backup and move to another computer | one file with all progress and notes; restore anywhere | S | — |
| A16 | Package catalogue and updates | browse and download Foundation packages; update badges — **done in 1.5.0 (folders + catalog links)** | M | `catalog.json` ✓ |
| A17 | My learning record | a PDF / JSON record of finished packages, scores, certificates | S–M | — |
| A18 | Report a problem to the author | "this step is wrong" → a ready e-mail / file with item and page | S | optional `contact` |
| | **New sections and features (after 1.4.0)** | | | |
| A19 | Home — my learning dashboard | time spent per week, streak, progress of all courses and projects, "continue" cards — **dashboard done in 1.5.0; time / streak open** | M | — |
| A20 | Notes section | all notes (items, project weeks) in one place, search, export as Markdown | S–M | — |
| A21 | Project workspace | links (git, Overleaf), files per deliverable, "submitted" ticks, weekly report for the supervisor meeting | M | — |
| A22 | Sources and reading list | references of courses and project learning paths, mark as read, BibTeX for the thesis | M | optional `references` |
| A23 | Skills profile | skills from learning paths and finished items; gaps before a project | M | — |
| A24 | Calendar extras | own events (exams, lab sessions), week view, `.ics` export, desktop notifications | S–M | — |
| A25 | Focus timer | Pomodoro on an item, logs time spent (feeds A19 and the planner) | S | — |
| A26 | What next | after a course: courses and projects that build on it | S | `requires` / areas |
| A27 | Help, tour and "What's new" | first-run tour, offline help, release notes after an update | S | — |
| A28 | My files | every file received (lab sources, materials, briefs) in one place, open / save | S | — |

**Suggested order**
0. **v1.4.0 (done):** library search and filters, enrollment and study plans, calendar, Today panel,
   projects, certificates, installers.
1. **v1.5.0 (done):** dashboard, A16 catalogue (folders and catalog links), publishers, package groups.
2. **v1.6.x (done):** A7 Prerequisites, course-order view, reset progress; production signing key.
3. **Next "self-study basics":** A1 My mistakes, A2 Notes and bookmarks, A15 Backup, A13 Armenian UI,
   A14 dark mode / text size. Small, no format change, big effect on daily use.
4. **Then "learn better":** A4 Planner, A5 Review, A6 Practice tests, A3 Search inside a course.
5. **Then "hands-on":** A9 HDL playground, A10 Lab bench, A11 Glossary.
6. **Later:** A8 certificates, A17 learning record, A12 AI helper, A18 feedback.

---

## A1 — My mistakes
A page per package (and one for all packages) listing every question answered wrongly in trainings,
lab quizzes and practice tests: the question, the student's answer, the correct answer once the quiz is
passed, and **Re-read** links to the subsection / PDF page / lab step (the review links the quizzes
already have). Entries disappear when the question is later answered correctly twice.
*Data:* already in the progress state (quiz attempts); no package change.

## A2 — Notes, bookmarks, highlights
- **Notes** on a PDF page, a Markdown heading, a lab step or a training subsection (side panel).
- **Bookmarks** with a list per package; **highlights** in Markdown and PDF (text layer).
- *Export notes* as one Markdown file per package (useful for exam preparation and the thesis).

## A3 — Search
Full-text search in a package: training texts, lab steps, Markdown readings, PDF text (pdf.js text,
indexed when the package is installed). Results open the exact subsection, page or step. Later: search
across all installed packages.

## A4 — Study planner and goals
- The student sets a goal per package ("finish by 20 December", or "3 hours a week"); the app spreads
  the remaining items over the weeks using each item's `estimatedTime`.
- **This week** card on the library page; desktop reminders at a chosen time; **streak** and **time
  spent** per day (the app already knows when items are open).
- Authors may suggest a pace in the package: `"schedule": [{ "week": 1, "items": [...] }]`.

## A5 — Review and flashcards
After a topic is passed, its quiz questions (and glossary terms, A11) come back after 1, 3, 7, 21 days
in a 5-minute **Review** session on the library page. Answers update the schedule (spaced repetition).
Keeps knowledge for exams and for the next lab.

## A6 — Practice tests
A **self-test** item per package or module: N random questions from the package's quizzes (or from an
author's question pool), optional time limit, no hints during the test, result with review links and a
**score history** chart. For self-assessment only — graded exams are a platform feature.

## A7 — Prerequisites and learning paths
`"requires": ["lab-01"]` on an item in the pack spec: the item shows *Recommended after: Lab 1* (soft) or
a lock (hard, author's choice). The library suggests **Continue with…** — the next unfinished item in
course order. A package may require another package (FPGA Starter → Verification 1).

## A8 — Completion certificates
When all required items of a package are done, the app issues a **package certificate** (design from a
`certificate.json` in the package, like trainings): name, package, date, scores, a certificate id.
Printable / PDF. Issued locally, so it is a personal record; verifiable certificates come with the
platform (sync).

## A9 — HDL playground and self-checked exercises
- **Playground:** edit and **simulate Verilog / SystemVerilog in the app** (Icarus Verilog or Verilator
  compiled to WebAssembly, or a bundled simulator); waveform in the viewer of A10. Practise without
  Vivado.
- **Exercise** (new item type): task text, starter code, a hidden **testbench** → *Run tests* shows which
  tests pass; counts as progress like a quiz. Authors create exercises with a new skill
  `academy-templates:exercise`.
- Later: synthesis with Yosys (LUT / FF count, schematic view).

## A10 — Lab bench tools
- **Serial terminal** (UART) for the board: baud rate, text / hex, log to a file.
- **Waveform viewer** for `.vcd` / `.fst` files: zoom, cursors, signal groups.
- **Board programmer:** program the FPGA with a bitstream (wraps `openFPGALoader`).
- **PC check:** the lab's `requirements` (Vivado version, drivers, disk space) shown as a green / red list
  before the lab starts.
- **Open in editor:** open the lab's source files in VS Code / the system editor, copy them to a work
  folder.

## A11 — Technical glossary EN / HY / RU
Terms from trainings and lab manuals with definitions and Armenian / Russian equivalents
(`glossary.json` in the package, generated by the templates). Hover a term in a reading to see it; a
glossary page per package; terms feed the flashcards (A5). Helps keep Armenian technical terminology
consistent.

## A12 — AI study helper (optional)
A side panel *Ask about this page*: simpler explanation, an example, a translation, a hint for a lab
step — answers cite the package's subsections / pages. Never answers quiz or practice-test questions,
switched off by the author per package (`"aiHelper": false`). Needs the student's own API key now, the
platform later. Off by default.

## A13 — Armenian / Russian interface
All UI strings in one dictionary per language (`renderer/i18n/<lang>.json`); language in Settings; the
training engine already has Armenian labels.

## A14 — Accessibility and comfort
Dark mode for the whole app, text size everywhere, dyslexia-friendly font option, high contrast,
reduced motion, full keyboard navigation and screen-reader labels; videos: captions (`.vtt` next to the
video), playback speed, picture-in-picture.

## A15 — Backup and move to another computer
*Export my data* → one file with the student's progress, notes, bookmarks and settings (packages are
re-added from their `.stlp` files); *Import* on another computer merges it. Automatic weekly backup in
the data folder (keeps the last 4).

## A16 — Package catalogue and updates
A public, read-only **catalogue** (JSON on the Foundation website): available packages with title,
version, size, minimum app version. The library gets a *Catalogue* tab, *Download* and *Update
available* badges; the app also checks for a new app version. No account needed.

## A17 — My learning record
A personal record of finished packages, items, scores, time spent and certificates, exported as a PDF
(to attach to a CV or an application) or JSON (to import into the platform later).

## A18 — Report a problem to the author
On every item: *Report a problem* → the student writes what is wrong; the app prepares an e-mail (or a
small file) with the package id and version, item, page / step and app version, addressed to the
package's `contact`. Authors get precise reports without any server.

## A19 — Home: my learning dashboard
A first page before the library: *Continue* cards (last opened item of each course / project), this
week's plan (from Today), time spent per day as a small heat-map, streak, totals (items done,
certificates). Time is measured while an item is open and the window is focused.

## A20 — Notes section
One page with every note the student wrote — project week notes (1.4.0), and later notes on PDFs,
Markdown and lab steps (A2) — grouped by course / project, searchable, *Export as Markdown*.

## A21 — Project workspace
On the project page: links (git repository, Overleaf, shared drive) that open in the browser, a
**deliverables checklist** with a "submitted on" date and files from the computer attached to each
deliverable (kept in the data folder), and **Weekly report**: the week's tasks, ticks and notes as a
short Markdown / PDF to send before the supervisor meeting (the brief asks for exactly this note).

## A22 — Sources and reading list
All references of a course (`references` in the spec) and of project learning paths (`sources` in
project.json) in one list: open the PDF / link, mark as read, copy as BibTeX for the diploma-project
template.

## A23 — Skills profile
Skills collected from the learning paths of enrolled projects (topic + level apply / understand / aware)
and from finished trainings and labs (tags in the package). Shows "ready" and "to learn" for each
project, and links to the items that teach a missing skill.

## A24 — Calendar extras
Own events (exam dates, lab sessions, meetings) added by the student, a week view, `.ics` export to
Google / Apple / Outlook calendars, and optional desktop notifications at a chosen time.

## A25 — Focus timer
A Pomodoro timer in the item bar (25 / 5 min); finished sessions are logged per item and day — the
dashboard (A19) and the planner use them to compare planned and real time.

## A26 — What next
When a course is finished: other installed courses and projects that list it as a prerequisite (A7)
or share its areas; from the catalogue (A16) when online.

## A27 — Help, tour and "What's new"
A short first-run tour (library → enroll → calendar → projects → certificates), a Help page that works
offline, and the release notes after an update (from `versions.js` notes).

## A28 — My files
Every file the student received — lab source files, materials, project briefs — in one searchable list
by course; open, save a copy, or show where the app keeps it.

---

## Ideas we decided to leave out of the app
- Several roles (admin, teacher), classes, assignments, deadlines set by teachers, graded exams, lab-report
  grading, shared calendars, announcements, Q&A, projects hub, careers, equipment booking, challenges with
  leaderboards, author analytics across students, verified certificates, lab-PC management →
  **Foundation platform** (`academy-to-platform.md`, internal).
- The app keeps **local accounts** only so that several people can share one computer; there is no
  administrator over them.

## How the app and the platform fit together

| Option | How | For / against |
|---|---|---|
| **1. Two products, one later sync (recommended)** | The **platform** (web + server) has users, roles, teachers, classes, assignments, grading. **Academy** stays the offline app. Later, *Sign in with a SemiTec account* in Academy: assigned packages are downloaded, progress / certificates are uploaded. | Academy stays simple and works offline; the server logic exists only once (in the platform). Needs a small sync API. |
| 2. Academy with its own server | An "Academy Server" for a university: accounts, teachers, admin. | Duplicates what the platform will do; two servers to maintain. |
| 3. Platform only (web) | Trainings already run inside a web platform (training template, *platform* mode); labs and readings as web pages. | No install, but no offline use, no lab tools, no local files. |

To keep option 1 easy, the app already uses **stable ids** (package, item, step, question), the **same
training-progress JSON** as the web platform (`training_progress`), and exportable progress (A15, A17).
The sync design itself is item PL5 in the platform document.

---

## Proposals for the skill (`academy-templates:package`)
See the `package` skill's `ROADMAP.md` in the Skills repository (https://github.com/SemiTecFoundation/semitec-academy-skills): video check and conversion, quiz drafting
from readings, package diff and release notes, translation runs, accessibility check, size budget, cover
generator, prerequisites in the spec, catalogue entry, CI check. New: glossary extraction (A11),
exercise skill (A9), schedule suggestion from `estimatedTime` (A4).
