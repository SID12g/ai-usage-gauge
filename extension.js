// Claude와 ChatGPT(Codex)의 남은 사용량을 상태 표시줄에 보여주는 확장.
// 조회 방식은 ../usage_server.py 와 같습니다.
// - Claude: Claude Code 로그인 토큰(macOS 키체인)으로 Anthropic 사용량 API를 조회합니다.
//   토큰은 api.anthropic.com 으로만 전송되며 화면이나 캐시에는 남지 않습니다.
// - ChatGPT: `codex app-server`에 사용량을 물어봅니다. 인증은 Codex CLI가 직접 처리합니다.

const vscode = require("vscode");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
// 응답 키 -> [표시 이름, 상태 표시줄 약칭(null이면 툴팁에만 표시), 정렬 순서]
const CLAUDE_WINDOWS = {
  five_hour: ["5시간", "5h", 0],
  seven_day: ["주간 · 전체 모델", "7d", 1],
  seven_day_opus: ["주간 · Opus", null, 2],
  seven_day_sonnet: ["주간 · Sonnet", null, 3],
  seven_day_oauth_apps: ["주간 · 연동 앱", null, 4],
  extra_usage: ["추가 사용량 · 월간", null, 5],
};

// Dock에서 실행한 VS Code는 셸의 PATH를 물려받지 못할 수 있어 흔한 설치 위치를 덧붙입니다.
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
const STATE_TEXT = { warn: "곧 소진", crit: "거의 소진", out: "한도 도달" };
const STATE_BACKGROUND = {
  warn: "statusBarItem.warningBackground",
  crit: "statusBarItem.errorBackground",
  out: "statusBarItem.errorBackground",
};

const timeFmt = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
const dayTimeFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" });

/** 사용자에게 그대로 보여줄 수 있는 조회 실패. */
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
    throw new SourceError("Claude Code 로그인 정보를 찾지 못했습니다. 터미널에서 `claude`를 실행해 로그인하세요.");
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
    // 여기서 직접 갱신하면 Claude Code의 refresh token이 바뀌어 로그인이 풀릴 수 있어 갱신은 Claude Code에 맡깁니다.
    throw new SourceError("Claude Code 토큰이 만료되었습니다. 터미널에서 `claude`를 한 번 실행하면 다시 조회됩니다.");
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
    throw new SourceError("Anthropic 사용량 API에 연결하지 못했습니다.");
  }
  if (!res.ok) {
    const hint = res.status === 429 ? " 잠시 후 다시 조회합니다." : "";
    throw new SourceError(`Anthropic 사용량 API가 ${res.status} 응답을 반환했습니다.${hint}`);
  }

  const data = await res.json();
  const windows = [];
  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== "object" || typeof value.utilization !== "number") continue;
    const [label, short, order] = CLAUDE_WINDOWS[key] || [key.replace(/_/g, " "), null, 99];
    const resetsAt = Date.parse(value.resets_at) / 1000;
    windows.push({ label, short, order, usedPercent: value.utilization, resetsAt: Number.isFinite(resetsAt) ? resetsAt : null });
  }
  if (!windows.length) {
    throw new SourceError(`사용량 응답 형식을 인식하지 못했습니다 (키: ${Object.keys(data).join(", ")}).`);
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

/** calls = {id: [method, params]} 를 codex app-server 에 보내고 {id: result} 를 돌려줍니다. */
function codexRpc(calls, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const command = codexCommand();
    if (!command) {
      reject(new SourceError("codex CLI를 찾지 못했습니다. Codex를 설치하거나 설정에서 `aiUsage.codexPath`를 지정하세요."));
      return;
    }

    const child = spawn(command, ["app-server"], {
      env: { ...process.env, PATH: searchPath().join(path.delimiter) },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const lines = readline.createInterface({ input: child.stdout });
    const results = {};
    let done = false;
    const timer = setTimeout(() => finish(new SourceError("codex app-server 응답이 너무 늦습니다.")), timeoutMs);

    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      lines.close();
      child.kill();
      error ? reject(error) : resolve(results);
    }

    child.on("error", () => finish(new SourceError(`codex를 실행하지 못했습니다 (${command}).`)));
    child.stdin.on("error", () => {});
    lines.on("close", () => finish(new SourceError("codex app-server가 예기치 않게 종료되었습니다.")));
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
  if (!mins) return "사용 한도";
  if (mins === 10080) return "주간";
  if (mins % 1440 === 0) return `${mins / 1440}일`;
  if (mins % 60 === 0) return `${mins / 60}시간`;
  return `${mins}분`;
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
    throw new SourceError("Codex에 ChatGPT 계정으로 로그인되어 있지 않습니다. 터미널에서 `codex login`을 실행하세요.");
  }

  const rate = res[1];
  const limits = rate.rateLimitsByLimitId || { codex: rate.rateLimits };
  const ids = Object.keys(limits).filter((id) => limits[id]);
  // 한도가 여러 개면 상태 표시줄에는 기본 Codex 한도만 보여주고 나머지는 툴팁에 둡니다.
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
  if (!windows.length) throw new SourceError("Codex가 사용 한도 정보를 돌려주지 않았습니다.");

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

// ---------- 표시 ----------

const SOURCES = [
  {
    id: "claude",
    title: "Claude",
    icon: "$(ai-usage-claude)",
    setting: "showClaude",
    priority: 101,
    fetch: fetchClaude,
    footnote: "Claude Code 로그인 계정 기준 · claude.ai, 데스크톱 앱과 같은 한도를 함께 씁니다.",
  },
  {
    id: "chatgpt",
    title: "ChatGPT",
    icon: "$(ai-usage-chatgpt)",
    setting: "showChatGPT",
    priority: 100,
    fetch: fetchChatGPT,
    footnote: "Codex 사용 한도 기준 · ChatGPT 채팅 메시지 한도는 OpenAI가 조회 방법을 제공하지 않습니다.",
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
  if (mins <= 0) return "곧 초기화";
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const parts = d ? [`${d}일`, h && `${h}시간`] : h ? [`${h}시간`, m && `${m}분`] : [`${m}분`];
  const at = (ms - Date.now() < 86400000 ? timeFmt : dayTimeFmt).format(ms);
  return `${parts.filter(Boolean).join(" ")} 후 · ${at}`;
}

function tooltip(source, result) {
  const md = new vscode.MarkdownString("", true);
  md.isTrusted = { enabledCommands: ["aiUsage.refresh"] };
  md.appendMarkdown(`**${source.title} 남은 사용량**${result.plan ? ` · ${result.plan}` : ""}\n\n`);

  if (!result.ok) {
    md.appendMarkdown(`$(error) ${result.error}\n\n`);
  } else {
    md.appendMarkdown("| 한도 | 남음 | 초기화 |\n|:--|--:|:--|\n");
    for (const w of result.windows) {
      const remaining = remainingOf(w);
      const state = stateOf(remaining);
      const badge = STATE_TEXT[state] ? ` ${STATE_ICON[state]} ${STATE_TEXT[state]}` : "";
      md.appendMarkdown(`| ${w.label}${badge} | **${remaining}%** | ${w.resetsAt ? resetText(w.resetsAt) : "—"} |\n`);
    }
    const rc = result.resetCredits;
    if (rc && rc.count) {
      const expiry = rc.nextExpiry ? ` · 가장 빠른 만료 ${dayFmt.format(rc.nextExpiry * 1000)}` : "";
      md.appendMarkdown(`\n한도 초기화 쿠폰 ${rc.count}장 보유${expiry}\n`);
    }
    if (result.creditBalance != null) md.appendMarkdown(`\n크레딧 잔액 ${result.creditBalance}\n`);
  }

  md.appendMarkdown(`\n${source.footnote}\n\n---\n\n마지막 조회 ${timeFmt.format(result.at)} · [새로고침](command:aiUsage.refresh)`);
  return md;
}

function renderItem(item, source, result) {
  item.backgroundColor = undefined;
  item.tooltip = result ? tooltip(source, result) : `${source.title} 사용량을 불러오는 중…`;
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
  // 화면에는 로고만 보이므로 화면 낭독기에는 서비스 이름을 함께 읽어 줍니다.
  const spoken = item.text.replace(/\$\([^)]+\)/g, "").replace(/\s+/g, " ").trim();
  item.accessibilityInformation = { label: `${source.title} ${spoken}`.trim() };
}

// ---------- 수명 주기 ----------

async function load(source) {
  try {
    return { ok: true, at: Date.now(), ...(await source.fetch()) };
  } catch (e) {
    return { ok: false, at: Date.now(), error: e instanceof SourceError ? e.message : `예상치 못한 오류 (${e.name})` };
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
  // 창마다 확장이 따로 돌기 때문에 조회 결과를 파일로 공유해 API를 중복 호출하지 않습니다.
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
    item.name = `${source.title} 남은 사용량`;
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

  // 툴팁의 남은 시간을 갱신하고, 초기화 시각이 지난 한도가 있으면 바로 다시 조회합니다.
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
