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
const root = join(here, "..");
const packageJsonPath = join(root, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
  version?: string;
  pi?: { extensions?: string[]; skills?: string[] };
};

const extensions = packageJson.pi?.extensions ?? [];
add(
  "package",
  extensions.length > 0,
  `version ${packageJson.version ?? "unknown"}`,
  true,
);

const extensionPath = extensions[0] ? join(root, extensions[0]) : undefined;
add(
  "extension entry",
  extensionPath !== undefined && existsSync(extensionPath),
  extensionPath ?? "pi.extensions is empty",
  true,
);

const skills = packageJson.pi?.skills ?? [];
if (skills.length > 0) {
  const missing = skills.filter((path) => !existsSync(join(root, path)));
  add(
    "skill entry",
    missing.length === 0,
    missing.length > 0 ? `missing: ${missing.join(", ")}` : skills.join(", "),
  );
}

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

const installed = commandOutput("pi", ["list"]) ?? "";
const hasRex = /\bpi-rex-agents\b/.test(installed);
add(
  "pi package",
  hasRex,
  hasRex
    ? "pi-rex-agents visible in pi list"
    : "pi-rex-agents not in pi list (use -e or pi install)",
);

console.log(
  JSON.stringify(
    { ok: checks.every((check) => check.ok || !check.fatal), checks },
    null,
    2,
  ),
);
if (checks.some((check) => check.fatal && !check.ok)) process.exitCode = 1;
