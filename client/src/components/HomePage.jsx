import React from 'react'
import './HomePage.css'

export default function HomePage({ onlineCount, queueCount, onStartCall, ws, userId }) {
  const handleStart = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      onStartCall()
    } else {
      alert('Not connected to server. Please wait...')
    }
  }

  return (
    <div className="home-page">
      <div className="home-container">
        <div className="home-header">
          <h1 className="home-title">AnyConnect</h1>
          <p className="home-subtitle">Connect with people around the world</p>
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
            disabled={!ws || ws.readyState !== WebSocket.OPEN}
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


