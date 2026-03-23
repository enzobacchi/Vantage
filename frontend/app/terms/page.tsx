import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service - Vantage",
  description: "Vantage Terms of Service",
}

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="mb-10 text-sm text-muted-foreground">
          Last updated: March 22, 2026
        </p>

        <div className="prose prose-zinc dark:prose-invert max-w-none space-y-8 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Vantage (&quot;the Service&quot;), operated by Vantage Software, Inc. (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service.
            </p>
            <p>
              By creating an account, you represent that you are at least 18 years old and have the legal authority to enter into this agreement on behalf of yourself or the organization you represent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">2. Description of Service</h2>
            <p>
              Vantage is a donor relationship management platform designed for nonprofits and ministries. The Service includes donor data management, donation tracking, reporting, integrations with third-party accounting software, AI-powered insights, and communication tools.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.
            </p>
            <p>
              Each organization may invite multiple team members. The organization owner is responsible for managing access and permissions for all members.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
              <li>Upload or transmit malicious code, viruses, or harmful data</li>
              <li>Attempt to gain unauthorized access to other users&apos; accounts or data</li>
              <li>Use the Service to send unsolicited bulk communications (spam)</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
              <li>Resell or redistribute access to the Service without our written consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">5. Data Ownership and Privacy</h2>
            <p>
              You retain full ownership of all data you upload to or create within the Service (&quot;Your Data&quot;). We do not claim any ownership rights over Your Data.
            </p>
            <p>
              We process Your Data solely to provide and improve the Service, as described in our{" "}
              <Link href="/privacy" className="text-foreground underline hover:opacity-80">
                Privacy Policy
              </Link>
              . You are responsible for ensuring that your collection and use of donor data complies with all applicable privacy laws.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">6. AI Features</h2>
            <p>
              The Service includes AI-powered features such as donor insights and a chat assistant. These features are provided for informational purposes only. AI-generated content may contain inaccuracies and should be reviewed before acting upon it.
            </p>
            <p>
              Personal information is redacted before being sent to AI providers. However, you should not rely solely on AI suggestions for critical decisions regarding donor relationships or financial matters.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">7. Third-Party Integrations</h2>
            <p>
              The Service may integrate with third-party services (e.g., QuickBooks, email providers, mapping services). Your use of these integrations is subject to the respective third party&apos;s terms of service. We are not responsible for the availability, accuracy, or practices of third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">8. Payment and Billing</h2>
            <p>
              Paid subscription plans are billed in advance on a monthly or annual basis. All fees are non-refundable except as required by law. We reserve the right to change pricing with 30 days&apos; prior notice.
            </p>
            <p>
              If payment fails, we may suspend access to paid features until the outstanding balance is resolved.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">9. Service Availability</h2>
            <p>
              We strive to maintain high availability but do not guarantee uninterrupted access. We may perform scheduled maintenance with reasonable advance notice. We are not liable for any downtime, data loss, or interruptions caused by factors beyond our reasonable control.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">10. Termination</h2>
            <p>
              You may cancel your account at any time through the Settings page. Upon cancellation, your data will be retained for 30 days to allow for export, after which it will be permanently deleted.
            </p>
            <p>
              We may suspend or terminate your account if you violate these Terms or if your account remains inactive for an extended period, with reasonable notice where practicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, VANTAGE SOFTWARE, INC. SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE.
            </p>
            <p>
              Our total aggregate liability shall not exceed the amount you paid us in the twelve (12) months preceding the event giving rise to the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">12. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes by email or through the Service at least 30 days before they take effect. Your continued use of the Service after the effective date constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">13. Contact</h2>
            <p>
              If you have questions about these Terms, please contact us at{" "}
              <a href="mailto:legal@vantagehq.com" className="text-foreground underline hover:opacity-80">
                legal@vantagehq.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-16 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Vantage Software, Inc. All rights reserved. &middot;{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
