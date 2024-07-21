const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const globalData = require('../../globalData');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('clear')
		.setDescription('clear the queue!'),
	async execute(interaction) {
		const connection = getVoiceConnection(interaction.guild.id);
        connection.disconnect();
        await interaction.reply({ content: 'cleared', ephemeral: true });
	},
};