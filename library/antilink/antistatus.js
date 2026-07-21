// ─── DANGER-BOY-MD | Enhanced Antistatus Handler ────
// Detects: Status forwards, Status mentions, Story replies

const { getSettings, saveSettings, bumpWarn, resetWarn } = require('./core');
const { sendBrandedAlert } = require('./brandedReply');

const bareNum = j => (j || '').split('@')[0].split(':')[0];

/**
 * ENHANCED: Detect status mentions (when user @mentions group in their status)
 * This is what you requested - جب کوئی اپنی status میں group کو mention کرے
 */
function detectStatusMention(m) {
    try {
        // ── Detect Status Mention Notification ──
        // These are special messages that come when someone mentions the group in status
        
        // Type 1: Message stub (notification type)
        if (m.messageStubType === 32 || m.messageStubType === 40 || m.messageStubType === 41) {
            // Status related stub - likely a mention
            return true;
        }
        
        // Type 2: Protocol message notification
        if (m.message?.protocolMessage?.type === 5) {
            // Service notification
            return true;
        }
        
        // Type 3: Group notification about status
        if (m.message?.notification?.protocolMessage) {
            return true;
        }
        
        // Type 4: Check participant action (may indicate status mention)
        if (m.message?.participantsUpdate) {
            return true;
        }
        
        // Type 5: Direct check - if message says someone mentioned group
        const text = (m.message?.extendedTextMessage?.text || m.message?.conversation || '').toLowerCase();
        if (text.includes('status') && text.includes('mention')) {
            return true;
        }
        
        return false;
        
    } catch (e) {
        console.error('Error detecting status mention:', e.message);
        return false;
    }
}

/**
 * ENHANCED: Detect all status-related activities
 */
function isStatusForward(m) {
    try {
        // ── Status Mention ──
        if (detectStatusMention(m)) {
            return true;
        }

        // ── Direct status forwards (quoted from status@broadcast) ──
        if (m.quoted) {
            const quotedSender = m.quoted.key?.remoteJid;
            if (quotedSender === 'status@broadcast') {
                return true;
            }
        }

        // ── Check original message key ──
        if (m.message?.key?.remoteJid === 'status@broadcast') {
            return true;
        }

        // ── Forward count check ──
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

        // ── Check all media types ──
        const mediaKeys = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
        for (const key of mediaKeys) {
            if (m.message?.[key]) {
                const mediaContext = m.message[key]?.contextInfo;
                
                if (mediaContext?.forwardingScore > 0) {
                    const quotedFrom = mediaContext?.quotedMessage?.senderJid;
                    if (quotedFrom === 'status@broadcast') {
                        return true;
                    }
                }

                if (mediaContext?.quotedMessage?.senderJid === 'status@broadcast') {
                    return true;
                }
            }
        }

        // ── Ephemeral messages ──
        if (m.message?.ephemeralMessage) {
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

        // ── View once media (status-style) ──
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
 * Enhanced to handle status mentions specifically
 */
async function checkAndActStatus(sock, m, { isAdmins, isBotAdmins, tc }) {
    if (!m.isGroup) return false;
    if (isAdmins) return false; // Never act on admins

    const settings = getSettings('antistatus', m.chat);
    if (!settings.enabled) return false;
    
    // Check if it's a status message or status mention
    const isStatus = isStatusForward(m);
    
    // Debug logging
    if (settings.debug || process.env.ANTISTATUS_DEBUG === 'true') {
        console.log('[ANTISTATUS DEBUG]', {
            detected: isStatus,
            messageType: m.type,
            messageStubType: m.messageStubType,
            sender: m.sender,
            hasQuoted: !!m.quoted,
            quotedFrom: m.quoted?.key?.remoteJid,
            isStatusMention: detectStatusMention(m)
        });
    }
    
    if (!isStatus) return false;
    if (!isBotAdmins) return false; // Can't act without being admin

    const { sender } = m;

    try {
        switch (settings.mode) {
            case 'delete': {
                try {
                    await sock.sendMessage(m.chat, { delete: m.key });
                } catch (e) {
                    console.log('Could not delete message (may be notification)');
                }
                
                await sendBrandedAlert(sock, m.chat, sender,
                    `@${bareNum(sender)}\n📛 Status sharing/forwarding not allowed in this group`,
                    'ANTISTATUS', 'antistatus', m
                );
                break;
            }
            case 'kick': {
                try {
                    await sock.sendMessage(m.chat, { delete: m.key });
                } catch (e) {
                    console.log('Could not delete message (may be notification)');
                }
                
                await sock.groupParticipantsUpdate(m.chat, [sender], 'remove');
                await sendBrandedAlert(sock, m.chat, sender,
                    `@${bareNum(sender)}\n📛 Removed for status sharing`,
                    'ANTISTATUS', 'antistatus', m
                );
                break;
            }
            case 'warn': {
                try {
                    await sock.sendMessage(m.chat, { delete: m.key });
                } catch (e) {
                    console.log('Could not delete message (may be notification)');
                }
                
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
                        `@${bareNum(sender)}\n⚠️ Warning ${count}/${settings.warnLimit} — Status sharing not allowed`,
                        'ANTISTATUS', 'antistatus', m
                    );
                }
                break;
            }
        }
        
        console.log(`[ANTISTATUS] Action taken: ${settings.mode} for ${sender}`);
        
    } catch (e) {
        console.error('antistatus handler:', e.message);
    }

    return true;
}

module.exports = { 
    isStatusForward, 
    checkAndActStatus,
    detectStatusMention  // Export for use in other places
};
