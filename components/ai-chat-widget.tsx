"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageCircle, X, Send, Loader2, Trash2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type Anthropic from "@anthropic-ai/sdk";

type Message = Anthropic.MessageParam & { id: string };

export function AiChatWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const isDashboard = pathname === "/dashboard";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for open-ai-chat events (from dashboard input or any other trigger)
  useEffect(() => {
    function handleOpen(e: Event) {
      const query = (e as CustomEvent<string>).detail;
      setOpen(true);
      if (query) setTimeout(() => sendMessage(query), 100);
    }
    window.addEventListener("open-ai-chat", handleOpen);
    return () => window.removeEventListener("open-ai-chat", handleOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
      const history = [...messages, userMsg];
      setMessages(history);
      setInput("");
      setStreaming(true);

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) throw new Error("Request failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m))
          );
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: "Something went wrong. Please try again." } : m
            )
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  function handleClose() {
    abortRef.current?.abort();
    setOpen(false);
  }

  function handleClear() {
    abortRef.current?.abort();
    setStreaming(false);
    setMessages([]);
    setInput("");
  }

  // ── Shared panel content ───────────────────────────────────────────────
  const panelContent = (
    <div className={cn(
      "flex flex-col bg-background overflow-hidden",
      isDashboard
        ? "w-full max-w-2xl h-[520px] rounded-xl border border-border shadow-2xl"
        : "w-[calc(100vw-3rem)] max-w-[360px] h-[min(500px,70vh)] rounded-xl border border-border shadow-2xl"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
            <MessageCircle className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold">Ask anything</span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Clear chat"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-center text-xs mt-8">
            Ask about projects, budgets, vendors, reports — anything in the app.
          </p>
        )}
        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            role={m.role as "user" | "assistant"}
            content={m.content as string}
            isStreaming={streaming && m === messages[messages.length - 1]}
            onNavigate={(href) => { setOpen(false); router.push(href); }}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 px-3 py-3 border-t border-border bg-card shrink-0"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question…"
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-h-28 overflow-y-auto"
          style={{ lineHeight: "1.4" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          aria-label="Send"
        >
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );

  // ── Dashboard: centered overlay (no floating bubble) ──────────────────
  if (isDashboard) {
    if (!open) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm print:hidden"
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        {panelContent}
      </div>
    );
  }

  // ── Other pages: bottom-right bubble + panel ──────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 print:hidden">
      {open && panelContent}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "h-12 w-12 rounded-full shadow-lg flex items-center justify-center transition-all",
          open
            ? "bg-muted text-muted-foreground hover:bg-muted/80"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
        aria-label={open ? "Close chat" : "Open AI assistant"}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </div>
  );
}

// ── ChatMessage ──────────────────────────────────────────────────────────────

function ChatMessage({ role, content, isStreaming, onNavigate }: { role: "user" | "assistant"; content: string; isStreaming: boolean; onNavigate: (href: string) => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap bg-primary text-primary-foreground text-sm">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start group">
      <div className="max-w-[95%] relative">
        {/* Copy button — appears on hover */}
        {content && !isStreaming && (
          <button
            onClick={handleCopy}
            className="absolute -top-1 -right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1 bg-muted border border-border shadow-sm text-muted-foreground hover:text-foreground"
            title="Copy response"
            aria-label="Copy response"
          >
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          </button>
        )}

        <div className="rounded-lg px-3 py-2 bg-muted text-foreground text-sm prose prose-sm prose-slate max-w-none
          [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:my-2
          [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-slate-200
          [&_td]:px-2 [&_td]:py-1.5 [&_td]:border [&_td]:border-slate-200
          [&_tr:hover]:bg-slate-50/60
          [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0
          [&_ul]:my-1 [&_ul]:pl-4 [&_li]:my-0.5
          [&_ol]:my-1 [&_ol]:pl-4
          [&_strong]:font-semibold [&_code]:text-[11px] [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded
          [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1
          [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1
          [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-0.5
          [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground
        ">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => {
                const isInternal = href && href.startsWith("/");
                if (isInternal) {
                  return (
                    <button
                      onClick={() => onNavigate(href)}
                      className="text-primary underline underline-offset-2 hover:opacity-75 font-medium"
                    >
                      {children}
                    </button>
                  );
                }
                return (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-75">
                    {children}
                  </a>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current opacity-70 animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}
