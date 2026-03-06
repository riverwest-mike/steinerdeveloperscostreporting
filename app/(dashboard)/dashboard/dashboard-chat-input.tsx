"use client";

import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";

export function DashboardChatInput() {
  const [value, setValue] = useState("");

  function open(text?: string) {
    const query = (text ?? value).trim();
    window.dispatchEvent(new CustomEvent("open-ai-chat", { detail: query }));
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) open();
  }

  const suggestions = [
    "Summarize my active projects",
    "What are the pending change orders?",
    "Show unpaid bills this month",
  ];

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-4 space-y-3">
      {/* Label */}
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-primary tracking-wide uppercase">
          AI Assistant
        </span>
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40 transition-all">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your projects, costs, vendors, or reports…"
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          onClick={() => open()}
          disabled={!value.trim()}
          className="shrink-0 flex items-center justify-center h-7 w-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-colors"
          aria-label="Send"
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => open(s)}
            className="text-xs px-3 py-1.5 rounded-full border border-primary/25 bg-white text-primary/80 hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors font-medium"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
