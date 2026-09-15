# Eight Ball audit — 2026-09-15

## Root causes and changes

### Canvas geometry and resize lifecycle

The renderer subtracted a fixed `0.3` CSS pixels from the ball radius for its highlight. The previous minimum table scale of `1` produced a ball radius of `0.057`, so the highlight called `arc` with exactly `-0.243`. This happened during tiny/hidden container initialization, before the frame loop's zero-size check could help: sprites were drawn inside the ResizeObserver callback.

`viewport.ts` now rejects zero, negative, nonfinite and subpixel layouts before any background or sprite creation. The scale fits the complete table using proportional margins even at very small sizes. The highlight inset scales with the ball, and rounded-border radii are sanitized. All remaining arc, ellipse and radial-gradient radii derive from the validated positive scale or validated ball radius. Pocket art uses the same pocket definitions as physics.

ResizeObserver only marks geometry dirty. The existing animation loop applies at most one resize per frame and skips unchanged layout/DPR values. Layout is measured separately from the entrance animation's CSS transform. DPR changes update backing resolution, not world coordinates. A resize cancels any active gesture without shooting and retains the match/trace/aim state. A remounted match invalidates the prediction cache.

### Input

The largest cause of the immobile cue was HTTP STATUS setting `busy=true` on every poll. `canAim` depended on `!busy`, so slow/repeated polling disabled input. Background polling no longer owns the command lock.

Pointer conversion now first maps the displayed client rectangle into layout pixels, then into world coordinates. This handles canvas offsets, CSS scaling, DPR, resize and orientation changes consistently. Pointer gestures have one owning pointer ID, primary-button checks, capture, release, cancellation, lost-capture and blur cleanup. Cancellation never places or shoots. Invalid ball-in-hand placements are rejected before submission.

Mouse hover and touch movement aim around the cue ball. Pulling back along the aim direction builds power; release submits one shot. The original power slider and keyboard controls remain, with their frequent updates confined to that component and a ref consumed by the renderer. Multi-touch cannot overwrite an active gesture. The portrait rotation overlay no longer blocks play; the compact HUD and reserved power-control space retain the existing art/UI.

### Realtime

The old client always dialed same-origin `/race-socket` and disabled automatic reconnection. That route existed only in `scripts/server.mjs`, which a standard Next.js Vercel build does not start. The published site's old route returned **404** during a read-only probe on this audit date. The newly added function route also returns 404 on that existing deployment because these changes have not been deployed.

The custom server and new `api/race-socket.mjs` function share socket authentication and upgrade-origin checks. Session configuration advertises the correct origin/path for each deployment. Server-side `POOL_SOCKET_URL` and `POOL_SOCKET_PATH` support an external host. An HTTPS frontend rejects insecure realtime origins. Handshake diagnostics omit secrets. See the README for Fluid compute, reverse proxy and deployment-protection requirements.

The client has one transport lifecycle per account/game mount, stable callbacks and disposal guards. Reconnection uses Socket.IO exponential backoff with jitter, refreshes expiring JWTs, and requests authoritative state. HTTP remains available during an outage, with timeout/abort handling and bounded backoff. Status requests are single-flight and never lock aim; mutations wait for pending HTTP status and cannot be duplicated by repeated clicks. Failed acknowledgements trigger reconciliation, not automatic shot replay. Stale state versions/timestamps are ignored. The next-game transition waits for LEAVE completion and issues one JOIN. Timers, listeners, requests, audio and sockets are cleaned up on unmount; a delayed response after disconnect cannot reinsert an abandoned socket into the version cache.

### Physics, rules and database work

The authoritative fixed 240 Hz simulation is preserved. The browser interpolates the existing 30 Hz trace using requestAnimationFrame; neither React nor socket messages run or reset the simulation. Sprite/background caching is retained, and there are no React state updates in the drawing loop.

Additional fixes include rejecting invalid/zero elapsed time and nonfinite strikes, rejecting a missing/pocketed cue ball, making captured/uncaptured simulation duration agree, removing an extra duplicate final frame, clearing stale ball-in-hand/groups on re-rack, removing aim targets hidden behind a nearer cushion, and guarding zero-length AI candidate calculations. Shot validation now returns a table error before simulation. Server-secret comparison checks byte lengths before constant-time comparison.

Heartbeat writes now update presence fields instead of replacing a full match plus recorded trace. Idle ticks skip unchanged matches. Transactions, version checks, group assignment, foul handling and idempotent settlement remain authoritative in MongoDB.

## Verification

- Full Vitest suite: **140 tests passed**, including **50 pool tests**. Coverage includes a complete simulated rack to a winner, legal rack/break, collisions, rails, all six pockets, spin, placement, group assignment, fouls, early/final eight, re-rack, numerical boundaries, responsive coordinates and real local Socket.IO handshakes/authentication/reconnects.
- MongoDB integration: passed concurrent joins, two-player pairing, duplicate-shot rejection, resume, AI fallback, insufficient funds, disconnect forfeit, atomic entries, 90/10 payouts and idempotent settlement. It used and removed a uniquely named `pool_qa_*` database, not the configured application database.
- Production Next.js build: passed. TypeScript is checked by the build.
- Pool/application transport files: ESLint passed with zero warnings.
- Full-repository ESLint remains blocked by **2 existing errors and 7 warnings** outside this change: slots, tower clash, history/wallet, game preview and racing files. These have not been suppressed.
- Compatible dependency updates removed the reported production dependency vulnerabilities. Two moderate development-only Vitest/mocker advisories remain; resolving those requires a separate major test-runner upgrade.

Browser tests run against the production build, actual canvas/React components, real simulation traces, and isolated network fixtures. Profiles cover 1920×1080 desktop, 1366×768 laptop, iPad Mini, Pixel 7, iPhone 13 and iPhone SE, plus rotated dimensions. Tests exercise aiming, direct shots, moving balls, reconnect, 1×1/0×0 canvas sizes, touch cancellation, placement, touch power, slow HTTP heartbeats, winner display and next-game creation. Radius instrumentation checks arc, ellipse and radial-gradient arguments. Screenshots are visually inspected; frame timing is captured in `test-results/pool-results.json`.

## Limits before production sign-off

The Vercel CLI is installed but has no authenticated credentials, so production function logs, project settings, function packaging/routing and deployed WebSocket upgrades could not be verified. No deployment was performed. Enable/check Fluid compute and deploy the new function before testing the advertised endpoint in production. With no viewers on Vercel, match deadlines/disconnect outcomes are reconciled on the next authenticated request; the self-hosted server continues ticking when idle.

Mobile profiles use Chromium device emulation with native touch-event injection. Physical Android/iPhone hardware and Safari/WebKit were not available for certification. Successful local frame-time measurements do not establish a universal no-lag guarantee on every device or network.

## Sources

- [Vercel WebSocket and Socket.IO function deployment](https://vercel.com/docs/functions/websockets)
- [Socket.IO client connection/reconnection options](https://socket.io/docs/v4/client-options/)
- [Socket.IO CORS and WebSocket origin restrictions](https://socket.io/docs/v4/handling-cors/)

## Repeat the checks

```sh
npm test
npm run build
npx playwright install chromium
npm run test:pool:browser
npm run test:pool:integration
```

The integration command requires the configured MongoDB credentials to permit creation/deletion of its isolated QA database. The browser tests never write to application users or wallets.
