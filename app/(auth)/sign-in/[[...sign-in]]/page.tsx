import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] shrink-0 flex-col justify-between p-10"
        style={{ background: "hsl(215 45% 11%)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "hsl(165 68% 28%)" }}
          >
            <span className="text-sm font-black text-white leading-none">SD</span>
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight text-white">Steiner Developers</p>
            <p className="text-[11px] leading-tight" style={{ color: "hsl(215 20% 52%)" }}>
              Cost Tracker
            </p>
          </div>
        </div>

        {/* Centre copy */}
        <div>
          <h1 className="text-3xl font-bold leading-tight text-white mb-4">
            Project Cost
            <br />
            Management
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "hsl(215 20% 62%)" }}>
            Track budgets, gates, AppFolio transactions, contracts, and change orders — all in one place.
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap gap-2">
            {[
              "Budget vs. actuals",
              "Gate / phase tracking",
              "Contract commitments",
              "Change order workflow",
              "AppFolio integration",
              "Vendor cost detail",
            ].map((f) => (
              <span
                key={f}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: "hsl(215 45% 16%)",
                  color: "hsl(215 20% 75%)",
                  border: "1px solid hsl(215 45% 22%)",
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Spacer to balance the three-section flex layout */}
        <div />
      </div>

      {/* Right panel — sign-in form */}
      <div className="flex flex-1 items-center justify-center bg-[hsl(216_33%_97%)] p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "hsl(165 68% 28%)" }}
            >
              <span className="text-sm font-black text-white leading-none">SD</span>
            </div>
            <div>
              <p className="text-[15px] font-bold leading-tight" style={{ color: "hsl(215 30% 13%)" }}>
                Steiner Developers
              </p>
              <p className="text-[11px] leading-tight text-muted-foreground">Cost Tracker</p>
            </div>
          </div>

          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "hsl(215 30% 13%)" }}>
              Sign in
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Access your projects and cost reports.
            </p>
          </div>

          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border-0 bg-transparent p-0",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton:
                  "border border-input bg-background hover:bg-accent text-sm font-medium rounded-md shadow-sm",
                formButtonPrimary:
                  "bg-[hsl(165_68%_28%)] hover:bg-[hsl(165_68%_23%)] text-white text-sm font-medium rounded-md shadow-sm",
                formFieldInput:
                  "border border-input bg-background rounded-md text-sm focus:ring-1 focus:ring-[hsl(165_68%_28%)]",
                footerActionLink: "text-[hsl(165_68%_28%)] hover:text-[hsl(165_68%_23%)]",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
