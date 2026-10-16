# Pack spec — one JSON file that describes a whole course pack

A **pack spec** lists everything that goes into a course pack — trainings, labs, readings, videos,
other materials and projects — with the **path of each source**, plus an optional **study plan**. The materials can stay wherever they are
(template folders, diploma-project folders, a shared drive); nothing has to be copied by hand.

```bash
node packer/stlp.js check  <pack-spec.json>                          # checks every material, changes nothing
node packer/stlp.js create <pack-spec.json> --key <private.pem>      # check → assemble → validate → sign → .stlp
#   a worked example lives in app/test/fixtures/fpga-starter/ (the end-to-end suite's fixture)
```

`create` always runs the same check first and stops on any error. Without `--out` the pack is written
to `dist/` next to the spec. `--keep <folder>` keeps the assembled pack folder for inspection;
`--unsigned` builds a test pack (install it with *Developer mode* on).

## Format (specVersion 1)

All paths are **relative to the spec file**. Every section except `pack` is optional, but the pack
needs at least one material. Ids are optional (made from the title / file name) but recommended:
students' progress is stored per id, so keep them stable between versions.

```json
{
  "specVersion": 1,
  "pack": {
    "id": "org.semitec.fpga-starter",          // reverse-domain, lowercase — never change it
    "version": "1.1.0",                        // raise it for every update you share
    "title": "FPGA Starter Track",
    "description": "Shown in the library and on the pack page.",
    "language": "en",
    "publisher": "SemiTec Foundation",         // shown with the logo; students filter by publisher
    "publisherLogo": "publisher-logo.svg",     // square image (SVG / PNG), app ≥ 1.5.0
    "publisherUrl": "https://…",               // optional
    "authors": ["Arman Manukyan, PhD"],
    "contact": {                                // optional: where students can ask the publisher for feedback
      "name": "Course team",
      "email": "courses@example.org",
      "url": "https://example.org/courses",
      "instructions": "Use the course title in your message."
    },
    "cover": "cover.svg",                      // optional image, about 600 × 340
    "branding": {                                // optional: Academy ≥ 1.8.0
      "accent": "#006B54",
      "accentInk": "#FFFFFF",
      "accentSoft": "#E2F4EE"
    },
    "certificate": "certificate.json"          // optional: omit it when this package does not issue a course certificate
  },

  "schedule": {                                // optional study plan (app ≥ 1.4.0) — see "Study plans" below
    "weeks": 7,
    "entries": [
      { "weeks": [1, 2], "title": "Start here", "items": ["feature-tour", "design-flow"], "note": "Learn how trainings work." },
      { "week": 3, "title": "Shift registers — theory", "items": ["shift-registers"] }
    ]
  },

  "trainings": [                               // web training template folders (training.json + topics/)
    { "id": "shift-registers", "title": "Shift registers", "source": "trainings/shift-registers",
      "description": "Theory for Lab 1", "estimatedTime": "30 min" }
  ],
  "labs": [                                    // lab/ folders made with the lab-manual template (lab.json + manual.pdf + src/)
    { "id": "lab-01-shift-register", "source": "../../labs/lab-01-shift-register" }
  ],
  "readings": [                                // PDF files, or Markdown files (+ their images) — app ≥ 1.3.0
    { "id": "ecc-brief", "title": "Project brief: ECC memory", "source": "../briefs/ecc/brief.pdf", "estimatedTime": "30 min" },
    { "id": "vivado-ref", "title": "Vivado quick reference", "source": "readings/vivado-quick-reference/vivado-quick-reference.md" }
  ],
  "videos": [                                  // .mp4 (H.264+AAC) / .webm file, or an online link
    { "id": "design-flow", "title": "The FPGA design flow", "source": "videos/design-flow.mp4", "poster": "videos/flow.png" },
    { "id": "vivado-tour", "title": "Vivado tour (online)", "url": "https://…" }
  ],
  "materials": [                               // anything else: zip, xdc, code, images, datasheets (PDF), links
    { "id": "lab1-starter", "title": "Lab 1 starter files", "source": "files/lab1-starter.zip" },
    { "id": "datasheet", "title": "Board user guide", "url": "https://…" }
  ],

  "projects": [                                // project/ folders made with the project-brief template (project.json + brief.pdf) — app ≥ 1.4.0
    { "id": "ecc-sensor-memory", "source": "projects/ecc-sensor-memory", "description": "Bachelor diploma project, 30 weeks" }
  ],

  "modules": [                                 // optional "course order" view; the app always also shows sections by type
    { "id": "start", "title": "Start here", "items": ["feature-tour", "design-flow"] }
  ]
}
```

(Comments are for explanation only — real JSON has none.)

### Fields per material

| Field | Used by | Meaning |
|---|---|---|
| `id` | all | unique in the pack; lowercase, digits, `-` `.` `_` |
| `title` | all | shown to students; default: training/lab title or file name |
| `source` | all | path to the folder (training, lab) or file (reading, video, material) |
| `url` | video, material | instead of `source`: an online video / web page (opens in the browser) |
| `description` | all | one line under the title |
| `estimatedTime` | all | e.g. `"30 min"`, `"2 h"` |
| `poster` | video | preview image shown before playing |
| `plannedWeeks` | all | weeks planned for this item; used for the study plan when there is no `schedule` (app ≥ 1.4.0) |
| `for` | all (usually materials) | id of the lab / training / project this item belongs to: shown **under** that item in *Course order* and *Study plan* and in the lab's **Materials** tab, not as a row of its own; no own week needed (app ≥ 1.5.0; older apps list it normally) |
| `prerequisite` | all | `true` = an optional **refresher** for what the course assumes (e.g. a *Digital logic* training before *Memory BIST*). Shown first under **Before you start — prerequisites**; **not counted** in progress, *in progress* status or the package certificate, and not part of the study plan (app ≥ 1.6.0; older apps count it). Cannot be combined with `for` |
| `category` | project | `research` · `diploma` · `thesis` · `course-project` · `capstone` · `internship` · `other` — filter on the Projects page (default: from `project.json`) |

### Package branding (Academy ≥ 1.8.0)

`pack.branding` is optional. It gives the package's own **details page, labs, projects, readings and
other materials** the publisher's accent colours. It does not replace the Academy navigation or the
learner's application theme, and it does not change another package.

```json
"branding": {
  "accent": "#006B54",
  "accentInk": "#FFFFFF",
  "accentSoft": "#E2F4EE"
}
```

`accent` and `accentInk` are required six-digit hex colours and must meet a 4.5:1 contrast ratio;
`accentSoft` is optional. No CSS, fonts, images, scripts or layout rules belong here. A branded package
uses package format 2, so `stlp check` reports **Academy ≥ 1.8.0**. Keep the cover and publisher logo
as the package's identity in Catalog and Library.

Interactive trainings have their own theme files. Make a matching `css/themes/<company>.css`, list it in
the training's `themes`, and use it as the training's default `theme`. Certificates use their separate
`certificate.json → style` colours.

### How "other materials" are shown

| File | In the app |
|---|---|
| `.pdf` | PDF reader + *Save a copy* |
| `.md` | Markdown document reader (app ≥ 1.3.0; older apps offer the file for saving) |
| `.png .jpg .gif .webp .svg` | image viewer with zoom |
| `.txt .md .v .sv .vhd .xdc .tcl .py .c .h .json .csv .yaml …` | text / code viewer with line numbers and *Copy* |
| `.mp4 .webm` | video player |
| anything else (`.zip`, `.xlsx`, `.docx`, …) | *Save a copy* / *Open with default app* |
| `url` | *Open in the browser* |

## Study plans (app ≥ 1.4.0)

A student **enrolls** in a package and chooses a start date; the app maps the plan onto the calendar from
that day (week 1 = the 7 days from the start date), shows it in the *Study plan* view, on the *Today* panel
and in the *Calendar*, and marks blocks as done / this week / overdue from the student's progress.
The plan comes from (first match wins):

1. **`schedule`** in the spec — the author's week plan: `entries` with `week` (or `weeks: [from, to]`),
   `title`, optional `note`, and the `items` to do in those weeks. `check` reports unknown items and
   warns about items without a week.
2. **`plannedWeeks`** on items — items are planned one after another in course order; items without
   `plannedWeeks` join the previous block.
3. Neither — **self-paced**; the student may choose a finish date and the app spreads the items over the
   weeks by their `estimatedTime`.

A training can also carry its own topic plan in `training.json` (`"schedule": { "weeks": 2, "topics":
[{ "week": 1, "topics": [ids] }] }`, made with the training template); the app shows those topic weeks
inside the training's block. **Projects** are advanced lab-style package items. They have their own 30-week
(or other) plan in `project.json`; students start and track that project plan separately from a course plan.

## Publishing a catalog

Students find packages in the app's **Catalog**. Two ways to publish:

- **A folder** — put the `.stlp` files in a shared folder (network drive, OneDrive, USB); students add the
  folder in *Settings → Application → Catalog sources*.
- **A catalog link** — `node packer/stlp.js catalog <folder with .stlp> --name "Your company"` writes
  `catalog.json` (+ `catalog-assets/` with covers and logos) next to the files; upload the folder to a
  website and give students the link of `catalog.json`. Each company can publish its own catalog.

The app shows every package with cover, publisher and logo, *Install* / *Update available* / *Installed*,
and installs through the normal signature check. A recipient can add a partner's public key in *Settings →
Application → Trusted publishers*; this is their local trust decision, not Foundation approval.

## What `check` verifies

| Material | Checks |
|---|---|
| pack | id format, version `X.Y.Z`, title; cover is an image |
| training | folder exists; `training.json` valid with id, title, topics; every topic file exists and is valid; unique topic / subsection ids; known block types; all assets exist; scroll / step SVGs have `data-step`; quizzes: question types, correct indices in range, single-answer types have one answer, `review` points to real subsections; certificate file exists |
| lab | `lab.json` valid; title; steps with unique ids and titles; manual PDF exists and is a PDF; source files listed in `files` exist (warning above 50 MB); step `files` links point to listed files; quiz as above with `review` → step ids |
| reading | PDF: exists, is a PDF, not truncated · Markdown: UTF-8, has headings, every local image / link exists and lies inside the document's folder (packed with it) |
| video | `.mp4`/`.webm`, real MP4/WebM header, size warning above 500 MB; poster is an image |
| material | file exists and is not empty (PDFs are checked as PDFs), size warning above 300 MB; links start with `http(s)://` |
| project | `project.json` valid (format 1), title, weekly plan with unique week numbers inside `durationWeeks`, milestones / deliverables inside the duration, brief PDF exists |
| links | `for` points to an existing item that is not itself attached; warning when it points to a video / material |
| prerequisites | `prerequisite` is `true`/`false`, not combined with `for`; at least one counted item; warning when a prerequisite is listed in the `schedule` |
| pack | `publisherLogo` is an image (warning when missing), `publisherUrl` / `contact.url` are web links, `contact.email` is an email address; branding uses only allowed `#RRGGBB` colours with readable button-text contrast |
| schedule | entries have valid weeks inside `weeks`, every listed item exists; warning for items without a week; `plannedWeeks` 0–104; training `schedule` topics exist |
| whole spec | unique ids across all materials; modules reference existing ids; minimum app version for the formats used |

Errors (✗) stop `create`; warnings (⚠) are shown but do not block. The output is a table, one row per
material, with what was found (topics, steps, size, kind).

## Typical flow with an AI assistant

1. Tell it the pack name and the materials ("trainings X and Y, labs 1–3 from folder …, these PDFs, this video").
2. It writes `pack-spec.json`, runs `check`, fixes what it can (missing titles, lab.json drafts from a
   manual) and asks you about the rest.
3. When `check` shows 0 errors it runs `create` and reports the `.stlp` file.

The Foundation skill for this is the `package` skill of the Skills repository
(https://github.com/SemiTecFoundation/semitec-academy-skills) (skill `academy-templates:package`).
