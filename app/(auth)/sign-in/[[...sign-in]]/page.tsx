import { SignIn } from "@clerk/nextjs";
import { KilnLockup } from "@/components/brand/kiln-logo";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div
        className="hidden lg:flex lg:w-[420px] xl:w-[480px] shrink-0 flex-col justify-between p-10"
        style={{ background: "hsl(var(--sidebar-bg))" }}
      >
        <KilnLockup endorsed size="lg" invert />

        {/* Centre copy */}
        <div>
          <h1 className="text-3xl font-bold leading-tight text-white mb-4">
            Where projects
            <br />
            take shape.
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "hsl(36 14% 70%)" }}>
            KILN is the financial control system for real estate development.
            Control commitments. Forecast exposure. Approve with confidence.
          </p>

          {/* Feature pills */}
          <div className="mt-8 flex flex-wrap gap-2">
            {[
              "Forecast first",
              "Gate approvals",
              "Contract commitments",
              "Change order workflow",
              "Audit-ready record",
              "Portfolio intelligence",
            ].map((f) => (
              <span
                key={f}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: "hsl(var(--sidebar-hover-bg))",
                  color: "hsl(36 14% 80%)",
                  border: "1px solid hsl(var(--sidebar-border))",
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
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <KilnLockup endorsed size="md" />
          </div>

          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Sign in
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Access your projects, gates, and forecasts.
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
                  "bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-md shadow-sm",
                formFieldInput:
                  "border border-input bg-background rounded-md text-sm focus:ring-1 focus:ring-ring",
                footerActionLink: "text-primary hover:text-primary/80",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
