import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUserOrgWithRole } from "@/lib/auth"

const BUCKET = "org-logos"
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"]

export async function POST(request: Request) {
  try {
    const auth = await getCurrentUserOrgWithRole()
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized", details: "Sign in to upload a logo." },
        { status: 401 }
      )
    }
    if (auth.role !== "owner") {
      return NextResponse.json(
        { error: "Forbidden", details: "Only organization owners can upload a logo." },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing or invalid file. Upload an image file." },
        { status: 400 }
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_BYTES / 1024 / 1024} MB.` },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Use PNG, JPEG, or WebP." },
        { status: 400 }
      )
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png"
    const safeExt = ["png", "jpeg", "jpg", "webp"].includes(ext) ? ext : "png"
    const path = `${auth.orgId}/logo.${safeExt}`

    const supabase = createAdminClient()
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type })

    if (error) {
      console.error("[organization/logo] Upload error:", error)
      return NextResponse.json(
        { error: "Upload failed", details: error.message },
        { status: 500 }
      )
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const url = urlData.publicUrl

    // Update organization logo_url
    await supabase
      .from("organizations")
      .update({ logo_url: url })
      .eq("id", auth.orgId)

    return NextResponse.json({ url })
  } catch (err) {
    console.error("[organization/logo] Unexpected error:", err)
    return NextResponse.json(
      { error: "Upload failed", details: String(err) },
      { status: 500 }
    )
  }
}
