import { redirect } from "next/navigation"

// Root path always goes to the marketing site. Users access the app via
// /login or /dashboard directly — bare `/` is reserved for marketing.
// In local dev there is no marketing site, so stay on the app.
export default function RootPage() {
  if (process.env.NODE_ENV === "development") {
    redirect("/dashboard")
  }
  redirect("https://vantagedonorai.com/")
}
