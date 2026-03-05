import { SignOutButton } from "@clerk/nextjs";

export default function NotInvitedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="max-w-md w-full rounded-lg border p-8 text-center space-y-4">
        <h1 className="text-xl font-bold">Access Restricted</h1>
        <p className="text-sm text-muted-foreground">
          This application is invite-only. Your account has not been provisioned yet.
        </p>
        <p className="text-sm text-muted-foreground">
          Please contact an administrator to request access. Once they send you an invitation, sign up using the link in that email.
        </p>
        <SignOutButton>
          <button className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Sign Out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
