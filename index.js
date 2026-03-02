#!/usr/bin/env node

import { execSync, execFile } from 'child_process';
import fs from 'fs';
import readline from 'readline';
import https from 'https';
import os from 'os';
import path from 'path';

// ─── Constants ───────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(os.homedir(), '.focus-mode.json');
const FOCUS_MARKER = '# focus-mode';
const HOSTS_PATH = '/etc/hosts';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const c = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

// ─── Config ──────────────────────────────────────────────────────────────────

function loadConfig() {
  const defaults = {
    github_token: '',
    default_duration: 90,
    apps_to_kill: ['Slack', 'Discord', 'Messages'],
    sites_to_block: ['twitter.com', 'reddit.com', 'youtube.com', 'news.ycombinator.com'],
    history: [],
    active_session: null,
  };

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── Platform Detection ───────────────────────────────────────────────────────

const platform = process.platform;
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';
const isWindows = platform === 'win32';

// ─── Utilities ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { flags: {}, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args.flags[key] = val;
    } else {
      args.positional.push(argv[i]);
    }
  }
  return args;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function progressBar(current, total, width) {
  width = width || 10;
  const filled = Math.round((current / Math.max(total, 1)) * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

function httpsRequest(options, body) {
  return new Promise(function(resolve, reject) {
    const req = https.request(options, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function execSafe(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function hasSudo() {
  return execSafe('sudo -n true 2>/dev/null');
}

function clearLine() {
  process.stdout.write('\r\x1b[K');
}

function moveCursorUp(n) {
  process.stdout.write('\x1b[' + n + 'A');
}

// ─── Step 1: Kill Apps ────────────────────────────────────────────────────────

async function killApps(apps) {
  const results = {};
  for (const app of apps) {
    let killed = false;
    if (isMac) {
      killed = execSafe('osascript -e \'quit app "' + app + '"\'');
      if (!killed) killed = execSafe('pkill -x "' + app + '"');
    } else if (isLinux) {
      const lower = app.toLowerCase();
      killed = execSafe('pkill -x "' + lower + '"') || execSafe('pkill -x "' + app + '"');
    } else if (isWindows) {
      killed = execSafe('taskkill /IM "' + app + '.exe" /F');
    }
    results[app] = killed;
  }
  return results;
}

// ─── Step 2: GitHub Status ────────────────────────────────────────────────────

async function setGitHubStatus(token, duration, task) {
  if (!token) return { success: false, reason: 'no token' };

  const message = 'In focus mode \u2014 back in ' + duration + 'min';

  const body = JSON.stringify({
    emoji: '\uD83C\uDFAF',
    message: message,
    limited_availability: true,
  });

  try {
    const res = await httpsRequest({
      hostname: 'api.github.com',
      path: '/user/status',
      method: 'PATCH',
      headers: {
        Authorization: 'token ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'focus-mode-cli',
        Accept: 'application/vnd.github.v3+json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, body);

    return { success: res.status === 200, status: res.status };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

async function clearGitHubStatus(token) {
  if (!token) return false;

  const body = JSON.stringify({ emoji: '', message: '', limited_availability: false });

  try {
    const res = await httpsRequest({
      hostname: 'api.github.com',
      path: '/user/status',
      method: 'PATCH',
      headers: {
        Authorization: 'token ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'focus-mode-cli',
        Accept: 'application/vnd.github.v3+json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, body);

    return res.status === 200;
  } catch {
    return false;
  }
}

// ─── Step 3: Block Sites ──────────────────────────────────────────────────────

async function blockSites(sites) {
  if (isWindows) return { success: false, reason: 'Windows not supported' };

  const hostsPath = HOSTS_PATH;

  let canWrite = false;
  try {
    fs.accessSync(hostsPath, fs.constants.W_OK);
    canWrite = true;
  } catch {
    canWrite = hasSudo();
  }

  if (!canWrite) return { success: false, reason: 'no sudo' };

  try {
    const entries = sites.map(function(s) { return '127.0.0.1 ' + s + ' ' + FOCUS_MARKER; }).join('\n');
    const block = '\n# --- Focus Mode Block (start) ---\n' + entries + '\n# --- Focus Mode Block (end) ---\n';

    try {
      fs.appendFileSync(hostsPath, block);
    } catch {
      const tempFile = '/tmp/focus-hosts-' + Date.now();
      fs.writeFileSync(tempFile, block);
      execSafe('sudo sh -c \'cat ' + tempFile + ' >> ' + hostsPath + '\'');
      try { fs.unlinkSync(tempFile); } catch {}
    }

    if (isMac) execSafe('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');
    if (isLinux) execSafe('sudo systemctl restart systemd-resolved');

    return { success: true };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

async function unblockSites() {
  if (isWindows) return false;
  const hostsPath = HOSTS_PATH;

  try {
    let content = fs.readFileSync(hostsPath, 'utf8');
    const cleaned = content
      .replace(/\n# --- Focus Mode Block \(start\) ---[\s\S]*?# --- Focus Mode Block \(end\) ---\n/g, '\n')
      .replace(/^.*# focus-mode.*\n?/gm, '');

    try {
      fs.writeFileSync(hostsPath, cleaned);
    } catch {
      const tempFile = '/tmp/focus-hosts-restore-' + Date.now();
      fs.writeFileSync(tempFile, cleaned);
      execSafe('sudo cp ' + tempFile + ' ' + hostsPath);
      try { fs.unlinkSync(tempFile); } catch {}
    }

    if (isMac) execSafe('sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder');
    if (isLinux) execSafe('sudo systemctl restart systemd-resolved');

    return true;
  } catch {
    return false;
  }
}

// ─── Step 4: Pomodoro Timer ───────────────────────────────────────────────────

function renderDisplay(state) {
  const task = state.task;
  const totalSeconds = state.totalSeconds;
  const elapsedSeconds = state.elapsedSeconds;
  const pomodoroIndex = state.pomodoroIndex;
  const totalPomodoros = state.totalPomodoros;
  const stepResults = state.stepResults;
  const breakTime = state.breakTime;

  const remaining = totalSeconds - elapsedSeconds;
  const isLastTen = remaining <= 600 && remaining > 0;
  const timeColor = isLastTen ? 'yellow' : 'cyan';
  const timeStr = formatTime(remaining);

  const killedApps = stepResults.apps
    ? Object.entries(stepResults.apps).filter(function(e) { return e[1]; }).map(function(e) { return e[0]; })
    : [];

  const appLine = stepResults.apps !== null
    ? (killedApps.length > 0
        ? c('green', '  \u2713 Apps killed (' + killedApps.join(', ') + ')')
        : c('dim', '  \u2717 No apps were running'))
    : c('dim', '  \u00b7 Killing apps...');

  const ghLine = stepResults.github !== null
    ? (stepResults.github
        ? c('green', '  \u2713 GitHub status set')
        : c('dim', '  \u2717 GitHub status skipped'))
    : c('dim', '  \u00b7 Setting GitHub status...');

  const siteLine = stepResults.sites !== null
    ? (stepResults.sites
        ? c('green', '  \u2713 Sites blocked')
        : c('yellow', '  \u2717 Sites not blocked (' + (stepResults.sitesReason || 'no sudo') + ')'))
    : c('dim', '  \u00b7 Blocking sites...');

  const bar = progressBar(pomodoroIndex, totalPomodoros);
  const pomStr = pomodoroIndex + '/' + totalPomodoros;

  const lines = [
    '',
    c('bold', '  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501'),
    c('bold', '  \uD83C\uDFAF FOCUS MODE ACTIVE'),
    task ? ('  Task: ' + c('cyan', task)) : '  Task: ' + c('dim', '(focus)'),
    c('bold', '  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501'),
    '',
    breakTime
      ? c('yellow', c('bold', '  \u2615  BREAK TIME \u2014 take 5 minutes'))
      : ('  Time remaining:  ' + c(timeColor, c('bold', timeStr))),
    '  Pomodoro:        ' + c('magenta', pomStr + '  ' + bar),
    '',
    appLine,
    ghLine,
    siteLine,
    '',
    c('dim', '  Ctrl+C to end session'),
    '',
  ];

  return lines;
}

async function runTimer(state, onEnd) {
  const POMODORO_WORK = 25 * 60;
  const POMODORO_BREAK = 5 * 60;
  const CYCLE = POMODORO_WORK + POMODORO_BREAK;

  let displayLines = [];
  let firstRender = true;

  function render() {
    const lines = renderDisplay(state);

    if (!firstRender) {
      moveCursorUp(displayLines.length);
    }

    lines.forEach(function(line) {
      clearLine();
      console.log(line);
    });

    displayLines = lines;
    firstRender = false;
  }

  render();

  const interval = setInterval(function() {
    if (state.paused) return;

    state.elapsedSeconds++;

    const pomodoroElapsed = state.elapsedSeconds % CYCLE;
    if (pomodoroElapsed === POMODORO_WORK && !state.breakTime) {
      state.breakTime = true;
      state.pomodoroIndex = Math.min(state.pomodoroIndex + 1, state.totalPomodoros);
    } else if (pomodoroElapsed === 0 && state.elapsedSeconds > 0) {
      state.breakTime = false;
    }

    if (state.elapsedSeconds >= state.totalSeconds) {
      clearInterval(interval);
      state.completed = true;
      render();
      onEnd();
      return;
    }

    render();
  }, 1000);

  return interval;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdStart(args) {
  const config = loadConfig();

  if (config.active_session) {
    console.log(c('yellow', '\nA focus session is already active. Run `focus end` first.\n'));
    process.exit(1);
  }

  const duration = parseInt(args.flags.duration || config.default_duration, 10);
  const task = args.flags.task || null;

  console.log('');
  console.log(c('bold', c('cyan', '  \uD83C\uDFAF Starting focus mode...')));
  console.log('');

  const stepResults = {
    apps: null,
    github: null,
    sites: null,
    sitesReason: null,
  };

  // Step 1: Kill apps
  process.stdout.write(c('dim', '  Killing distracting apps...'));
  stepResults.apps = await killApps(config.apps_to_kill);
  const killedCount = Object.values(stepResults.apps).filter(Boolean).length;
  clearLine();
  if (killedCount > 0) {
    const killed = Object.entries(stepResults.apps).filter(function(e) { return e[1]; }).map(function(e) { return e[0]; });
    console.log(c('green', '  \u2713 Killed: ' + killed.join(', ')));
  } else {
    console.log(c('dim', '  \u2717 No apps were running'));
  }

  // Step 2: GitHub status
  if (config.github_token) {
    process.stdout.write(c('dim', '  Setting GitHub status...'));
    const ghResult = await setGitHubStatus(config.github_token, duration, task);
    stepResults.github = ghResult.success;
    clearLine();
    if (ghResult.success) {
      console.log(c('green', '  \u2713 GitHub status set'));
    } else {
      console.log(c('dim', '  \u2717 GitHub status failed (' + (ghResult.reason || ghResult.status) + ')'));
    }
  } else {
    stepResults.github = false;
    console.log(c('dim', '  \u2717 GitHub status skipped (no token \u2014 run `focus config`)'));
  }

  // Step 3: Block sites
  process.stdout.write(c('dim', '  Blocking distracting sites...'));
  const blockResult = await blockSites(config.sites_to_block);
  stepResults.sites = blockResult.success;
  stepResults.sitesReason = blockResult.reason;
  clearLine();
  if (blockResult.success) {
    console.log(c('green', '  \u2713 Sites blocked: ' + config.sites_to_block.join(', ')));
  } else {
    console.log(c('yellow', '  \u2717 Sites not blocked (' + blockResult.reason + ') \u2014 run with sudo to enable'));
  }

  console.log('');

  // Save session
  const session = {
    task: task,
    duration: duration,
    start_time: new Date().toISOString(),
    step_results: stepResults,
  };

  config.active_session = session;
  saveConfig(config);

  // Step 4: Run timer
  const totalSeconds = duration * 60;
  const totalPomodoros = Math.ceil(duration / 30);

  const timerState = {
    task: task,
    totalSeconds: totalSeconds,
    elapsedSeconds: 0,
    pomodoroIndex: 0,
    totalPomodoros: totalPomodoros,
    stepResults: stepResults,
    breakTime: false,
    paused: false,
    completed: false,
  };

  let timerInterval;
  let sessionEnded = false;

  async function endSession(interrupted) {
    if (sessionEnded) return;
    sessionEnded = true;
    if (timerInterval) clearInterval(timerInterval);

    const elapsed = timerState.elapsedSeconds;
    const completedFull = elapsed >= totalSeconds;
    const minutesFocused = Math.floor(elapsed / 60);

    console.log('');
    console.log(c('bold', '  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501'));
    console.log(c('bold', '  Session Complete'));
    console.log(c('bold', '  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501'));
    console.log('');

    if (completedFull) {
      console.log(c('green', c('bold', '  \uD83D\uDD25 ' + duration + ' minutes of actual work. You are a machine.')));
    } else {
      console.log(c('yellow', '  You lasted ' + minutesFocused + ' of ' + duration + ' minutes.'));
      if (minutesFocused < duration / 2) {
        console.log(c('red', '  The meeting could have waited.'));
      } else {
        console.log(c('yellow', '  Not bad. Come back stronger.'));
      }
    }

    console.log('');
    console.log('  Focused for: ' + c('cyan', formatDuration(elapsed)));
    if (task) console.log('  Task: ' + c('cyan', task));
    console.log('');

    // Restore GitHub status
    const cfg = loadConfig();
    if (cfg.github_token) {
      process.stdout.write(c('dim', '  Clearing GitHub status...'));
      const cleared = await clearGitHubStatus(cfg.github_token);
      clearLine();
      console.log(cleared ? c('green', '  \u2713 GitHub status cleared') : c('dim', '  \u2717 Could not clear GitHub status'));
    }

    // Remove /etc/hosts entries
    process.stdout.write(c('dim', '  Restoring /etc/hosts...'));
    const unblocked = await unblockSites();
    clearLine();
    if (unblocked) {
      console.log(c('green', '  \u2713 Sites unblocked'));
    } else {
      console.log(c('dim', '  \u2717 Could not restore /etc/hosts'));
    }

    // Save to history
    cfg.active_session = null;
    cfg.history = cfg.history || [];
    cfg.history.push({
      task: task,
      duration: duration,
      elapsed_seconds: elapsed,
      start_time: session.start_time,
      end_time: new Date().toISOString(),
      completed: completedFull,
    });
    saveConfig(cfg);

    console.log('');
    console.log(c('dim', '  Stay dangerous. \uD83C\uDFAF'));
    console.log('');

    process.exit(0);
  }

  process.on('SIGINT', function() {
    console.log('');
    endSession(true);
  });

  timerInterval = await runTimer(timerState, function() {
    endSession(false);
  });
}

async function cmdEnd() {
  const config = loadConfig();

  if (!config.active_session) {
    console.log(c('yellow', '\nNo active focus session found.\n'));
    process.exit(1);
  }

  const task = config.active_session.task;
  const duration = config.active_session.duration;
  const start_time = config.active_session.start_time;
  const elapsed = Math.floor((Date.now() - new Date(start_time).getTime()) / 1000);
  const minutesFocused = Math.floor(elapsed / 60);
  const completedFull = minutesFocused >= duration;

  console.log('');
  console.log(c('bold', '  Ending focus session...'));
  console.log('');

  if (config.github_token) {
    process.stdout.write(c('dim', '  Clearing GitHub status...'));
    const cleared = await clearGitHubStatus(config.github_token);
    clearLine();
    console.log(cleared ? c('green', '  \u2713 GitHub status cleared') : c('dim', '  \u2717 Could not clear GitHub status'));
  }

  process.stdout.write(c('dim', '  Restoring /etc/hosts...'));
  const unblocked = await unblockSites();
  clearLine();
  if (unblocked) {
    console.log(c('green', '  \u2713 Sites unblocked'));
  } else {
    console.log(c('dim', '  \u2717 Could not restore /etc/hosts (may need sudo)'));
  }

  console.log('');
  console.log(c('bold', '  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501'));
  if (completedFull) {
    console.log(c('green', c('bold', '  \uD83D\uDD25 ' + duration + ' minutes of actual work. You are a machine.')));
  } else {
    console.log(c('yellow', '  You lasted ' + minutesFocused + ' of ' + duration + ' minutes. The meeting could have waited.'));
  }
  console.log('');
  console.log('  Focused for: ' + c('cyan', formatDuration(elapsed)));
  if (task) console.log('  Task: ' + c('cyan', task));
  console.log(c('bold', '  \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501'));
  console.log('');

  config.history.push({
    task: task,
    duration: duration,
    elapsed_seconds: elapsed,
    start_time: start_time,
    end_time: new Date().toISOString(),
    completed: completedFull,
  });
  config.active_session = null;
  saveConfig(config);

  console.log(c('dim', '  Stay dangerous. \uD83C\uDFAF'));
  console.log('');
}

async function cmdStatus() {
  const config = loadConfig();

  console.log('');

  if (!config.active_session) {
    console.log(c('dim', '  No active focus session.'));
    console.log('');

    if (config.history && config.history.length > 0) {
      const last = config.history[config.history.length - 1];
      const elapsed = Math.floor(last.elapsed_seconds / 60);
      console.log(c('bold', '  Last session:'));
      console.log('    Task:      ' + (last.task || '(no task)'));
      console.log('    Duration:  ' + elapsed + 'min of ' + last.duration + 'min');
      console.log('    Completed: ' + (last.completed ? c('green', 'Yes') : c('yellow', 'No')));
      console.log('    Date:      ' + new Date(last.start_time).toLocaleString());
      console.log('');

      const totalFocused = config.history.reduce(function(sum, h) { return sum + Math.floor(h.elapsed_seconds / 60); }, 0);
      const totalSessions = config.history.length;
      const completedSessions = config.history.filter(function(h) { return h.completed; }).length;
      const totalElapsed = config.history.reduce(function(s, h) { return s + h.elapsed_seconds; }, 0);
      console.log(c('bold', '  All-time stats:'));
      console.log('    Sessions:  ' + totalSessions + ' (' + completedSessions + ' completed)');
      console.log('    Total:     ' + formatDuration(totalElapsed));
    }
    console.log('');
    return;
  }

  const task = config.active_session.task;
  const duration = config.active_session.duration;
  const start_time = config.active_session.start_time;
  const elapsed = Math.floor((Date.now() - new Date(start_time).getTime()) / 1000);
  const remaining = Math.max(0, duration * 60 - elapsed);

  console.log(c('bold', '  \uD83C\uDFAF FOCUS MODE ACTIVE'));
  console.log('');
  console.log('  Task:       ' + (task ? c('cyan', task) : c('dim', '(no task set)')));
  console.log('  Started:    ' + new Date(start_time).toLocaleTimeString());
  console.log('  Elapsed:    ' + c('cyan', formatDuration(elapsed)));
  console.log('  Remaining:  ' + c('yellow', formatTime(remaining)));
  console.log('  Duration:   ' + duration + 'min');
  console.log('');
  console.log(c('dim', '  Run `focus end` to end the session early.'));
  console.log('');
}

async function cmdConfig() {
  const config = loadConfig();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function ask(question, def) {
    return new Promise(function(resolve) {
      const hint = def ? c('dim', ' (' + def + ')') : '';
      rl.question('  ' + question + hint + ': ', function(ans) {
        resolve(ans.trim() || def || '');
      });
    });
  }

  console.log('');
  console.log(c('bold', '  focus-mode configuration'));
  console.log(c('dim', '  Press Enter to keep current value'));
  console.log('');

  const tokenDisplay = config.github_token ? '****' + config.github_token.slice(-4) : '';
  const token = await ask('GitHub personal access token', tokenDisplay);
  const duration = await ask('Default focus duration (minutes)', String(config.default_duration));
  const appsInput = await ask('Apps to kill (comma-separated)', config.apps_to_kill.join(', '));
  const sitesInput = await ask('Sites to block (comma-separated)', config.sites_to_block.join(', '));

  rl.close();

  if (token && !token.includes('****')) {
    config.github_token = token;
  }
  config.default_duration = parseInt(duration, 10) || 90;
  if (appsInput) config.apps_to_kill = appsInput.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (sitesInput) config.sites_to_block = sitesInput.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

  saveConfig(config);

  console.log('');
  console.log(c('green', '  \u2713 Configuration saved to ~/.focus-mode.json'));
  console.log('');

  if (!config.github_token) {
    console.log(c('yellow', '  Tip: Add a GitHub token to enable status updates.'));
    console.log(c('dim', '  Create one at: https://github.com/settings/tokens'));
    console.log(c('dim', '  Required scope: user (for status updates)'));
    console.log('');
  }
}

function printHelp() {
  console.log('');
  console.log(c('bold', '  focus-mode \uD83C\uDFAF'));
  console.log(c('dim', '  One command. Deep work activated.'));
  console.log('');
  console.log(c('bold', '  Usage:'));
  console.log('    focus start [--duration 90] [--task "description"]');
  console.log('    focus end');
  console.log('    focus status');
  console.log('    focus config');
  console.log('');
  console.log(c('bold', '  Options:'));
  console.log('    --duration <min>   Session length in minutes (default: 90)');
  console.log('    --task <string>    What you are working on');
  console.log('');
  console.log(c('bold', '  What it does:'));
  console.log('    1. Kills Slack, Discord, Messages');
  console.log('    2. Sets your GitHub status to "In focus mode"');
  console.log('    3. Blocks reddit, twitter, youtube via /etc/hosts');
  console.log('    4. Runs a Pomodoro timer with live display');
  console.log('    5. Restores everything when done');
  console.log('');
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const command = args.positional[0];

  switch (command) {
    case 'start':
      await cmdStart(args);
      break;
    case 'end':
    case 'stop':
      await cmdEnd();
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'config':
    case 'setup':
      await cmdConfig();
      break;
    default:
      printHelp();
      break;
  }
}

main().catch(function(err) {
  console.error(c('red', '\n  Error: ' + err.message + '\n'));
  process.exit(1);
});
