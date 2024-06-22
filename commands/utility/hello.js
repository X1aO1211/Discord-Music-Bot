const { SlashCommandBuilder} = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('send')
		.setDescription('sending something to the channel!'),
	async execute(interaction) {
        await interaction.reply('hello');
        const channel = interaction.channel;
		//console.log(channel);
        await channel.send('content');
	},
};