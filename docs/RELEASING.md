# Releasing SemiTec Academy (installers)

Installers are made with **electron-builder** (configuration: `build` in `app/package.json`, icons in
`app/build/`). Output: `installers/<version>/`.

| Command (in `app/`) | Makes | Build on |
|---|---|---|
| `npm run dist:win` | `SemiTec-Academy-Setup-<v>.exe` — **one-click NSIS installer**: per-user, no admin, no questions, Start-menu + desktop shortcut, `.stlp` association, starts the app | Windows; or Linux / macOS with Wine |
| `npm run dist:mac` | `SemiTec-Academy-<v>-mac-arm64.dmg` / `-x64.dmg` | **macOS only** (DMG and signing need Apple tools) |
| `npm run dist:linux` | `.AppImage` + `.deb` (x64) | Linux |
| `bash tools/build-installers.sh` | fresh `npm ci`, tests, then the installers for the current system | any |

`node_modules` must be installed **on the system that builds** (`npm ci`): Electron downloads a
binary for that system: a `node_modules` installed on Linux cannot build a Mac DMG.

**All three at once (the normal way):** push a tag `v<version>` — `.github/workflows/build-installers.yml`
builds on real Windows, macOS and Linux machines, then attaches every installer plus `SHA256SUMS.txt`
to a GitHub release. A manual run (Actions → Build installers → Run workflow) builds the same files as
downloadable artifacts without releasing.

## Checklist
1. Raise `app/package.json → version`; update `src/shared/versions.js` if content formats changed
   (VERSIONING.md); README versions table; ROADMAP.
2. `npm test` (75 end-to-end checks).
3. Build the installers; test a built app: `E2E_EXECUTABLE=<unpacked app binary> npm test`
   (e.g. `../installers/<v>/linux-unpacked/semitec-academy`).
4. Release the `academy-templates:package` skill for the same version (its CHANGELOG, `bundle-skill`).
5. Tag the release (`git tag v<version> && git push origin v<version>`); add short release notes
   (what's new, minimum versions) to the release the workflow created. Keep the older releases.

## Building locally on a Mac inside a synced folder (OneDrive / iCloud / Dropbox)
`codesign` refuses files that carry extended attributes, which these clients add, so `npm run dist:mac`
stops with *"resource fork, Finder information, or similar detritus not allowed"*. Strip them and build
again, or build from a checkout outside the synced folder (CI is unaffected — it builds a clean clone):

```bash
xattr -cr app/build app/src packer dist
npm run dist:mac
```

## Signing (removes the Windows / macOS warnings)
Unsigned installers work, but Windows SmartScreen and macOS Gatekeeper warn on first start
(INSTALLING.md says how to continue).

- **Windows:** an OV / EV code-signing certificate (or Azure Trusted Signing). Set `WIN_CSC_LINK`
  (path or base64 of the `.pfx`) and `WIN_CSC_KEY_PASSWORD`, then `npm run dist:win`.
- **macOS:** Apple Developer Program membership → a *Developer ID Application* certificate. Set
  `CSC_LINK` / `CSC_KEY_PASSWORD`, remove `"identity": "-"` from `build.mac`, and for notarisation set
  `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` and add `"notarize": true` to `build.mac`.
  Without a certificate `"identity": "-"` signs ad-hoc (required to run on Apple-chip Macs).
- Never commit certificates or passwords; keep them in the CI secrets or the release machine's keychain.
- Package signing keys (`.stlp`) are separate — see KEYS.md.

## Before the first public release
- [x] Real contact details in `app/package.json`: `info@semitec.org` (author, Linux maintainer) and
  `https://semitec.org` (homepage). They end up in the Debian `control` file and the Windows
  installer metadata, so check them with `npm run dist:linux` output before a release.
- [x] No development key in `app/trusted-keys/` — since 1.6.2 it holds only the production key
  (KEYS.md). Signing a release needs the offline private key; drafts use `--unsigned` + Developer mode.

## Which files a release has
Five installers and `SHA256SUMS.txt`: one `.exe` (Windows), `mac-arm64.dmg` and `mac-x64.dmg` (Apple
chip / Intel — a single universal DMG would carry both and roughly double every Mac download), and
`.AppImage` plus `.deb` for Linux. electron-builder can also emit `.zip` copies of the Mac apps for
`electron-updater`; the app does not auto-update, so that target is off.

## Build history
- **1.6.2** — same workflow; first release signed with the production key, and the first whose notes
  come from `.github/release-notes.md`. Five installers (the macOS `.zip` copies were dropped).
- **1.6.1** — built by the workflow on real `windows-latest`, `macos-latest` and `ubuntu-latest`
  runners: the first proper DMGs, and the 75 end-to-end checks ran under `xvfb` before packaging.
- **1.5.0** — built on Linux: AppImage / deb natively, the Windows installer with Wine, the macOS apps
  as `.app` bundles zipped with their symlinks and signed ad-hoc with `rcodesign` (no DMG — that needs
  macOS). Only the Linux build was ever started as a packaged app; prefer 1.6.1 or later.
