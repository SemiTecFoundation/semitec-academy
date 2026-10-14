# Signing keys

Packs are signed with an **Ed25519 private key**; the app checks them with the matching **public keys**
in `app/trusted-keys/`. Whoever holds a trusted private key can publish packs every student's app accepts.

## Development key

Only the public half is in this repository (`keys/dev/`, `app/trusted-keys/`). The private key
`semitec-foundation-dev.key.pem` is kept **outside** the repository (author's copy:
`Foundation/Private/keys/`) and is only for building and testing. Its public key is trusted by this
prototype so the sample packs install out of the box; the app labels such packs **Dev-signed**.
`.gitignore` blocks `*.key.pem`, `*.p12`, `*.pfx` — never add an exception for a key.
**Before the first real release: remove `semitec-foundation-dev.*` from `app/trusted-keys/`.**

## Production key

```bash
node packer/stlp.js keygen /secure/offline/folder --name "SemiTec Foundation"
```

- Keep `semitec-foundation.key.pem` **offline** (encrypted USB / password manager), with a backup.
  Never commit it, never put it in the app, never e-mail it.
- Copy `semitec-foundation.pub.pem` and `semitec-foundation.json` into `app/trusted-keys/`, release a new
  app version.
- Build releases with `--key /path/to/semitec-foundation.key.pem` (or `STLP_KEY=…`).

## More publishers

A partner organisation or a department can get its own key: they run `keygen`, send only the
`.pub.pem` + `.json`, the Foundation adds them to `trusted-keys/` in the next app release. The app shows
the key name (from the `.json`) on every pack.

## Rotation / compromise

1. Generate a new key, add its public key to `trusted-keys/`, release the app.
2. Re-sign current packs with the new key and redistribute.
3. In a later release remove the old public key. Packs signed only with it will no longer install
   (already installed packs keep working).

## Key history

| Key id | Kind | Status |
|---|---|---|
| `48c3e1ae9934d9f4` | development | **revoked** 2026-10-14 — the private key was published in the repository by mistake; removed from `trusted-keys/` in 1.6.1 |
| `b766a9e9d1f0264d` | development | current (app ≥ 1.6.1) |
