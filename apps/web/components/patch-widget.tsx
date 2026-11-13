"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Patch, type PatchAuth, type RunView } from "@patch/react";
import { api } from "@convex/_generated/api";
import { authClient } from "@/lib/auth-client";

const SERVER_URL = (process.env.NEXT_PUBLIC_PATCH_SERVER_URL ?? "http://localhost:8787").replace(
  /\/$/,
  "",
);

async function signInWithGitHub() {
  await authClient.signIn.social({
    provider: "github",
    callbackURL: "/",
    errorCallbackURL: "/?patch=denied",
  });
}

async function signOut() {
  await authClient.signOut();
}

async function ownerJwt() {
  const { data } = await authClient.convex.token({ fetchOptions: { throw: false } });
  if (!data?.token) throw new Error("Could not get Convex auth token");
  return data.token;
}

async function serverFetch(path: string, init?: RequestInit) {
  const token = await ownerJwt();
  const response = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return body;
}

export function PatchWidget() {
  const searchParams = useSearchParams();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.patch.getViewer, isAuthenticated ? {} : "skip");
  const latestRun = useQuery(
    api.runs.latest,
    isAuthenticated && viewer?.status === "authorized" ? {} : "skip",
  );
  const environment = useQuery(
    api.environment.getEnvironment,
    isAuthenticated && viewer?.status === "authorized" ? {} : "skip",
  );
  const discoverEnvironment = useAction(api.environment.discoverEnvironment);
  const saveEnvironment = useMutation(api.environment.saveEnvironmentProfile);
  const [starting, setStarting] = useState(false);
  const deniedFromUrl = searchParams.get("patch") === "denied" || searchParams.has("error");

  const auth = useMemo<PatchAuth>(() => {
    if (isLoading || (isAuthenticated && viewer === undefined)) {
      return { status: "loading" };
    }

    if (!isAuthenticated) {
      if (deniedFromUrl) {
        return { status: "unauthorized", signOut };
      }
      return { status: "signedOut", signIn: signInWithGitHub };
    }

    if (!viewer || viewer.status === "signedOut") {
      return { status: "signedOut", signIn: signInWithGitHub };
    }

    if (viewer.status === "unauthorized") {
      return { status: "unauthorized", signOut };
    }

    return {
      status: "authorized",
      signOut,
      user: viewer.user,
    };
  }, [deniedFromUrl, isAuthenticated, isLoading, viewer]);

  const runView = useMemo<RunView | null>(() => {
    if (!latestRun) return null;
    return {
      id: latestRun.id,
      status: latestRun.status,
      stage: latestRun.stage,
      previewUrl: latestRun.previewUrl,
      diagnostics: latestRun.diagnostics,
      failedStage: latestRun.failedStage,
      active: latestRun.active,
      readyUntil: latestRun.readyUntil,
    };
  }, [latestRun]);

  return (
    <Patch
      auth={auth}
      run={
        auth.status === "authorized"
          ? {
              run: runView,
              starting,
              onCancel: async () => {
                if (!runView) return;
                await serverFetch(`/runs/${runView.id}/cancel`, { method: "POST" });
              },
            }
          : undefined
      }
      environment={
        auth.status === "authorized" && environment
          ? {
              environment,
              onDiscover: () => discoverEnvironment({}),
              onSave: (config) => saveEnvironment(config),
              onPrepare: async () => {
                if (starting || runView?.active) return;
                setStarting(true);
                try {
                  await serverFetch("/runs", {
                    method: "POST",
                    body: JSON.stringify({ kind: "environment_test" }),
                  });
                } finally {
                  setStarting(false);
                }
              },
            }
          : undefined
      }
    />
  );
}
