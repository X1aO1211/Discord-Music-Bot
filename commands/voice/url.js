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
const globalData = require('../../globalData');

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

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
        .setName('play')
        .setDescription('Play a YouTube music')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL of the YouTube video')
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

        if (!isValidYouTubeUrl(url)) {
            await interaction.reply({
                content: 'Invalid YouTube URL',
                ephemeral: true,
            });
            return;
        }

        channel = interaction.channel;
        await interaction.deferReply({ ephemeral: true });

        try {
            const track = await getTrackInfo(url);

            if (!connection) {
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

            if (!player) {
                player = createAudioPlayer();
            }

            if (!subscription) {
                subscription = connection.subscribe(player);
            }

            if (!listenerAdded) {
                player.on(AudioPlayerStatus.Idle, () => {
                    cleanupCurrentProcesses();
                    globalData.queue.shift();
                    playNext().catch(console.error);
                });

                player.on('error', (error) => {
                    console.error('Audio player error:', error);
                    cleanupCurrentProcesses();
                    globalData.queue.shift();
                    playNext().catch(console.error);
                });

                listenerAdded = true;
            }

            globalData.queue.push(track);

            await interaction.editReply({
                content: `Added **${track.title}** to queue.`,
            });

            if (player.state.status === AudioPlayerStatus.Idle) {
                await playNext();
            }
        } catch (error) {
            console.error(error);

            const content = 'An error occurred while trying to play this URL. Make sure yt-dlp and ffmpeg are installed and available in PATH.';

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content });
            } else {
                await interaction.reply({ content, ephemeral: true });
            }
        }
    },
};

function isValidYouTubeUrl(url) {
    const regex = /^(https?:\/\/)?(www\.youtube\.com|music\.youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}

async function playNext() {
    if (globalData.queue.length === 0) {
        console.log('Queue is empty.');
        return;
    }

    const track = globalData.queue[0];

    cleanupCurrentProcesses();

    currentYtDlp = spawn(
        YTDLP_BIN,
        [
            '--ignore-config',
            '--no-playlist',
            '--quiet',
            '--no-warnings',
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
        .addFields({ name: 'Now playing:', value: track.title, inline: true })
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

function getTrackInfo(url) {
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
                    title: info.title || url,
                    webpageUrl: info.webpage_url || url,
                    thumbnail:
                        info.thumbnail ||
                        info.thumbnails?.[info.thumbnails.length - 1]?.url ||
                        null,
                });
            } catch (err) {
                reject(err);
            }
        });
    });
}