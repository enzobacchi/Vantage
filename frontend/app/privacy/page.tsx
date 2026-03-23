import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy - Vantage",
  description: "Vantage Privacy Policy",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Dashboard
        </Link>

        <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">
          Privacy Policy
        </h1>
        <p className="mb-10 text-sm text-muted-foreground">
          Last updated: March 22, 2026
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold text-foreground">1. Introduction</h2>
            <p>
              Vantage Software, Inc. (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Vantage platform (&quot;the Service&quot;).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">2. Information We Collect</h2>

            <h3 className="mt-4 text-lg font-medium text-foreground">2a. Account Information</h3>
            <p>
              When you create an account, we collect your name, email address, and password. If you join an organization, we also store your membership role and association.
            </p>

            <h3 className="mt-4 text-lg font-medium text-foreground">2b. Donor Data (Your Data)</h3>
            <p>
              You and your organization upload and manage donor information within the Service, including names, contact details, addresses, donation history, notes, interactions, and tags. This data belongs to your organization &mdash; we process it solely to provide the Service.
            </p>

            <h3 className="mt-4 text-lg font-medium text-foreground">2c. Usage Data</h3>
            <p>
              We automatically collect usage information such as pages visited, features used, browser type, device information, and IP address. This data is used to improve the Service and diagnose issues.
            </p>

            <h3 className="mt-4 text-lg font-medium text-foreground">2d. Integration Data</h3>
            <p>
              When you connect third-party services (e.g., QuickBooks), we store OAuth tokens and sync metadata necessary to maintain the integration. We do not store your third-party passwords.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Authenticate users and manage organization access</li>
              <li>Sync data with connected third-party services</li>
              <li>Generate AI-powered donor insights and chat responses</li>
              <li>Send transactional emails (e.g., donation receipts) on your behalf</li>
              <li>Provide customer support</li>
              <li>Detect and prevent fraud, abuse, or security incidents</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">4. AI Processing and PII Safeguards</h2>
            <p>
              The Service uses AI providers (OpenAI and Anthropic) to generate donor insights and power the chat assistant. Before sending any donor data to AI providers:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Personally identifiable information (PII) such as names, emails, phone numbers, and addresses is redacted and replaced with anonymous placeholders</li>
              <li>AI providers receive only anonymized data and do not have access to raw donor records</li>
              <li>AI-generated responses are un-redacted locally before being displayed to you</li>
            </ul>
            <p>
              AI providers process data according to their own privacy policies. We do not permit AI providers to use your data for training their models.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">5. Data Sharing and Disclosure</h2>
            <p>We do not sell your personal information or donor data. We may share information with:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong>Service providers</strong> &mdash; Third-party services that help us operate the platform (hosting, email delivery, analytics, AI processing). These providers are bound by contractual obligations to protect your data.
              </li>
              <li>
                <strong>Connected integrations</strong> &mdash; When you explicitly authorize a third-party integration (e.g., QuickBooks), data flows as necessary to maintain the sync.
              </li>
              <li>
                <strong>Legal requirements</strong> &mdash; We may disclose information if required by law, regulation, legal process, or governmental request.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">6. Data Storage and Security</h2>
            <p>
              Your data is stored in Supabase-managed PostgreSQL databases with encryption at rest and in transit. We use industry-standard security measures including:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>TLS/HTTPS encryption for all data in transit</li>
              <li>Row-level security policies at the database level</li>
              <li>Organization-scoped data isolation &mdash; each organization can only access its own data</li>
              <li>Secure OAuth 2.0 token storage for third-party integrations</li>
              <li>Security headers (HSTS, X-Frame-Options, CSP) on all responses</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">7. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active or as needed to provide the Service. If you delete your organization, all associated data (donors, donations, interactions, reports, and settings) is permanently deleted within 30 days.
            </p>
            <p>
              Usage and analytics data may be retained in anonymized form for up to 24 months for product improvement purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">8. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li><strong>Access</strong> &mdash; Request a copy of your personal data and donor data</li>
              <li><strong>Export</strong> &mdash; Download your organization&apos;s data in CSV format via the Settings page</li>
              <li><strong>Correction</strong> &mdash; Update inaccurate personal information</li>
              <li><strong>Deletion</strong> &mdash; Request deletion of your account and associated data</li>
              <li><strong>Portability</strong> &mdash; Receive your data in a structured, machine-readable format</li>
              <li><strong>Objection</strong> &mdash; Object to certain processing activities</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@vantagehq.com" className="text-foreground underline hover:opacity-80">
                privacy@vantagehq.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">9. Cookies</h2>
            <p>
              The Service uses essential cookies for authentication and session management. We use Vercel Analytics for basic usage metrics, which does not use cookies for tracking. We do not use advertising cookies or third-party tracking scripts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">10. Children&apos;s Privacy</h2>
            <p>
              The Service is not directed to individuals under 18 years of age. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child, we will delete it promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by email or through the Service at least 30 days before they take effect. The &quot;Last updated&quot; date at the top of this page indicates when the policy was last revised.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">12. Contact Us</h2>
            <p>
              If you have questions or concerns about this Privacy Policy or our data practices, please contact us at:
            </p>
            <p>
              Vantage Software, Inc.
              <br />
              <a href="mailto:privacy@vantagehq.com" className="text-foreground underline hover:opacity-80">
                privacy@vantagehq.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-16 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Vantage Software, Inc. All rights reserved. &middot;{" "}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
