# Trusted keys

Public keys whose pack signatures this app version accepts: `<name>.pub.pem` + `<name>.json`
(`{ "name": "...", "development": true|false }`). Adding or removing a key = a new app release.

Since 1.6.2 this folder holds only the production key `semitec-foundation` (`4c71eba82f86fcca`,
`"development": false`); packs signed with it are shown as **✔ Verified**. No development key is
trusted — build drafts with `--unsigned` and *Developer mode*. A key marked `"development": true`
would make its packs **⚑ Dev-signed**. See `docs/KEYS.md`.
