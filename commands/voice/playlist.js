const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, PlayerSubscription } = require('@discordjs/voice');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
require('dotenv').config();
const axios = require('axios');//yt api
const globalData = require('../../globalData');
const ytdl = require('@distube/ytdl-core');
//const ytdl = require('ytdl-core');

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
                .setDescription('URL of the YT playlist')
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
                            maxResults: 30,
                            pageToken: nextPageToken,
                            key: process.env.YT_API_KEY 
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
                console.log("play next!");
                if (globalData.queue.length <= 0) {
                    return;
                }
                const track = globalData.queue[0];
                globalData.queue.shift();
                
                try {
                    const stream = ytdl(track, { quality: 'highestaudio', filter: 'audioonly', highWaterMark: 32 * 1024 * 1024 });
        
                    stream.on('error', (error) => {
                        console.error(`Error occurred while streaming track: ${track}`, error);
                        player.emit(AudioPlayerStatus.Idle);
                    });
        
                    const resource = createAudioResource(stream);
                    //console.log(resource);
        
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
                    playNext(); 
                }
            }; 

            player.on(AudioPlayerStatus.Idle, () => {
                //console.log("audio player is idle");
                playNext();
            });

            playNext();

        } catch (error) {
            console.error(error);
            await interaction.reply('An error occurred while trying to play the playlist.');
        }
    },
};

// function isValidYouTubePlaylistUrl(url) {
//     // Regular expression to match YouTube playlist URLs
//     const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(playlist\?list=|watch\?v=.*&list=)|youtu\.be\/.*\?list=).+$/;
//     return regex.test(url);
// }

function isValidYouTubePlaylistUrl(url) {
    // Regular expression to match YouTube playlist URLs, excluding mixes
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(playlist\?list=(?!RD|UL)[^&]+|watch\?v=.*&list=(?!RD|UL)[^&]+)|youtu\.be\/.*\?list=(?!RD|UL)[^&]+).+$/;
    return regex.test(url);
}
