<div align="center">

# focus-mode

**Kill distractions, set your GitHub status, block sites, and start a Pomodoro timer — one command.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?labelColor=0B0A09)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?labelColor=0B0A09)](package.json)
[![Node: >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen?labelColor=0B0A09)](package.json)

</div>

## Install

```bash
npx github:NickCirv/focus-mode
```

Or install globally:

```bash
npm install -g github:NickCirv/focus-mode
```

## Usage

```bash
focus start                                     # 90 min session
focus start --duration 60 --task "auth bug"    # named session, custom length
focus end                                       # end early, restore everything
focus status                                    # check active session + all-time stats
focus config                                    # interactive setup (GitHub token, blocked sites, apps)
```

| Flag | Description |
|------|-------------|
| `--duration <min>` | Session length in minutes (default: 90) |
| `--task <string>` | Label what you're working on |

## What it does

Running `focus start` kills Slack, Discord, and Messages; sets your GitHub status to "In focus mode — back in Nmin" with limited availability; blocks Twitter, Reddit, YouTube, and HN via `/etc/hosts`; then runs a live Pomodoro countdown (25 min work / 5 min break cycles). When the session ends — or you hit Ctrl+C — it clears your GitHub status, restores `/etc/hosts`, and shows how long you actually focused.

Site blocking writes to `/etc/hosts` and requires sudo on most systems. Everything else works without elevated permissions.

Config is stored in `~/.focus-mode.json`. Run `focus config` to set your GitHub personal access token (`user` scope), default duration, which apps to kill, and which sites to block.

---
<sub>Zero dependencies · Node >=18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
