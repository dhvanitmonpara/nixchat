# server

Real-time chat server with SQLite database storage.

## Features

- Real-time messaging with Socket.IO
- SQLite database for persistent storage
- Room-based chat system
- User presence tracking

## Database

The server uses SQLite for data persistence with the following tables:
- `rooms` - Chat room information
- `messages` - Chat messages with timestamps
- `active_users` - Currently connected users per room

The database file (`chat.db`) is automatically created when the server starts.
