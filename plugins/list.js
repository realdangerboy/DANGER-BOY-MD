const fs = require('fs');
const axios = require('axios');
const config = require('../settings/config');
const { brandedQuoted } = require('../library/brandedQuote');
const { toPTT } = require('../library/converter');

function getPluginLoader() {
    return require('../message').pluginLoader;
}

let _localImage = null;
function getLocalImage() {
    if (_localImage) return _localImage;
    try { _localImage = fs.readFileSync('./thumbnail/image.jpg'); } catch {}
    return _localImage;
}

const list = {
    command: 'list',
    description: 'Show all commands as a plain list, with descriptions',
    category: 'general',
    execute: async (sock, m, { tc }) => {
        const brandedQ = await brandedQuoted();
        const pluginLoader = getPluginLoader();

        const body = pluginLoader.getPlainListWithDescriptions(tc);
        const listText = `DANGER-BOY-MD — ${tc('commands')}\n\n${body}`;

        const imgUrl = config.listImageUrl && config.listImageUrl.trim();
        const audioUrl = config.listAudioUrl && config.listAudioUrl.trim();

        // ── Image (with the list as caption) ──
        try {
            if (imgUrl) {
                await sock.sendMessage(m.chat, {
                    image: { url: imgUrl }, caption: listText
                }, { quoted: brandedQ });
            } else {
                const localImg = getLocalImage();
                if (localImg) {
                    await sock.sendMessage(m.chat, {
                        image: localImg, caption: listText
                    }, { quoted: brandedQ });
                } else {
                    await sock.sendMessage(m.chat, { text: listText }, { quoted: brandedQ });
                }
            }
        } catch (e) {
            console.error('list image error:', e.message);
            await sock.sendMessage(m.chat, { text: listText }, { quoted: brandedQ });
        }

        // ── Voice note ──
        if (audioUrl) {
            try {
                const res = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 20000 });
                const ct = res.headers['content-type'] || '';
                
                // Prevent downloading HTML pages (e.g., from Mega or Google Drive links)
                if (ct.includes('text/html')) {
                    console.error('List audio error: URL returned a webpage instead of an audio file. Check your config.listAudioUrl.');
                    return;
                }

                const rawBuf = Buffer.from(res.data);
                if (!rawBuf || rawBuf.length === 0) {
                    console.error('List audio error: Downloaded file is empty.');
                    return;
                }

                const ext = ct.includes('ogg') ? 'ogg'
                          : ct.includes('mp4') ? 'mp4'
                          : ct.includes('mpeg') ? 'mp3'
                          : ct.includes('m4a') ? 'm4a'
                          : (audioUrl.split('?')[0].split('.').pop().toLowerCase() || 'mp3');
                
                const opusBuf = await toPTT(rawBuf, ext);
                
                if (!opusBuf) {
                    console.error('List audio error: toPTT conversion returned empty.');
                    return;
                }

                // Safely handle both Buffer outputs and File Path strings from your converter
                const audioPayload = Buffer.isBuffer(opusBuf) ? opusBuf : { url: opusBuf };

                await sock.sendMessage(m.chat, {
                    audio: audioPayload,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true
                }, { quoted: brandedQ });
                
            } catch (e) {
                console.error('list audio error:', e.message);
            }
        }
    }
};

module.exports = [list];
