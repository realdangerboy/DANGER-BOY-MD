// ─── DANGER-BOY-MD | Antistatus handler ────────────────────────
// Detects and prevents status/story forwarding in groups

const { getSettings, saveSettings, bumpWarn, resetWarn } = require('./core');
const { sendBrandedAlert } = require('./brandedReply');

const bareNum = j => (j || '').split('@')[0].split(':')[0];

/**
 * Check if message is a status forward
 * Status forwards are detected by:
 * 1. Message with forward count > 0
 * 2. Quoted message from status contact (status@broadcast)
 * 3. Message containing status metadata
 */
function isStatusForward(m) {
    try {
        // Check if message is quoted from a status
        if (m.quoted) {
            const quotedSender = m.quoted.key?.remoteJid;
            // Status broadcasts come from special contact
            if (quotedSender === 'status@broadcast') {
                return true;
            }
        }

        // Check for forward count (forwarded messages have forward count)
        if (m.message?.extendedTextMessage?.contextInfo?.forwardingScore > 0) {
            // Check if it's a status by looking at quoted message
            const quotedFrom = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.senderJid;
            if (quotedFrom === 'status@broadcast') {
                return true;
            }
        }

        // Check media forwarding with status origin
        const mediaKeys = ['imageMessage', 'videoMessage', 'audioMessage'];
        for (const key of mediaKeys) {
            if (m.message?.[key]) {
                const contextInfo = m.message[key]?.contextInfo;
                if (contextInfo?.forwardingScore > 0) {
                    const quotedFrom = contextInfo?.quotedMessage?.senderJid;
                    if (quotedFrom === 'status@broadcast') {
                        return true;
                    }
                }
            }
        }

        // Check if message contains status indicator
        if (m.message?.ephemeralMessage) {
            return true; // Ephemeral messages (disappearing media) often indicate status
        }

        return false;
    } catch (e) {
        console.error('Error checking status:', e.message);
        return false;
    }
}

/**
 * Handle antistatus violation
 */
async function checkAndActStatus(sock, m, { isAdmins, isBotAdmins, tc }) {
    if (!m.isGroup) return false;
    if (isAdmins) return false; // Never act on admins

    const settings = getSettings('antistatus', m.chat);
    if (!settings.enabled) return false;
    if (!isStatusForward(m)) return false;
    if (!isBotAdmins) return false; // Can't act without being admin

    const { sender } = m;

    try {
        switch (settings.mode) {
            case 'delete': {
                await sock.sendMessage(m.chat, { delete: m.key });
                await sendBrandedAlert(sock, m.chat, sender,
                    `@${bareNum(sender)}\n📛 Status forwarding not allowed in this group`,
                    'ANTISTATUS', 'antistatus', m
                );
                break;
            }
            case 'kick': {
                await sock.sendMessage(m.chat, { delete: m.key });
                await sock.groupParticipantsUpdate(m.chat, [sender], 'remove');
                await sendBrandedAlert(sock, m.chat, sender,
                    `@${bareNum(sender)}\n📛 Removed for forwarding status`,
                    'ANTISTATUS', 'antistatus', m
                );
                break;
            }
            case 'warn': {
                await sock.sendMessage(m.chat, { delete: m.key });
                const count = bumpWarn(settings, sender);
                saveSettings('antistatus', m.chat, settings);

                if (count >= settings.warnLimit) {
                    await sock.groupParticipantsUpdate(m.chat, [sender], 'remove');
                    resetWarn(settings, sender);
                    saveSettings('antistatus', m.chat, settings);
                    await sendBrandedAlert(sock, m.chat, sender,
                        `@${bareNum(sender)}\n📛 Reached warning limit and was removed`,
                        'ANTISTATUS', 'antistatus', m
                    );
                } else {
                    await sendBrandedAlert(sock, m.chat, sender,
                        `@${bareNum(sender)}\n⚠️ Warning ${count}/${settings.warnLimit} — Status forwarding not allowed`,
                        'ANTISTATUS', 'antistatus', m
                    );
                }
                break;
            }
        }
    } catch (e) {
        console.error('antistatus handler:', e.message);
    }

    return true;
}

module.exports = { isStatusForward, checkAndActStatus };
