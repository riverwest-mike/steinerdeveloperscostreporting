import { cn } from "@/lib/utils";

interface KilnMarkProps {
  className?: string;
  title?: string;
}

/**
 * KILN "chamber" mark — a solid block with a rectangular kiln-doorway notch
 * cut into the bottom edge. Inherits color from `currentColor`, so set it
 * with text-* utilities (e.g. text-primary, text-white).
 */
export function KilnMark({ className, title = "KILN" }: KilnMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      role="img"
      aria-label={title}
      className={cn("h-6 w-6", className)}
    >
      <path d="M3 3h26v26h-9V18h-8v11H3V3Z" />
    </svg>
  );
}

interface KilnLockupProps {
  /** Show the "by RiverWest" endorser line under the wordmark. */
  endorsed?: boolean;
  /** Visual scale of the lockup. */
  size?: "sm" | "md" | "lg";
  /** Force light text (use on dark surfaces). */
  invert?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { mark: "h-5 w-5", word: "text-[13px]", endorser: "text-[10px]" },
  md: { mark: "h-7 w-7", word: "text-base", endorser: "text-[11px]" },
  lg: { mark: "h-9 w-9", word: "text-xl", endorser: "text-xs" },
};

/**
 * KILN lockup — the chamber mark beside the wordmark, optionally with the
 * "by RiverWest" endorser line. Used in headers, sidebars, and auth pages.
 */
export function KilnLockup({
  endorsed = false,
  size = "md",
  invert = false,
  className,
}: KilnLockupProps) {
  const s = sizeMap[size];
  const wordColor = invert ? "text-white" : "text-foreground";
  const endorserColor = invert
    ? "text-[hsl(var(--sidebar-muted))]"
    : "text-muted-foreground";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <KilnMark className={cn(s.mark, "text-primary shrink-0")} />
      <div className="min-w-0 leading-tight">
        <p
          className={cn(
            "font-extrabold tracking-tight uppercase",
            s.word,
            wordColor
          )}
        >
          KILN
        </p>
        {endorsed && (
          <p className={cn(s.endorser, endorserColor)}>by RiverWest</p>
        )}
      </div>
    </div>
  );
}
