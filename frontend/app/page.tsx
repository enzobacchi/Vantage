import { redirect } from "next/navigation"

// Root path always goes to the marketing site. Users access the app via
// /login or /dashboard directly — bare `/` is reserved for marketing.
export default function RootPage() {
  redirect("https://vantagedonorai.com/")
}
