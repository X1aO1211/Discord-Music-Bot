const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');

let queue = [];
let subscription = null;
let player = null;
let channel = null;
let listenerAdded = false;

let musicMessage = null;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a YouTube music')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL of the YouTube video')
                .setRequired(true)),
    async execute(interaction) {
        channel = interaction.channel;
        const url = interaction.options.getString('url');

        //test validation
        if (!isValidYouTubeUrl(url)) {
            await interaction.reply('Invalid YouTube URL');
            return;
        }

        try {
            const connection = joinVoiceChannel({
                channelId: interaction.member.voice.channelId,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            connection.on(VoiceConnectionStatus.Ready, () => {
                console.log('Connection is ready!');
            });

            connection.on(VoiceConnectionStatus.Disconnected, ()=>{
                console.log("connection disconnected!")
                //clear the queue
                queue = new Array;
            })

            await interaction.reply({ content: 'music is added!', ephemeral: true });

            if (!player) {
                player = createAudioPlayer();
            }

            if (!subscription) {
                subscription = connection.subscribe(player);
            }

            if (!listenerAdded) {
                player.on(AudioPlayerStatus.Idle, () => {
                    //console.log("Song ends!");
                    queue.shift();
                    playNext();
                });
                listenerAdded = true;
            }

            queue.push(url);
            //console.log(queue);

            if (player.state.status !== AudioPlayerStatus.Playing) {
                playNext();
            }

        } catch (error) {
            console.error(error);
            await interaction.reply('An error occurred while trying to play the playlist.');
        }
    },
};

function isValidYouTubeUrl(url) {
    //https:// + youtube.com + ???
    const regex = /^(https?:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}

async function playNext() {
    if (queue.length === 0) {
        console.log("Queue is empty.");
        return;
    }

    let track = queue[0];
    //console.log(track);

    let stream = ytdl(track, { filter: 'audioonly', highWaterMark: 32 * 1024 * 1024 });
    
    let resource = createAudioResource(stream);
    console.log(resource);

    let info = await ytdl.getBasicInfo(track);

    const MusicEmbed = new EmbedBuilder()
        .setColor(0xe9b1cd)  
        .setTitle('Music Bot')
        .addFields({ name: 'Now playing:', value: info.videoDetails.title, inline: true })
        .setThumbnail(info.videoDetails.thumbnails[2].url)
        .setURL(info.videoDetails.video_url);

    //edit the embed
    if (musicMessage) {
        await musicMessage.edit({ embeds: [MusicEmbed] });
    } else {
        musicMessage = await channel.send({ embeds: [MusicEmbed] });
    }

    player.play(resource);
}