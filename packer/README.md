# stlp — the pack builder

`node packer/stlp.js <command>` — run `npm install` in `../app` once (it shares the code that verifies
packs in the app). `node packer/stlp.js` without arguments prints the usage.

**Recommended — one spec file describes the whole package:**

| Command | Does |
|---|---|
| `check <pack-spec.json>` | checks every material and prints a table (✓ ⚠ ✗) without building |
| `create <pack-spec.json> [--key k.pem \| --unsigned] [--out dist/]` | builds the `.stlp` |
| `inspect <file.stlp> [--trusted ../app/trusted-keys]` | manifest, signature and compatibility |
| `catalog <folder with .stlp> [--name "…"] [--base-url https://…/]` | writes a `catalog.json` for a catalog source |
| `keygen <outDir> --name "…" [--dev]` | a new signing key pair |
| `password-hash` | prints a password verifier for `pack.access` (reads `STLP_PACKAGE_PASSWORD`) |
| `bundle-skill <outDir>` | self-contained copy of the packer for the `package` skill |

Step by step in a pack folder, instead of a spec: `init`, `add-training`, `add-reading`, `add-lab`,
`validate`, `build`.

Spec format: `../docs/PACK-SPEC.md`. Container format: `../docs/PACKAGE-FORMAT.md`.
Authoring guide: `../docs/AUTHORING.md`.

Current builds target Academy **2.1.0+**. Course order (`modules`) and study plan (`schedule`) are mandatory.
The package and each training independently opt into certificates, or omit them. New certificate designs
use HTML/CSS/JavaScript with a sample author preview; legacy JSON styles remain supported.

There are two training formats: **1: Academy JSON**, **2: custom local HTML/CSS/JavaScript**. Custom trainings
declare `runtime` and `progress.mode` (`bridge` or `manual` with steps). Every training has `index_preview.html`.
Every item downloads as a complete folder, including sources and supporting files.

Optional `pack.access` contains a generated password verifier and `scope: "preview"` (normal study/downloads
available; author previews require the password) or `scope: "package"` (all content locked). Generate the
verifier with `password-hash`; never store a plaintext password or signing key in a spec. The archive is
not encrypted. See [the complete contract](../docs/PACK-SPEC.md) and [archive layout](../docs/PACKAGE-FORMAT.md).
The authoring checker and Academy import use the same validation before accepting new content.
