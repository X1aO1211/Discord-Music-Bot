class Playlist {
    constructor() {
        this.songs = [];
    }

    enqueue(song) {
        this.songs.push(song);
    }

    dequeue() {
        return this.songs.shift();
    }

    playNext() {
        const nextSong = this.dequeue();
        if (nextSong) {
            console.log(`Now playing: ${nextSong}`);
            // Play the next song...
            return nextSong;
        } else {
            console.log("Playlist is empty.");
            return null;
        }
    }
}

module.exports = Playlist;