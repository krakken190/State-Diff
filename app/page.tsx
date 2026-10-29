import Link from "next/link";
import { connection } from "next/server";
import { NewProjectForm } from "@/components/new-project-form";
import { Card, timeAgo } from "@/components/ui";
import { listProjects } from "@/lib/repo/projects";

export default async function Home() {
  await connection();
  const projects = listProjects();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-muted">Each project tracks one bench: photos, Git commits and test results, checkpoint by checkpoint.</p>
        {projects.length === 0 ? (
          <Card className="mt-6 p-6 text-muted">Create your first hardware project.</Card>
        ) : (
          <ul className="mt-6 grid gap-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block rounded-xl border border-line bg-surface p-4 hover:border-accent">
                  <div className="font-medium">{p.name}</div>
                  {p.description ? <div className="mt-1 text-sm text-muted">{p.description}</div> : null}
                  <div className="mt-2 text-xs text-muted">Created {timeAgo(p.created_at)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <NewProjectForm />
    </div>
  );
}
