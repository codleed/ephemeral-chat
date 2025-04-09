import { Server } from "socket.io";
import crypto from "crypto";

// Session interface with enhanced security features
export interface Session {
  id: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  creatorId: string;
  participants: Map<string, string>; // socketId -> anonymousName
  sessionKey: string; // Shared encryption key
  lastActivity: number; // Track last activity for idle timeout
  keyRotationTime?: number; // Time when the session key was last rotated
  previousKeys: string[]; // Store previous keys for message decryption during transition
  maxParticipants: number; // Maximum number of participants allowed
  isRevoked: boolean; // Flag to indicate if the session has been revoked for security reasons
}

export interface Message {
  id: string;
  sender: string;
  encryptedContent: string;
  timestamp: number;
  signature?: string;
}

// Session configuration with enhanced security settings
const SESSION_EXPIRY = 10 * 60 * 1000; // 10 minutes in milliseconds
const SESSION_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes of inactivity
const KEY_ROTATION_INTERVAL = 15 * 60 * 1000; // 15 minutes for key rotation
const MAX_PREVIOUS_KEYS = 3; // Maximum number of previous keys to store
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute in milliseconds
const DEFAULT_MAX_PARTICIPANTS = 10; // Default maximum participants per session

// Store active sessions in memory
const activeSessions = new Map<string, Session>(); // code -> session
const socketToSession = new Map<string, string>(); // socketId -> sessionCode

// Generate a random 6-digit alphanumeric code
export function generateSessionCode(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
}

// Generate a random anonymous name for participants
export function generateAnonymousName(): string {
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

// Create a new session with enhanced security
export function createSession(
  creatorId: string,
  maxParticipants: number = DEFAULT_MAX_PARTICIPANTS
): Session {
  let code = generateSessionCode();

  // Ensure the code is unique
  while (activeSessions.has(code)) {
    code = generateSessionCode();
  }

  const now = Date.now();
  const session: Session = {
    id: crypto.randomUUID(),
    code,
    createdAt: now,
    expiresAt: now + SESSION_EXPIRY,
    creatorId,
    participants: new Map([[creatorId, generateAnonymousName()]]),
    sessionKey: "", // Will be set when the creator sends it
    lastActivity: now,
    previousKeys: [],
    maxParticipants: maxParticipants,
    isRevoked: false,
  };

  activeSessions.set(code, session);
  socketToSession.set(creatorId, code);

  return session;
}

// Join an existing session with enhanced security checks
export function joinSession(socketId: string, code: string): Session | null {
  const session = activeSessions.get(code);

  if (!session) {
    return null;
  }

  const now = Date.now();

  // Check if session has expired
  if (now > session.expiresAt) {
    // Clean up expired session
    endSession(session.code);
    return null;
  }

  // Check if session has been revoked for security reasons
  if (session.isRevoked) {
    return null;
  }

  // Check if session is idle
  if (now - session.lastActivity > SESSION_IDLE_TIMEOUT) {
    // End idle session
    endSession(session.code);
    return null;
  }

  // Check if session is full
  if (session.participants.size >= session.maxParticipants) {
    return null;
  }

  const anonymousName = generateAnonymousName();
  session.participants.set(socketId, anonymousName);
  socketToSession.set(socketId, code);

  // Update session activity and extend expiry
  session.lastActivity = now;
  session.expiresAt = now + SESSION_EXPIRY;

  return session;
}

// Get a session by code with enhanced security checks
export function getSession(code: string): Session | null {
  const session = activeSessions.get(code);

  if (!session) {
    return null;
  }

  const now = Date.now();

  // Check if session has expired
  if (now > session.expiresAt) {
    // Clean up expired session
    endSession(code);
    return null;
  }

  // Check if session has been revoked
  if (session.isRevoked) {
    return null;
  }

  // Check if session is idle
  if (now - session.lastActivity > SESSION_IDLE_TIMEOUT) {
    // End idle session
    endSession(code);
    return null;
  }

  // Check if key rotation is needed
  if (
    session.keyRotationTime &&
    now - session.keyRotationTime > KEY_ROTATION_INTERVAL
  ) {
    // Flag for key rotation - will be handled by the session creator
    console.log(`Session ${code} needs key rotation`);
  }

  // Update last activity
  session.lastActivity = now;

  return session;
}

// Get a session by socket ID
export function getSessionBySocketId(socketId: string): Session | null {
  const sessionCode = socketToSession.get(socketId);

  if (!sessionCode) {
    return null;
  }

  return getSession(sessionCode);
}

// Set the session key with enhanced security
export function setSessionKey(code: string, sessionKey: string): boolean {
  const session = activeSessions.get(code);

  if (!session) {
    return false;
  }

  const now = Date.now();

  // If there's an existing key, store it in previous keys for transition period
  if (session.sessionKey) {
    // Add current key to previous keys
    session.previousKeys.unshift(session.sessionKey);

    // Limit the number of previous keys
    if (session.previousKeys.length > MAX_PREVIOUS_KEYS) {
      session.previousKeys.pop();
    }
  }

  // Set the new key
  session.sessionKey = sessionKey;
  session.keyRotationTime = now;
  session.lastActivity = now;

  return true;
}

// Leave a session
export function leaveSession(socketId: string, io: Server): boolean {
  const sessionCode = socketToSession.get(socketId);

  if (!sessionCode) {
    return false;
  }

  const session = activeSessions.get(sessionCode);

  if (!session) {
    socketToSession.delete(socketId);
    return false;
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
    endSession(sessionCode);

    return true;
  }

  // Extend session expiry
  session.expiresAt = Date.now() + SESSION_EXPIRY;

  return true;
}

// End a session
export function endSession(code: string): boolean {
  const session = activeSessions.get(code);

  if (!session) {
    return false;
  }

  // Clean up session data
  for (const participantId of session.participants.keys()) {
    socketToSession.delete(participantId);
  }

  activeSessions.delete(code);

  return true;
}

// Start the session cleanup process with enhanced security checks
export function startSessionCleanup(io: Server): void {
  setInterval(() => {
    const now = Date.now();

    // Check for expired or idle sessions
    for (const [code, session] of activeSessions.entries()) {
      // Check for expired sessions
      if (now > session.expiresAt) {
        // Notify all participants that the session has expired
        io.to(code).emit("session-ended", {
          message: "The session has expired",
        });

        // Clean up session data
        endSession(code);
        continue;
      }

      // Check for idle sessions
      if (now - session.lastActivity > SESSION_IDLE_TIMEOUT) {
        // Notify all participants that the session has expired due to inactivity
        io.to(code).emit("session-ended", {
          message: "The session has ended due to inactivity",
        });

        // Clean up session data
        endSession(code);
        continue;
      }

      // Check if key rotation is needed
      if (
        session.keyRotationTime &&
        now - session.keyRotationTime > KEY_ROTATION_INTERVAL
      ) {
        // Notify the session creator that key rotation is needed
        io.to(session.creatorId).emit("key-rotation-needed", {
          message: "Session key rotation is needed for security",
        });
      }
    }
  }, CLEANUP_INTERVAL);
}

// Get all active sessions (for debugging)
export function getActiveSessions(): Map<string, Session> {
  return activeSessions;
}

// Get socket to session mapping (for debugging)
export function getSocketToSession(): Map<string, string> {
  return socketToSession;
}
