"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { PanelShell } from "./panel-shell";
import { EnvironmentSection, type EnvironmentProps } from "./environment-section";

export type SandboxJobView = {
  status: "queued" | "starting" | "running" | "completed" | "failed";
  active: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  exitCode?: number;
};

export type AgentPanelSandboxProps = {
  job: SandboxJobView | null;
  starting: boolean;
  onStart: () => void | Promise<void>;
};

export type WorkspaceProps = {
  workspace: {
    _id: string;
    status: string;
    active: boolean;
    previewUrl?: string;
    expiresAt?: number;
    error?: string;
    purpose?: "prepare";
    profileVersion?: number;
    createdAt?: number;
  } | null;
  onStart: () => Promise<unknown>;
  onStop: () => Promise<unknown>;
};
function WorkspaceControls({ workspace, onStart, onStop }: WorkspaceProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Workspace"
      className="rounded-2xl border border-border px-4 py-3 text-sm space-y-2"
    >
      <p role="status">
        {workspace && !workspace.active
          ? "Previous workspace"
          : workspace?.purpose === "prepare"
            ? "Preparation workspace"
            : "Workspace"}
        : {workspace?.status ?? "Not started"}
      </p>
      {workspace && !workspace.active && (
        <p className="text-xs text-muted-foreground">
          Historical attempt
          {workspace.createdAt ? ` · ${new Date(workspace.createdAt).toLocaleString()}` : ""}
          {workspace.profileVersion !== undefined ? ` · profile v${workspace.profileVersion}` : ""}.
          Current preparation status is shown under Environment.
        </p>
      )}
      {workspace?.active && workspace.expiresAt && (
        <p className="text-xs text-muted-foreground">
          Expires {new Date(workspace.expiresAt).toLocaleTimeString()}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || workspace?.active}
          onClick={() => void act(onStart)}
        >
          Start workspace
        </Button>
        {workspace?.active && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || workspace.status === "stopping"}
            onClick={() => void act(onStop)}
          >
            Stop workspace
          </Button>
        )}
        {workspace?.status === "ready" && workspace.previewUrl && (
          <a href={workspace.previewUrl} target="_blank" rel="noopener noreferrer">
            Open preview
          </a>
        )}
      </div>
      {(error || (workspace?.active && workspace.error)) && (
        <p role="alert" className="text-red-700 whitespace-pre-wrap">
          {error || workspace?.error}
        </p>
      )}
      {workspace && !workspace.active && workspace.error && (
        <details className="text-xs text-muted-foreground">
          <summary>Previous workspace error</summary>
          <pre className="whitespace-pre-wrap">{workspace.error}</pre>
        </details>
      )}
    </section>
  );
}
export type AgentPanelProps = {
  environment?: EnvironmentProps;
  workspace?: WorkspaceProps;
  /** Connect your own agent. Without a handler, prompts stay in this local demo. */
  onPrompt?: (prompt: string) => string | void | Promise<string | void>;
  onSignOut?: () => void | Promise<void>;
  sandbox?: AgentPanelSandboxProps;
};

function sandboxStatusLabel(job: SandboxJobView) {
  switch (job.status) {
    case "queued":
      return "Queued";
    case "starting":
      return "Starting sandbox…";
    case "running":
      return "Running node -v…";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

export function AgentPanel({
  onPrompt,
  onSignOut,
  sandbox,
  workspace,
  environment,
}: AgentPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const busyRef = useRef(false);
  const sandboxBusy = Boolean(sandbox?.starting || sandbox?.job?.active);

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
        {workspace && <WorkspaceControls {...workspace} />}
        {sandbox && (
          <section
            aria-label="Sandbox test"
            className="rounded-2xl border border-border bg-violet-50/70 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">Sandbox</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={sandboxBusy}
                onClick={() => void sandbox.onStart()}
              >
                Test sandbox
              </Button>
            </div>
            {sandbox.job ? (
              <div className="mt-3 space-y-2 text-sm">
                <p role="status" className="text-muted-foreground">
                  Status: {sandboxStatusLabel(sandbox.job)}
                </p>
                {sandbox.job.status === "completed" && sandbox.job.stdout && (
                  <pre className="overflow-x-auto rounded-xl bg-white px-3 py-2 font-mono text-xs text-foreground whitespace-pre-wrap">
                    {sandbox.job.stdout.trim()}
                  </pre>
                )}
                {sandbox.job.status === "failed" && (
                  <p className="text-sm text-red-700 whitespace-pre-wrap">
                    {sandbox.job.error ?? sandbox.job.stderr ?? "Sandbox job failed."}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Run a short Vercel Sandbox job that executes node -v.
              </p>
            )}
          </section>
        )}
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
