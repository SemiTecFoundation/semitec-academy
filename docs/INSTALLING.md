# Installing SemiTec Academy

Download the file for your computer from the **[latest release](https://github.com/SemiTecFoundation/semitec-academy/releases/latest)**, open it, and the app starts. No administrator rights are needed
on Windows; nothing else has to be installed.

| Computer | File | Size |
|---|---|---|
| Windows 10 / 11 (64-bit) | `SemiTec-Academy-Setup-<version>.exe` | ~110 MB |
| Mac with Apple chip (M1 … M4) | `SemiTec-Academy-<version>-mac-arm64.dmg` | ~125 MB |
| Mac with Intel chip | `SemiTec-Academy-<version>-mac-x64.dmg` | ~131 MB |
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

The Mac build is **not signed with an Apple Developer ID and not notarized**, so macOS refuses to
start it until you clear the "downloaded from the internet" mark. The app itself is intact — its
signature is valid, it is just not one Apple vouches for.

1. Open the `.dmg` and drag **SemiTec Academy** onto **Applications**.
2. Open *Terminal* (Launchpad → search "Terminal") and run this one line:

   ```bash
   xattr -dr com.apple.quarantine "/Applications/SemiTec Academy.app"
   ```

3. Start the app from *Applications* or Launchpad. It opens normally from now on.

Without step 2 macOS shows *"Apple could not verify …is free of malware"* (or, on some Macs,
*"…is damaged and can't be opened"*) and will not start the app.

**Without Terminal:** double-click the app so macOS blocks it once, then open
*System Settings → Privacy & Security*, scroll to *"SemiTec Academy was blocked…"* and click
**Open Anyway**, then confirm with your password. If that entry does not appear — it does not on every
macOS version for an unsigned app — use step 2 instead. On macOS 15 and newer, Control-clicking the
app and choosing **Open** no longer works: Apple removed that bypass.

Update: replace the app in *Applications* with the new one, and run step 2 again on it. Data stays in
`Documents/SemiTec Academy`.

## Linux
- **AppImage:** `chmod +x SemiTec-Academy-*.AppImage` and double-click / run it.
- **Debian / Ubuntu:** `sudo apt install ./semitec-academy_<version>_amd64.deb` — adds the menu entry and
  the `.stlp` file type.

## First start
Choose where your data is kept (default `Documents/SemiTec Academy`), type a username and password, then
add a course: **＋ Add a .stlp file**, drag a `.stlp` file onto the window, or double-click the file.
Lab computers: put the data folder on the student's drive (managing lab PCs centrally is a platform idea).
