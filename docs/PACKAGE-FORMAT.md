# The SemiTec Learning Package (`.stlp`) — format 1

One file that carries a complete course pack: trainings, labs, readings, videos, other materials and a cover image.
It is a **ZIP** archive (deflate) with a fixed layout, a **manifest** that lists every file with its
SHA-256 hash, and an **Ed25519 signature** of the manifest.

```
org.semitec.fpga-starter-1.0.0.stlp
├── manifest.json        metadata + structure + hash of every content file
├── signature.json       Ed25519 signature over the exact bytes of manifest.json
└── content/
    ├── cover.svg
    ├── trainings/feature-tour/   training.json, certificate.json, topics/*.json, assets/*, css/themes/* (optional)
    ├── readings/ecc-brief.pdf
    ├── labs/lab-01-shift-register/   lab.json, manual.pdf, src/… (source files), images
    ├── videos/design-flow.mp4       (+ poster image)
    └── materials/<id>/<file>        zip, xdc, images, PDFs …
```

File name convention: `<pack id>-<pack version>.stlp`. Media type: `application/x-semitec-learning-package` — the one the installers register for `.stlp`
(`build.fileAssociations` and `build.linux.mimeTypes` in `app/package.json`).

## manifest.json

```json
{
  "format": 1,
  "id": "org.semitec.fpga-starter",
  "version": "1.0.0",
  "title": "FPGA Starter Track",
  "description": "…",
  "language": "en",
  "publisher": "SemiTec Foundation",
  "publisherLogo": "publisher-logo.svg",          // app ≥ 1.5.0 (optional)
  "publisherUrl": "https://…",
  "authors": ["Arman Manukyan, PhD"],
  "cover": "cover.svg",
  "created": "2026-10-13T14:46:03.689Z",
  "minAppVersion": "1.0.0",
  "builder": { "tool": "stlp", "toolVersion": "1.0.0", "targetApp": "1.0.0" },
  "modules": [
    { "id": "getting-started", "title": "Getting started", "description": "…", "items": ["feature-tour"] }
  ],
  "schedule": { "weeks": 7, "entries": [ { "weeks": [1, 2], "title": "Start here", "note": "…", "items": ["feature-tour"] } ] },
  "certificate": { "title": "Course Certificate", "body": "for completing **{training}** on {date}.", "signatures": [ … ], "style": { … } },
  "items": [
    { "id": "feature-tour", "type": "training", "format": 1, "title": "…", "description": "…", "estimatedTime": "1 h", "path": "trainings/feature-tour" },
    { "id": "ecc-brief", "type": "reading", "format": 1, "title": "…", "estimatedTime": "30 min", "file": "readings/ecc-brief.pdf" },
    { "id": "lab-01-shift-register", "type": "lab", "format": 1, "title": "…", "path": "labs/lab-01-shift-register" },
    { "id": "design-flow", "type": "video", "format": 1, "title": "…", "file": "videos/design-flow.mp4", "poster": "videos/design-flow-poster.png" },
    { "id": "lab1-starter", "type": "material", "format": 1, "title": "…", "file": "materials/lab1-starter/lab1-starter.zip", "kind": "file" },
    { "id": "user-guide", "type": "material", "format": 1, "title": "…", "url": "https://…", "kind": "link" },
    { "id": "ecc-sensor-memory", "type": "project", "format": 1, "title": "…", "path": "projects/ecc-sensor-memory", "durationWeeks": 30, "summary": "…" }
  ],
  "files": {
    "content/cover.svg": { "sha256": "…", "size": 1745 }
  }
}
```

| Field | Rule |
|---|---|
| `format` | container format; this document = **1** |
| `id` | reverse-domain, lowercase (`org.semitec.<name>`); never changes for the life of the pack |
| `version` | `MAJOR.MINOR.PATCH` of the **content**; a higher version replaces the installed one |
| `minAppVersion` | lowest app version that understands every format used (computed by the packer) |
| `items[].format` | format of that item type (see below) |
| `items[].path` / `file` | relative to `content/` |
| `items[].url` | video / material: online link instead of a file |
| `publisherLogo`, `publisherUrl` | publisher's logo (file under `content/`) and website, shown with the publisher name |
| `items[].for` | id of the item it belongs to (materials of a lab): shown under that item, not in the plan |
| `items[].prerequisite` | `true`: optional refresher shown before the course; not counted in progress or the certificate, not planned (app ≥ 1.6.0) |
| `items[].category` | project: research · diploma · thesis · course-project · capstone · internship · other |
| `items[].kind` | material: `pdf` · `markdown` · `image` · `text` · `video` · `file` · `link` (chooses the viewer) |
| `modules` | display order; items not in a module are shown under "Other" |
| `schedule` | optional study plan (app ≥ 1.4.0): `entries` of `week` / `weeks: [from, to]`, `title`, `note`, `items`; see PACK-SPEC.md → Study plans |
| `items[].plannedWeeks` | optional weeks for the item (plan when there is no `schedule`) |
| `items[].schedule` | training only: topic plan copied from `training.json` → `{ weeks, topics: [{ weeks: [a, b], titles }] }` |
| `certificate` | optional design of the course certificate (same fields as a training's `certificate.json`) |
| `files` | every file under `content/` with SHA-256 and size — no file may be missing or extra |

**What counts for progress** (app ≥ 1.6.0): every item except prerequisites (`prerequisite: true`) and items
attached to another item (`for`). Package percent, *in progress* status, "Continue" and the package certificate use
only the counted items; prerequisites and attached materials still save their own progress.

Item, module and step **ids are stable**: progress is stored per `pack id + item id` (and per
subsection / step id inside an item). Renaming an id resets that progress.

## signature.json

```json
{ "format": 1, "alg": "ed25519", "keyId": "4c71eba82f86fcca", "signedAt": "…", "signature": "<base64>" }
```

- The signature covers the **exact bytes** of `manifest.json`; the manifest covers every file by hash,
  so the whole pack is protected.
- `keyId` = first 16 hex characters of SHA-256 of the public key (SPKI DER).
- The app accepts a pack only if `keyId` is in `app/trusted-keys/` and the signature verifies
  (developer mode can allow unsigned / unknown-key packs for testing).

## How the app opens a pack

1. Unzip in memory; reject paths that are absolute, contain `..`, or are outside `content/`.
2. Parse `manifest.json`; require a lowercase reverse-domain package id (for example,
   `org.example.test-pack`), never a filesystem path. Check every file's SHA-256; reject missing or extra files.
3. Verify the signature against the trusted keys.
4. Check compatibility (`format`, `minAppVersion`, each item's `format`) — see VERSIONING.md.
5. Extract to `<data>/packs/<id>/` (temp folder, then swap) and record the manifest in the database.

Package-id and directory checks also apply to trusted signatures and Developer mode. Removal validates
the id before changing the database or deleting files.

The content is **readable** by anyone who unzips the file (it is compressed and signed, not encrypted).
Signing guarantees *who made it* and *that it was not changed*.

## Item formats (version 1)

### training — format 1
Content of the web training template (`AcademyTemplates/skills/training`):
`training.json`, `certificate.json`, `topics/*.json`, `assets/*`, optional `css/themes/*.css`.
No engine files: the app supplies the engine (`index.html`, `js/`, `css/app.css`) and runs the training
in *platform* mode, saving the training's progress state per user. Field reference:
`AcademyTemplates/skills/training/reference/content-format.md`.

### reading — format 1 (PDF) and 2 (Markdown, app ≥ 1.3.0)
**Format 1:** a PDF file (`items[].file`). The app's reader saves `{ pages, seen: [page numbers], last, completed }`.
Completed when 90 % of pages were viewed, or the student marks it finished.

**Format 2:** a Markdown file `readings/<id>/<name>.md` plus the images / files it links, listed in the
manifest item as `assets: ["img/fsm.svg", …]` (paths relative to the `.md`). GitHub-flavoured Markdown
(tables, fenced code, task lists); HTML is sanitised (no scripts). The reader saves
`{ scroll, maxRead, completed }`; completed at 90 % read or when marked finished.

### lab — format 1 and 2
A folder with `lab.json` (+ `manual.pdf`, images). Reference: [AUTHORING.md](AUTHORING.md#labjson-reference).
**Format 2** (app ≥ 1.2.0) adds source files: `"files": "src"` in lab.json; the packer expands it and
writes the list into the manifest item as `srcFiles: ["src/rtl/shift4.sv", …]` (paths inside the lab).
The app shows them in the *Files* tab (text viewer, *Save file*, *Download all* as zip).
The app saves `{ steps: {stepId: date}, quiz: {passed, bestScore, attempts}, manualPage, tab, file }`.
Progress = 70 % steps + 30 % quiz (100 % steps when there is no quiz).

### video — format 1 (app ≥ 1.1.0)
An `.mp4` (H.264 + AAC) or `.webm` file, optional `poster` image — or a `url` to an online video.
The app saves `{ duration, position, watched: [20 buckets], completed }`: completed at 90 % watched or
at the end; resumes at the last position. A `url` video opens in the browser and counts as done.

### project — format 1 (app ≥ 1.4.0)
A folder `projects/<id>/` with `project.json` (+ `brief.pdf`, other files), made from a project brief with
the project-brief template (`tools/brief2project.py`). Main fields:

| Field | Meaning |
|---|---|
| `format` | 1 |
| `title`, `subtitle`, `summary`, `language` | shown on the project card and page |
| `workType`, `level`, `slots`, `duration`, `durationWeeks` | e.g. "Bachelor diploma project", 1 student, 30 weeks |
| `supervisors`, `mentor`, `partner`, `areas`, `keywords`, `tools`, `prerequisites` | facts |
| `goals[]`, `outcomes[]` | Markdown lines |
| `weeks[]` | `{ week, phase, tasks, doneWhen }` — the weekly plan (the brief's progress tracker) |
| `milestones[]` | `{ weeks: [from, to], work, milestone }` |
| `deliverables[]` | `{ title, form, when, dueWeek, who }` |
| `assessment[]` | `{ criterion, weight, pass, good, excellent }` (rubric) |
| `learning[]` | `{ group, topic, level: apply / understand / aware, usedFor, sources }` |
| `brief` | the brief PDF, relative to the folder |

The student enrolls in the project with a start date; week *n* is mapped to the calendar from it. The
app saves `{ weeks: { "<n>": doneAt }, notes: { "<n>": text } }`; progress = weeks ticked / weeks.

### material — format 1 (app ≥ 1.1.0)
Any other file (`file` + `kind`) or a link (`url`). Shown with a viewer for its kind (PDF, image,
text/code, Markdown, video) or offered as *Save a copy* / *Open with default app*. Counts as done once opened. A Markdown material (`kind: "markdown"`, with `assets`) opens in the
Markdown reader in app ≥ 1.3.0; older apps offer it for saving.
