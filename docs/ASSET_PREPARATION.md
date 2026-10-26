# Prepare your own assets

This repository does not contain game models, textures, sounds or animation data. Use your own lawfully obtained copy of the game and stay within the rights granted to you. These instructions are not permission from Valve to extract or distribute its content.

The preparation workflow targets CS2 resources from October 22, 2026 (depot 2347770, manifest 67499503218971311). Other game versions may change file names, skeletons or formats and require adjustments to the tools and catalogue.

## 1. Local game files

You need the complete `game/csgo` directory, including `pak01_dir.vpk`, its matching `pak01_*.vpk` archives and `gameinfo.gi`. Preserve the `game/` directory structure and the adjacent `game/core` directory if Valve's search paths require it. The `pak01_dir.vpk` index alone is not enough.

CS2 does not run on macOS; you can copy the directory from your own Steam installation on Windows or Linux. Do not upload VPK archives or exported game files to this repository.

## 2. Tools

You need Python 3 with Pillow and NumPy, ffmpeg and the .NET 10 SDK. For example, on macOS:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install Pillow numpy
brew install ffmpeg
```

Install the .NET 10 SDK from the [official download page](https://dotnet.microsoft.com/download/dotnet/10.0).

The complete animation set requires [ValveResourceFormat 20.1](https://github.com/ValveResourceFormat/ValveResourceFormat/releases/tag/20.1) with the patch included in this project. The patch makes the exporter use an explicit clip list, because a normal animation graph export omits some actions.

From the root of this repository:

```sh
git clone --depth 1 --branch 20.1 \
  https://github.com/ValveResourceFormat/ValveResourceFormat.git tools/vrf-source
git -C tools/vrf-source apply ../vrf-all-clips.patch
dotnet build tools/vrf-source/CLI/CLI.csproj -c Debug -p:PublishReadyToRun=false
```

Install any additional .NET dependencies requested by VRF. The downloaded exporter and SDK are not committed to Git.

## 3. Prepare the assets

Replace the example path with the location of your game files:

```sh
python3 tools/prepare-assets.py \
  --pak "/path/to/Counter-Strike Global Offensive/game/csgo/pak01_dir.vpk" \
  --vrf "tools/vrf-source/CLI/bin/Debug/Source2Viewer-CLI.dll"
```

The script creates and overwrites local files in `Assets/`. Use a clean checkout or back up your previous exports. It does not modify an installed copy of the app.

The script:

1. Exports four models and embeds their textures into GLBs, preserving the feather alpha mask.
2. Extracts the shared animation library and checks for all 104 compatible clips. Human animations are excluded from the bird skeleton.
3. Recovers AO, roughness and cloth masks from the original textures. Normal and anisotropic gloss textures are also extracted separately with `--texture_decode_flags None`.
4. Exports twelve sounds and converts them to mono WAV at 22,050 Hz.
5. Checks the resulting resource set.

The detailed log is saved to `tools/prepare-assets.log`. Intermediate files in `tools/` and all game resources in `Assets/` are ignored by Git.

## 4. Build and validate

```sh
npm run check:assets
npm test
./build.sh
open "build/CS2 Pet.app"
```

If you have already prepared the assets on another computer you own, you can copy the resulting files into `Assets/` and start here. See [Assets/README.md](../Assets/README.md) for the exact layout.

Do not publish the resulting game files or builds containing them without the appropriate permission. Crediting Valve in a README does not replace that permission.
