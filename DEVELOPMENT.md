# Development Workflow

This guide covers how to develop, test, and publish the `pi-observability` extension.

## Table of Contents

- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [Testing Changes](#testing-changes)
- [Publishing](#publishing)
- [Versioning](#versioning)
- [Troubleshooting](#troubleshooting)

---

## Project Structure

```
pi-observability/
├── extensions/
│   └── observability.ts          # Main extension entry point
├── package.json                  # Package manifest + pi config
├── tsconfig.json                 # TypeScript config
├── README.md                     # User-facing docs
├── DEVELOPMENT.md                # This file
└── LICENSE
```

The `pi` key in `package.json` declares what pi loads:

```json
{
  "pi": {
    "extensions": ["./extensions/observability.ts"]
  }
}
```

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/imran-vz/pi-observability.git
cd pi-observability
npm install
```

### 2. Link for live testing

The fastest way to iterate is to **symlink** the extension into pi's auto-discovery directory. This lets you edit the source file and hot-reload with `/reload`.

```bash
npm run dev:link
```

This creates a symlink:
```
~/.pi/agent/extensions/observability.ts → ./extensions/observability.ts
```

> **Important:** If you previously had a copy (not symlink) at `~/.pi/agent/extensions/observability.ts`, this script removes it first.

### 3. Start pi and test

```bash
pi
```

Make edits to `extensions/observability.ts`, then in pi run:

```
/reload
```

The extension reloads instantly. No need to restart pi.

### 4. Unlink when done

```bash
npm run dev:unlink
```

This removes the symlink. To continue using the published version, reinstall:

```bash
pi install npm:pi-observability
```

### Alternative: `-e` flag (quick tests)

For one-off testing without linking:

```bash
pi -e ./extensions/observability.ts
```

This loads the extension for that session only. Good for testing on a clean slate.

### Alternative: Local path in settings

Add to `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["/absolute/path/to/pi-observability/extensions/observability.ts"]
}
```

---

## Testing Changes

Before publishing, verify:

1. **Type check:**
   ```bash
   npm run typecheck
   ```

2. **Load in pi:**
   ```bash
   npm run dev:link
   pi
   ```

3. **Test all commands:**
   - `/obs` — Dashboard prints correctly
   - `/obs-toggle` — Footer toggles on/off
   - Footer updates during streaming
   - History persists across sessions

4. **Test edge cases:**
   - Non-git directories (diff stats should show 0)
   - Very long paths (truncation works)
   - Context window exceeded (usage display)
   - Multiple models in one session

---

## Publishing

### Prerequisites

- Logged into npm: `npm login`
- Write access to the GitHub repo
- Clean working tree: `git status`

### Release workflow

**Patch release** (bug fixes):
```bash
npm run version:patch   # bumps 1.0.0 → 1.0.1, tags, pushes
npm run publish:pkg     # publishes to npm
```

**Minor release** (new features):
```bash
npm run version:minor   # bumps 1.0.0 → 1.1.0
npm run publish:pkg
```

**Major release** (breaking changes):
```bash
npm run version:major   # bumps 1.0.0 → 2.0.0
npm run publish:pkg
```

### What `npm version` does

1. Updates `version` in `package.json`
2. Creates a git commit: `1.0.1`
3. Creates a git tag: `v1.0.1`
4. Pushes commit + tag to origin

### After publishing

Users update with:
```bash
pi update
```

Or reinstall to get the latest:
```bash
pi remove npm:pi-observability
pi install npm:pi-observability
```

---

## Versioning

We follow [SemVer](https://semver.org/):

| Version change | When to use |
|----------------|-------------|
| **Patch** `1.0.0 → 1.0.1` | Bug fixes, typo corrections, performance improvements |
| **Minor** `1.0.0 → 1.1.0` | New commands, new footer features, new metrics |
| **Major** `1.0.0 → 2.0.0` | Breaking changes (command renames, removed features) |

---

## Troubleshooting

### Extension not loading after `/reload`

```bash
# Check the symlink points to the right place
ls -la ~/.pi/agent/extensions/observability.ts

# If it's a copy instead of a symlink, remove and re-link
rm ~/.pi/agent/extensions/observability.ts
npm run dev:link
```

### Type errors from pi packages

Pi bundles its core packages at runtime. The `devDependencies` are only for IDE support. If TypeScript complains about missing modules during `npm run typecheck`, make sure you've run:

```bash
npm install
```

### Published version not updating for users

npm has a TTL on package metadata. Users may need:
```bash
pi remove npm:pi-observability
pi install npm:pi-observability
```

Or wait a few minutes and run `pi update`.

### Conflicts with local copy

If you have both the npm-installed version and a local symlink, pi may load both. Unlink during published-version testing:

```bash
npm run dev:unlink
pi
```
