import { SignOutButton } from "@clerk/nextjs";
import { KilnLockup } from "@/components/brand/kiln-logo";

export default function NotInvitedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-lg border bg-card p-8 text-center space-y-5 shadow-sm">
        <div className="flex justify-center">
          <KilnLockup endorsed size="md" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Access Restricted</h1>
        <p className="text-sm text-muted-foreground">
          KILN is invite-only. Your account has not been provisioned yet.
        </p>
        <p className="text-sm text-muted-foreground">
          Please contact an administrator to request access. Once they send you an invitation, sign up using the link in that email.
        </p>
        <SignOutButton>
          <button className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Sign Out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
