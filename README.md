# 🔭 pi-observability

A [pi](https://github.com/mariozechner/pi) extension that replaces the default footer with a live observability bar, provides a full dashboard command, and prints a TPS summary after each agent run.

## Features

- **Live footer bar** — Fully customizable status bar with configurable segments, layout presets, and context-zone thresholds:
  - **Model & thinking level** — Colors match pi's input field (off/low/medium/high). `xhigh`/`max` renders in rainbow
  - **Session runtime**
  - **Working directory** — Toggle between folder name or full path
  - **Git branch & diff stats** — Added/removed lines
  - **Context usage** — Progress bar + percentage + token count, with color-coded zones
  - **Session tokens** — Input/output totals
  - **Live TPS** — During streaming (chunk-based estimate)
  - **Estimated cost**

- **`/obs` command** — Full-screen TUI dashboard with per-turn breakdowns and last 10 session history. Renders through pi's native TUI (no console spam), with theme-aware borders and dynamic terminal width.

- **End-of-run TPS notification** — Prints the legacy TPS summary after each agent run: output TPS, input/output tokens, cache read/write tokens, total tokens, and elapsed time.

- **`/obs-toggle` command** — Toggle the live footer on/off

- **`/obs-settings` command** — Interactive TUI for customizing the footer: choose from 4 layout presets or toggle individual segments and set context-usage warning thresholds

## Preview

![pi-observability demo](./demo-preview.gif)

### Footer

Compact single-line layout that falls back to two lines when the terminal is narrow:

```
gpt-5.5:high ▸ ⏱ 12:34 ▸ 📁 my-app ▸  main +42 -7 ▸ ctx [████░░░░░░] 42% 4.2k/200k ▸ ↑1.2k ↓3.4k ▸ $0.0042
```

With `xhigh` or `max` thinking, the model name renders in rainbow:

```
gpt-5.5:xhigh ▸ ⏱ 12:34 ▸ 📁 my-app ▸ ↑1.2k ↓3.4k ▸ $0.0042
```

#### Settings

Run `/obs-settings` to open the interactive settings panel:

| Preset | Description |
|--------|-------------|
| `minimal` | Model, context usage (bar + numbers), cost only |
| `standard` | Everything except TPS (default) |
| `verbose` | All segments on |
| `performance` | Model, context %, TPS, cost |

Individual segments you can toggle:

- **Model & Thinking** — Model name + thinking level
- **Runtime** — Session timer
- **Working Directory** — Current folder or full path (`/obs-toggle-path`)
- **Git Branch & Diff** — Branch name + added/removed line counts
- **Context Usage** — Master toggle with 3 sub-options:
  - Progress bar (`[████░░░░░░]`)
  - Percentage
  - Token count (`used/total`)
- **Session Tokens** — Total input/output
- **TPS** — Live during streaming, last-turn when idle
- **Cost** — Estimated session cost

Context-usage color zones (configurable):

| Zone | Default | Color |
|------|---------|-------|
| Normal | ≤ 70% | Green |
| Expert | 71–85% | Yellow |
| Warning | > 85% | Red |

### Dashboard (`/obs`)

```
┌──────────────────────────────────────────┐
│ Agent Observability Dashboard            │
├──────────────────────────────────────────┤
│ Runtime: 12:34    Dir: ~/projects/my-app │
│ Branch: main    Model: claude-sonnet-4   │
├──────────────────────────────────────────┤
│ Tokens: ↑1.2k ↓3.4k                      │
│ Cost: $0.004200                          │
└──────────────────────────────────────────┘

  TURNS  (2)
  #   Input   Output   Time   TPS    Cost    Model
  ─────────────────────────────────────────────────
  1   ↑450    ↓1200    0:45   26.7   $0.00   claude-sonnet-4
  2   ↑320    ↓900     0:32   28.1   $0.00   claude-sonnet-4

  LAST 10 SESSIONS
  When                Duration   Turns   Input   Output   Cost
  ───────────────────────────────────────────────────────────
  Apr 18, 04:19 PM    9:05       10      ↑110k   ↓9.9k    $0.00
```

## Install

### Via npm

```bash
pi install npm:pi-observability
```

### Via git

```bash
pi install git:github.com/imran-vz/pi-observability
```

### Manual

Copy the entire `extensions/` directory to `~/.pi/agent/extensions/` (or `.pi/extensions/` for project-local):

```bash
cp -r extensions/* ~/.pi/agent/extensions/
```

> **Note:** This extension is split into multiple files (`observability.ts` + `lib/`). Copying only the main file will break imports.

## Commands

| Command | Description |
|---------|-------------|
| `/obs` | Open full observability dashboard in TUI overlay |
| `/obs-toggle` | Toggle the observability footer on/off |
| `/obs-toggle-path` | Toggle between folder name and full path in footer |
| `/obs-settings` | Open interactive footer settings (presets, segments, context zones) |

## Migration from TPS

The standalone TPS extension is no longer required. pi-observability now includes its end-of-run TPS notification, so remove `~/.pi/agent/extensions/tps.ts` if it is installed to avoid duplicate notifications.

## Requirements

- [pi](https://github.com/mariozechner/pi) coding agent
- Git (for branch & diff stats)

## License

MIT
