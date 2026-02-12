import { Suspense } from "react";

import SettingsClient from "./SettingsClient";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-600">Loading settings…</div>}>
      <SettingsClient />
    </Suspense>
  );
}

