// © 2025 DANGER BOY. All Rights Reserved.

const fs = require('fs')

const config = {
    owner: "-",
    botNumber: "",
    setPair: "DANGERBOY",
    thumbUrl: "https://i.ibb.co/CK9vMHDw/file-00000000882071fdacabf123e6ae592e.png",
    session: "sessions",
    status: {
        public: true,
        terminal: true,
        reactsw: false
    },
    message: {
        owner: "no, this is for owners only",
        group: "this is for groups only",
        admin: "this command is for admin only",
        private: "this is specifically for private chat"
    },
    mess: {
        owner: 'This command is only for the bot owner!',
        done: 'Mode changed successfully!',
        error: 'Something went wrong!',
        wait: 'Please wait...'
    },
    settings: {
        title: "DANGER-BOY-MD",
        packname: 'DANGER-BOY-MD',
        description: "DANGER-BOY-MD | WhatsApp Bot",
        author: 'https://www.github.com/DANGER-BOY-MD',
        footer: "ᴅᴀɴɢᴇʀ ʙᴏʏ ᴍᴅ"
    },
    newsletter: {
        name: "DANGER-BOY-MD",
        id: "0@newsletter"
    },
    api: {
        baseurl: "https://hector-api.vercel.app/",
        apikey: "hector"
    },
    sticker: {
        packname: "DANGER-BOY-MD",
        author: "DANGER BOY"
    },
    // ── Media URLs ─────────────────────────────────────────────
    // alive: set a video URL to send as a video note (circle) before the alive text
    aliveVideoUrl: "https://files.catbox.moe/vs2qql.mp4",
    // menu: set ONE of these — gif/video takes priority over image
    menuGifUrl:   "",   // .gif or video URL → sent as gif/video with caption
    menuVideoUrl: "",   // mp4 URL → sent as video with caption
    menuImageUrl: "https://i.ibb.co/TBygxmLH/temp.jpg",   // fallback image URL (uses local thumbnail/image.jpg if empty)
    // menu audio: sent as a PTT voice note after the menu
    menuAudioUrl: "https://files.catbox.moe/4jnqa9.mp3",
    // list: separate image/audio for the .list command (independent of menu's)
    listImageUrl: "https://i.ibb.co/TBygxmLH/temp.jpg",   // image URL for .list (uses local thumbnail/image.jpg if empty)
    listAudioUrl: "https://files.catbox.moe/f1jsln.mp3"    // PTT voice note sent after .list (skipped if empty)
}

module.exports = config;

let file = require.resolve(__filename)
require('fs').watchFile(file, () => {
  require('fs').unwatchFile(file)
  console.log('\x1b[0;32m'+__filename+' \x1b[1;32mupdated!\x1b[0m')
  delete require.cache[file]
  require(file)
})
