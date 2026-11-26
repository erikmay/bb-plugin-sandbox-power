#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = JSON.parse(readFileSync(join(root, "upstream.json"), "utf8"));
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const target = args.find((arg) => !arg.startsWith("--") && arg !== option("--markdown")) ?? "main";
const keep = args.includes("--keep");
const asJson = args.includes("--json");
const markdownFile = option("--markdown");
const checkout = mkdtempSync(join(tmpdir(), "bb-upstream-"));

const git = (...gitArgs) =>
  execFileSync("git", ["-C", checkout, ...gitArgs], { encoding: "utf8", maxBuffer: 64 << 20 });

function npmVersion(name) {
  try {
    return execFileSync("npm", ["view", name, "version"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function newer(candidate, current) {
  if (candidate === null || current === null) return false;
  const parse = (version) => version.replace(/^[^\d]*/u, "").split(/[.-]/u).slice(0, 3).map(Number);
  const [a, b] = [parse(candidate), parse(current)];
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

let report;
try {
  execFileSync("git", ["clone", "--quiet", "--filter=blob:none", "--no-checkout", upstream.repository, checkout], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  git("fetch", "--quiet", "origin", target);
  const targetCommit = git("rev-parse", "FETCH_HEAD").trim();
  const paths = upstream.tracked.map((entry) => entry.upstream);

  const changedFiles = git("diff", "--numstat", upstream.syncedCommit, targetCommit, "--", ...paths)
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, removed, file] = line.split("\t");
      const tracked = upstream.tracked.find((entry) => entry.upstream === file);
      return { file, added: Number(added), removed: Number(removed), local: tracked?.local ?? null, relation: tracked?.relation ?? "" };
    });
  const movedOrDeleted = git("diff", "--name-status", "--diff-filter=DR", upstream.syncedCommit, targetCommit, "--", ...paths)
    .trim()
    .split("\n")
    .filter(Boolean);

  const patch = git("diff", upstream.syncedCommit, targetCommit, "--", ...paths);
  writeFileSync(join(root, "upstream-diff.patch"), patch);

  const apiSignals = [];
  for (const watch of upstream.watchForPublicApis) {
    let hits = "";
    try {
      hits = git("grep", "-l", watch.symbol, targetCommit, "--", ...(watch.paths ?? ["packages/plugin-sdk/src"]));
    } catch (error) {
      if (error.status !== 1) throw error;
    }
    const present = hits.trim().length > 0;
    if ((watch.alert === "appears" && present) || (watch.alert === "disappears" && !present)) {
      apiSignals.push({ symbol: watch.symbol, alert: watch.alert, meaning: watch.meaning });
    }
  }

  const upstreamSdk = JSON.parse(git("show", `${targetCommit}:packages/plugin-sdk/package.json`)).version;
  const versions = {
    bbApp: { latest: npmVersion("bb-app"), tested: upstream.testedBbVersion },
    pluginSdk: { latest: npmVersion("@get-bb/plugin-sdk"), upstreamMain: upstreamSdk, tested: upstream.testedPluginSdk },
  };
  const newReleases = [];
  if (newer(versions.bbApp.latest, versions.bbApp.tested)) newReleases.push(`bb-app ${versions.bbApp.latest} (tested ${versions.bbApp.tested})`);
  if (newer(versions.pluginSdk.latest, versions.pluginSdk.tested)) newReleases.push(`@get-bb/plugin-sdk ${versions.pluginSdk.latest} (tested ${versions.pluginSdk.tested})`);

  report = {
    syncedCommit: upstream.syncedCommit,
    targetRef: target,
    targetCommit,
    changedFiles,
    movedOrDeleted,
    apiSignals,
    versions,
    newReleases,
    drift: changedFiles.length > 0 || movedOrDeleted.length > 0 || apiSignals.length > 0,
  };
} finally {
  if (keep) console.error(`Upstream checkout kept at ${checkout}`);
  else rmSync(checkout, { recursive: true, force: true });
}

function markdown(r) {
  const lines = [
    `Upstream check against [get-bb/bb@${r.targetCommit.slice(0, 12)}](https://github.com/get-bb/bb/commit/${r.targetCommit}) (synced: \`${r.syncedCommit.slice(0, 12)}\`).`,
    "",
  ];
  if (r.changedFiles.length > 0) {
    lines.push("### Changed tracked files", "", "| Upstream file | +/- | Local counterpart | Why it is tracked |", "|---|---|---|---|");
    for (const f of r.changedFiles) lines.push(`| \`${f.file}\` | +${f.added}/-${f.removed} | ${f.local ? `\`${f.local}\`` : "contract"} | ${f.relation} |`);
    lines.push("", `Compare: https://github.com/get-bb/bb/compare/${r.syncedCommit.slice(0, 12)}...${r.targetCommit.slice(0, 12)}`, "");
  }
  if (r.movedOrDeleted.length > 0) lines.push("### Moved or deleted", "", "```", ...r.movedOrDeleted, "```", "");
  if (r.apiSignals.length > 0) {
    lines.push("### Plugin SDK API signals", "");
    for (const s of r.apiSignals) lines.push(`- \`${s.symbol}\` ${s.alert}: ${s.meaning}`);
    lines.push("");
  }
  if (r.newReleases.length > 0) {
    lines.push("### New releases", "");
    for (const release of r.newReleases) lines.push(`- ${release}`);
    lines.push("");
  }
  if (!r.drift && r.newReleases.length === 0) lines.push("No drift.");
  lines.push("", "Follow **Upgrading to a newer bb** in `AGENTS.md`, then update `upstream.json`.");
  return lines.join("\n");
}

if (markdownFile !== undefined) writeFileSync(markdownFile, markdown(report));
if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Synced: ${report.syncedCommit.slice(0, 12)}  Target: ${report.targetCommit.slice(0, 12)} (${report.targetRef})`);
  console.log(report.changedFiles.length === 0 ? "Tracked upstream files are unchanged." : "Changed tracked files:");
  for (const f of report.changedFiles) console.log(`  ${f.file} (+${f.added}/-${f.removed}) -> ${f.local ?? "contract"}`);
  for (const m of report.movedOrDeleted) console.log(`  moved/deleted: ${m}`);
  for (const s of report.apiSignals) console.log(`API signal: ${s.symbol} ${s.alert} — ${s.meaning}`);
  for (const r of report.newReleases) console.log(`New release: ${r}`);
  if (report.changedFiles.length > 0) console.log("Full diff written to upstream-diff.patch");
}
