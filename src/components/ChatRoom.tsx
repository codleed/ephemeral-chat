import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { decryptMessage, verifySignature } from "../utils/encryption";

interface Message {
  id: string;
  sender: string;
  senderName: string;
  content: string;
  timestamp: number;
  isMe: boolean;
  verified?: boolean; // Whether the message signature was verified
}

const ChatRoom: React.FC = () => {
  const {
    sessionCode,
    // anonymousName not used but kept as comment for reference
    participants,
    sessionKey,
    messages: socketMessages,
    leaveSession,
    endSession,
    sendMessage,
    socket,
    setSessionKey, // Add this to handle key rotation
  } = useSocket();

  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get previous keys from the server
  const [previousKeys, setPreviousKeys] = useState<string[]>([]);

  // Listen for key rotation events
  useEffect(() => {
    if (!socket) return;

    const handleKeyRotated = (data: {
      message: string;
      sessionKey?: string;
    }) => {
      console.log("Key rotation event:", data.message);

      // If we have a current key, add it to previous keys before updating
      if (sessionKey) {
        setPreviousKeys((prev) => [sessionKey, ...prev.slice(0, 2)]); // Keep only last 3 keys
      }

      // Update to the new key if provided
      if (data.sessionKey) {
        setSessionKey(data.sessionKey);
        localStorage.setItem("sessionKey", data.sessionKey);
      }
    };

    socket.on("key-rotated", handleKeyRotated);

    return () => {
      socket.off("key-rotated", handleKeyRotated);
    };
  }, [socket, sessionKey, setSessionKey]);

  // Process incoming messages from socket context
  useEffect(() => {
    if (!socketMessages || !socket || !sessionKey) {
      console.log("Missing dependencies:", {
        hasSocketMessages: !!socketMessages,
        hasSocket: !!socket,
        hasSessionKey: !!sessionKey,
        socketMessagesLength: socketMessages?.length || 0,
      });
      return;
    }

    console.log("Socket messages updated:", socketMessages);

    const processedMessages = socketMessages.map((msg) => {
      // For debugging
      console.log("Processing message:", msg);

      let content;
      let verified = false;
      let decryptionSuccessful = false;

      // Try to decrypt with current key first
      try {
        content = decryptMessage(msg.encryptedContent, sessionKey);
        decryptionSuccessful = true;
        console.log("Decrypted content with current key:", content);

        // Verify the message signature if available
        if (msg.signature && content) {
          try {
            verified = verifySignature(content, msg.signature, sessionKey);
            console.log("Signature verification result:", verified);
          } catch (sigError) {
            console.error("Signature verification error:", sigError);
            verified = false;
          }
        }
      } catch (error) {
        console.error(
          "Failed to decrypt with current key, trying previous keys:",
          error
        );

        // If decryption with current key fails, try with previous keys
        if (previousKeys.length > 0) {
          for (const prevKey of previousKeys) {
            try {
              content = decryptMessage(msg.encryptedContent, prevKey);
              decryptionSuccessful = true;
              console.log("Decrypted content with previous key:", content);

              // Verify signature with the same key that successfully decrypted
              if (msg.signature && content) {
                try {
                  verified = verifySignature(content, msg.signature, prevKey);
                  console.log(
                    "Signature verification with previous key result:",
                    verified
                  );
                } catch (sigError) {
                  console.error(
                    "Signature verification with previous key error:",
                    sigError
                  );
                  verified = false;
                }
              }

              // Break the loop if decryption is successful
              break;
            } catch (prevKeyError) {
              console.error(
                "Failed to decrypt with previous key:",
                prevKeyError
              );
              // Continue to the next previous key
            }
          }
        }

        // If all decryption attempts fail, show an error message
        if (!decryptionSuccessful) {
          content = "[Encrypted message - Unable to decrypt]";
        }
      }

      return {
        id: msg.id,
        sender: msg.sender,
        senderName: msg.senderName || "Unknown",
        content: content,
        timestamp: msg.timestamp,
        isMe: msg.sender === socket.id,
        verified: verified,
      };
    });

    console.log("Processed messages:", processedMessages);
    setLocalMessages(processedMessages);
  }, [socketMessages, socket, sessionKey, previousKeys]);

  // Join window timer has been removed

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !sessionKey) return;

    // Send the plain text message - it will be encrypted in the sendMessage function
    sendMessage(newMessage);

    // The message will be added to the messages state via the socket event
    // Just clear the input field
    setNewMessage("");
  };

  const handleLeaveChat = () => {
    if (confirm("Are you sure you want to leave this chat?")) {
      leaveSession();
    }
  };

  const handleEndChat = () => {
    if (
      confirm("Are you sure you want to end this chat for all participants?")
    ) {
      endSession();
    }
  };

  const isCreator = participants.some((p) => p.isCreator);

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <img
                src="/security-logo.svg"
                alt="Security Logo"
                className="h-8 w-8 mr-2"
              />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Ephemeral Chat
              </h1>
              {sessionCode && (
                <div className="ml-4 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-md">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Code: {sessionCode}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {isCreator ? (
                <button
                  onClick={handleEndChat}
                  className="px-3 py-1 text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  End Chat
                </button>
              ) : (
                <button
                  onClick={handleLeaveChat}
                  className="px-3 py-1 text-white bg-gray-600 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                >
                  Leave Chat
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat messages */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 shadow-xl">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {console.log("Rendering messages, count:", localMessages.length)}
            {localMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 dark:text-gray-400">
                  No messages yet. Start the conversation!
                </p>
              </div>
            ) : (
              localMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.isMe ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-xs sm:max-w-md px-4 py-2 rounded-lg ${
                      message.isMe
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white"
                    }`}
                  >
                    <div className="text-xs mb-1 flex justify-between">
                      <span>{message.isMe ? "You" : message.senderName}</span>
                      {message.verified !== undefined && (
                        <span
                          title={
                            message.verified
                              ? "Message verified"
                              : "Message not verified"
                          }
                        >
                          {message.verified ? "✓" : "⚠️"}
                        </span>
                      )}
                    </div>
                    <p>{message.content}</p>
                    <div className="text-xs mt-1 text-right opacity-70">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <div className="border-t dark:border-gray-700 p-4">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Participants sidebar */}
        <div className="hidden md:block w-64 bg-gray-50 dark:bg-gray-900 p-4 border-l dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Participants ({participants.length}/10)
          </h2>
          <ul className="space-y-2">
            {participants.map((participant) => (
              <li key={participant.id} className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-gray-700 dark:text-gray-300">
                  {participant.name} {participant.isCreator && "(Creator)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
