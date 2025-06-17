### Dockerfile for Discord.js Bot
# Use official Node.js LTS image
FROM node:22

# Create app directory
WORKDIR /usr/srv/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# copy code into image
COPY . .

# Command to run the bot
CMD ["node", "index.js"]
