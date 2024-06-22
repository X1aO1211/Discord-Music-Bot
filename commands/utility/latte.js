const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('latte')
		.setDescription('Replies with Pong!')
		.addUserOption(option =>
			option
				.setName('target')
				.setDescription('The member @')
				.setRequired(true)),
	async execute(interaction) {
		const member = interaction.options.getUser('target');
		await interaction.reply(`@${member.username} bad!`);
		console.log(member);
	},
};