import { convertToModelMessages, generateText, stepCountIs, tool, type UIMessage } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { ChatPIIRedactor } from "./pii-redactor"

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
})
