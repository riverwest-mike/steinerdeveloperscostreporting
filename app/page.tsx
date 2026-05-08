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

          {/* Right-hand visual: realistic app preview */}
          <div className="hidden lg:block">
            <AppPreview />
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

          {/* App-accurate dashboard mock */}
          <DashboardMock />
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

/* ─── Realistic app-surface mocks ──────────────────────────────────────────
 * These mirror the production look: charcoal sidebar with terracotta active
 * row, slate-800 dark table headers, status pills, and the same KPI card
 * layout the dashboard uses. Numbers are placeholder.
 * ──────────────────────────────────────────────────────────────────────── */

function AppPreview() {
  // Compact hero-side preview: sidebar + KPI strip + a table row.
  return (
    <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-background">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b" style={{ background: "hsl(0 0% 14%)" }}>
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        <span className="ml-3 text-[10px] font-mono text-white/50">app.kilnhq.com/dashboard</span>
      </div>
      <div className="flex h-[340px]">
        <MiniSidebar />
        <div className="flex-1 overflow-hidden bg-background">
          {/* Header */}
          <div className="px-4 py-3 border-b">
            <p className="text-[10px] text-muted-foreground tracking-wide">Projects / Northline</p>
            <p className="text-sm font-bold tracking-tight">Dashboard</p>
          </div>
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-2 p-3">
            {[
              { label: "Projects", value: "24" },
              { label: "Commitments", value: "$412.6M" },
              { label: "Forecast", value: "$287.3M" },
              { label: "Exposure", value: "$112.8M" },
            ].map((s) => (
              <div key={s.label} className="rounded-md border bg-card px-2.5 py-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className="text-sm font-bold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
          {/* Mini table preview */}
          <div className="px-3 pb-3">
            <div className="rounded-md border overflow-hidden">
              <div className="bg-slate-800 text-white text-[10px] font-medium px-2.5 py-1.5 flex">
                <span className="flex-1">Vendor</span>
                <span className="w-16 text-right">Amount</span>
                <span className="w-14 text-right">Status</span>
              </div>
              {[
                { v: "ACME Concrete", a: "$48,200", s: "Paid", color: "bg-green-100 text-green-800" },
                { v: "Northline Steel", a: "$112,000", s: "Unpaid", color: "bg-amber-100 text-amber-800" },
                { v: "Pacific Glazing", a: "$24,750", s: "Paid", color: "bg-green-100 text-green-800" },
              ].map((r) => (
                <div key={r.v} className="flex items-center px-2.5 py-1.5 text-[10px] border-t first:border-0">
                  <span className="flex-1 font-medium truncate">{r.v}</span>
                  <span className="w-16 text-right tabular-nums">{r.a}</span>
                  <span className="w-14 text-right">
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium ${r.color}`}>
                      {r.s}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardMock() {
  // Larger, more detailed mock for the "Built for developer decisions"
  // section. Shows the dashboard with full KPI strip + Recent Bills table
  // + a Pending COs side card — all using production styling tokens.
  return (
    <div className="rounded-xl overflow-hidden border shadow-md bg-background">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/40">
        <span className="h-2 w-2 rounded-full bg-red-400" />
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <span className="h-2 w-2 rounded-full bg-green-500" />
        <span className="ml-3 text-[10px] font-mono text-muted-foreground">app.kilnhq.com/dashboard</span>
      </div>
      <div className="flex">
        <MiniSidebar />
        <div className="flex-1 bg-background">
          {/* Header */}
          <div className="px-5 py-4 border-b">
            <p className="text-[11px] text-muted-foreground mb-1">Welcome back, Sarah.</p>
            <p className="text-base font-bold tracking-tight">Dashboard</p>
          </div>
          {/* KPI row — same layout as the real dashboard */}
          <div className="grid grid-cols-4 gap-3 p-4">
            {[
              { label: "Total Projects", value: "24" },
              { label: "Total Commitments", value: "$412.6M" },
              { label: "Forecast to Complete", value: "$287.3M" },
              { label: "Total Exposure", value: "$112.8M", trend: "12 pending COs" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border bg-card px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums">{s.value}</p>
                {s.trend && <p className="text-[10px] text-amber-600 font-medium mt-0.5">{s.trend}</p>}
              </div>
            ))}
          </div>
          {/* Recent Bills table */}
          <div className="px-4 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Recent Bills
            </p>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-left font-medium">Vendor</th>
                    <th className="px-3 py-2 text-left font-medium">Project</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Unpaid</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { d: "Apr 24", v: "ACME Concrete", p: "Northline", paid: "$48,200", unpaid: "—", s: "Paid", c: "bg-green-100 text-green-800" },
                    { d: "Apr 22", v: "Pacific Glazing", p: "Founders Row", paid: "$24,750", unpaid: "—", s: "Paid", c: "bg-green-100 text-green-800" },
                    { d: "Apr 20", v: "Northline Steel", p: "Northline", paid: "—", unpaid: "$112,000", s: "Unpaid", c: "bg-amber-100 text-amber-800" },
                    { d: "Apr 18", v: "Western Mech", p: "Harbor Point", paid: "$8,400", unpaid: "$3,200", s: "Partial", c: "bg-blue-100 text-blue-800" },
                  ].map((r) => (
                    <tr key={r.d + r.v} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{r.d}</td>
                      <td className="px-3 py-2 font-medium">
                        <span className="text-blue-600 hover:underline">{r.v}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.p}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-700">{r.paid}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700">{r.unpaid}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium ${r.c}`}>
                          {r.s}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniSidebar() {
  return (
    <aside
      className="w-32 sm:w-40 shrink-0 flex flex-col border-r"
      style={{ background: "hsl(var(--sidebar-bg))", borderColor: "hsl(var(--sidebar-border))" }}
    >
      <div className="px-3 py-3 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        <KilnLockup endorsed={false} size="sm" invert />
      </div>
      <nav className="flex-1 py-2 px-1.5 space-y-0.5">
        {[
          { label: "Dashboard", active: true },
          { label: "Projects" },
          { label: "Vendors" },
          { label: "Reporting" },
          { label: "Settings" },
        ].map((i) => (
          <div
            key={i.label}
            className="px-2 py-1.5 rounded-md text-[10px] font-medium"
            style={{
              background: i.active ? "hsl(var(--sidebar-active-bg))" : "transparent",
              color: i.active ? "white" : "hsl(var(--sidebar-fg))",
            }}
          >
            {i.label}
          </div>
        ))}
      </nav>
    </aside>
  );
}
