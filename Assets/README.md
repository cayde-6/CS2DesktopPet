# Local assets

Valve game assets are not included in the public repository. An installed local copy of the app continues to use its own resources. To build the app yourself, you need your own lawfully obtained files exported to the format below. Check your rights to use and distribute them separately.

Expected structure:

```text
Assets/
  chick.glb
  chicken.glb
  chicken_silkie.glb
  chicken_polish.glb
  behaviors.glb
  showcase.glb
  poses.glb
  held.glb
  material-maps.json
  Sounds/
    chicken_chick_01.wav … chicken_chick_06.wav
    chicken_idle_hen_01.wav … chicken_idle_hen_06.wav
```

The model GLBs must include textures and preserve the original bone names. The shared libraries contain animations; their names are catalogued in `Sources/animations.json`. `material-maps.json` contains recovered material maps and is also a game asset: it is excluded from the public history.

See the main README for asset provenance, exporter versions and preparation tools. Everything in this directory, except this document, is ignored by Git. Do not attach builds containing Valve assets to public releases without the appropriate permission.
