import React, { useState, useEffect } from 'react'
import './HomePage.css'

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

export default function HomePage({ onlineCount, queueCount, onStartCall, ws, userId, userName, onUserNameChange }) {
  const [localName, setLocalName] = useState(userName || getRandomName())

  useEffect(() => {
    // Update parent when name changes
    if (onUserNameChange) {
      onUserNameChange(localName)
    }
  }, [localName, onUserNameChange])

  const handleStart = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (localName.trim()) {
        onStartCall()
      } else {
        alert('Please enter a name')
      }
    } else {
      alert('Not connected to server. Please wait...')
    }
  }

  const handleRandomName = () => {
    const newName = getRandomName()
    setLocalName(newName)
  }

  return (
    <div className="home-page">
      <div className="home-container">
        <div className="home-header">
          <h1 className="home-title">AnyConnect</h1>
          <p className="home-subtitle">Connect with people around the world</p>
          
          <div className="name-input-container">
            <label htmlFor="user-name-input" className="name-label">Your Name</label>
            <div className="name-input-wrapper">
              <input
                id="user-name-input"
                type="text"
                className="name-input"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
              />
              <button 
                type="button"
                className="random-name-button"
                onClick={handleRandomName}
                title="Generate random name"
              >
                🎲
              </button>
            </div>
          </div>

          {userId && (
            <div className="debug-info-home">
              <span className="debug-label">Your ID:</span>
              <span className="debug-uuid">{userId.substring(0, 8) + '...'}</span>
            </div>
          )}
        </div>

        <div className="home-stats">
          <div className="stat-card">
            <div className="stat-value">{onlineCount}</div>
            <div className="stat-label">Online Users</div>
          </div>
          <div className="stat-card stat-card-queue">
            <div className="stat-value">{queueCount}</div>
            <div className="stat-label">Waiting in Queue</div>
          </div>
        </div>

        <div className="home-actions">
          <button 
            className="start-button"
            onClick={handleStart}
            disabled={!ws || ws.readyState !== WebSocket.OPEN || !localName.trim()}
          >
            <span className="button-icon">🎥</span>
            Start Calling
          </button>
        </div>

        <div className="home-info">
          <p>• Video and audio calling</p>
          <p>• Real-time chat support</p>
          <p>• Connect with random people</p>
          <p>• Click "Next" to meet someone new</p>
        </div>
      </div>
    </div>
  )
}


