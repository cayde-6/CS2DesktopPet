#!/bin/zsh
set -euo pipefail
cd "${0:A:h}"
node tools/check-assets.mjs
mkdir -p build/CS2\ Pet.app/Contents/{MacOS,Resources}
node_modules/.bin/esbuild Sources/pet.js --bundle --minify --format=iife --outfile=build/pet.bundle.js
python3 - <<'PY'
from pathlib import Path
import plistlib,shutil
app=Path('build/CS2 Pet.app/Contents')
html=Path('Sources/index.html').read_text().replace('__BUNDLE__',Path('build/pet.bundle.js').read_text())
(app/'Resources/index.html').write_text(html)
for name in ('chick','chicken','chicken_silkie','chicken_polish'):
 p=Path('Assets')/(name+'.glb');shutil.copy2(p,app/'Resources'/p.name)
for library in ('behaviors','poses','showcase','held'):
 shutil.copy2('Assets/'+library+'.glb',app/'Resources'/(library+'.glb'))
shutil.copy2('Sources/animations.json',app/'Resources/animations.json')
shutil.copytree('Assets/Sounds',app/'Resources/Sounds',dirs_exist_ok=True)
with (app/'Info.plist').open('wb') as f:plistlib.dump({'CFBundleExecutable':'CS2Pet','CFBundleIdentifier':'local.maxime.cs2pet','CFBundleName':'CS2 Pet','CFBundleDisplayName':'CS2 Pet','CFBundlePackageType':'APPL','CFBundleShortVersionString':'1.3.0','CFBundleVersion':'8','LSUIElement':True,'LSMinimumSystemVersion':'13.0','NSHighResolutionCapable':True,'NSSupportsAutomaticGraphicsSwitching':True},f)
PY
swiftc Sources/main.swift Sources/placement.swift -o "build/CS2 Pet.app/Contents/MacOS/CS2Pet" -framework AppKit -framework WebKit -O
codesign --force --deep --sign - "build/CS2 Pet.app"
