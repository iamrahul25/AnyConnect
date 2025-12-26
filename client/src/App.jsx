import React, { useState, useEffect, useRef } from 'react'
import HomePage from './components/HomePage'
import CallPage from './components/CallPage'

const SIGNALING_SERVER = 'ws://localhost:4001'

export default function App() {
  const [ws, setWs] = useState(null)
  const [onlineCount, setOnlineCount] = useState(0)
  const [queueCount, setQueueCount] = useState(0)
  const [isInCall, setIsInCall] = useState(false)
  const [userId, setUserId] = useState(null)

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
    setIsInCall(true)
  }

  const handleEndCall = () => {
    setIsInCall(false)
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
        />
      ) : (
        <CallPage 
          ws={ws}
          userId={userId}
          queueCount={queueCount}
          onEndCall={handleEndCall}
        />
      )}
    </div>
  )
}
