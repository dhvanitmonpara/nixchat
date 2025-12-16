import http from "http";
import express from "express";
import dotenv from "dotenv";
import { Server } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import Database from "./database.js";

const result = dotenv.config({ path: "./.env" });
if (result.error) {
    console.error("⚠️  Error loading .env file:", result.error);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.DOMAIN,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

app.use(
    cors({
        origin: process.env.DOMAIN,
        methods: ["GET", "POST"],
        credentials: true,
    })
);

const db = new Database();

io.on("connection", (socket) => {
    // Handle message event
    socket.on("message", async ({ room, message, sender, username }) => {
        const messageData = {
            _id: uuidv4(),
            message,
            sender,
            username,
            room,
            timestamp: Date.now(),
        };

        try {
            if (room) {
                await db.addMessage(messageData);
                io.to(room).emit("receive-message", messageData);
            } else {
                console.error("⚠️  Room not specified for message:", messageData);
            }
        } catch (error) {
            console.error("⚠️  Error saving message:", error);
        }
    });

    // Handle join-room event
    socket.on("join-room", async ({ room, username, socketId }) => {
        try {
            socket.join(room);
            
            // Create room if it doesn't exist
            await db.createRoom(room);
            
            // Add user to active users in the room
            await db.addActiveUser({ id: socketId, username, room });

            // Get updated room data and emit to clients
            const roomData = await db.getRoomData(room);
            io.to(room).emit("joined-room", { room: roomData, username, socketId });
        } catch (error) {
            console.error("⚠️  Error joining room:", error);
        }
    });

    // Handle leave-room event
    socket.on("leave-room", async ({ room, socketId, username }) => {
        try {
            socket.leave(room);

            // Remove user from active users
            await db.removeActiveUser(socketId);

            // Get updated room data
            const roomData = await db.getRoomData(room);
            
            // Emit the updated room data to clients
            io.to(room).emit("left-room", { room: roomData, username });
            io.to(socketId).emit("left-room", { room: null, username });

            // Clean up empty rooms
            await db.removeEmptyRooms();
        } catch (error) {
            console.error("⚠️  Error leaving room:", error);
        }
    });

    // Handle disconnect event
    socket.on("disconnect", async () => {
        try {
            // Remove user from all rooms
            await db.removeActiveUser(socket.id);

            // Clean up empty rooms
            await db.removeEmptyRooms();
        } catch (error) {
            console.error("⚠️  Error handling disconnect:", error);
        }
    });
});

const port = process.env.PORT || 8000;
server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    db.close();
    process.exit(0);
});
