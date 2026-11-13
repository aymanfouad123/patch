"use client";

import { useEffect, useState } from "react";
import { Button } from "./components/ui/button";

export type EnvironmentView = {
  installCommand: string;
  startCommand: string;
  port: number;
  healthPath: string;
  previewMode: boolean;
  version: number;
  status: string;
  verification: string;
  variables: { name: string; configured: boolean }[];
  candidates?: {
    name: string;
    stages: string[];
    blocked: boolean;
  }[];
  detected?: {
    installCommand: string;
    startCommand: string;
  };
  lastError?: string;
  lastMissingVariables?: string[];
  lastVerifiedAt?: number;
  verified?: {
    version: number;
    commitSha: string;
    durationMs: number;
    verifiedAt: number;
  };
};

export type EnvironmentProps = {
  environment: EnvironmentView;
  busy?: boolean;
  onDiscover: () => Promise<unknown>;
  onSave: (config: {
    installCommand: string;
    startCommand: string;
    port: number;
    healthPath: string;
    previewMode: boolean;
    variables: string[];
  }) => Promise<unknown>;
  onPrepare: () => Promise<unknown>;
};

function verificationLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function EnvironmentSection({
  environment,
  busy: externalBusy,
  onDiscover,
  onSave,
  onPrepare,
}: EnvironmentProps) {
  const [installCommand, setInstallCommand] = useState(environment.installCommand);
  const [startCommand, setStartCommand] = useState(environment.startCommand);
  const [previewMode, setPreviewMode] = useState(environment.previewMode);
  const [selected, setSelected] = useState(() =>
    environment.variables.map((variable) => variable.name),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setInstallCommand(environment.installCommand);
    setStartCommand(environment.startCommand);
    setPreviewMode(environment.previewMode);
    setSelected(environment.variables.map((variable) => variable.name));
  }, [environment]);

  async function act(step: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (caught) {
      const data =
        caught && typeof caught === "object" && "data" in caught ? caught.data : undefined;
      const message =
        typeof data === "string"
          ? data
          : data && typeof data === "object" && "message" in data
            ? String(data.message)
            : caught instanceof Error
              ? caught.message
              : String(caught);
      setError(`${step}: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || externalBusy;
  const needsSave =
    environment.version === 0 ||
    installCommand !== environment.installCommand ||
    startCommand !== environment.startCommand ||
    previewMode !== environment.previewMode ||
    selected.slice().sort().join(",") !==
      environment.variables
        .map(({ name }) => name)
        .sort()
        .join(",");
  return (
    <section
      aria-label="Environment"
      className="space-y-3 rounded-2xl border border-border px-4 py-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Environment</p>
        <span className="text-xs capitalize text-muted-foreground">
          {verificationLabel(environment.verification)}
        </span>
      </div>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Install</span>
        <input
          aria-label="Install command"
          value={installCommand}
          onChange={(event) => setInstallCommand(event.target.value)}
          className="w-full rounded-lg border border-input bg-background px-2 py-1 font-mono"
        />
      </label>
      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Start</span>
        <input
          aria-label="Start command"
          value={startCommand}
          onChange={(event) => setStartCommand(event.target.value)}
          className="w-full rounded-lg border border-input bg-background px-2 py-1 font-mono"
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={previewMode}
          onChange={(event) => setPreviewMode(event.target.checked)}
        />
        Preview mode (no development credentials)
      </label>
      {environment.candidates && environment.candidates.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">Detected candidates</legend>
          {environment.candidates.map((candidate) => {
            const configured = environment.variables.find(
              (variable) => variable.name === candidate.name,
            )?.configured;
            return (
              <label key={candidate.name} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  disabled={candidate.blocked}
                  checked={selected.includes(candidate.name)}
                  onChange={(event) =>
                    setSelected((names) =>
                      event.target.checked
                        ? [...new Set([...names, candidate.name])]
                        : names.filter((name) => name !== candidate.name),
                    )
                  }
                />
                <code>{candidate.name}</code>
                <span className="ml-auto text-muted-foreground">
                  {candidate.blocked
                    ? "Blocked"
                    : selected.includes(candidate.name)
                      ? configured
                        ? "Configured"
                        : previewMode
                          ? "Not required"
                          : "Missing"
                      : "Candidate"}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      {environment.lastMissingVariables?.length ? (
        <p className="text-xs text-amber-700">
          Reported missing at startup: {environment.lastMissingVariables.join(", ")}
        </p>
      ) : null}
      {environment.verified && (
        <p className="text-xs text-muted-foreground">
          Commit {environment.verified.commitSha.slice(0, 8)} · profile v
          {environment.verified.version} · {(environment.verified.durationMs / 1000).toFixed(1)}s
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => void act("Discovery failed", onDiscover)}
        >
          Discover
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            void act("Save failed", () =>
              onSave({
                installCommand,
                startCommand,
                port: environment.port,
                healthPath: environment.healthPath,
                previewMode,
                variables: selected,
              }),
            )
          }
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || needsSave || environment.status === "preparing"}
          onClick={() => void act("Preparation failed", onPrepare)}
        >
          Prepare environment
        </Button>
      </div>
      {needsSave && (
        <p className="text-xs text-muted-foreground">Save the environment before preparing.</p>
      )}
      {(error || environment.lastError) && (
        <p role="alert" className="whitespace-pre-wrap text-xs text-red-700">
          {error || environment.lastError}
        </p>
      )}
    </section>
  );
}
