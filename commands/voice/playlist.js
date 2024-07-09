const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, PlayerSubscription } = require('@discordjs/voice');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { YT_API_KEY } = require("../../config.json");
const ytdl = require('ytdl-core');
const axios = require('axios');//yt api
const globalData = require('../../globalData');

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
                .setDescription('URL of the YT playlist #YT mixes are invalid#')
                .setRequired(true)),
    async execute(interaction) {
        channel = interaction.channel;
        const url = interaction.options.getString('url');
        if (!isValidYouTubePlaylistUrl(url)) {
            await interaction.reply({ content: 'Invalid YouTube URL', ephemeral: true });
            return;
        }

        try {
            const connection = joinVoiceChannel({
                channelId: interaction.member.voice.channelId,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            connection.once(VoiceConnectionStatus.Ready, () => {
                console.log('Connection is ready!');
            });

            connection.once(VoiceConnectionStatus.Disconnected, () => {
                //clear the queue
                globalData.queue.length = 0;
                console.log('Disconnected!');
            });

            await interaction.reply({ content: 'Playlist is added!', ephemeral: true });

            if (!player) {
            player = createAudioPlayer();
            }

            player.setMaxListeners(50);

            if (!subscription) {
                subscription = connection.subscribe(player);
            }

            const playlistId = new URL(url).searchParams.get('list');

            const fetchPlaylistVideos = async (playlistId) => {
                let videos = [];
                let nextPageToken = '';
                do {
                    const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
                        params: {
                            part: 'snippet',
                            playlistId: playlistId,
                            maxResults: 20,
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

            globalData.queue.push(...videoUrls);
            //console.log(globalData.queue.length);

            const playNext = async() => {
                if (globalData.queue.length <= 0) {
                    connection.destroy();
                    player.emit(AudioPlayerStatus.Paused);
                    return;
                }
                const track = globalData.queue[0];
                globalData.queue.shift();

                try {
                    const stream = ytdl(track, { quality: 'highestaudio', filter: 'audioonly', highWaterMark: 64 * 1024 * 1024 });
                    
                    stream.on('error', (error) => {
                        console.error(`Error occurred while streaming track: ${track}`, error);
                        player.emit(AudioPlayerStatus.Idle);
                    });

                    const resource = createAudioResource(stream);
                    
                    player.play(resource);

                    let info = await ytdl.getBasicInfo(track);
                    const MusicEmbed = new EmbedBuilder()
                        .setColor(0xe9b1cd)  
                        .setTitle('Music Bot')
                        .addFields({ name: 'Now playing:', value: info.videoDetails.title, inline: true })
                        .setThumbnail(info.videoDetails.thumbnails[2].url)
                        .setURL(info.videoDetails.video_url);

                    if (musicMessage) {
                        await musicMessage.edit({ embeds: [MusicEmbed] });
                    } else {
                        musicMessage = await channel.send({ embeds: [MusicEmbed] });
                    }

                } catch (error) {
                    console.error(`Error playing track: ${track}`, error);
                    globalData.queue.shift();
                    playNext();
                    return;
                }

                player.once(AudioPlayerStatus.Idle, () => {
                    //console.log(globalData.queue.length);
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