"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Map, { Marker, Popup } from "react-map-gl/mapbox";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Donor = {
  id: string;
  display_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  total_lifetime_value: number | null;
  last_donation_date: string | null; // YYYY-MM-DD
  billing_address: string | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(isoDate: string) {
  // isoDate is typically YYYY-MM-DD
  const d = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" }).format(
    d
  );
}

function cityStateFromAddress(address: string | null) {
  if (!address) return "";
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // Common format from our QB address string builder: "... , City, ST, Postal, Country"
  const stateIdx = parts.findIndex((p) => /^[A-Z]{2}$/.test(p));
  if (stateIdx > 0) {
    const city = parts[stateIdx - 1];
    const state = parts[stateIdx];
    return `${city}, ${state}`;
  }

  // Fallback: show the tail of the address
  return parts.slice(-2).join(", ");
}

export default function MapPage() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const [donors, setDonors] = useState<Donor[]>([]);
  const [selected, setSelected] = useState<Donor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError(null);
        const res = await fetch("/api/donors");
        const json = (await res.json()) as { donors?: Donor[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load donors.");
        if (!cancelled) setDonors(json.donors ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load donors.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const pins = useMemo(
    () =>
      donors.filter(
        (d) =>
          typeof d.location_lat === "number" &&
          typeof d.location_lng === "number" &&
          !Number.isNaN(d.location_lat) &&
          !Number.isNaN(d.location_lng)
      ),
    [donors]
  );

  if (!mapboxToken) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 text-zinc-900">
        <p className="text-sm text-red-600">
          Missing <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> in <code>.env.local</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div className="h-[calc(100vh-64px)] min-h-screen w-full">
        <Map
          mapboxAccessToken={mapboxToken}
          initialViewState={{ latitude: 39.5, longitude: -98.35, zoom: 3.5 }}
          mapStyle="mapbox://styles/mapbox/light-v11"
          style={{ width: "100%", height: "100%" }}
        >
          {pins.map((d) => {
            const ltv = d.total_lifetime_value ?? 0;
            const isGold = ltv >= 5000;

            return (
              <Marker
                key={d.id}
                latitude={d.location_lat as number}
                longitude={d.location_lng as number}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelected(d);
                }}
              >
                <div
                  title={d.display_name ?? "Donor"}
                  className="h-3.5 w-3.5 rounded-full border border-white shadow-sm"
                  style={{
                    backgroundColor: isGold ? "#f59e0b" : "#2563eb",
                  }}
                />
              </Marker>
            );
          })}

          {selected && selected.location_lat != null && selected.location_lng != null ? (
            <Popup
              latitude={selected.location_lat}
              longitude={selected.location_lng}
              anchor="top"
              closeOnClick={false}
              onClose={() => setSelected(null)}
              maxWidth="320px"
            >
              <Card className="border-0 shadow-none">
                <CardHeader className="p-3 pb-0">
                  <CardTitle className="text-sm font-semibold">
                    {selected.display_name ?? "Unknown Donor"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-2 space-y-1">
                  <div className="text-xs text-zinc-700">
                    <span className="font-medium">LTV:</span>{" "}
                    {formatCurrency(selected.total_lifetime_value ?? 0)}
                  </div>
                  <div className="text-xs text-zinc-700">
                    <span className="font-medium">Last Gift:</span>{" "}
                    {selected.last_donation_date ? formatDate(selected.last_donation_date) : "N/A"}
                  </div>
                  <div className="text-xs text-zinc-700">
                    <span className="font-medium">Address:</span>{" "}
                    {cityStateFromAddress(selected.billing_address) || "N/A"}
                  </div>
                </CardContent>
              </Card>
            </Popup>
          ) : null}
        </Map>
      </div>

      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
        <Button asChild className="pointer-events-auto" size="sm" variant="secondary">
          <Link href="/">Back to Dashboard</Link>
        </Button>

        {error ? (
          <div className="pointer-events-auto rounded-md border bg-white px-3 py-2 text-xs text-red-600 shadow-sm">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

