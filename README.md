# AI Usage Gauge

[한국어](README.ko.md)

Shows your remaining Claude and ChatGPT (Codex) usage limits in the VS Code status bar.

> **Unofficial extension.** Not affiliated with or endorsed by Anthropic or OpenAI.
> Claude is a trademark of Anthropic; ChatGPT and Codex are trademarks of OpenAI. The logos in the status bar are
> used only to tell which service each usage figure belongs to.

```
[Claude logo] 5h 78% · 7d 55%    [ChatGPT logo] 5h 100% · 7d 100%
```

- Hover to see a table of each limit's remaining share, reset time, and your plan.
- Click to refresh right away. Usage is checked every 2 minutes by default.
- The item turns to the warning color at 25% or less remaining, and the error color at 10% or less.

## Requirements

- **Claude**: You must be signed in to Claude Code (`claude`).
- **ChatGPT**: You must be signed in to the Codex CLI with a ChatGPT account (`codex login`).
  OpenAI offers no way to check ChatGPT chat message limits, so Codex limits are shown instead.

Built and tested on macOS. On other platforms it tries the same steps described below, but this is untested.

## How it works and your privacy

The extension runs entirely on your machine with no server of its own, and collects no telemetry.

- **Claude**: Reads the login token Claude Code has stored and queries the Anthropic usage API (`api.anthropic.com`).
  - Token location: the macOS Keychain (`Claude Code-credentials`), or `~/.claude/.credentials.json` if not found there.
  - The token is sent only to `api.anthropic.com` and is never shown, logged, or cached.
  - The token is never refreshed by this extension. When it expires, you are asked to run `claude` once in a terminal.
  - On macOS, a Keychain access prompt may appear the first time usage is checked.
- **ChatGPT**: Runs the installed `codex app-server` and asks it for usage. The Codex CLI handles authentication;
  this extension never reads your OpenAI token.

### Caveats

The Claude usage API is not publicly documented by Anthropic. It may change or stop working without notice,
in which case the tooltip shows an error. The response format of Codex `app-server` may also change with Codex CLI updates.

## Settings

| Setting | Default | Description |
|---|---|---|
| `aiUsage.refreshIntervalSeconds` | 120 | How often to check usage, in seconds (minimum 60) |
| `aiUsage.showClaude` | true | Show the Claude item |
| `aiUsage.showChatGPT` | true | Show the ChatGPT item |
| `aiUsage.codexPath` | "" | Path to the codex executable (set only if it isn't found) |

## Languages

English and Korean. The extension follows VS Code's display language.

## License

[MIT](LICENSE)
