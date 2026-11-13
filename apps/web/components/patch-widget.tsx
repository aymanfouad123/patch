"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { Patch, type PatchAuth } from "@patch/react";
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
  const deniedFromUrl =
    searchParams.get("patch") === "denied" || searchParams.has("error");

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

  return <Patch auth={auth} />;
}
