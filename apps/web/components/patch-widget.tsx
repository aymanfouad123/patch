"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Patch, type PatchAuth, type SandboxJobView } from "@patch/react";
import { api } from "@convex/_generated/api";
import { authClient } from "@/lib/auth-client";

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

export function PatchWidget() {
  const searchParams = useSearchParams();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.patch.getViewer, isAuthenticated ? {} : "skip");
  const latestJob = useQuery(
    api.sandbox.latestJob,
    isAuthenticated && viewer?.status === "authorized" ? {} : "skip",
  );
  const workspace = useQuery(
    api.workspaces.latestWorkspace,
    isAuthenticated && viewer?.status === "authorized" ? {} : "skip",
  );
  const environment = useQuery(
    api.environment.getEnvironment,
    isAuthenticated && viewer?.status === "authorized" ? {} : "skip",
  );
  const startWorkspace = useMutation(api.workspaces.startWorkspace);
  const stopWorkspace = useMutation(api.workspaces.stopWorkspace);
  const createJob = useMutation(api.sandbox.createJob);
  const discoverEnvironment = useAction(api.environment.discoverEnvironment);
  const saveEnvironment = useMutation(api.environment.saveEnvironmentProfile);
  const prepareEnvironment = useMutation(api.environment.prepareEnvironment);
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

  const sandboxJob = useMemo<SandboxJobView | null>(() => {
    if (!latestJob) {
      return null;
    }
    return {
      status: latestJob.status,
      active: latestJob.active,
      stdout: latestJob.stdout,
      stderr: latestJob.stderr,
      error: latestJob.error,
      exitCode: latestJob.exitCode,
    };
  }, [latestJob]);

  const sandbox =
    auth.status === "authorized"
      ? {
          job: sandboxJob,
          starting,
          onStart: async () => {
            if (starting || sandboxJob?.active) {
              return;
            }
            setStarting(true);
            try {
              await createJob({});
            } finally {
              setStarting(false);
            }
          },
        }
      : undefined;

  return (
    <Patch
      auth={auth}
      sandbox={sandbox}
      environment={
        auth.status === "authorized" && environment
          ? {
              environment,
              onDiscover: () => discoverEnvironment({}),
              onSave: (config) => saveEnvironment(config),
              onPrepare: () => prepareEnvironment({}),
            }
          : undefined
      }
      workspace={
        auth.status === "authorized"
          ? {
              workspace: workspace ?? null,
              onStart: () => startWorkspace({}),
              onStop: async () => {
                if (workspace) await stopWorkspace({ id: workspace._id });
              },
            }
          : undefined
      }
    />
  );
}
