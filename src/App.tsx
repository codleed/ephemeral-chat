import React from "react";
import { SocketProvider, useSocket } from "./contexts/SocketContext";
import Home from "./components/Home";
import ChatRoom from "./components/ChatRoom";

const AppContent: React.FC = () => {
  const { sessionCode } = useSocket();

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {sessionCode ? <ChatRoom /> : <Home />}
    </div>
  );
};

function App() {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
}

export default App;
