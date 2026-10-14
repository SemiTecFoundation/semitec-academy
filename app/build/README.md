# Build resources (installers)

Used by `electron-builder` (`npm run dist:*`), not shipped as app files.

| File | Use |
|---|---|
| `icon.svg` → `icon.png` (1024²), `icon.icns` (macOS), `icon.ico` (Windows) | app icon |
| `stlp.svg` → `stlp.png`, `stlp.icns`, `stlp.ico` | icon of `.stlp` files (SemiTec Learning Packages) |

After editing an `.svg`, render it to a 1024 × 1024 PNG (any browser or Inkscape) and convert:
`python3 -c "from PIL import Image; im=Image.open('icon.png'); im.save('icon.icns'); im.save('icon.ico', sizes=[(s,s) for s in (16,24,32,48,64,128,256)])"`.
