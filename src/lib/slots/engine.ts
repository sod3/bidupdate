import { VERY_HARD_DIFFICULTY_VERSION, VERY_HARD_PLAYER_TARGET_WIN_PERCENT } from "@/lib/gameDifficulty";

export const SLOT_STAKES = [10, 25, 50, 100, 250, 500] as const;
export const SLOT_TARGET_WIN_PERCENT = VERY_HARD_PLAYER_TARGET_WIN_PERCENT;
export const SLOT_RNG_VERSION = `slots-v3-five-reel-${VERY_HARD_DIFFICULTY_VERSION}`;

export type SlotStake = (typeof SLOT_STAKES)[number];
export type SlotSymbolId = "COIN" | "EMERALD" | "RUBY" | "BELL" | "STAR" | "CROWN" | "CHEST" | "SEVEN" | "WILD" | "BONUS";
export type SlotGrid = [
  [SlotSymbolId, SlotSymbolId, SlotSymbolId, SlotSymbolId, SlotSymbolId],
  [SlotSymbolId, SlotSymbolId, SlotSymbolId, SlotSymbolId, SlotSymbolId],
  [SlotSymbolId, SlotSymbolId, SlotSymbolId, SlotSymbolId, SlotSymbolId],
];
export type SlotCell = readonly [row: number, column: number];
export type SlotRandomIndex = (maxExclusive: number) => number;

export interface SlotSymbolDefinition {
  id: SlotSymbolId;
  label: string;
  glyph: string;
  weight: number;
  multiplier: number;
}

export interface SlotPayline {
  id: number;
  label: string;
  cells: readonly [SlotCell, SlotCell, SlotCell, SlotCell, SlotCell];
}

export interface SlotWinningLine {
  id: number;
  label: string;
  symbol: SlotSymbolId;
  multiplier: number;
  cells: readonly [SlotCell, SlotCell, SlotCell, SlotCell, SlotCell];
}

export interface SlotOutcome {
  grid: SlotGrid;
  winningLines: SlotWinningLine[];
  totalMultiplier: number;
  payout: number;
  result: "LOSS" | "WIN" | "JACKPOT";
}

export const SLOT_SYMBOLS: readonly SlotSymbolDefinition[] = [
  { id: "COIN", label: "Solar coin", glyph: "●", weight: 20, multiplier: 3 },
  { id: "EMERALD", label: "Emerald", glyph: "◆", weight: 16, multiplier: 4 },
  { id: "RUBY", label: "Ruby", glyph: "◆", weight: 15, multiplier: 5 },
  { id: "BELL", label: "Gold bell", glyph: "♢", weight: 12, multiplier: 7 },
  { id: "STAR", label: "Nova star", glyph: "★", weight: 10, multiplier: 9 },
  { id: "CROWN", label: "Crown", glyph: "♛", weight: 8, multiplier: 12 },
  { id: "CHEST", label: "Treasure chest", glyph: "▣", weight: 7, multiplier: 16 },
  { id: "SEVEN", label: "Red 7", glyph: "7", weight: 5, multiplier: 30 },
  { id: "WILD", label: "Wild", glyph: "W", weight: 4, multiplier: 40 },
  { id: "BONUS", label: "Bonus", glyph: "B", weight: 3, multiplier: 50 },
] as const;

export const SLOT_PAYLINES: readonly SlotPayline[] = [
  { id: 1, label: "Top", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: 2, label: "Middle", cells: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] },
  { id: 3, label: "Bottom", cells: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]] },
  { id: 4, label: "Crown", cells: [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]] },
  { id: 5, label: "Valley", cells: [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4]] },
] as const;

const symbolById = new Map(SLOT_SYMBOLS.map((symbol) => [symbol.id, symbol]));
const totalSymbolWeight = SLOT_SYMBOLS.reduce((total, symbol) => total + symbol.weight, 0);

function assertRandomIndex(value: number, maxExclusive: number) {
  if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
    throw new Error("Slot RNG returned an out-of-range index.");
  }
  return value;
}

export function weightedSlotSymbol(randomIndex: SlotRandomIndex): SlotSymbolId {
  let roll = assertRandomIndex(randomIndex(totalSymbolWeight), totalSymbolWeight);
  for (const symbol of SLOT_SYMBOLS) {
    if (roll < symbol.weight) return symbol.id;
    roll -= symbol.weight;
  }
  throw new Error("Slot symbol table is invalid.");
}

export function generateSlotGrid(randomIndex: SlotRandomIndex): SlotGrid {
  return [
    [weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex)],
    [weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex)],
    [weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex), weightedSlotSymbol(randomIndex)],
  ];
}

export function evaluateSlotGrid(grid: SlotGrid) {
  if (grid.length !== 3 || grid.some((row) => row.length !== 5)) throw new Error("A slot grid must be exactly 3 by 5.");
  if (grid.some((row) => row.some((symbol) => !symbolById.has(symbol)))) throw new Error("A slot grid contains an unknown symbol.");

  const winningLines = SLOT_PAYLINES.flatMap<SlotWinningLine>((payline) => {
    const symbols = payline.cells.map(([row, column]) => grid[row][column]);
    if (!symbols.every((symbol) => symbol === symbols[0])) return [];
    const definition = symbolById.get(symbols[0]);
    if (!definition) throw new Error("Winning slot symbol is missing from the paytable.");
    return [{
      id: payline.id,
      label: payline.label,
      symbol: definition.id,
      multiplier: definition.multiplier,
      cells: payline.cells,
    }];
  });
  return {
    winningLines,
    totalMultiplier: winningLines.reduce((total, line) => total + line.multiplier, 0),
  };
}

/**
 * Rolls the disclosed 10% win / 90% loss decision first. Winning rounds receive
 * one randomly selected complete payline; losing rounds are sampled until no
 * complete line exists. The server still owns every random choice and payout.
 */
export function createSlotOutcome(stake: SlotStake, randomIndex: SlotRandomIndex): SlotOutcome {
  if (!SLOT_STAKES.includes(stake)) throw new Error("Unsupported slot stake.");
  const targetWin = assertRandomIndex(randomIndex(100), 100) < SLOT_TARGET_WIN_PERCENT;
  if (targetWin) {
    const grid = generateSlotGrid(randomIndex);
    const payline = SLOT_PAYLINES[assertRandomIndex(randomIndex(SLOT_PAYLINES.length), SLOT_PAYLINES.length)];
    const symbol = weightedSlotSymbol(randomIndex);
    payline.cells.forEach(([row, column]) => { grid[row][column] = symbol; });
    const evaluation = evaluateSlotGrid(grid);
    const jackpot = evaluation.winningLines.some((line) => line.symbol === "SEVEN" || line.symbol === "BONUS");
    return {
      grid,
      winningLines: evaluation.winningLines,
      totalMultiplier: evaluation.totalMultiplier,
      payout: stake * evaluation.totalMultiplier,
      result: jackpot ? "JACKPOT" : "WIN",
    };
  }

  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const grid = generateSlotGrid(randomIndex);
    const evaluation = evaluateSlotGrid(grid);
    if (evaluation.totalMultiplier === 0) return { grid, winningLines: [], totalMultiplier: 0, payout: 0, result: "LOSS" };
  }
  throw new Error("A slot outcome could not be generated from the configured reel table.");
}
