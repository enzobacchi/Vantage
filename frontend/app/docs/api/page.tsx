import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "API Documentation - Vantage",
  description:
    "Vantage REST API v1 reference — read-only access to your organization's donors and donations.",
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">
      {children}
    </code>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-[13px] leading-relaxed">
      {children}
    </pre>
  )
}

function ParamTable({ rows }: { rows: Array<[React.ReactNode, string]> }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <th className="px-4 py-2 font-medium">Query param</th>
            <th className="px-4 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([param, desc], i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className="px-4 py-2 align-top whitespace-nowrap">{param}</td>
              <td className="px-4 py-2 text-foreground/80">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ApiDocsPage() {
  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/settings?tab=api-keys"
          className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Manage API Keys
        </Link>

        <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
          Vantage REST API <span className="text-muted-foreground">v1</span>
        </h1>
        <p className="mb-10 text-sm text-muted-foreground">
          Read-only access to your organization&apos;s donors and donations.
          Available on the Growth plan and above.
        </p>

        <div className="space-y-10 text-[15px] leading-relaxed text-foreground/90">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Authentication</h2>
            <p>
              Create an API key in{" "}
              <Link href="/settings?tab=api-keys" className="text-primary hover:underline">
                Settings &rarr; API Keys
              </Link>
              , then pass it on every request:
            </p>
            <CodeBlock>{`Authorization: Bearer vk_live_...`}</CodeBlock>
            <p>
              Keys are shown once at creation. Revoke and re-create keys at any
              time in Settings &mdash; revoked keys fail immediately with{" "}
              <Code>401</Code>. Keep keys server-side; never embed them in
              client-side code.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Conventions</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Base URL: <Code>https://app.vantagedonorai.com</Code>
              </li>
              <li>All responses are JSON.</li>
              <li>
                List endpoints return{" "}
                <Code>{`{ "data": [...], "pagination": { "has_more", "next_cursor" } }`}</Code>
                . Pass <Code>next_cursor</Code> back as <Code>?cursor=</Code> to
                fetch the next page. <Code>limit</Code> defaults to 25, max 100.
              </li>
              <li>
                Single-resource endpoints return <Code>{`{ "data": {...} }`}</Code>.
              </li>
              <li>
                Errors return{" "}
                <Code>{`{ "error": { "code", "message" } }`}</Code> with an
                appropriate HTTP status: <Code>401 unauthorized</Code>,{" "}
                <Code>403 plan_required</Code> / <Code>insufficient_scope</Code>,{" "}
                <Code>404 not_found</Code>, <Code>400 invalid_request</Code>,{" "}
                <Code>429 rate_limited</Code> (includes a <Code>Retry-After</Code>{" "}
                header), <Code>500 internal_error</Code>.
              </li>
              <li>Rate limit: 60 requests/minute per key.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Endpoints</h2>

            <div className="space-y-3">
              <h3 className="font-mono text-base font-semibold text-foreground">
                GET /api/v1/donors
              </h3>
              <p>List donors, newest first.</p>
              <ParamTable
                rows={[
                  [<Code key="e">email</Code>, "Exact match, case-insensitive"],
                  [
                    <Code key="x">external_id</Code>,
                    "Exact match (your crosswalk key from a previous CRM)",
                  ],
                  [<Code key="l">limit</Code>, "Page size (1–100, default 25)"],
                  [<Code key="c">cursor</Code>, "Opaque cursor from the previous page"],
                ]}
              />
              <p className="text-sm text-foreground/80">
                Donor fields: <Code>id</Code>, <Code>external_id</Code>,{" "}
                <Code>display_name</Code>, <Code>first_name</Code>,{" "}
                <Code>last_name</Code>, <Code>email</Code>, <Code>phone</Code>,{" "}
                <Code>donor_type</Code>, billing and mailing address fields,{" "}
                <Code>custom_fields</Code> (object keyed by custom-field key),{" "}
                <Code>qb_customer_id</Code>, <Code>total_lifetime_value</Code>,{" "}
                <Code>last_donation_date</Code>, <Code>last_donation_amount</Code>,{" "}
                <Code>created_at</Code>.
              </p>
              <CodeBlock>{`curl -H "Authorization: Bearer vk_live_..." \\
  "https://app.vantagedonorai.com/api/v1/donors?email=donor@example.com"`}</CodeBlock>
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="font-mono text-base font-semibold text-foreground">
                GET /api/v1/donors/:id
              </h3>
              <p>
                Fetch a single donor by Vantage id (the UUID in donor profile
                URLs).
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="font-mono text-base font-semibold text-foreground">
                GET /api/v1/donations
              </h3>
              <p>List donations, newest first.</p>
              <ParamTable
                rows={[
                  [<Code key="d">donor_id</Code>, "Filter to one donor (UUID)"],
                  [
                    <span key="r" className="whitespace-nowrap">
                      <Code>date_from</Code> / <Code>date_to</Code>
                    </span>,
                    "Inclusive YYYY-MM-DD range on the gift date",
                  ],
                  [
                    <span key="p" className="whitespace-nowrap">
                      <Code>limit</Code> / <Code>cursor</Code>
                    </span>,
                    "Pagination, as above",
                  ],
                ]}
              />
              <p className="text-sm text-foreground/80">
                Donation fields: <Code>id</Code>, <Code>donor_id</Code>,{" "}
                <Code>amount</Code>, <Code>date</Code>, <Code>payment_method</Code>,{" "}
                <Code>category_id</Code>, <Code>campaign_id</Code>,{" "}
                <Code>fund_id</Code>, <Code>memo</Code>, <Code>source</Code>,{" "}
                <Code>qb_id</Code>, <Code>created_at</Code>.
              </p>
              <CodeBlock>{`curl -H "Authorization: Bearer vk_live_..." \\
  "https://app.vantagedonorai.com/api/v1/donations?donor_id=<uuid>&date_from=2026-01-01"`}</CodeBlock>
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="text-base font-semibold text-foreground">
                Deprecated alias
              </h3>
              <p className="text-sm text-foreground/80">
                <Code>/api/v1/contacts</Code> and{" "}
                <Code>/api/v1/contacts/:id</Code> are deprecated aliases for{" "}
                <Code>/api/v1/donors</Code> and <Code>/api/v1/donors/:id</Code>{" "}
                &mdash; same authentication, query parameters, and response
                shapes. Existing integrations keep working unchanged; new
                integrations should use <Code>/api/v1/donors</Code>.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              Typical integration: website customer lookup
            </h2>
            <ol className="list-decimal space-y-2 pl-5">
              <li>A user logs into your site and verifies their email.</li>
              <li>
                Your server calls{" "}
                <Code>GET /api/v1/donors?email=&lt;their email&gt;</Code>.
              </li>
              <li>
                Use the returned <Code>id</Code> to fetch giving history via{" "}
                <Code>GET /api/v1/donations?donor_id=&lt;id&gt;</Code>.
              </li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">Roadmap</h2>
            <p>
              Write endpoints (create/update donors and donations) are planned.
              Current keys carry a <Code>read</Code> scope and will keep working
              unchanged.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
