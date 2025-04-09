import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

// Import custom middleware and utilities
import {
  applySecurityHeaders,
  applyCorsProtection,
} from "./middleware/security";
import {
  applyRateLimit,
  cleanupRateLimit,
  startRateLimitCleanup,
} from "./middleware/rateLimiter";
import {
  applyValidation,
  sanitizeString,
  validateEventData,
} from "./middleware/validation";
import {
  Session,
  Message,
  createSession,
  joinSession,
  getSession,
  getSessionBySocketId,
  setSessionKey,
  leaveSession,
  endSession,
  startSessionCleanup,
  generateAnonymousName,
} from "./utils/sessionManager";

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Configure Socket.IO with security settings
const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV === "production" ? ["https://yourdomain.com"] : "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  // Add transport security options
  transports: ["websocket", "polling"],
  // Add connection timeout
  connectTimeout: 10000,
});

// Apply security middleware
applySecurityHeaders(app);
applyCorsProtection(
  app,
  process.env.NODE_ENV === "production" ? ["https://yourdomain.com"] : ["*"]
);

// Apply rate limiting to API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests from this IP, please try again after 15 minutes",
});

app.use("/api/", apiLimiter);
app.use(express.json({ limit: "100kb" })); // Limit request body size

// Serve static files from the React app in production
const clientBuildPath = path.join(__dirname, "../../dist");
app.use(
  express.static(clientBuildPath, {
    maxAge: "1d", // Cache static assets for 1 day
    setHeaders: (res, path) => {
      if (path.endsWith(".html")) {
        // Don't cache HTML files
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

// Handle React routing, return all requests to React app
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// Start session cleanup
startSessionCleanup(io);

// Start rate limit cleanup
startRateLimitCleanup();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create a new chat session with rate limiting and validation
  const createSessionHandler = () => {
    // Create a new session using the session manager
    const session = createSession(socket.id);

    // Join the socket to the session room
    socket.join(session.code);

    // Notify the client that the session was created
    socket.emit("session-created", {
      code: session.code,
      createdAt: session.createdAt,
      anonymousName: session.participants.get(socket.id),
    });

    console.log(`Session created: ${session.code} by ${socket.id}`);
  };

  // Apply rate limiting and validation to the create-session event
  // Limit to 5 session creations per minute per socket
  applyRateLimit(socket, "create-session", createSessionHandler, 5);

  // Join an existing chat session with rate limiting and validation
  const joinSessionHandler = ({ code }: { code: string }) => {
    // Sanitize the code
    const sanitizedCode = sanitizeString(code);

    // Join the session using the session manager
    const session = joinSession(socket.id, sanitizedCode);

    if (!session) {
      socket.emit("error", {
        message: "Invalid session code or session expired",
      });
      return;
    }

    // Join the socket to the session room
    socket.join(session.code);

    // Notify the client that they joined the session
    socket.emit("session-joined", {
      code: session.code,
      createdAt: session.createdAt,
      anonymousName: session.participants.get(socket.id),
      sessionKey: session.sessionKey, // Send the session key to the joining user
      creatorId: session.creatorId, // Send the creator ID for key rotation handling
    });

    // Notify other participants that someone joined
    socket.to(session.code).emit("participant-joined", {
      participantId: socket.id,
      anonymousName: session.participants.get(socket.id),
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

    console.log(
      `User ${socket.id} joined session ${
        session.code
      } as ${session.participants.get(socket.id)}`
    );
  };

  // Apply rate limiting and validation to the join-session event
  // Limit to 10 join attempts per minute per socket
  // Create a wrapper function that applies validation
  const validatedJoinSessionHandler = (...args: any[]) => {
    // Get the data object (usually the first argument)
    const data = args[0] || {};

    // Validate the data
    const validation = validateEventData("join-session", data);

    if (validation.valid) {
      // If valid, call the handler
      joinSessionHandler(data);
    } else {
      // If invalid, emit an error
      socket.emit("error", {
        message: validation.message || "Invalid data",
      });
    }
  };

  // Apply rate limiting to the validated handler
  applyRateLimit(socket, "join-session", validatedJoinSessionHandler, 10);

  // Handle chat messages with rate limiting and validation
  const sendMessageHandler = ({
    encryptedContent,
    signature,
  }: {
    encryptedContent: string;
    signature?: string;
  }) => {
    // Get the session for this socket
    const session = getSessionBySocketId(socket.id);

    if (!session) {
      socket.emit("error", {
        message: "You are not in a session or session expired",
      });
      return;
    }

    // Sanitize the encrypted content
    const sanitizedContent = sanitizeString(encryptedContent);

    // Get the sender's name
    const senderName = session.participants.get(socket.id) || "Unknown";

    // Create a new message
    const message: Message = {
      id: crypto.randomUUID(),
      sender: socket.id,
      encryptedContent: sanitizedContent,
      timestamp: Date.now(),
      signature: signature, // Include the signature if provided
    };

    // Broadcast the message to all participants in the session
    io.to(session.code).emit("new-message", {
      id: message.id,
      sender: socket.id,
      senderName: senderName,
      encryptedContent: message.encryptedContent,
      timestamp: message.timestamp,
      signature: message.signature, // Include the signature if provided
    });

    console.log(
      `Message broadcast to session ${session.code} with ${session.participants.size} participants`
    );
  };

  // Apply rate limiting and validation to the send-message event
  // Limit to 60 messages per minute per socket (1 per second on average)
  // Create a wrapper function that applies validation
  const validatedSendMessageHandler = (...args: any[]) => {
    // Get the data object (usually the first argument)
    const data = args[0] || {};

    // Validate the data
    const validation = validateEventData("send-message", data);

    if (validation.valid) {
      // If valid, call the handler
      sendMessageHandler(data);
    } else {
      // If invalid, emit an error
      socket.emit("error", {
        message: validation.message || "Invalid data",
      });
    }
  };

  // Apply rate limiting to the validated handler
  applyRateLimit(socket, "send-message", validatedSendMessageHandler, 60);

  // Handle setting the session key with rate limiting and validation
  const setSessionKeyHandler = ({ sessionKey }: { sessionKey: string }) => {
    // Get the session for this socket
    const session = getSessionBySocketId(socket.id);

    if (!session) {
      socket.emit("error", {
        message: "You are not in a session or session expired",
      });
      return;
    }

    // Check if the user is the creator
    if (session.creatorId !== socket.id) {
      socket.emit("error", {
        message: "Only the session creator can set the session key",
      });
      return;
    }

    // Sanitize and set the session key
    const sanitizedKey = sanitizeString(sessionKey);
    const keyUpdated = setSessionKey(session.code, sanitizedKey);

    if (keyUpdated) {
      // If this is a key rotation, notify all participants
      if (session.previousKeys && session.previousKeys.length > 0) {
        // Notify all participants about the key rotation
        // Send the new key to all participants except the creator
        socket.to(session.code).emit("key-rotated", {
          message: "The session encryption key has been rotated for security",
          sessionKey: sanitizedKey, // Send the new key to other participants
        });
      }

      console.log(`Session key set for session ${session.code}`);
    } else {
      socket.emit("error", {
        message: "Failed to set session key",
      });
    }
  };

  // Apply rate limiting and validation to the set-session-key event
  // Limit to 5 key setting attempts per minute
  // Create a wrapper function that applies validation
  const validatedSetSessionKeyHandler = (...args: any[]) => {
    // Get the data object (usually the first argument)
    const data = args[0] || {};

    // Validate the data
    const validation = validateEventData("set-session-key", data);

    if (validation.valid) {
      // If valid, call the handler
      setSessionKeyHandler(data);
    } else {
      // If invalid, emit an error
      socket.emit("error", {
        message: validation.message || "Invalid data",
      });
    }
  };

  // Apply rate limiting to the validated handler
  applyRateLimit(socket, "set-session-key", validatedSetSessionKeyHandler, 5);

  // End the session (only creator can do this) with rate limiting
  const endSessionHandler = () => {
    // Get the session for this socket
    const session = getSessionBySocketId(socket.id);

    if (!session) {
      socket.emit("error", {
        message: "You are not in a session or session expired",
      });
      return;
    }

    // Check if the user is the creator
    if (session.creatorId !== socket.id) {
      socket.emit("error", {
        message: "Only the session creator can end the session",
      });
      return;
    }

    // Notify all participants that the session has ended
    io.to(session.code).emit("session-ended", {
      message: "The session has been ended by the creator",
    });

    // End the session using the session manager
    endSession(session.code);

    console.log(`Session ${session.code} ended by creator ${socket.id}`);
  };

  // Apply rate limiting to the end-session event
  // Limit to 5 end session attempts per minute
  applyRateLimit(socket, "end-session", endSessionHandler, 5);

  // Leave the session with rate limiting
  const leaveSessionHandler = () => {
    // Leave the session using the session manager
    leaveSession(socket.id, io);
  };

  // Apply rate limiting to the leave-session event
  // Limit to 10 leave session attempts per minute
  applyRateLimit(socket, "leave-session", leaveSessionHandler, 10);

  // Handle key rotation request
  const handleKeyRotation = () => {
    // Get the session for this socket
    const session = getSessionBySocketId(socket.id);

    if (!session) {
      socket.emit("error", {
        message: "You are not in a session or session expired",
      });
      return;
    }

    // Check if the user is the creator
    if (session.creatorId !== socket.id) {
      socket.emit("error", {
        message: "Only the session creator can rotate the session key",
      });
      return;
    }

    // Notify the creator to generate and set a new key
    socket.emit("generate-new-key", {
      message: "Please generate and set a new session key",
    });

    console.log(`Key rotation requested for session ${session.code}`);
  };

  // Apply rate limiting to the rotate-key event
  // Limit to 5 key rotation attempts per minute
  applyRateLimit(socket, "rotate-key", handleKeyRotation, 5);

  // Handle disconnections
  socket.on("disconnect", () => {
    // Leave the session using the session manager
    leaveSession(socket.id, io);

    // Clean up rate limit data
    cleanupRateLimit(socket.id);

    console.log(`User disconnected: ${socket.id}`);
  });
});

// Use environment variables for configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";

// Log the environment
console.log(`Server running in ${NODE_ENV} mode`);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
