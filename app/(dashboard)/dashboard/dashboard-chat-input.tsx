"use client";

import { useState } from "react";
import { MessageCircle, ArrowRight } from "lucide-react";

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
    <div className="space-y-2">
      {/* Input bar */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm focus-within:ring-1 focus-within:ring-ring transition-shadow">
        <MessageCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your projects, costs, or reports…"
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
        {value.trim() && (
          <button
            onClick={() => open()}
            className="shrink-0 flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            aria-label="Send"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => open(s)}
            className="text-xs px-3 py-1 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
