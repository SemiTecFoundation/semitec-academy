# Versioning — app, formats and packs

Three independent version numbers keep old packs working in new apps and stop new packs from
breaking in old apps.

| Number | Where | Meaning | Who changes it |
|---|---|---|---|
| **App version** | `app/package.json → version` | the installed program (e.g. 1.0.0, 1.1.0, 2.0.0) | app developers, at each release |
| **Format versions** | `app/src/shared/versions.js → HISTORY` | how a pack container / training / reading / lab is written (integers: 1, 2, …) | app developers, when the content structure changes |
| **Pack version** | `<pack folder>/pack-spec.json → pack.version` | the content of one course pack (1.0.0 → 1.0.1 → 1.1.0) | authors, when they update a pack |

## The compatibility table

`versions.js` holds one row per app release with the formats it can open:

```js
const HISTORY = [
  { app: '1.0.0', pack: [1], training: [1], reading: [1], lab: [1] },
  { app: '1.1.0', pack: [1], training: [1], reading: [1], lab: [1], video: [1], material: [1] },
  { app: '1.2.0', pack: [1], training: [1], reading: [1], lab: [1, 2], video: [1], material: [1] },
  { app: '1.3.0', pack: [1], training: [1], reading: [1, 2], lab: [1, 2], video: [1], material: [1] },
  { app: '1.4.0', pack: [1], training: [1], reading: [1, 2], lab: [1, 2], video: [1], material: [1], project: [1] },
  …
  { app: '1.6.0', pack: [1], training: [1], reading: [1, 2], lab: [1, 2], video: [1], material: [1], project: [1] },
  // example of the future:
  // { app: '1.4.0', …, lab: [1, 2, 3] },   // lab format 3: adds report upload
  // { app: '2.0.0', pack: [1, 2], training: [1, 2], reading: [1], lab: [1, 2] }
];
```

The same file is used by the **app** (to accept or refuse a pack) and by the **packer** (to build for a
target app). Current table:

| App | pack | training | reading | lab | video | material | Notes |
|---|---|---|---|---|---|---|---|
| 1.0.0 | 1 | 1 | 1 | 1 | — | — | first release |
| 1.1.0 | 1 | 1 | 1 | 1 | 1 | 1 | sections by type, videos, other materials, pack specs |
| 1.2.0 | 1 | 1 | 1 | 1, 2 | 1 | 1 | lab source files (lab format 2), compact lab header |
| 1.3.0 | 1 | 1 | 1, 2 | 1, 2 | 1 | 1 | name SemiTec Academy, `.stlp` packages, Markdown readings (reading format 2) |
| 1.4.0 | 1 | 1 | 1, 2 | 1, 2 | 1 | 1 | + **project 1**; study plans (`schedule`, `plannedWeeks`), calendar, Today, certificates, library search / filters, installers |
| 1.5.0 | 1 | 1 | 1, 2 | 1, 2 | 1 | 1 | (project 1) dashboard, catalog, publisher logos, attached materials (`for`), project categories, groups — optional fields only, no new formats |
| 1.6.0 | 1 | 1 | 1, 2 | 1, 2 | 1 | 1 | prerequisites (`"prerequisite": true`) shown before the course and not counted; attached materials (`for`) no longer count; reset the progress of a package |
| 1.6.1 – 1.6.2 | 1 | 1 | 1, 2 | 1, 2 | 1 | 1 | no content-format change — signing keys and installer metadata only |
| 1.7.0 | 1 | 1 | 1, 2 | 1, 2 | 1 | 1 | no content-format change — local publisher keys, contact metadata and optional package certificates |
| 1.7.1 | 1 | 1 | 1, 2 | 1, 2 | 1 | 1 | no content-format change — projects follow My packages; removal stops active plans after confirmation and clears stale plan references |

A pack **without** videos and other materials still opens in 1.0.0 (the packer writes
`minAppVersion: 1.0.0`); a pack with a video needs 1.1.0; a lab with source files needs 1.2.0; a Markdown reading needs 1.3.0 (reading format 1 = PDF, 2 = Markdown); a project needs 1.4.0.
The study-plan fields (`schedule`, `plannedWeeks`, a training's `schedule`, `certificate`) and optional
publisher contact are additions to format 1: older apps ignore them, so they do not raise the minimum app version.
A Markdown file under *Other materials* keeps material format 1: apps before 1.3 offer *Save a copy* / *Open with default app* instead of the reader.
The packer picks the item format from the content (a lab without `files` stays format 1).

## Rules

**App releases**
- PATCH (1.0.1): fixes only, no format changes — no new row needed.
- MINOR (1.1.0): may add a new format version for an item type, **keeping the old ones** → new row.
- MAJOR (2.0.0): may drop old formats (avoid; packs in the wild would stop opening).
- Never change what an existing format number means. A change that old apps would misread
  needs a new format number.

**Packs**
- The packer computes `minAppVersion` = the first app row that supports every format used.
- `--target-app 1.0.0` makes the build fail if the pack uses a format that app cannot open —
  use it while most students still have an older app.
- An installed pack is replaced only by a **higher** pack version (developer mode allows downgrades).
- Students' progress survives updates as long as item / subsection / step **ids stay the same**.

**Training engine**
- The app carries a copy of the training engine (`app/src/engine/training`, refreshed with
  `npm run sync-engine` from the web template). Changes to the engine that keep reading the same JSON
  are just a new app release. A change to the training JSON that old engines cannot read = new
  `training` format number.

## What the student sees

| Situation | Message in the app |
|---|---|
| Pack needs a newer app | "needs app version 1.1.0 or newer (this is 1.0.0)" — install the update |
| Pack uses an unknown item format | "item "lab-3" uses lab format 2, not supported by this app" |
| Newer pack version | "Version 1.0.0 is installed. Installing 1.1.0 replaces the content; your progress is kept." |
| Older pack version | refused ("A newer version (1.1.0) of this pack is already installed") |

## Release checklist (app)

1. `npm run sync-engine` if the training template changed; run `npm test`.
2. Bump `app/package.json → version`; add a `HISTORY` row if formats changed; update this table.
3. Update built-in Foundation public keys in `app/trusted-keys/` if needed (see KEYS.md). Partners'
   keys are a local recipient choice in **Trusted publishers** and are never committed here.
4. Build installers (RELEASING.md: `npm run dist:win|mac|linux`), sign them, publish with release notes listing supported formats.
