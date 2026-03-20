import { redirect } from "next/navigation"

type PageProps = { params: Promise<{ id: string }> }

/**
 * Redirect to the full donor profile page under the dashboard layout.
 */
export default async function DonorProfilePage({ params }: PageProps) {
  const { id } = await params
  redirect(`/dashboard/donors/${encodeURIComponent(id)}`)
}
