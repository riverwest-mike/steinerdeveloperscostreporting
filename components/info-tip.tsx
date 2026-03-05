"use client";

/**
 * InfoTip — amber ⚠ icon with a hover tooltip.
 * Usage: <InfoTip text="Your guidance here." />
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group ml-1 align-middle">
      {/* Icon */}
      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 border border-amber-400 text-amber-700 text-[10px] font-bold cursor-help select-none leading-none">
        !
      </span>

      {/* Tooltip bubble */}
      <span
        role="tooltip"
        className={[
          "pointer-events-none absolute z-50",
          "bottom-full left-0 mb-2",
          "w-72 rounded-lg bg-slate-800 text-white",
          "px-3 py-2.5 text-xs leading-relaxed shadow-xl",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
        ].join(" ")}
      >
        {text}
        {/* Arrow */}
        <span className="absolute top-full left-4 border-[5px] border-transparent border-t-slate-800" />
      </span>
    </span>
  );
}
