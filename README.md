![focus-mode — Nicholas Ashkar repository collection](assets/nicholas-ashkar/banner.png)

# focus-mode

Coordinate a timed focus session with optional desktop and GitHub status actions.


<a id="usage"></a>

## What it does

Supports start, end, status and configuration. Depending on configuration and platform it can close distracting applications, alter hosts-file blocking, set a GitHub status and store session history. See the pinned [implementation](https://github.com/NickCirv/focus-mode/blob/7d6ae1cab5302639122e85e71d719b38b7b3031d/index.js).


<a id="install"></a>

## Quickstart

Node requirement from the inspected manifest: **`>=20`**. Review configuration before start. Hosts-file changes may require elevated privileges; status is the lower-impact first inspection.

The following example is **source-inspected, not executed**. It uses a pinned checkout; npm package publication is not assumed. Replace project paths or provide the stated input fixtures before running it.

```bash
git clone https://github.com/NickCirv/focus-mode.git
cd focus-mode
git checkout 7d6ae1cab5302639122e85e71d719b38b7b3031d
npm install --ignore-scripts
node index.js status
```

Dependencies are installed with lifecycle scripts disabled in this recipe. Read the package scripts before enabling any lifecycle step required by your environment.

## Usage and reference

`focus` are the executable names declared by the package. [Command reference](docs/REFERENCE.md) covers source-backed options and entry points.

| Control | Behavior in the inspected implementation |
| --- | --- |
| `status` | Inspect session state |
| `config` | Review or change local configuration |
| `start --duration MINUTES` | Start a session with configured side effects |
| `end` | End the active session and attempt cleanup |

## Limits and operational notes

Starting a session is not just a timer: default app/site lists can affect running applications and network resolution. The GitHub token is stored in local configuration; protect that file. Platform support and cleanup after interruption have not been tested.

## Development

No runtime checks were executed for this documentation review. The committed smoke test checks entrypoint JavaScript syntax; it does not exercise the command behavior.

| Script | Declared command |
| --- | --- |
| `test` | `node --test` |

Work from the pinned source, keep changes focused, and reproduce the affected behavior with a small fixture before proposing a change. Existing contribution and security policies remain authoritative where present.

## Research and status

[Research record](docs/RESEARCH.md) identifies the inspected revision, source evidence, documentation disposition and verification gaps. Static inspection supports the descriptions here; runtime behavior, dependency installation and current hosted services remain unverified.

## License and author

[License](https://github.com/NickCirv/focus-mode/blob/7d6ae1cab5302639122e85e71d719b38b7b3031d/LICENSE)

[Nicholas Ashkar](https://nicholashkar.com) · Applied AI, systems and consulting.
