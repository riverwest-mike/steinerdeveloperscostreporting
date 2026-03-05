"use client";

export function TimeGreeting({ name }: { name: string | null | undefined }) {
  const hour = new Date().getHours();
  const salutation =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      {salutation}
      {name ? `, ${name}` : ""}
    </>
  );
}
