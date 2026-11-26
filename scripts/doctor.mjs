#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PLUGIN_ID = "sandbox-power";
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu;
const redact = (text) => text.replace(EMAIL, "<email>");

let problems = 0;
const ok = (message) => console.log(`  ok    ${message}`);
const warn = (message) => {
  problems += 1;
  console.log(`  WARN  ${message}`);
};
const info = (message) => console.log(`        ${message}`);

function findBb() {
  if (process.env.BB_CLI) return process.env.BB_CLI;
  try {
    execFileSync("bb", ["--version"], { stdio: "ignore" });
    return "bb";
  } catch {
    const bundled = join(homedir(), ".bb", "bin", "bb");
    return existsSync(bundled) ? bundled : null;
  }
}

const bb = findBb();
if (bb === null) {
  console.log("  WARN  bb CLI not found (set BB_CLI, put bb on PATH, or install the desktop app)");
  process.exit(1);
}
const json = (...command) =>
  JSON.parse(execFileSync(bb, [...command, "--json"], { encoding: "utf8", maxBuffer: 32 << 20 }));

console.log("== bb");
info(`CLI: ${bb} (${execFileSync(bb, ["--version"], { encoding: "utf8" }).trim()})`);
try {
  const plugins = json("plugin", "list");
  const plugin = (Array.isArray(plugins) ? plugins : plugins.plugins).find((entry) => entry.id === PLUGIN_ID);
  if (plugin === undefined) warn(`plugin ${PLUGIN_ID} is not installed`);
  else if (plugin.status !== "running") warn(`plugin ${PLUGIN_ID} ${plugin.version} is ${plugin.status}`);
  else ok(`plugin ${PLUGIN_ID} ${plugin.version} running (${plugin.sourceDisplay ?? plugin.source})`);

  const providers = json("machine", "providers");
  const suspendable = providers.filter((provider) => provider.supportsSuspend === true);
  if (suspendable.length === 0) warn("no installed machine provider supports suspend; the action never shows");
  else ok(`suspendable machine providers: ${suspendable.map((provider) => provider.id).join(", ")}`);
  const ids = new Set(suspendable.map((provider) => provider.id));

  const machines = json("machine", "list", "--all").filter((host) => ids.has(host.machineProviderId));
  info(`machines that show the action: ${machines.length}`);
  for (const host of machines) {
    const action =
      host.lifecycle.phase === "active"
        ? "Pause sandbox"
        : host.lifecycle.phase === "suspended"
          ? "Resume sandbox"
          : host.lifecycle.phase === "suspending" || host.lifecycle.phase === "resuming"
            ? "(disabled while changing)"
            : "(hidden)";
    info(`- ${host.id}  ${host.name}  ${host.lifecycle.phase}/${host.status}  -> ${action}`);
  }
} catch (error) {
  warn(`bb query failed: ${redact(error.message.split("\n")[0])}`);
}

console.log("\n== plugin log");
try {
  const log = execFileSync(bb, ["plugin", "logs", PLUGIN_ID, "-n", "10"], { encoding: "utf8" });
  for (const line of log.trim().split("\n")) {
    try {
      const entry = JSON.parse(line);
      info(`${new Date(entry.ts).toISOString()} ${entry.level.padEnd(5)} ${redact(entry.message)}`);
    } catch {
      info(redact(line));
    }
  }
} catch (error) {
  warn(`could not read plugin log: ${redact(error.message.split("\n")[0])}`);
}

console.log(problems === 0 ? "\nAll checks passed." : `\n${problems} problem(s) found.`);
process.exit(problems === 0 ? 0 : 1);
