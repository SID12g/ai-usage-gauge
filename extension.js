// Shows the remaining Claude and ChatGPT (Codex) usage in the status bar.
// - Claude: queries the Anthropic usage API with the Claude Code login token (macOS Keychain).
//   The token is sent only to api.anthropic.com and never shown or cached.
// - ChatGPT: asks `codex app-server` for usage. The Codex CLI handles authentication itself.

const vscode = require("vscode");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const t = (...args) => vscode.l10n.t(...args);

const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

// The l10n bundle may not be loaded yet when this module is required, so translated labels are built on demand.
// Response key -> [label, status bar short label (null = tooltip only), sort order]
function claudeWindows() {
  return {
    five_hour: [t("5-hour"), "5h", 0],
    seven_day: [t("Weekly · All models"), "7d", 1],
    seven_day_opus: [t("Weekly · Opus"), null, 2],
    seven_day_sonnet: [t("Weekly · Sonnet"), null, 3],
    seven_day_oauth_apps: [t("Weekly · Connected apps"), null, 4],
    extra_usage: [t("Extra usage · Monthly"), null, 5],
  };
}

// VS Code launched from the Dock may not inherit the shell's PATH, so common install locations are appended.
const EXTRA_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "~/.local/bin",
  "~/Library/pnpm/bin",
  "~/.npm-global/bin",
  "~/.bun/bin",
  "~/.volta/bin",
].map((dir) => dir.replace(/^~/, os.homedir()));

const STATE_ICON = { warn: "$(warning)", crit: "$(error)", out: "$(error)" };
const STATE_BACKGROUND = {
  warn: "statusBarItem.warningBackground",
  crit: "statusBarItem.errorBackground",
  out: "statusBarItem.errorBackground",
};

function stateText(state) {
  return { warn: t("Running low"), crit: t("Almost out"), out: t("Limit reached") }[state];
}

function dateFormat(options) {
  try {
    return new Intl.DateTimeFormat(vscode.env.language, options);
  } catch {
    return new Intl.DateTimeFormat(undefined, options);
  }
}

const timeFmt = dateFormat({ hour: "numeric", minute: "2-digit" });
const dayTimeFmt = dateFormat({ month: "short", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
const dayFmt = dateFormat({ month: "short", day: "numeric", weekday: "short" });

/** A lookup failure whose message can be shown to the user as is. */
class SourceError extends Error {}

// ---------- Claude ----------

async function claudeCredentials() {
  const candidates = [];
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync(
        "security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { timeout: 10000 },
      );
      candidates.push(JSON.parse(stdout).claudeAiOauth);
    } catch {}
  }
  try {
    const file = path.join(os.homedir(), ".claude", ".credentials.json");
    candidates.push(JSON.parse(await fs.promises.readFile(file, "utf8")).claudeAiOauth);
  } catch {}
  const usable = candidates.filter((c) => c && c.accessToken);
  if (!usable.length) {
    throw new SourceError(t("Claude Code sign-in not found. Run `claude` in a terminal to sign in."));
  }
  return usable.reduce((a, b) => ((b.expiresAt || 0) > (a.expiresAt || 0) ? b : a));
}

function claudePlan(creds) {
  const plan = capitalize(creds.subscriptionType);
  const multiplier = /(\d+x)$/.exec(creds.rateLimitTier || "");
  return plan && multiplier ? `${plan} ${multiplier[1]}` : plan;
}

async function fetchClaude() {
  const creds = await claudeCredentials();
  if ((creds.expiresAt || 0) < Date.now()) {
    // Refreshing here would rotate Claude Code's refresh token and could sign it out, so refreshing is left to Claude Code.
    throw new SourceError(t("The Claude Code token has expired. Run `claude` once in a terminal and usage will load again."));
  }

  let res;
  try {
    res = await fetch(CLAUDE_USAGE_URL, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "ai-usage-statusbar/0.1",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new SourceError(t("Could not connect to the Anthropic usage API."));
  }
  if (!res.ok) {
    const hint = res.status === 429 ? ` ${t("Will try again shortly.")}` : "";
    throw new SourceError(`${t("The Anthropic usage API returned {0}.", res.status)}${hint}`);
  }

  const data = await res.json();
  const known = claudeWindows();
  const windows = [];
  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== "object" || typeof value.utilization !== "number") continue;
    const [label, short, order] = known[key] || [key.replace(/_/g, " "), null, 99];
    const resetsAt = Date.parse(value.resets_at) / 1000;
    windows.push({ label, short, order, usedPercent: value.utilization, resetsAt: Number.isFinite(resetsAt) ? resetsAt : null });
  }
  if (!windows.length) {
    throw new SourceError(t("Unrecognized usage response format (keys: {0}).", Object.keys(data).join(", ")));
  }
  windows.sort((a, b) => a.order - b.order);
  return { plan: claudePlan(creds), windows };
}

// ---------- ChatGPT (Codex) ----------

function searchPath() {
  const dirs = [...(process.env.PATH || "").split(path.delimiter), ...EXTRA_BIN_DIRS];
  return [...new Set(dirs.filter(Boolean))];
}

function codexCommand() {
  const configured = vscode.workspace.getConfiguration("aiUsage").get("codexPath");
  if (configured) return configured;
  for (const dir of searchPath()) {
    const candidate = path.join(dir, "codex");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

/** Sends calls = {id: [method, params]} to codex app-server and resolves to {id: result}. */
function codexRpc(calls, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const command = codexCommand();
    if (!command) {
      reject(new SourceError(t("Could not find the codex CLI. Install Codex or set `aiUsage.codexPath` in settings.")));
      return;
    }

    const child = spawn(command, ["app-server"], {
      env: { ...process.env, PATH: searchPath().join(path.delimiter) },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const lines = readline.createInterface({ input: child.stdout });
    const results = {};
    let done = false;
    const timer = setTimeout(() => finish(new SourceError(t("codex app-server took too long to respond."))), timeoutMs);

    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      lines.close();
      child.kill();
      error ? reject(error) : resolve(results);
    }

    child.on("error", () => finish(new SourceError(t("Could not run codex ({0}).", command))));
    child.stdin.on("error", () => {});
    lines.on("close", () => finish(new SourceError(t("codex app-server exited unexpectedly."))));
    lines.on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (!(msg.id in calls)) return;
      if (msg.error) {
        finish(new SourceError(`Codex: ${msg.error.message || JSON.stringify(msg.error)}`));
        return;
      }
      results[msg.id] = msg.result || {};
      if (Object.keys(results).length === Object.keys(calls).length) finish();
    });

    const messages = [
      { id: 0, method: "initialize", params: { clientInfo: { name: "ai_usage_statusbar", version: "0.1" } } },
      { method: "initialized" },
      ...Object.entries(calls).map(([id, [method, params]]) =>
        params === null ? { id: Number(id), method } : { id: Number(id), method, params }),
    ];
    child.stdin.write(messages.map((m) => JSON.stringify(m) + "\n").join(""));
  });
}

function windowLabel(mins) {
  if (!mins) return t("Usage limit");
  if (mins === 10080) return t("Weekly");
  if (mins % 1440 === 0) return t("{0}-day", mins / 1440);
  if (mins % 60 === 0) return t("{0}-hour", mins / 60);
  return t("{0}-minute", mins);
}

function windowShort(mins) {
  if (!mins) return null;
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}

async function fetchChatGPT() {
  const res = await codexRpc({ 1: ["account/rateLimits/read", null], 2: ["account/read", {}] });
  const account = res[2].account;
  if (!account || account.type !== "chatgpt") {
    throw new SourceError(t("Codex is not signed in with a ChatGPT account. Run `codex login` in a terminal."));
  }

  const rate = res[1];
  const limits = rate.rateLimitsByLimitId || { codex: rate.rateLimits };
  const ids = Object.keys(limits).filter((id) => limits[id]);
  // With several limits, the status bar shows only the default Codex limit and the rest go to the tooltip.
  const mainId = ids.includes("codex") ? "codex" : ids[0];
  const windows = [];
  for (const id of ids) {
    const limit = limits[id];
    const prefix = ids.length === 1 ? "" : `${limit.limitName || id} · `;
    for (const slot of ["primary", "secondary"]) {
      const w = limit[slot];
      if (!w) continue;
      windows.push({
        label: prefix + windowLabel(w.windowDurationMins),
        short: id === mainId ? windowShort(w.windowDurationMins) : null,
        usedPercent: w.usedPercent || 0,
        resetsAt: w.resetsAt || null,
      });
    }
  }
  if (!windows.length) throw new SourceError(t("Codex did not return any usage limits."));

  const available = ((rate.rateLimitResetCredits || {}).credits || []).filter((c) => c.status === "available");
  const expiries = available.map((c) => c.expiresAt).filter(Boolean);
  const credits = (rate.rateLimits || {}).credits || {};
  return {
    plan: capitalize(account.planType),
    windows,
    resetCredits: { count: available.length, nextExpiry: expiries.length ? Math.min(...expiries) : null },
    creditBalance: credits.hasCredits ? credits.balance : null,
  };
}

// ---------- Display ----------

const SOURCES = [
  {
    id: "claude",
    title: "Claude",
    icon: "$(ai-usage-claude)",
    setting: "showClaude",
    priority: 101,
    fetch: fetchClaude,
    footnote: () => t("Based on your Claude Code account · shared with claude.ai and the desktop app."),
  },
  {
    id: "chatgpt",
    title: "ChatGPT",
    icon: "$(ai-usage-chatgpt)",
    setting: "showChatGPT",
    priority: 100,
    fetch: fetchChatGPT,
    footnote: () => t("Based on Codex usage limits · OpenAI offers no way to check ChatGPT chat message limits."),
  },
];

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : null;
}

function remainingOf(w) {
  return 100 - Math.round(Math.min(100, Math.max(0, w.usedPercent)));
}

function stateOf(remaining) {
  if (remaining <= 0) return "out";
  if (remaining <= 10) return "crit";
  if (remaining <= 25) return "warn";
  return "ok";
}

function resetText(epochSec) {
  const ms = epochSec * 1000;
  const mins = Math.round((ms - Date.now()) / 60000);
  if (mins <= 0) return t("Resetting soon");
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const parts = d ? [t("{0}d", d), h && t("{0}h", h)] : h ? [t("{0}h", h), m && t("{0}m", m)] : [t("{0}m", m)];
  const at = (ms - Date.now() < 86400000 ? timeFmt : dayTimeFmt).format(ms);
  return t("in {0} · {1}", parts.filter(Boolean).join(" "), at);
}

function tooltip(source, result) {
  const md = new vscode.MarkdownString("", true);
  md.isTrusted = { enabledCommands: ["aiUsage.refresh"] };
  md.appendMarkdown(`**${t("{0} usage remaining", source.title)}**${result.plan ? ` · ${result.plan}` : ""}\n\n`);

  if (!result.ok) {
    md.appendMarkdown(`$(error) ${result.error}\n\n`);
  } else {
    md.appendMarkdown(`| ${t("Limit")} | ${t("Left")} | ${t("Resets")} |\n|:--|--:|:--|\n`);
    for (const w of result.windows) {
      const remaining = remainingOf(w);
      const state = stateOf(remaining);
      const badge = stateText(state) ? ` ${STATE_ICON[state]} ${stateText(state)}` : "";
      md.appendMarkdown(`| ${w.label}${badge} | **${remaining}%** | ${w.resetsAt ? resetText(w.resetsAt) : "—"} |\n`);
    }
    const rc = result.resetCredits;
    if (rc && rc.count) {
      const expiry = rc.nextExpiry ? ` · ${t("earliest expires {0}", dayFmt.format(rc.nextExpiry * 1000))}` : "";
      md.appendMarkdown(`\n${t("Limit reset credits: {0}", rc.count)}${expiry}\n`);
    }
    if (result.creditBalance != null) md.appendMarkdown(`\n${t("Credit balance: {0}", result.creditBalance)}\n`);
  }

  md.appendMarkdown(`\n${source.footnote()}\n\n---\n\n${t("Last checked {0}", timeFmt.format(result.at))} · [${t("Refresh")}](command:aiUsage.refresh)`);
  return md;
}

function renderItem(item, source, result) {
  item.backgroundColor = undefined;
  item.tooltip = result ? tooltip(source, result) : t("Loading {0} usage…", source.title);
  if (!result) {
    item.text = `${source.icon} $(sync~spin)`;
  } else if (!result.ok) {
    item.text = `${source.icon} $(circle-slash)`;
  } else {
    const marked = result.windows.filter((w) => w.short);
    const shown = marked.length ? marked : result.windows.slice(0, 2);
    const worst = stateOf(Math.min(...shown.map(remainingOf)));
    const parts = shown.map((w) => `${w.short || w.label} ${remainingOf(w)}%`);
    item.text = [source.icon, STATE_ICON[worst], parts.join(" · ")].filter(Boolean).join(" ");
    if (STATE_BACKGROUND[worst]) item.backgroundColor = new vscode.ThemeColor(STATE_BACKGROUND[worst]);
  }
  // Only the logo is visible, so screen readers also get the service name.
  const spoken = item.text.replace(/\$\([^)]+\)/g, "").replace(/\s+/g, " ").trim();
  item.accessibilityInformation = { label: `${source.title} ${spoken}`.trim() };
}

// ---------- Lifecycle ----------

async function load(source) {
  try {
    return { ok: true, at: Date.now(), ...(await source.fetch()) };
  } catch (e) {
    return { ok: false, at: Date.now(), error: e instanceof SourceError ? e.message : t("Unexpected error ({0})", e.name) };
  }
}

async function readCache(file) {
  try {
    return JSON.parse(await fs.promises.readFile(file, "utf8"));
  } catch {
    return {};
  }
}

async function writeCache(file, cache) {
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, JSON.stringify(cache));
  } catch {}
}

function activate(context) {
  // The extension runs separately in every window, so results are shared through a file to avoid duplicate API calls.
  const cacheFile = path.join(context.globalStorageUri.fsPath, "usage-cache.json");
  const items = new Map();
  const results = {};
  let loading = false;
  let lastLoadedAt = 0;
  let pollTimer;

  const config = () => vscode.workspace.getConfiguration("aiUsage");
  const intervalMs = () => Math.max(60, config().get("refreshIntervalSeconds", 120)) * 1000;

  for (const source of SOURCES) {
    const item = vscode.window.createStatusBarItem(`aiUsage.${source.id}`, vscode.StatusBarAlignment.Right, source.priority);
    item.name = t("{0} usage remaining", source.title);
    item.command = "aiUsage.refresh";
    items.set(source.id, item);
    context.subscriptions.push(item);
  }

  function render() {
    for (const source of SOURCES) {
      const item = items.get(source.id);
      if (!config().get(source.setting, true)) {
        item.hide();
        continue;
      }
      renderItem(item, source, results[source.id]);
      item.show();
    }
  }

  async function refresh(force) {
    if (loading) return;
    loading = true;
    try {
      const cache = await readCache(cacheFile);
      const maxAge = intervalMs() - 5000;
      const enabled = SOURCES.filter((s) => config().get(s.setting, true));
      await Promise.all(enabled.map(async (source) => {
        const cached = cache[source.id];
        if (!force && cached && Date.now() - cached.at < maxAge) {
          results[source.id] = cached;
          return;
        }
        results[source.id] = cache[source.id] = await load(source);
      }));
      await writeCache(cacheFile, cache);
      lastLoadedAt = Date.now();
    } finally {
      loading = false;
      render();
    }
  }

  function schedule() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => refresh(false), intervalMs());
  }

  // Keeps the tooltip's time-left current, and refreshes right away once a limit's reset time has passed.
  const tickTimer = setInterval(() => {
    const now = Date.now();
    const passed = Object.values(results).some((r) => r && r.ok &&
      r.windows.some((w) => w.resetsAt && w.resetsAt * 1000 < now && w.resetsAt * 1000 > lastLoadedAt));
    passed ? refresh(true) : render();
  }, 30000);

  context.subscriptions.push(
    vscode.commands.registerCommand("aiUsage.refresh", () => refresh(true)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("aiUsage")) return;
      schedule();
      refresh(false);
    }),
    { dispose: () => { clearInterval(pollTimer); clearInterval(tickTimer); } },
  );

  render();
  schedule();
  refresh(false);
}

function deactivate() {}

module.exports = { activate, deactivate };
