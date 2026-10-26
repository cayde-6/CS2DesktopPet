# Technical notes

These notes describe the configuration validated locally. Game files are not included in the public repository; see [asset preparation](ASSET_PREPARATION.md).

## Model provenance

The resources used during development were downloaded on October 23, 2026 directly from the Steam CDN through an anonymous dedicated server subscription using SteamRE/DepotDownloader 3.4.0: app 730, depot 2347770, public manifest **67499503218971311** dated October 22, 2026. An installation on another computer was not used.

Original models:

- `models/chicken/chick.vmdl_c`
- `models/chicken/chicken.vmdl_c`
- `models/chicken/chicken_silkie.vmdl_c`
- `models/chicken/chicken_polish.vmdl_c`

The models were exported to GLB with their original textures using ValveResourceFormat / Source 2 Viewer CLI 20.1. All 124 resources from `animation/anims/chicken/{world,ui,snapshot}` and `animation/anims/viewmodel/chicken` are listed in `tools/all-animation-clips.txt`. A normal export follows animation graph references and omits some files. The local `tools/vrf-all-clips.patch` adds an explicit list and logs each clip's original skeleton. The audit in `tools/all-animation-metadata.json` identified 104 clips for `characters/chicken/chicken.vnmskel` and 20 for the human `characters/worldmodel.vnmskel` skeleton: 14 character poses and six hand animations. The human clips are excluded to prevent incorrect retargeting from stretching the bird.

The shared libraries contain no meshes or textures: `behaviors.glb` (61 clips, 7.41 MiB), `showcase.glb` (23 clips, 6.75 MiB), `poses.glb` (14 clips, 0.77 MiB) and `held.glb` (six clips, 0.97 MiB). Showcase scenes, poses and held animations load on first selection. Keyframe reduction allows at most 0.01 mm of error per component and approximately 0.006° of rotation error, preserving the original values of retained keys. Comparison with the original export checked 6,482,500 source samples across 101 clips. Three additive sleep flinches are composed over the actual sleeping pose rather than the bind pose. Identically named world and viewmodel idle clips do not replace each other.

Twelve original sounds were extracted from `sounds/ambient/common/animal/chicken_chick_*` and `chicken_idle_hen_*`, converted to WAV and included in the local app.

In the original local development directory, intermediate model exports were kept in `tools/raw/`. The self-contained runtime GLBs are in `Assets/`.

Materials are adapted for Three.js 0.180.0. Lighting and roughness are approximations; the app does not run the Source 2 engine. The original feather texture alpha channel is restored because the PBR export removed it. Backface normal flipping is disabled as required by the game's `F_DONT_FLIP_BACKFACE_NORMALS` parameter. Feather geometry, masks and original normals are preserved. Transparent edges are smoothed through MSAA sample coverage. Geometry is not shortened, and no decorative shells are added. Feather lighting uses cloth sheen with the original material mask. The exported GLBs retain their original geometry; lighting does not exactly reproduce the game's shader.

In version 1.1.1, feather edges were also smoothed through supersampling: on Retina displays, rendering used twice the display resolution along each axis before WebKit reduced the image to the window size. Diffuse feather lighting was softened separately from specular highlights to reduce dark ripples. Geometry, textures and feather masks were preserved. The `--quality-compare` flag captures an identical pose to `/tmp/cs2-pet-quality-before.png` and `/tmp/cs2-pet-quality-after.png`. Version 1.3.0 replaces this rendering approach as described below.

Walking removes translation from `root_motion.position` and distributes the pose mismatch at the loop boundary across the keyframes for a smooth loop. Render frames drive window movement, compensating for the motion of four sole vertices while a foot touches the ground. Position retains its fractional component because `NSWindow` rounds window coordinates. The walking rate is 1.1 times the original; the walk animation is not slowed down. Sitting, sleeping and other actions suspend roaming until their sequences finish. Clicking triggers a 0.7-second head nod rather than a full-body game reaction.

## Validation

```sh
open "build/CS2 Pet.app" --args --snapshot --qa
```

Startup validation samples 61 world clips and a calm idle at 16 times in two directions: 1,984 poses. After loading the complete set, it samples 104 original clips and the calm idle: 3,360 poses. Ordinary actions keep the normal framing; large jumps temporarily expand the frame before the camera returns. Framing uses the bounds of the deformed geometry with padding. Results are written to `cs2-pet.log` in the system temporary directory, and PNGs to `/tmp/cs2-pet-<model>.png`. Switching models was checked through the actual context menu. Dragging is implemented, but the automated UI driver could not validate the drag gesture for this window.

`npm test` checks the actual skeletons of all four models: loop continuity and foot planting in both directions over multiple walk cycles. It also checks every new clip's bindings on all four models, sit → sleep → stand sequences, manual rest until wake-up, and chirp completion. Sleeping, waking by click and successful original sound playback (`NSSound.play() = true`) were checked through the actual menu.

The original walk loop discontinuity was reduced from 16.48 mm to 0.077 mm in model coordinates. The checked stance frames have no calculated sole slippage.

An additional 36 real render frames were recorded with actual window coordinates before and after the fix. The local captures are in `/tmp/cs2-pet-motion-before/` and `/tmp/cs2-pet-motion-after/`; `contact-sheet.jpg` shows the bird against a fixed coordinate grid. After the fix, sole drift within a single stance phase stays within 0.87 logical pixels, the window positioning rounding limit, with no accumulated slippage. To repeat the capture, run `open "build/CS2 Pet.app" --args --capture-walk --capture-label=test`, then `python3 tools/compose-motion.py test`.

Tools: [DepotDownloader](https://github.com/SteamRE/DepotDownloader) and [ValveResourceFormat](https://github.com/ValveResourceFormat/ValveResourceFormat). Models and textures belong to Valve.

Placement checks (`npm run test:placement`) cover transparent padding, dragging to the Dock, free placement above it, resizing, negative coordinates on another display and a hidden Dock. In 36 actual walk frames in `/tmp/cs2-pet-motion-dock/`, the feet remain along the Dock's upper edge with less than one logical pixel of deviation.

## Complete animation set, version 1.2.0

In hopping animations and some tricks, forward movement is recorded in the `root` bone rather than `root_motion`. The horizontal component now drives the window while the vertical jump remains in the original animation. Running uses actual sole vertices for foot planting, just like walking. While airborne between stance phases, the window continues at the original root motion speed. The allowed step limit accounts for window size so that fast running frames are not discarded. Automatic running is enabled only when roaming is allowed.

Shoulder and held poses use offset game origins. On the desktop, they are moved to ground level and the centre of the window without changing the skeleton pose. Offset blending is disabled when transitioning between different origins. Cached skinned mesh frustum culling is disabled because it does not account for these poses and could hide a visible bird. Geometry measurements also update the mesh's inverse bind matrix.

To repeat the visual pass, run `open "build/CS2 Pet.app" --args --qa --preview-actions`. Two actual frames per clip are saved to `/tmp/cs2-pet-actions-preview`; `python3 tools/compose-animation-previews.py` assembles contact sheets. To capture actual running, use `open "build/CS2 Pet.app" --args --capture-action=run --capture-label=run`.

Re-extraction requires the pinned depot above, a local .NET 10 SDK and VRF 20.1 source in `tools/vrf-source`. Apply `tools/vrf-all-clips.patch`, build `CLI/CLI.csproj`, then run the CLI with `CS2_PET_CLIPLIST="$PWD/tools/all-animation-clips.txt"`, model `models/chicken/chick.vmdl_c` and flags `--gltf_export_format glb --gltf_export_animations --gltf_compose_additive`. Save the complete intermediate export to `tools/all-animations/export.glb`. `python3 tools/pack-all-animations.py` (requires NumPy) creates the libraries and catalogue. `python3 tools/verify-animation-packing.py` compares the output with the original keys; `npm test` checks bindings for all 104 clips on all four birds, catalogue coverage, walking and Dock placement.

## Rendering, version 1.3.0

Original material maps replace the uniform roughness value of 0.85 across the entire model. Roughness was lost during GLB export, and occlusion and metalness channels were mixed up. Maps are recovered from the pinned depot: the chick's roughness comes from the B channel of the original normal texture; adult birds use two `g_tAnisoGloss` channels, taking their geometric mean as an isotropic approximation. These textures are extracted with `--texture_decode_flags None` because VRF's automatic decoder incorrectly treats them as normal maps. AO is restored from the actual `g_tAmbientOcclusion`. Colour, normals, geometry and skeleton weights are neither filtered nor changed.

Materials use MeshPhysicalMaterial with actual roughness maps. Feathers use cloth sheen with the original cloth mask, `blue * (1 - green)`. Eye highlights and matte feathers no longer share the same roughness. A local RoomEnvironment provides PMREM-prefiltered environment lighting, with weak additional lights for directionality. HDR uses Neutral tone mapping and a single conversion to sRGB.

Opacity and sample coverage are stored separately in two MRT attachments. This fixes alpha-to-coverage multiplying alpha again and making parts of the opaque body translucent. The feather mask uses the original alpha and Source's MSAA behaviour instead of turning the gradient into a hard threshold. In a reference body region of the canonical pose, approximately 39% of pixels previously had alpha below 254; the entire region now has alpha 255.

Each frame renders the same pose at four spatial offsets with 4× MSAA, accumulates the samples in linear HDR and outputs correct premultiplied alpha. No previous-frame history is used. Rendering uses the display's physical resolution, up to a pixel ratio of 2. Eyes, beak and texture RGB are not blurred by a separate filter. The camera returns to its original projection after rendering to preserve foot planting and Dock calculations.

Validation covered actual frames of all four birds, transparent backgrounds, body opacity and a match between 3,407,873 texels across five maps and their original channels. `npm test` passes. Ordinary walking measured around 30 frames per second; 36 frames with window coordinates are in `/tmp/cs2-pet-motion-renderer-v13/`.

To repeat the canonical captures, first close any other running copy of CS2 Pet:

```sh
for bird in chick chicken chicken_silkie chicken_polish; do
  "build/CS2 Pet.app/Contents/MacOS/CS2Pet" --qa-bird="$bird" --quality-compare --quality-label="$bird" --render-exit
done
npm run test:render
```

The `--qa-bird` flag does not change the bird saved in preferences. Captures are written to `/tmp/cs2-pet-quality-<bird>-before.png` and `-after.png`; the chick comparison is `build/render-comparison.png`. Direct source texture exports are kept locally in `tools/render-materials/` (PNGs are not tracked by Git); `tools/pack-material-maps.py` builds the self-contained `Assets/material-maps.json`. Rendering checks require these intermediate files and captures. Normal builds and runtime do not require them, the SDK, VPK archives or network access.
