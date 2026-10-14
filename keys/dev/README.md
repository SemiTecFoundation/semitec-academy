# Development signing key

`semitec-foundation-dev.key.pem` signs packs **for development and testing only**.
Its public key is in `app/trusted-keys/`, so the prototype accepts these packs and shows them as
**Dev-signed**. Remove it from `app/trusted-keys/` before a real release and use a production key
kept offline — see `docs/KEYS.md`.
