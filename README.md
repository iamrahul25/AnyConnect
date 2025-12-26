# AnyConnect - Video Chat App

A React web application similar to OmeTV/Omegle that allows users to connect with random people via peer-to-peer video and audio calls with real-time chat support.

## Features

- 🎥 **Video & Audio Calling**: Real-time peer-to-peer video and audio communication
- 💬 **Chat Support**: Text messaging alongside video calls
- 🔄 **Next Button**: Connect with new people instantly
- 👥 **Online Users Counter**: See how many users are online
- 🚀 **WebRTC**: Peer-to-peer connections (no server load for media)
- 🎨 **Modern UI**: Beautiful, responsive design

## Architecture

- **Client**: React + Vite frontend
- **Server**: Node.js WebSocket signaling server (only handles user matching and signaling)
- **WebRTC**: Peer-to-peer media connections (audio, video, and data)

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation & Setup

### 1. Install Server Dependencies

```bash
cd server
npm install
```

### 2. Install Client Dependencies

```bash
cd client
npm install
```

## Running the Application

### Start the Signaling Server

In the `server` directory:

```bash
npm start
```

The server will run on `ws://localhost:4000` by default.

### Start the Client

In the `client` directory (in a separate terminal):

```bash
npm run dev
```

The client will be available at `http://localhost:5173` (or the port shown by Vite).

## How to Use

1. **Home Page**: 
   - View the total number of online users
   - Click "Start Calling" to begin

2. **Call Page**:
   - Wait for the system to match you with another user
   - Once connected, you can see and hear each other
   - Use the chat panel on the side to send messages
   - Toggle video/audio using the control buttons
   - Click "Next" to connect with a different user
   - Click "End Call" to return to the home page

## Technical Details

- **Signaling Server**: WebSocket-based server that matches users and facilitates WebRTC signaling
- **WebRTC**: Uses STUN servers for NAT traversal (Google's public STUN servers)
- **Data Channel**: WebRTC data channel for peer-to-peer chat
- **Media Streams**: Direct peer-to-peer video and audio streams

## Production Considerations

For production deployment, consider:

- ✅ HTTPS/WSS (required for WebRTC in production)
- ✅ TURN servers (for users behind restrictive NATs/firewalls)
- ✅ Authentication and user management
- ✅ Rate limiting and abuse prevention
- ✅ Error handling and reconnection logic
- ✅ Content moderation
- ✅ Server-side logging and monitoring

## Project Structure

```
AnyConnect/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── HomePage.jsx
│   │   │   ├── HomePage.css
│   │   │   ├── CallPage.jsx
│   │   │   └── CallPage.css
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   └── package.json
├── server/
│   ├── index.js
│   └── package.json
└── README.md
```

## License

This project is for educational purposes.
