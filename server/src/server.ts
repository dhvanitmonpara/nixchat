import http from "http";
import express from "express";
import dotenv from "dotenv";
import { Server } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import Database from "./database.js";
import { sanitizeString, validateRoomName, validateUsername, validateMessage, RateLimiter } from "./utils.js";

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

app.use(express.json());

// Health check endpoint
app.get("/health", async (req, res) => {
    try {
        const roomCount = await db.getRoomCount();
        const userCount = await db.getActiveUserCount();
        
        res.json({
            status: "healthy",
            timestamp: new Date().toISOString(),
            stats: {
                rooms: roomCount,
                activeUsers: userCount
            }
        });
    } catch (error) {
        res.status(500).json({
            status: "unhealthy",
            error: "Database connection failed"
        });
    }
});

// Get room stats endpoint
app.get("/api/rooms/:roomName/stats", async (req, res) => {
    try {
        const { roomName } = req.params;
        
        if (!validateRoomName(roomName)) {
            return res.status(400).json({ error: "Invalid room name" });
        }
        
        const userCount = await db.getActiveUserCount(roomName);
        const roomData = await db.getRoomData(roomName);
        
        if (!roomData) {
            return res.status(404).json({ error: "Room not found" });
        }
        
        res.json({
            roomName,
            activeUsers: userCount,
            messageCount: roomData.chat.length
        });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

const db = new Database();

// Rate limiters
const messageRateLimiter = new RateLimiter(30, 60000); // 30 messages per minute
const joinRateLimiter = new RateLimiter(5, 60000); // 5 room joins per minute

// Cleanup rate limiters every 5 minutes
setInterval(() => {
    messageRateLimiter.cleanup();
    joinRateLimiter.cleanup();
}, 5 * 60 * 1000);

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle message event
    socket.on("message", async ({ room, message, sender, username }) => {
        try {
            // Rate limiting
            if (!messageRateLimiter.isAllowed(socket.id)) {
                socket.emit("error", { message: "Too many messages. Please slow down." });
                return;
            }

            // Validate input
            if (!room || !message || !sender || !username) {
                socket.emit("error", { message: "Missing required fields" });
                return;
            }

            // Validate and sanitize message
            if (!validateMessage(message)) {
                socket.emit("error", { message: "Invalid message content" });
                return;
            }

            // Validate room name
            if (!validateRoomName(room)) {
                socket.emit("error", { message: "Invalid room name" });
                return;
            }

            // Validate username
            if (!validateUsername(username)) {
                socket.emit("error", { message: "Invalid username" });
                return;
            }

            // Check if user is in the room
            const isInRoom = await db.isUserInRoom(socket.id, room);
            if (!isInRoom) {
                socket.emit("error", { message: "You are not in this room" });
                return;
            }

            const messageData = {
                _id: uuidv4(),
                message: sanitizeString(message, 1000),
                sender: sanitizeString(sender, 255),
                username: sanitizeString(username, 30),
                room: sanitizeString(room, 50),
                timestamp: Date.now(),
            };

            await db.addMessage(messageData);
            io.to(room).emit("receive-message", messageData);
        } catch (error) {
            console.error("⚠️  Error saving message:", error);
            socket.emit("error", { message: "Failed to send message" });
        }
    });

    // Handle join-room event
    socket.on("join-room", async ({ room, username }) => {
        try {
            // Rate limiting
            if (!joinRateLimiter.isAllowed(socket.id)) {
                socket.emit("error", { message: "Too many join attempts. Please wait." });
                return;
            }

            // Validate input
            if (!room || !username) {
                socket.emit("error", { message: "Room name and username are required" });
                return;
            }

            // Validate room name
            if (!validateRoomName(room)) {
                socket.emit("error", { message: "Invalid room name. Use only letters, numbers, hyphens, and underscores." });
                return;
            }

            // Validate username
            if (!validateUsername(username)) {
                socket.emit("error", { message: "Invalid username. Use only letters, numbers, spaces, hyphens, and underscores." });
                return;
            }

            const roomName = sanitizeString(room, 50);
            const userName = sanitizeString(username, 30);

            // Check if user is already in the room
            const isAlreadyInRoom = await db.isUserInRoom(socket.id, roomName);
            if (isAlreadyInRoom) {
                socket.emit("error", { message: "You are already in this room" });
                return;
            }

            // Join the socket room
            socket.join(roomName);
            
            // Create room if it doesn't exist
            await db.createRoom(roomName);
            
            // Add user to active users in the room
            await db.addActiveUser({ id: socket.id, username: userName, room: roomName });

            // Get updated room data and emit to clients
            const roomData = await db.getRoomData(roomName);
            
            // Notify all users in the room about the new user
            io.to(roomName).emit("joined-room", { 
                room: roomData, 
                username: userName, 
                socketId: socket.id 
            });

            // Send room history to the joining user
            socket.emit("room-history", { room: roomData });

            console.log(`User ${userName} (${socket.id}) joined room: ${roomName}`);
        } catch (error) {
            console.error("⚠️  Error joining room:", error);
            socket.emit("error", { message: "Failed to join room" });
        }
    });

    // Handle leave-room event
    socket.on("leave-room", async ({ room, username }) => {
        try {
            // Validate input
            if (!room) {
                socket.emit("error", { message: "Room name is required" });
                return;
            }

            const roomName = room.trim();

            // Check if user is actually in the room
            const isInRoom = await db.isUserInRoom(socket.id, roomName);
            if (!isInRoom) {
                socket.emit("error", { message: "You are not in this room" });
                return;
            }

            // Leave the socket room
            socket.leave(roomName);

            // Remove user from active users in this specific room
            await db.removeActiveUserFromRoom(socket.id, roomName);

            // Get updated room data
            const roomData = await db.getRoomData(roomName);
            
            // Notify other users in the room about the user leaving
            io.to(roomName).emit("left-room", { 
                room: roomData, 
                username: username || "Unknown user",
                socketId: socket.id
            });

            // Confirm to the leaving user
            socket.emit("left-room-confirm", { 
                room: null, 
                username: username || "Unknown user" 
            });

            // Clean up empty rooms
            await db.removeEmptyRooms();

            console.log(`User ${username || "Unknown"} (${socket.id}) left room: ${roomName}`);
        } catch (error) {
            console.error("⚠️  Error leaving room:", error);
            socket.emit("error", { message: "Failed to leave room" });
        }
    });

    // Handle disconnect event
    socket.on("disconnect", async () => {
        try {
            console.log(`User disconnected: ${socket.id}`);

            // Get all rooms the user was in before removing them
            const userRooms = await db.getUserRooms(socket.id);

            // Remove user from all rooms
            await db.removeActiveUser(socket.id);

            // Notify all rooms about the user disconnection
            for (const roomName of userRooms) {
                const roomData = await db.getRoomData(roomName);
                io.to(roomName).emit("user-disconnected", { 
                    room: roomData, 
                    socketId: socket.id 
                });
            }

            // Clean up empty rooms
            await db.removeEmptyRooms();
        } catch (error) {
            console.error("⚠️  Error handling disconnect:", error);
        }
    });

    // Handle get room list
    socket.on("get-rooms", async () => {
        try {
            // This could be extended to get public rooms or user's rooms
            const userRooms = await db.getUserRooms(socket.id);
            socket.emit("rooms-list", { rooms: userRooms });
        } catch (error) {
            console.error("⚠️  Error getting rooms:", error);
            socket.emit("error", { message: "Failed to get rooms" });
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
