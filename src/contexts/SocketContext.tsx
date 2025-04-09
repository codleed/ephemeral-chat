import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  generateSessionKey,
  encryptMessage,
  // decryptMessage not used in this file
} from "../utils/encryption";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  sessionCode: string | null;
  sessionKey: string | null;
  anonymousName: string | null;
  participants: Participant[];
  messages: Message[];
  createSession: () => void;
  joinSession: (code: string) => void;
  leaveSession: () => void;
  endSession: () => void;
  sendMessage: (message: string) => void;
}

export interface Participant {
  id: string;
  name: string;
  isCreator: boolean;
}

interface Message {
  id: string;
  sender: string;
  senderName: string;
  encryptedContent: string;
  timestamp: number;
  decryptedContent?: string;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionCode, setSessionCode] = useState<string | null>(() => {
    return localStorage.getItem("sessionCode");
  });
  const [sessionKey, setSessionKey] = useState<string | null>(() => {
    return localStorage.getItem("sessionKey");
  });
  const [anonymousName, setAnonymousName] = useState<string | null>(() => {
    return localStorage.getItem("anonymousName");
  });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // Initialize socket connection
    const socketInstance = io("http://localhost:3000");
    setSocket(socketInstance);

    socketInstance.on("connect", () => {
      setIsConnected(true);

      // If we have session data in localStorage, try to rejoin the session
      const savedSessionCode = localStorage.getItem("sessionCode");
      if (savedSessionCode) {
        console.log("Attempting to rejoin session:", savedSessionCode);
        socketInstance.emit("join-session", { code: savedSessionCode });
      }
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
    });

    // Handle session creation response
    socketInstance.on("session-created", (data) => {
      // Save to state and localStorage
      setSessionCode(data.code);
      localStorage.setItem("sessionCode", data.code);

      setAnonymousName(data.anonymousName);
      localStorage.setItem("anonymousName", data.anonymousName);

      // Generate a new session key for encryption
      const newSessionKey = generateSessionKey();
      setSessionKey(newSessionKey);
      localStorage.setItem("sessionKey", newSessionKey);

      // Share the session key with the server
      socketInstance.emit("set-session-key", { sessionKey: newSessionKey });

      // Initialize participants with the creator
      if (socketInstance.id) {
        // Check if id exists
        setParticipants([
          {
            id: socketInstance.id,
            name: data.anonymousName,
            isCreator: true,
          },
        ]);
      }
    });

    // Handle session join response
    socketInstance.on("session-joined", (data) => {
      // Save to state and localStorage
      setSessionCode(data.code);
      localStorage.setItem("sessionCode", data.code);

      setAnonymousName(data.anonymousName);
      localStorage.setItem("anonymousName", data.anonymousName);

      // Use the session key provided by the server
      if (data.sessionKey) {
        setSessionKey(data.sessionKey);
        localStorage.setItem("sessionKey", data.sessionKey);
      }
    });

    // Handle participant list update
    socketInstance.on("participant-list", (data) => {
      setParticipants(data.participants);
    });

    // Handle new participant joining
    socketInstance.on("participant-joined", (data) => {
      setParticipants((prev) => [
        ...prev,
        {
          id: data.participantId,
          name: data.anonymousName,
          isCreator: false,
        },
      ]);
    });

    // Handle participant leaving
    socketInstance.on("participant-left", (data) => {
      setParticipants((prev) =>
        prev.filter((p) => p.id !== data.participantId)
      );
    });

    // Handle new messages
    socketInstance.on("new-message", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: data.id,
          sender: data.sender,
          senderName: data.senderName,
          encryptedContent: data.encryptedContent,
          timestamp: data.timestamp,
        },
      ]);
    });

    // Handle session ended
    socketInstance.on("session-ended", () => {
      // Clear state
      setSessionCode(null);
      setSessionKey(null);
      setAnonymousName(null);
      setParticipants([]);
      setMessages([]);

      // Clear localStorage
      localStorage.removeItem("sessionCode");
      localStorage.removeItem("sessionKey");
      localStorage.removeItem("anonymousName");
    });

    // Handle errors
    socketInstance.on("error", (error) => {
      console.error("Socket error:", error.message);
      // You could add toast notifications here
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const createSession = () => {
    if (socket && isConnected) {
      socket.emit("create-session");
    }
  };

  const joinSession = (code: string) => {
    if (socket && isConnected) {
      socket.emit("join-session", { code });
    }
  };

  const leaveSession = () => {
    if (socket && isConnected && sessionCode) {
      socket.emit("leave-session");

      // Clear state
      setSessionCode(null);
      setSessionKey(null);
      setAnonymousName(null);
      setParticipants([]);
      setMessages([]);

      // Clear localStorage
      localStorage.removeItem("sessionCode");
      localStorage.removeItem("sessionKey");
      localStorage.removeItem("anonymousName");
    }
  };

  const endSession = () => {
    if (socket && isConnected && sessionCode) {
      socket.emit("end-session");
    }
  };

  const sendMessage = (message: string) => {
    if (socket && isConnected && sessionCode && sessionKey) {
      // Use the actual encryption function from our utility
      const encryptedContent = encryptMessage(message, sessionKey);
      socket.emit("send-message", { encryptedContent });
      // We'll receive the message back from the server, so no need to add it locally
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        sessionCode,
        sessionKey,
        anonymousName,
        participants,
        messages,
        createSession,
        joinSession,
        leaveSession,
        endSession,
        sendMessage,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
