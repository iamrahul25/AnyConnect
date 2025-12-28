import React, { useEffect, useRef, useState } from 'react'
import { Video, VideoOff, Mic, MicOff, MessageSquare, Phone, SkipForward, Send, Smile } from 'lucide-react'

// ChatMessages component with auto-scroll
function ChatMessages({ messages }) {
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 md:p-3 space-y-1.5 md:space-y-2">
      {messages.map((m, i) => {
        if (m.from === 'system') {
          return (
            <div key={i} className="flex justify-center">
              <div className="bg-gray-700 text-gray-300 text-[8px] md:text-[9px] px-2 py-0.5 rounded-full italic">
                {m.text}
              </div>
            </div>
          )
        }
        const isMe = m.from === 'you'
        return (
          <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] md:max-w-[70%] rounded-lg p-1.5 md:p-2 ${
                isMe
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-100'
              }`}
            >
              <p className="break-words text-sm md:text-base">{m.text}</p>
              <p className={`text-[8px] md:text-[9px] mt-0.5 ${
                isMe ? 'text-blue-200' : 'text-gray-400'
              }`}>
                {formatTime(m.timestamp)}
              </p>
            </div>
          </div>
        )
      })}
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
  const [showChat, setShowChat] = useState(true)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const dataChannelRef = useRef(null)
  const wsRef = useRef(ws)
  const pendingCandidatesRef = useRef([])
  const isProcessingNextRef = useRef(false)
  const peerUsernameRef = useRef(null)

  const emojis = ['😊', '😂', '❤️', '👍', '👋', '🎉', '😎', '🔥', '✨', '💯', '😍', '🤔', '😢', '😮', '👏', '🙌']

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
        const peerName = msg.peerUsername || 'Guest'
        setPeerUsername(peerName)
        peerUsernameRef.current = peerName
        setInitiator(!!msg.initiator)
        setIsConnecting(false)
        appendSystem(`${peerName} (${msg.peerId.substring(0, 8)}...) connected`)
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

      // Setup data channel for chat - IMPORTANT: Set up handler BEFORE creating/processing offer
      if (isInitiator) {
        // Initiator creates the data channel
        const dc = pc.createDataChannel('chat', { ordered: true })
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
        // Non-initiator sets up handler to receive data channel
        // This MUST be set up before processing the offer
        pc.ondatachannel = (e) => {
          console.log('Data channel received:', e.channel.label)
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
    if (!dc) return
    
    dc.onopen = () => {
      console.log('Data channel opened, readyState:', dc.readyState)
      appendSystem('Chat connected')
    }
    
    dc.onmessage = (e) => {
      console.log('Received message:', e.data)
      const senderName = peerUsernameRef.current || 'Partner'
      appendMessage('partner', e.data, senderName)
    }
    
    dc.onerror = (e) => {
      console.error('Data channel error:', e)
      appendSystem('Chat error occurred')
    }
    
    dc.onclose = () => {
      console.log('Data channel closed')
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
        // Ensure data channel handler is set up before processing offer
        // This is critical - if the handler isn't set, we'll miss the data channel
        if (!pc.ondatachannel) {
          pc.ondatachannel = (e) => {
            console.log('Data channel received in handleSignal:', e.channel.label)
            dataChannelRef.current = e.channel
            setupDataChannel(e.channel)
          }
        }
        
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
    peerUsernameRef.current = null
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
      try {
        dataChannelRef.current.send(text)
        appendMessage('you', text, userName || 'You')
      } catch (err) {
        console.error('Error sending chat message:', err)
        appendSystem('Failed to send message')
      }
    } else {
      console.warn('Data channel not ready. State:', dataChannelRef.current?.readyState)
      appendSystem('Chat not connected yet')
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

  const isConnected = matched && !isConnecting

  return (
    <div className="w-full h-screen bg-gray-900 flex flex-col overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Video Section */}
        <div className="flex-1 relative bg-black min-h-0">
          {/* Other Person's Video (Main) */}
          <div className="w-full h-full relative">
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
              {isConnected ? (
                <>
                  <video 
                    ref={remoteVideoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                  {!remoteVideoRef.current?.srcObject && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-9 h-9 border-[3px] border-gray-600 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
                        <p className="text-gray-400">Waiting for partner...</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center">
                  <div className="w-9 h-9 border-[3px] border-gray-600 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
                  <p className="text-gray-400 text-lg mb-1.5">Connecting to someone...</p>
                  <p className="text-gray-500">Please wait...</p>
                </div>
              )}
            </div>

            {/* Your Video (Picture-in-Picture) */}
            <div className="absolute bottom-2 right-2 md:bottom-3 md:right-3 w-32 h-24 md:w-48 md:h-36 bg-gray-700 rounded-lg overflow-hidden border-[1.5px] border-gray-600 shadow-lg">
              <div className="w-full h-full flex items-center justify-center relative">
                {videoEnabled ? (
                  <video 
                    ref={localVideoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <VideoOff className="w-6 h-6 md:w-9 md:h-9 text-gray-500 mx-auto mb-1 md:mb-1.5" />
                    <p className="text-gray-400 text-[10px] md:text-xs">Video Off</p>
                  </div>
                )}
              </div>
              <div className="absolute bottom-1 left-1 md:bottom-1.5 md:left-1.5 bg-black bg-opacity-70 text-white px-1 md:px-1.5 py-0.5 rounded text-[8px] md:text-[9px]">
                {userName || 'You'}
              </div>
            </div>

            {/* Connection Status */}
            {isConnected && (
              <div className="absolute top-2 left-2 md:top-3 md:left-3 bg-green-500 text-white px-2 py-0.5 rounded-full text-[10px] md:text-xs flex items-center gap-1 md:gap-1.5">
                <span className="w-1 h-1 md:w-1.5 md:h-1.5 bg-white rounded-full animate-pulse"></span>
                Connected
              </div>
            )}

            {/* Remote Video Label */}
            {peerUsername && (
              <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3 bg-black bg-opacity-70 text-white px-2 py-0.5 rounded-full text-[10px] md:text-xs">
                {peerUsername}
              </div>
            )}
          </div>
        </div>

        {/* Chat Section */}
        {showChat && (
          <div className="w-full md:w-72 h-64 md:h-auto bg-gray-800 flex flex-col border-t md:border-t-0 md:border-l border-gray-700">
            {/* Chat Header */}
            <div className="p-2 md:p-3 bg-gray-900 border-b border-gray-700 flex-shrink-0">
              <h2 className="text-white flex items-center gap-1.5 text-sm md:text-base">
                <MessageSquare className="w-3.5 h-3.5 md:w-4 md:h-4" />
                Chat
              </h2>
            </div>

            {/* Messages Area */}
            <ChatMessages messages={messages} />

            {/* Message Input */}
            <ChatInput 
              onSend={sendChat} 
              disabled={!matched}
              showEmojiPicker={showEmojiPicker}
              setShowEmojiPicker={setShowEmojiPicker}
              emojis={emojis}
            />
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="bg-gray-900 border-t border-gray-700 p-2 md:p-3 flex-shrink-0">
        <div className="flex items-center justify-center gap-1.5 md:gap-2">
          {/* Mute/Unmute */}
          <button
            onClick={toggleAudio}
            className={`p-2 md:p-3 rounded-full transition-all ${
              !audioEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={audioEnabled ? 'Mute' : 'Unmute'}
          >
            {audioEnabled ? (
              <Mic className="w-4 h-4 md:w-[18px] md:h-[18px] text-white" />
            ) : (
              <MicOff className="w-4 h-4 md:w-[18px] md:h-[18px] text-white" />
            )}
          </button>

          {/* Video On/Off */}
          <button
            onClick={toggleVideo}
            className={`p-2 md:p-3 rounded-full transition-all ${
              !videoEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={videoEnabled ? 'Turn off video' : 'Turn on video'}
          >
            {videoEnabled ? (
              <Video className="w-4 h-4 md:w-[18px] md:h-[18px] text-white" />
            ) : (
              <VideoOff className="w-4 h-4 md:w-[18px] md:h-[18px] text-white" />
            )}
          </button>

          {/* Toggle Chat */}
          <button
            onClick={() => setShowChat(!showChat)}
            className="p-2 md:p-3 bg-gray-700 hover:bg-gray-600 rounded-full transition-all"
            title="Toggle chat"
          >
            <MessageSquare className="w-4 h-4 md:w-[18px] md:h-[18px] text-white" />
          </button>

          {/* Next */}
          <button
            onClick={handleNext}
            disabled={isConnecting}
            className="px-3 py-2 md:px-[18px] md:py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full transition-all flex items-center gap-1 md:gap-1.5"
            title="Next person"
          >
            <SkipForward className="w-4 h-4 md:w-[18px] md:h-[18px] text-white" />
            <span className="text-white text-xs md:text-base">Next</span>
          </button>

          {/* End Call */}
          <button
            onClick={handleEndCall}
            className="px-3 py-2 md:px-[18px] md:py-3 bg-red-600 hover:bg-red-700 rounded-full transition-all flex items-center gap-1 md:gap-1.5"
            title="End call"
          >
            <Phone className="w-4 h-4 md:w-[18px] md:h-[18px] text-white rotate-[135deg]" />
            <span className="text-white text-xs md:text-base">End Call</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function ChatInput({ onSend, disabled, showEmojiPicker, setShowEmojiPicker, emojis }) {
  const [value, setValue] = useState('')

  function submit(e) {
    e.preventDefault()
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
    setShowEmojiPicker(false)
  }

  function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(e)
    }
  }

  function handleEmojiClick(emoji) {
    setValue(value + emoji)
    setShowEmojiPicker(false)
  }

  return (
    <>
      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div className="p-1.5 md:p-2 bg-gray-800 border-t border-gray-700">
          <div className="grid grid-cols-8 gap-1 md:gap-1.5">
            {emojis.map((emoji, index) => (
              <button
                key={index}
                onClick={() => handleEmojiClick(emoji)}
                className="text-lg md:text-xl hover:bg-gray-600 rounded p-0.5 transition-colors"
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="p-2 md:p-3 bg-gray-900 border-t border-gray-700 flex-shrink-0">
        <div className="flex items-end gap-1 md:gap-1.5">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1 md:p-1.5 hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
            type="button"
          >
            <Smile className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-400" />
          </button>
          <div className="flex-1 min-w-0">
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={disabled ? "Waiting for connection..." : "Type a message..."}
              disabled={disabled}
              className="w-full bg-gray-700 text-white rounded-lg px-2 py-1 md:py-1.5 resize-none outline-none focus:ring-2 focus:ring-blue-500 text-sm md:text-base"
              rows="1"
            />
          </div>
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            className="p-1 md:p-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors flex-shrink-0"
            type="button"
          >
            <Send className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
          </button>
        </div>
      </div>
    </>
  )
}
