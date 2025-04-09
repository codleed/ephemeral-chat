import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import crypto from "crypto";
import path from "path";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// Serve static files from the React app in production
const clientBuildPath = path.join(__dirname, "../../dist");
app.use(express.static(clientBuildPath));

// Handle React routing, return all requests to React app
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// Store active sessions in memory
interface Session {
  id: string;
  code: string;
  createdAt: number;
  creatorId: string;
  participants: Map<string, string>; // socketId -> anonymousName
  sessionKey: string; // Shared encryption key
}

interface Message {
  id: string;
  sender: string;
  encryptedContent: string;
  timestamp: number;
}

const activeSessions = new Map<string, Session>(); // code -> session
const socketToSession = new Map<string, string>(); // socketId -> sessionCode

// Generate a random 6-digit alphanumeric code
function generateSessionCode(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// Generate a random anonymous name for participants
function generateAnonymousName(): string {
  const adjectives = [
    "Happy",
    "Brave",
    "Clever",
    "Gentle",
    "Wise",
    "Swift",
    "Calm",
    "Bold",
    "Bright",
    "Kind",
  ];
  const animals = [
    "Panda",
    "Tiger",
    "Eagle",
    "Dolphin",
    "Fox",
    "Wolf",
    "Owl",
    "Bear",
    "Lion",
    "Hawk",
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];

  return `${adjective}${animal}`;
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create a new chat session
  socket.on("create-session", () => {
    let code = generateSessionCode();

    // Ensure the code is unique
    while (activeSessions.has(code)) {
      code = generateSessionCode();
    }

    const session: Session = {
      id: crypto.randomUUID(),
      code,
      createdAt: Date.now(),
      creatorId: socket.id,
      participants: new Map([[socket.id, generateAnonymousName()]]),
      sessionKey: "", // Will be set when the creator sends it
    };

    activeSessions.set(code, session);
    socketToSession.set(socket.id, code);

    socket.join(code);

    socket.emit("session-created", {
      code,
      createdAt: session.createdAt,
      anonymousName: session.participants.get(socket.id),
    });

    console.log(`Session created: ${code} by ${socket.id}`);
  });

  // Join an existing chat session
  socket.on("join-session", ({ code }) => {
    const session = activeSessions.get(code);

    if (!session) {
      socket.emit("error", { message: "Invalid session code" });
      return;
    }

    if (session.participants.size >= 10) {
      socket.emit("error", {
        message: "Session is full (max 10 participants)",
      });
      return;
    }

    const anonymousName = generateAnonymousName();
    session.participants.set(socket.id, anonymousName);
    socketToSession.set(socket.id, code);

    socket.join(code);

    socket.emit("session-joined", {
      code,
      createdAt: session.createdAt,
      anonymousName,
      sessionKey: session.sessionKey, // Send the session key to the joining user
    });

    // Notify other participants that someone joined
    socket.to(code).emit("participant-joined", {
      participantId: socket.id,
      anonymousName,
      participantCount: session.participants.size,
    });

    // Send the current participant list to the new joiner
    const participants = Array.from(session.participants.entries()).map(
      ([id, name]) => ({
        id,
        name,
        isCreator: id === session.creatorId,
      })
    );

    socket.emit("participant-list", { participants });

    console.log(`User ${socket.id} joined session ${code} as ${anonymousName}`);
  });

  // Handle chat messages
  socket.on("send-message", ({ encryptedContent }) => {
    const sessionCode = socketToSession.get(socket.id);

    if (!sessionCode) {
      socket.emit("error", { message: "You are not in a session" });
      return;
    }

    const session = activeSessions.get(sessionCode);

    if (!session) {
      socket.emit("error", { message: "Session not found" });
      return;
    }

    const senderName = session.participants.get(socket.id) || "Unknown";
    console.log(
      `Message from ${socket.id} (${senderName}): ${encryptedContent}`
    );

    const message: Message = {
      id: crypto.randomUUID(),
      sender: socket.id,
      encryptedContent,
      timestamp: Date.now(),
    };

    // Broadcast the message to all participants in the session
    io.to(sessionCode).emit("new-message", {
      id: message.id,
      sender: socket.id,
      senderName: senderName,
      encryptedContent: message.encryptedContent,
      timestamp: message.timestamp,
    });

    console.log(
      `Message broadcast to session ${sessionCode} with ${session.participants.size} participants`
    );
  });

  // Handle setting the session key
  socket.on("set-session-key", ({ sessionKey }) => {
    const sessionCode = socketToSession.get(socket.id);

    if (!sessionCode) {
      socket.emit("error", { message: "You are not in a session" });
      return;
    }

    const session = activeSessions.get(sessionCode);

    if (!session) {
      socket.emit("error", { message: "Session not found" });
      return;
    }

    if (session.creatorId !== socket.id) {
      socket.emit("error", {
        message: "Only the session creator can set the session key",
      });
      return;
    }

    // Set the session key
    session.sessionKey = sessionKey;
    console.log(`Session key set for session ${sessionCode}`);
  });

  // End the session (only creator can do this)
  socket.on("end-session", () => {
    const sessionCode = socketToSession.get(socket.id);

    if (!sessionCode) {
      socket.emit("error", { message: "You are not in a session" });
      return;
    }

    const session = activeSessions.get(sessionCode);

    if (!session) {
      socket.emit("error", { message: "Session not found" });
      return;
    }

    if (session.creatorId !== socket.id) {
      socket.emit("error", {
        message: "Only the session creator can end the session",
      });
      return;
    }

    // Notify all participants that the session has ended
    io.to(sessionCode).emit("session-ended", {
      message: "The session has been ended by the creator",
    });

    // Clean up session data
    for (const participantId of session.participants.keys()) {
      socketToSession.delete(participantId);
    }

    activeSessions.delete(sessionCode);
    console.log(`Session ${sessionCode} ended by creator ${socket.id}`);
  });

  // Leave the session
  socket.on("leave-session", () => {
    handleDisconnect(socket.id);
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    handleDisconnect(socket.id);
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Handle user disconnection or leaving a session
function handleDisconnect(socketId: string) {
  const sessionCode = socketToSession.get(socketId);

  if (!sessionCode) {
    return;
  }

  const session = activeSessions.get(sessionCode);

  if (!session) {
    socketToSession.delete(socketId);
    return;
  }

  const anonymousName = session.participants.get(socketId);
  session.participants.delete(socketId);
  socketToSession.delete(socketId);

  // Notify other participants that someone left
  io.to(sessionCode).emit("participant-left", {
    participantId: socketId,
    anonymousName,
    participantCount: session.participants.size,
  });

  // If the creator left or there are no participants left, end the session
  if (socketId === session.creatorId || session.participants.size === 0) {
    // Notify all participants that the session has ended
    io.to(sessionCode).emit("session-ended", {
      message:
        socketId === session.creatorId
          ? "The session has ended because the creator left"
          : "The session has ended because all participants left",
    });

    // Clean up session data
    for (const participantId of session.participants.keys()) {
      socketToSession.delete(participantId);
    }

    activeSessions.delete(sessionCode);
    console.log(
      `Session ${sessionCode} ended because ${
        socketId === session.creatorId
          ? "creator left"
          : "all participants left"
      }`
    );
  }
}

// Use environment variables for configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Log the environment
console.log(`Server running in ${NODE_ENV} mode`);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
