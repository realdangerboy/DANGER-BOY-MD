// ─── DANGER-BOY-MD | Antistatus handler ────────────────────────
// Detects and prevents status/story forwarding in groups

const { getSettings, saveSettings, bumpWarn, resetWarn } = require('./core');
const { sendBrandedAlert } = require('./brandedReply');

const bareNum = j => (j || '').split('@')[0].split(':')[0];

/**
 * Check if message is a status forward or mention
 * Detects:
 * 1. Direct status forwards (quoted from status@broadcast)
 * 2. Status mentions (group mentioned in someone's status)
 * 3. Forwarded media from status
 * 4. Status reply messages
 * 5. Ephemeral/disappearing media from status
 */
function isStatusForward(m) {
    try {
        // ── METHOD 1: Quoted from status broadcast ──
        if (m.quoted) {
            const quotedSender = m.quoted.key?.remoteJid;
            if (quotedSender === 'status@broadcast') {
                return true;
            }
        }

        // ── METHOD 2: Check original message key ──
        if (m.message?.key?.remoteJid === 'status@broadcast') {
            return true;
        }

        // ── METHOD 3: Forward count check ──
        const contextInfo = m.message?.extendedTextMessage?.contextInfo || 
                           m.message?.imageMessage?.contextInfo ||
                           m.message?.videoMessage?.contextInfo ||
                           m.message?.audioMessage?.contextInfo;

        if (contextInfo?.forwardingScore && contextInfo.forwardingScore > 0) {
            const quotedFrom = contextInfo?.quotedMessage?.senderJid;
            if (quotedFrom === 'status@broadcast') {
                return true;
            }
        }

        // ── METHOD 4: Check all media types for status origin ──
        const mediaKeys = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
        for (const key of mediaKeys) {
            if (m.message?.[key]) {
                const mediaContext = m.message[key]?.contextInfo;
                
                // Check if forwarded from status
                if (mediaContext?.forwardingScore > 0) {
                    const quotedFrom = mediaContext?.quotedMessage?.senderJid;
                    if (quotedFrom === 'status@broadcast') {
                        return true;
                    }
                }

                // Check if quoted from status
                if (mediaContext?.quotedMessage?.senderJid === 'status@broadcast') {
                    return true;
                }
            }
        }

        // ── METHOD 5: Ephemeral/Disappearing media ──
        if (m.message?.ephemeralMessage) {
            // Check the wrapped message
            const wrappedMsg = m.message.ephemeralMessage.message;
            if (wrappedMsg) {
                for (const key of mediaKeys) {
                    if (wrappedMsg?.[key]) {
                        const ephemeralContext = wrappedMsg[key]?.contextInfo;
                        if (ephemeralContext?.quotedMessage?.senderJid === 'status@broadcast') {
                            return true;
                        }
                        if (ephemeralContext?.forwardingScore > 0) {
                            return true;
                        }
                    }
                }
            }
        }

        // ── METHOD 6: Status mention/reply detection ──
        // When someone mentions group in status, it comes as a special notification
        if (m.type === 'statusReply' || m.type === 'statusMention') {
            return true;
        }

        // Check message type field
        if (m.message?.statusReplyMessage || m.message?.statusMentionMessage) {
            return true;
        }

        // ── METHOD 7: Check notification about status mention ──
        if (m.messageStubType === 40) { // Status message type
            return true;
        }

        // ── METHOD 8: Look for status reference in message body ──
        const body = (m.body || '').toLowerCase();
        if (m.quoted && (
            m.quoted.key?.remoteJid === 'status@broadcast' ||
            m.quoted.fromMe === false && m.messageStubType === 40
        )) {
            return true;
        }

        // ── METHOD 9: Check for view once media (status style) ──
        const viewOnceMsg = m.message?.viewOnceMessage;
        if (viewOnceMsg) {
            const msg = viewOnceMsg.message;
            if (msg?.imageMessage || msg?.videoMessage) {
                return true;
            }
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
    
    // Check if it's a status message
    const isStatus = isStatusForward(m);
    
    // Debug logging (set to true to see all status detections)
    if (settings.debug || process.env.ANTISTATUS_DEBUG === 'true') {
        console.log('[ANTISTATUS DEBUG]', {
            detected: isStatus,
            messageType: m.type,
            messageStubType: m.messageStubType,
            sender: m.sender,
            hasQuoted: !!m.quoted,
            quotedFrom: m.quoted?.key?.remoteJid
        });
    }
    
    if (!isStatus) return false;
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
