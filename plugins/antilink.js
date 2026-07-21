// ─── DANGER-BOY-MD | Anti-link suite ───────────────────────────
// .antilink   — custom domains only (use block)
// .antigp     — whatsapp group invite links
// .antiyt     — youtube links
// .antitg     — telegram links
// .antiig     — instagram links
// .antifb     — facebook links
// .antisexlink — adult content domains (built-in list)

const { makeAntilinkPlugin } = require('../library/antilink/makePlugin');

// ── ANTIVIRUS — separate command, different shape than link-based features ──
const { getSettings, saveSettings, resetSettings } = require('../library/antilink/core');

const antivirus = {
    command: 'antivirus',
    description: 'Block malicious bug-bot payloads (fake invites, catalog bombs, etc.)',
    category: 'group',
    group: true,
    admin: true,
    execute: async (sock, m, { args, tc }) => {
        const sub = (args[0] || '').toLowerCase();
        const settings = getSettings('antivirus', m.chat);

        if (sub === 'on') {
            settings.enabled = true;
            saveSettings('antivirus', m.chat, settings);
            return sock.sendMessage(m.chat, { text: `✅ antivirus ${tc('enabled')}` }, { quoted: m });
        }
        if (sub === 'off') {
            settings.enabled = false;
            saveSettings('antivirus', m.chat, settings);
            return sock.sendMessage(m.chat, { text: `❌ antivirus ${tc('disabled')}` }, { quoted: m });
        }
        if (sub === 'mode') {
            const mode = (args[1] || '').toLowerCase();
            if (!['delete', 'kick'].includes(mode)) {
                return sock.sendMessage(m.chat, {
                    text: `${tc('usage')}: .antivirus mode delete/kick`
                }, { quoted: m });
            }
            settings.mode = mode;
            saveSettings('antivirus', m.chat, settings);
            return sock.sendMessage(m.chat, {
                text: `✅ antivirus ${tc('mode set to')} ${tc(mode)}`
            }, { quoted: m });
        }
        if (sub === 'reset') {
            resetSettings('antivirus', m.chat);
            return sock.sendMessage(m.chat, {
                text: `♻️ antivirus ${tc('settings reset to default')}`
            }, { quoted: m });
        }
        if (sub === 'get') {
            return sock.sendMessage(m.chat, {
                text:
                    `┌──── 〔 *ANTIVIRUS* 〕\n` +
                    `│\n` +
                    `│ ${tc('status')} :  ${settings.enabled ? tc('on') : tc('off')}\n` +
                    `│ ${tc('mode')}   :  ${tc(settings.mode === 'warn' ? 'delete' : settings.mode)}\n` +
                    `└─────────────────────`
            }, { quoted: m });
        }

        return sock.sendMessage(m.chat, {
            text:
                `${tc('usage')}:\n` +
                `.antivirus on/off\n` +
                `.antivirus mode delete/kick\n` +
                `.antivirus reset\n` +
                `.antivirus get`
        }, { quoted: m });
    }
};

// ── ANTISTATUS — prevent status/story forwarding ──
const antistatus = {
    command: 'antistatus',
    description: 'Prevent users from forwarding status updates to group',
    category: 'group',
    group: true,
    admin: true,
    execute: async (sock, m, { args, tc }) => {
        const sub = (args[0] || '').toLowerCase();
        const settings = getSettings('antistatus', m.chat);

        if (sub === 'on') {
            settings.enabled = true;
            saveSettings('antistatus', m.chat, settings);
            return sock.sendMessage(m.chat, { text: `✅ antistatus ${tc('enabled')}` }, { quoted: m });
        }
        if (sub === 'off') {
            settings.enabled = false;
            saveSettings('antistatus', m.chat, settings);
            return sock.sendMessage(m.chat, { text: `❌ antistatus ${tc('disabled')}` }, { quoted: m });
        }
        if (sub === 'mode') {
            const mode = (args[1] || '').toLowerCase();
            if (!['delete', 'kick', 'warn'].includes(mode)) {
                return sock.sendMessage(m.chat, {
                    text: `${tc('usage')}: .antistatus mode delete/kick/warn`
                }, { quoted: m });
            }
            settings.mode = mode;
            saveSettings('antistatus', m.chat, settings);
            return sock.sendMessage(m.chat, {
                text: `✅ antistatus ${tc('mode set to')} ${tc(mode)}`
            }, { quoted: m });
        }
        if (sub === 'reset') {
            resetSettings('antistatus', m.chat);
            return sock.sendMessage(m.chat, {
                text: `♻️ antistatus ${tc('settings reset to default')}`
            }, { quoted: m });
        }
        if (sub === 'get') {
            return sock.sendMessage(m.chat, {
                text:
                    `┌──── 〔 *ANTISTATUS* 〕\n` +
                    `│\n` +
                    `│ ${tc('status')} :  ${settings.enabled ? tc('on') : tc('off')}\n` +
                    `│ ${tc('mode')}   :  ${tc(settings.mode === 'warn' ? 'warn' : settings.mode)}\n` +
                    `└─────────────────────`
            }, { quoted: m });
        }

        return sock.sendMessage(m.chat, {
            text:
                `${tc('usage')}:\n` +
                `.antistatus on/off\n` +
                `.antistatus mode delete/kick/warn\n` +
                `.antistatus reset\n` +
                `.antistatus get`
        }, { quoted: m });
    }
};

module.exports = [
    makeAntilinkPlugin('antilink',     'antilink',     true),
    makeAntilinkPlugin('antigp',       'antigp',       false),
    makeAntilinkPlugin('antiyt',       'antiyt',       false),
    makeAntilinkPlugin('antitg',       'antitg',       false),
    makeAntilinkPlugin('antiig',       'antiig',       false),
    makeAntilinkPlugin('antifb',       'antifb',       false),
    makeAntilinkPlugin('antitk',       'antitk',       false),
    makeAntilinkPlugin('antisexlink',  'antisexlink',  false),
    antivirus,
    antistatus,
]; 
