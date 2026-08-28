import assert from "node:assert/strict";

const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function main() {
  const [home, play, slots, teenPatti, pool, tower, archery, penalty, raceSession, poolSession, towerSession, archerySession, penaltySession, ...gameplay] = await Promise.all([
    fetch(origin),
    fetch(`${origin}/play`),
    fetch(`${origin}/play/777-slots`),
    fetch(`${origin}/play/teen-patti`),
    fetch(`${origin}/play/eight-ball`),
    fetch(`${origin}/play/tower-clash`),
    fetch(`${origin}/play/precision-arena`),
    fetch(`${origin}/play/penalty-kings`),
    fetch(`${origin}/api/neon-drift/session`, { method: "POST", headers: { origin } }),
    fetch(`${origin}/api/eight-ball/session`, { method: "POST", headers: { origin } }),
    fetch(`${origin}/api/tower-clash/session`, { method: "POST", headers: { origin } }),
    fetch(`${origin}/api/precision-arena/session`, { method: "POST", headers: { origin } }),
    fetch(`${origin}/api/penalty-kings/session`, { method: "POST", headers: { origin } }),
    ...["racing", "eight-ball", "tower-clash", "precision-arena", "penalty-kings"].map((game) => fetch(`${origin}/api/gameplay/${game}`, {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ action: "START" }),
    })),
  ]);
  assert.equal(home.status, 200, "homepage must render");
  assert.equal(play.status, 200, "competition tier page must render");
  assert.equal(slots.status, 200, "Nova 777 Slots must render");
  assert.equal(teenPatti.status, 200, "Teen Patti must render");
  assert.equal(pool.status, 200, "8 Ball Cash Arena must render");
  assert.equal(tower.status, 200, "Tower Clash must render");
  assert.equal(archery.status, 200, "Precision Arena must render");
  assert.equal(penalty.status, 200, "Penalty Kings must render");
  assert.equal(raceSession.status, 401, "anonymous race sessions must be rejected");
  assert.equal(poolSession.status, 401, "anonymous pool sessions must be rejected");
  assert.equal(towerSession.status, 401, "anonymous Tower Clash sessions must be rejected");
  assert.equal(archerySession.status, 401, "anonymous Precision Arena sessions must be rejected");
  assert.equal(penaltySession.status, 401, "anonymous Penalty Kings sessions must be rejected");
  for (const response of gameplay) assert.equal(response.status, 401, "anonymous serverless gameplay must be rejected");
  const homeHtml = await home.text();
  const slotsHtml = await slots.text();
  const teenPattiHtml = await teenPatti.text();
  const poolHtml = await pool.text();
  const towerHtml = await tower.text();
  const archeryHtml = await archery.text();
  const penaltyHtml = await penalty.text();
  assert.match(homeHtml, /Play Arena/);
  assert.match(homeHtml, /Precision Arena/);
  assert.match(homeHtml, /Penalty Kings/);
  assert.match(slotsHtml, /777 Slots|NOVA 777/i);
  assert.match(teenPattiHtml, /Teen Patti/i);
  assert.match(poolHtml, /8 Ball/i);
  assert.match(towerHtml, /TOWER CLASH/i);
  assert.match(archeryHtml, /PRECISION ARENA/i);
  assert.match(penaltyHtml, /PENALTY KINGS/i);
  assert.doesNotMatch(homeHtml, /Mines|Fortune Wheel/i);
  process.stdout.write("The game catalogue, seven core game pages, sessions, and serverless gameplay authorization checks passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
