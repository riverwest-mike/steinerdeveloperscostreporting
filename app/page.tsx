import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  TrendingUp,
  ScrollText,
  Layers,
  ArrowRight,
  ClipboardList,
  Building2,
  FileSignature,
  Banknote,
  CheckCircle2,
  Lock,
  Eye,
  Gavel,
} from "lucide-react";
import { KilnLockup, KilnMark } from "@/components/brand/kiln-logo";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* ─── Top bar ─────────────────────────────────────────── */}
      <header className="border-b" style={{ background: "hsl(var(--sidebar-bg))" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <KilnLockup endorsed size="md" invert />
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--sidebar-bg)) 0%, hsl(0 0% 14%) 100%)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-4">
              Where projects take shape
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.05]">
              From soft numbers
              <br />
              to <span className="text-primary">hard commitments.</span>
            </h1>
            <p className="mt-6 text-base leading-relaxed max-w-lg" style={{ color: "hsl(36 14% 75%)" }}>
              KILN is the financial control system for real estate development.
              Control commitments. Forecast exposure. Approve with confidence.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/sign-in"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Sign in to KILN
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#advantage"
                className="text-sm font-medium text-white/70 hover:text-white transition-colors"
              >
                See how it works ↓
              </Link>
            </div>
          </div>

          {/* Right-hand visual: stacked phase blocks */}
          <div className="hidden lg:flex justify-end">
            <div className="relative w-full max-w-md">
              <div
                className="absolute inset-0 rounded-2xl"
                style={{
                  background:
                    "radial-gradient(circle at 70% 30%, hsl(15 63% 47% / 0.25) 0%, transparent 60%)",
                }}
              />
              <div className="relative space-y-3">
                {[
                  { n: "01", label: "Plan", note: "Ideas. Estimates. Moving targets." },
                  { n: "02", label: "Structure", note: "Budgets. Contracts. Intention becomes real." },
                  { n: "03", label: "Control", note: "Gates. Approvals. Money under control." },
                  { n: "04", label: "Build", note: "Draws. Changes. Execution with discipline." },
                  { n: "05", label: "Complete", note: "Closeout. Audit. A record that lasts." },
                ].map((step, i) => (
                  <div
                    key={step.n}
                    className="flex items-center gap-4 rounded-lg border border-white/10 px-4 py-3 backdrop-blur-sm"
                    style={{
                      background: `hsl(0 0% 100% / ${0.03 + i * 0.015})`,
                      marginLeft: `${i * 8}px`,
                    }}
                  >
                    <span className="font-mono text-xs text-primary tracking-wider shrink-0">{step.n}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{step.label}</p>
                      <p className="text-[11px]" style={{ color: "hsl(36 14% 70%)" }}>
                        {step.note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── The KILN Advantage ──────────────────────────────── */}
      <section id="advantage" className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-3">
              The KILN advantage
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">
              Most platforms track what happened.
              <br />
              <span className="text-muted-foreground">KILN structures the decisions that shape what happens next.</span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                Icon: ShieldCheck,
                title: "Control Points",
                body: "Every dollar passes through a defined control point with the right documentation, approvers, and financial context before it moves.",
              },
              {
                Icon: TrendingUp,
                title: "Forecast First",
                body: "The forecast is the number that drives every decision. Actuals and commitments are the evidence that keeps it accurate.",
              },
              {
                Icon: ScrollText,
                title: "Audit Ready",
                body: "Every action is recorded, versioned, and attributable. A complete, immutable financial record from start to finish.",
              },
              {
                Icon: Layers,
                title: "Portfolio Intelligence",
                body: "See exposure, variance, and control point health across your entire development pipeline.",
              },
            ].map(({ Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border bg-card p-6 hover:border-primary/40 transition-colors"
              >
                <div className="rounded-md border bg-primary/5 w-10 h-10 flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-xs font-semibold tracking-wider uppercase mb-2">{title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 5-step pipeline ─────────────────────────────────── */}
      <section className="py-20" style={{ background: "hsl(36 14% 95%)" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-3">
              From soft numbers to hard commitments
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">
              Every project follows the same disciplined path.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                Icon: ClipboardList,
                num: "01",
                title: "Plan",
                body: "Budgets, estimates, and assumptions come to life.",
              },
              {
                Icon: ShieldCheck,
                num: "02",
                title: "Control Point",
                body: "The right information. The right approvers. The right decision.",
                highlight: true,
              },
              {
                Icon: FileSignature,
                num: "03",
                title: "Commit",
                body: "Contracts, change orders, and commitments are captured and linked.",
              },
              {
                Icon: Banknote,
                num: "04",
                title: "Draw",
                body: "Funds are released only after approvals and conditions are met.",
              },
              {
                Icon: Building2,
                num: "05",
                title: "Close Out",
                body: "The project is complete. The record remains permanent.",
              },
            ].map(({ Icon, num, title, body, highlight }) => (
              <div
                key={num}
                className={
                  "rounded-xl border p-5 transition-colors " +
                  (highlight
                    ? "bg-primary text-primary-foreground border-primary shadow-lg"
                    : "bg-card hover:border-primary/40")
                }
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={
                      "font-mono text-[11px] tracking-wider " +
                      (highlight ? "text-primary-foreground/70" : "text-muted-foreground")
                    }
                  >
                    {num}
                  </span>
                  <Icon
                    className={
                      "h-4 w-4 " + (highlight ? "text-primary-foreground" : "text-primary")
                    }
                  />
                </div>
                <p
                  className={
                    "text-sm font-bold mb-1 " + (highlight ? "" : "text-foreground")
                  }
                >
                  {title}
                </p>
                <p
                  className={
                    "text-xs leading-relaxed " +
                    (highlight ? "text-primary-foreground/80" : "text-muted-foreground")
                  }
                >
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Built for developer decisions ───────────────────── */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-3">
              Built for developer decisions
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-8">
              See the full picture before you approve.
            </h2>
            <ul className="space-y-5">
              {[
                {
                  title: "Financial control",
                  body: "Every dollar passes through a defined control point — never around it.",
                },
                {
                  title: "Reduce surprises",
                  body: "Surface risk and exposure early, not at close.",
                },
                {
                  title: "Align stakeholders",
                  body: "Everyone works from the same data, the same approvals, the same forecast.",
                },
                {
                  title: "Sleep at night",
                  body: "Your projects. Your numbers. Your audit trail.",
                },
              ].map(({ title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold tracking-tight">{title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Mock dashboard panel */}
          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className="px-5 py-3 border-b bg-muted/30">
              <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                Portfolio overview
              </p>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total projects", value: "24" },
                { label: "Total commitments", value: "$412.6M" },
                { label: "Forecast to complete", value: "$287.3M" },
                { label: "Total exposure", value: "$112.8M" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border bg-background p-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="px-5 pb-5">
              <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-2">
                Control point health
              </p>
              <div className="rounded-lg border bg-background p-4 space-y-2">
                {[
                  { label: "On track", pct: 68, color: "bg-green-500" },
                  { label: "At risk", pct: 21, color: "bg-amber-500" },
                  { label: "Overdue", pct: 11, color: "bg-destructive" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-xs font-medium w-20 shrink-0">{row.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${row.color}`}
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
                      {row.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Development is risk. Control is an edge. ────────── */}
      <section className="py-20" style={{ background: "hsl(var(--sidebar-bg))" }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-primary mb-3">
              Development is risk
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight text-white">
              Control is an edge.
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                Icon: Lock,
                title: "100% Auditable record",
                body: "Every action captured. Every change tracked.",
              },
              {
                Icon: Eye,
                title: "Real-time visibility",
                body: "Know your forecast, exposure, and variance anytime.",
              },
              {
                Icon: Gavel,
                title: "Decisions that hold",
                body: "Approvals made today stand up tomorrow.",
              },
            ].map(({ Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
              >
                <div className="rounded-md w-10 h-10 flex items-center justify-center mb-4 bg-primary/20 border border-primary/30">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-semibold tracking-tight text-white mb-1.5">
                  {title}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "hsl(36 14% 70%)" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ───────────────────────────────────────── */}
      <section className="py-16 border-t border-b">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <KilnMark className="h-8 w-8 text-primary mx-auto mb-4" />
          <h2 className="text-2xl lg:text-3xl font-bold tracking-tight">
            Raw input. <span className="text-primary">Controlled process.</span> Lasting results.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
            KILN is where development gets financially locked in.
          </p>
          <div className="mt-6">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sign in to KILN
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <footer className="py-6">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <KilnMark className="h-4 w-4 text-primary" />
            <span>
              <span className="font-semibold tracking-tight text-foreground">KILN</span> by RiverWest
            </span>
          </div>
          <span>kilnhq.com</span>
        </div>
      </footer>
    </div>
  );
}
