import { UserButton } from "@clerk/nextjs";
import { PageHelp, type PageHelpContent } from "@/components/page-help";

interface HeaderProps {
  title: string;
  helpContent?: PageHelpContent;
}

export function Header({ title, helpContent }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6 print:hidden">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        {helpContent && <PageHelp content={helpContent} />}
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
