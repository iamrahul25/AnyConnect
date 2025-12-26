# AnyConnect Application Flow Diagram

This document explains how the AnyConnect video chat application works, including the flow of connections, matching, and WebRTC signaling.

## High-Level Architecture

```
┌─────────────┐         WebSocket          ┌─────────────┐
│   Client 1  │◄──────────────────────────►│   Server    │
│  (Browser)  │         (ws://4001)        │  (Node.js)  │
└─────────────┘                             └─────────────┘
       │                                            │
       │                                            │
       │         WebRTC (P2P)                      │
       └───────────────────────────────────────────┘
                    │
                    ▼
            ┌─────────────┐
            │  Client 2   │
            │  (Browser)  │
            └─────────────┘
```

## Complete Application Flow

### 1. Initial Connection Flow

```
User Opens App
    │
    ▼
App.jsx loads
    │
    ▼
WebSocket Connection to ws://localhost:4001
    │
    ▼
Server assigns unique ID
    │
    ▼
Server sends {type: 'id', id: '1'}
    │
    ▼
HomePage displays with online count
```

### 2. Starting a Call Flow

```
User clicks "Start Calling"
    │
    ▼
App.jsx: setIsInCall(true)
    │
    ▼
CallPage component mounts
    │
    ▼
CallPage sends {type: 'ready'} to server
    │
    ▼
Server adds user to waitingQueue
    │
    ▼
Server checks if 2+ users in queue
    │
    ├─ NO ──► Wait for more users
    │
    └─ YES ──► tryPair() function
              │
              ├─► User A becomes initiator
              │   Server sends: {type: 'matched', peerId: 'B', initiator: true}
              │
              └─► User B becomes receiver
                  Server sends: {type: 'matched', peerId: 'A', initiator: false}
```

### 3. WebRTC Connection Establishment Flow

```
Both users receive 'matched' message
    │
    ▼
startCall(isInitiator, peerId) called
    │
    ├─────────────────────────────────┐
    │                                 │
    ▼                                 ▼
Initiator (User A)              Receiver (User B)
    │                                 │
    ▼                                 ▼
getUserMedia()                  getUserMedia()
    │                                 │
    ▼                                 ▼
Create RTCPeerConnection        Create RTCPeerConnection
    │                                 │
    ▼                                 │
Add local tracks                 Add local tracks
    │                                 │
    ▼                                 │
Create DataChannel              Wait for DataChannel
    │                                 │
    ▼                                 │
createOffer()                   │
    │                                 │
    ▼                                 │
setLocalDescription(offer)      │
    │                                 │
    ▼                                 │
Send offer via WebSocket ────────────►
    │                                 │
    │                                 ▼
    │                          handleSignal('offer')
    │                                 │
    │                                 ▼
    │                          setRemoteDescription(offer)
    │                                 │
    │                                 ▼
    │                          createAnswer()
    │                                 │
    │                                 ▼
    │                          setLocalDescription(answer)
    │                                 │
    │                                 ▼
    │                          Send answer via WebSocket ──►
    │                                                      │
    │                                                      ▼
    │                                              handleSignal('answer')
    │                                                      │
    │                                                      ▼
    │                                              setRemoteDescription(answer)
    │
    ▼
ICE Candidates Exchange
    │
    ├─► User A generates ICE candidates
    │   └─► Send via WebSocket {type: 'signal', data: {type: 'candidate'}}
    │
    └─► User B generates ICE candidates
        └─► Send via WebSocket {type: 'signal', data: {type: 'candidate'}}
    │
    ▼
Both users add ICE candidates
    │
    ▼
WebRTC connection established
    │
    ▼
Remote video/audio streams appear
    │
    ▼
DataChannel opens for chat
```

### 4. Next Button Flow

```
User clicks "Next" button
    │
    ▼
handleNext() called
    │
    ├─► Check: isProcessingNextRef or isConnecting?
    │   └─ YES ──► Return (prevent duplicate calls)
    │
    └─ NO ──► Set isProcessingNextRef = true
              │
              ▼
          Send {type: 'next'} to server
              │
              ├─────────────────────────────────┐
              │                                 │
              ▼                                 ▼
      Server receives 'next'            Server processes:
          │                                 │
          ├─► Unpair both users             │
          │   (remove from pairs Map)       │
          │                                 │
          ├─► Notify partner                │
          │   Send {type: 'partner_left'}   │
          │                                 │
          └─► Requeue both users            │
              (add to waitingQueue)         │
              │                                 │
              │                                 ▼
              │                          Client receives 'partner_left'
              │                                 │
              │                                 ▼
              │                          handleNext() called automatically
              │                                 │
              ▼                                 ▼
          tryPair() called              Cleanup current connection
              │                                 │
              ▼                                 ▼
      Match with new partner            Request new match
          (if available)                    {type: 'ready'}
```

### 5. Message Flow (Chat)

```
User types message and sends
    │
    ▼
sendChat(text) called
    │
    ▼
Check: dataChannel.readyState === 'open'?
    │
    ├─ NO ──► Message not sent (channel not ready)
    │
    └─ YES ──► dataChannel.send(text)
                │
                ▼
        Message sent via WebRTC DataChannel
                │
                ▼
        Partner receives via onmessage
                │
                ▼
        appendMessage('partner', text)
                │
                ▼
        Message displayed in chat
```

### 6. End Call Flow

```
User clicks "End Call" button
    │
    ▼
handleEndCall() called
    │
    ▼
Send {type: 'leave'} to server
    │
    ├─────────────────────────────────┐
    │                                 │
    ▼                                 ▼
Server processes:              Client cleanup:
    │                                 │
    ├─► Unpair users                  │
    ├─► Notify partner                │
    ├─► Remove from queue             │
    └─► Requeue partner               │
                                        │
                                        ▼
                                  cleanupPeer()
                                        │
                                        ├─► Close DataChannel
                                        ├─► Close RTCPeerConnection
                                        ├─► Stop all media tracks
                                        └─► Clear video refs
                                        │
                                        ▼
                                  onEndCall()
                                        │
                                        ▼
                                  Return to HomePage
```

## Key Components

### Client-Side Components

1. **App.jsx**
   - Manages WebSocket connection
   - Tracks online user count
   - Handles navigation between HomePage and CallPage

2. **HomePage.jsx**
   - Displays online user count
   - "Start Calling" button to begin matching

3. **CallPage.jsx**
   - Manages WebRTC peer connection
   - Handles video/audio streams
   - Manages chat via DataChannel
   - "Next" button to find new partner
   - "End Call" button to exit

### Server-Side (server/index.js)

1. **Data Structures**
   - `clients`: Map of user ID → WebSocket connection
   - `waitingQueue`: Array of user IDs waiting to be matched
   - `pairs`: Map of user ID → peer ID (current match)

2. **Key Functions**
   - `tryPair()`: Matches two users from waiting queue
   - `broadcastOnlineCount()`: Sends current online count to all users

3. **Message Types Handled**
   - `ready`: User wants to be matched
   - `next`: User wants a new partner
   - `signal`: WebRTC signaling data (offer/answer/candidate)
   - `leave`: User ends call and leaves

## WebRTC Signaling Flow (Detailed)

```
┌──────────┐                                    ┌──────────┐
│ User A   │                                    │ User B   │
│(Initiator)│                                    │(Receiver)│
└────┬─────┘                                    └────┬─────┘
     │                                              │
     │ 1. createOffer()                            │
     │ 2. setLocalDescription(offer)               │
     │ 3. Send offer via WebSocket ───────────────►│
     │                                              │
     │                                              │ 4. setRemoteDescription(offer)
     │                                              │ 5. createAnswer()
     │                                              │ 6. setLocalDescription(answer)
     │                                              │ 7. Send answer via WebSocket ──►
     │                                              │
     │ 8. setRemoteDescription(answer)              │
     │                                              │
     │ 9. ICE Candidates Exchange (bidirectional)  │
     │    (via WebSocket signaling)                │
     │                                              │
     │ 10. Connection Established                  │
     │     (P2P video/audio streams)               │
     │                                              │
```

## State Management

### Client State (CallPage.jsx)

- `matched`: Whether user is currently matched with a partner
- `peerId`: ID of the matched partner
- `initiator`: Whether this user initiated the WebRTC connection
- `isConnecting`: Whether currently searching for a match
- `messages`: Chat messages array
- `videoEnabled`/`audioEnabled`: Media control states

### Server State

- `clients`: Active WebSocket connections
- `waitingQueue`: Users waiting to be matched
- `pairs`: Current active pairs

## Error Handling

1. **ICE Candidate Errors**: Candidates are queued if remote description not set
2. **Connection Failures**: Users are automatically requeued
3. **Partner Disconnection**: `partner_left` message triggers automatic reconnection
4. **Media Access Errors**: Alerts user if camera/microphone access denied

## Race Condition Prevention

The Next button fix includes:
- `isProcessingNextRef`: Prevents concurrent next requests
- Proper cleanup sequence before requesting new match
- State checks before processing new matches
- Cleanup of all tracks and connections before starting new call

