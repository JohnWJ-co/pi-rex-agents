/**
 * Install/runtime doctor for pi-rex-agents.
 *
 * This intentionally checks the host environment without starting a child
 * Pi or touching a Rex session.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const checks: Array<{
  name: string;
  ok: boolean;
  detail: string;
  fatal?: boolean;
}> = [];

function add(name: string, ok: boolean, detail: string, fatal = false): void {
  checks.push({ name, ok, detail, fatal });
}

function commandOutput(command: string, args: string[]): string | undefined {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = join(here, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  version?: string;
  pi?: { extensions?: string[] };
};

add("package", Boolean(packageJson.pi?.extensions?.length), `version ${packageJson.version ?? "unknown"}`);

const session = process.env.REX_SESSION;
const block = process.env.REX_BLOCK;
add("Rex session", Boolean(session), session ?? "REX_SESSION is not set");
add("Rex block", Boolean(block), block ?? "REX_BLOCK is not set");
add(
  "Rex CLI",
  Boolean(commandOutput("rex", ["version"])),
  commandOutput("rex", ["version"]) ?? "rex is not on PATH",
);

const piVersion = commandOutput("pi", ["--version"]);
add("Pi CLI", Boolean(piVersion), piVersion ?? "pi is not on PATH");

const extensionPath = join(here, "extension.ts");
add("extension entry", existsSync(extensionPath), extensionPath);

const installed = commandOutput("pi", ["list"]) ?? "";
const hasHerdr = /\bpi-herdr-agents\b/.test(installed);
const hasRex = /\bpi-rex-agents\b/.test(installed);
add("pi package cache", true, hasRex ? "pi-rex-agents visible in pi list" : "pi-rex-agents not in pi list (use -e or pi install)");
if (hasHerdr && hasRex) {
  add(
    "tool-name conflict",
    false,
    "both pi-herdr-agents and pi-rex-agents are installed; disable one with `pi config`",
    true,
  );
} else if (hasHerdr) {
  add(
    "tool-name conflict",
    true,
    "pi-herdr-agents is installed but pi-rex-agents is not registered as a package; load pi-rex-agents with --no-extensions -e",
  );
} else {
  add("tool-name conflict", true, "no pi-herdr-agents package detected");
}

console.log(JSON.stringify({ ok: checks.every((check) => check.ok || !check.fatal), checks }, null, 2));
if (checks.some((check) => check.fatal && !check.ok)) process.exitCode = 1;
