/**
 * QuickBooks address and name parsing helpers.
 * - Address: Prefer BillAddr.City/State/PostalCode; never use Line1 as city.
 * - Name: Handle joint names (e.g. "Timothy and Erin") for display_name and household_greeting.
 */

export type QBBillAddr = {
  Line1?: string;
  Line2?: string;
  Line3?: string;
  Line4?: string;
  Line5?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
  Country?: string;
};

export type QBCustomerName = {
  DisplayName?: string;
  GivenName?: string;
  FamilyName?: string;
};

/** Regex to detect "City, ST Zip" or "City, State Zip" in Line3 (e.g. "Eau Claire, WI 54701"). */
const LINE3_CITY_STATE_ZIP =
  /^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/;

/**
 * Get city, state, zip from BillAddr.
 * Priority 1: Use BillAddr.City, CountrySubDivisionCode, PostalCode.
 * Priority 2: If City is empty, try to parse Line3 as "City, ST Zip".
 * Never use Line1 (street) as city.
 */
export function getCityStateZipFromBillAddr(billAddr: QBBillAddr | null | undefined): {
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  if (!billAddr) return { city: null, state: null, zip: null };

  const fromFields =
    (billAddr.City?.trim() ?? "") !== ""
      ? {
          city: billAddr.City?.trim() ?? null,
          state: (billAddr.CountrySubDivisionCode?.trim() ?? "") !== "" ? billAddr.CountrySubDivisionCode!.trim() : null,
          zip: (billAddr.PostalCode?.trim() ?? "") !== "" ? billAddr.PostalCode!.trim() : null,
        }
      : null;

  if (fromFields) return fromFields;

  const line3 = (billAddr.Line3 ?? "").trim();
  const match = line3 ? line3.match(LINE3_CITY_STATE_ZIP) : null;
  if (match) {
    return {
      city: match[1].trim() || null,
      state: match[2].trim().toUpperCase() || null,
      zip: match[3].trim() || null,
    };
  }

  return { city: null, state: null, zip: null };
}

/**
 * Build full billing address string for display/geocode.
 * Street lines (Line1–Line5) only; then City, State, Zip from fields or parsed Line3.
 * When Line3 was parsed as "City, ST Zip", it is not repeated in street lines.
 * Never put Line1 into the city position.
 */
export function stringifyBillAddr(billAddr: QBBillAddr | null | undefined): string {
  if (!billAddr) return "";

  const { city, state, zip } = getCityStateZipFromBillAddr(billAddr);
  const line3UsedForCity =
    !(billAddr.City?.trim() ?? "") &&
    (billAddr.Line3 ?? "").trim().length > 0 &&
    (billAddr.Line3 ?? "").trim().match(LINE3_CITY_STATE_ZIP) != null;

  const streetLines = [
    billAddr.Line1,
    billAddr.Line2,
    line3UsedForCity ? undefined : billAddr.Line3,
    billAddr.Line4,
    billAddr.Line5,
  ].filter((x): x is string => !!x && typeof x === "string" && x.trim().length > 0);

  const cityLine =
    [city, state, zip].filter(Boolean).join(", ");
  const parts = [...streetLines, cityLine, billAddr.Country].filter(
    (x) => !!x && String(x).trim().length > 0
  );
  return parts.join(", ");
}

/** Check if GivenName looks like a joint/household name (e.g. "Timothy and Erin"). */
function isJointName(givenName: string | null | undefined): boolean {
  if (!givenName || typeof givenName !== "string") return false;
  const t = givenName.trim();
  return /\s+and\s+/i.test(t) || /\s+&\s+/.test(t);
}

/**
 * Resolve display_name and household_greeting from QB customer name fields.
 * - If GivenName contains " & " or " and ", use it for both display_name and household_greeting.
 * - Otherwise use DisplayName (or GivenName + FamilyName) for display_name; household_greeting = null.
 */
export function parseDisplayNameAndHousehold(customer: QBCustomerName): {
  display_name: string | null;
  household_greeting: string | null;
} {
  const given = (customer.GivenName ?? "").trim();
  const family = (customer.FamilyName ?? "").trim();
  const display = (customer.DisplayName ?? "").trim();

  if (isJointName(given)) {
    const joint = given;
    return {
      display_name: joint || display || null,
      household_greeting: joint || null,
    };
  }

  const fallbackName = display || [given, family].filter(Boolean).join(" ").trim() || null;
  return {
    display_name: fallbackName,
    household_greeting: null,
  };
}

/**
 * Split a full name into first_name and last_name.
 * - "Timothy and Erin Smith" → first_name = "Timothy and Erin", last_name = "Smith"
 * - "John Smith" → first_name = "John", last_name = "Smith"
 * - Single word "Smith" → first_name = "Smith", last_name = null
 */
export function parseFirstAndLastNameFromDisplay(displayName: string | null | undefined): {
  first_name: string | null;
  last_name: string | null;
} {
  const s = (displayName ?? "").trim();
  if (!s) return { first_name: null, last_name: null };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0]!, last_name: null };
  const last = parts[parts.length - 1]!;
  const first = parts.slice(0, -1).join(" ");
  return { first_name: first || null, last_name: last || null };
}

/**
 * Get first_name and last_name for a QB customer.
 * Prefer GivenName + FamilyName when both present; otherwise parse from display_name.
 */
export function parseFirstAndLastName(
  customer: QBCustomerName,
  displayName: string | null
): { first_name: string | null; last_name: string | null } {
  const given = (customer.GivenName ?? "").trim();
  const family = (customer.FamilyName ?? "").trim();
  if (given && family) {
    return { first_name: given, last_name: family };
  }
  if (given && !family) {
    return parseFirstAndLastNameFromDisplay(given);
  }
  return parseFirstAndLastNameFromDisplay(displayName);
}
