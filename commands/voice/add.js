const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection, AudioPlayerStatus } = require('@discordjs/voice');
const globalData = require('../../globalData');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('add')
		.setDescription('add to the queue!')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('URL')
                .setRequired(true)),
	async execute(interaction) {
		const connection = getVoiceConnection(interaction.guild.id);
        const url = interaction.options.getString('url');
        if(!isValidYouTubeUrl(url)){
            await interaction.reply({ content: 'Invalid YouTube URL', ephemeral: true });
            return;
        }
        //console.log(connection);
        globalData.queue.push(url);
        await interaction.reply({ content: 'the song is added to the queue', ephemeral: true });
	},
};

function isValidYouTubeUrl(url) {
    //https:// + youtube.com + ???
    const regex = /^(https?:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
    return regex.test(url);
}