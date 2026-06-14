const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.send({ status: 'ok', uptime: process.uptime() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Track active rooms
// roomId -> { sender: socketId, receiver: socketId, metadata: { name, size, type, totalChunks, sha256 } }
const activeRooms = new Map();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-room', ({ roomId, role, metadata }) => {
    console.log(`User ${socket.id} joining room ${roomId} as ${role}`);
    
    if (!activeRooms.has(roomId)) {
      activeRooms.set(roomId, { sender: null, receiver: null, metadata: null });
    }

    const room = activeRooms.get(roomId);

    if (role === 'sender') {
      room.sender = socket.id;
      if (metadata) {
        room.metadata = metadata;
      }
      socket.join(roomId);
      
      // If receiver is already there, let the sender know so we can initiate WebRTC handshake
      if (room.receiver) {
        io.to(room.sender).emit('receiver-joined', { receiverId: room.receiver });
      }
    } else if (role === 'receiver') {
      // For 1-to-1 transfer, check if a receiver is already in the room
      if (room.receiver && room.receiver !== socket.id) {
        socket.emit('room-error', 'This sharing room is already full (1-to-1 limit).');
        return;
      }
      
      room.receiver = socket.id;
      socket.join(roomId);
      
      // Send the file metadata to the joining receiver
      if (room.metadata) {
        socket.emit('file-metadata', room.metadata);
      }
      
      // Notify the sender that a receiver has joined
      if (room.sender) {
        io.to(room.sender).emit('receiver-joined', { receiverId: socket.id });
      }
    }

    // Association of socket with its room and role for easy cleanup
    socket.roomId = roomId;
    socket.role = role;
  });

  // Relay WebRTC signals (offer, answer, ice-candidate)
  socket.on('signal', ({ to, signalData }) => {
    io.to(to).emit('signal', {
      from: socket.id,
      signalData
    });
  });

  // Relay control/message communications (e.g., resume index, verification state)
  socket.on('control-message', ({ to, message }) => {
    io.to(to).emit('control-message', {
      from: socket.id,
      message
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    const { roomId, role } = socket;
    
    if (roomId && activeRooms.has(roomId)) {
      const room = activeRooms.get(roomId);
      
      if (role === 'sender' && room.sender === socket.id) {
        room.sender = null;
        // Notify receiver that sender disconnected
        if (room.receiver) {
          io.to(room.receiver).emit('peer-disconnected', { role: 'sender' });
        }
      } else if (role === 'receiver' && room.receiver === socket.id) {
        room.receiver = null;
        // Notify sender that receiver disconnected
        if (room.sender) {
          io.to(room.sender).emit('peer-disconnected', { role: 'receiver' });
        }
      }

      // If both left, clean up the room
      if (!room.sender && !room.receiver) {
        activeRooms.delete(roomId);
        console.log(`Room ${roomId} cleaned up.`);
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
