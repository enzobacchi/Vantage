/**
 * Deterministic sample organisation for local development, speed testing and
 * partner sandboxes. Pure: no I/O, no clock, no Math.random — the same options
 * always produce the same rows. Shaped like a mid-size nonprofit (about 3,000
 * donors and 2,800 gifts a year) so it exercises every query past PostgREST's
 * 1,000-row cap.
 */

export type SampleOptions = {
  seed: number
  today: Date
  orgId: string
  donorCount?: number
}

export type SampleDonor = {
  id: string
  org_id: string
  display_name: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string
  donor_type: "individual" | "corporate" | "school" | "church"
  billing_address: string
  city: string
  state: string
  zip: string
  location_lat: number
  location_lng: number
  total_lifetime_value: number
  last_donation_date: string | null
  last_donation_amount: number | null
  acquisition_source: string
  created_at: string
}

export type SampleDonation = {
  id: string
  org_id: string
  donor_id: string
  amount: number
  date: string
  payment_method: "check" | "cash" | "online" | "ach" | "credit_card" | "daf" | "wire"
  campaign_id: string | null
  fund_id: string | null
  category_id: string | null
  source: "sample"
}

export type SampleInteraction = {
  id: string
  donor_id: string
  type: "email" | "call" | "meeting" | "note" | "task"
  direction: "inbound" | "outbound" | null
  subject: string
  content: string
  date: string
  status: "pending" | "completed" | null
}

export type SampleOption = { id: string; org_id: string; type: "category" | "campaign" | "fund"; name: string; sort_order: number }
export type SampleOpportunity = {
  id: string
  organization_id: string
  donor_id: string
  title: string
  amount: number
  status: "identified" | "qualified" | "solicited" | "committed"
  expected_date: string
}

export type SampleOrg = {
  donors: SampleDonor[]
  donations: SampleDonation[]
  interactions: SampleInteraction[]
  options: SampleOption[]
  opportunities: SampleOpportunity[]
  /** The $200k, $50k and $10k-a-year donors, in that order. */
  majorDonorIds: [string, string, string]
}

const FIRST = ["Vanessa", "John", "Matt", "Grace", "Daniel", "Maria", "Samuel", "Ruth", "Caleb", "Naomi", "Elijah", "Hannah", "Peter", "Lydia", "Marcus", "Esther", "Andre", "Priya", "Luis", "Joy", "Owen", "Clara", "Isaac", "Tessa"]
const LAST = ["Whitfield", "Okafor", "Brandt", "Delgado", "Sorensen", "Nakamura", "Abernathy", "Castellano", "Lindqvist", "Mbeki", "Hartwell", "Dubois", "Kowalczyk", "Ferreira", "Stavros", "Underhill", "Pemberton", "Achterberg", "Quintero", "Yoon", "Varga", "Rasmussen", "Ellery", "Tanaka"]
const ORG_WORDS = ["Riverbend", "Cedar Hill", "Lakeshore", "Northgate", "Harbor", "Summit", "Maple Grove", "Stonebridge"]
const ORG_KINDS: Record<"corporate" | "school" | "church", string[]> = {
  corporate: ["Foods", "Builders", "Family Foundation", "Dental Group", "Logistics"],
  school: ["Academy", "Christian School"],
  church: ["Community Church", "Fellowship", "Chapel"],
}
// City, state, zip, lat, lng — mostly Central Florida, with a spread across the US for the map.
const PLACES: [string, string, string, number, number][] = [
  ["Orlando", "FL", "32801", 28.538, -81.379],
  ["Winter Park", "FL", "32789", 28.6, -81.339],
  ["Longwood", "FL", "32750", 28.703, -81.338],
  ["Kissimmee", "FL", "34741", 28.292, -81.408],
  ["Apopka", "FL", "32703", 28.676, -81.512],
  ["Sanford", "FL", "32771", 28.8, -81.273],
  ["Tampa", "FL", "33602", 27.951, -82.457],
  ["Nashville", "TN", "37203", 36.163, -86.781],
  ["Atlanta", "GA", "30303", 33.749, -84.388],
  ["Berrien Springs", "MI", "49103", 41.946, -86.339],
  ["Loma Linda", "CA", "92354", 34.048, -117.261],
  ["Denver", "CO", "80202", 39.739, -104.99],
  ["Dallas", "TX", "75201", 32.777, -96.797],
  ["Silver Spring", "MD", "20910", 38.991, -77.026],
]
const METHODS: SampleDonation["payment_method"][] = ["online", "online", "online", "credit_card", "ach", "check", "check", "cash", "daf"]
const SUBJECTS: Record<Exclude<SampleInteraction["type"], "task">, string[]> = {
  email: ["Thank-you note", "Year-end update", "Shared a guest story"],
  call: ["Check-in call", "Thanked for recent gift"],
  meeting: ["Coffee", "Site visit", "Lunch"],
  note: ["Met family at outreach night", "Prefers email over phone"],
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100

export function generateSampleOrg({ seed, today, orgId, donorCount = 3000 }: SampleOptions): SampleOrg {
  const rand = rng(seed)
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join("")
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(rand() * 4)]}${hex(3)}-${hex(12)}`

  const endYear = today.getUTCFullYear()
  const startYear = endYear - 2
  const todayIso = iso(today)
  const windowStart = Date.UTC(startYear, 0, 1)
  const windowDays = Math.floor((today.getTime() - windowStart) / 86_400_000)
  const dayInWindow = (offset: number) => iso(new Date(windowStart + offset * 86_400_000))
  /** A date in the given calendar year, never after `today`. Skewed toward year-end, like real giving. */
  const dateInYear = (year: number) => {
    const month = rand() < 0.3 ? int(10, 11) : int(0, 11)
    const candidate = iso(new Date(Date.UTC(year, month, int(1, 28))))
    return candidate > todayIso ? dayInWindow(int(windowDays - 60, windowDays)) : candidate
  }

  const option = (type: SampleOption["type"], name: string, sort_order: number): SampleOption => ({ id: uuid(), org_id: orgId, type, name, sort_order })
  const campaigns = ["Church Giving", "Corporate Giving", "Year-End Appeal", "Monthly Partners"].map((n, i) => option("campaign", n, i))
  const funds = ["General Fund", "Outreach Meals", "Mobile Showers"].map((n, i) => option("fund", n, i))
  const categories = ["Individual", "Major Gift", "Grant"].map((n, i) => option("category", n, i))
  const options = [...campaigns, ...funds, ...categories]

  const donors: SampleDonor[] = []
  const donations: SampleDonation[] = []
  const interactions: SampleInteraction[] = []
  const opportunities: SampleOpportunity[] = []

  const gift = (donor: SampleDonor, amount: number, date: string, major = false) => {
    donations.push({
      id: uuid(),
      org_id: orgId,
      donor_id: donor.id,
      amount: round2(amount),
      date,
      payment_method: major ? pick(["check", "wire", "daf"] as const) : pick(METHODS),
      campaign_id: rand() < 0.6 ? pick(campaigns).id : null,
      fund_id: rand() < 0.5 ? pick(funds).id : null,
      category_id: major ? categories[1].id : rand() < 0.5 ? categories[0].id : null,
      source: "sample",
    })
  }

  const touch = (donor: SampleDonor, type: Exclude<SampleInteraction["type"], "task">, daysAgo: number) => {
    interactions.push({
      id: uuid(),
      donor_id: donor.id,
      type,
      direction: type === "note" ? null : rand() < 0.8 ? "outbound" : "inbound",
      subject: pick(SUBJECTS[type]),
      content: "",
      date: new Date(today.getTime() - daysAgo * 86_400_000).toISOString(),
      status: null,
    })
  }

  for (let i = 0; i < donorCount; i++) {
    const roll = rand()
    const donor_type: SampleDonor["donor_type"] = i < 3 ? "individual" : roll < 0.86 ? "individual" : roll < 0.93 ? "church" : roll < 0.98 ? "corporate" : "school"
    const first = i < 3 ? FIRST[i] : pick(FIRST)
    const last = pick(LAST)
    const display_name = donor_type === "individual" ? `${first} ${last}` : `${pick(ORG_WORDS)} ${pick(ORG_KINDS[donor_type])}`
    const [city, state, zip, lat, lng] = rand() < 0.7 ? PLACES[int(0, 6)] : pick(PLACES)
    const donor: SampleDonor = {
      id: uuid(),
      org_id: orgId,
      display_name,
      first_name: donor_type === "individual" ? first : null,
      last_name: donor_type === "individual" ? last : null,
      email: `donor${i + 1}@sample.vantage.test`,
      phone: `555-01${String(int(0, 99)).padStart(2, "0")}`,
      donor_type,
      billing_address: `${int(100, 9900)} ${pick(LAST)} ${pick(["St", "Ave", "Rd", "Ln"])}`,
      city,
      state,
      zip,
      location_lat: round2(lat + (rand() - 0.5) * 0.3),
      location_lng: round2(lng + (rand() - 0.5) * 0.3),
      total_lifetime_value: 0,
      last_donation_date: null,
      last_donation_amount: null,
      acquisition_source: pick(["event", "website", "referral", "church visit", "mail"]),
      created_at: new Date(windowStart + int(0, Math.max(0, windowDays - 30)) * 86_400_000).toISOString(),
    }
    donors.push(donor)

    if (i < 3) {
      // Whiteboard donors: one gift a year of $200k, $50k, $10k.
      const yearly = [200_000, 50_000, 10_000][i]
      for (let y = startYear; y <= endYear; y++) gift(donor, yearly, iso(new Date(Date.UTC(y, 2 + i, 15))), true)
      for (let t = 0; t < [9, 5, 2][i]; t++) touch(donor, pick(["meeting", "call", "email"] as const), int(5, 240))
      opportunities.push({ id: uuid(), organization_id: orgId, donor_id: donor.id, title: `${endYear + 1} major gift`, amount: yearly, status: (["qualified", "identified", "solicited"] as const)[i], expected_date: `${endYear + 1}-03-15` })
      continue
    }

    // Giving profile: lapsed/never (25%), occasional (47%), regular (23.5%), monthly (2%), mid-level (2.5%).
    const p = rand()
    if (p < 0.25) {
      if (rand() < 0.5) gift(donor, int(10, 150), dateInYear(startYear))
    } else if (p < 0.72) {
      for (let y = startYear; y <= endYear; y++) if (rand() < 0.75) gift(donor, pick([20, 25, 50, 50, 100, 250]), dateInYear(y))
    } else if (p < 0.955) {
      for (let y = startYear; y <= endYear; y++) for (let n = int(1, 2); n > 0; n--) gift(donor, pick([25, 50, 100, 100, 250, 500]), dateInYear(y))
    } else if (p < 0.975) {
      const amount = pick([25, 35, 50, 100])
      for (let y = startYear; y <= endYear; y++)
        for (let m = 0; m < 12; m++) {
          const date = iso(new Date(Date.UTC(y, m, 5)))
          if (date <= todayIso) gift(donor, amount, date)
        }
    } else {
      for (let y = startYear; y <= endYear; y++) for (let n = int(1, 2); n > 0; n--) gift(donor, pick([1000, 2500, 5000, 7500]), dateInYear(y), true)
      for (let t = int(1, 4); t > 0; t--) touch(donor, pick(["meeting", "call", "email"] as const), int(3, 300))
    }

    if (rand() < 0.3) touch(donor, pick(["email", "call", "note"] as const), int(1, 500))
    if (rand() < 0.04) {
      interactions.push({ id: uuid(), donor_id: donor.id, type: "task", direction: null, subject: `Follow up with ${display_name}`, content: "", date: new Date(today.getTime() + int(-20, 30) * 86_400_000).toISOString(), status: rand() < 0.3 ? "completed" : "pending" })
    }
  }

  // Stored totals must agree with the gifts (the app keeps these columns in sync on write).
  const byDonor = new Map(donors.map((d) => [d.id, d]))
  for (const g of donations) {
    const d = byDonor.get(g.donor_id)!
    d.total_lifetime_value = round2(d.total_lifetime_value + g.amount)
    if (d.last_donation_date === null || g.date >= d.last_donation_date) {
      d.last_donation_date = g.date
      d.last_donation_amount = g.amount
    }
  }

  return { donors, donations, interactions, options, opportunities, majorDonorIds: [donors[0].id, donors[1].id, donors[2].id] }
}
