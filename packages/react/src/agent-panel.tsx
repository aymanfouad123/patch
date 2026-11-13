"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { PanelShell } from "./panel-shell";
import { EnvironmentSection, type EnvironmentProps } from "./environment-section";

export type RunView = {
  id: string;
  status: string;
  stage?: string;
  previewUrl?: string;
  diagnostics?: string;
  failedStage?: string;
  active: boolean;
  readyUntil?: number;
};

export type RunProps = {
  run: RunView | null;
  starting?: boolean;
  onCancel?: () => Promise<unknown>;
};

function RunControls({ run, starting, onCancel }: RunProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!run && !starting) return null;
  return (
    <section
      aria-label="Environment test run"
      className="rounded-2xl border border-border px-4 py-3 text-sm space-y-2"
    >
      <p role="status">
        Run: {starting && !run ? "enqueueing…" : (run?.status ?? "idle")}
        {run?.stage ? ` · ${run.stage}` : ""}
      </p>
      {run?.readyUntil && run.status === "ready" && (
        <p className="text-xs text-muted-foreground">
          Preview until {new Date(run.readyUntil).toLocaleTimeString()}
        </p>
      )}
      <div className="flex gap-2">
        {run?.status === "ready" && run.previewUrl && (
          <a href={run.previewUrl} target="_blank" rel="noopener noreferrer">
            Open preview
          </a>
        )}
        {run?.active && onCancel && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void onCancel()
                .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                .finally(() => setBusy(false));
            }}
          >
            Cancel run
          </Button>
        )}
      </div>
      {(error || run?.diagnostics) && (
        <p role="alert" className="text-red-700 whitespace-pre-wrap text-xs">
          {error || run?.diagnostics}
        </p>
      )}
    </section>
  );
}

export type AgentPanelProps = {
  environment?: EnvironmentProps;
  run?: RunProps;
  /** Connect your own agent. Without a handler, prompts stay in this local demo. */
  onPrompt?: (prompt: string) => string | void | Promise<string | void>;
  onSignOut?: () => void | Promise<void>;
};

export function AgentPanel({ onPrompt, onSignOut, environment, run }: AgentPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const busyRef = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || busyRef.current) return;
    busyRef.current = true;
    setMessages((items) => [...items, { role: "user", text: value }]);
    setPrompt("");
    setPending(true);
    try {
      const reply = onPrompt
        ? await onPrompt(value)
        : "You’ve found the Patch demo. Connect an agent with the onPrompt prop to bring this conversation to life.";
      if (reply) setMessages((items) => [...items, { role: "assistant", text: reply }]);
    } catch {
      setMessages((items) => [
        ...items,
        { role: "assistant", text: "Something went wrong. Please try sending your message again." },
      ]);
    } finally {
      busyRef.current = false;
      setPending(false);
    }
  }

  return (
    <PanelShell
      title="Patch"
      description="Ask a question using the prompt below."
      onSignOut={onSignOut}
    >
      <div
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-busy={pending}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-6"
      >
        {environment && <EnvironmentSection {...environment} />}
        {run && <RunControls {...run} />}
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-8 rounded-2xl rounded-br-sm bg-violet-100 px-4 py-3 text-sm leading-6 break-words whitespace-pre-wrap"
                : "mr-4 text-sm leading-6 break-words whitespace-pre-wrap text-muted-foreground"
            }
          >
            <span className="sr-only">{message.role === "user" ? "You: " : "Patch: "}</span>
            {message.text}
          </div>
        ))}
        {pending && (
          <p role="status" className="text-xs text-muted-foreground">
            Thinking…
          </p>
        )}
      </div>
      <div className="px-4 pb-4">
        <form
          ref={formRef}
          onSubmit={submit}
          className="rounded-2xl border border-border bg-white p-2 shadow-sm focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100"
        >
          <Textarea
            aria-label="Message Patch"
            placeholder="Message…"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
            className="min-h-16 max-h-36 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex justify-end px-1 pb-1">
            <Button
              type="submit"
              size="icon"
              aria-label="Send message"
              disabled={!prompt.trim() || pending}
              className="size-8 bg-[#7961aa] hover:bg-[#654c96]"
            >
              <ArrowUp />
            </Button>
          </div>
        </form>
      </div>
    </PanelShell>
  );
}
