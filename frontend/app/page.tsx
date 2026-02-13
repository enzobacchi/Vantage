import { redirect } from "next/navigation"

/**
 * Root path: send users into the app. Dashboard layout will redirect to /login if not authenticated.
 */
export default function RootPage() {
  redirect("/dashboard")
}
