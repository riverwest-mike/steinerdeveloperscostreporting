import { UserButton } from "@clerk/nextjs";
import { PageHelp, type PageHelpContent } from "@/components/page-help";
import { MobileNavTrigger } from "./mobile-nav-trigger";

interface HeaderProps {
  title: string;
  helpContent?: PageHelpContent;
}

export function Header({ title, helpContent }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6 print:hidden">
      <div className="flex items-center gap-2 min-w-0">
        <MobileNavTrigger />
        <h1 className="text-lg font-semibold text-foreground truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {helpContent && <PageHelp content={helpContent} />}
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
