# Play Arena game-experience audit

## What already works

- Next.js owns authentication, wallet, navigation, admin, and server APIs.
- PixiJS already renders Penalty Kings, Precision Arena, 8 Ball, and Neon Drift.
- Babylon.js is isolated to Tower Clash and supplies its destructible castle scene.
- Teen Patti and the premium chance games use server-authoritative round logic.
- Gameplay routes already remove the normal site header, sidebar, footer, and bottom navigation.
- Device capability detection, lazy renderer loading, physics tests, server RNG tests, and responsive safe-area handling already exist.

## Current problems found

1. The shared pre-game lobby was a white website-style card. It appeared before Penalty Kings, Precision Arena, 8 Ball, Tower Clash, and Neon Drift, so the first impression did not match the game itself.
2. 777 Slots was a three-reel React/CSS implementation. The requested product calls for five reels and a dedicated game-rendering layer.
3. Audio, vibration, delays, asset loading, and particle lifecycle behavior were implemented independently inside games. This duplicated logic and made feedback inconsistent.
4. The stored graphics preference was not connected to the automatic renderer-quality detector.
5. Homepage tiles relied mostly on image zoom. They lacked inexpensive, game-specific motion cues.
6. Several bespoke games have rich gameplay canvases but still contain long-form, dashboard-like lobby content in dead or secondary UI branches.
7. Most character motion is procedural silhouette motion rather than authored sprite-sheet or skeletal animation.
8. Sound is primarily synthesized Web Audio feedback. Production sound packs and compressed ambient loops are still required.
9. The shared premium game collection has strong presentation CSS and ambient Pixi effects, but its table/set-piece visuals are not yet as physically expressive as the bespoke action games.

## Architecture changes required

The reusable runtime lives in `src/game-engine`:

- `AnimationManager`: timing, easing, and number count-up helpers.
- `AssetLoader`: explicit preloading with progress callbacks.
- `AudioManager`: one safe, reusable Web Audio feedback layer.
- `HapticManager`: restrained tap, impact, success, failure, and major-win patterns.
- `ParticlePool`: reusable particles without continuous allocation churn.
- `GameScaler`: aspect-preserving logical viewport calculations.
- `TutorialManager`: first-play, auto-expiring visual onboarding state.
- `gamePerformance`: automatic capability detection plus AUTO/LOW/MEDIUM/HIGH overrides.

React remains responsible for account, wallet, navigation, confirmation, accessibility, and server communication. PixiJS/Babylon.js remain responsible for active rendered gameplay.

## Asset requirements

All packs must be original, exportable as atlases, and include low-resolution variants.

| Pack | Required assets |
| --- | --- |
| Shared characters | idle/breathe, blink, entrance, win, loss, and reaction loops; 2–4 directional variants where needed |
| Slots | ten symbol animations, cabinet lights, Nova mascot reaction frames, coin/spark atlas, reel-stop and win audio |
| Penalty Kings | striker and keeper sprite sheets, net deformation frames, crowd bands, pitch particles, stadium audio |
| Precision Arena | archer rig or sprite sheet, bow deformation, cloth/hair loops, arrow trails, four environment layers |
| 8 Ball | cue/table skins, ball-normal texture, chalk and pocket particles, collision/pocket audio |
| Tower Clash | five damage-state material sets, rubble atlas, smoke/fire atlases, soldier reactions |
| Neon Drift | fictional vehicle atlas, wheel layers, exhaust/smoke/spark atlases, road props, engine/drift audio |
| Teen Patti | two original champion rigs, dealer hands, card backs/faces, chip atlas, reaction loops |
| Shared premium games | original table props, dice/cards/reel symbols, fictional team badges, win/loss set-piece effects |

## Game-by-game upgrade plan

| Game | Current state | Next upgrade |
| --- | --- | --- |
| Nova 777 | Five-reel PixiJS machine implemented in phase 1 | Add authored symbol atlas and multi-stage mascot reaction sprite sheet |
| Penalty Kings | PixiJS stadium, swipe shots, keeper dives, ball flight, crowd/confetti | Replace procedural players with original sprite sheets and add deforming net mesh |
| Precision Arena | PixiJS archer, drag/release, wind ballistics, moving targets, particles | Add skeletal archer and cinematic target camera on perfect shots |
| 8 Ball | PixiJS table, real collisions/friction/pockets, trajectory and cue control | Add spin visualization, short bank-shot camera, authored hall props |
| Tower Clash | Babylon scene, ballistics, debris, staged castle damage | Add authored crack/damage textures and stronger soldier/fire reactions |
| Neon Drift | PixiJS pseudo-3D road, traffic, drift/nitro effects | Add short event mode, authored cars, tunnel/sign prop atlas |
| Teen Patti | Server-authoritative rounds, animated cards/chips, reactions | Replace symbolic champions with original animated rigs and shorten the pre-round flow |
| Racing betting / Car Roulette | Premium selector and server result system | Build the 8–15 second track race as a PixiJS race sequence with fictional teams |
| Royal Roulette | Premium wheel presentation | Add physical ball travel, pocket collision, camera push, and croupier hand animation |
| Thunder Gods | Animated reel/tumble presentation | Add authored guardian reaction frames and lightning-charged symbol impacts |
| Red vs Black | Animated card duel presentation | Add original champion VS entrance and dealer-card movement |
| Sic Bo | Dice chamber presentation | Add physics-driven dice tumbles and collision-responsive cup/table effects |
| Flight X | Animated flight curve and cash-out feedback | Add aircraft banking, exhaust trail, cloud parallax, and failure fly-off sequence |
| Dragon Tiger | Animated card presentation | Add original guardian entrance/reaction loops and physical chip travel |
| Money Machine | Animated reel presentation | Move reels to the shared five-reel renderer and add vault/coin set-piece effects |

## Files and components in scope

Implemented in this pass:

- `src/game-engine/*`
- `src/lib/gamePerformance.ts`
- `src/lib/slots/engine.ts`
- `src/components/slots/SlotsExperience.tsx`
- `src/components/slots/SlotsReelCanvas.tsx`
- `src/components/games/SimpleGameLobby.tsx`
- `src/components/games/GameCard.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/BottomNav.tsx`
- `src/components/penalty-kings/PenaltyKingsExperience.tsx`
- `src/components/precision-arena/PrecisionArenaExperience.tsx`
- `src/app/globals.css`
- `src/tests/slotsEngine.test.ts`

Primary future files:

- `src/components/penalty-kings/PenaltyKingsArena.tsx`
- `src/components/precision-arena/PrecisionArena.tsx`
- `src/components/eight-ball/EightBallArena.tsx`
- `src/components/tower-clash/TowerClashArena.tsx`
- `src/components/neon/RaceCanvas.tsx`
- `src/components/teen-patti/TeenPattiExperience.tsx`
- `src/components/premium-games/GameStage.tsx`
- `src/components/premium-games/GameShell.tsx`
- `src/components/premium-games/GameCanvas.tsx`

## Implementation order

1. Complete the shared runtime and use it in all bespoke games.
2. Finish authored asset integration for Nova 777, Penalty Kings, and Precision Arena.
3. Polish 8 Ball, Tower Clash, and Neon Drift set pieces.
4. Upgrade Teen Patti and shared premium games with physical card/chip/dice/race motion.
5. Add compressed production audio, performance profiling, mobile-browser regression coverage, and final visual polish.
