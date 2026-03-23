/**
 * Seed a QuickBooks sandbox with realistic nonprofit/ministry data.
 *
 * Prerequisites:
 *   1. QB_ENVIRONMENT=sandbox in .env.local
 *   2. You've already connected to the sandbox via OAuth (tokens stored in DB)
 *
 * Usage:
 *   cd frontend && npx tsx scripts/seed-qb-sandbox.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
import { createClient } from "@supabase/supabase-js";
import OAuthClient from "intuit-oauth";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const QB_CLIENT_ID = process.env.QB_CLIENT_ID!;
const QB_CLIENT_SECRET = process.env.QB_CLIENT_SECRET!;
const QB_ENVIRONMENT = process.env.QB_ENVIRONMENT as "sandbox" | "production";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE env vars. Check .env.local");
  process.exit(1);
}
if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
  console.error("Missing QB_CLIENT_ID / QB_CLIENT_SECRET. Check .env.local");
  process.exit(1);
}
if (QB_ENVIRONMENT !== "sandbox") {
  console.error(
    `QB_ENVIRONMENT is "${QB_ENVIRONMENT}" — this script only runs against sandbox.`
  );
  process.exit(1);
}

const QB_BASE = "https://sandbox-quickbooks.api.intuit.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

let accessToken = "";
let refreshToken = "";
let realmId = "";
let orgId = "";

const oauthClient = new OAuthClient({
  clientId: QB_CLIENT_ID,
  clientSecret: QB_CLIENT_SECRET,
  environment: "sandbox",
  redirectUri: "http://localhost:3000/api/quickbooks/callback",
});

async function loadTokens() {
  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, qb_realm_id, qb_access_token, qb_refresh_token")
    .not("qb_realm_id", "is", null)
    .not("qb_refresh_token", "is", null)
    .limit(1)
    .single();

  if (error || !org) {
    console.error(
      "No org with QB sandbox connection found. Connect via OAuth first."
    );
    process.exit(1);
  }

  orgId = org.id;
  realmId = org.qb_realm_id!;
  accessToken = org.qb_access_token ?? "";
  refreshToken = org.qb_refresh_token!;

  oauthClient.setToken({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  console.log(`Loaded org=${orgId} realm=${realmId}`);
}

async function refreshTokens() {
  console.log("Refreshing QB tokens...");
  const refreshed = await oauthClient.refresh();
  const json = refreshed.getJson();
  accessToken = json.access_token;
  refreshToken = json.refresh_token;

  await supabase
    .from("organizations")
    .update({ qb_access_token: accessToken, qb_refresh_token: refreshToken })
    .eq("id", orgId);

  console.log("Tokens refreshed and saved.");
}

// ---------------------------------------------------------------------------
// QB API helper
// ---------------------------------------------------------------------------

async function qbApi<T = Record<string, unknown>>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  retry = true
): Promise<T> {
  const url = `${QB_BASE}/v3/company/${realmId}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry) {
    await refreshTokens();
    return qbApi(method, path, body, false);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`QB API ${method} ${path} failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

async function qbQuery<T>(entity: string, where?: string): Promise<T[]> {
  const query = `select * from ${entity}${where ? ` where ${where}` : ""} maxresults 1000`;
  const res = await qbApi<Record<string, { QueryResponse: Record<string, T[]> }>>(
    "GET",
    `query?query=${encodeURIComponent(query)}&minorversion=65`
  );
  const qr = (res as unknown as { QueryResponse: Record<string, T[]> }).QueryResponse;
  return qr[entity] ?? [];
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

type CustomerDef = {
  DisplayName: string;
  GivenName?: string;
  FamilyName?: string;
  PrimaryEmailAddr?: { Address: string };
  PrimaryPhone?: { FreeFormNumber: string };
  BillAddr?: {
    Line1: string;
    City: string;
    CountrySubDivisionCode: string;
    PostalCode: string;
  };
  ShipAddr?: {
    Line1: string;
    City: string;
    CountrySubDivisionCode: string;
    PostalCode: string;
  };
};

const CUSTOMERS: CustomerDef[] = [
  // --- Joint/household names ---
  {
    DisplayName: "Timothy and Erin Schappert",
    GivenName: "Timothy and Erin",
    FamilyName: "Schappert",
    PrimaryEmailAddr: { Address: "tschappert@gmail.com" },
    PrimaryPhone: { FreeFormNumber: "(555) 123-4567" },
    BillAddr: { Line1: "1234 Oak St", City: "Orlando", CountrySubDivisionCode: "FL", PostalCode: "32801" },
  },
  {
    DisplayName: "Robert & Susan Davis",
    GivenName: "Robert & Susan",
    FamilyName: "Davis",
    PrimaryEmailAddr: { Address: "rdavis@outlook.com" },
    PrimaryPhone: { FreeFormNumber: "(555) 234-5678" },
    BillAddr: { Line1: "456 Maple Ave", City: "Nashville", CountrySubDivisionCode: "TN", PostalCode: "37201" },
  },
  {
    DisplayName: "Pastor David and Rachel Kim",
    GivenName: "David and Rachel",
    FamilyName: "Kim",
    PrimaryEmailAddr: { Address: "dkim@gracechurch.org" },
    PrimaryPhone: { FreeFormNumber: "(555) 456-7890" },
    BillAddr: { Line1: "555 Church Ln", City: "Atlanta", CountrySubDivisionCode: "GA", PostalCode: "30301" },
  },
  {
    DisplayName: "Jennifer and Mark Robinson",
    GivenName: "Jennifer and Mark",
    FamilyName: "Robinson",
    PrimaryEmailAddr: { Address: "robinsons@gmail.com" },
    PrimaryPhone: { FreeFormNumber: "(555) 890-1234" },
    BillAddr: { Line1: "900 Willow Creek Dr", City: "Austin", CountrySubDivisionCode: "TX", PostalCode: "78701" },
  },

  // --- Simple individuals ---
  {
    DisplayName: "James D. Wilson",
    GivenName: "James D.",
    FamilyName: "Wilson",
    PrimaryEmailAddr: { Address: "jwilson@email.com" },
    BillAddr: { Line1: "789 Pine Rd", City: "Dallas", CountrySubDivisionCode: "TX", PostalCode: "75201" },
  },
  {
    DisplayName: "Maria Gonzalez",
    GivenName: "Maria",
    FamilyName: "Gonzalez",
    PrimaryEmailAddr: { Address: "mgonzalez@yahoo.com" },
    PrimaryPhone: { FreeFormNumber: "(555) 345-6789" },
    BillAddr: { Line1: "321 Elm St", City: "San Antonio", CountrySubDivisionCode: "TX", PostalCode: "78201" },
  },
  {
    DisplayName: "Michael Thompson",
    GivenName: "Michael",
    FamilyName: "Thompson",
    PrimaryEmailAddr: { Address: "mthompson@gmail.com" },
    PrimaryPhone: { FreeFormNumber: "(555) 567-8901" },
    BillAddr: { Line1: "100 Main St", City: "Charlotte", CountrySubDivisionCode: "NC", PostalCode: "28202" },
  },
  {
    DisplayName: "Sarah Johnson",
    GivenName: "Sarah",
    FamilyName: "Johnson",
    PrimaryPhone: { FreeFormNumber: "(555) 678-9012" },
    BillAddr: { Line1: "200 Broad St", City: "Richmond", CountrySubDivisionCode: "VA", PostalCode: "23219" },
  },
  {
    DisplayName: "Christopher Lee",
    GivenName: "Christopher",
    FamilyName: "Lee",
    PrimaryEmailAddr: { Address: "clee@email.com" },
    // No address — tests missing address handling
  },
  {
    DisplayName: "Patricia A Hernandez",
    GivenName: "Patricia A",
    FamilyName: "Hernandez",
    PrimaryEmailAddr: { Address: "phernandez@gmail.com" },
    PrimaryPhone: { FreeFormNumber: "(555) 789-0123" },
    BillAddr: { Line1: "400 5th Ave", City: "New York", CountrySubDivisionCode: "NY", PostalCode: "10018" },
  },

  // --- Organizations/churches ---
  {
    DisplayName: "Grace Community Church",
    PrimaryEmailAddr: { Address: "office@gracecommunity.org" },
    PrimaryPhone: { FreeFormNumber: "(555) 111-2222" },
    BillAddr: { Line1: "1000 Grace Way", City: "Colorado Springs", CountrySubDivisionCode: "CO", PostalCode: "80901" },
  },
  {
    DisplayName: "Smith Family Foundation",
    PrimaryEmailAddr: { Address: "grants@smithfoundation.org" },
    PrimaryPhone: { FreeFormNumber: "(555) 222-3333" },
    BillAddr: { Line1: "2000 Foundation Blvd Ste 300", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60601" },
  },
  {
    DisplayName: "First Baptist Church of Greenville",
    PrimaryEmailAddr: { Address: "admin@fbcgreenville.org" },
    PrimaryPhone: { FreeFormNumber: "(555) 333-4444" },
    BillAddr: { Line1: "500 Baptist Dr", City: "Greenville", CountrySubDivisionCode: "SC", PostalCode: "29601" },
  },
  {
    DisplayName: "Riverside Christian Academy",
    PrimaryEmailAddr: { Address: "giving@riversideca.edu" },
    BillAddr: { Line1: "750 Academy Rd", City: "Phoenix", CountrySubDivisionCode: "AZ", PostalCode: "85001" },
  },
  {
    DisplayName: "Mountain View Bible Fellowship",
    BillAddr: { Line1: "300 Mountain View Dr", City: "Denver", CountrySubDivisionCode: "CO", PostalCode: "80201" },
    // No email — tests missing email
  },

  // --- Edge cases ---
  {
    DisplayName: "Anonymous Giver",
    // No given/family name, no contact info, no address
  },
  {
    DisplayName: "The Martinez Family",
    FamilyName: "Martinez",
    PrimaryPhone: { FreeFormNumber: "(555) 444-5555" },
    BillAddr: { Line1: "600 Sunset Blvd", City: "Los Angeles", CountrySubDivisionCode: "CA", PostalCode: "90028" },
  },
  {
    DisplayName: "Dr. William Chen III",
    GivenName: "William",
    FamilyName: "Chen III",
    PrimaryEmailAddr: { Address: "wchen@email.com" },
    BillAddr: { Line1: "850 University Ave", City: "Palo Alto", CountrySubDivisionCode: "CA", PostalCode: "94301" },
  },
  {
    DisplayName: "Estate of Ruth Phillips",
    // No name parts — legacy estate
    BillAddr: { Line1: "1200 Heritage Ln", City: "Savannah", CountrySubDivisionCode: "GA", PostalCode: "31401" },
  },
  {
    DisplayName: "O'Brien, Patrick",
    GivenName: "Patrick",
    FamilyName: "O'Brien",
    PrimaryEmailAddr: { Address: "pobrien@email.com" },
    PrimaryPhone: { FreeFormNumber: "(555) 555-6666" },
    BillAddr: { Line1: "450 Shamrock Way", City: "Boston", CountrySubDivisionCode: "MA", PostalCode: "02101" },
  },
];

type ReceiptDef = {
  customerName: string;
  amount: number;
  date: string; // YYYY-MM-DD
  privateNote?: string;
  docNumber?: string;
};

const RECEIPTS: ReceiptDef[] = [
  // Timothy and Erin Schappert — monthly $500, 6 months
  { customerName: "Timothy and Erin Schappert", amount: 500, date: "2025-10-15" },
  { customerName: "Timothy and Erin Schappert", amount: 500, date: "2025-11-15" },
  { customerName: "Timothy and Erin Schappert", amount: 500, date: "2025-12-15" },
  { customerName: "Timothy and Erin Schappert", amount: 500, date: "2026-01-15" },
  { customerName: "Timothy and Erin Schappert", amount: 500, date: "2026-02-15" },
  { customerName: "Timothy and Erin Schappert", amount: 500, date: "2026-03-15", docNumber: "SR-2026-018" },

  // Robert & Susan Davis — monthly $250, 12 months
  { customerName: "Robert & Susan Davis", amount: 250, date: "2025-04-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2025-05-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2025-06-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2025-07-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2025-08-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2025-09-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2025-10-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2025-11-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2025-12-01", privateNote: "General Fund" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2026-01-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2026-02-01" },
  { customerName: "Robert & Susan Davis", amount: 250, date: "2026-03-01" },

  // Michael Thompson — monthly $100, 4 months
  { customerName: "Michael Thompson", amount: 100, date: "2025-12-05" },
  { customerName: "Michael Thompson", amount: 100, date: "2026-01-05" },
  { customerName: "Michael Thompson", amount: 100, date: "2026-02-05" },
  { customerName: "Michael Thompson", amount: 100, date: "2026-03-05", docNumber: "SR-2026-019" },

  // Grace Community Church — monthly $1000, 3 months
  { customerName: "Grace Community Church", amount: 1000, date: "2026-01-10", privateNote: "Monthly Partnership" },
  { customerName: "Grace Community Church", amount: 1000, date: "2026-02-10", privateNote: "Monthly Partnership" },
  { customerName: "Grace Community Church", amount: 1000, date: "2026-03-10", privateNote: "Monthly Partnership" },

  // Maria Gonzalez — sporadic
  { customerName: "Maria Gonzalez", amount: 50, date: "2025-01-20" },
  { customerName: "Maria Gonzalez", amount: 75, date: "2025-06-15" },
  { customerName: "Maria Gonzalez", amount: 100, date: "2025-12-22", privateNote: "Christmas Offering" },

  // Sarah Johnson — year-end only
  { customerName: "Sarah Johnson", amount: 1000, date: "2025-12-28", privateNote: "Year-End Gift" },

  // Patricia A Hernandez — semi-annual
  { customerName: "Patricia A Hernandez", amount: 200, date: "2025-03-15", docNumber: "SR-2025-005" },
  { customerName: "Patricia A Hernandez", amount: 200, date: "2025-09-15", docNumber: "SR-2025-012" },

  // Smith Family Foundation — annual grant
  { customerName: "Smith Family Foundation", amount: 10000, date: "2025-01-05", privateNote: "Annual Grant — General Operations" },

  // James D. Wilson — one-time large gift
  { customerName: "James D. Wilson", amount: 5000, date: "2025-11-10", privateNote: "Building Fund Campaign" },

  // Pastor David and Rachel Kim — year-end
  { customerName: "Pastor David and Rachel Kim", amount: 2500, date: "2025-12-30", privateNote: "Year-End Missions Offering" },

  // Christopher Lee — lapsed (>12mo ago)
  { customerName: "Christopher Lee", amount: 150, date: "2024-01-15" },
  { customerName: "Christopher Lee", amount: 150, date: "2024-03-15" },

  // Estate of Ruth Phillips — lost (>24mo ago)
  { customerName: "Estate of Ruth Phillips", amount: 25000, date: "2023-06-01", privateNote: "Legacy Gift — Ruth Phillips Estate" },

  // Mountain View Bible Fellowship — periodic
  { customerName: "Mountain View Bible Fellowship", amount: 500, date: "2025-10-20" },
  { customerName: "Mountain View Bible Fellowship", amount: 500, date: "2026-02-20" },

  // Riverside Christian Academy — short monthly
  { customerName: "Riverside Christian Academy", amount: 300, date: "2026-02-01", docNumber: "SR-2026-014" },
  { customerName: "Riverside Christian Academy", amount: 300, date: "2026-03-01", docNumber: "SR-2026-015" },

  // Anonymous Giver — frequent small in Dec
  { customerName: "Anonymous Giver", amount: 50, date: "2025-12-07" },
  { customerName: "Anonymous Giver", amount: 50, date: "2025-12-14" },
  { customerName: "Anonymous Giver", amount: 50, date: "2025-12-21" },
  { customerName: "Anonymous Giver", amount: 50, date: "2025-12-28" },

  // Jennifer and Mark Robinson — new donor
  { customerName: "Jennifer and Mark Robinson", amount: 350, date: "2026-03-18", privateNote: "First-Time Gift" },

  // Dr. William Chen III — occasional
  { customerName: "Dr. William Chen III", amount: 750, date: "2026-02-25" },

  // O'Brien, Patrick — semi-annual
  { customerName: "O'Brien, Patrick", amount: 100, date: "2025-06-01" },
  { customerName: "O'Brien, Patrick", amount: 100, date: "2025-12-01", docNumber: "SR-2025-020" },
];

type InvoiceDef = {
  customerName: string;
  totalAmount: number;
  paymentAmount: number;
  date: string;
  privateNote?: string;
};

const INVOICES: InvoiceDef[] = [
  {
    customerName: "Smith Family Foundation",
    totalAmount: 25000,
    paymentAmount: 10000,
    date: "2025-01-01",
    privateNote: "Annual Grant Pledge — 2025",
  },
  {
    customerName: "First Baptist Church of Greenville",
    totalAmount: 5000,
    paymentAmount: 5000,
    date: "2025-06-01",
    privateNote: "VBS Partnership Pledge",
  },
  {
    customerName: "O'Brien, Patrick",
    totalAmount: 1200,
    paymentAmount: 600,
    date: "2025-01-01",
    privateNote: "Annual Giving Pledge",
  },
];

// ---------------------------------------------------------------------------
// Script logic
// ---------------------------------------------------------------------------

async function findOrCreateDonationItem(): Promise<string> {
  // Check for existing "Donation" item
  const items = await qbQuery<{ Id: string; Name: string }>(
    "Item",
    "Name = 'Donation'"
  );
  if (items.length > 0) {
    console.log(`Found existing Donation item (ID: ${items[0].Id})`);
    return items[0].Id;
  }

  // Find an income account to attach the item to
  const accounts = await qbQuery<{
    Id: string;
    Name: string;
    AccountType: string;
  }>("Account", "AccountType = 'Income'");

  if (accounts.length === 0) {
    throw new Error("No Income account found in sandbox. Cannot create item.");
  }

  const incomeAccount = accounts[0];
  console.log(
    `Using income account: ${incomeAccount.Name} (ID: ${incomeAccount.Id})`
  );

  // Create the Donation item
  const result = await qbApi<{ Item: { Id: string } }>("POST", "item", {
    Name: "Donation",
    Type: "Service",
    IncomeAccountRef: { value: incomeAccount.Id },
  });

  console.log(`Created Donation item (ID: ${result.Item.Id})`);
  return result.Item.Id;
}

async function createCustomers(): Promise<Map<string, string>> {
  const nameToId = new Map<string, string>();

  // Check which customers already exist
  const existing = await qbQuery<{ Id: string; DisplayName: string }>(
    "Customer"
  );
  for (const c of existing) {
    nameToId.set(c.DisplayName, c.Id);
  }

  for (let i = 0; i < CUSTOMERS.length; i++) {
    const def = CUSTOMERS[i];
    if (nameToId.has(def.DisplayName)) {
      console.log(
        `[${i + 1}/${CUSTOMERS.length}] Skipped (exists): ${def.DisplayName} (ID: ${nameToId.get(def.DisplayName)})`
      );
      continue;
    }

    const result = await qbApi<{ Customer: { Id: string } }>(
      "POST",
      "customer",
      def
    );
    nameToId.set(def.DisplayName, result.Customer.Id);
    console.log(
      `[${i + 1}/${CUSTOMERS.length}] Created: ${def.DisplayName} (ID: ${result.Customer.Id})`
    );
  }

  return nameToId;
}

async function createSalesReceipts(
  customerIds: Map<string, string>,
  itemId: string
) {
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < RECEIPTS.length; i++) {
    const r = RECEIPTS[i];
    const customerId = customerIds.get(r.customerName);
    if (!customerId) {
      console.warn(`  Skipped receipt — customer not found: ${r.customerName}`);
      skipped++;
      continue;
    }

    const body: Record<string, unknown> = {
      CustomerRef: { value: customerId },
      TxnDate: r.date,
      Line: [
        {
          Amount: r.amount,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: {
            ItemRef: { value: itemId },
            UnitPrice: r.amount,
            Qty: 1,
          },
        },
      ],
    };

    if (r.privateNote) body.PrivateNote = r.privateNote;
    if (r.docNumber) body.DocNumber = r.docNumber;

    try {
      const result = await qbApi<{ SalesReceipt: { Id: string } }>(
        "POST",
        "salesreceipt",
        body
      );
      created++;
      const label = r.privateNote || r.docNumber || "";
      console.log(
        `[${i + 1}/${RECEIPTS.length}] Receipt: $${r.amount} → ${r.customerName} (${r.date}) ${label} [ID: ${result.SalesReceipt.Id}]`
      );
    } catch (err) {
      console.error(
        `  Failed receipt for ${r.customerName} on ${r.date}:`,
        err instanceof Error ? err.message : err
      );
      skipped++;
    }
  }

  console.log(
    `\nSales Receipts: ${created} created, ${skipped} skipped/failed`
  );
}

async function createInvoicesAndPayments(
  customerIds: Map<string, string>,
  itemId: string
) {
  for (const inv of INVOICES) {
    const customerId = customerIds.get(inv.customerName);
    if (!customerId) {
      console.warn(
        `  Skipped invoice — customer not found: ${inv.customerName}`
      );
      continue;
    }

    // Create invoice
    const invoiceBody: Record<string, unknown> = {
      CustomerRef: { value: customerId },
      TxnDate: inv.date,
      Line: [
        {
          Amount: inv.totalAmount,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: {
            ItemRef: { value: itemId },
            UnitPrice: inv.totalAmount,
            Qty: 1,
          },
        },
      ],
    };
    if (inv.privateNote) invoiceBody.PrivateNote = inv.privateNote;

    const invoiceResult = await qbApi<{ Invoice: { Id: string } }>(
      "POST",
      "invoice",
      invoiceBody
    );
    const invoiceId = invoiceResult.Invoice.Id;
    console.log(
      `Invoice: $${inv.totalAmount} → ${inv.customerName} [ID: ${invoiceId}]`
    );

    // Create payment against invoice
    if (inv.paymentAmount > 0) {
      const paymentBody = {
        CustomerRef: { value: customerId },
        TotalAmt: inv.paymentAmount,
        Line: [
          {
            Amount: inv.paymentAmount,
            LinkedTxn: [{ TxnId: invoiceId, TxnType: "Invoice" }],
          },
        ],
      };

      const payResult = await qbApi<{ Payment: { Id: string } }>(
        "POST",
        "payment",
        paymentBody
      );
      console.log(
        `  Payment: $${inv.paymentAmount} applied [ID: ${payResult.Payment.Id}] (balance: $${inv.totalAmount - inv.paymentAmount})`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== QB Sandbox Seeder ===\n");

  await loadTokens();

  console.log("\n--- Finding/creating Donation item ---");
  const itemId = await findOrCreateDonationItem();

  console.log("\n--- Creating customers ---");
  const customerIds = await createCustomers();
  console.log(`\nCustomers ready: ${customerIds.size} total\n`);

  console.log("--- Creating sales receipts ---");
  await createSalesReceipts(customerIds, itemId);

  console.log("\n--- Creating invoices & payments ---");
  await createInvoicesAndPayments(customerIds, itemId);

  console.log("\n=== Done! ===");
  console.log(
    "Now go to Settings → Integrations → 'Resync All Donor Data (Historical)' to test the sync."
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
