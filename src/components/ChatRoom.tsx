import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../contexts/SocketContext";
import { decryptMessage } from "../utils/encryption";

interface Message {
  id: string;
  sender: string;
  senderName: string;
  content: string;
  timestamp: number;
  isMe: boolean;
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
  } = useSocket();

  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Process incoming messages from socket context
  useEffect(() => {
    if (!socketMessages || !socket || !sessionKey) return;

    console.log("Socket messages updated:", socketMessages);

    const processedMessages = socketMessages.map((msg) => {
      // For debugging
      console.log("Processing message:", msg);

      let content;
      try {
        // Try to decrypt the message
        content = decryptMessage(msg.encryptedContent, sessionKey);
        console.log("Decrypted content:", content);
      } catch (error) {
        console.error("Failed to decrypt message:", error);
        // If decryption fails, just use the encrypted content
        content = msg.encryptedContent;
      }

      return {
        id: msg.id,
        sender: msg.sender,
        senderName: msg.senderName || "Unknown",
        content: content,
        timestamp: msg.timestamp,
        isMe: msg.sender === socket.id,
      };
    });

    console.log("Processed messages:", processedMessages);
    setLocalMessages(processedMessages);
  }, [socketMessages, socket, sessionKey]);

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
                    <div className="text-xs mb-1">
                      {message.isMe ? "You" : message.senderName}
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
