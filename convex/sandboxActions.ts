"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { readSandboxCredentials } from "./lib/sandboxCredentials";
import {
  runNodeVersionInSandbox,
  type SandboxFactory,
} from "./lib/runSandboxJob";

async function getVercelSandboxFactory(): Promise<SandboxFactory> {
  const { Sandbox } = await import("@vercel/sandbox");
  return {
    create: async (params) => {
      const sandbox = await Sandbox.create(params);
      return {
        name: sandbox.name,
        runCommand: (command, args, opts) =>
          sandbox.runCommand(command, args, opts),
        stop: () => sandbox.stop(),
      };
    },
  };
}

export const runJob = internalAction({
  args: { jobId: v.id("sandboxJobs") },
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.sandbox.markStarting, {
      jobId: args.jobId,
    });
    if (!claimed) {
      return;
    }

    let credentials;
    try {
      credentials = readSandboxCredentials();
    } catch (error) {
      await ctx.runMutation(internal.sandbox.markFailed, {
        jobId: args.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const result = await runNodeVersionInSandbox({
      factory: await getVercelSandboxFactory(),
      credentials,
      sandboxName: `patch-${args.jobId}`,
      onCreated: async (sandboxName) => {
        const running = await ctx.runMutation(internal.sandbox.markRunning, {
          jobId: args.jobId,
          sandboxName,
        });
        if (!running) {
          throw new Error("Sandbox job left the starting state before running");
        }
      },
    });

    if (result.ok) {
      await ctx.runMutation(internal.sandbox.markCompleted, {
        jobId: args.jobId,
        stdout: result.stdout,
        stderr: result.stderr || undefined,
        exitCode: result.exitCode,
      });
    } else {
      await ctx.runMutation(internal.sandbox.markFailed, {
        jobId: args.jobId,
        error: result.error,
        stderr: result.stderr,
        exitCode: result.exitCode,
        sandboxName: result.sandboxName,
      });
    }

    if (result.stopError) {
      await ctx.runMutation(internal.sandbox.recordStopError, {
        jobId: args.jobId,
        error: result.stopError,
      });
    }
  },
});
