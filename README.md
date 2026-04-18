# 🔭 pi-observability

A [pi](https://github.com/mariozechner/pi) extension that replaces the default footer with a live observability bar and provides a full dashboard command.

## Features

- **Live footer bar** showing:
  - Session input/output tokens & estimated cost
  - Live TPS (tokens per second) during streaming
  - Session runtime
  - Current model & git branch
  - Git diff stats (added/removed lines)
  - Context usage (current / max)

- **`/obs` command** — Print a full observability dashboard with per-turn breakdowns and last 10 session history

- **`/obs-toggle` command** — Toggle the live footer on/off

## Preview

```
~/projects/my-app (main)  +42 -7
⏱ 12:34  ctx 4.2k/200k  ↑1.2k ↓3.4k  $0.0042  ⚡ 45.2 tok/s      claude-sonnet-4
```

## Install

### Via npm

```bash
pi install npm:pi-observability
```

### Via git

```bash
pi install git:github.com/YOUR_USERNAME/pi-observability
```

### Manual

Copy `extensions/observability.ts` to `~/.pi/agent/extensions/observability.ts` (or `.pi/extensions/observability.ts` for project-local).

## Commands

| Command | Description |
|---------|-------------|
| `/obs` | Print full observability dashboard + last 10 sessions history |
| `/obs-toggle` | Toggle the observability footer on/off |

## Dashboard Output

```
╔══════════════════════════════════════════════════════════════╗
║  🕵️  Agent Observability Dashboard                           ║
╠══════════════════════════════════════════════════════════════╣
║  Runtime: 12:34                                              ║
║  Dir: ~/projects/my-app                                      ║
║  Branch: main                                                ║
║  Model: claude-sonnet-4                                      ║
╠══════════════════════════════════════════════════════════════╣
║  Tokens: ↑1.2k ↓3.4k                                         ║
║  Cost: $0.004200                                             ║
╠══════════════════════════════════════════════════════════════╣
║  Turns:                                                      ║
║  #1  ↑450  ↓1200  0:45  26.7/s  $0.0015  claude-sonne       ║
║  #2  ↑320  ↓900   0:32  28.1/s  $0.0012  claude-sonne       ║
╚══════════════════════════════════════════════════════════════╝
```

## Requirements

- [pi](https://github.com/mariozechner/pi) coding agent
- Git (for branch & diff stats)

## License

MIT
