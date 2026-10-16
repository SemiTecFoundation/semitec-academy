# Signing keys

Packs are signed with an **Ed25519 private key**; the app checks them with the matching **public keys**.
The app ships Foundation keys in `app/trusted-keys/`; a computer owner can add a partner's public key in
*Settings → Application → Trusted publishers*. That local choice needs no Foundation agreement or review.

## What the app trusts

`app/trusted-keys/` is the app's default trust list. It currently holds the **production** key
`semitec-foundation` — `semitec-foundation.pub.pem` plus `semitec-foundation.json`
(`"development": false`). Foundation releases signed with it show as **✔ Verified**. The list may also
contain a public key for a partner the Foundation has deliberately chosen to trust by default. Only public
halves are ever in this repository; `.gitignore` blocks `*.key.pem`, `*.p12`, `*.pfx`, `*.p8` and
`.env` with no exception.

**No development key is trusted by default.** Development does not need one: build drafts with
`--unsigned` and switch on *Developer mode* (Settings, or `SEMITEC_DEV=1`), which accepts unsigned
packs. For normal partner packages, create a production key and add its public half through the app's
*Trusted publishers* settings rather than editing the application source.

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

## Partner publishers

A partner organisation or department runs `keygen`, keeps the `.key.pem` private and gives recipients
only its `.pub.pem`, matching `.json` file and fingerprint. Each school or user adds that public file
under *Trusted publishers* and confirms the fingerprint independently. The partner can then sign and
distribute packages without a Foundation approval step or an app release. See [PUBLISHING.md](PUBLISHING.md).

## Optional Foundation default trust for a partner

The Foundation may choose to ship a partner's **public** key in `app/trusted-keys/` in a future Academy
release. That lets new installations accept packages signed by that key without each recipient importing it
first. It is optional: a partner can publish normally with local recipient trust, and signing with a partner
key does not automatically add it to the app.

Before adding a key, obtain the partner's `.pub.pem`, matching `.json` and fingerprint through a
verified channel; confirm the company controls the key; and add only those two public files to
`app/trusted-keys/`. Set `"development": false` in the public metadata, test the app, then release the
updated Academy installer. Never request, receive or store the partner's private key.

Default trust identifies a known publisher key. It does not transfer ownership of the partner's materials
or make every package and certificate Foundation-issued or academically approved. If a key is replaced or
compromised, follow the rotation procedure below: ship the new public key, have the partner re-sign its
current packages, then remove the old key in a later app release.

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
