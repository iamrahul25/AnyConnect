import React, { useEffect, useRef, useState } from 'react'
import './CallPage.css'

// ChatMessages component with auto-scroll
function ChatMessages({ messages }) {
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="chat-messages" id="chat-messages">
      {messages.map((m, i) => (
        <div key={i} className={`chat-message ${m.from}`}>
          <span className="message-sender">
            {m.senderName || (m.from === 'you' ? 'You' : m.from === 'partner' ? 'Partner' : 'System')}
          </span>
          <span className="message-text">{m.text}</span>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

export default function CallPage({ ws, userId, userName, queueCount, onEndCall }) {
  const [matched, setMatched] = useState(false)
  const [peerId, setPeerId] = useState(null)
  const [peerUsername, setPeerUsername] = useState(null)
  const [initiator, setInitiator] = useState(false)
  const [messages, setMessages] = useState([])
  const [isConnecting, setIsConnecting] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const dataChannelRef = useRef(null)
  const wsRef = useRef(ws)
  const pendingCandidatesRef = useRef([])
  const isProcessingNextRef = useRef(false)

  useEffect(() => {
    wsRef.current = ws
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Request to be matched
      ws.send(JSON.stringify({ type: 'ready' }))
      setIsConnecting(true)
    }
  }, [ws])

  useEffect(() => {
    if (!ws) return

    const handleMessage = (ev) => {
      const msg = JSON.parse(ev.data)
      
      if (msg.type === 'matched') {
        // Only process match if we're not processing a next request
        if (isProcessingNextRef.current) {
          // If we're processing next, requeue ourselves
          setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'ready' }))
            }
          }, 100)
          return
        }
        setMatched(true)
        setPeerId(msg.peerId)
        setPeerUsername(msg.peerUsername || 'Guest')
        setInitiator(!!msg.initiator)
        setIsConnecting(false)
        appendSystem(`${msg.peerUsername || 'Guest'} (${msg.peerId.substring(0, 8)}...) connected`)
        startCall(msg.initiator, msg.peerId)
      }
      
      if (msg.type === 'signal') {
        handleSignal(msg.from, msg.data)
      }
      
      if (msg.type === 'partner_left') {
        const peerName = peerUsername || 'Partner'
        appendSystem(`${peerName} disconnected`)
        // Only call handleNext if not already processing
        if (!isProcessingNextRef.current) {
          handleNext()
        }
      }
    }

    ws.addEventListener('message', handleMessage)
    return () => ws.removeEventListener('message', handleMessage)
  }, [ws])

  useEffect(() => {
    return () => {
      cleanupPeer()
    }
  }, [])

  function sendWs(obj) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj))
    }
  }

  function appendSystem(text) {
    setMessages((m) => [...m, { from: 'system', text, timestamp: new Date() }])
  }

  function appendMessage(from, text, senderName = null) {
    setMessages((m) => [...m, { from, text, senderName, timestamp: new Date() }])
  }

  async function startCall(isInitiator, remotePeerId) {
    // Prevent starting a new call if we're processing a next request
    if (isProcessingNextRef.current) {
      console.log('Skipping startCall - processing next request')
      return
    }

    // Clean up any existing connection first
    if (pcRef.current) {
      try {
        pcRef.current.close()
      } catch (e) {}
      pcRef.current = null
    }

    // Stop any existing stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      })
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc

      // Add local tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })

      // Handle remote stream
      pc.ontrack = (e) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0]
        }
        appendSystem('Video connected!')
      }

      // Handle ICE candidates
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendWs({ 
            type: 'signal', 
            to: remotePeerId, 
            data: { type: 'candidate', candidate: e.candidate } 
          })
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || 
            pc.iceConnectionState === 'failed') {
          appendSystem('Connection lost')
        }
      }

      // Setup data channel for chat
      if (isInitiator) {
        const dc = pc.createDataChannel('chat')
        setupDataChannel(dc)
        dataChannelRef.current = dc

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        sendWs({ 
          type: 'signal', 
          to: remotePeerId, 
          data: { type: 'offer', sdp: offer } 
        })
      } else {
        pc.ondatachannel = (e) => {
          dataChannelRef.current = e.channel
          setupDataChannel(e.channel)
        }
      }
    } catch (err) {
      console.error('Error starting call:', err)
      appendSystem('Failed to access camera/microphone')
      alert('Please allow camera and microphone access to use this app')
    }
  }

  function setupDataChannel(dc) {
    dc.onopen = () => {
      appendSystem('Chat connected')
    }
    dc.onmessage = (e) => {
      appendMessage('partner', e.data, peerUsername || 'Partner')
    }
    dc.onclose = () => {
      appendSystem('Chat disconnected')
    }
  }

  async function applyPendingCandidates() {
    const pc = pcRef.current
    if (!pc || pendingCandidatesRef.current.length === 0) return

    // Only apply if remote description is set
    if (pc.remoteDescription) {
      while (pendingCandidatesRef.current.length > 0) {
        const candidate = pendingCandidatesRef.current.shift()
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          console.warn('addIceCandidate failed for pending candidate', e)
        }
      }
    }
  }

  async function handleSignal(from, data) {
    const pc = pcRef.current
    if (!data || !pc) return

    try {
      if (data.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        // Apply any pending candidates after setting remote description
        await applyPendingCandidates()
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        sendWs({ 
          type: 'signal', 
          to: from, 
          data: { type: 'answer', sdp: answer } 
        })
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        // Apply any pending candidates after setting remote description
        await applyPendingCandidates()
      } else if (data.type === 'candidate') {
        // Check if remote description is set before adding candidate
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          } catch (e) {
            console.warn('addIceCandidate failed', e)
          }
        } else {
          // Queue the candidate if remote description is not set yet
          pendingCandidatesRef.current.push(data.candidate)
        }
      }
    } catch (err) {
      console.error('Error handling signal:', err)
    }
  }

  function cleanupPeer() {
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close()
      } catch (e) {}
      dataChannelRef.current = null
    }
    
    if (pcRef.current) {
      try {
        // Remove all tracks before closing
        pcRef.current.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop()
          }
        })
        pcRef.current.close()
      } catch (e) {}
      pcRef.current = null
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null
    }
    
    // Clear pending candidates
    pendingCandidatesRef.current = []
    
    setMatched(false)
    setPeerId(null)
    setPeerUsername(null)
    setInitiator(false)
  }

  function handleNext() {
    // Prevent multiple concurrent next requests
    if (isProcessingNextRef.current) {
      console.log('handleNext: Already processing, skipping')
      return
    }

    console.log('handleNext: Starting next request')
    isProcessingNextRef.current = true
    setIsConnecting(true)
    
    // Clean up current connection first
    cleanupPeer()
    setMatched(false)
    setPeerUsername(null)
    setMessages([])
    
    // Send next request to server
    sendWs({ type: 'next' })
    
    // Request new match after a short delay to ensure cleanup is complete
    setTimeout(() => {
      isProcessingNextRef.current = false
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('handleNext: Sending ready request')
        wsRef.current.send(JSON.stringify({ type: 'ready' }))
      }
    }, 500)
  }

  function sendChat(text) {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(text)
      appendMessage('you', text, userName || 'You')
    }
  }

  function toggleVideo() {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setVideoEnabled(videoTrack.enabled)
      }
    }
  }

  function toggleAudio() {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setAudioEnabled(audioTrack.enabled)
      }
    }
  }

  function handleEndCall() {
    sendWs({ type: 'leave' })
    cleanupPeer()
    onEndCall()
  }

  return (
    <div className="call-page">
      <div className="call-header">
        <div className="header-left">
          <h2>AnyConnect</h2>
          <div className="debug-info">
            <span className="debug-label">{userName || 'You'}:</span>
            <span className="debug-uuid">{userId ? userId.substring(0, 8) + '...' : 'Connecting...'}</span>
            {peerId && peerUsername && (
              <>
                <span className="debug-separator">|</span>
                <span className="debug-label">{peerUsername}:</span>
                <span className="debug-uuid">{peerId.substring(0, 8) + '...'}</span>
              </>
            )}
          </div>
        </div>
        <button className="end-call-button" onClick={handleEndCall}>
          End Call
        </button>
      </div>

      <div className="video-container">
        <div className="video-wrapper remote-video">
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="video remote"
          />
          {isConnecting && !matched && (
            <div className="connecting-overlay">
              <div className="spinner"></div>
              <p>Connecting to someone...</p>
            </div>
          )}
          {matched && !remoteVideoRef.current?.srcObject && (
            <div className="connecting-overlay">
              <div className="spinner"></div>
              <p>Waiting for partner...</p>
            </div>
          )}
          <div className="video-label">{peerUsername || 'Partner'}</div>
        </div>

        <div className="video-wrapper local-video">
          <video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline 
            className="video local"
          />
          <div className="video-label">{userName || 'You'}</div>
        </div>
      </div>

      <div className="call-controls">
        <button 
          className={`control-button ${!videoEnabled ? 'disabled' : ''}`}
          onClick={toggleVideo}
          title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {videoEnabled ? '📹' : '📹🚫'}
        </button>
        <button 
          className={`control-button ${!audioEnabled ? 'disabled' : ''}`}
          onClick={toggleAudio}
          title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          {audioEnabled ? '🎤' : '🎤🚫'}
        </button>
        <button 
          className="control-button next-button"
          onClick={handleNext}
          disabled={isConnecting}
        >
          Next ⏭️
        </button>
      </div>

      <div className="chat-container">
        <div className="chat-header">Chat</div>
        <ChatMessages messages={messages} />
        <ChatInput onSend={sendChat} disabled={!matched} />
      </div>
    </div>
  )
}

function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState('')

  function submit(e) {
    e.preventDefault()
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
  }

  return (
    <form className="chat-input-form" onSubmit={submit}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={disabled ? "Waiting for connection..." : "Type a message..."}
        disabled={disabled}
        className="chat-input"
      />
      <button type="submit" disabled={disabled || !value.trim()} className="chat-send-button">
        Send
      </button>
    </form>
  )
}

