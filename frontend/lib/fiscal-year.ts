/** ISO date (YYYY-MM-DD), without time. */
export type IsoDate = string;

/** Return YYYY-MM-DD in UTC for a given Date. */
function toIso(d: Date): IsoDate {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Fiscal year that contains `today`, given a 1-12 start month.
 * Returns the start year of that fiscal year (e.g., FY starting Jul 2025 → 2025).
 */
export function fiscalYearOf(today: Date, fiscalYearStartMonth: number): number {
  const month = today.getUTCMonth() + 1;
  return month >= fiscalYearStartMonth ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
}

/** Inclusive [start, end] dates for a fiscal year identified by its start year. */
export function fiscalYearRange(
  fiscalYearStartYear: number,
  fiscalYearStartMonth: number
): { start: IsoDate; end: IsoDate } {
  const start = new Date(Date.UTC(fiscalYearStartYear, fiscalYearStartMonth - 1, 1));
  const end = new Date(Date.UTC(fiscalYearStartYear + 1, fiscalYearStartMonth - 1, 1));
  end.setUTCDate(end.getUTCDate() - 1);
  return { start: toIso(start), end: toIso(end) };
}

/** Inclusive [start, end] dates for the calendar year containing `today`. */
export function calendarYearRange(today: Date): { start: IsoDate; end: IsoDate } {
  const y = today.getUTCFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export type PeriodPreset =
  | "this-fiscal-year"
  | "last-fiscal-year"
  | "this-calendar-year"
  | "custom";

/** Resolve a preset (or pre-supplied custom range) to concrete ISO dates. */
export function resolvePeriod(
  preset: PeriodPreset,
  fiscalYearStartMonth: number,
  custom?: { start?: string; end?: string },
  now: Date = new Date()
): { start: IsoDate; end: IsoDate } {
  switch (preset) {
    case "this-fiscal-year": {
      const fy = fiscalYearOf(now, fiscalYearStartMonth);
      return fiscalYearRange(fy, fiscalYearStartMonth);
    }
    case "last-fiscal-year": {
      const fy = fiscalYearOf(now, fiscalYearStartMonth);
      return fiscalYearRange(fy - 1, fiscalYearStartMonth);
    }
    case "this-calendar-year":
      return calendarYearRange(now);
    case "custom": {
      if (!custom?.start || !custom?.end) {
        throw new Error("Custom period requires start and end dates");
      }
      return { start: custom.start, end: custom.end };
    }
  }
}

/** Same length as [start, end], immediately preceding it. */
export function priorPeriod(start: IsoDate, end: IsoDate): { start: IsoDate; end: IsoDate } {
  const startD = new Date(`${start}T00:00:00Z`);
  const endD = new Date(`${end}T00:00:00Z`);
  const lengthDays = Math.round((endD.getTime() - startD.getTime()) / 86_400_000) + 1;
  const priorEnd = new Date(startD);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - (lengthDays - 1));
  return { start: toIso(priorStart), end: toIso(priorEnd) };
}

export function formatPeriodLabel(start: IsoDate, end: IsoDate): string {
  return `${start} – ${end}`;
}
