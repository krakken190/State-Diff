import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface ${className}`}>{children}</section>;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-strong text-white hover:brightness-110 border-transparent",
  secondary: "bg-raised text-fg border-line hover:border-accent",
  ghost: "bg-transparent text-muted border-transparent hover:text-fg",
  danger: "bg-transparent text-danger border-line hover:border-danger",
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Sha({ sha, dirty }: { sha?: string | null; dirty?: number | boolean | null }) {
  if (!sha) return <span className="text-xs text-muted">Not linked</span>;
  return (
    <span className="font-mono text-xs" title={sha}>
      {sha.slice(0, 7)}
      {dirty ? <span className="text-warning"> +dirty</span> : null}
    </span>
  );
}

const TEST_STYLE: Record<string, { cls: string; icon: string; label: string }> = {
  pass: { cls: "text-success border-success/40", icon: "✓", label: "PASS" },
  fail: { cls: "text-danger border-danger/40", icon: "✕", label: "FAIL" },
  error: { cls: "text-danger border-danger/40", icon: "!", label: "ERROR" },
  skipped: { cls: "text-muted border-line", icon: "–", label: "SKIP" },
  unknown: { cls: "text-unknown border-line", icon: "?", label: "UNKNOWN" },
};

/** Status is always conveyed by icon + text, never colour alone. */
export function TestBadge({ status, name, source }: { status: string; name?: string; source?: string }) {
  const s = TEST_STYLE[status] ?? TEST_STYLE.unknown;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {name ? <span className="text-fg">{name}</span> : null}
      <span>{s.label}</span>
      {source ? <span className="text-muted">· {source}</span> : null}
    </span>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft · no photo",
  captured: "Photo added",
  analyzing: "Analyzing visible components",
  needs_review: "Needs review",
  sealed: "Sealed",
  analysis_failed: "Analysis failed",
};

export function CheckpointStatus({ status }: { status: string }) {
  const tone = status === "sealed" ? "text-success" : status === "analysis_failed" ? "text-danger" : status === "needs_review" ? "text-warning" : "text-muted";
  return <span className={`text-xs ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export const PROVENANCE_LABEL: Record<string, string> = {
  VISION_INFERRED: "AI observation",
  USER_CONFIRMED: "Confirmed by you",
  TEST_OBSERVED: "Test result",
  GIT_OBSERVED: "Git metadata",
  UNKNOWN: "Unknown",
};

export function ProvenanceTag({ provenance }: { provenance: string }) {
  const confirmed = provenance === "USER_CONFIRMED";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${confirmed ? "border-success/50 text-success" : "border-dashed border-line text-muted"}`}>
      <span aria-hidden>{confirmed ? "●" : "◌"}</span>
      {PROVENANCE_LABEL[provenance] ?? provenance}
    </span>
  );
}

export function confidenceBand(c: number | null | undefined): string {
  if (c == null) return "Not assessed";
  if (c >= 0.8) return "High visual confidence";
  if (c >= 0.5) return "Medium visual confidence";
  return "Low visual confidence";
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
