# Action audit

The menu bindings were checked against actual WebKit renders of all 104 compatible source clips: ten samples per clip from 0% through 90% of its duration, for 1,040 frames. These samples help review visible behaviour; they are not a guarantee about every intermediate frame. The eleven default menu actions were also recorded during normal playback (690 frames), including transitions and completion where applicable. The default actions below use clips whose visible movement matches the command.

## Default actions

| Menu command | Animation | Visible behaviour |
| --- | --- | --- |
| Sit | `chick_squat_start` → `chick_squat_loop01` | Low resting posture, eyes mostly open. |
| Doze | `chick_squat_start` → `chick_squat_loop02` | Settles down and closes its eyes. Replaces the misleading “Lie down” command. |
| Sleep | `chick_squat_start` → `chick_sleep_loop01` | Settles into the game's sleeping loop. |
| Preen | `chick_trick10` | Turns the beak into the wing feathers, then stretches/shakes out the wings. |
| Peck | `chick_idle01` | Lowers the head and pecks the ground. |
| Chirp | Calm idle + generated beak movement | Brief beak movement with a quiet game sound when sounds are enabled. This is not an original standalone chirping clip. |
| Preen while sitting | `chick_squat_start` → `chick_squat_loop03` | Turns the beak into its body/wing feathers while seated. |
| Look around | `chick_idle03alt` | Turns and tilts the head while standing. |
| Hop | `chick_hop` → `chick_land` | Hops and lands. |
| Run | `chick_run` | Running leg cycle, with desktop movement driven by foot planting/root motion. |
| Run with wings out | `chick_runflap` | Running cycle with the wings held out. |

Manual sitting, dozing, sleeping and seated preening continue until interrupted. Stand up / wake up plays `chick_squat_stand`. Feed uses the same ground-pecking action as Peck; it does not spawn food. Random trick selects one of the numbered game tricks.

## Corrections in 1.3.1

- `chick_idle02` scratches and pecks the ground. It is labelled **Scratch and peck**, and is no longer used for Preen.
- Preen uses the visually checked wing-cleaning animation, `chick_trick10`.
- `chick_squat_loop04` pecks while sitting. Its catalogue label is **Pecking while sitting**, and it is no longer used for resting.
- The former Lie down command is now **Doze**, using `chick_squat_loop02`; its tooltip and catalogue label agree.
- `chick_0lr` is a static neutral stance, not a stepping animation.
- Loops following egg-hatching scenes are labelled **After hatching**; the loop itself does not repeat the hatch.

The full catalogue also exposes source game scenes, held poses and static photo poses. These are presented as such: held clips contain the bird's pose without the player's hands, and hatching clips do not add an eggshell. Numbered tricks and reactions retain their source numbering rather than guessing a specific gesture from a filename.

## Repeat the visual audit

Close any other running copy of the app, then run:

```sh
"build/CS2 Pet.app/Contents/MacOS/CS2Pet" \
  --qa-bird=chick --audit-actions --render-exit
python3 tools/compose-action-audit.py
```

PNG frames, clip metadata and contact sheets are saved locally in `/tmp/cs2-pet-actions-audit/`. They contain rendered game imagery and are not committed.

To record an actual menu action over time, including transitions and return to idle:

```sh
"build/CS2 Pet.app/Contents/MacOS/CS2Pet" \
  --qa-bird=chick --capture-action=preen --capture-count=90 \
  --capture-label=preen-review --render-exit
```

The recording is written to `/tmp/cs2-pet-motion-preen-review/`. Its JSON records identify the current action, clip and clip time for each frame. `--qa-bird` can also select `chicken`, `chicken_silkie` or `chicken_polish`.

`npm test` additionally checks Preen using the actual skeletons of all four models: the beak approaches a wing while remaining above the ground. This catches the previous ground-scratching binding; it does not replace visual review.
