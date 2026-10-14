## Download the file for your computer

| Your computer | File |
|---|---|
| Windows 10 / 11 | `SemiTec-Academy-Setup-{{VERSION}}.exe` |
| Mac with Apple chip (M1–M4) | `SemiTec-Academy-{{VERSION}}-mac-arm64.dmg` |
| Mac with Intel chip | `SemiTec-Academy-{{VERSION}}-mac-x64.dmg` |
| Linux (64-bit) | `SemiTec-Academy-{{VERSION}}-linux-x86_64.AppImage` or `semitec-academy_{{VERSION}}_amd64.deb` |

Not sure which Mac? Apple menu → *About This Mac*. "Chip: Apple …" = Apple chip, "Processor: Intel" =
Intel. Picking the wrong one makes the app slow or stops it starting.

### macOS needs one extra step

These builds are not notarised by Apple, so macOS refuses to start the app and says
*"Apple could not verify…"* or *"…is damaged and can't be opened"*. The app is fine — only the
"downloaded from the internet" mark stops it. After dragging **SemiTec Academy** to **Applications**,
open *Terminal* (Launchpad → search "Terminal") and run this once:

```bash
xattr -dr com.apple.quarantine "/Applications/SemiTec Academy.app"
```

Then start it normally. Run it again each time you replace the app with a newer version.

Prefer not to use Terminal? Double-click the app so macOS blocks it, then go to
*System Settings → Privacy & Security*, scroll to *"SemiTec Academy was blocked…"* and click
**Open Anyway**. On macOS 15 and newer, Control-click → **Open** no longer works — Apple removed it.

Full instructions: [docs/INSTALLING.md](https://github.com/SemiTecFoundation/semitec-academy/blob/main/docs/INSTALLING.md#macos)

### Windows

The installer is not code-signed, so SmartScreen may warn: **More info** → **Run anyway**. No
administrator rights are needed.

### Checking your download

```bash
shasum -a 256 -c SHA256SUMS.txt --ignore-missing   # macOS / Linux
```

---
