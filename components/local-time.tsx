"use client";

import { useEffect, useState } from "react";

interface LocalTimeProps {
  iso: string;
  /** Extra className applied to the time line */
  timeClassName?: string;
}

/**
 * Renders a timestamp in the browser's local timezone to avoid server-UTC
 * rendering. Renders empty on the server to prevent hydration mismatches.
 */
export function LocalTime({ iso, timeClassName = "text-[10px]" }: LocalTimeProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  useEffect(() => {
    const ts = new Date(iso);
    setDate(ts.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
    setTime(ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }, [iso]);

  return (
    <>
      <div>{date}</div>
      <div className={timeClassName}>{time}</div>
    </>
  );
}
