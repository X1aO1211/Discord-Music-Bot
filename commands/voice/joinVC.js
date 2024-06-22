const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const fs = require('node:fs');
const path = require('node:path');
const Playlist = require('../../playlist');
//const { generateDependencyReport } = require('@discordjs/voice');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('join')
		.setDescription('joining VC!'),
	async execute(interaction) {
        //console.log(generateDependencyReport());

        const connection = joinVoiceChannel({
            channelId: interaction.member.voice.channelId,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        connection.on(VoiceConnectionStatus.Ready, ()=>{
            console.log('connection is ready!');
        });

        await interaction.reply('bot has joined VC');

        const player = createAudioPlayer();
        
        const playlist = new Playlist();

        const musicFolder = path.join(__dirname, '../../music');
        const tracks = fs.readdirSync(musicFolder).filter(file => file.endsWith('.flac')||file.endsWith('.mp3') ||  file.endsWith('.mkv'));
        for(const track of tracks){
            playlist.enqueue(track);
        }

        //important!! Subscribes to an audio player, allowing the player to play audio on this voice connection.
        connection.subscribe(player);

        function nextTrack(){
            let trackName = playlist.playNext();
            if(trackName == null){
                console.log('No more tracks!!!');
                connection.destroy();
                return;
            }
            let resource = createAudioResource(fs.createReadStream(path.join('music', trackName)));
            player.play(resource);
            return;
            //interaction.followUp(`Now playing: ${trackName}`);
        }

        nextTrack();

        player.on(AudioPlayerStatus.Idle, ()=>{
            nextTrack();
        });
	},
};