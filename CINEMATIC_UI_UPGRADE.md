# Cinematic Game UI Upgrade

This pass adds a reusable broadcast/casino presentation layer across the complete Play Arena game set.

## What changed

- New shared `GameCinematicLayer` rendered over every `/play/*` game route.
- Animated player/rival entrance cards with dynamic names/ranks where the game API exposes them.
- Large VS slam with rotating energy ring, central slash, scan beam, speed lines and particles.
- Game-specific intro language and color treatment instead of one generic animation.
- Result cinematics for wins/losses on racing, football, pool, Tower Clash, Precision Arena, Teen Patti and premium server games.
- Jackpot/win burst for Nova 777.
- Flight-X launch presentation: pilot vs multiplier.
- Red vs Black / Dragon Tiger kingdom/guardian matchup presentation.
- Premium non-duel games receive start sequences such as NO MORE BETS, ROLL THE DICE, CALL THE STORM and SPIN THE VAULT.
- Existing premium duel stages now animate their left/right competitors and VS marker while dealing.
- Mobile-specific sizing keeps the cinematic readable on narrow screens.
- `prefers-reduced-motion` is respected.
- Cinematic layer is pointer-events disabled, so it never traps controls or creates a hidden blocking UI.

## Files added

- `src/components/games/GameCinematicLayer.tsx`
- `src/lib/gameCinematics.ts`

## Main files updated

- `src/components/layout/RouteShell.tsx`
- `src/components/premium-games/GameShell.tsx`
- `src/components/neon/RaceExperience.tsx`
- `src/components/penalty-kings/PenaltyKingsExperience.tsx`
- `src/components/eight-ball/EightBallExperience.tsx`
- `src/components/tower-clash/TowerClashExperience.tsx`
- `src/components/precision-arena/PrecisionArenaExperience.tsx`
- `src/components/slots/SlotsExperience.tsx`
- `src/components/teen-patti/TeenPattiExperience.tsx`
- `src/app/globals.css`

## Validation performed

All changed TypeScript/TSX files were parsed/transpiled with the TypeScript compiler API successfully, and structural CSS/brace checks passed. `npm ci` could not finish in the execution environment, so run the normal project checks locally before deployment:

```bash
npm install
npm run typecheck
npm run lint
npm run build
```
