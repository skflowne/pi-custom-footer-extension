# Pi Custom Footer Extension

A standalone Pi extension that keeps the normal footer layout while providing:

- Configurable context-usage thresholds and colors.
- Configurable colors for token, cost, path, branch, and model information.
- Optional display of the current-working-directory, Git branch, and session line.
- The active model's effort/thinking level.
- Display of extension statuses, including `pi-git-branch-extension`, with per-extension exclusions.

It does not depend on or import any other extension. It consumes Pi's generic
footer status provider, so other extensions remain optional. Extension statuses
are displayed by default; use `excludedExtensionStatuses` to hide selected ones.

## Installation

```bash
pi install git:github.com/<your-user>/pi-custom-footer-extension
```

For local development:

```bash
pi -e ./custom-footer.ts
```

## Configuration

The default layout matches Pi's original footer: most sections are dim, with
context warnings at 60% and errors at 85%. The example below enables brighter
colors and custom thresholds.

Create `~/.pi/agent/custom-footer.json` for global defaults, or
`.pi/custom-footer.json` for a project-specific override:

```json
{
  "excludedExtensionStatuses": ["pi-git-branch-extension"],
  "showCwdAndGitBranch": false,
  "contextThresholds": [
    { "minPercent": 0, "color": "success" },
    { "minPercent": 50, "color": "warning" },
    { "minPercent": 75, "color": "error" }
  ],
  "colors": {
    "cwd": "muted",
    "branch": "accent",
    "input": "accent",
    "output": "success",
    "cost": "warning",
    "model": "accent",
    "thinking": "warning"
  }
}
```

Thresholds use the highest matching `minPercent`. Available colors are Pi
theme color tokens such as `accent`, `success`, `warning`, `error`, `muted`,
and `dim`.

`excludedExtensionStatuses` contains extension status IDs to hide; all other
extension statuses are shown. Set `showCwdAndGitBranch` to `false` to hide the
line containing the working directory, Git branch, and session name. By default,
statuses keep their original colors.
Set `preserveStatusColors` to `false` to recolor all statuses with `colors.status`.
