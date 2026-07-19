
// © DANGER BOY. All Rights Reserved.
//
// Fetches the bot's creds.json from the session generator server using
// the short SESSION_ID from .env, and writes it directly into the bot's
// session folder (config().session/creds.json) BEFORE the bot's own
// useSingleFileAuthState() reads that path.
//
// If SESSION_ID is missing, empty, or doesn't have the expected prefix,
// this does nothing and the bot falls through to its normal behavior
// (an empty/fresh creds.json will be created by useSingleFileAuthState).
//
// If creds.json already exists locally, the fetch is skipped so an
// already-linked session is never overwritten.

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const config = () => require('../settings/config');

const SESSION_PREFIX = 'DANGER-BOY-MD~';

async function restoreSessionFromEnv() {
    const raw = process.env.SESSION_ID;

    if (!raw || !raw.trim()) {
        console.log(chalk.bold.red('\n❌ No SESSION_ID found in .env\n'));
        console.log(chalk.yellow('   Generate one from the DANGER-BOY-MD session generator web app,'));
        console.log(chalk.yellow('   then add it to your .env file as:\n'));
        console.log(chalk.cyanBright('   SESSION_ID=DANGER-BOY-MD~xxxxxxxxxx\n'));
        console.log(chalk.yellow('   SESSION_SERVER_URL must also be set to your generator\'s address.\n'));
        process.exit(1);
    }

    if (!raw.startsWith(SESSION_PREFIX)) {
        console.log(chalk.bold.red('\n❌ SESSION_ID is set but doesn\'t look valid.\n'));
        console.log(chalk.yellow(`   It should start with "${SESSION_PREFIX}" — check for extra spaces`));
        console.log(chalk.yellow('   or a copy-paste mistake, and regenerate if unsure.\n'));
        process.exit(1);
    }

    const sessionFile = path.join(__dirname, '..', config().session, 'creds.json');

    if (fs.existsSync(sessionFile)) {
        console.log(chalk.cyan('[session] creds.json already exists locally, skipping fetch.'));
        return;
    }

    const shortId = raw.replace(SESSION_PREFIX, '').trim();
    const serverUrl = (process.env.SESSION_SERVER_URL || '').replace(/\/$/, '');

    if (!serverUrl) {
        console.log(chalk.bold.red('\n❌ SESSION_SERVER_URL is not set in .env — cannot fetch session.\n'));
        process.exit(1);
    }

    try {
        const res = await fetch(`${serverUrl}/session/${shortId}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.session) {
            console.log(chalk.bold.red('\n❌ Could not fetch session from the generator server.\n'));
            if (res.status === 404) {
                console.log(chalk.yellow('   This session ID was not found — check for a copy-paste'));
                console.log(chalk.yellow('   mistake, or it may belong to a different bot/generator.'));
                console.log(chalk.yellow('   Please generate a new one if unsure.\n'));
            } else {
                console.log(chalk.yellow(`   Server said: ${data.error || res.statusText}\n`));
            }
            process.exit(1);
        }

        const dir = path.dirname(sessionFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const jsonText = Buffer.from(data.session, 'base64').toString('utf-8');

        // Sanity check: make sure this actually looks like a valid creds.json
        // before writing it, so an unrelated/corrupted string never gets
        // written and silently breaks the bot on next boot.
        try {
            const parsed = JSON.parse(jsonText);
            if (!parsed.creds) throw new Error('missing "creds" key');
        } catch (parseErr) {
            console.log(chalk.bold.red('\n❌ Fetched session data is not a valid DANGER-BOY-MD session.\n'));
            console.log(chalk.yellow('   Make sure the SESSION_ID came from the DANGER-BOY-MD generator'));
            console.log(chalk.yellow('   and not a different bot — sessions are not interchangeable.\n'));
            process.exit(1);
        }

        fs.writeFileSync(sessionFile, jsonText);
        console.log(chalk.green('[session] Restored creds.json from SESSION_ID'));
    } catch (e) {
        console.log(chalk.bold.red('\n❌ Error restoring session:'), e.message, '\n');
        process.exit(1);
    }
}

module.exports = { restoreSessionFromEnv };
