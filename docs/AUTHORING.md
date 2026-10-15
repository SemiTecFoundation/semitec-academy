# Preparing learning materials for SemiTec Academy

SemiTec Academy receives finished `.stlp` learning packages. It does not create course material and it
does not own a separate, competing set of lab, training or project templates.

![Academy Templates authoring and packaging flow](../app/src/renderer/assets/authoring-flow.png)

## Use Academy Templates for authoring

[Academy Templates](https://github.com/SemiTecFoundation/semitec-academy-skills) is the maintained source
for skills, templates, validators and authoring guidance. It provides independent skills for project briefs,
diploma documents, lab manuals and interactive trainings. Each can be used as a standalone editable result.

Use its optional **package** skill only when selected materials should be delivered together through
Academy. The package skill validates the selected sources, builds a `.stlp` archive and can sign a release.
Its documentation is the current source for commands, folder layouts and material-specific formats:

- [Academy Templates overview](https://github.com/SemiTecFoundation/semitec-academy-skills)
- [Package skill](https://github.com/SemiTecFoundation/semitec-academy-skills/tree/main/skills/package)
- [Template publishing workflow](https://github.com/SemiTecFoundation/semitec-academy-skills/blob/main/docs/PUBLISHING.md)

## What belongs in this repository

This Academy repository defines how the desktop application receives and presents a package. Refer here for:

- [open publisher and recipient-trust flow](PUBLISHING.md);
- [`pack-spec.json` fields and package checks](PACK-SPEC.md);
- [the `.stlp` container and item formats](PACKAGE-FORMAT.md);
- [package signing keys](KEYS.md).

Academy Templates documentation is deliberately not copied into this page. That keeps its changing skill
instructions in one maintained location and lets this repository focus on the application contract.

## Before sharing a package

The publisher remains responsible for reviewing content, citations, rights, author attribution and the
optional feedback contact or certificate. A package can be published by any person, school or partner without
a Foundation agreement or approval queue. Recipients independently choose which publisher public keys to
trust in **Settings → Application → Trusted publishers**.
