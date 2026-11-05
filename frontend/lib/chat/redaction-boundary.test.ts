import { convertToModelMessages, generateText, stepCountIs, tool, type UIMessage } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { ChatPIIRedactor, redactReplayedText, registerReplayedToolOutputs } from "./pii-redactor"

/**
 * End-to-end check of the model boundary through the real AI SDK: the model's
 * prompt carries the redacted tool result, the app (and so the client) gets
 * the raw one, and replayed history is redacted when tools are passed to
 * convertToModelMessages.
 */

const RAW = {
  donations: [
    {
      donor_name: "Ruth Henderson",
      fund_name: "Ruth Henderson Memorial Scholarship",
      billing_address: "4410 Garland Ave",
      amount: 250,
    },
  ],
}

function buildRedactedTools(redactor: ChatPIIRedactor, received: string[]) {
  return redactor.wrapTools({
    filter_donations: tool({
      inputSchema: z.object({ fund_name: z.string() }),
      execute: async ({ fund_name }) => {
        received.push(fund_name)
        redactor.addOptionName("fund", RAW.donations[0].fund_name)
        return RAW
      },
    }),
  })
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

describe("chat redaction boundary (AI SDK integration)", () => {
  it("sends the model a redacted tool result while the app keeps the raw one", async () => {
    const redactor = new ChatPIIRedactor()
    redactor.addOptionName("fund", RAW.donations[0].fund_name)
    const received: string[] = []
    const prompts: string[] = []

    const model = new MockLanguageModelV3({
      doGenerate: async ({ prompt }) => {
        prompts.push(JSON.stringify(prompt))
        if (prompts.length === 1) {
          return {
            content: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "filter_donations",
                input: JSON.stringify({ fund_name: "[FUND_1]" }),
              },
            ],
            finishReason: { unified: "tool-calls", raw: "tool_use" },
            usage,
            warnings: [],
          }
        }
        return {
          content: [{ type: "text", text: "[DONOR_1] gave to [FUND_1]." }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage,
          warnings: [],
        }
      },
    })

    const result = await generateText({
      model,
      prompt: "Who gave to the scholarship fund?",
      tools: buildRedactedTools(redactor, received),
      stopWhen: stepCountIs(3),
    })

    // The tool ran with the real fund name restored from the placeholder.
    expect(received).toEqual(["Ruth Henderson Memorial Scholarship"])
    // The model's second prompt carries only placeholders.
    expect(prompts[1]).not.toContain("Ruth Henderson")
    expect(prompts[1]).not.toContain("4410 Garland")
    expect(prompts[1]).toContain("[FUND_1]")
    expect(prompts[1]).toContain("[ADDRESS_1]")
    expect(prompts[1]).toContain("250")
    // The app-side result (what streams to the UI) is untouched.
    expect(result.steps[0].toolResults[0].output).toEqual(RAW)
  })

  it("redacts raw tool outputs replayed from earlier UI messages (fresh redactor, seeded like the route)", async () => {
    // A new request: no tool has run yet, so option names come only from the
    // org-wide seed the chat route does before convertToModelMessages.
    const redactor = new ChatPIIRedactor()
    redactor.seedOptions([{ type: "fund", name: RAW.donations[0].fund_name }])
    const tools = redactor.wrapTools({
      filter_donations: tool({
        inputSchema: z.object({ fund_name: z.string() }),
        execute: async () => RAW,
      }),
    })

    const history: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Who gave to the scholarship?" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-filter_donations",
            toolCallId: "call-1",
            state: "output-available",
            input: { fund_name: "[FUND_1]" },
            output: RAW,
          },
        ],
      },
    ]

    const modelMessages = await convertToModelMessages(history, { tools })
    const toolMessage = JSON.stringify(modelMessages.filter((m) => m.role === "tool"))
    expect(toolMessage).not.toContain("Ruth Henderson")
    expect(toolMessage).not.toContain("4410 Garland")
    expect(toolMessage).toContain("[FUND_1]")
  })

  // ── Residual leak paths found in review (Nov 2026) ──────────────────────

  it("redacts addresses and unseeded donor names in replayed assistant text", async () => {
    // Fresh request: the donor isn't in the seed (beyond the 5,000 limit), and
    // the address was restored for display by the stream transform last turn.
    const redactor = new ChatPIIRedactor()
    redactor.seedOptions([{ type: "fund", name: RAW.donations[0].fund_name }])
    const tools = redactor.wrapTools({
      filter_donations: tool({
        inputSchema: z.object({ fund_name: z.string() }),
        execute: async () => RAW,
      }),
    })
    const history: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Who gave to the scholarship?" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-filter_donations",
            toolCallId: "call-1",
            state: "output-available",
            input: { fund_name: "[FUND_1]" },
            output: RAW,
          },
          { type: "text", text: "Ruth Henderson gave $250. She lives at 4410 Garland Ave." },
        ],
      },
      { id: "u2", role: "user", parts: [{ type: "text", text: "Thanks" }] },
    ]

    registerReplayedToolOutputs(history, redactor)
    redactReplayedText(history, redactor, 2)
    const prompt = JSON.stringify(await convertToModelMessages(history, { tools }))
    expect(prompt).not.toContain("Ruth Henderson")
    expect(prompt).not.toContain("4410 Garland")
    expect(prompt).toContain("$250")
  })

  it("re-redacts restored argument values that a tool echoes back", async () => {
    const redactor = new ChatPIIRedactor()
    redactor.seedOptions([{ type: "fund", name: "Ruth Henderson Memorial Scholarship" }])
    // A custom-field value the model saw as a placeholder in an earlier result.
    redactor.redactToolResult({ custom_fields: { tier: "Gold Circle" } })
    const prompts: string[] = []
    const model = new MockLanguageModelV3({
      doGenerate: async ({ prompt }) => {
        prompts.push(JSON.stringify(prompt))
        if (prompts.length === 1) {
          return {
            content: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "create_custom_report",
                input: JSON.stringify({ fund: "[FUND_1]", tier: "[CUSTOM_1]" }),
              },
            ],
            finishReason: { unified: "tool-calls", raw: "tool_use" },
            usage,
            warnings: [],
          }
        }
        return {
          content: [{ type: "text", text: "Done." }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage,
          warnings: [],
        }
      },
    })
    const tools = redactor.wrapTools({
      create_custom_report: tool({
        inputSchema: z.object({ fund: z.string(), tier: z.string() }),
        execute: async ({ fund, tier }) => ({
          report: {
            title: `Gifts to ${fund}`,
            filters: [
              { field: "fund", operator: "eq", value: fund },
              { field: "custom:tier", operator: "eq", value: tier },
            ],
            status: "Active",
          },
          rows: [{ payment_method: "Gold Circle", amount: 100 }],
        }),
      }),
    })

    await generateText({ model, prompt: "Report it", tools, stopWhen: stepCountIs(3) })
    expect(prompts[1]).not.toContain("Ruth Henderson")
    expect(prompts[1]).not.toContain('"value":"Gold Circle"')
    expect(prompts[1]).toContain("[FUND_1]")
    expect(prompts[1]).toContain("[CUSTOM_1]")
    // Values the call didn't restore are left alone, and a restored value is
    // only re-hidden where the tool echoes its arguments (not in data rows).
    expect(prompts[1]).toContain("Active")
    expect(prompts[1]).toContain('"payment_method":"Gold Circle"')
  })

  it("redacts restored values and known fields in tool error text, live and replayed", async () => {
    const redactor = new ChatPIIRedactor()
    redactor.seedOptions([{ type: "fund", name: "Ruth Henderson Memorial Scholarship" }])
    redactor.redactToolResult({ donations: [{ billing_address: "4410 Garland Ave" }] })
    const prompts: string[] = []
    const model = new MockLanguageModelV3({
      doGenerate: async ({ prompt }) => {
        prompts.push(JSON.stringify(prompt))
        if (prompts.length === 1) {
          return {
            content: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "filter_donations",
                input: JSON.stringify({ fund_name: "[FUND_1]" }),
              },
            ],
            finishReason: { unified: "tool-calls", raw: "tool_use" },
            usage,
            warnings: [],
          }
        }
        return {
          content: [{ type: "text", text: "Sorry." }],
          finishReason: { unified: "stop", raw: "end_turn" },
          usage,
          warnings: [],
        }
      },
    })
    const tools = redactor.wrapTools({
      filter_donations: tool({
        inputSchema: z.object({ fund_name: z.string() }),
        execute: async ({ fund_name }) => {
          throw new Error(`No gifts for "${fund_name}" near 4410 Garland Ave`)
        },
      }),
    })
    await generateText({ model, prompt: "Who gave?", tools, stopWhen: stepCountIs(3) })
    expect(prompts[1]).not.toContain("Ruth Henderson")
    expect(prompts[1]).not.toContain("4410 Garland")

    // Replayed error parts skip toModelOutput, so the history pass must clean them.
    const history: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Who gave?" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-filter_donations",
            toolCallId: "call-1",
            state: "output-error",
            input: { fund_name: "[FUND_1]" },
            errorText: 'No gifts for "Ruth Henderson Memorial Scholarship" near 4410 Garland Ave',
          },
        ],
      },
      { id: "u2", role: "user", parts: [{ type: "text", text: "ok" }] },
    ]
    registerReplayedToolOutputs(history, redactor)
    redactReplayedText(history, redactor, 2)
    const replayed = JSON.stringify(await convertToModelMessages(history, { tools }))
    expect(replayed).not.toContain("Ruth Henderson")
    expect(replayed).not.toContain("4410 Garland")
  })

  it("redacts fund names and known addresses in the new user message", () => {
    const redactor = new ChatPIIRedactor()
    redactor.seedOptions([{ type: "fund", name: "Ruth Henderson Memorial Scholarship" }])
    redactor.redactToolResult({ donations: [{ billing_address: "4410 Garland Ave" }] })
    const text = redactor.redactUserText(
      "Show gifts to the Ruth Henderson Memorial Scholarship from 4410 Garland Ave"
    )
    expect(text).not.toContain("Ruth Henderson")
    expect(text).not.toContain("4410 Garland")
    expect(text).toContain("[FUND_1]")
  })
})
