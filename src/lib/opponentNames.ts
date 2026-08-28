export const FICTIONAL_OPPONENT_NAMES = [
  "Ayaan Voss",
  "Mira Vale",
  "Zoya Flint",
  "Kian Rook",
  "Nyla Soren",
  "Rafi Arden",
  "Lina Marlow",
  "Sami Riven",
  "Tara Quinn",
  "Noor Vega",
  "Ari Kestrel",
  "Hana Solis",
  "Ilyas Rune",
  "Maya Corin",
  "Omar Vail",
  "Zain Orra",
  "Leena Frost",
  "Rayen Knox",
  "Sora Venn",
  "Dani Rowan",
  "Imran Hale",
  "Nora Syl",
  "Kareem Pike",
  "Alina Wren",
] as const;

export function fictionalOpponentNameAt(index: number, excludedNames: string[] = []) {
  const excluded = new Set(excludedNames.map((name) => name.trim().toLocaleLowerCase()).filter(Boolean));
  const available = FICTIONAL_OPPONENT_NAMES.filter((name) => !excluded.has(name.toLocaleLowerCase()));
  const pool = available.length > 0 ? available : [...FICTIONAL_OPPONENT_NAMES];
  const normalizedIndex = Number.isFinite(index) ? Math.abs(Math.trunc(index)) % pool.length : 0;
  return pool[normalizedIndex];
}
