const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { brandedQuoted } = require('../library/brandedQuote');

const ROOT = path.join(__dirname, '..');

function run(cmd, cwd) {
    return new Promise((resolve) => {
        exec(cmd, { cwd, timeout: 30000 }, (err, stdout, stderr) => {
            resolve({ err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
        });
    });
}

function hasGit() {
    return fs.existsSync(path.join(ROOT, '.git'));
}

// Reads only the newest "## ..." section from CHANGELOG.md — this is
// the friendly, custom message the bot owner writes by hand. It never
// shows commit hashes, commit messages, or which files changed.
function readLatestChangelog() {
    const file = path.join(ROOT, 'CHANGELOG.md');
    if (!fs.existsSync(file)) return null;

    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw.split('\n');

    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('## ')) { start = i; break; }
    }
    if (start === -1) return null;

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('## ')) { end = i; break; }
    }

    return lines.slice(start, end).join('\n').trim();
}

// Extracts the same "latest section" logic, but from a given raw string
// (used when we want the *remote* CHANGELOG.md, not the local one on disk).
function extractLatestSection(raw) {
    if (!raw) return null;
    const lines = raw.split('\n');

    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('## ')) { start = i; break; }
    }
    if (start === -1) return null;

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('## ')) { end = i; break; }
    }

    return lines.slice(start, end).join('\n').trim();
}

// checkupdate only fetches (never pulls), so the local CHANGELOG.md on disk
// is still the OLD version at that point. This reads CHANGELOG.md as it
// exists on the fetched remote ref instead, so the preview matches what
// `update` will actually pull in.
async function readRemoteChangelog() {
    const { err, stdout } = await run('git show @{u}:CHANGELOG.md', ROOT);
    if (err || !stdout) return null;
    return extractLatestSection(stdout);
}

// ── RESTART ──────────────────────────────────────────────────
const restart = {
    command: 'restart',
    description: 'Restart the bot process',
    category: 'system',
    owner: true,
    execute: async (sock, m, { tc }) => {
        await sock.sendMessage(m.chat, {
            text: `🔄 ${tc('restarting')}...`
        }, { quoted: await brandedQuoted() });
        setTimeout(() => process.exit(1), 800);
    }
};

// ── CHECKUPDATE ──────────────────────────────────────────────
const checkupdate = {
    command: 'checkupdate',
    description: 'Check for new commits on the remote repo',
    category: 'system',
    owner: true,
    execute: async (sock, m, { tc }) => {
        const brandedQ = await brandedQuoted();

        if (!hasGit()) {
            return sock.sendMessage(m.chat, {
                text: tc('no git repository configured')
            }, { quoted: brandedQ });
        }

        await sock.sendMessage(m.chat, { react: { text: '🔎', key: m.key } });

        await run('git fetch', ROOT);
        const local  = (await run('git rev-parse HEAD', ROOT)).stdout;
        const remote = (await run('git rev-parse @{u}', ROOT)).stdout;

        if (!local || !remote) {
            await sock.sendMessage(m.chat, {
                text: `❌ ${tc('could not check for updates')}`
            }, { quoted: brandedQ });
            await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return;
        }

        if (local === remote) {
            await sock.sendMessage(m.chat, {
                text: `✅ ${tc('you are on the latest version')}`
            }, { quoted: brandedQ });
        } else {
            const { stdout: log } = await run('git log HEAD..@{u} --oneline', ROOT);
            const count = log ? log.split('\n').filter(Boolean).length : 0;
            const changelog = await readRemoteChangelog();

            const body = changelog
                ? `🆕 ${tc('update available')}\n\n${changelog}`
                : `🆕 ${count} ${tc('new commits available')}`;

            await sock.sendMessage(m.chat, { text: body }, { quoted: brandedQ });
        }
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
    }
};

// ── UPDATE ───────────────────────────────────────────────────
const update = {
    command: 'update',
    description: 'Pull latest changes and restart',
    category: 'system',
    owner: true,
    execute: async (sock, m, { tc }) => {
        const brandedQ = await brandedQuoted();

        if (!hasGit()) {
            return sock.sendMessage(m.chat, {
                text: tc('no git repository configured')
            }, { quoted: brandedQ });
        }

        await sock.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } });

        const statusMsg = await sock.sendMessage(m.chat, {
            text: `⏳ ${tc('pulling latest changes')}...`
        }, { quoted: brandedQ });

        const { err, stdout } = await run('git pull', ROOT);

        if (err) {
            await sock.sendMessage(m.chat, {
                text: `❌ ${tc('update failed')}`, edit: statusMsg.key
            });
            await sock.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return;
        }

        if (/Already up to date/i.test(stdout)) {
            await sock.sendMessage(m.chat, {
                text: `✅ ${tc('already up to date')}`, edit: statusMsg.key
            });
            await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            return;
        }

        await sock.sendMessage(m.chat, {
            text: `✅ ${tc('updated')} — ${tc('restarting')}...`,
            edit: statusMsg.key
        });

        const changelog = readLatestChangelog();
        if (changelog) {
            await sock.sendMessage(m.chat, { text: changelog }, { quoted: brandedQ });
        }

        setTimeout(() => process.exit(1), 1000);
    }
};

module.exports = [restart, checkupdate, update];
