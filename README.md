# Encrypted Ephemeral Group Chat

A real-time, end-to-end encrypted group chat web application focused on privacy, ephemeral communication, and ease of temporary access through a unique session code.

## Features

- **Chat Creation**: Create a new chat session with a unique 6-digit alphanumeric access code valid for 10 minutes.
- **Session Rules**: Messages are end-to-end encrypted and never stored on the server. All messages are held in memory only and automatically destroyed when the session ends.
- **Real-time Communication**: Real-time messaging using WebSockets for low-latency communication.
- **Privacy-Focused**: No chat logs or user data are persisted after session termination.
- **User-Friendly**: Modern UI built with React and Tailwind CSS.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Install server dependencies:

```bash
cd server
npm install
cd ..
```

### Running in Development Mode

You can start both the frontend and backend servers with a single command:

```bash
npm run start:dev
```

Or you can run them separately:

- Frontend: `npm run dev`
- Backend: `npm run server:dev`

The application will be available at http://localhost:5173 (or another port if 5173 is in use)

### Building for Production

#### Option 1: Using npm

```bash
# Build both client and server
npm run build
```

#### Option 2: Using the build script

For Windows:

```bash
# Run the build script
build.bat
```

For Linux/macOS:

```bash
# Make the script executable
chmod +x build.sh

# Run the build script
./build.sh
```

The build process will:

- Build the React frontend (creates the `dist` directory)
- Build the Node.js server (creates the `server/dist` directory)

### Running the Production Build

```bash
# Start the production server
npm start
```

This will start the Node.js server which will serve both the API and the static frontend files on http://localhost:3000.

## How It Works

1. **Creating a Chat**: Click "Create New Chat" to generate a unique 6-digit code.
2. **Joining a Chat**: Enter the 6-digit code to join an existing chat (valid for 10 minutes after creation).
3. **Chatting**: Messages are encrypted on the client side before being sent to the server.
4. **Session Termination**: The chat session ends when:
   - The creator manually ends the chat
   - All participants leave the session

## Security Features

- End-to-end encryption using AES
- No message storage on the server
- Ephemeral sessions with automatic cleanup
- Anonymous participants with randomly generated names

## Technologies Used

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, Socket.IO
- **Encryption**: CryptoJS

## Deployment

### Deploying to a VPS or Dedicated Server

1. Build the application:

   ```bash
   npm run build
   ```

2. Transfer the following directories/files to your server:

   - `dist/` (client build)
   - `server/dist/` (compiled server)
   - `server/package.json`

3. On your server:

   ```bash
   cd server
   npm install --production
   node dist/index.js
   ```

4. Use a process manager like PM2 to keep your application running:
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name ephemeral-chat
   ```

### Deploying to a Platform as a Service (PaaS)

You can also deploy to platforms like Heroku, Render, or Railway:

1. Build the application:

   ```bash
   npm run build
   ```

2. Create a Procfile in the root directory:

   ```
   web: node server/dist/index.js
   ```

3. Deploy to your preferred platform following their specific instructions.

## Environment Variables

- `PORT`: The port on which the server will run (default: 3000)
- `NODE_ENV`: The environment mode ('development' or 'production')
