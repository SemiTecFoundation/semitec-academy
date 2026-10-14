# Pack sources

One folder per course pack with a **`pack-spec.json`** that lists all materials (paths may point
anywhere, e.g. to the training template). Check and create:

    node packer/stlp.js check  packs/<name>/pack-spec.json
    node packer/stlp.js create packs/<name>/pack-spec.json --key <private.pem> --out dist

Format: `docs/PACK-SPEC.md`. With an AI assistant: the [`package` skill](https://github.com/SemiTecFoundation/semitec-academy-skills/blob/main/AcademyTemplates/skills/package/README.md) (`academy-templates:package`).

| Folder | Pack id | Content |
|---|---|---|
| `fpga-starter/` | `org.semitec.fpga-starter` | 2 trainings (feature tour from the template, shift registers), 2 labs, 3 readings (2 diploma briefs as PDF, Vivado quick reference as Markdown), 2 videos, 4 materials (starter zip, XDC, board image, lab-report template in Markdown) |
