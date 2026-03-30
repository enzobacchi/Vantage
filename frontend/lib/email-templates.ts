/**
 * Notification email HTML templates.
 * Follows the same styling as team invite emails (Inter font, 520px max-width, gradient accent).
 */

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function wrapEmailTemplate(title: string, bodyHtml: string): string {
  return `
<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; padding: 48px 24px;">
  <div style="margin-bottom: 32px;">
    <h1 style="font-size: 24px; font-weight: 600; color: #18181b; margin: 0 0 8px 0;">${esc(title)}</h1>
    <div style="width: 48px; height: 3px; background: linear-gradient(to right, #007A3F, #21E0D6); border-radius: 2px;"></div>
  </div>
  ${bodyHtml}
  <p style="color: #a1a1aa; font-size: 13px; margin: 32px 0 0 0;">
    — The Vantage Team
  </p>
</div>
  `.trim()
}

function linkButton(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display: inline-block; background: linear-gradient(to right, #007A3F, #21E0D6); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px;">${esc(label)}</a>`
}

function p(text: string): string {
  return `<p style="color: #52525b; font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;">${text}</p>`
}

function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
}

// ---------------------------------------------------------------------------
// Auth emails
// ---------------------------------------------------------------------------

export function passwordResetEmailHtml(resetLink: string): string {
  return wrapEmailTemplate("Reset Your Password", `
    ${p("We received a request to reset your password. Click the button below to set a new one.")}
    <div style="margin: 24px 0;">
      ${linkButton(resetLink, "Reset Password")}
    </div>
    <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">
      Or copy and paste this link into your browser:<br>
      <span style="color: #007A3F; word-break: break-all;">${esc(resetLink)}</span>
    </p>
    <p style="color: #a1a1aa; font-size: 12px; margin: 16px 0 0 0;">
      This link expires in 24 hours. If you didn't request this, you can safely ignore this email.
    </p>
  `)
}

// ---------------------------------------------------------------------------
// Notification emails
// ---------------------------------------------------------------------------

export function newDonationEmailHtml(
  donorName: string,
  amount: number,
  date: string,
  profileUrl: string
): string {
  return wrapEmailTemplate("New Donation Received", `
    ${p(`<strong>${esc(donorName)}</strong> made a donation of <strong>${formatUSD(amount)}</strong> on ${esc(date)}.`)}
    <div style="margin: 24px 0;">
      ${linkButton(profileUrl, "View Donor Profile")}
    </div>
  `)
}

export function milestoneEmailHtml(
  donorName: string,
  milestone: number,
  totalGiving: number,
  profileUrl: string
): string {
  return wrapEmailTemplate("Donor Milestone Reached", `
    ${p(`<strong>${esc(donorName)}</strong> just crossed the <strong>${formatUSD(milestone)}</strong> lifetime giving milestone!`)}
    ${p(`Their total lifetime giving is now <strong>${formatUSD(totalGiving)}</strong>.`)}
    <div style="margin: 24px 0;">
      ${linkButton(profileUrl, "View Donor Profile")}
    </div>
  `)
}

export function teamActivityEmailHtml(
  actorName: string,
  action: string,
  detail: string
): string {
  return wrapEmailTemplate("Team Activity", `
    ${p(`<strong>${esc(actorName)}</strong> ${esc(action)}.`)}
    ${detail ? p(`<span style="color: #71717a;">${esc(detail)}</span>`) : ""}
  `)
}

export function systemAlertEmailHtml(
  alertSubject: string,
  detail: string
): string {
  return wrapEmailTemplate(alertSubject, `
    ${p(esc(detail))}
    <p style="color: #71717a; font-size: 13px; line-height: 1.6; margin: 16px 0 0 0;">
      Check your Vantage settings for more details.
    </p>
  `)
}

export type DigestAISummaryEmail = {
  givingOverview: string
  notableActivity: string[]
  donorHealth: string
  recommendedActions: string[]
}

function aiSummarySection(ai: DigestAISummaryEmail): string {
  const bullets = (items: string[]) =>
    items.length > 0
      ? `<ul style="margin: 0 0 16px 0; padding-left: 20px;">${items.map((item) => `<li style="color: #52525b; font-size: 14px; line-height: 1.7; margin-bottom: 6px;">${esc(item)}</li>`).join("")}</ul>`
      : ""

  const sectionLabel = (text: string) =>
    `<p style="font-size: 13px; font-weight: 600; color: #18181b; margin: 16px 0 6px 0;">${text}</p>`

  return `
    <div style="border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
      <div style="height: 3px; background: linear-gradient(to right, #007A3F, #21E0D6);"></div>
      <div style="padding: 20px 24px;">
        <p style="font-size: 13px; font-weight: 600; color: #007A3F; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 16px 0;">
          &#10024; AI Weekly Summary
        </p>
        <p style="color: #52525b; font-size: 14px; line-height: 1.7; margin: 0 0 16px 0;">${esc(ai.givingOverview)}</p>
        ${ai.notableActivity.length > 0 ? sectionLabel("Notable Activity") + bullets(ai.notableActivity) : ""}
        ${sectionLabel("Donor Health")}
        <p style="color: #52525b; font-size: 14px; line-height: 1.7; margin: 0 0 16px 0;">${esc(ai.donorHealth)}</p>
        ${ai.recommendedActions.length > 0 ? sectionLabel("Recommended Actions") + bullets(ai.recommendedActions) : ""}
        <p style="color: #a1a1aa; font-size: 11px; margin: 8px 0 0 0;">Powered by Vantage AI</p>
      </div>
    </div>
  `
}

export function weeklyDigestEmailHtml(
  orgName: string,
  stats: {
    donationCount: number
    donationTotal: number
    newDonorCount: number
    milestoneDonors: string[]
  },
  aiSummary?: DigestAISummaryEmail | null
): string {
  const rows: string[] = []

  // AI summary section (above stats table)
  if (aiSummary) {
    rows.push(aiSummarySection(aiSummary))
  }

  rows.push(`
    <table style="width: 100%; border-collapse: collapse; margin: 0 0 24px 0;">
      <tr>
        <td style="padding: 12px 16px; border: 1px solid #e4e4e7; font-size: 14px; color: #52525b;">Donations received</td>
        <td style="padding: 12px 16px; border: 1px solid #e4e4e7; font-size: 14px; font-weight: 600; color: #18181b; text-align: right;">${stats.donationCount}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border: 1px solid #e4e4e7; font-size: 14px; color: #52525b;">Total amount</td>
        <td style="padding: 12px 16px; border: 1px solid #e4e4e7; font-size: 14px; font-weight: 600; color: #18181b; text-align: right;">${formatUSD(stats.donationTotal)}</td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; border: 1px solid #e4e4e7; font-size: 14px; color: #52525b;">New donors</td>
        <td style="padding: 12px 16px; border: 1px solid #e4e4e7; font-size: 14px; font-weight: 600; color: #18181b; text-align: right;">${stats.newDonorCount}</td>
      </tr>
    </table>
  `)

  if (stats.milestoneDonors.length > 0) {
    rows.push(p(`<strong>Milestone donors:</strong> ${stats.milestoneDonors.map(esc).join(", ")}`))
  }

  if (stats.donationCount === 0 && stats.newDonorCount === 0 && !aiSummary) {
    rows.push(p("It was a quiet week — no new donations or donors."))
  }

  return wrapEmailTemplate(`Weekly Digest — ${esc(orgName)}`, rows.join("\n"))
}
