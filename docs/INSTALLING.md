# Installing SemiTec Academy

Download the file for your computer from the **[latest release](https://github.com/SemiTecFoundation/semitec-academy/releases/latest)**, open it, and the app starts. No administrator rights are needed
on Windows; nothing else has to be installed.

| Computer | File | Size |
|---|---|---|
| Windows 10 / 11 (64-bit) | `SemiTec-Academy-Setup-<version>.exe` | ~110 MB |
| Mac with Apple chip (M1 … M4) | `SemiTec-Academy-<version>-mac-arm64.dmg` (or `.zip`) | ~130 MB |
| Mac with Intel chip | `SemiTec-Academy-<version>-mac-x64.dmg` (or `.zip`) | ~135 MB |
| Linux (64-bit) | `SemiTec-Academy-<version>-linux-x86_64.AppImage` or `semitec-academy_<version>_amd64.deb` | ~100–130 MB |

Not sure which Mac? Apple menu → *About This Mac* → "Chip: Apple …" = Apple chip, "Processor: Intel" = Intel.

## Windows — one click
1. Double-click `SemiTec-Academy-Setup-<version>.exe`.
2. The installer runs by itself (no questions), installs for your user account, adds **SemiTec Academy**
   to the Start menu and the desktop, registers `.stlp` files, and opens the app.
3. While the installer is not code-signed, Windows may show *"Windows protected your PC"* →
   click **More info** → **Run anyway**.

Update: run the new `Setup.exe` — it replaces the old version; accounts and progress are kept.
Uninstall: *Settings → Apps → SemiTec Academy → Uninstall*. Your data folder (by default
`Documents\SemiTec Academy`) is kept; delete it by hand to remove all accounts and progress.

## macOS
1. Open the `.dmg` and drag **SemiTec Academy** onto **Applications** (with the `.zip`: double-click it,
   then drag the app into *Applications*).
2. Start it from *Applications* or Launchpad.
3. While the app is not signed with an Apple Developer ID, macOS blocks the first start:
   - macOS 15 and newer: click **Done**, open *System Settings → Privacy & Security*, scroll to
     *"SemiTec Academy was blocked…"* → **Open Anyway** → confirm with your password.
   - macOS 14 and older: right-click (Control-click) the app → **Open** → **Open**.
   This is needed once. (Admins: `xattr -dr com.apple.quarantine "/Applications/SemiTec Academy.app"`.)

**If macOS says the app "is damaged", "can't be opened", or nothing happens**, open *Terminal* and run:

```bash
xattr -cr "/Applications/SemiTec Academy.app"
codesign --force --deep --sign - "/Applications/SemiTec Academy.app"
open "/Applications/SemiTec Academy.app"
```

The first line removes the "downloaded from the internet" mark, the second re-signs the app locally
for this Mac. Needed only while the app has no Apple Developer ID signature (RELEASING.md).

Update: replace the app in *Applications* with the new one. Data stays in `Documents/SemiTec Academy`.

## Linux
- **AppImage:** `chmod +x SemiTec-Academy-*.AppImage` and double-click / run it.
- **Debian / Ubuntu:** `sudo apt install ./semitec-academy_<version>_amd64.deb` — adds the menu entry and
  the `.stlp` file type.

## First start
Choose where your data is kept (default `Documents/SemiTec Academy`), type a username and password, then
add a course: **＋ Add course pack**, drag a `.stlp` file onto the window, or double-click the file.
Lab computers: put the data folder on the student's drive (managing lab PCs centrally is a platform idea).
