import React, { useState } from 'react';
import { useSocket } from '../contexts/SocketContext';

const Home: React.FC = () => {
  const { createSession, joinSession } = useSocket();
  const [joinCode, setJoinCode] = useState('');
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ephemeral Chat</h1>
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
              <span className="px-2 text-gray-500 bg-white dark:bg-gray-800">Or join existing</span>
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
                  <label htmlFor="code" className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
          <p>All messages are end-to-end encrypted and never stored on the server.</p>
          <p className="mt-1">Chat sessions automatically terminate when all participants leave.</p>
        </div>
      </div>
    </div>
  );
};

export default Home;
