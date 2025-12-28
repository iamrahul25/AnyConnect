import React, { useState, useEffect, useRef } from 'react'
import HomePage from './components/HomePage'
import CallPage from './components/CallPage'

// Get signaling server URL from environment variable
// Vite requires VITE_ prefix for environment variables
const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER_URL || 'ws://localhost:4001'

// List of random meaningful names
const RANDOM_NAMES = [
  'John', 'Spider', 'Monkey', 'Lion', 'Hima', 'Tiger', 'Eagle', 'Wolf', 
  'Bear', 'Fox', 'Dragon', 'Phoenix', 'Shark', 'Falcon', 'Panther', 'Hawk',
  'Raven', 'Cobra', 'Jaguar', 'Leopard', 'Stallion', 'Thunder', 'Storm', 'Blaze',
  'Shadow', 'Nova', 'Apex', 'Zenith', 'Vortex', 'Nexus', 'Orion', 'Atlas'
]

function getRandomName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]
}

export default function App() {
  const [ws, setWs] = useState(null)
  const [onlineCount, setOnlineCount] = useState(0)
  const [queueCount, setQueueCount] = useState(0)
  const [isInCall, setIsInCall] = useState(false)
  const [userId, setUserId] = useState(null)
  const [userName, setUserName] = useState(getRandomName())

  useEffect(() => {
    // Connect to signaling server on mount
    const socket = new WebSocket(SIGNALING_SERVER)
    
    socket.onopen = () => {
      console.log('Connected to signaling server')
      setWs(socket)
    }

    socket.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'id') {
        setUserId(msg.id)
        // Send username to server after receiving ID
        if (userName) {
          socket.send(JSON.stringify({ type: 'setUsername', username: userName }))
        }
      }
      if (msg.type === 'onlineCount') {
        setOnlineCount(msg.count)
        if (msg.queueCount !== undefined) {
          setQueueCount(msg.queueCount)
        }
      }
      if (msg.type === 'queueCount') {
        setQueueCount(msg.count)
      }
    }

    socket.onclose = () => {
      console.log('Disconnected from signaling server')
      setWs(null)
    }

    socket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
    }
  }, [])

  const handleStartCall = () => {
    // Send username to server before starting call
    if (ws && ws.readyState === WebSocket.OPEN && userName) {
      ws.send(JSON.stringify({ type: 'setUsername', username: userName }))
    }
    setIsInCall(true)
  }

  const handleEndCall = () => {
    setIsInCall(false)
  }

  const handleUserNameChange = (newName) => {
    setUserName(newName)
    // Update username on server if connected
    if (ws && ws.readyState === WebSocket.OPEN && newName) {
      ws.send(JSON.stringify({ type: 'setUsername', username: newName }))
    }
  }

  return (
    <div className="app">
      {!isInCall ? (
        <HomePage 
          onlineCount={onlineCount}
          queueCount={queueCount}
          onStartCall={handleStartCall}
          ws={ws}
          userId={userId}
          userName={userName}
          onUserNameChange={handleUserNameChange}
        />
      ) : (
        <CallPage 
          ws={ws}
          userId={userId}
          userName={userName}
          queueCount={queueCount}
          onEndCall={handleEndCall}
        />
      )}
    </div>
  )
}
