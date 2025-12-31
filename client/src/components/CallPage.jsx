import React, { useEffect, useRef, useState } from 'react'
import { Video, VideoOff, Mic, MicOff, MessageSquare, MessageSquareX, Phone, SkipForward, Send, Smile, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Maximize, Minimize } from 'lucide-react'

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
  const [peerAudioMuted, setPeerAudioMuted] = useState(false)
  const [peerVideoEnabled, setPeerVideoEnabled] = useState(true)
  const [showChat, setShowChat] = useState(true)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [videoSize, setVideoSize] = useState({ width: null, height: null }) // null means use flex-1
  const [isResizing, setIsResizing] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewportHeight, setViewportHeight] = useState('100vh')
  const [localVideoPosition, setLocalVideoPosition] = useState({ x: null, y: null }) // null means use default (bottom-right)
  const [localVideoSize, setLocalVideoSize] = useState({ width: null, height: null }) // null means use default size
  const [isDragging, setIsDragging] = useState(false)
  const [isResizingLocal, setIsResizingLocal] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const containerRef = useRef(null)
  const remoteVideoContainerRef = useRef(null)
  const mainContainerRef = useRef(null)
  const localVideoContainerRef = useRef(null)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const dataChannelRef = useRef(null)
  const wsRef = useRef(ws)
  const pendingCandidatesRef = useRef([])
  const isProcessingNextRef = useRef(false)
  const peerUsernameRef = useRef(null)
  const isMatchedRef = useRef(false)
  const pendingSignalsRef = useRef([]) // Queue for signals that arrive before peer connection is ready

  const emojis = ['😊', '😂', '❤️', '👍', '👋', '🎉', '😎', '🔥', '✨', '💯', '😍', '🤔', '😢', '😮', '👏', '🙌']

  // Set viewport height to account for mobile browser UI (search bar, address bar, etc.)
  useEffect(() => {
    const setHeight = () => {
      // Use window.innerHeight which gives the actual visible viewport height
      // This accounts for mobile browser UI elements
      // Also try visualViewport if available for better mobile support
      let height = window.innerHeight
      if (window.visualViewport) {
        height = window.visualViewport.height
      }
      setViewportHeight(`${height}px`)
    }

    // Set initial height
    setHeight()

    // Update on resize (handles browser UI changes on mobile)
    window.addEventListener('resize', setHeight)
    window.addEventListener('orientationchange', setHeight)
    
    // Also listen for visual viewport changes (better for mobile)
    let visualViewportHandlers = null
    if (window.visualViewport) {
      const handleViewportChange = () => {
        setHeight()
      }
      window.visualViewport.addEventListener('resize', handleViewportChange)
      window.visualViewport.addEventListener('scroll', handleViewportChange)
      visualViewportHandlers = handleViewportChange
    }

    return () => {
      window.removeEventListener('resize', setHeight)
      window.removeEventListener('orientationchange', setHeight)
      if (window.visualViewport && visualViewportHandlers) {
        window.visualViewport.removeEventListener('resize', visualViewportHandlers)
        window.visualViewport.removeEventListener('scroll', visualViewportHandlers)
      }
    }
  }, [])

  useEffect(() => {
    wsRef.current = ws
    if (ws && ws.readyState === WebSocket.OPEN && !isMatchedRef.current) {
      // Request to be matched (only if not already matched)
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
          // If we're processing next, ignore this match and requeue ourselves
          setTimeout(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isMatchedRef.current) {
              wsRef.current.send(JSON.stringify({ type: 'ready' }))
            }
          }, 100)
          return
        }
        
        // Mark as matched to prevent duplicate ready requests
        isMatchedRef.current = true
        setMatched(true)
        setPeerId(msg.peerId)
        const peerName = msg.peerUsername || 'Guest'
        setPeerUsername(peerName)
        peerUsernameRef.current = peerName
        setInitiator(!!msg.initiator)
        setIsConnecting(false)
        // Show candidate found message with user name and id
        appendSystem(`👋 ${peerName} (${msg.peerId.substring(0, 8)}...) - Candidate found`)
        startCall(msg.initiator, msg.peerId)
      }
      
      if (msg.type === 'signal') {
        handleSignal(msg.from, msg.data)
      }
      
      if (msg.type === 'partner_left') {
        const peerName = peerUsername || 'Partner'
        const peerIdForMessage = peerId ? `${peerId.substring(0, 8)}...` : 'unknown'
        appendSystem(`${peerName} (${peerIdForMessage}) got disconnected.`)
        appendSystem('Clean-up and find new user present in waiting queue...')
        
        // Reset state immediately to show "Connecting to someone..."
        isMatchedRef.current = false
        setMatched(false)
        setPeerId(null)
        setPeerUsername(null)
        peerUsernameRef.current = null
        setInitiator(false)
        setIsConnecting(true)
        setPeerAudioMuted(false)
        setPeerVideoEnabled(true)
        // Reset local audio and video to enabled (unmuted and video on)
        setAudioEnabled(true)
        setVideoEnabled(true)
        
        // Clean up the peer connection
        cleanupPeer()
        
        // Requeue ourselves by sending 'ready' (not 'next' since we didn't initiate the disconnect)
        setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isMatchedRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'ready' }))
          }
        }, 500)
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

    // Clear pending signals and candidates
    pendingSignalsRef.current = []
    pendingCandidatesRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      })
      localStreamRef.current = stream
      
      // Ensure tracks are enabled based on current state
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = videoEnabled
      }
      if (audioTrack) {
        audioTrack.enabled = audioEnabled
      }
      
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
        appendSystem('Video track received')
      }

      // Handle ICE candidates
      let candidateCount = 0
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          candidateCount++
          sendWs({ 
            type: 'signal', 
            to: remotePeerId, 
            data: { type: 'candidate', candidate: e.candidate } 
          })
          if (candidateCount === 1) {
            appendSystem('ICE candidate gathering started...')
          }
        } else {
          // No more candidates
          appendSystem(`ICE candidate gathering completed (${candidateCount} candidates found)`)
        }
      }

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState
        appendSystem(`WebRTC ICE connection state: ${state}`)
        
        if (state === 'connected' || state === 'completed') {
          appendSystem('WebRTC connection established successfully')
        } else if (state === 'disconnected') {
          appendSystem('WebRTC connection disconnected')
        } else if (state === 'failed') {
          appendSystem('WebRTC connection failed')
        } else if (state === 'checking') {
          appendSystem('WebRTC ICE connection checking...')
        } else if (state === 'new') {
          appendSystem('WebRTC ICE connection initialized')
        }
      }
      
      // Track connection state changes
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        appendSystem(`WebRTC connection state: ${state}`)
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
        appendSystem('Offer created and sent')
      } else {
        // Non-initiator sets up handler to receive data channel
        // This MUST be set up before processing the offer
        pc.ondatachannel = (e) => {
          console.log('Data channel received:', e.channel.label)
          dataChannelRef.current = e.channel
          setupDataChannel(e.channel)
        }
        appendSystem('Waiting for offer from peer...')
      }
      
      // Process any pending signals that arrived before peer connection was created
      while (pendingSignalsRef.current.length > 0) {
        const pendingSignal = pendingSignalsRef.current.shift()
        console.log('Processing pending signal:', pendingSignal.data.type)
        await handleSignal(pendingSignal.from, pendingSignal.data)
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
      appendSystem('Chat is enabled')
      // Send current mute and video status when data channel opens
      sendMuteStatus()
      sendVideoStatus()
    }
    
    dc.onmessage = (e) => {
      console.log('Received message:', e.data)
      
      // Try to parse as JSON for control messages
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'muteStatus') {
          setPeerAudioMuted(msg.muted)
          return
        }
        if (msg.type === 'videoStatus') {
          setPeerVideoEnabled(msg.enabled)
          return
        }
        // If it's JSON but not a control message, treat as chat
        const senderName = peerUsernameRef.current || 'Partner'
        appendMessage('partner', e.data, senderName)
      } catch {
        // Not JSON, treat as plain text chat message
        const senderName = peerUsernameRef.current || 'Partner'
        appendMessage('partner', e.data, senderName)
      }
    }
    
    dc.onerror = (e) => {
      console.error('Data channel error:', e)
      appendSystem('Chat error occurred')
    }
    
    dc.onclose = () => {
      console.log('Data channel closed')
      appendSystem('Chat disconnected')
      setPeerAudioMuted(false) // Reset mute status when channel closes
      setPeerVideoEnabled(true) // Reset video status when channel closes
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
    if (!data) return
    
    const pc = pcRef.current
    
    // If peer connection is not ready yet, queue the signal
    if (!pc) {
      console.log('Peer connection not ready, queueing signal:', data.type)
      pendingSignalsRef.current.push({ from, data })
      return
    }

    try {
      if (data.type === 'offer') {
        // Only process offer if we're in stable state and don't have a remote description
        // This prevents processing duplicate offers
        if (pc.signalingState === 'stable' && !pc.remoteDescription) {
          // Ensure data channel handler is set up before processing offer
          // This is critical - if the handler isn't set, we'll miss the data channel
          if (!pc.ondatachannel) {
            pc.ondatachannel = (e) => {
              console.log('Data channel received in handleSignal:', e.channel.label)
              dataChannelRef.current = e.channel
              setupDataChannel(e.channel)
            }
          }
          
          appendSystem('Received offer from peer')
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
          appendSystem('Answer created and sent')
        } else {
          console.warn('Ignoring offer - signaling state:', pc.signalingState, 'remoteDescription:', !!pc.remoteDescription)
        }
      } else if (data.type === 'answer') {
        // Only set answer if we're in the correct state (have-local-offer)
        // and haven't already set a remote description
        if (pc.signalingState === 'have-local-offer' && !pc.remoteDescription) {
          appendSystem('Received answer from peer')
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          // Apply any pending candidates after setting remote description
          await applyPendingCandidates()
        } else {
          console.warn('Ignoring answer - signaling state:', pc.signalingState, 'remoteDescription:', !!pc.remoteDescription)
        }
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
      appendSystem(`Error processing signal: ${err.message}`)
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
    
    // Clear pending candidates and signals
    pendingCandidatesRef.current = []
    pendingSignalsRef.current = []
    
    // Note: State reset is handled by the caller (handleNext or partner_left handler)
    // to ensure proper UI updates
  }

  function handleNext() {
    // Prevent multiple concurrent next requests
    if (isProcessingNextRef.current) {
      console.log('handleNext: Already processing, skipping')
      return
    }

    console.log('handleNext: Starting next request')
    isProcessingNextRef.current = true
    
    // Store peer info before cleanup for disconnect message
    const previousPeerName = peerUsername || 'Partner'
    const previousPeerId = peerId
    
    // Reset state immediately to show "Connecting to someone..."
    isMatchedRef.current = false
    setMatched(false)
    setPeerId(null)
    setPeerUsername(null)
    peerUsernameRef.current = null
    setInitiator(false)
    setIsConnecting(true)
    setPeerAudioMuted(false)
    setPeerVideoEnabled(true)
    // Reset local audio and video to enabled (unmuted and video on)
    setAudioEnabled(true)
    setVideoEnabled(true)
    
    // Update media tracks immediately if stream exists
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = true
      }
      if (audioTrack) {
        audioTrack.enabled = true
      }
    }
    
    // Clean up current connection first
    cleanupPeer()
    // Don't reset messages - keep chat history persistent
    // setMessages([]) - REMOVED to persist chat
    
    // Show disconnect message with user details (only if we had a peer)
    if (previousPeerId) {
      appendSystem(`${previousPeerName} (${previousPeerId.substring(0, 8)}...) got disconnected.`)
    }
    
    // Show message about finding new user
    appendSystem('Clean-up completed. Finding new user present in waiting queue...')
    
    // Send next request to server
    sendWs({ type: 'next' })
    
    // Request new match after a short delay to ensure cleanup is complete
    setTimeout(() => {
      isProcessingNextRef.current = false
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isMatchedRef.current) {
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

  function sendVideoStatus(enabled) {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        const videoStatus = JSON.stringify({ 
          type: 'videoStatus', 
          enabled: enabled !== undefined ? enabled : videoEnabled 
        })
        dataChannelRef.current.send(videoStatus)
      } catch (err) {
        console.error('Error sending video status:', err)
      }
    }
  }

  function toggleVideo() {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        const newEnabled = !videoTrack.enabled
        videoTrack.enabled = newEnabled
        setVideoEnabled(newEnabled)
        // Send video status to peer
        sendVideoStatus(newEnabled)
      }
    }
  }

  function sendMuteStatus(muted) {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try {
        const muteStatus = JSON.stringify({ 
          type: 'muteStatus', 
          muted: muted !== undefined ? muted : !audioEnabled 
        })
        dataChannelRef.current.send(muteStatus)
      } catch (err) {
        console.error('Error sending mute status:', err)
      }
    }
  }

  function toggleAudio() {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        const newEnabled = !audioTrack.enabled
        audioTrack.enabled = newEnabled
        setAudioEnabled(newEnabled)
        // Send mute status to peer (muted = !enabled)
        sendMuteStatus(!newEnabled)
      }
    }
  }

  function handleEndCall() {
    sendWs({ type: 'leave' })
    cleanupPeer()
    onEndCall()
  }

  const isConnected = matched && !isConnecting

  // Handle resize logic
  const handleResizeStart = (e) => {
    setIsResizing(true)
    e.preventDefault()
  }

  const handleResize = (e) => {
    if (!isResizing || !containerRef.current) return

    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    const isMobile = window.innerWidth < 768 // md breakpoint

    if (isMobile) {
      // Vertical resize (mobile)
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const newHeight = ((clientY - rect.top) / rect.height) * 100
      // Constrain between 10% and 90% to allow very small sizes
      const constrainedHeight = Math.max(10, Math.min(90, newHeight))
      setVideoSize({ width: null, height: constrainedHeight })
    } else {
      // Horizontal resize (desktop)
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const newWidth = ((clientX - rect.left) / rect.width) * 100
      // Constrain between 10% and 90% to allow very small sizes
      const constrainedWidth = Math.max(10, Math.min(90, newWidth))
      setVideoSize({ width: constrainedWidth, height: null })
    }
  }

  const handleResizeEnd = () => {
    setIsResizing(false)
  }

  // Fullscreen toggle function with cross-browser and mobile support
  const toggleFullscreen = async () => {
    const element = document.documentElement // Use documentElement for F11-like behavior
    
    try {
      if (!document.fullscreenElement && 
          !document.webkitFullscreenElement && 
          !document.mozFullScreenElement && 
          !document.msFullscreenElement) {
        // Enter fullscreen
        if (element.requestFullscreen) {
          await element.requestFullscreen()
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen()
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen()
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen()
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen()
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen()
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen()
        }
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err)
    }
  }

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      )
      setIsFullscreen(isCurrentlyFullscreen)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    if (isResizing) {
      const handleMouseMove = (e) => handleResize(e)
      const handleMouseUp = () => handleResizeEnd()
      const handleTouchMove = (e) => handleResize(e)
      const handleTouchEnd = () => handleResizeEnd()

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [isResizing])

  // Reset video size when chat is hidden to allow video to expand fully
  useEffect(() => {
    if (!showChat) {
      setVideoSize({ width: null, height: null })
    }
  }, [showChat])

  // Handle drag logic for local video
  const handleDragStart = (e) => {
    // Don't start drag if clicking on resize handle
    if (e.target.closest('.resize-handle')) {
      return
    }
    
    if (!localVideoContainerRef.current || !remoteVideoContainerRef.current) return
    
    setIsDragging(true)
    const container = remoteVideoContainerRef.current
    const videoContainer = localVideoContainerRef.current
    const containerRect = container.getBoundingClientRect()
    const videoRect = videoContainer.getBoundingClientRect()
    
    // Calculate offset from mouse/touch to video container
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    
    const offsetX = clientX - videoRect.left
    const offsetY = clientY - videoRect.top
    
    setDragOffset({ x: offsetX, y: offsetY })
    
    // If position is null (default), initialize it to current position
    if (localVideoPosition.x === null || localVideoPosition.y === null) {
      const currentX = videoRect.left - containerRect.left
      const currentY = videoRect.top - containerRect.top
      setLocalVideoPosition({ x: currentX, y: currentY })
    }
    
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrag = (e) => {
    if (!isDragging || !remoteVideoContainerRef.current || !localVideoContainerRef.current) return
    
    const container = remoteVideoContainerRef.current
    const videoContainer = localVideoContainerRef.current
    const containerRect = container.getBoundingClientRect()
    const videoRect = videoContainer.getBoundingClientRect()
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    
    // Calculate new position relative to container
    let newX = clientX - containerRect.left - dragOffset.x
    let newY = clientY - containerRect.top - dragOffset.y
    
    // Constrain to container bounds
    const maxX = containerRect.width - videoRect.width
    const maxY = containerRect.height - videoRect.height
    
    newX = Math.max(0, Math.min(newX, maxX))
    newY = Math.max(0, Math.min(newY, maxY))
    
    setLocalVideoPosition({ x: newX, y: newY })
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    setDragOffset({ x: 0, y: 0 })
  }

  // Handle resize logic for local video
  const handleLocalResizeStart = (e, corner) => {
    if (!localVideoContainerRef.current || !remoteVideoContainerRef.current) return
    
    setIsResizingLocal(true)
    const container = remoteVideoContainerRef.current
    const videoContainer = localVideoContainerRef.current
    const containerRect = container.getBoundingClientRect()
    const videoRect = videoContainer.getBoundingClientRect()
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    
    // Get current size (use state if set, otherwise use actual dimensions)
    const currentWidth = localVideoSize.width || videoRect.width
    const currentHeight = localVideoSize.height || videoRect.height
    
    // Get current position (use state if set, otherwise calculate from rect)
    let currentX = localVideoPosition.x
    let currentY = localVideoPosition.y
    
    if (currentX === null || currentY === null) {
      currentX = videoRect.left - containerRect.left
      currentY = videoRect.top - containerRect.top
      setLocalVideoPosition({ x: currentX, y: currentY })
    }
    
    setResizeStart({
      x: clientX,
      y: clientY,
      width: currentWidth,
      height: currentHeight,
      startX: currentX,
      startY: currentY,
      corner
    })
    
    e.preventDefault()
    e.stopPropagation()
  }

  const handleLocalResize = (e) => {
    if (!isResizingLocal || !remoteVideoContainerRef.current || !localVideoContainerRef.current) return
    
    const container = remoteVideoContainerRef.current
    const containerRect = container.getBoundingClientRect()
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    
    const deltaX = clientX - resizeStart.x
    const deltaY = clientY - resizeStart.y
    
    const minSize = 80 // Minimum width/height in pixels
    const maxSize = Math.min(containerRect.width * 0.8, containerRect.height * 0.8) // Max 80% of container
    
    let newWidth = resizeStart.width
    let newHeight = resizeStart.height
    let newX = resizeStart.startX
    let newY = resizeStart.startY
    
    // Handle different corners
    if (resizeStart.corner === 'se') {
      // Southeast (bottom-right) - resize from top-left
      newWidth = Math.max(minSize, Math.min(maxSize, resizeStart.width + deltaX))
      newHeight = Math.max(minSize, Math.min(maxSize, resizeStart.height + deltaY))
    } else if (resizeStart.corner === 'sw') {
      // Southwest (bottom-left) - resize from top-right
      newWidth = Math.max(minSize, Math.min(maxSize, resizeStart.width - deltaX))
      newHeight = Math.max(minSize, Math.min(maxSize, resizeStart.height + deltaY))
      newX = resizeStart.startX + (resizeStart.width - newWidth)
    } else if (resizeStart.corner === 'ne') {
      // Northeast (top-right) - resize from bottom-left
      newWidth = Math.max(minSize, Math.min(maxSize, resizeStart.width + deltaX))
      newHeight = Math.max(minSize, Math.min(maxSize, resizeStart.height - deltaY))
      newY = resizeStart.startY + (resizeStart.height - newHeight)
    } else if (resizeStart.corner === 'nw') {
      // Northwest (top-left) - resize from bottom-right
      newWidth = Math.max(minSize, Math.min(maxSize, resizeStart.width - deltaX))
      newHeight = Math.max(minSize, Math.min(maxSize, resizeStart.height - deltaY))
      newX = resizeStart.startX + (resizeStart.width - newWidth)
      newY = resizeStart.startY + (resizeStart.height - newHeight)
    }
    
    // Constrain position to container bounds
    const maxX = containerRect.width - newWidth
    const maxY = containerRect.height - newHeight
    newX = Math.max(0, Math.min(newX, maxX))
    newY = Math.max(0, Math.min(newY, maxY))
    
    setLocalVideoSize({ width: newWidth, height: newHeight })
    setLocalVideoPosition({ x: newX, y: newY })
    
    e.preventDefault()
    e.stopPropagation()
  }

  const handleLocalResizeEnd = () => {
    setIsResizingLocal(false)
    setResizeStart({ x: 0, y: 0, width: 0, height: 0, startX: 0, startY: 0, corner: null })
  }

  // Add event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e) => handleDrag(e)
      const handleMouseUp = () => handleDragEnd()
      const handleTouchMove = (e) => handleDrag(e)
      const handleTouchEnd = () => handleDragEnd()

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [isDragging, dragOffset, localVideoPosition])

  // Add event listeners for resizing local video
  useEffect(() => {
    if (isResizingLocal) {
      const handleMouseMove = (e) => handleLocalResize(e)
      const handleMouseUp = () => handleLocalResizeEnd()
      const handleTouchMove = (e) => handleLocalResize(e)
      const handleTouchEnd = () => handleLocalResizeEnd()

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [isResizingLocal, resizeStart])

  return (
    <div 
      ref={mainContainerRef}
      className="w-full bg-gray-900 flex flex-col overflow-hidden"
      style={{ 
        height: viewportHeight, 
        maxHeight: viewportHeight,
        minHeight: 0,
        width: '100%',
        position: 'relative'
      }}
    >
      {/* Main Content Area */}
      <div ref={containerRef} className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Video Section */}
        <div 
          className={`relative bg-black min-h-0 ${
            !showChat || (videoSize.width === null && videoSize.height === null) ? 'flex-1' : ''
          }`}
          style={{
            ...(showChat && videoSize.width !== null && {
              width: `${videoSize.width}%`,
            }),
            ...(showChat && videoSize.height !== null && {
              height: `${videoSize.height}%`,
            }),
          }}
        >
            {/* Other Person's Video (Main) */}
          <div ref={remoteVideoContainerRef} className="w-full h-full relative">
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
                  {!peerVideoEnabled && (
                    <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                      <div className="text-center">
                        <VideoOff className="w-12 h-12 md:w-16 md:h-16 text-gray-500 mx-auto mb-2 md:mb-3" />
                        <p className="text-gray-400 text-sm md:text-base">Video Off</p>
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

            {/* Fullscreen Button */}
            {isConnected && (
              <button
                onClick={toggleFullscreen}
                className="absolute top-2 right-2 md:top-3 md:right-3 bg-black bg-opacity-70 hover:bg-opacity-90 text-white p-2 rounded-lg transition-all z-20 flex items-center justify-center"
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4 md:w-5 md:h-5" />
                ) : (
                  <Maximize className="w-4 h-4 md:w-5 md:h-5" />
                )}
              </button>
            )}

            {/* Your Video (Picture-in-Picture) */}
            <div 
              ref={localVideoContainerRef}
              className={`absolute bg-gray-700 rounded-lg overflow-hidden border-[1.5px] border-gray-600 shadow-lg cursor-move ${isDragging ? 'opacity-90' : ''} ${isResizingLocal ? 'opacity-90' : ''}`}
              style={{
                ...(localVideoPosition.x !== null && localVideoPosition.y !== null ? {
                  left: `${localVideoPosition.x}px`,
                  top: `${localVideoPosition.y}px`,
                  bottom: 'auto',
                  right: 'auto',
                } : {
                  bottom: '0.5rem',
                  right: '0.5rem',
                  left: 'auto',
                  top: 'auto',
                }),
                ...(localVideoSize.width !== null && localVideoSize.height !== null ? {
                  width: `${localVideoSize.width}px`,
                  height: `${localVideoSize.height}px`,
                } : {
                  width: '8rem', // w-32
                  height: '6rem', // h-24
                }),
                ...(window.innerWidth >= 768 && localVideoSize.width === null && localVideoSize.height === null ? {
                  width: '12rem', // md:w-48
                  height: '9rem', // md:h-36
                } : {}),
                touchAction: 'none',
              }}
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
            >
              <div className="w-full h-full flex items-center justify-center relative">
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className="w-full h-full object-cover pointer-events-none"
                />
                {!videoEnabled && (
                  <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                    <div className="text-center">
                      <VideoOff className="w-6 h-6 md:w-9 md:h-9 text-gray-500 mx-auto mb-1 md:mb-1.5" />
                      <p className="text-gray-400 text-[10px] md:text-xs">Video Off</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="absolute bottom-1 left-1 md:bottom-1.5 md:left-1.5 bg-black bg-opacity-70 text-white px-1 md:px-1.5 py-0.5 rounded text-[8px] md:text-[9px] pointer-events-none z-10">
                {userName || 'You'}
              </div>
              
              {/* Resize Handles */}
              {/* Top-left corner */}
              <div
                className="resize-handle absolute top-0 left-0 w-5 h-5 md:w-4 md:h-4 cursor-nwse-resize z-20 hover:bg-blue-400 hover:bg-opacity-20 transition-colors"
                style={{ touchAction: 'none' }}
                onMouseDown={(e) => handleLocalResizeStart(e, 'nw')}
                onTouchStart={(e) => handleLocalResizeStart(e, 'nw')}
              >
                <div className="absolute top-0 left-0 w-4 h-4 md:w-3 md:h-3 border-l-2 border-t-2 border-blue-400 rounded-tl-lg"></div>
              </div>
              
              {/* Top-right corner */}
              <div
                className="resize-handle absolute top-0 right-0 w-5 h-5 md:w-4 md:h-4 cursor-nesw-resize z-20 hover:bg-blue-400 hover:bg-opacity-20 transition-colors"
                style={{ touchAction: 'none' }}
                onMouseDown={(e) => handleLocalResizeStart(e, 'ne')}
                onTouchStart={(e) => handleLocalResizeStart(e, 'ne')}
              >
                <div className="absolute top-0 right-0 w-4 h-4 md:w-3 md:h-3 border-r-2 border-t-2 border-blue-400 rounded-tr-lg"></div>
              </div>
              
              {/* Bottom-left corner */}
              <div
                className="resize-handle absolute bottom-0 left-0 w-5 h-5 md:w-4 md:h-4 cursor-nesw-resize z-20 hover:bg-blue-400 hover:bg-opacity-20 transition-colors"
                style={{ touchAction: 'none' }}
                onMouseDown={(e) => handleLocalResizeStart(e, 'sw')}
                onTouchStart={(e) => handleLocalResizeStart(e, 'sw')}
              >
                <div className="absolute bottom-0 left-0 w-4 h-4 md:w-3 md:h-3 border-l-2 border-b-2 border-blue-400 rounded-bl-lg"></div>
              </div>
              
              {/* Bottom-right corner */}
              <div
                className="resize-handle absolute bottom-0 right-0 w-5 h-5 md:w-4 md:h-4 cursor-nwse-resize z-20 hover:bg-blue-400 hover:bg-opacity-20 transition-colors"
                style={{ touchAction: 'none' }}
                onMouseDown={(e) => handleLocalResizeStart(e, 'se')}
                onTouchStart={(e) => handleLocalResizeStart(e, 'se')}
              >
                <div className="absolute bottom-0 right-0 w-4 h-4 md:w-3 md:h-3 border-r-2 border-b-2 border-blue-400 rounded-br-lg"></div>
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
              <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3 bg-black bg-opacity-70 text-white px-2 py-0.5 rounded-full text-[10px] md:text-xs flex items-center gap-1">
                {peerAudioMuted && (
                  <MicOff className="w-3 h-3 md:w-3.5 md:h-3.5 text-red-400" />
                )}
                <span>{peerUsername}</span>
              </div>
            )}
          </div>
        </div>

        {/* Resizable Divider - Mobile (Horizontal) */}
        {showChat && (
          <div
            className={`md:hidden absolute bg-gray-700 hover:bg-gray-500 transition-colors z-10 flex items-center justify-center cursor-row-resize active:bg-blue-600 ${
              isResizing ? 'bg-blue-600' : ''
            }`}
            style={{
              top: videoSize.height !== null ? `${videoSize.height}%` : 'calc(100% - 16rem)',
              left: 0,
              right: 0,
              height: '6px',
              width: '100%',
              touchAction: 'none',
            }}
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
          >
            <div className="flex items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity">
              <ChevronUp className="w-3.5 h-3.5 text-gray-300" />
              <ChevronDown className="w-3.5 h-3.5 text-gray-300" />
            </div>
          </div>
        )}

        {/* Resizable Divider - Desktop (Vertical) */}
        {showChat && (
          <div
            className={`hidden md:flex absolute bg-gray-700 hover:bg-gray-500 transition-colors z-10 items-center justify-center cursor-col-resize active:bg-blue-600 ${
              isResizing ? 'bg-blue-600' : ''
            }`}
            style={{
              top: 0,
              bottom: 0,
              left: videoSize.width !== null ? `${videoSize.width}%` : 'calc(100% - 18rem)',
              width: '6px',
              height: '100%',
            }}
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
          >
            <div className="flex items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity">
              <ChevronLeft className="w-3.5 h-3.5 text-gray-300" />
              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            </div>
          </div>
        )}

        {/* Chat Section */}
        {showChat && (
          <div 
            className={`bg-gray-800 flex flex-col border-t md:border-t-0 md:border-l border-gray-700 ${
              videoSize.width === null && videoSize.height === null 
                ? 'w-full md:w-72 h-64 md:h-auto' 
                : ''
            }`}
            style={{
              ...(videoSize.width !== null && {
                width: `calc(${100 - videoSize.width}% - 4px)`,
              }),
              ...(videoSize.height !== null && {
                height: `calc(${100 - videoSize.height}% - 4px)`,
              }),
            }}
          >
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
            className={`p-2 md:p-3 rounded-full transition-all ${
              !showChat ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            }`}
            title={showChat ? 'Hide chat' : 'Show chat'}
          >
            {!showChat ? (
              <MessageSquareX className="w-4 h-4 md:w-[18px] md:h-[18px] text-white" />
            ) : (
              <MessageSquare className="w-4 h-4 md:w-[18px] md:h-[18px] text-white" />
            )}
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
