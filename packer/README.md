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
| `bundle-skill <outDir>` | self-contained copy of the packer for the `package` skill |

Step by step in a pack folder, instead of a spec: `init`, `add-training`, `add-reading`, `add-lab`,
`validate`, `build`.

Spec format: `../docs/PACK-SPEC.md`. Container format: `../docs/PACKAGE-FORMAT.md`.
Authoring guide: `../docs/AUTHORING.md`.

`pack.branding` is optional package-level colour metadata (`accent`, `accentInk`, optional
`accentSoft`). The checker validates its hex colours and button-text contrast, then writes package format
2, which requires Academy 1.8.0. It styles package details and non-training materials only; training
themes and certificate styles remain in their respective source folders.
