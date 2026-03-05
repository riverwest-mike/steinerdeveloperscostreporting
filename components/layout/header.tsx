import { UserButton } from "@clerk/nextjs";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6 print:hidden">
      <h1 className="text-lg font-semibold">{title}</h1>
      <UserButton afterSignOutUrl="/sign-in" />
    </header>
  );
}
