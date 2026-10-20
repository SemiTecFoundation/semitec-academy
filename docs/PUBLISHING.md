# Open publishing workflow

Anyone can create and use a SemiTec Learning Package. SemiTec Academy does not require a partner
agreement, account or Foundation review before a lab, training, project or package is created.

The maintained authoring product is [Academy Templates](https://github.com/SemiTecFoundation/semitec-academy-skills).
It contains the current skills, templates, validators and package instructions. This repository documents
the Academy application and `.stlp` contract rather than duplicating those authoring instructions.

![Academy Templates authoring and packaging flow](../app/src/renderer/assets/authoring-flow.png)

## Author and publisher flow

1. Create a standalone lab, training or project with the relevant [Academy Templates skill](https://github.com/SemiTecFoundation/semitec-academy-skills). The original
   folder remains the editable source and can be used without Academy.
2. Review it as its author: correctness, citations, rights to included files, accessibility and the
   intended learner outcome. This is publisher self-review, not a request for Foundation approval.
3. When Academy delivery is useful, choose the materials in `pack-spec.json` and provide the responsible
   `publisher`, `authors`, mandatory course order (`modules`) and study plan (`schedule`), and optional `contact` details. `stlp check` must report zero errors.
4. Decide independently whether the package and each training offer a certificate. For each offered
   certificate include a publisher-authored HTML/CSS/JavaScript design and author preview. Omit `certificate` for a package without one. A package certificate is a local
   completion record created by the publisher's design; it is not a Foundation-issued or externally
   verified credential.
5. Build the package with `stlp create` and share the `.stlp` through a local folder or a catalog.
   Academy 2.2.0 or newer accepts packages from any publisher without keys or a Foundation approval.

## Catalog sources

The Foundation maintains a [list of recommended catalog sources](CATALOG-SOURCES.md). Users may add
other catalog links or folders in Academy and can remove sources they do not want. A catalog is a list of
downloads; package publisher names and file hashes do not establish cryptographic publisher identity.

## Rights and names

The application and packer are [Apache-2.0](../LICENSE). Course materials remain the responsibility of
their authors and publishers: choose and state a content license, retain required attributions and only
include files you may distribute. [Trademark guidance](../TRADEMARKS.md) keeps SemiTec Foundation and
SemiTec Academy names and logos distinct from partner names and certificates.
