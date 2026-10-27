# AI Usage Gauge

See how much of your Claude and ChatGPT (Codex) usage limits is left, right in the VS Code status bar.

[한국어](README.ko.md)

```
[Claude logo] 5h 78% · 7d 55%   [ChatGPT logo] 5h 100% · 7d 96%
```

> Unofficial extension. Not affiliated with or endorsed by Anthropic or OpenAI.

## Features

- **Both services at a glance.** Claude and ChatGPT (Codex) sit side by side at the right end of the status bar.
- **Shows what's left, not what's used.** `5h 78%` means 78% of your 5-hour limit remains.
- **Details on hover.** Every limit, including per-model weekly limits such as Opus and Sonnet, with a reset countdown,
  the exact reset time, and your plan.
- **Color warnings.** The item turns to the warning color at 25% or less remaining, and the error color at 10% or less.
- **Stays current.** Checks every 2 minutes by default and again right after a limit resets. Click the item to check now.
- **Light on API calls.** All open VS Code windows share one result.
- **No extra sign-in.** Reuses your existing Claude Code and Codex CLI logins.
- **English and Korean**, following VS Code's display language.

## Getting started

1. Sign in to the tools you use.
   - **Claude**: run `claude` in a terminal and sign in to Claude Code.
   - **ChatGPT**: run `codex login` and sign in with your ChatGPT account.
2. Install this extension. Your usage appears in the status bar within a few seconds.

Only use one of them? Turn the other off with `aiUsage.showClaude` or `aiUsage.showChatGPT`.

## Reading the status bar

| You see | Meaning |
|---|---|
| `5h 78%` | 78% of the 5-hour limit is left |
| `7d 55%` | 55% of the weekly limit is left |
| Warning icon and background | A limit shown is at 25% or less |
| Error icon and background | A limit shown is at 10% or less, or used up |
| Slashed circle | Usage couldn't be loaded. Hover to see why |
| Spinning icon | Loading |

## Commands

| Command | Description |
|---|---|
| `AI Usage: Refresh` | Check usage now (same as clicking the item) |

## Settings

| Setting | Default | Description |
|---|---|---|
| `aiUsage.refreshIntervalSeconds` | 120 | How often to check usage, in seconds (minimum 60) |
| `aiUsage.showClaude` | true | Show the Claude item |
| `aiUsage.showChatGPT` | true | Show the ChatGPT item |
| `aiUsage.codexPath` | "" | Path to the codex executable (set only if it isn't found) |

## Troubleshooting

Hover over the item first. The tooltip says what went wrong.

- **"Claude Code sign-in not found"**: Run `claude` in a terminal and sign in.
- **"The Claude Code token has expired"**: Run `claude` once. Claude Code renews its token and the item recovers on the
  next check. This extension never renews the token itself, so it can't sign you out of Claude Code.
- **"Could not find the codex CLI"**: VS Code opened from the Dock may not see your shell's `PATH`.
  Set `aiUsage.codexPath` to the output of `which codex`.
- **"Codex is not signed in with a ChatGPT account"**: Run `codex login` and choose to sign in with ChatGPT.
  Sign-ins with an API key have no plan limits to show.

## How it works and your privacy

The extension runs entirely on your machine with no server of its own, and collects no telemetry.

- **Claude**: Reads the login token Claude Code has stored and queries the Anthropic usage API (`api.anthropic.com`).
  - Token location: the macOS Keychain (`Claude Code-credentials`), or `~/.claude/.credentials.json` if not found there.
  - The token is sent only to `api.anthropic.com` and is never shown, logged, or cached.
  - On macOS, a Keychain access prompt may appear the first time usage is checked.
- **ChatGPT**: Runs the installed `codex app-server` and asks it for usage. The Codex CLI handles authentication;
  this extension never reads your OpenAI token.

## Platform support

Built and tested on macOS. On Linux and Windows the extension tries the same steps, but this is untested.
On Windows, finding the codex CLI may not work.

## Caveats

The Claude usage API is not publicly documented by Anthropic. It may change or stop working without notice,
in which case the tooltip shows an error. The response format of Codex `app-server` may also change with Codex CLI updates.

## Trademarks

Claude is a trademark of Anthropic. ChatGPT and Codex are trademarks of OpenAI. The logos in the status bar are used
only to tell which service each usage figure belongs to.

## License

[MIT](LICENSE)
