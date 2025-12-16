import sqlite3 from "sqlite3";
import { promisify } from "util";

export interface Message {
    _id: string;
    message: string;
    sender: string;
    username: string;
    room: string;
    timestamp: number;
}

export interface User {
    id: string;
    username: string;
    room: string;
}

export interface Room {
    roomName: string;
    chat: Message[];
    activeUsers: User[];
}

class Database {
    private db: sqlite3.Database;

    constructor() {
        this.db = new sqlite3.Database("chat.db");
        this.initTables();
    }

    private initTables() {
        const createRoomsTable = `
            CREATE TABLE IF NOT EXISTS rooms (
                name TEXT PRIMARY KEY,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `;

        const createMessagesTable = `
            CREATE TABLE IF NOT EXISTS messages (
                _id TEXT PRIMARY KEY,
                message TEXT NOT NULL,
                sender TEXT NOT NULL,
                username TEXT NOT NULL,
                room TEXT NOT NULL,
                timestamp INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (room) REFERENCES rooms (name)
            )
        `;

        const createActiveUsersTable = `
            CREATE TABLE IF NOT EXISTS active_users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                room TEXT NOT NULL,
                joined_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (room) REFERENCES rooms (name)
            )
        `;

        this.db.serialize(() => {
            this.db.run(createRoomsTable);
            this.db.run(createMessagesTable);
            this.db.run(createActiveUsersTable);
        });
    }

    async createRoom(roomName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT OR IGNORE INTO rooms (name) VALUES (?)",
                [roomName],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async addMessage(message: Message): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT INTO messages (_id, message, sender, username, room, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                [message._id, message.message, message.sender, message.username, message.room, Date.now()],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async getRoomMessages(roomName: string): Promise<Message[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT * FROM messages WHERE room = ? ORDER BY timestamp ASC",
                [roomName],
                (err, rows: any[]) => {
                    if (err) reject(err);
                    else resolve(rows as Message[]);
                }
            );
        });
    }

    async addActiveUser(user: User): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT OR REPLACE INTO active_users (id, username, room) VALUES (?, ?, ?)",
                [user.id, user.username, user.room],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async removeActiveUserFromRoom(userId: string, roomName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                "DELETE FROM active_users WHERE id = ? AND room = ?",
                [userId, roomName],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async getUserRooms(userId: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT DISTINCT room FROM active_users WHERE id = ?",
                [userId],
                (err, rows: any[]) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => row.room));
                }
            );
        });
    }

    async isUserInRoom(userId: string, roomName: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT 1 FROM active_users WHERE id = ? AND room = ?",
                [userId, roomName],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

    async removeActiveUser(userId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                "DELETE FROM active_users WHERE id = ?",
                [userId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async getActiveUsers(roomName: string): Promise<User[]> {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT * FROM active_users WHERE room = ?",
                [roomName],
                (err, rows: any[]) => {
                    if (err) reject(err);
                    else resolve(rows as User[]);
                }
            );
        });
    }

    async getRoomData(roomName: string): Promise<Room | null> {
        try {
            const messages = await this.getRoomMessages(roomName);
            const activeUsers = await this.getActiveUsers(roomName);
            
            return {
                roomName,
                chat: messages,
                activeUsers
            };
        } catch (error) {
            console.error("Error getting room data:", error);
            return null;
        }
    }

    async removeEmptyRooms(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(
                `DELETE FROM rooms 
                 WHERE name NOT IN (SELECT DISTINCT room FROM active_users)`,
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async getRoomCount(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT COUNT(*) as count FROM rooms",
                (err, row: any) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });
    }

    async getActiveUserCount(roomName?: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const query = roomName 
                ? "SELECT COUNT(*) as count FROM active_users WHERE room = ?"
                : "SELECT COUNT(*) as count FROM active_users";
            const params = roomName ? [roomName] : [];

            this.db.get(query, params, (err, row: any) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });
    }

    close(): void {
        this.db.close();
    }
}

export default Database;