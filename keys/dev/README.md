# Development signing key (public part)

This folder holds only the **public** half of the development key (`semitec-foundation-dev.pub.pem` +
`.json`). The app trusts it (copy in `app/trusted-keys/`) and labels packs signed with it **Dev-signed**.

The **private** key is never in this repository. On the author's computer it is
`Foundation/Private/keys/semitec-foundation-dev.key.pem`:

```bash
node packer/stlp.js create <pack-spec.json> --key ../../Private/keys/semitec-foundation-dev.key.pem
```

Contributors without it: build drafts with `--unsigned` (they install only with Developer mode on), or
make your own key with `node packer/stlp.js keygen <folder> --name "..." --dev` and trust its public key
in your local copy of `app/trusted-keys/`.

History: the first development key (`48c3e1ae9934d9f4`) was published by mistake on 2026-10-14 and was
replaced by `b766a9e9d1f0264d` in app 1.6.1. Packs signed with the old key are no longer trusted.
