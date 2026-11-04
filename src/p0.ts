#!/usr/bin/env -S node --experimental-strip-types
/**
 * P0 integration probe for pi-rex-agents.
 *
 * It creates a disposable Rex session, a child block, launches an interactive
 * Pi in that block, verifies OSC 7501 status transitions, captures output,
 * sends a follow-up, closes the child and confirms the parent session survives.
 *
 * Usage:
 *   npm run p0
 *   npm run p0 -- --model CBAPI/cn:deepseek-v4.1-flash --keep
 *   npm run p0 -- --session session:... --keep
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RexCli, shellQuote } from "./rex-cli.ts";
import { RexSurfaceProvider } from "./rex-surface-provider.ts";

interface P0Options {
  keep: boolean;
  sessionId?: string;
  cwd: string;
  model?: string;
  timeoutMs: number;
}

interface Transition {
  at: string;
  state: string;
  message?: string;
}

const CHILD_TOKEN = "P0_CHILD_OK";
const FOLLOWUP_TOKEN = "P0_FOLLOWUP_OK";

function parseArgs(argv: string[]): P0Options {
  let keep = false;
  let sessionId: string | undefined;
  let cwd = mkdtempSync(join(tmpdir(), "pi-rex-p0-"));
  let model = process.env.P0_PI_MODEL;
  let timeoutMs = 120_000;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--keep":
        keep = true;
        break;
      case "--session":
        sessionId = argv[++i];
        if (!sessionId) throw new Error("--session needs a session id");
        break;
      case "--cwd":
        cwd = argv[++i];
        if (!cwd) throw new Error("--cwd needs a path");
        break;
      case "--model":
        model = argv[++i];
        if (!model) throw new Error("--model needs a provider/model id");
        break;
      case "--timeout-ms":
        timeoutMs = Number(argv[++i]);
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
          throw new Error("--timeout-ms must be a positive number");
        }
        break;
      case "--help":
      case "-h":
        console.log(
          [
            "Usage: npm run p0 -- [options]",
            "  --keep             keep the disposable session for inspection",
            "  --session <id>     use an existing session (never killed by this script)",
            "  --cwd <path>       child working directory (default: temp dir)",
            "  --model <id>       pass --model to the child Pi",
            "  --timeout-ms <n>   per-run timeout (default: 120000)",
          ].join("\n"),
        );
        process.exit(0);
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return { keep, sessionId, cwd, model, timeoutMs };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function now(): string {
  return new Date().toISOString();
}

function buildChildCommand(name: string, prompt: string, model?: string): string {
  const args = [
    "PI_PROGRAM_STATUS=1",
    "pi",
    "--no-extensions",
    "--no-skills",
    "--no-context-files",
    "--no-mcp",
    "--no-session",
    "--name",
    shellQuote(name),
    "--tui-mode",
    "fullscreen",
  ];
  if (model) args.push("--model", shellQuote(model));
  args.push(shellQuote(prompt));
  return args.join(" ");
}

async function waitForWorking(
  provider: RexSurfaceProvider,
  blockId: string,
  timeoutMs: number,
  transitions: Transition[],
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  let terminalSince: number | undefined;
  while (Date.now() < deadline) {
    const inspection = await provider.inspectSurface(blockId);
    const state = inspection.state ?? inspection.agentStatus;
    if (state !== last) {
      transitions.push({ at: now(), state, message: inspection.message });
      last = state;
    }
    if (inspection.agentStatus === "working") return true;
    if (inspection.agentStatus === "done" || inspection.agentStatus === "idle") {
      // A finished prior turn can still be the last reported state for a
      // short moment after the next prompt is submitted. Give the child a
      // grace period to report working before treating it as already done.
      terminalSince ??= Date.now();
      if (Date.now() - terminalSince >= 5_000) return false;
    } else {
      terminalSince = undefined;
    }
    if (inspection.agentStatus === "blocked") {
      throw new Error(`child blocked before completing: ${inspection.message ?? "unknown"}`);
    }
    await sleep(250);
  }
  throw new Error("timed out waiting for the child to report working");
}

async function waitForTerminal(
  provider: RexSurfaceProvider,
  blockId: string,
  timeoutMs: number,
  transitions: Transition[],
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const inspection = await provider.inspectSurface(blockId);
    const state = inspection.state ?? inspection.agentStatus;
    if (state !== last) {
      transitions.push({ at: now(), state, message: inspection.message });
      last = state;
    }
    if (inspection.agentStatus === "done" || inspection.agentStatus === "idle") {
      return;
    }
    if (inspection.agentStatus === "blocked") {
      throw new Error(`child blocked while waiting for completion: ${inspection.message ?? "unknown"}`);
    }
    await sleep(250);
  }
  throw new Error("timed out waiting for the child to finish");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const cli = new RexCli();
  const ownsSession = !options.sessionId;
  let sessionId = options.sessionId;
  let childBlockId: string | undefined;
  let sessionCreated = false;
  let keep = options.keep || !ownsSession;
  const transitions: Transition[] = [];

  const cleanup = async () => {
    if (childBlockId) {
      try {
        await cli.closeBlock(sessionId!, childBlockId);
      } catch {
        // Best effort only; the session cleanup below is the hard stop.
      }
    }
    if (ownsSession && sessionCreated && !keep && sessionId) {
      try {
        await cli.killSession(sessionId);
      } catch {
        // Best effort only.
      }
    }
  };

  try {
    if (!sessionId) {
      const label = `pi-rex-p0-${Date.now()}`;
      const created = await cli.newSession(label, options.cwd);
      sessionId = created.session_id;
      sessionCreated = true;
    }

    const initial = await cli.inspectSession(sessionId);
    const initialBlock = initial.windows
      .flatMap((window) => window.layers.flatMap((layer) => layer.blocks))
      .at(0)?.block_id;
    if (!initialBlock) throw new Error("Rex session has no initial block");

    const focusBefore = initial.windows.find(
      (window) => window.window_id === initial.active_window_id,
    )?.focused_block_id;

    console.log(
      JSON.stringify(
        {
          event: "session",
          sessionId,
          label: initial.label,
          initialBlock,
          focusBefore,
          cwd: options.cwd,
          model: options.model ?? null,
        },
        null,
        2,
      ),
    );

    const provider = new RexSurfaceProvider({
      sessionId,
      cli,
      anchorBlockId: initialBlock,
    });

    childBlockId = await provider.createSurface({
      name: "p0-child",
      cwd: options.cwd,
      placement: { kind: "split", direction: "right" },
    });

    await sleep(250);
    const afterSplit = await cli.inspectSession(sessionId);
    const focusAfter = afterSplit.windows.find(
      (window) => window.window_id === afterSplit.active_window_id,
    )?.focused_block_id;
    const focusStable = focusBefore === focusAfter;
    if (!focusStable) {
      throw new Error(`rex split stole focus: ${focusBefore} -> ${focusAfter}`);
    }

    console.log(
      JSON.stringify(
        {
          event: "surface-created",
          childBlockId,
          focusStable,
          surfaces: await provider.listSurfaces(),
        },
        null,
        2,
      ),
    );

    const prompt = `Reply with exactly ${CHILD_TOKEN} and nothing else.`;
    const childCommand = buildChildCommand("p0-child", prompt, options.model);
    console.log(JSON.stringify({ event: "launch", command: childCommand }, null, 2));
    await provider.runCommand(childBlockId, childCommand);

    const sawWorking = await waitForWorking(
      provider,
      childBlockId,
      30_000,
      transitions,
    );
    if (!sawWorking) {
      console.warn(
        "warning: child completed before the first working observation; continuing",
      );
    }
    await waitForTerminal(provider, childBlockId, options.timeoutMs, transitions);

    const firstCapture = await provider.readScreen(childBlockId, 80);
    if (!firstCapture.includes(CHILD_TOKEN)) {
      throw new Error(
        `first child output did not contain ${CHILD_TOKEN}:\n${firstCapture.slice(-4000)}`,
      );
    }

    const followup = `Reply with exactly ${FOLLOWUP_TOKEN} and nothing else.`;
    await provider.runCommand(childBlockId, followup);
    const sawFollowupWorking = await waitForWorking(
      provider,
      childBlockId,
      30_000,
      transitions,
    );
    if (!sawFollowupWorking) {
      console.warn(
        "warning: follow-up completed before the first working observation; continuing",
      );
    }
    await waitForTerminal(provider, childBlockId, options.timeoutMs, transitions);

    const secondCapture = await provider.readScreen(childBlockId, 80);
    if (!secondCapture.includes(FOLLOWUP_TOKEN)) {
      throw new Error(
        `follow-up output did not contain ${FOLLOWUP_TOKEN}:\n${secondCapture.slice(-4000)}`,
      );
    }

    const inspection = await provider.inspectSurface(childBlockId);
    const processInfo = await provider.getProcessInfo(childBlockId);
    if (processInfo.pids.length === 0) {
      throw new Error("getProcessInfo returned no pids");
    }

    const agentPid = await provider.getAgentPid(childBlockId);
    if (!agentPid) {
      throw new Error("program_status did not report an owner pid");
    }
    if (!processInfo.pids.includes(agentPid)) {
      throw new Error(`agent pid ${agentPid} is not in the surface process tree`);
    }
    const foreground = processInfo.foregroundProcesses[0];
    if (!foreground || foreground.pid !== agentPid) {
      throw new Error(
        `agent pid ${agentPid} does not match foreground ${foreground?.pid ?? "missing"}`,
      );
    }

    const surfacesBeforeClose = await provider.listSurfaces();
    if (!surfacesBeforeClose.some((surface) => surface.id === childBlockId)) {
      throw new Error("child surface disappeared before close");
    }

    await provider.closeSurface(childBlockId);
    await provider.waitForSurfaceAbsence(childBlockId);
    const afterClose = await cli.inspectSession(sessionId);
    const blocksAfterClose = afterClose.windows.flatMap((window) =>
      window.layers.flatMap((layer) => layer.blocks.map((block) => block.block_id)),
    );
    if (blocksAfterClose.includes(childBlockId)) {
      throw new Error("child block still present after close");
    }
    if (!blocksAfterClose.includes(initialBlock)) {
      throw new Error("parent block disappeared after closing the child");
    }

    console.log(
      JSON.stringify(
        {
          event: "result",
          ok: true,
          sessionId,
          initialBlock,
          childBlockId,
          focusStable,
          transitions,
          inspection,
          processPids: processInfo.pids,
          agentPid,
          shellPid: processInfo.shellPid,
          foreground,
          parentSurvived: true,
          kept: keep,
          sessionUrl: `rex://session/${sessionId}`,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          event: "result",
          ok: false,
          sessionId,
          childBlockId,
          error: error instanceof Error ? error.message : String(error),
          transitions,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
