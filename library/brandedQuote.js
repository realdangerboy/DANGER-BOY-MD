// © DANGER BOY. All Rights Reserved.
// Generic branded "status quote" helper — makes every command reply
// look like it's replying to a fake status update carrying the bot name.
// NEVER put URLs/links inside the caption here — bot name only.

const axios = require('axios');
const config = require('../settings/config');

const BOT_NAME = '⊱ 𝔇𝔞𝔫𝔤𝔢𝔯-𝔅𝔬𝔶-𝔐𝔇 ⊰';

let cachedThumb = null;
let cachedThumbUrl = null;

async function getThumbBuffer() {
    const url = config.thumbUrl && config.thumbUrl.trim();
    if (!url) return null;
    if (cachedThumb && cachedThumbUrl === url) return cachedThumb;
    try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
        cachedThumb = res.data;
        cachedThumbUrl = url;
        return cachedThumb;
    } catch (e) {
        console.error('brandedQuote thumb fetch failed:', e.message);
        return null;
    }
}

// Builds the fake status@broadcast quoted message.
// caption is ALWAYS the bot name — never pass URLs or dynamic content in here.
async function brandedQuoted() {
    const thumbBuffer = await getThumbBuffer();
    return {
        key: {
            fromMe: false,
            participant: "0@s.whatsapp.net",
            remoteJid: "status@broadcast"
        },
        message: {
            imageMessage: {
                jpegThumbnail: thumbBuffer,
                mimetype: "image/jpeg",
                caption: BOT_NAME
            }
        }
    };
}

module.exports = { brandedQuoted, BOT_NAME }; 