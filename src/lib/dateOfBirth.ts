const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function createCalendarDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function formatDateOfBirthInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseDisplayDateOfBirth(value: string) {
  const match = DISPLAY_DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, month, day, year] = match;
  return createCalendarDate(Number(year), Number(month), Number(day));
}

export function dateOfBirthToIso(value: string) {
  const date = parseDisplayDateOfBirth(value);
  if (!date) return null;

  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDateOfBirth(value: string) {
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  return createCalendarDate(Number(year), Number(month), Number(day));
}

export function isAtLeastAge(dateOfBirth: Date, minimumAge: number, now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();
  let age = currentYear - dateOfBirth.getUTCFullYear();

  const birthdayHasPassed = currentMonth > dateOfBirth.getUTCMonth()
    || (currentMonth === dateOfBirth.getUTCMonth() && currentDay >= dateOfBirth.getUTCDate());
  if (!birthdayHasPassed) age -= 1;

  return age >= minimumAge;
}
