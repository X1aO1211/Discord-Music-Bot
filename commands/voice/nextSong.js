const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getVoiceConnection, AudioPlayerStatus } = require('@discordjs/voice');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('next')
		.setDescription('next song!')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const connection = getVoiceConnection(interaction.guild.id);
        //console.log(connection);

		const player = connection.state.subscription.player;
		player.emit(AudioPlayerStatus.Paused);
		player.emit(AudioPlayerStatus.Idle);
        await interaction.reply({ content: 'Next Song!', ephemeral: true })
	},
};