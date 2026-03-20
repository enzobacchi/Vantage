import { tool } from "ai"
import { z } from "zod"

import { createAdminClient } from "@/lib/supabase/admin"
import { getDonorLifecycleStatus } from "@/lib/donor-lifecycle"

export function buildTools(orgId: string) {
  const supabase = createAdminClient()

  return {
    search_donors: tool({
      description:
        "Search and list donors. Use this for questions like 'who are my top donors', 'show me donors', 'list donors'. Returns donor profiles with IDs, names, lifetime giving, location, and lifecycle status. Results are sorted by lifetime giving (highest first) by default.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Name search (partial match)"),
        lifecycle_status: z
          .enum(["New", "Active", "Lapsed", "Lost"])
          .optional()
          .describe("Filter by computed lifecycle status"),
        donor_type: z
          .enum(["individual", "corporate", "school", "church"])
          .optional()
          .describe("Filter by donor type"),
        min_lifetime_value: z
          .number()
          .optional()
          .describe("Minimum lifetime giving amount"),
        max_lifetime_value: z
          .number()
          .optional()
          .describe("Maximum lifetime giving amount"),
        limit: z
          .number()
          .min(1)
          .max(25)
          .optional()
          .describe("Max results to return (default 10)"),
      }),
      execute: async ({
        query,
        lifecycle_status,
        donor_type,
        min_lifetime_value,
        max_lifetime_value,
        limit = 10,
      }) => {
        let q = supabase
          .from("donors")
          .select(
            "id,display_name,email,donor_type,total_lifetime_value,last_donation_date,city,state"
          )
          .eq("org_id", orgId)
          .order("total_lifetime_value", {
            ascending: false,
            nullsFirst: false,
          })

        if (query?.trim()) {
          q = q.ilike("display_name", `%${query.trim()}%`)
        }
        if (donor_type) {
          q = q.eq("donor_type", donor_type)
        }
        if (min_lifetime_value != null) {
          q = q.gte("total_lifetime_value", min_lifetime_value)
        }
        if (max_lifetime_value != null) {
          q = q.lte("total_lifetime_value", max_lifetime_value)
        }

        // Fetch more than needed if filtering by lifecycle (computed in-memory)
        const fetchLimit = lifecycle_status ? 200 : limit
        q = q.limit(fetchLimit)

        const { data, error } = await q
        if (error) return { error: "Failed to search donors." }

        let donors = (data ?? []).map((d) => {
          const lc = getDonorLifecycleStatus(d)
          return {
            id: d.id,
            display_name: d.display_name,
            email: d.email,
            donor_type: d.donor_type,
            total_lifetime_value: d.total_lifetime_value,
            last_donation_date: d.last_donation_date,
            lifecycle_status: lc.status,
            is_major_donor: lc.isMajor,
            city: d.city,
            state: d.state,
          }
        })

        if (lifecycle_status) {
          donors = donors.filter((d) => d.lifecycle_status === lifecycle_status)
        }

        return { donors: donors.slice(0, limit), total_found: donors.length }
      },
    }),

    get_donor_summary: tool({
      description:
        "Get a detailed summary of a specific donor including their profile, recent donations, interactions, tags, and opportunities.",
      inputSchema: z.object({
        donor_id: z.string().describe("The donor's ID"),
      }),
      execute: async ({ donor_id }) => {
        const [donorRes, donationsRes, interactionsRes, tagsRes, oppsRes] =
          await Promise.all([
            supabase
              .from("donors")
              .select("*")
              .eq("id", donor_id)
              .eq("org_id", orgId)
              .single(),
            supabase
              .from("donations")
              .select("id,amount,date,memo,payment_method")
              .eq("donor_id", donor_id)
              .eq("org_id", orgId)
              .order("date", { ascending: false, nullsFirst: false })
              .limit(10),
            supabase
              .from("interactions")
              .select(
                "id,type,direction,subject,date,status,donors!inner(org_id)"
              )
              .eq("donor_id", donor_id)
              .eq("donors.org_id", orgId)
              .order("date", { ascending: false })
              .limit(10),
            supabase
              .from("donor_tags")
              .select("tags(name)")
              .eq("donor_id", donor_id),
            supabase
              .from("opportunities")
              .select("id,title,amount,status,expected_date")
              .eq("donor_id", donor_id)
              .eq("organization_id", orgId)
              .order("created_at", { ascending: false })
              .limit(5),
          ])

        if (donorRes.error || !donorRes.data) {
          return { error: "Donor not found." }
        }

        const donor = donorRes.data
        const lc = getDonorLifecycleStatus(donor)

        return {
          profile: {
            display_name: donor.display_name,
            email: donor.email,
            phone: donor.phone,
            donor_type: donor.donor_type,
            city: donor.city,
            state: donor.state,
            total_lifetime_value: donor.total_lifetime_value,
            last_donation_date: donor.last_donation_date,
            lifecycle_status: lc.status,
            is_major_donor: lc.isMajor,
            notes: donor.notes,
          },
          recent_donations: (donationsRes.data ?? []).map((d) => ({
            amount: d.amount,
            date: d.date,
            memo: d.memo,
            payment_method: d.payment_method,
          })),
          recent_interactions: (interactionsRes.data ?? []).map((i) => ({
            type: i.type,
            direction: i.direction,
            subject: i.subject,
            date: i.date,
            status: i.status,
          })),
          tags: (tagsRes.data ?? [])
            .map((t) => {
              const tag = t.tags as unknown as { name: string } | null
              return tag?.name
            })
            .filter(Boolean),
          opportunities: (oppsRes.data ?? []).map((o) => ({
            title: o.title,
            amount: o.amount,
            status: o.status,
            expected_date: o.expected_date,
          })),
        }
      },
    }),

    get_donation_metrics: tool({
      description:
        "Get aggregate donation statistics: total revenue, average gift size, donor counts, and breakdowns by lifecycle/type. Use this for summary questions like 'how much did we raise' or 'what are our metrics'. Do NOT use this to list individual donors — use search_donors instead.",
      inputSchema: z.object({
        from_date: z
          .string()
          .optional()
          .describe("Start date (YYYY-MM-DD)"),
        to_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
      }),
      execute: async ({ from_date, to_date }) => {
        let donationQuery = supabase
          .from("donations")
          .select("amount,date,donor_id")
          .eq("org_id", orgId)

        if (from_date) donationQuery = donationQuery.gte("date", from_date)
        if (to_date) donationQuery = donationQuery.lte("date", to_date)

        const { data: donations, error } = await donationQuery
        if (error) return { error: "Failed to load donation metrics." }

        const rows = donations ?? []
        const totalRevenue = rows.reduce((s, d) => s + Number(d.amount), 0)
        const uniqueDonors = new Set(rows.map((d) => d.donor_id))

        // Get donor details for lifecycle breakdown
        const donorIds = [...uniqueDonors]
        const lifecycleCounts: Record<string, number> = {}
        const typeCounts: Record<string, number> = {}

        if (donorIds.length > 0) {
          const { data: donors } = await supabase
            .from("donors")
            .select(
              "id,donor_type,last_donation_date,total_lifetime_value"
            )
            .eq("org_id", orgId)
            .in("id", donorIds)

          for (const d of donors ?? []) {
            const lc = getDonorLifecycleStatus(d)
            lifecycleCounts[lc.status] =
              (lifecycleCounts[lc.status] ?? 0) + 1
            typeCounts[d.donor_type] = (typeCounts[d.donor_type] ?? 0) + 1
          }
        }

        return {
          total_count: rows.length,
          total_revenue: totalRevenue,
          average_gift:
            rows.length > 0
              ? Math.round((totalRevenue / rows.length) * 100) / 100
              : 0,
          unique_donor_count: uniqueDonors.size,
          donors_by_lifecycle: lifecycleCounts,
          donors_by_type: typeCounts,
        }
      },
    }),

    filter_donations: tool({
      description:
        "Search individual donation transaction records. Use this when the user asks about specific gifts, donation amounts, or payment details. Do NOT use this to find 'top donors' — use search_donors instead.",
      inputSchema: z.object({
        donor_id: z
          .string()
          .optional()
          .describe("Filter to a specific donor"),
        from_date: z
          .string()
          .optional()
          .describe("Start date (YYYY-MM-DD)"),
        to_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
        min_amount: z.number().optional().describe("Minimum donation amount"),
        max_amount: z.number().optional().describe("Maximum donation amount"),
        payment_method: z
          .string()
          .optional()
          .describe(
            "Payment method filter (check, cash, zelle, wire, venmo, daf, other, quickbooks)"
          ),
        campaign_name: z
          .string()
          .optional()
          .describe("Campaign name (partial match)"),
        fund_name: z
          .string()
          .optional()
          .describe("Fund name (partial match)"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results (default 20)"),
      }),
      execute: async ({
        donor_id,
        from_date,
        to_date,
        min_amount,
        max_amount,
        payment_method,
        campaign_name,
        fund_name,
        limit = 20,
      }) => {
        let q = supabase
          .from("donations")
          .select(
            "id,donor_id,amount,date,memo,payment_method,category_id,campaign_id,fund_id,donors(id,display_name)"
          )
          .eq("org_id", orgId)
          .order("date", { ascending: false, nullsFirst: false })
          .limit(limit)

        if (donor_id) q = q.eq("donor_id", donor_id)
        if (from_date) q = q.gte("date", from_date)
        if (to_date) q = q.lte("date", to_date)
        if (min_amount != null) q = q.gte("amount", min_amount)
        if (max_amount != null) q = q.lte("amount", max_amount)
        if (payment_method) q = q.eq("payment_method", payment_method)

        const { data, error } = await q
        if (error) return { error: "Failed to search donations." }

        const rows = data ?? []

        // Resolve campaign/fund names
        const optionIds = new Set<string>()
        rows.forEach((r: Record<string, unknown>) => {
          if (r.campaign_id) optionIds.add(r.campaign_id as string)
          if (r.fund_id) optionIds.add(r.fund_id as string)
          if (r.category_id) optionIds.add(r.category_id as string)
        })

        const optionNames: Record<string, string> = {}
        if (optionIds.size > 0) {
          const ids = [...optionIds]
          const [cats, camps, funds] = await Promise.all([
            supabase
              .from("gift_categories")
              .select("id,name")
              .in("id", ids),
            supabase
              .from("gift_campaigns")
              .select("id,name")
              .in("id", ids),
            supabase.from("gift_funds").select("id,name").in("id", ids),
          ])
          for (const o of [
            ...(cats.data ?? []),
            ...(camps.data ?? []),
            ...(funds.data ?? []),
          ]) {
            optionNames[o.id] = o.name ?? ""
          }
        }

        let donations = rows.map((r: Record<string, unknown>) => {
          const donors = r.donors as {
            id?: string | null
            display_name?: string | null
          } | null
          return {
            donor_id: (r.donor_id as string) ?? donors?.id ?? null,
            donor_name: donors?.display_name ?? "Unknown",
            amount: Number(r.amount) || 0,
            date: r.date as string | null,
            payment_method: (r.payment_method as string) || "other",
            memo: r.memo as string | null,
            campaign_name: r.campaign_id
              ? optionNames[r.campaign_id as string] ?? null
              : null,
            fund_name: r.fund_id
              ? optionNames[r.fund_id as string] ?? null
              : null,
            category_name: r.category_id
              ? optionNames[r.category_id as string] ?? null
              : null,
          }
        })

        // Client-side filter by campaign/fund name if requested
        if (campaign_name) {
          const lower = campaign_name.toLowerCase()
          donations = donations.filter(
            (d) =>
              d.campaign_name &&
              d.campaign_name.toLowerCase().includes(lower)
          )
        }
        if (fund_name) {
          const lower = fund_name.toLowerCase()
          donations = donations.filter(
            (d) =>
              d.fund_name && d.fund_name.toLowerCase().includes(lower)
          )
        }

        return { donations, total_found: donations.length }
      },
    }),

    create_donor: tool({
      description:
        "Create a new donor in the CRM. Use this when a user mentions someone who isn't in the system yet. You should first search_donors to confirm they don't already exist. Only required field is display_name — collect other details if the user provides them, but don't block on optional fields.",
      inputSchema: z.object({
        display_name: z.string().describe("Full name of the donor"),
        email: z.string().optional().describe("Email address"),
        phone: z.string().optional().describe("Phone number"),
        billing_address: z.string().optional().describe("Street address"),
        city: z.string().optional().describe("City"),
        state: z.string().optional().describe("State abbreviation (e.g. CA, TX)"),
        zip: z.string().optional().describe("ZIP code"),
        donor_type: z
          .enum(["individual", "corporate", "school", "church"])
          .optional()
          .describe("Type of donor (default: individual)"),
      }),
      execute: async ({ display_name, email, phone, billing_address, city, state, zip, donor_type }) => {
        const name = display_name.trim()
        if (!name) return { error: "Display name is required." }

        // Check for duplicates
        const { data: existing } = await supabase
          .from("donors")
          .select("id,display_name")
          .eq("org_id", orgId)
          .ilike("display_name", name)
          .limit(3)

        if (existing && existing.length > 0) {
          return {
            warning: "Possible duplicate donors found",
            existing_donors: existing.map((d) => ({ id: d.id, display_name: d.display_name })),
            message: "A donor with a similar name already exists. Please confirm if you want to create a new donor or use the existing one.",
          }
        }

        const { data, error: insertErr } = await supabase
          .from("donors")
          .insert({
            org_id: orgId,
            display_name: name,
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            billing_address: billing_address?.trim() || null,
            city: city?.trim() || null,
            state: state?.trim() || null,
            zip: zip?.trim() || null,
            donor_type: donor_type || "individual",
            total_lifetime_value: 0,
            last_donation_date: null,
            last_donation_amount: null,
          })
          .select("id,display_name")
          .single()

        if (insertErr) return { error: `Failed to create donor: ${insertErr.message}` }

        return {
          success: true,
          donor_id: data.id,
          display_name: data.display_name,
          message: `Created new donor "${data.display_name}".`,
        }
      },
    }),

    create_donation: tool({
      description:
        "Create a new donation for a donor. The AI must first search for the donor to get their ID, then confirm the details with the user before calling this tool. Always confirm amount, donor, date, and payment method before creating.",
      inputSchema: z.object({
        donor_id: z.string().describe("The donor's ID (look up via search_donors first)"),
        amount: z.number().positive().describe("Donation amount in dollars"),
        date: z
          .string()
          .describe("Donation date in YYYY-MM-DD format. Use today's date if not specified."),
        payment_method: z
          .enum(["check", "cash", "zelle", "wire", "venmo", "daf", "other"])
          .describe("Payment method"),
        memo: z.string().optional().describe("Optional memo or note about the donation"),
      }),
      execute: async ({ donor_id, amount, date, payment_method, memo }) => {
        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return { error: "Date must be in YYYY-MM-DD format." }
        }

        // Verify donor belongs to this org
        const { data: donor, error: donorErr } = await supabase
          .from("donors")
          .select("id,display_name")
          .eq("id", donor_id)
          .eq("org_id", orgId)
          .maybeSingle()

        if (donorErr || !donor) {
          return { error: "Donor not found in your organization." }
        }

        // Insert the donation
        const { data: donation, error: insertErr } = await supabase
          .from("donations")
          .insert({
            org_id: orgId,
            donor_id,
            amount,
            date,
            payment_method,
            memo: memo?.trim() || null,
            source: "manual",
          })
          .select("id")
          .single()

        if (insertErr) {
          return { error: `Failed to create donation: ${insertErr.message}` }
        }

        // Recalculate donor totals
        const { data: allDonations } = await supabase
          .from("donations")
          .select("amount,date")
          .eq("donor_id", donor_id)
          .order("date", { ascending: false })

        const rows = (allDonations ?? []) as { amount: number; date: string }[]
        const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0)
        const last = rows[0]

        await supabase
          .from("donors")
          .update({
            total_lifetime_value: total,
            last_donation_date: last?.date ?? null,
            last_donation_amount: last?.amount ?? null,
          })
          .eq("id", donor_id)

        return {
          success: true,
          donation_id: donation.id,
          donor_name: donor.display_name,
          amount,
          date,
          payment_method,
        }
      },
    }),

    get_recent_activity: tool({
      description:
        "Get recent interactions/touchpoints (emails, calls, meetings, notes, tasks) across all donors.",
      inputSchema: z.object({
        type: z
          .enum(["email", "call", "meeting", "note", "task"])
          .optional()
          .describe("Filter by interaction type"),
        limit: z
          .number()
          .min(1)
          .max(30)
          .optional()
          .describe("Max results (default 15)"),
      }),
      execute: async ({ type, limit = 15 }) => {
        let q = supabase
          .from("interactions")
          .select(
            "id,type,direction,subject,date,status,donors!inner(display_name,org_id)"
          )
          .eq("donors.org_id", orgId)
          .order("date", { ascending: false })
          .limit(limit)

        if (type) q = q.eq("type", type)

        const { data, error } = await q
        if (error) return { error: "Failed to load recent activity." }

        const activities = (data ?? []).map(
          (i: Record<string, unknown>) => {
            const donors = i.donors as {
              display_name?: string | null
            } | null
            return {
              donor_name: donors?.display_name ?? "Unknown",
              type: i.type,
              direction: i.direction,
              subject: i.subject,
              date: i.date,
              status: i.status,
            }
          }
        )

        return { activities, total_found: activities.length }
      },
    }),

    get_donor_locations: tool({
      description:
        "Get a geographic breakdown of where donors are located. Returns counts by state and city. Use this when asked about donor locations, geography, or where donors are concentrated.",
      inputSchema: z.object({
        group_by: z
          .enum(["state", "city"])
          .optional()
          .describe("Group by state or city (default: state)"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results (default 20)"),
      }),
      execute: async ({ group_by = "state", limit = 20 }) => {
        const { data, error } = await supabase
          .from("donors")
          .select("id,display_name,city,state")
          .eq("org_id", orgId)
          .not(group_by === "city" ? "city" : "state", "is", null)

        if (error) return { error: "Failed to load donor locations." }

        const rows = data ?? []

        // Group and count
        const counts: Record<string, { count: number; donors: { id: string; name: string }[] }> = {}
        for (const d of rows) {
          const key = group_by === "city"
            ? `${d.city ?? "Unknown"}, ${d.state ?? ""}`
            : (d.state ?? "Unknown")
          if (!counts[key]) counts[key] = { count: 0, donors: [] }
          counts[key].count++
          if (counts[key].donors.length < 3) {
            counts[key].donors.push({ id: d.id, name: d.display_name ?? "Unknown" })
          }
        }

        // Sort by count descending
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, limit)
          .map(([location, info]) => ({
            location,
            donor_count: info.count,
            sample_donors: info.donors,
          }))

        return {
          total_donors_with_location: rows.length,
          locations: sorted,
        }
      },
    }),
  }
}
