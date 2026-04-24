import { redirect } from "next/navigation"

import { getCurrentUserOrg } from "@/lib/auth"
import { ChatProvider } from "@/components/chat/chat-provider"

export default async function ChatRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userOrg = await getCurrentUserOrg()
  if (!userOrg) {
    redirect("/login?next=/chat")
  }
  return <ChatProvider>{children}</ChatProvider>
}
