// Load environment variables from .env file
require('dotenv').config();

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 4001;

// Get allowed origins from environment variable (comma-separated)
// Supports both development and production URLs
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'];

// Helper function for colored console logs
function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    warning: '\x1b[33m', // Yellow
    error: '\x1b[31m',   // Red
    reset: '\x1b[0m'
  };
  const timestamp = new Date().toISOString();
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
}

// Origin verification function for CORS
function verifyOrigin(origin) {
  if (!origin) {
    // Allow connections without origin (e.g., Postman, curl)
    // In production, you might want to return false here
    return true;
  }
  
  // Check if origin is in allowed list
  const isAllowed = ALLOWED_ORIGINS.some(allowedOrigin => {
    // Support wildcard subdomains (e.g., *.vercel.app)
    if (allowedOrigin.includes('*')) {
      const pattern = allowedOrigin.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(origin);
    }
    return origin === allowedOrigin;
  });
  
  return isAllowed;
}

const wss = new WebSocket.Server({ 
  port: PORT,
  verifyClient: (info) => {
    const origin = info.origin;
    const allowed = verifyOrigin(origin);
    if (!allowed) {
      log(`🚫 Connection rejected from origin: ${origin}`, 'warning');
    }
    return allowed;
  }
});

const clients = new Map(); // id -> ws
const usernames = new Map(); // id -> username
const waitingQueue = []; // ids
const pairs = new Map(); // id -> peerId

function broadcastOnlineCount() {
  const count = clients.size;
  const queueCount = waitingQueue.length;
  const msg = JSON.stringify({ type: 'onlineCount', count, queueCount });
  log(`Broadcasting online count: ${count}, queue: ${queueCount}`, 'info');
  logWaitingQueue();
  for (const ws of clients.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function broadcastQueueCount() {
  const queueCount = waitingQueue.length;
  const msg = JSON.stringify({ type: 'queueCount', count: queueCount });
  log(`📊 Queue count updated: ${queueCount} users waiting`, 'info');
  logWaitingQueue();
  for (const ws of clients.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function logWaitingQueue() {
  if (waitingQueue.length === 0) {
    log(`   📭 Waiting Queue: [EMPTY]`, 'info');
  } else {
    const queueIds = waitingQueue.map(id => id.substring(0, 8) + '...').join(', ');
    log(`   📋 Waiting Queue (${waitingQueue.length} users): [${queueIds}]`, 'info');
    log(`   📋 Full Queue IDs: [${waitingQueue.map(id => id).join(', ')}]`, 'info');
  }
}

function tryPair() {
  log(`🔄 Attempting to pair users... Current queue length: ${waitingQueue.length}`, 'info');
  logWaitingQueue();
  
  while (waitingQueue.length >= 2) {
    const a = waitingQueue.shift();
    const b = waitingQueue.shift();
    if (!clients.has(a) || !clients.has(b)) {
      if (clients.has(a)) waitingQueue.unshift(a);
      if (clients.has(b)) waitingQueue.unshift(b);
      log(`⚠️  Skipping pair - one or both users disconnected`, 'warning');
      continue;
    }
    pairs.set(a, b);
    pairs.set(b, a);
    const wa = clients.get(a);
    const wb = clients.get(b);
    
    const usernameA = usernames.get(a) || 'Guest';
    const usernameB = usernames.get(b) || 'Guest';
    
    log(`🔗 PAIRED: ${usernameA} (${a.substring(0, 8)}...) ↔ ${usernameB} (${b.substring(0, 8)}...)`, 'success');
    log(`   → ${usernameA} (${a.substring(0, 8)}...) is INITIATOR`, 'info');
    log(`   → ${usernameB} (${b.substring(0, 8)}...) is RECEIVER`, 'info');
    
    if (wa && wa.readyState === WebSocket.OPEN) {
      wa.send(JSON.stringify({ 
        type: 'matched', 
        peerId: b, 
        peerUsername: usernameB,
        initiator: true 
      }));
      log(`   ✓ Sent 'matched' to ${usernameA} (initiator)`, 'success');
    }
    if (wb && wb.readyState === WebSocket.OPEN) {
      wb.send(JSON.stringify({ 
        type: 'matched', 
        peerId: a, 
        peerUsername: usernameA,
        initiator: false 
      }));
      log(`   ✓ Sent 'matched' to ${usernameB} (receiver)`, 'success');
    }
    
    // Broadcast updated queue count after pairing
    broadcastQueueCount();
  }
  
  if (waitingQueue.length > 0 && waitingQueue.length < 2) {
    log(`⏳ Waiting for more users... ${waitingQueue.length} user(s) in queue`, 'info');
    logWaitingQueue();
  }
}

wss.on('connection', (ws) => {
  const id = uuidv4();
  ws._id = id;
  clients.set(id, ws);
  // Set default username
  usernames.set(id, 'Guest');
  log(`🟢 NEW CONNECTION: User ${id.substring(0, 8)}... connected`, 'success');
  log(`   Total clients: ${clients.size}`, 'info');
  ws.send(JSON.stringify({ type: 'id', id }));
  broadcastOnlineCount();

  ws.on('message', (raw) => {
    let msg = null;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    const { type } = msg;

    if (type === 'setUsername') {
      const { username } = msg;
      if (username && username.trim()) {
        usernames.set(id, username.trim());
        log(`📝 User ${id.substring(0, 8)}... set username to: ${username.trim()}`, 'info');
      }
    }

    if (type === 'ready') {
      // Ensure user is not in pairs
      if (pairs.has(id)) {
        log(`⚠️  User ${id.substring(0, 8)}... is still paired, removing from pairs first`, 'warning');
        const peer = pairs.get(id);
        pairs.delete(id);
        if (peer) pairs.delete(peer);
      }
      
      // Remove from queue if already there (to avoid duplicates and ensure fresh state)
      const queueIdx = waitingQueue.indexOf(id);
      if (queueIdx !== -1) {
        waitingQueue.splice(queueIdx, 1);
        log(`🗑️  Removed User ${id.substring(0, 8)}... (${id}) from queue (was already there)`, 'info');
        logWaitingQueue();
      }
      
      // Add to queue if not paired
      if (!pairs.has(id)) {
        waitingQueue.push(id);
        log(`📋 User ${id.substring(0, 8)}... (${id}) added to waiting queue`, 'info');
        log(`   Queue length: ${waitingQueue.length}`, 'info');
        logWaitingQueue();
        broadcastQueueCount();
      } else {
        log(`⚠️  User ${id.substring(0, 8)}... is still paired, cannot add to queue`, 'warning');
      }
      tryPair();
    }

    if (type === 'next') {
      // user wants a new partner
      const peer = pairs.get(id);
      log(`⏭️  NEXT REQUEST: User ${id.substring(0, 8)}... wants new partner`, 'warning');
      
      // Ensure user is removed from pairs first
      if (pairs.has(id)) {
        pairs.delete(id);
      }
      
      // unpair both
      if (peer) {
        pairs.delete(peer);
        log(`   ✂️  Unpaired: User ${id.substring(0, 8)}... ↔ User ${peer.substring(0, 8)}...`, 'info');
        
        // notify peer
        const pws = clients.get(peer);
        if (pws && pws.readyState === WebSocket.OPEN) {
          pws.send(JSON.stringify({ type: 'partner_left' }));
          log(`   📤 Sent 'partner_left' to User ${peer.substring(0, 8)}...`, 'info');
        }
      }
      
      // Remove from queue if already there (to avoid duplicates)
      const queueIdx = waitingQueue.indexOf(id);
      if (queueIdx !== -1) {
        waitingQueue.splice(queueIdx, 1);
        log(`   🗑️  Removed User ${id.substring(0, 8)}... (${id}) from queue (was already there)`, 'info');
        logWaitingQueue();
      }
      
      // Place requester back in queue (at the end)
      waitingQueue.push(id);
      log(`   📋 Requeued User ${id.substring(0, 8)}... (${id})`, 'info');
      log(`   Queue length: ${waitingQueue.length}`, 'info');
      logWaitingQueue();
      broadcastQueueCount();
      
      // Try to pair immediately
      tryPair();
    }

    if (type === 'signal') {
      // forward signaling data to target
      const { to, data } = msg;
      const signalType = data?.type || 'unknown';
      log(`📡 SIGNAL: User ${id.substring(0, 8)}... → User ${to.substring(0, 8)}... (${signalType})`, 'info');
      
      const target = clients.get(to);
      if (target && target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify({ type: 'signal', from: id, data }));
        log(`   ✓ Signal forwarded successfully`, 'success');
      } else {
        log(`   ✗ Target user ${to.substring(0, 8)}... not found or connection closed`, 'error');
      }
    }

    if (type === 'leave') {
      // client voluntarily leaves a room
      log(`🚪 LEAVE: User ${id.substring(0, 8)}... is leaving`, 'warning');
      const peer = pairs.get(id);
      if (peer) {
        pairs.delete(id);
        pairs.delete(peer);
        log(`   ✂️  Unpaired: User ${id.substring(0, 8)}... ↔ User ${peer.substring(0, 8)}...`, 'info');
        const pws = clients.get(peer);
        if (pws && pws.readyState === WebSocket.OPEN) {
          pws.send(JSON.stringify({ type: 'partner_left' }));
          log(`   📤 Sent 'partner_left' to User ${peer.substring(0, 8)}...`, 'info');
          if (!waitingQueue.includes(peer)) {
            waitingQueue.push(peer);
            log(`   📋 Requeued User ${peer.substring(0, 8)}... (${peer})`, 'info');
            logWaitingQueue();
          }
        }
      }
      // remove from queue if present
      const idx = waitingQueue.indexOf(id);
      if (idx !== -1) {
        waitingQueue.splice(idx, 1);
        log(`   🗑️  Removed User ${id.substring(0, 8)}... (${id}) from queue`, 'info');
        logWaitingQueue();
      }
      broadcastQueueCount();
    }
  });

  ws.on('close', () => {
    const username = usernames.get(id) || 'Guest';
    log(`🔴 DISCONNECT: ${username} (${id.substring(0, 8)}...) disconnected`, 'error');
    clients.delete(id);
    usernames.delete(id);
    log(`   Total clients: ${clients.size}`, 'info');
    
    // remove from queue
    const idx = waitingQueue.indexOf(id);
    if (idx !== -1) {
      waitingQueue.splice(idx, 1);
      log(`   🗑️  Removed User ${id.substring(0, 8)}... (${id}) from queue`, 'info');
      logWaitingQueue();
    }
    
    // notify peer if paired
    const peer = pairs.get(id);
    if (peer) {
      pairs.delete(id);
      pairs.delete(peer);
      log(`   ✂️  Unpaired: User ${id.substring(0, 8)}... ↔ User ${peer.substring(0, 8)}...`, 'info');
      const pws = clients.get(peer);
      if (pws && pws.readyState === WebSocket.OPEN) {
        pws.send(JSON.stringify({ type: 'partner_left' }));
        log(`   📤 Sent 'partner_left' to User ${peer.substring(0, 8)}...`, 'info');
        if (!waitingQueue.includes(peer)) {
          waitingQueue.push(peer);
          log(`   📋 Requeued User ${peer.substring(0, 8)}... (${peer})`, 'info');
          logWaitingQueue();
        }
      }
    }
    broadcastOnlineCount();
    broadcastQueueCount();
  });
});

log(`🚀 Signaling server running on ws://0.0.0.0:${PORT}`, 'success');
log(`🌐 Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`, 'info');

