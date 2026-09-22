# focus-mode — command reference

[Overview](../README.md) · [Research record](RESEARCH.md)

Describes revision `7d6ae1cab5302639122e85e71d719b38b7b3031d`. Commands are source-inspected; no execution results are asserted.

## Workflow

Supports start, end, status and configuration. Depending on configuration and platform it can close distracting applications, alter hosts-file blocking, set a GitHub status and store session history.

Review configuration before start. Hosts-file changes may require elevated privileges; status is the lower-impact first inspection.

```bash
node index.js status
```

## Commands and controls

| Control | Behavior in the inspected implementation |
| --- | --- |
| `status` | Inspect session state |
| `config` | Review or change local configuration |
| `start --duration MINUTES` | Start a session with configured side effects |
| `end` | End the active session and attempt cleanup |

## Interpretation and side effects

Starting a session is not just a timer: default app/site lists can affect running applications and network resolution. The GitHub token is stored in local configuration; protect that file. Platform support and cleanup after interruption have not been tested.

## Implementation reference

- [package.json](https://github.com/NickCirv/focus-mode/blob/7d6ae1cab5302639122e85e71d719b38b7b3031d/package.json)
- [index.js](https://github.com/NickCirv/focus-mode/blob/7d6ae1cab5302639122e85e71d719b38b7b3031d/index.js)
- [test/smoke.test.js](https://github.com/NickCirv/focus-mode/blob/7d6ae1cab5302639122e85e71d719b38b7b3031d/test/smoke.test.js)
