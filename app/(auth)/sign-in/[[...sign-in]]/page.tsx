import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="flex flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">River West Cost Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to access your projects
          </p>
        </div>
        <SignIn />
      </div>
    </div>
  );
}
