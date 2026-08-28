# Premium game UI upgrade

## Implemented

- Reworked the shared premium game runtime to keep PixiJS alive between BETTING / ANIMATING / RESULT states instead of tearing the renderer down every phase change.
- Added richer ambient particles, speed streaks, pulse lighting, and a lower-power fallback path.
- Simplified one-action games (Thunder Gods, Money Machine, Flight X) into a clear amount -> play flow.
- Added larger, scrollable stake chips on mobile so the primary controls remain usable on very small screens.
- Reduced header crowding on small phones.
- Rebuilt Flight X presentation with:
  - live multiplier presentation
  - animated jet exhaust/trails
  - cloud + star parallax
  - skyline / horizon depth
  - animated multiplier curve and fill
  - clear FLYING / CASHED OUT / FLIGHT ENDED states
  - much larger cash-out button
  - disabled duplicate cash-out while the request is processing
- Increased Flight X state reconciliation frequency and made the displayed multiplier monotonic so a server clock resync cannot visually move the multiplier backwards.
- Preserved server-authoritative wallet/RNG/outcome logic.

## Recommended manual QA before deployment

1. Sign in with a normal USER account and open `/games`.
2. Test Flight X at minimum stake:
   - launch
   - cash out early
   - launch and allow a crash
   - refresh during a live round and confirm reconnect
3. Test at 320px, 390px, 768px and desktop widths.
4. Test all premium routes under `/play/[game]` and verify balance changes only after server settlement.
5. Test with browser sound muted and with reduced-motion enabled.
6. Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` in the normal development environment before production deployment.

## Validation in this delivery

The modified TSX files were parsed with the TypeScript compiler parser and the CSS brace structure was validated. Full dependency installation could not complete in the execution environment, so a full Next.js build was not claimed.
