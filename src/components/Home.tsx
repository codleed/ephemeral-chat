import React, { useState } from "react";
import { useSocket } from "../contexts/SocketContext";

const Home: React.FC = () => {
  const { createSession, joinSession } = useSocket();
  const [joinCode, setJoinCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateSession = () => {
    createSession();
  };

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.length === 6) {
      joinSession(joinCode);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <img
              src="/security-logo.svg"
              alt="Security Logo"
              className="h-24 w-24"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Ephemeral Chat
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Secure, encrypted, and temporary group chats
          </p>
        </div>

        <div className="flex flex-col space-y-4">
          <button
            onClick={handleCreateSession}
            className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Create New Chat
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 text-gray-500 bg-white dark:bg-gray-800">
                Or join existing
              </span>
            </div>
          </div>

          <div>
            <button
              onClick={() => setIsJoining(!isJoining)}
              className="w-full px-4 py-2 text-gray-700 bg-gray-200 dark:text-gray-300 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Join with Code
            </button>

            {isJoining && (
              <form onSubmit={handleJoinSession} className="mt-4">
                <div className="flex flex-col space-y-2">
                  <label
                    htmlFor="code"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Enter 6-digit code
                  </label>
                  <input
                    type="text"
                    id="code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="XXXXXX"
                    maxLength={6}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={joinCode.length !== 6}
                    className="w-full px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Join Chat
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-center mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-1 text-green-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <p>
              <strong>End-to-End Encrypted</strong> - All messages are encrypted
              and never stored on the server
            </p>
          </div>
          <div className="flex items-center justify-center mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-1 text-green-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            <p>
              <strong>Ephemeral</strong> - Chat sessions automatically terminate
              when all participants leave
            </p>
          </div>
          <div className="flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 mr-1 text-green-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <p>
              <strong>Secure</strong> - Uses ECDH key exchange and AES-256
              encryption
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
