const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('pause')
		.setDescription('pause the song!'),
	async execute(interaction) {
		const connection = getVoiceConnection(interaction.guild.id);
        //console.log(connection);

		const player = connection.state.subscription.player;
		
		//console.log(player.state.status);
		if(player.state.status == 'playing'){
			player.pause();
			await interaction.reply('the song is paused!');
		}
		else if(player.state.status == 'paused'){
			player.unpause();
			await interaction.reply('the song is unpaused!');
		}
	},
};