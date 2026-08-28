export const PREMIUM_GAME_IDS = [
  "royal-roulette",
  "thunder-gods",
  "car-roulette",
  "red-vs-black",
  "sic-bo",
  "flight-x",
  "dragon-tiger",
  "money-machine",
] as const;

export type PremiumGameId = (typeof PREMIUM_GAME_IDS)[number];
export type PremiumGameMode = "roulette" | "tumble" | "car-wheel" | "card-duel" | "dice" | "crash" | "dragon-tiger" | "reels";

export interface PremiumBetOption {
  id: string;
  label: string;
  payout: string;
  tone?: "red" | "black" | "green" | "gold" | "violet" | "cyan";
  group?: string;
}

export interface PremiumGameDefinition {
  id: PremiumGameId;
  title: string;
  kicker: string;
  icon: string;
  mode: PremiumGameMode;
  thumbnail: string;
  accent: string;
  accent2: string;
  minStake: number;
  maxStake: number;
  chips: readonly number[];
  animationMs: number;
  loadingLines: readonly string[];
  options: readonly PremiumBetOption[];
  rules: readonly string[];
  probabilityNote: string;
}

const chips = [20, 50, 100, 200, 500, 1000, 2000, 5000] as const;
const rouletteReds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const rouletteNumbers: PremiumBetOption[] = Array.from({ length: 37 }, (_, number) => ({
  id: `N_${number}`,
  label: String(number),
  payout: "36× return",
  tone: number === 0 ? "green" : rouletteReds.has(number) ? "red" : "black",
  group: "Numbers",
}));

export const premiumGameDefinitions: Record<PremiumGameId, PremiumGameDefinition> = {
  "royal-roulette": {
    id: "royal-roulette",
    title: "Royal Roulette",
    kicker: "The Crown Table",
    icon: "♛",
    mode: "roulette",
    thumbnail: "/images/games/royal-roulette.webp",
    accent: "#f5c451",
    accent2: "#10b981",
    minStake: 20,
    maxStake: 5000,
    chips,
    animationMs: 4700,
    loadingLines: ["Polishing the wheel…", "Setting the crown table…", "Balancing the ivory ball…"],
    options: [
      ...rouletteNumbers,
      { id: "RED", label: "RED", payout: "2× return", tone: "red", group: "Outside" },
      { id: "BLACK", label: "BLACK", payout: "2× return", tone: "black", group: "Outside" },
      { id: "ODD", label: "ODD", payout: "2× return", tone: "gold", group: "Outside" },
      { id: "EVEN", label: "EVEN", payout: "2× return", tone: "gold", group: "Outside" },
      { id: "LOW", label: "1–18", payout: "2× return", tone: "green", group: "Outside" },
      { id: "HIGH", label: "19–36", payout: "2× return", tone: "green", group: "Outside" },
      { id: "DOZEN_1", label: "1ST 12", payout: "3× return", tone: "violet", group: "Dozens" },
      { id: "DOZEN_2", label: "2ND 12", payout: "3× return", tone: "violet", group: "Dozens" },
      { id: "DOZEN_3", label: "3RD 12", payout: "3× return", tone: "violet", group: "Dozens" },
      { id: "COLUMN_1", label: "COL 1", payout: "3× return", tone: "cyan", group: "Columns" },
      { id: "COLUMN_2", label: "COL 2", payout: "3× return", tone: "cyan", group: "Columns" },
      { id: "COLUMN_3", label: "COL 3", payout: "3× return", tone: "cyan", group: "Columns" },
    ],
    rules: [
      "Place one or more chips on numbers or outside selections while betting is open.",
      "A straight number returns 36× its chip. Red/Black, Odd/Even and ranges return 2×. Dozens and columns return 3×.",
      "Zero is green and does not count as Red, Black, Odd, Even, Low or High.",
    ],
    probabilityNote: "European single-zero wheel: each number has a 1 in 37 chance. Published returns include the original stake.",
  },
  "thunder-gods": {
    id: "thunder-gods",
    title: "Thunder Gods",
    kicker: "Stormfall Tumbles",
    icon: "ϟ",
    mode: "tumble",
    thumbnail: "/images/games/thunder-gods.webp",
    accent: "#72e7ff",
    accent2: "#9b6cff",
    minStake: 20,
    maxStake: 5000,
    chips,
    animationMs: 3900,
    loadingLines: ["Charging storm runes…", "Calling the guardian…", "Lifting the sky temple…"],
    options: [{ id: "SPIN", label: "SPIN", payout: "Cluster pays", tone: "violet" }],
    rules: [
      "Choose a stake and spin the 6 × 5 storm grid.",
      "Eight or more matching symbols anywhere on the grid form a cluster and tumble away.",
      "Rune multipliers can amplify a winning tumble. The complete result is locked by the server before animation.",
    ],
    probabilityNote: "Symbol weights, cluster thresholds and the maximum 100× round return are applied server-side and recorded with every round.",
  },
  "car-roulette": {
    id: "car-roulette",
    title: "Car Roulette",
    kicker: "Neon Circuit",
    icon: "⌁",
    mode: "car-wheel",
    thumbnail: "/images/games/car-roulette.webp",
    accent: "#57e6ff",
    accent2: "#ff48bd",
    minStake: 20,
    maxStake: 5000,
    chips,
    animationMs: 4300,
    loadingLines: ["Warming the circuit…", "Charging nitro cells…", "Lighting the selector…"],
    options: [
      { id: "FALCON_X", label: "FALCON X", payout: "2× return", tone: "cyan" },
      { id: "VORTEX_R", label: "VORTEX R", payout: "3× return", tone: "violet" },
      { id: "PHANTOM_GT", label: "PHANTOM GT", payout: "4× return", tone: "black" },
      { id: "RAZOR_X", label: "RAZOR X", payout: "6× return", tone: "red" },
      { id: "NEBULA_RS", label: "NEBULA RS", payout: "9× return", tone: "violet" },
      { id: "HYPERION", label: "HYPERION", payout: "12× return", tone: "gold" },
    ],
    rules: [
      "Place chips on one or more fictional vehicles before the selector launches.",
      "The vehicle under the final gold beam wins. Each card shows its total return.",
      "Vehicle frequency and payout are defined together and audited for each round.",
    ],
    probabilityNote: "Higher-return cars appear less often. Exact configured weights are stored in the round RNG record.",
  },
  "red-vs-black": {
    id: "red-vs-black",
    title: "Red vs Black",
    kicker: "Kingdoms at War",
    icon: "◆",
    mode: "card-duel",
    thumbnail: "/images/games/red-vs-black.webp",
    accent: "#ff4b55",
    accent2: "#b794ff",
    minStake: 20,
    maxStake: 5000,
    chips,
    animationMs: 3800,
    loadingLines: ["Opening the throne hall…", "Shuffling the royal deck…", "Summoning both kingdoms…"],
    options: [
      { id: "RED", label: "RED", payout: "1.95× return", tone: "red" },
      { id: "BLACK", label: "BLACK", payout: "1.95× return", tone: "black" },
      { id: "PAIR", label: "PAIR", payout: "4× return", tone: "gold" },
      { id: "HIGH_CARD", label: "HIGH CARD", payout: "1.4× return", tone: "cyan" },
      { id: "STRAIGHT", label: "STRAIGHT", payout: "8× return", tone: "violet" },
      { id: "FLUSH", label: "FLUSH", payout: "6× return", tone: "green" },
    ],
    rules: [
      "Red Kingdom and Black Kingdom each receive three cards.",
      "Hand rank decides the duel: straight flush, three of a kind, straight, flush, pair, then high card.",
      "Side selections win when either kingdom reveals the selected hand type.",
    ],
    probabilityNote: "Cards are drawn without replacement from one server-shuffled 52-card deck. A tied hand pushes Red and Black selections.",
  },
  "sic-bo": {
    id: "sic-bo",
    title: "Sic Bo",
    kicker: "Jade Chamber",
    icon: "⬡",
    mode: "dice",
    thumbnail: "/images/games/sic-bo.webp",
    accent: "#f6cf62",
    accent2: "#15c993",
    minStake: 20,
    maxStake: 5000,
    chips,
    animationMs: 3600,
    loadingLines: ["Sealing the jade chamber…", "Balancing the dice…", "Illuminating the table…"],
    options: [
      { id: "BIG", label: "BIG 11–17", payout: "2× return", tone: "red", group: "Main" },
      { id: "SMALL", label: "SMALL 4–10", payout: "2× return", tone: "green", group: "Main" },
      { id: "ODD", label: "ODD", payout: "2× return", tone: "violet", group: "Main" },
      { id: "EVEN", label: "EVEN", payout: "2× return", tone: "gold", group: "Main" },
      ...Array.from({ length: 14 }, (_, index) => ({ id: `TOTAL_${index + 4}`, label: `TOTAL ${index + 4}`, payout: index + 4 === 10 || index + 4 === 11 ? "7× return" : "12× return", tone: "cyan" as const, group: "Totals" })),
      ...Array.from({ length: 6 }, (_, index) => ({ id: `DOUBLE_${index + 1}`, label: `DOUBLE ${index + 1}`, payout: "11× return", tone: "violet" as const, group: "Doubles" })),
      { id: "ANY_TRIPLE", label: "ANY TRIPLE", payout: "31× return", tone: "red", group: "Triples" },
    ],
    rules: [
      "Three dice are rolled inside the chamber after betting closes.",
      "Big and Small lose on any triple. Odd and Even use the total and also lose on any triple.",
      "Totals, doubles and any triple use the returns shown on their table areas.",
    ],
    probabilityNote: "All three dice are independently generated from a committed server seed. Returns shown include the original stake.",
  },
  "flight-x": {
    id: "flight-x",
    title: "Flight X",
    kicker: "Beyond the Horizon",
    icon: "✦",
    mode: "crash",
    thumbnail: "/images/games/flight-x.webp",
    accent: "#64dcff",
    accent2: "#ffb04a",
    minStake: 20,
    maxStake: 5000,
    chips,
    animationMs: 0,
    loadingLines: ["Calibrating the flight path…", "Spooling the engines…", "Locking the round seed…"],
    options: [{ id: "FLIGHT", label: "LAUNCH", payout: "Cash-out multiplier", tone: "cyan" }],
    rules: [
      "Choose a stake and launch at 1.00×.",
      "Press Cash Out before the aircraft reaches its hidden end point. Your return is stake × current multiplier.",
      "The end point is locked and committed before launch. Refreshing reconnects to the same round.",
    ],
    probabilityNote: "Flight endpoints follow the disclosed seeded curve with a 3% mathematical edge and a 100× cap. The seed is revealed after settlement for audit.",
  },
  "dragon-tiger": {
    id: "dragon-tiger",
    title: "Dragon Tiger",
    kicker: "Temple Duel",
    icon: "☯",
    mode: "dragon-tiger",
    thumbnail: "/images/games/dragon-tiger.webp",
    accent: "#45edb0",
    accent2: "#f3c969",
    minStake: 20,
    maxStake: 5000,
    chips,
    animationMs: 3300,
    loadingLines: ["Opening the moon temple…", "Shuffling the duel deck…", "Calling the guardians…"],
    options: [
      { id: "DRAGON", label: "DRAGON", payout: "1.95× return", tone: "green" },
      { id: "TIE", label: "TIE", payout: "9× return", tone: "gold" },
      { id: "TIGER", label: "TIGER", payout: "1.95× return", tone: "violet" },
    ],
    rules: [
      "Dragon and Tiger each receive one card. Ace is low; King is high.",
      "The higher rank wins. Suits do not matter.",
      "A tie pays the Tie selection. Dragon and Tiger selections push on a tie.",
    ],
    probabilityNote: "Two cards are drawn without replacement from one server-shuffled deck. Published returns include the original stake.",
  },
  "money-machine": {
    id: "money-machine",
    title: "Money Machine",
    kicker: "Vaultworks No. 5",
    icon: "✺",
    mode: "reels",
    thumbnail: "/images/games/money-machine.webp",
    accent: "#ffd566",
    accent2: "#20cf8b",
    minStake: 20,
    maxStake: 5000,
    chips,
    animationMs: 3900,
    loadingLines: ["Pressurizing the vault…", "Aligning five reels…", "Charging the bonus wheel…"],
    options: [{ id: "SPIN", label: "SPIN", payout: "20 fixed lines", tone: "gold" }],
    rules: [
      "Choose a stake and spin five mechanical reels across 20 fixed lines.",
      "Three or more matching symbols from the left award a line return. Wild stars substitute for standard symbols.",
      "Three Bonus gifts unlock the Money Wheel and increase the same server-locked round return.",
    ],
    probabilityNote: "Reel strips, line wins, bonus values and the maximum 100× round return are enforced and recorded server-side.",
  },
};

export function isPremiumGameId(value: string): value is PremiumGameId {
  return PREMIUM_GAME_IDS.includes(value as PremiumGameId);
}

export function premiumGame(id: PremiumGameId) {
  return premiumGameDefinitions[id];
}

