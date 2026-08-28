import { describe, expect, it } from "vitest";
import {
  dateOfBirthToIso,
  formatDateOfBirthInput,
  isAtLeastAge,
  parseDisplayDateOfBirth,
  parseIsoDateOfBirth,
} from "@/lib/dateOfBirth";

describe("date of birth helpers", () => {
  it("formats digits for the mobile date field", () => {
    expect(formatDateOfBirthInput("08242000")).toBe("08/24/2000");
    expect(formatDateOfBirthInput("08/2")).toBe("08/2");
    expect(formatDateOfBirthInput("08-24-2000 extra")).toBe("08/24/2000");
  });

  it("accepts real calendar dates and rejects impossible ones", () => {
    expect(parseDisplayDateOfBirth("02/29/2000")).not.toBeNull();
    expect(parseDisplayDateOfBirth("02/29/2001")).toBeNull();
    expect(parseDisplayDateOfBirth("13/01/2000")).toBeNull();
    expect(parseDisplayDateOfBirth("2/1/2000")).toBeNull();
  });

  it("converts the displayed date to an unambiguous API date", () => {
    expect(dateOfBirthToIso("08/24/2000")).toBe("2000-08-24");
    expect(parseIsoDateOfBirth("2000-08-24")?.toISOString()).toBe("2000-08-24T00:00:00.000Z");
    expect(parseIsoDateOfBirth("2000-02-30")).toBeNull();
  });

  it("checks the eighteenth birthday exactly", () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    expect(isAtLeastAge(parseDisplayDateOfBirth("08/24/2008")!, 18, now)).toBe(true);
    expect(isAtLeastAge(parseDisplayDateOfBirth("08/25/2008")!, 18, now)).toBe(false);
  });
});
