# Discord Music Bot

A simple Discord music bot built with **discord.js v14** and **@discordjs/voice**.  
It plays **YouTube audio** in a voice channel using **yt-dlp** and **ffmpeg**, and supports a basic in-memory queue with slash commands.

## Features

- Slash-command based bot
- Play a single YouTube video
- Play a YouTube playlist
- Queue management
- Pause / unpause playback
- Skip to the next song
- Admin-only priority insert (`/cut`)
- Admin-only skip (`/next`)
- Lightweight setup with dynamic command and event loading

## Commands

| Command                        | Description                                            |
| ------------------------------ | ------------------------------------------------------ |
| `/play url:<youtube-url>`      | Play a YouTube video or add it to the queue            |
| `/playlist url:<playlist-url>` | Add a YouTube playlist to the queue and start playback |
| `/add url:<youtube-url>`       | Add a song to the back of the queue                    |
| `/cut url:<youtube-url>`       | Add a song to the front of the queue (**Admin only**)  |
| `/next`                        | Skip to the next song (**Admin only**)                 |
| `/pause`                       | Pause or unpause the current song                      |
| `/clear`                       | Disconnect the bot and clear playback                  |

## Tech Stack

- [discord.js](https://discord.js.org/)
- [@discordjs/voice](https://www.npmjs.com/package/@discordjs/voice)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg](https://ffmpeg.org/)
- dotenv

## Project Structure

```bash
.
├── commands/
│   └── voice/
│       ├── add.js
│       ├── clear.js
│       ├── cut.js
│       ├── nextSong.js
│       ├── playlist.js
│       ├── trackPause.js
│       └── url.js
├── events/
│   ├── interactionCreate.js
│   └── ready.js
├── deploy-commands.js
├── globalData.js
├── index.js
└── package.json
```
