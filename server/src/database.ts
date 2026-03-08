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

        this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_messages_room_timestamp
                ON messages(room, timestamp)
        `);

        this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_active_users_room
                ON active_users(room)
        `);

        this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_active_users_room
                ON active_users(room)
        `);

        this.db.run("DELETE FROM active_users");
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

    removeEmptyRooms() {
        this.db.run(`
            DELETE FROM rooms
            WHERE NOT EXISTS (
                SELECT 1
                FROM active_users
                WHERE active_users.room = rooms.name
            )
        `);
    }

    isUserInRoom(userId: string, room: string): boolean {
        const result = this.db
            .query("SELECT 1 FROM active_users WHERE id = ? AND room = ? LIMIT 1")
            .get(userId, room);

        return !!result;
    }

    getUserRooms(userId: string): string[] {
        const rows = this.db
            .query("SELECT room FROM active_users WHERE id = ?")
            .all(userId) as { room: string }[];

        return rows.map(r => r.room);
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

    getRoomCount(): number {
        const row = this.db.query("SELECT COUNT(*) as count FROM rooms").get() as { count: number };
        return row.count;
    }

    getActiveUserCount(room?: string): number {
        if (room) {
            const row = this.db
                .query("SELECT COUNT(*) as count FROM active_users WHERE room = ?")
                .get(room) as { count: number };

            return row.count;
        }

        const row = this.db
            .query("SELECT COUNT(*) as count FROM active_users")
            .get() as { count: number };

        return row.count;
    }

    removeActiveUserFromRoom(userId: string, room: string) {
        this.db.run(
            "DELETE FROM active_users WHERE id = ? AND room = ?",
            [userId, room]
        );
    }

    getRoomData(roomName: string) {
        const messages = this.getRoomMessages(roomName);
        const users = this.getActiveUsers(roomName);

        return {
            roomName,
            chat: messages,
            activeUsers: users
        };
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