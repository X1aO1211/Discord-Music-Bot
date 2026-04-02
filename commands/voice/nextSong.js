const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('next')
		.setDescription('Skip to the next song')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		const connection = getVoiceConnection(interaction.guild.id);

		if (!connection || !connection.state.subscription) {
			await interaction.reply({
				content: 'Nothing is playing right now.',
				ephemeral: true,
			});
			return;
		}

		const player = connection.state.subscription.player;

		player.stop(true); // this should trigger your Idle handler

		await interaction.reply({
			content: 'Next song!',
			ephemeral: true,
		});
	},
};