
const config = require('./settings/config');
const fs = require('fs');
const crypto = require("crypto");
const path = require("path");
const os = require('os');
const chalk = require("chalk");
const axios = require('axios');
const { exec } = require('child_process');
const { dechtml, fetchWithTimeout } = require('./library/function');       
const { tempfiles } = require("./library/uploader");
const { fquoted } = require('./library/quoted');     
const Api = require('./library/Api');
const { toPTT } = require('./library/converter');
const { brandedQuoted } = require('./library/brandedQuote');
const { t: translate } = require('./library/lang');

// Ensure tmp dir exists for audio conversion
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });


// Load local fallback image lazily so missing file doesn't crash on startup
let _localImage = null;
function getLocalImage() {
    if (_localImage) return _localImage;
    try { _localImage = fs.readFileSync('./thumbnail/image.jpg'); } catch {}
    return _localImage;
}

let jidNormalizedUser, getContentType, isPnUser;

const loadBaileysUtils = async () => {
    const baileys = await import('@whiskeysockets/baileys');
    jidNormalizedUser = baileys.jidNormalizedUser;
    getContentType = baileys.getContentType;
    isPnUser = baileys.isPnUser;
};

// Plugin Loader System with Menu Categorization
class PluginLoader {
    constructor() {
        this.plugins = new Map();
        this.categories = new Map();
        this.pluginsDir = path.join(__dirname, 'plugins');
        this.defaultCategories = {
            'ai':         'ᴀɪ',
            'downloader': 'ᴅᴏᴡɴʟᴏᴀᴅ',
            'system':     'sʏsᴛᴇᴍ',
            'settings':   'sᴇᴛᴛɪɴɢs',
            'general':    'ɢᴇɴᴇʀᴀʟ',
            'group':      'ɢʀᴏᴜᴘ',
            'owner':      'ᴏᴡɴᴇʀ',
            'other':      'ᴏᴛʜᴇʀ',
            'tools':      'ᴛᴏᴏʟs',
            'video':      'ᴠɪᴅᴇᴏ'
        };
        this.loadPlugins();
    }

    loadPlugins() {
        try {
            if (!fs.existsSync(this.pluginsDir)) {
                fs.mkdirSync(this.pluginsDir, { recursive: true });
                console.log(chalk.cyan('📁 Created plugins directory'));
                return;
            }

            const pluginFiles = fs.readdirSync(this.pluginsDir).filter(file => 
                file.endsWith('.js') && !file.startsWith('_')
            );

            this.plugins.clear();
            this.categories.clear();

            Object.keys(this.defaultCategories).forEach(cat => {
                this.categories.set(cat, []);
            });

            for (const file of pluginFiles) {
                try {
                    const pluginPath = path.join(this.pluginsDir, file);
                    const exported = require(pluginPath);

                    // Support both single object and array of plugins
                    const pluginList = Array.isArray(exported) ? exported : [exported];

                    for (const plugin of pluginList) {
                        if (!plugin.command || typeof plugin.execute !== 'function') {
                            console.log(chalk.yellow(`⚠️  Invalid plugin in ${file}: missing command or execute`));
                            continue;
                        }

                        if (!plugin.category) plugin.category = 'general';

                        if (!this.categories.has(plugin.category)) {
                            this.categories.set(plugin.category, []);
                        }

                        if (this.plugins.has(plugin.command)) {
                            console.log(chalk.yellow(`⚠️  Skipping duplicate: ${plugin.command} in ${file}`));
                            continue;
                        }

                        this.plugins.set(plugin.command, plugin);
                        this.categories.get(plugin.category).push(plugin.command);
                        console.log(chalk.green(`✅ Loaded: ${plugin.command} (${plugin.category})`));
                    }
                } catch (error) {
                    console.log(chalk.red(`❌ Failed to load ${file}:`, error.message));
                }
            }

            console.log(chalk.cyan(`⚡ DANGER-BOY-MD | ${this.plugins.size} plugins loaded`));
        } catch (error) {
            console.log(chalk.red('❌ Error loading plugins:', error.message));
        }
    }

    async executePlugin(command, sock, m, args, text, q, quoted, mime, qmsg, isMedia, groupMetadata, groupName, participants, groupOwner, groupAdmins, isBotAdmins, isAdmins, isGroupOwner, isCreator, prefix, reply, sender, tc) {
        const plugin = this.plugins.get(command);
        if (!plugin) return false;

        try {
            // Owner only
            if (plugin.owner && !isCreator) {
                await reply(tc('this command is for the bot owner only'));
                return true;
            }

            // Group only — send message and stop
            if (plugin.group && !m.isGroup) {
                await reply(tc('this command can only be used in groups'));
                return true;
            }

            // Admin only — let plugin handle its own isBotAdmins check
            // Only block the sender from running it, not the bot's own check
            if (plugin.admin && !isAdmins && !isCreator) {
                await reply(tc('this command is for group admins only'));
                return true;
            }

            await plugin.execute(sock, m, {
                args, text, q, quoted, mime, qmsg, isMedia,
                groupMetadata, groupName, participants, groupOwner,
                groupAdmins, isBotAdmins, isAdmins, isGroupOwner,
                isCreator, prefix, reply, config, sender, tc
            });
            return true;
        } catch (error) {
            console.log(chalk.red(`❌ Error in ${command}:`, error));
            return true;
        }
    }

    getPluginCommands() {
        return Array.from(this.plugins.keys());
    }

    getMenuSections(tc) {
        const sections = [];

        // Fixed display order
        const order = ['owner','settings','general','downloader','group','ai','tools','system','video','other'];

        const sortedCategories = order
            .filter(key => this.categories.has(key) && this.categories.get(key).length > 0)
            .map(key => [key, this.categories.get(key)]);

        // Append any unknown categories not in the order list
        for (const [key, cmds] of this.categories.entries()) {
            if (!order.includes(key) && cmds.length > 0) sortedCategories.push([key, cmds]);
        }

        for (const [category, commands] of sortedCategories) {
            const label = (this.defaultCategories[category] || category).toUpperCase();
            const sortedCmds = [...commands].sort();

            let block = `\u250c\u2500\u2500\u2500\u2500 \u300c *${label}* \u300d\n`;
            for (const cmd of sortedCmds) {
                block += `\u2502 \u27a4 ${tc ? tc(cmd) : cmd}\n`;
            }
            block += `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`;

            sections.push(block);
        }

        return sections.join('\n\n');
    }

    // Plain, boxless, emoji-free list — used by the .list command.
    // Numbered per category; each command's description sits on its own
    // indented line below it. Fully bilingual (EN/ES) via tc().
    getPlainListWithDescriptions(tc) {
        const sections = [];
        const order = ['owner','settings','general','downloader','group','ai','tools','system','video','other'];

        const sortedCategories = order
            .filter(key => this.categories.has(key) && this.categories.get(key).length > 0)
            .map(key => [key, this.categories.get(key)]);

        for (const [key, cmds] of this.categories.entries()) {
            if (!order.includes(key) && cmds.length > 0) sortedCategories.push([key, cmds]);
        }

        for (const [category, commands] of sortedCategories) {
            const label = tc ? tc(category) : (this.defaultCategories[category] || category).toUpperCase();
            const sortedCmds = [...commands].sort();

            let block = `${label}\n`;
            sortedCmds.forEach((cmd, i) => {
                const plugin = this.plugins.get(cmd);
                const desc = plugin?.description ? (tc ? tc(plugin.description) : plugin.description) : '';
                block += `${i + 1}. ${tc ? tc(cmd) : cmd}\n`;
                if (desc) block += `   (${desc})\n`;
            });
            sections.push(block.trim());
        }

        return sections.join('\n\n');
    }

    getPluginCount() {
        let count = 0;
        for (const commands of this.categories.values()) {
            count += commands.length;
        }
        return count;
    }

    reloadPlugins() {
        const pluginFiles = fs.readdirSync(this.pluginsDir).filter(file => 
            file.endsWith('.js') && !file.startsWith('_')
        );

        for (const file of pluginFiles) {
            const pluginPath = path.join(this.pluginsDir, file);
            delete require.cache[require.resolve(pluginPath)];
        }

        this.loadPlugins();
    }
}

// Initialize plugin loader
const pluginLoader = new PluginLoader();

module.exports = sock = async (sock, m, chatUpdate, store) => {
    try {
        // PRIVATE MODE FIX - Bot offline/away mein bhi antilink kaam karay
        if (m.isGroup && !m.key.fromMe) {
            const checkText = m.text || m.body || '';
            if (checkText && (checkText.includes('http') || checkText.includes('www.'))) {
                // Link detected - antilink handler neeche process karay ga
            }
        }

        if (!jidNormalizedUser || !getContentType || !isPnUser) {
            await loadBaileysUtils();
        }

        const body = (
            m.mtype === "conversation" ? m.message.conversation :
            m.mtype === "imageMessage" ? m.message.imageMessage.caption :
            m.mtype === "videoMessage" ? m.message.videoMessage.caption :
            m.mtype === "extendedTextMessage" ? m.message.extendedTextMessage.text :
            m.mtype === "buttonsResponseMessage" ? m.message.buttonsResponseMessage.selectedButtonId :
            m.mtype === "listResponseMessage" ? m.message.listResponseMessage.singleSelectReply.selectedRowId :
            m.mtype === "templateButtonReplyMessage" ? m.message.templateButtonReplyMessage.selectedId :
            m.mtype === "interactiveResponseMessage" ? JSON.parse(m.msg.nativeFlowResponseMessage.paramsJson).id :
            m.mtype === "messageContextInfo" ? m.message.buttonsResponseMessage?.selectedButtonId ||
            m.message.listResponseMessage?.singleSelectReply.selectedRowId || m.text : ""
        ) || ""; // guard: captionless media / unhandled types can yield null, never let body be non-string
        

        const sender = m.key.fromMe ? sock.user.id.split(":")[0] + "@s.whatsapp.net" ||
              sock.user.id : m.key.participant || m.key.remoteJid;
        
        const senderNumber = sender.split('@')[0];
        const budy = (typeof m.text === 'string' ? m.text : '');
        const prefa = ["", "!", ".", ",", "🤖", "🗿"];

        const prefixRegex = /^[°zZ#$@*+,.?=''():√%!¢£¥€π¤ΩΦ_&><`™©®Δ^βα~¦|/\\©^]/;
        const prefix = prefixRegex.test(body) ? body.match(prefixRegex)[0] : '.';
        const from = m.key.remoteJid;
        const isGroup = from.endsWith("@g.us");
        const botNumber = await sock.decodeJid(sock.user.id);
        const isBot = botNumber.includes(senderNumber);
        
        const isCmd = body.startsWith(prefix);
        const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
        const args = isCmd ? body.slice(prefix.length).trim().split(/ +/).slice(1) : [];
        const pushname = m.pushName || "No Name";
        const text = q = args.join(" ");
        const quoted = m.quoted ? m.quoted : m;
        const mime = (quoted.msg || quoted).mimetype || '';
        const qmsg = (quoted.msg || quoted);
        const isMedia = /image|video|sticker|audio/.test(mime);
        const groupMetadata = m?.isGroup ? await sock.groupMetadata(m.chat).catch(() => ({})) : {};
        const groupName = m?.isGroup ? groupMetadata.subject || '' : '';

        const participants = m?.isGroup ? (groupMetadata.participants || []).map(p => {
            let admin = null;
            if (p.admin === 'superadmin') admin = 'superadmin';
            else if (p.admin === 'admin') admin = 'admin';
            return { id: p.id || null, lid: p.lid || null, admin, full: p };
        }) : [];

        const groupOwner = m?.isGroup ? groupMetadata.owner || '' : '';

        // Strip to bare number — handles @s.whatsapp.net, @lid, :device suffixes
        const bareJid = jid => (jid || '').replace(/@.+/, '').replace(/:\d+$/, '');

        const botNum    = bareJid(botNumber);
        const senderNum = bareJid(m.sender || '');

        // Build admin list
        const adminEntries = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
        const groupAdmins  = adminEntries.map(p => p.id).filter(Boolean);
        const adminNums    = adminEntries.flatMap(p => [bareJid(p.id), bareJid(p.lid)]).filter(Boolean);

        // Find bot's own participant entry — match by phone number OR by lid
        const botLidNum = sock.user?.lid ? bareJid(sock.user.lid) : null;
        const botParticipant = participants.find(p =>
            bareJid(p.id) === botNum ||
            (botLidNum && bareJid(p.lid) === botLidNum) ||
            (botLidNum && bareJid(p.id) === botLidNum)
        );
        const isBotAdmins  = m?.isGroup
            ? (botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin')
            : false;

        const isGroupOwner = m?.isGroup ? bareJid(groupOwner) === senderNum : false;

        // Sudo users (added via .setsudo) get the same access as the real
        // owner. Read fresh each message so setsudo/delsudo take effect
        // immediately without a restart.
        let sudoNums = [];
        try {
            const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'library', 'database', 'owner.json'), 'utf8'));
            sudoNums = (Array.isArray(raw) ? raw : []).filter(Boolean);
        } catch {}

        const isCreator    = bareJid(botNumber) === senderNum || sudoNums.includes(senderNum);
        const isAdmins     = m?.isGroup ? (adminNums.includes(senderNum) || isCreator) : false;

        // ── Antivirus check — runs on EVERY group message, even non-text ──
        if (m.isGroup) {
            try {
                const { checkVirus } = require('./library/antilink/antivirus');
                const blocked = await checkVirus(sock, m, { tc: s => s });
                if (blocked) return;
            } catch (e) {
                console.error('antivirus check:', e.message);
            }
        }

        // ── Antilink suite check — HIGH PRIORITY, runs on EVERY group message ──
        // IMPORTANT: This runs FIRST, before commands, to catch violations immediately
        if (m.isGroup) {
            // Check text messages
            if (body && !isCmd) {
                const tinyCapMap = {
                    a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',
                    i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',
                    q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',
                    y:'ʏ',z:'ᴢ',' ':' ','.':'.',':':':','!':'!','-':'-',
                    '0':'0','1':'1','2':'2','3':'3','4':'4',
                    '5':'5','6':'6','7':'7','8':'8','9':'9'
                };
                const tcAntilink = str => str.toLowerCase().split('').map(c => tinyCapMap[c] || c).join('');

                try {
                    const { checkAndAct } = require('./library/antilink/handler');
                    const features = ['antisexlink', 'antilink', 'antigp', 'antiyt', 'antitg', 'antiig', 'antifb', 'antitk'];
                    for (const feature of features) {
                        const acted = await checkAndAct(feature, sock, m, {
                            body, sender: m.sender, isAdmins, isBotAdmins, tc: tcAntilink, groupAdmins
                        });
                        if (acted) return; // stop processing further once one feature handles it
                    }
                } catch (e) {
                    console.error('antilink check:', e.message);
                }
            }

            // ── Antistatus check — runs on EVERY group message (including media) ──
            // IMPORTANT: This also runs FIRST for media messages
            try {
                const { checkAndActStatus } = require('./library/antilink/antistatus');
                const acted = await checkAndActStatus(sock, m, {
                    isAdmins, isBotAdmins, tc: s => s
                });
                if (acted) return; // stop processing if antistatus blocked it
            } catch (e) {
                console.error('antistatus check:', e.message);
            }
        }



        if (isCmd) {
            console.log(chalk.hex("#e84393")("⚡ DANGER-BOY-MD"));
            console.log(`- Date    : ${chalk.white(new Date().toLocaleString())}`);
            console.log(`- Command : ${chalk.white(command)}`);
            console.log(`- From    : ${chalk.white(pushname)}`);
            console.log(`- JID     : ${chalk.white(senderNumber)}`);
            console.log(`ㅤ\n`);
        }
        
        const tinyCapMap = {
            a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',
            i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',
            q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',
            y:'ʏ',z:'ᴢ',' ':' ','.':'.',':':':','!':'!','-':'-',
            '0':'0','1':'1','2':'2','3':'3','4':'4',
            '5':'5','6':'6','7':'7','8':'8','9':'9'
        };
        const tc = str => {
            const translated = translate(str);
            const lower = translated.toLowerCase();
            // Accented Spanish text: tiny-caps unicode has no accented glyphs,
            // so styling it would silently drop the accents. Keep it plain
            // instead of mangling the word.
            if (/[áéíóúñ¿¡]/.test(lower)) return lower;
            return lower.split('').map(c => tinyCapMap[c] || c).join('');
        };

        async function reply(text) {
            sock.sendMessage(m.chat, { text }, { quoted: m });
        }

        // Try plugin first
        const pluginExecuted = await pluginLoader.executePlugin(
            command, sock, m, args, text, q, quoted, mime, qmsg, isMedia, 
            groupMetadata, groupName, participants, groupOwner, groupAdmins, 
            isBotAdmins, isAdmins, isGroupOwner, isCreator, prefix, reply, sender, tc
        );

        if (pluginExecuted) return;

        // Built-in commands
        switch (command) {
            case 'menu': {
                const usedMem = process.memoryUsage().heapUsed / 1024 / 1024;
                const uptimeSec = process.uptime();
                const d = Math.floor(uptimeSec / 86400);
                const h = Math.floor((uptimeSec % 86400) / 3600);
                const min = Math.floor((uptimeSec % 3600) / 60);
                const s = Math.floor(uptimeSec % 60);
                const uptime = (d > 0 ? `${d}ᴅ ` : '') + `${h}ʜ ${min}ᴍ ${s}s`;
                const ping = Date.now() - m.messageTimestamp * 1000;
                const mode = sock.public ? 'public' : 'private';
                const userName = m.pushName || 'user';

                const pluginMenuSections = pluginLoader.getMenuSections(tc);
                const totalCommands = pluginLoader.getPluginCount();

                const menuText =
                    `┌──── 〔 *DANGER-BOY-MD* 〕\n` +
                    `│\n` +
                    `│ ${tc('user')}     :  ${userName}\n` +
                    `│ ${tc('owner')}    :  ${tc('danger boy')}\n` +
                    `│ ${tc('prefix')}   :  ${prefix}\n` +
                    `│ ${tc('mode')}     :  ${tc(mode)}\n` +
                    `│ ${tc('uptime')}   :  ${uptime}\n` +
                    `│ ${tc('ping')}     :  ${ping.toFixed(0)}ms\n` +
                    `│ ${tc('ram')}      :  ${usedMem.toFixed(0)}mb\n` +
                    `│ ${tc('commands')} :  ${totalCommands}\n` +
                    `└─────────────────────\n\n` +
                    pluginMenuSections;

                // Media priority: gif > video > image URL from config > local thumbnail
                const gifUrl   = config.menuGifUrl   && config.menuGifUrl.trim();
                const videoUrl = config.menuVideoUrl  && config.menuVideoUrl.trim();
                const imgUrl   = config.menuImageUrl  && config.menuImageUrl.trim();
                const audioUrl = config.menuAudioUrl  && config.menuAudioUrl.trim();
                const brandedQ = await brandedQuoted();

                try {
                    if (gifUrl) {
                        await sock.sendMessage(m.chat, {
                            video: { url: gifUrl },
                            caption: menuText,
                            gifPlayback: true
                        }, { quoted: brandedQ });
                    } else if (videoUrl) {
                        await sock.sendMessage(m.chat, {
                            video: { url: videoUrl },
                            caption: menuText,
                            mimetype: 'video/mp4'
                        }, { quoted: brandedQ });
                    } else if (imgUrl) {
                        await sock.sendMessage(m.chat, {
                            image: { url: imgUrl },
                            caption: menuText
                        }, { quoted: brandedQ });
                    } else {
                        // fallback: local thumbnail/image.jpg
                        const localImg = getLocalImage();
                        if (localImg) {
                            await sock.sendMessage(m.chat, {
                                image: localImg,
                                caption: menuText
                            }, { quoted: brandedQ });
                        } else {
                            await sock.sendMessage(m.chat, { text: menuText }, { quoted: brandedQ });
                        }
                    }

                    // PTT voice note — download then re-encode to proper opus via ffmpeg
                    if (audioUrl) {
                        try {
                            const res = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 20000 });
                            const rawBuf = Buffer.from(res.data);
                            // Detect ext from Content-Type or URL
                            const ct = res.headers['content-type'] || '';
                            const ext = ct.includes('ogg') ? 'ogg'
                                      : ct.includes('mp4') ? 'mp4'
                                      : ct.includes('mpeg') ? 'mp3'
                                      : ct.includes('m4a') ? 'm4a'
                                      : (audioUrl.split('?')[0].split('.').pop().toLowerCase() || 'mp3');
                            const opusBuf = await toPTT(rawBuf, ext);
                            await sock.sendMessage(m.chat, {
                                audio: opusBuf,
                                mimetype: 'audio/ogg; codecs=opus',
                                ptt: true
                            }, { quoted: brandedQ });
                        } catch (audioErr) {
                            console.error('PTT audio error:', audioErr.message);
                        }
                    }
                } catch (menuErr) {
                    console.error('Menu media error:', menuErr);
                    await sock.sendMessage(m.chat, { text: menuText }, { quoted: brandedQ });
                }
                break;
            }
            
            case 'reload': {
                if (!isCreator) return;
                pluginLoader.reloadPlugins();
                await reply(tc(`plugins reloaded! ${pluginLoader.getPluginCount()} commands loaded.`));
                break;
            }
        }
    } catch (err) {
        console.log(require("util").format(err));
    }
};

let file = require.resolve(__filename);
require('fs').watchFile(file, () => {
    require('fs').unwatchFile(file);
    console.log('\x1b[0;32m' + __filename + ' \x1b[1;32mupdated!\x1b[0m');
    delete require.cache[file];
    require(file);
});

module.exports.pluginLoader = pluginLoader;
