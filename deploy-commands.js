const { REST, Routes } = require('discord.js');
//const { token, clientId, guildId } = require('./config.json');
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

//wrapp the commands in this array then rest.put()
const commands = [];

// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		} else {
            //error when "data" or "execute" missing
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

//REST class is defined by Discord and this is how you interact with Discord API
const rest = new REST().setToken(process.env.token);

//the "()" means execute this function 
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// put method to make HTTP request to Discord API 
		const data = await rest.put(
			Routes.applicationGuildCommands(process.env.clientId, process.env.guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})();
