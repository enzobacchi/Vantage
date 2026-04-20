/**
 * AI Report Builder eval suite.
 *
 * Sends 15 natural-language queries to the live chat model with a stub
 * `build_custom_report` tool that records what spec the model would build.
 * Asserts the spec matches the expected pattern (donation_activity rows,
 * lifecycle filters, unreliable_query fallback, etc.).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx frontend/scripts/test-ai-report-queries.ts
 *
 * Exit code: 0 if ≥ 13/15 pass, 1 otherwise.
 *
 * Note: this hits the real Anthropic API (~15 Haiku 4.5 calls per run, a few
 * cents). Tweak CASES below and re-run when iterating on the system prompt.
 */

import { anthropic } from "@ai-sdk/anthropic"
import { generateText, stepCountIs, tool } from "ai"
import { z } from "zod"

import { buildSystemPrompt } from "../lib/chat/system-prompt"

type FilterSpec = {
  field: string
  operator: string
  value: string | number | string[]
  value2?: string | number
}

type Capture = {
  called: boolean
  args?: {
    title: string
    summary?: string
    filters: FilterSpec[]
    selectedColumns?: string[]
  }
}

function buildStubTools(capture: Capture) {
  return {
    build_custom_report: tool({
      description: "Stubbed for eval. Records the spec the model would build.",
      inputSchema: z.object({
        title: z.string(),
        summary: z.string().optional(),
        filters: z.array(
          z.object({
            field: z.string(),
            operator: z.string(),
            value: z.union([z.string(), z.number(), z.array(z.string())]),
            value2: z.union([z.string(), z.number()]).optional(),
          })
        ),
        selectedColumns: z.array(z.string()).optional(),
      }),
      execute: async (args) => {
        capture.called = true
        capture.args = args
        if (args.filters.length === 0) {
          return { error: "unreliable_query", reason: "no_filters" }
        }
        // Return a fake preview so the model can move on.
        return {
          ok: true,
          preview: {
            title: args.title,
            summary: args.summary ?? "",
            filters: args.filters,
            selectedColumns: args.selectedColumns ?? [],
            rowCount: 7,
            sampleDonors: [],
            pendingSaveToken: "STUB",
          },
        }
      },
    }),
    save_custom_report: tool({
      description: "Stubbed.",
      inputSchema: z.object({
        pendingSaveToken: z.string(),
        visibility: z.enum(["private", "shared"]).optional(),
      }),
      execute: async () => ({ ok: true, reportId: "STUB" }),
    }),
  }
}

type Expectation = {
  expectUnreliable?: boolean
  /** Must include at least one row with these field+operator pairs. */
  mustContain?: Array<{ field: string; operator?: string }>
  /** Number of donation_activity rows expected. */
  donationActivityRows?: number
  /** Final assistant text must contain this substring. */
  expectTextContains?: string
}

const CANONICAL_SAFETY_SENTENCE =
  "I couldn't build that query reliably. Try the custom report builder or rephrase."

const CASES: Array<{ name: string; query: string; expect: Expectation }> = [
  {
    name: "1. retention basic",
    query: "Donors who gave last year and this year",
    expect: { donationActivityRows: 2 },
  },
  {
    name: "2. recapture multi-year",
    query:
      "Show me everyone who didn't give last year but gave 3-5 years ago and gave again this year",
    expect: {
      donationActivityRows: 3,
      mustContain: [{ field: "donation_activity", operator: "no_gift_between" }],
    },
  },
  {
    name: "3. reactivation this month",
    query: "Lapsed donors who came back this month",
    expect: {
      mustContain: [
        { field: "lifecycle_status", operator: "eq" },
        { field: "donation_activity", operator: "gave_between" },
      ],
    },
  },
  {
    name: "4. first-time this year",
    query: "First-time donors this year",
    expect: { mustContain: [{ field: "first_donation_date" }] },
  },
  {
    name: "5. major donors CA",
    query: "Major donors in California",
    expect: {
      mustContain: [
        { field: "state" },
        { field: "total_lifetime_value" },
      ],
    },
  },
  {
    name: "6. 3+ gifts last 12 months",
    query: "Donors who gave 3 or more times in the last 12 months",
    expect: { mustContain: [{ field: "gift_count" }] },
  },
  {
    name: "7. lost high-LTV",
    query: "Lost donors with lifetime giving over $10,000",
    expect: {
      mustContain: [
        { field: "lifecycle_status", operator: "eq" },
        { field: "total_lifetime_value" },
      ],
    },
  },
  {
    name: "8. zip search",
    query: "Show me donors in zip 90210",
    expect: { mustContain: [{ field: "zip" }] },
  },
  {
    name: "9. fiscal year mapped to calendar",
    query: "Donors in fiscal year 2024",
    expect: {
      mustContain: [{ field: "donation_activity", operator: "gave_between" }],
    },
  },
  {
    name: "10. unrelated -> unreliable",
    query: "Donors who volunteered last month",
    expect: { expectUnreliable: true, expectTextContains: CANONICAL_SAFETY_SENTENCE },
  },
  {
    name: "11. nonsense -> unreliable",
    query: "Donors with rainbow auras and mood swings",
    expect: { expectUnreliable: true, expectTextContains: CANONICAL_SAFETY_SENTENCE },
  },
  {
    name: "12. high-LTV state filter",
    query: "Texas donors who have given more than $5000 lifetime",
    expect: {
      mustContain: [{ field: "state" }, { field: "total_lifetime_value" }],
    },
  },
  {
    name: "13. last gift over 1k",
    query: "Donors whose last gift was over $1000",
    expect: { mustContain: [{ field: "last_donation_amount" }] },
  },
  {
    name: "14. lapsed only",
    query: "Show me my lapsed donors",
    expect: {
      mustContain: [{ field: "lifecycle_status", operator: "eq" }],
    },
  },
  {
    name: "15. retained donors over 3 years",
    query: "Donors who gave in each of the last three years",
    expect: { donationActivityRows: 3 },
  },
]

type Result = { name: string; pass: boolean; reason?: string }

async function runOne(
  c: (typeof CASES)[number]
): Promise<Result> {
  const capture: Capture = { called: false }
  const system = buildSystemPrompt("eval-org-id")

  let text = ""
  try {
    const r = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      system,
      prompt: c.query,
      tools: buildStubTools(capture),
      stopWhen: stepCountIs(3),
      maxOutputTokens: 1024,
    })
    text = r.text
  } catch (e) {
    return {
      name: c.name,
      pass: false,
      reason: `model error: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (c.expect.expectUnreliable) {
    // Pass if the model's final text is exactly the canonical sentence
    // (no preamble, no follow-up). Whether it called the tool with empty
    // filters first is implementation-detail — only the user-facing reply
    // matters.
    const trimmed = text.trim()
    if (trimmed === CANONICAL_SAFETY_SENTENCE) {
      return { name: c.name, pass: true }
    }
    return {
      name: c.name,
      pass: false,
      reason: `expected exact safety sentence, got: "${text.slice(0, 160)}"`,
    }
  }

  if (!capture.called || !capture.args) {
    return { name: c.name, pass: false, reason: "build_custom_report not called" }
  }
  if (capture.args.filters.length === 0) {
    return {
      name: c.name,
      pass: false,
      reason: "model returned unreliable_query but case expected real filters",
    }
  }

  const filters = capture.args.filters

  if (c.expect.mustContain) {
    for (const need of c.expect.mustContain) {
      const found = filters.some(
        (f) =>
          f.field === need.field &&
          (need.operator == null || f.operator === need.operator)
      )
      if (!found) {
        return {
          name: c.name,
          pass: false,
          reason: `missing ${need.field}${need.operator ? `/${need.operator}` : ""}; got ${JSON.stringify(filters)}`,
        }
      }
    }
  }

  if (c.expect.donationActivityRows != null) {
    const n = filters.filter((f) => f.field === "donation_activity").length
    if (n !== c.expect.donationActivityRows) {
      return {
        name: c.name,
        pass: false,
        reason: `expected ${c.expect.donationActivityRows} donation_activity rows, got ${n}: ${JSON.stringify(filters)}`,
      }
    }
  }

  return { name: c.name, pass: true }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY required")
    process.exit(2)
  }

  console.log(`Running ${CASES.length} cases against claude-haiku-4-5-20251001…\n`)

  const results: Result[] = []
  for (const c of CASES) {
    process.stdout.write(`  ${c.name}… `)
    const r = await runOne(c)
    results.push(r)
    console.log(r.pass ? "✓" : `✗  (${r.reason})`)
  }

  const passed = results.filter((r) => r.pass).length
  const total = results.length
  console.log(`\n${passed}/${total} passed`)

  const fs = await import("node:fs")
  const path = await import("node:path")
  const url = await import("node:url")
  const here = path.dirname(url.fileURLToPath(import.meta.url))
  const out = path.join(here, ".test-results.json")
  fs.writeFileSync(out, JSON.stringify({ passed, total, results }, null, 2))
  console.log(`Wrote ${out}`)

  process.exit(passed >= 13 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
