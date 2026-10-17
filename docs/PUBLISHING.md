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
5. Sign the release with the publisher's own Ed25519 key. Keep its private half secret; distribute only
   the `.stlp` and public key (`.pub.pem`). An unsigned archive is suitable only for the author's local
   test in Developer mode.
6. Publish the archive in a shared folder, catalog or another normal delivery channel. Include the public
   key fingerprint in a trusted communication channel such as the publisher website or university LMS.

## Recipient trust

A signature answers “which key made this archive?”; it does not say a key should automatically be trusted.
The computer owner adds a partner's public key in **Settings → Application → Trusted publishers**, checks
the displayed fingerprint with that publisher, then installs packages signed by that key. This protects
students from a changed archive while leaving the trust decision with the school or user.

Foundation public keys are shipped in the app for Foundation releases. Locally added partner keys live in
the Academy data folder, travel when that data folder is moved, and can be removed at any time. Removing a
key stops future installs with it; it does not delete existing materials or progress.

### Optional Foundation default trust for a partner

The Foundation may intentionally include a verified partner **public** key in a future Academy release.
That makes the key trusted by default for new installations; the partner still owns and protects its
private key. It is not required for partner publishing and it is not automatic after a company signs its
first package. See [KEYS.md](KEYS.md#optional-foundation-default-trust-for-a-partner) for the verification,
release and rotation procedure.

Including a key identifies a known publisher key. It does not make every package, course certificate or
claim by that publisher Foundation-issued or Foundation-approved.

## Rights and names

The application and packer are [Apache-2.0](../LICENSE). Course materials remain the responsibility of
their authors and publishers: choose and state a content license, retain required attributions and only
include files you may distribute. [Trademark guidance](../TRADEMARKS.md) keeps SemiTec Foundation and
SemiTec Academy names and logos distinct from partner names and certificates.
