# FDC Plaque Attack

A VR booth game for Meta Quest 3. You shrink down inside a giant mouth and protect the teeth from plaque germs, sugar and the Sugar King (Raja Gula).

- One round takes about 2 minutes:
  - a short "how to play" from Gigi, a friendly tooth in an FDC cape
  - **Wave 1, Serangan Plak:** germs hop across the tongue and chew on the teeth
  - **Wave 2, Hujan Gula:** candy rains from the roof of the mouth. Shoot it before it lands, or big sugar-germs are born where it hits. Some germs jump at your face.
  - **Boss, Raja Gula:** a giant striped candy king rises out of the throat, throws candy at the teeth and calls more germs. Shoot his 3 glowing weak spots.
- **What visitors learn:** Gigi explains the dental facts as they happen. Plaque is bacteria that eat food left on the teeth, sugar feeds them and they make acid, acid makes holes, and holes don't heal by themselves.
- **The result screen** shows the score, the lesson (brush twice a day, less sugar, a check-up every 6 months) and the **FDC offer with a QR code**. In booth mode it goes back to the start by itself.

Built with Three.js + WebXR. Everything (mouth, germs, tools, sounds, music) is made in code: there are no model or audio files.

## Controls

| | VR | Desktop |
| --- | --- | --- |
| Toothbrush | Right hand: swing it through germs and candy, rub it on yellow teeth to clean them | `Space` swings it |
| Fluoride Blaster | Left hand: hold the trigger | Click |
| Buttons | Point the laser, pull the trigger | Click |
| Pause | B / Y | `M` or `Esc` |
| Move | Left stick (or walk) | W A S D, drag to look |

## Scoring

| Action | Points |
| --- | --- |
| Germ (green / purple / orange) | 10 / 15 / 30, +5 with the brush |
| Candy shot | 15 |
| Tooth scrubbed clean | 25 |
| Weak spot hit / broken | 20 / 150 |
| Sugar King beaten | 1000 |
| Healthy tooth at the end | 20 each |
| A germ splats on your face | −20 |

Hits within 1.6 s of each other build a combo: ×1.5 after 5 hits, ×2 after 10, up to ×3. Today's top scores show on the start screen.

## Booth settings

Edit `src/game/config.js` and push. The headsets update the next time the game opens.

| Setting | What it does |
| --- | --- |
| `waves` | Length of each wave and how often germs and candy appear |
| `difficulty` | 0.7 for kids, 1 normal, 1.3 harder |
| `boothMode`, `resetAfterSeconds` | Go back to the start screen by itself after the result (25 s) |
| `showTutorial` | The short "how to play" before wave 1 |
| `promoTitle`, `promoText`, `promoUrl`, `promoCode` | The FDC offer and the link the QR code opens. **These are placeholders: change them before the event.** |

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install three.js, Vite and the QR library (once) |
| `npm run dev` | Play on the Mac at http://localhost:5176 |
| `npm run build` | Build into `dist/` |
| `npm run quest:connect` | Let a Quest plugged in by USB open `http://localhost:5176` |
| `npm run pages:setup` | Install the GitHub Pages workflow (once) |
| `npm run apk:setup` / `npm run apk:build` | Make the Quest app `fdc-plaque-attack.apk` (see below) |

## Publish

1. Run `npm run pages:setup` once, then commit and push to `main`.
2. In GitHub → **Settings → Pages**, set **Source: GitHub Actions**.

It goes live at https://markzugenjer.github.io/fdc-vr-plaque-attack/

## Quest app (.apk)

Like the other FDC apps, the APK only opens the published site, so after the first install a `git push` is enough to update it. It shares the signing key in `../vr-games-1/android`. GitHub Pages must be live first.

```bash
npm run apk:setup     # adds id.co.fdc.vrplaque to ../vr-games-1/public/.well-known/assetlinks.json
cd ../vr-games-1 && git add -A && git commit -m "Add FDC Plaque Attack to assetlinks" && git push && cd -
npm run apk:build     # → fdc-plaque-attack.apk (wait for the vr-games-1 deploy first)
adb install -r fdc-plaque-attack.apk
```

## Performance

Built for a steady 90 Hz on Quest 3:
- **Instancing:** the 28 teeth, up to 48 germs, the candies and the shots are instanced meshes.
- **Particles:** sparkles and goo run on the GPU, one draw call per system.
- **Lighting:** no shadows, a few lights, fog for depth.
- **Result:** about 35–90 draw calls and 120k triangles at the busiest moment.

## Files

```
src/game/game.js       the round: waves, boss, scoring, panels, result screen, booth reset
src/game/config.js     booth settings and the FDC promo (QR link)
src/game/world.js      the mouth: tongue, teeth (with health), gums, palate, throat, lips, bubbles
src/game/germs.js      plaque germs (instanced): hop, chew, jump at you, pop
src/game/weapons.js    toothbrush and Fluoride Blaster, shots
src/game/sugar.js      falling and thrown candy
src/game/boss.js       Raja Gula, the Sugar King
src/game/guide.js      Gigi, the guide tooth, and the speech bubble
src/game/particles.js  GPU particles (sparkles, goo, confetti)
src/game/qr.js         QR code drawing
src/game/sfx.js        synthesized sound effects
src/game/music.js      synthesized arcade music (heavier during the boss)
src/core/              shared VR base from vr-games-1 (renderer, lasers, walking, panels)
```
