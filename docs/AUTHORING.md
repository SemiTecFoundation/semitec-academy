# Authoring course packs

A **course pack** groups trainings, labs, readings, videos and other materials. You write the content
with the Foundation templates, list everything in one **pack spec**, and the packer turns it into one
signed `.stlp` file. In the app the pack is shown in sections by type (and in course order if you
define modules).

| Item | Made with | In the pack |
|---|---|---|
| **training** | web template `AcademyTemplates/skills/training` (JSON topics, quizzes, certificate) | `trainings/<id>/` (content only) |
| **reading** | a PDF (often made with a PDF skill of [Academy Templates](https://github.com/SemiTecFoundation/semitec-academy-skills): lecture notes, briefs, papers) or a **Markdown** file with its images (app ≥ 1.3) | `readings/<id>.pdf` · `readings/<id>/<name>.md` + images |
| **lab** | `lab.json` (steps + quiz) + a lab manual PDF (`AcademyTemplates/skills/lab-manual`) | `labs/<id>/` |
| **video** | `.mp4` (H.264 + AAC) or `.webm`, or a link to an online video | `videos/<id>.mp4` |
| **material** | anything else: starter files (`.zip`), constraints (`.xdc`), code, images, datasheets, links | `materials/<id>/` |

## The fast way: a pack spec (recommended)

Write `pack-spec.json` with all materials and their paths ([PACK-SPEC.md](PACK-SPEC.md)), then:

```bash
node packer/stlp.js check  packs/digital-design-1/pack-spec.json   # every material checked, nothing written
node packer/stlp.js create packs/digital-design-1/pack-spec.json --key <private.pem>
```

Many trainings, many labs, many readings, videos and files are just more entries in the lists. The
sample `packs/fpga-starter/pack-spec.json` has 2 trainings (one taken directly from the template
folder), 2 labs, 4 readings (one in Markdown), 2 videos and 4 other materials. With an AI assistant, use
the [`package` skill](https://github.com/SemiTecFoundation/semitec-academy-skills/blob/main/AcademyTemplates/skills/package/README.md) (`academy-templates:package`) — it writes the spec for you.

### Markdown readings
Write normal GitHub-flavoured Markdown: headings (they become the reader's outline), tables, fenced code
with a language (`` ```verilog ``), lists, task lists, links. Keep images and linked files **in the same
folder or below** (`img/fsm.svg`) — the checker lists them, copies them into the package and reports
missing files or paths outside the folder. Links to other `.md` files in that folder open in the reader;
web links open in the browser. Raw HTML is sanitised (no scripts, no iframes).
Details: [`reference/markdown.md`](https://github.com/SemiTecFoundation/semitec-academy-skills/blob/main/AcademyTemplates/skills/package/reference/markdown.md).

### Study plan
Give the package a week plan so students get dates: `"schedule"` in the spec (weeks → items), or
`"plannedWeeks"` on items. A training made with the training template can plan its own topics per week
(`"schedule"` in `training.json`). Students enroll with a start date; the app shows the plan in the
*Study plan* view, the *Calendar* and the *Today* panel. Details: [PACK-SPEC.md → Study plans](PACK-SPEC.md#study-plans-app--140).

### Projects
A diploma / research **project** comes from a project brief made with the project-brief template:
`python3 <template>/tools/brief2project.py <brief-folder>` writes `project/project.json` + `brief.pdf`
(weekly plan from the brief's progress tracker, milestones, deliverables, rubric, learning path). Add it
to the spec under `"projects"`. Students enroll in a project separately; its weeks go into the calendar.

### Publisher, attached materials, project categories (app ≥ 1.5.0)
- `pack.publisher` + `pack.publisherLogo` (square SVG / PNG): students see the logo and filter by publisher —
  important when partner companies publish packages too.
- `"for": "<lab id>"` on a material puts it under that lab (Course order, Study plan, the lab's *Materials*
  tab) instead of a separate row after the lab.
- `"category"` on a project (research, diploma, thesis, course-project, capstone, internship, other).
- Publish packages for the **Catalog**: a shared folder, or `stlp catalog` → `catalog.json` on a website
  ([PACK-SPEC.md → Publishing a catalog](PACK-SPEC.md#publishing-a-catalog)).

### Course certificate
`"certificate": "certificate.json"` in `pack` sets the design of the certificate students get when every
item is completed (same format as a training's `certificate.json`; without it a default design is used).

## The step-by-step way (pack folder)

### 1. Create the pack

```bash
node packer/stlp.js init packs/digital-design-1 --id org.semitec.digital-design-1 --title "Digital Design 1"
```

This writes `packs/digital-design-1/pack.json`:

```json
{
  "id": "org.semitec.digital-design-1",
  "version": "1.0.0",
  "title": "Digital Design 1",
  "description": "One or two sentences shown in the library.",
  "language": "en",
  "publisher": "SemiTec Foundation",
  "authors": ["…"],
  "cover": "cover.svg",
  "modules": [ { "id": "basics", "title": "Basics", "description": "", "items": ["intro", "lab-1"] } ],
  "items":   [ { "id": "intro", "type": "training", "title": "…", "estimatedTime": "1 h", "path": "trainings/intro" } ]
}
```

A cover is optional (`cover.svg` / `.png`, about 600 × 340).

### 2. Add items

```bash
# a training made from the web template (only its content is copied)
node packer/stlp.js add-training packs/digital-design-1 ../my-trainings/fsm-basics --id fsm-basics --module basics --module-title "Basics"

# a PDF
node packer/stlp.js add-reading packs/digital-design-1 notes/lecture-03.pdf --id lecture-03 --title "Lecture 3: FSMs" --time "40 min" --module basics

# a lab (creates labs/<id>/lab.json to fill in; --manual copies the PDF)
node packer/stlp.js add-lab packs/digital-design-1 --id lab-1 --title "Lab 1: Traffic light FSM" --manual lab1.pdf --module labs --module-title "Labs"
```

Or edit `pack.json` and the folders by hand — the packer only needs the final structure.
To update a training later, edit it in the pack folder or run `add-training` again with a new id.

### 3. Validate, build, check

```bash
node packer/stlp.js validate packs/digital-design-1                 # errors + warnings
node packer/stlp.js build packs/digital-design-1 --key <private.pem> [--target-app 1.0.0]
node packer/stlp.js inspect dist/org.semitec.digital-design-1-1.0.0.stlp
```

`validate` checks ids, files, PDFs, training quizzes (answers, review links, assets) and lab steps.
`build` refuses to build with errors. Test the pack in the app before sharing; for a draft without a
key use `--unsigned` and turn on *Developer mode* in the app's Settings.

## Publish an update

1. Change the content (keep ids of items, subsections and steps).
2. Raise `version` in `pack-spec.json` / `pack.json` (1.0.0 → 1.1.0).
3. Build and share the new file. Students add it like the first time; the app replaces the old
   version and keeps their progress.

## lab.json reference

Labs are best made with the lab-manual template (`AcademyTemplates/skills/lab-manual`): it
builds the PDF manual and the `lab/` folder (lab.json + manual.pdf + src/) together, writes the manual
page of every step into lab.json and checks that manual and lab.json have the same steps. Point the pack
spec to that `lab/` folder. Full format: the template's `reference/lab-json.md`.

```json
{
  "title": "Lab 1: A 4-bit shift register on the FPGA",
  "summary": "md — what the student builds",
  "difficulty": "beginner",
  "estimatedTime": "2 h",
  "equipment": ["AMD AUP-ZU3", "Vivado 2024.2+"],
  "objectives": ["md", "md"],
  "manual": "manual.pdf",
  "files": "src",
  "steps": [
    { "id": "rtl", "title": "Write the shift register", "md": "md text",
      "code": "always_ff @(posedge clk) …", "hint": "md, shown on request", "manualPage": 2,
      "files": ["src/rtl/shift4.sv"] }
  ],
  "quiz": { "title": "Lab 1 check", "passThreshold": 0.75, "questions": [ … ] }
}
```

| Field | Meaning |
|---|---|
| `steps[].id` | stable id (lowercase, digits, `-`); quiz `review` links point to step ids |
| `steps[].md` / `hint` | Markdown (bold, italic, code, links, lists) |
| `steps[].code` | code shown in a block under the step |
| `steps[].manualPage` | adds a link "→ Manual, page N" (filled automatically by the lab-manual template's `build.py`) |
| `files` | source files of the lab: a folder (`"src"`) or a list of files / folders — *Files* tab in the app (viewer + *Download all* as zip). Makes the lab **format 2** (app ≥ 1.2.0) |
| `steps[].files` | links from a step to files listed in `files` |
| `quiz` | same question types as the trainings: `single`, `truefalse`, `multiple`, `order`, `match`, `hotspot` (see the training template's `reference/content-format.md`) |

Completion: all steps ticked **and** quiz passed (if there is a quiz).

## Prompts for an AI assistant

- *"Create a lab `labs/lab-2-uart/lab.json` for a UART transmitter on the AUP-ZU3: 7 steps with code
  snippets and hints, and a 5-question check quiz with review links to the steps."*
- *"Add the PDFs in `notes/` as readings to module `theory`, titles from the first page."*
- *"Make a pack `org.semitec.verification-101` with modules Basics / UVM / Labs from these files…"*
