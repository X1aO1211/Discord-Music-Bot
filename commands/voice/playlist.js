const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { YT_API_KEY } = require("../../config.json");
const ytdl = require('ytdl-core');
const axios = require('axios');//yt api

let subscription = null;
let player = null;
let channel = null;
let musicMessage = null;//embed

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Play a YouTube Playlist')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL of the YouTube playlist')
                .setRequired(true)),
    async execute(interaction) {
        channel = interaction.channel;
        const url = interaction.options.getString('url');

        //test validation
        if (!isValidYouTubePlaylistUrl(url)) {
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
            })

            await interaction.reply({ content: 'playlist is added!', ephemeral: true });

            if (!player) {
                player = createAudioPlayer();
            }

            if (!subscription) {
                subscription = connection.subscribe(player);
            }

            const playlistId = new URL(url).searchParams.get('list');
            //console.log(playlistId);

            const fetchPlaylistVideos = async (playlistId) => {
                let videos = [];
                let nextPageToken = '';
                do {
                    const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
                        params: {
                            part: 'snippet',
                            playlistId: playlistId,
                            maxResults: 50,
                            pageToken: nextPageToken,
                            key: YT_API_KEY 
                        }
                    });
                    const data = response.data;
                    videos = videos.concat(data.items.map(item => `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`));
                    nextPageToken = data.nextPageToken;
                } while (nextPageToken);
                return videos;
            };

            const videoUrls = await fetchPlaylistVideos(playlistId);
            //console.log(videoUrls);

            let currentIndex = 0;

            const playNext = async() => {
                if (currentIndex >= videoUrls.length) {
                    connection.destroy();
                    return;
                }
                const track = videoUrls[currentIndex];
                const stream = ytdl(track, { filter: 'audioonly', highWaterMark: 32 * 1024 * 1024 });
                const resource = createAudioResource(stream, { inputType: 'arbitrary', inlineVolume: true });

                player.play(resource);

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

                player.once(AudioPlayerStatus.Idle, () => {
                    currentIndex++;
                    playNext();
                });
            };

        playNext();
           

        } catch (error) {
            console.error(error);
            await interaction.reply('An error occurred while trying to play the playlist.');
        }
    },
};

function isValidYouTubePlaylistUrl(url) {
    // Regular expression to match YouTube playlist URLs
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(playlist\?list=|watch\?v=.*&list=)|youtu\.be\/.*\?list=).+$/;
    return regex.test(url);
}
