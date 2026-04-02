const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    joinVoiceChannel,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType,
} = require('@discordjs/voice');
const { spawn } = require('node:child_process');

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

const globalData = require('../../globalData');

// Conservative defaults to reduce request bursts
const MAX_PLAYLIST_ITEMS = Number.parseInt(process.env.MAX_PLAYLIST_ITEMS || '25', 10);
const SLEEP_REQUESTS = process.env.YTDLP_SLEEP_REQUESTS || '0.75';
const SLEEP_INTERVAL = process.env.YTDLP_SLEEP_INTERVAL || '1';
const MAX_SLEEP_INTERVAL = process.env.YTDLP_MAX_SLEEP_INTERVAL || '2';

let connection = null;
let subscription = null;
let player = null;
let channel = null;
let listenerAdded = false;
let musicMessage = null;

let currentYtDlp = null;
let currentFfmpeg = null;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Play a YouTube video or playlist')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL of the YouTube video or playlist')
                .setRequired(true)
        ),

    async execute(interaction) {
        const url = interaction.options.getString('url')?.trim();
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            await interaction.reply({
                content: 'Join a voice channel first.',
                ephemeral: true,
            });
            return;
        }

        if (!isPlaylistUrl(url)) {
            await interaction.reply({
                content: 'Invalid YouTube List URL.',
                ephemeral: true,
            });
            return;
        }

        channel = interaction.channel;
        await interaction.deferReply({ ephemeral: true });

        try {
            ensureConnection(interaction, voiceChannel);
            ensurePlayer();

            let addedCount = 0;

            if (isPlaylistUrl(url)) {
                const playlist = await getPlaylistEntries(url);

                if (!playlist.entries.length) {
                    await interaction.editReply({
                        content: 'No playable videos were found in that playlist.',
                    });
                    return;
                }

                globalData.queue.push(...playlist.entries);
                addedCount = playlist.entries.length;

                await interaction.editReply({
                    content: `Added **${addedCount}** track(s) from playlist **${playlist.title}**.`,
                });
            } else {
                // For single videos, do one metadata lookup so your embed stays nice
                const track = await getTrackInfo(url);
                globalData.queue.push(track);
                addedCount = 1;

                await interaction.editReply({
                    content: `Added **${track.title}** to queue.`,
                });
            }

            if (player.state.status === AudioPlayerStatus.Idle) {
                await playNext();
            }
        } catch (error) {
            console.error(error);

            const content =
                'An error occurred while trying to play this URL. Make sure yt-dlp and ffmpeg are installed and available in PATH.';

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content });
            } else {
                await interaction.reply({ content, ephemeral: true });
            }
        }
    },
};

function ensureConnection(interaction, voiceChannel) {
    if (connection) return;

    connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
    });

    connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('Connection is ready!');
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
        console.log('Connection disconnected!');
        cleanupCurrentProcesses();
        globalData.queue = [];
        subscription = null;
        connection = null;

        if (player) {
            player.stop(true);
        }
    });
}

function ensurePlayer() {
    if (!player) {
        player = createAudioPlayer();
    }

    if (!subscription && connection) {
        subscription = connection.subscribe(player);
    }

    if (!listenerAdded) {
        player.on(AudioPlayerStatus.Idle, () => {
            cleanupCurrentProcesses();
            globalData.queue.shift();

            // Tiny cooldown between songs to avoid back-to-back bursts
            setTimeout(() => {
                playNext().catch(console.error);
            }, 1200);
        });

        player.on('error', (error) => {
            console.error('Audio player error:', error);
            cleanupCurrentProcesses();
            globalData.queue.shift();

            setTimeout(() => {
                playNext().catch(console.error);
            }, 1500);
        });

        listenerAdded = true;
    }
}

function isValidYouTubeUrl(url) {
    const regex = /^(https?:\/\/)?(www\.youtube\.com|music\.youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}

function isPlaylistUrl(url) {
    try {
        const u = new URL(url);
        return (
            u.searchParams.has('list') ||
            u.pathname.includes('/playlist')
        );
    } catch {
        return /[?&]list=/.test(url) || /\/playlist/.test(url);
    }
}

async function playNext() {
    if (globalData.queue.length === 0) {
        console.log('Queue is empty.');
        return;
    }

    let track = globalData.queue[0];

    // For playlist items loaded flat, only resolve more metadata when needed
    if (!track.resolved) {
        try {
            track = await getTrackInfo(track.url, {
                fallbackTitle: track.title,
                fallbackThumbnail: track.thumbnail,
            });
            globalData.queue[0] = track;
        } catch (err) {
            console.error('Failed to resolve queued track metadata:', err);
            // Keep going with the flat metadata if lookup fails
            track = {
                ...track,
                webpageUrl: track.webpageUrl || track.url,
                resolved: true,
            };
            globalData.queue[0] = track;
        }
    }

    cleanupCurrentProcesses();

    currentYtDlp = spawn(
        YTDLP_BIN,
        [
            '--ignore-config',
            '--quiet',
            '--no-warnings',
            '--no-playlist',
            '--sleep-requests', SLEEP_REQUESTS,
            '--sleep-interval', SLEEP_INTERVAL,
            '--max-sleep-interval', MAX_SLEEP_INTERVAL,
            '-f', 'bestaudio/best',
            '-o', '-',
            track.url,
        ],
        {
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );

    currentFfmpeg = spawn(
        FFMPEG_BIN,
        [
            '-hide_banner',
            '-loglevel', 'error',
            '-i', 'pipe:0',
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1',
        ],
        {
            stdio: ['pipe', 'pipe', 'pipe'],
        }
    );

    currentYtDlp.stdout.pipe(currentFfmpeg.stdin);

    currentYtDlp.stderr.on('data', (data) => {
        console.error('[yt-dlp]', data.toString());
    });

    currentFfmpeg.stderr.on('data', (data) => {
        console.error('[ffmpeg]', data.toString());
    });

    currentYtDlp.on('error', (err) => {
        console.error('yt-dlp process failed:', err);
    });

    currentFfmpeg.on('error', (err) => {
        console.error('ffmpeg process failed:', err);
    });

    currentYtDlp.on('close', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`yt-dlp exited with code ${code}`);
        }
    });

    currentFfmpeg.on('close', (code) => {
        if (code !== 0 && code !== null) {
            console.error(`ffmpeg exited with code ${code}`);
        }
    });

    const resource = createAudioResource(currentFfmpeg.stdout, {
        inputType: StreamType.Raw,
    });

    const embed = new EmbedBuilder()
        .setColor(0xe9b1cd)
        .setTitle('Music Bot')
        .addFields({ name: 'Now playing:', value: track.title || track.url, inline: true })
        .setURL(track.webpageUrl || track.url);

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    if (musicMessage) {
        try {
            await musicMessage.edit({ embeds: [embed] });
        } catch {
            musicMessage = await channel.send({ embeds: [embed] });
        }
    } else {
        musicMessage = await channel.send({ embeds: [embed] });
    }

    player.play(resource);
}

function cleanupCurrentProcesses() {
    if (currentYtDlp) {
        try {
            currentYtDlp.kill();
        } catch {}
        currentYtDlp = null;
    }

    if (currentFfmpeg) {
        try {
            currentFfmpeg.kill();
        } catch {}
        currentFfmpeg = null;
    }
}

function getTrackInfo(url, fallback = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(
            YTDLP_BIN,
            [
                '--ignore-config',
                '--dump-single-json',
                '--skip-download',
                '--no-playlist',
                '--quiet',
                '--no-warnings',
                '--sleep-requests', SLEEP_REQUESTS,
                url,
            ],
            {
                stdio: ['ignore', 'pipe', 'pipe'],
            }
        );

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('error', reject);

        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr || `yt-dlp metadata lookup failed with code ${code}`));
                return;
            }

            try {
                const info = JSON.parse(stdout);
                resolve({
                    url,
                    title: info.title || fallback.fallbackTitle || url,
                    webpageUrl: info.webpage_url || url,
                    thumbnail:
                        info.thumbnail ||
                        info.thumbnails?.[info.thumbnails.length - 1]?.url ||
                        fallback.fallbackThumbnail ||
                        null,
                    resolved: true,
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}

function getPlaylistEntries(url) {
    return new Promise((resolve, reject) => {
        const proc = spawn(
            YTDLP_BIN,
            [
                '--ignore-config',
                '--dump-single-json',
                '--skip-download',
                '--flat-playlist',
                '--playlist-items', `1:${MAX_PLAYLIST_ITEMS}`,
                '--quiet',
                '--no-warnings',
                '--sleep-requests', SLEEP_REQUESTS,
                url,
            ],
            {
                stdio: ['ignore', 'pipe', 'pipe'],
            }
        );

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('error', reject);

        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr || `yt-dlp playlist lookup failed with code ${code}`));
                return;
            }

            try {
                const info = JSON.parse(stdout);
                const entries = (info.entries || [])
                    .map(normalizePlaylistEntry)
                    .filter(Boolean);

                resolve({
                    title: info.title || 'Playlist',
                    entries,
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}

function normalizePlaylistEntry(entry) {
    if (!entry) return null;

    const url = buildVideoUrl(entry);
    if (!url) return null;

    return {
        url,
        title: entry.title || entry.id || url,
        webpageUrl: entry.webpage_url || url,
        thumbnail:
            entry.thumbnail ||
            entry.thumbnails?.[entry.thumbnails.length - 1]?.url ||
            null,
        resolved: false,
    };
}

function buildVideoUrl(entry) {
    if (entry.webpage_url) return entry.webpage_url;
    if (typeof entry.url === 'string' && /^https?:\/\//.test(entry.url)) return entry.url;
    if (entry.id) return `https://www.youtube.com/watch?v=${entry.id}`;
    if (typeof entry.url === 'string') return `https://www.youtube.com/watch?v=${entry.url}`;
    return null;
}