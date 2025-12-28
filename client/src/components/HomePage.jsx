import React, { useState, useEffect } from 'react'

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#667eea] to-[#764ba2] p-[15px]">
      <div className="bg-white rounded-[15px] p-[45px_30px] max-w-[375px] w-full shadow-[0_15px_45px_rgba(0,0,0,0.3)] text-center md:p-[30px_22.5px] sm:p-[22.5px_15px]">
        <div className="mb-[30px]">
          <h1 className="text-[2.25rem] mb-[7.5px] bg-gradient-to-br from-[#667eea] to-[#764ba2] bg-clip-text text-transparent md:text-[1.875rem] sm:text-[1.5rem]">
            AnyConnect
          </h1>
          <p className="text-[0.825rem] text-gray-600 m-0 sm:text-[0.75rem]">
            Connect with people around the world
          </p>
          
          <div className="my-[18.75px_0_11.25px_0] text-left md:my-[15px_0_9px_0] sm:my-[11.25px_0_7.5px_0]">
            <label htmlFor="user-name-input" className="block text-[0.7125rem] text-gray-600 mb-[6px] font-medium sm:text-[0.675rem] sm:mb-[4.5px]">
              Your Name
            </label>
            <div className="flex gap-[6px] items-center">
              <input
                id="user-name-input"
                type="text"
                className="flex-1 p-[9px_12px] border-[1.5px] border-gray-300 rounded-[7.5px] text-[0.75rem] transition-all outline-none focus:border-[#667eea] focus:ring-[2.25px] focus:ring-[rgba(102,126,234,0.1)] md:text-[0.7125rem] md:p-[7.5px_10.5px] sm:text-[0.675rem] sm:p-[7.5px_9px]"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
              />
              <button 
                type="button"
                className="bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white border-none rounded-[7.5px] p-[9px_12px] text-[0.9rem] cursor-pointer transition-all min-w-[37.5px] hover:-translate-y-[1.5px] hover:shadow-[0_3px_9px_rgba(102,126,234,0.3)] active:translate-y-0 md:p-[7.5px_10.5px] md:text-[0.825rem] md:min-w-[33.75px] sm:p-[7.5px_9px] sm:text-[0.75rem] sm:min-w-[30px]"
                onClick={handleRandomName}
                title="Generate random name"
              >
                🎲
              </button>
            </div>
          </div>

          {userId && (
            <div className="flex items-center justify-center gap-[6px] mt-[11.25px] text-[0.6375rem] text-[rgba(102,126,234,0.8)] flex-wrap md:text-[0.6rem] sm:text-[0.5625rem] sm:gap-[4.5px]">
              <span className="font-medium text-gray-500">Your ID:</span>
              <span className="font-mono bg-[rgba(102,126,234,0.15)] p-[3px_7.5px] rounded-[4.5px] text-[#667eea] font-bold sm:p-[2.25px_6px] sm:text-[0.5625rem]">
                {userId.substring(0, 8) + '...'}
              </span>
            </div>
          )}
        </div>

        <div className="mb-[30px] flex gap-[15px] justify-center flex-wrap md:flex-col md:items-stretch">
          <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-[11.25px] p-[22.5px] text-white min-w-[150px] flex-1 max-w-[225px] md:max-w-full">
            <div className="text-[2.625rem] font-bold mb-[7.5px] md:text-[1.875rem] sm:text-[1.5rem]">
              {onlineCount}
            </div>
            <div className="text-[0.825rem] opacity-90 sm:text-[0.75rem]">
              Online Users
            </div>
          </div>
          <div className="bg-gradient-to-br from-[#f093fb] to-[#f5576c] rounded-[11.25px] p-[22.5px] text-white min-w-[150px] flex-1 max-w-[225px] md:max-w-full">
            <div className="text-[2.625rem] font-bold mb-[7.5px] md:text-[1.875rem] sm:text-[1.5rem]">
              {queueCount}
            </div>
            <div className="text-[0.825rem] opacity-90 sm:text-[0.75rem]">
              Waiting in Queue
            </div>
          </div>
        </div>

        <div className="mb-[30px]">
          <button 
            className="bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white border-none rounded-[37.5px] p-[13.5px_37.5px] text-[0.9rem] font-bold cursor-pointer transition-all inline-flex items-center gap-[7.5px] hover:-translate-y-[1.5px] hover:shadow-[0_7.5px_18.75px_rgba(102,126,234,0.4)] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed sm:p-[11.25px_30px] sm:text-[0.825rem]"
            onClick={handleStart}
            disabled={!ws || ws.readyState !== WebSocket.OPEN || !localName.trim()}
          >
            <span className="text-[1.125rem]">🎥</span>
            Start Calling
          </button>
        </div>

        <div className="text-gray-600 text-[0.7125rem] leading-[1.8]">
          <p className="my-[6px]">• Video and audio calling</p>
          <p className="my-[6px]">• Real-time chat support</p>
          <p className="my-[6px]">• Connect with random people</p>
          <p className="my-[6px]">• Click "Next" to meet someone new</p>
        </div>
      </div>
    </div>
  )
}
