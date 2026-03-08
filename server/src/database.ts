import { Database as SQLite } from "bun:sqlite";

export default class Database {
    private db: SQLite;

    constructor() {
        this.db = new SQLite("chat.db");
        this.initTables();
    }

    private initTables() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS rooms (
                name TEXT PRIMARY KEY,
                created_at INTEGER DEFAULT (strftime('%s','now'))
            )
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS messages (
                _id TEXT PRIMARY KEY,
                message TEXT NOT NULL,
                sender TEXT NOT NULL,
                username TEXT NOT NULL,
                room TEXT NOT NULL,
                timestamp INTEGER,
                FOREIGN KEY(room) REFERENCES rooms(name)
            )
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS active_users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                room TEXT NOT NULL,
                joined_at INTEGER DEFAULT (strftime('%s','now')),
                FOREIGN KEY(room) REFERENCES rooms(name)
            )
        `);
    }

    createRoom(roomName: string) {
        this.db.run(
            "INSERT OR IGNORE INTO rooms (name) VALUES (?)",
            [roomName]
        );
    }

    addMessage(message: any) {
        this.db.run(
            `INSERT INTO messages
            (_id, message, sender, username, room, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                message._id,
                message.message,
                message.sender,
                message.username,
                message.room,
                Date.now()
            ]
        );
    }

    getRoomMessages(room: string) {
        return this.db
            .query("SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC")
            .all(room);
    }

    addActiveUser(user: any) {
        this.db.run(
            `INSERT OR REPLACE INTO active_users
            (id, username, room)
            VALUES (?, ?, ?)`,
            [user.id, user.username, user.room]
        );
    }

    getActiveUsers(room: string) {
        return this.db
            .query("SELECT * FROM active_users WHERE room = ?")
            .all(room);
    }

    removeActiveUser(id: string) {
        this.db.run(
            "DELETE FROM active_users WHERE id = ?",
            [id]
        );
    }

    close() {
        this.db.close();
    }
}