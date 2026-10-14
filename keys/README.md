# Signing keys

**No private key is ever in this repository.** `.gitignore` blocks `*.key.pem`, `*.p12`, `*.pfx`,
`*.p8` and `.env`; never add an exception.

The public half of the key the app trusts lives with the app, in
[`../app/trusted-keys/`](../app/trusted-keys/) — currently the production key
`semitec-foundation` (`4c71eba82f86fcca`). Full rules, rotation steps and the key history:
[`../docs/KEYS.md`](../docs/KEYS.md).

Signing a release pack needs the offline production private key:

```bash
node packer/stlp.js create <pack-spec.json> --key /path/to/semitec-foundation.key.pem --out dist
```

Without it, build drafts unsigned and turn on *Developer mode* (Settings, or `SEMITEC_DEV=1`):

```bash
node packer/stlp.js create <pack-spec.json> --unsigned --out dist
```
