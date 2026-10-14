# Signing keys

Packs are signed with an **Ed25519 private key**; the app checks them with the matching **public keys**
in `app/trusted-keys/`. Whoever holds a trusted private key can publish packs every student's app accepts.

## What the app trusts

`app/trusted-keys/` holds exactly one key: the **production** key `semitec-foundation` —
`semitec-foundation.pub.pem` plus `semitec-foundation.json` (`"development": false`). Every released
pack is signed with it and the app shows those packs as **✔ Verified**. Only public halves are ever in
this repository; `.gitignore` blocks `*.key.pem`, `*.p12`, `*.pfx`, `*.p8` and `.env` with no exception.

**No development key is trusted any more.** Development does not need one: build drafts with
`--unsigned` and switch on *Developer mode* (Settings, or `SEMITEC_DEV=1`), which accepts unsigned
packs. If you prefer a signed draft, make your own key with
`node packer/stlp.js keygen <folder> --name "…" --dev` and trust its public half in your **local**
copy of `app/trusted-keys/` — never commit that.

A key whose `.json` says `"development": true` is recorded as such when a pack is installed, and such
packs are badged **⚑ Dev-signed** rather than Verified.

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
| `b766a9e9d1f0264d` | development | **retired** 2026-10-15 — replaced by the production key and removed from `trusted-keys/` in 1.6.2; it was never leaked |
| `4c71eba82f86fcca` | production | current (app ≥ 1.6.2) — the only trusted key; private half offline, never in a repository |
