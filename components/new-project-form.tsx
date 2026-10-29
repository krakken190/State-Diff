"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { Button, Card, ErrorNote } from "./ui";

const PIN_MAP_HINT = "MOTOR_PIN = GPIO18 -> L9110S IN1\nDHT_PIN = GPIO4 -> DHT22 DATA";

export function NewProjectForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card className="h-fit p-5">
      <h2 className="font-semibold">New project</h2>
      <form
        className="mt-4 grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            const p = await api<{ id: string }>("/projects", {
              body: {
                name: String(f.get("name")),
                description: String(f.get("description") || "") || undefined,
                boardFamily: String(f.get("board") || "") || undefined,
                hardwareContext: String(f.get("pins") || "") || undefined,
              },
            });
            router.push(`/projects/${p.id}`);
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm">
          Name
          <input name="name" required maxLength={120} placeholder="ESP32 Motor Controller" className="rounded-lg border border-line bg-bg px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Board
          <input name="board" maxLength={40} placeholder="ESP32" className="rounded-lg border border-line bg-bg px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Description <span className="text-xs text-muted">(optional)</span>
          <input name="description" maxLength={2000} className="rounded-lg border border-line bg-bg px-3 py-2" />
        </label>
        <label className="grid gap-1 text-sm">
          Pin map <span className="text-xs text-muted">(optional, one per line; used to rank suspects)</span>
          <textarea name="pins" rows={3} maxLength={2000} placeholder={PIN_MAP_HINT} className="rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs" />
        </label>
        <ErrorNote message={error} />
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create project"}
        </Button>
      </form>
    </Card>
  );
}
