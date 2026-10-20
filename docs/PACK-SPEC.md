# Package source specification

Use `pack-spec.json` to select complete standalone materials. It is the editable build input;
`manifest.json` is generated inside the `.stlp`. Paths in the spec are relative to the spec file.
Use [Academy Templates](https://github.com/SemiTecFoundation/semitec-academy-skills) for authoring instructions.
The current builder targets Academy 2.2.0 or later.

```json
{
  "specVersion": 1,
  "pack": {
    "id": "org.example.introduction",
    "version": "1.0.0",
    "title": "Introduction",
    "publisher": "Example Publisher",
    "authors": ["Example Author"]
  },
  "trainings": [{"id": "lesson", "source": "trainings/lesson"}],
  "labs": [{"id": "practice", "source": "labs/practice"}],
  "projects": [{"id": "project", "source": "projects/project"}],
  "modules": [{"id": "course", "title": "Learn and apply", "items": ["lesson", "practice", "project"]}],
  "schedule": {
    "weeks": 3,
    "entries": [
      {"week": 1, "items": ["lesson"]},
      {"week": 2, "items": ["practice"]},
      {"week": 3, "items": ["project"]}
    ]
  }
}
```

`modules` (course order) and `schedule` (study plan) are mandatory. Each counted item, including
projects, must appear exactly once in course order and at least once in the study plan. A schedule
entry accepts `week: N` or `weeks: [from, to]`, optional `title` and `note`, and item IDs.
`schedule.weeks` is an integer from 1 to 104. Empty plans, unknown IDs and missing items are errors.
`plannedWeeks` may describe an item but does not replace the package schedule.

Optional prerequisites (`prerequisite: true`) and attachments (`for: "parent-id"`) do not count toward
package progress or certificates and need not appear in order/plan. Attachments appear under their
parent and are included with its downloaded folder under `academy-attachments/<id>/`.
Standalone materials do not need a package plan; a training's internal topic schedule is optional.

## Materials and file ownership

| Spec list | Source |
|---|---|
| `trainings` | Folder with `training.json`, learner HTML, `index_preview.html`, assets and runtime |
| `labs` | Complete folder with `lab.json`, steps, optional manual PDF, `src/` and supporting files |
| `projects` | Complete folder with `project.json`, weeks/tasks, optional brief PDF, sources and materials |
| `readings` | PDF or Markdown file; linked local Markdown assets are included |
| `videos` | Local MP4/WebM file and optional poster, or external `url` |
| `materials` | Local file (PDF, image, code, ZIP, etc.) or external `url` |

Items accept `id`, `title`, `description`, `estimatedTime`, `plannedWeeks`, `prerequisite` and `for`.
IDs are unique in the package. The app displays projects separately for tracking; they remain owned
by their package. Package removal confirms stopping active course/project plans.
External URLs are links, not embedded downloads. For a fully offline course, include all assets locally.
No source file can be downloaded if the publisher did not include it in the `.stlp`.

## Two training formats

- **Format 1 — JSON:** `training.json` + `topics/*.json`, maintained Academy runtime, quizzes and sequential progression.
- **Format 2 — custom web:** local HTML/CSS/JavaScript, including slide frameworks. `runtime` declares
  `{"kind":"web","entry":"index.html"}`. `progress` must declare `{"mode":"bridge"}` or manual steps.

Both formats may offer an individual certificate or omit it. They both contribute to package progress.
A previous unpublished third training format has been folded into format 2; new training metadata must
use only 1 or 2. Package container format numbers are independent of training format numbers.

For a custom page that cannot report progress, declare:

```json
"progress": {
  "mode": "manual",
  "steps": [
    {"id": "slides", "title": "Review the presentation"},
    {"id": "exercise", "title": "Complete the exercise"}
  ]
}
```

Academy displays this checklist outside the page and derives progress from checked steps. With bridge
mode the publisher integrates `SemiTecAcademy.save(state, {percent, completed})` / `complete(state)`.
Do not infer completion just because a page loaded or a slide deck opened. Validate bridge events in
Academy, including resume. Manual steps work with Reveal and other locally bundled frameworks without
modifying their code. No framework is downloaded automatically.

## Certificates: independent, optional publisher choices

Omit `pack.certificate` for no package certificate. Omit `training.json.certificate` for no individual
training certificate. A learner can finish everything without receiving a certificate. Neither option
requires SemiTec approval, membership or an agreement; do not imply accreditation.

For new designs use HTML/CSS/JavaScript. In the spec, set `pack.certificate` to a **local HTML file**
such as `certificate/index.html`; the builder copies its dedicated folder. In either training format,
set `"certificate": "certificate/index.html"` relative to that training. Include a sibling
`certificate/index_preview.html` with conspicuous sample data. Keep the certificate in its own folder.
The app renders the design in a sandbox, supplies name, training/title, issuer, date, score, hours and
certificate ID via `postMessage({type:"semitec-certificate", data})`, and can print/save it as PDF.
Publisher scripts never execute in the Academy application page. Legacy JSON designs remain readable
for compatibility, but new layouts are not restricted to the legacy JSON style fields.

Every author handoff and packaging report must say **package certificate: offered/not offered** and
**each training certificate: offered/not offered**, with links to applicable certificate previews.
Do not silently add a certificate or invent an issuer, signer or accreditation claim.

## Password and preview delivery

To change a published package password, generate a new verifier, increment `pack.version`, and rebuild
and re-sign the package. Academy clears all local preview/package unlocks whenever an archive is
successfully installed, including a re-installation with the same version. Each learner must therefore
enter the password again. Learning progress survives the update when package/item ids remain stable.
Do not replace a distributed archive with different bytes under the same version. Account passwords are separate.


Every authored training has `index_preview.html`, opening all sections for review without saving learner
progress. Format 1's builder generates it; custom format 2 authors must implement and test its behavior.
The normal entry page must work without the preview and must not link to it as a learner shortcut.

For an optional password, generate a verifier with `stlp password-hash` and put it under
`pack.access.password`. Use `pack.access.scope: "preview"` for the recommended behavior: normal study
and complete-folder downloads stay available; Academy serves/exports author previews only after password
entry. All `index_preview.html` and legacy `training-preview.html`/`certificate-preview.html` files are
removed from locked learner downloads, including certificate previews. Entering the password enables them
for that local learner until the next installation of that package. No access field means normal learning is open, but author previews are excluded from learner downloads and cannot be opened through Academy. Preview permission requires a configured password and a successful unlock.

After a successful `scope: "preview"` unlock, Academy opens a training through its required
`index_preview.html` when the author chooses it from the package page. The preview opens all sections and
does not save or change learner progress. The preview page offers **Study normally** for the usual tracked
entry. Authors must keep those two entries behaviorally distinct.

Use `scope: "package"` to lock all content/progress/downloads. Existing packages with no scope retain
that behavior. A wrong password changes nothing. Passwords are distributed separately; never commit
plaintext passwords. A verifier is not encryption or DRM: `.stlp` is a ZIP and
someone with the archive or editable source can inspect/change its contents. This feature controls
Academy delivery and section-review convenience, not secrecy of distributed learning materials.

## Check, create and import

```
node packer/stlp.js check pack-spec.json
node packer/stlp.js create pack-spec.json --out /path/to/local-drafts
```

Any author can build and share packages without keys or Foundation approval. The authoring checker checks identity, content references, supported formats,
order/plan coverage, training previews, progress declarations and certificate files. Creation checks again.
Academy verifies archive paths, file hashes, and compatibility, then runs the shared content
checker in a staging folder before replacing installed content. Errors name the missing file or field.
Older packages missing mandatory metadata must be updated/repackaged before a new import; existing local
learning records are preserved. Content hashes check consistency, not publisher identity.
