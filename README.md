# Neon Arcade

Neon Arcade is a full-stack single-player browser game platform with Nova 777 Slots, Teen Patti, Precision Arena archery, Tower Clash, Neon Drift racing, Penalty Kings football, and 8 Ball Cash Arena, built with Next.js, React, TypeScript, Tailwind CSS, PixiJS, Babylon.js, and MongoDB.

All games start instantly against AI opponents, with no matchmaking queue. AI advantages affect tactical accuracy and decision-making while final outcomes remain controlled by actual gameplay.

## Core architecture

- PixiJS 2D archery, top-down neon racing, penalty shootouts, and realistic top-down pool with procedural layered environments, particles, trails, impact effects, and responsive pointer/touch controls
- Five-reel PixiJS Nova 777 machine with sequential reel stops, original vector symbols, pooled win particles, turbo/auto modes, haptics, and server-authoritative payouts
- Shared game-engine managers for asset progress, animation timing, Web Audio feedback, haptics, aspect scaling, first-play tutorials, particle pooling, and AUTO/LOW/MEDIUM/HIGH graphics quality
- Babylon.js is isolated to the remaining Tower Clash destructible-castle scene; the racing, football, pool, and garage bundles contain no Babylon models, cameras, or scene code
- Precision Arena progression with XP, six ranks, daily missions, achievements, streaks, personal records, leaderboards, and unlockable bows, arrows, targets, outfits, and environments
- Real steering, acceleration, braking, drifting, nitro, traffic avoidance, checkpoints, and responsive touch controls
- Real-time 8-ball physics with aim, power, English, ball-in-hand placement, legal groups, bank shots, collisions, pockets, and six-rail table bounds
- 8 Ball Cash Arena progression with XP, ranked points, daily missions, achievements, statistics, personal bests, and unlockable cues, tables, and ball skins
- Tower Clash ballistics with wind, angle, power, projectile types, breakable castle pieces, cascading damage, cinematic projectiles, debris, smoke, sparks, fire, and boss AI
- Tower Clash progression from Rookie to Legend with unlockable cannons, castles, arenas, payload skins, missions, achievements, statistics, and personal records
- Instant Expert AI opponents with no player queue
- Server-authoritative Teen Patti with blind/seen play, chaal, raises, pack, show, correct six-tier hand ranking, rotating AI opponents, naturally shuffled hands, idempotent bets, and durable round history
- Vercel-compatible authenticated start/finish APIs with durable MongoDB match state; browser gameplay never depends on a long-lived WebSocket process
- Server-side ownership, minimum-duration, tier, unlock, entry, reward, idempotency, and bounded-stat validation
- Trusted server-to-server persistence for race entries, rewards, XP, RP, statistics, checkpoints, and anti-cheat logs
- MongoDB models for drivers, vehicles, cosmetics, tracks, competition tiers, AI matches, participants, missions, achievements, reports, and integrity events
- Every newly created account immediately receives one Rs 500 promotional welcome credit. Promotional and withdrawable balances remain separate, and every grant is recorded exactly once in the wallet ledger and bonus audit collection.
- Refer & Earn rewards Rs 300 in non-withdrawable promotional credit after the referred account is created and passes server-side new-account, device-signal, self-referral, loop, and duplicate-reward checks.
- Clearly labeled simulated leaderboard rivals update while the live board is open, using a separate collection that never affects real wallet or revenue totals
- Detailed operations console with user-level profit/loss, purchases, withdrawals, ledger history, match outcomes, cash-request review, CSV exports, and an administrator audit trail
- Operations controls without any ability to choose or force a winner

## Local setup

Create `.env`:

```env
MONGODB_URI=
MONGODB_DB=neon-drift
ADMIN_EMAIL=
ADMIN_PASSWORD=
JWT_SECRET=use-at-least-32-random-characters
RACE_SERVER_SECRET=use-at-least-32-random-characters
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

`RACE_SERVER_SECRET` may be omitted locally; the server will fall back to `JWT_SECRET` for its internal persistence webhook.

```bash
npm ci
npm run db:seed
npm run dev
```

The local command starts the self-hosting wrapper on port 3000. Browser gameplay uses the same Next.js HTTP route handlers in local and deployed environments; the legacy Socket.IO listener is not required by any game client.

## Vercel deployment

Set `MONGODB_URI`, `MONGODB_DB`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, and `RACE_SERVER_SECRET` in the Vercel project for Production and Preview. Both secrets must contain at least 32 random characters. Set `NEXT_PUBLIC_APP_URL` to the deployment's canonical HTTPS origin.

Use Vercel's standard Next.js build (`npm run build`). Do not configure `scripts/server.mjs` as a Vercel entry point: custom Next.js servers are not executed by a normal Vercel deployment. The original five action-game clients call `/api/gameplay/[game]`; Teen Patti uses its dedicated `/api/teen-patti` round endpoint. Both run as Node.js route handlers and persist match state in MongoDB across function invocations.

After deployment, `POST /api/gameplay/racing` without an authenticated session should return `401`, not `404`, and no browser request should be made to `/race-socket`.

## JazzCash and Easypaisa payment review

Deposits and withdrawals now use a manual, audited workflow for wallet number `03247964287`:

- A deposit user selects JazzCash or Easypaisa, sends the exact amount, then submits the sending mobile number, provider transaction ID, and a JPG/PNG/WebP receipt screenshot (maximum 4 MB).
- The server validates the image signature, normalizes the mobile number and transaction ID, stores the receipt in a non-public database field, and rejects reused transaction IDs or identical deposit receipts.
- A deposit stays pending and does not affect the wallet until an administrator confirms the transaction in the real provider account history, matches the amount and receiving account, and matches the receipt details.
- A withdrawal reserves only withdrawable cash credit. The user supplies the JazzCash/Easypaisa account title and mobile number; the administrator sends the payout, records the payout transaction ID and receipt, completes every verification check, and then marks it paid.
- Rejecting or cancelling a withdrawal returns the reserved balance atomically. Submitted deposits cannot be cancelled while payment review may be in progress.

Receipt images are available only through the authenticated admin proof endpoint and are returned with no-store and content-sniffing protection. Screenshots are supporting evidence, not authoritative confirmation: administrators must verify each transaction in the relevant JazzCash/Easypaisa account or merchant history before approval.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
```

Platform credits are virtual and non-transferable. Any future real-money mode must remain separated behind jurisdiction-specific compliance and configuration rather than being embedded in race logic.

Welcome and referral rewards are promotional game credits, not withdrawable cash. Game rewards funded by promotional credit remain promotional. Real-money wagering or withdrawals must not be enabled without jurisdiction-specific legal approval, age/identity controls, and clearly published wagering and withdrawal terms.
