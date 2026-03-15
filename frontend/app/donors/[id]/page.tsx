import { redirect } from "next/navigation"

type PageProps = { params: Promise<{ id: string }> }

/**
 * Donor profile is shown in an in-page sheet, not a full page.
 * Redirect to dashboard with donor-crm view and donorId param so the sheet opens.
 */
export default async function DonorProfilePage({ params }: PageProps) {
  const { id } = await params
  redirect(`/dashboard?view=donor-crm&donorId=${encodeURIComponent(id)}`)
}
