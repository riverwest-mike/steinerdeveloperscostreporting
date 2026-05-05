import { SignUp } from "@clerk/nextjs";
import { KilnLockup } from "@/components/brand/kiln-logo";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <div className="flex flex-col items-center gap-6">
        <KilnLockup endorsed size="lg" />
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Create your account</p>
        </div>
        <SignUp />
      </div>
    </div>
  );
}
