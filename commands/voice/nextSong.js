const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection, AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('next')
		.setDescription('cut the song!'),
	async execute(interaction) {
		const connection = getVoiceConnection(interaction.guild.id);
        //console.log(connection);

		const player = connection.state.subscription.player;
		
		player.emit(AudioPlayerStatus.nextSong);
        await interaction.reply({ content: 'Next Song!', ephemeral: true })
	},
};