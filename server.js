const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Vercel-specific Socket.io configuration
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Store active sessions
const sessions = new Map();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'remote-screen-control',
    timestamp: new Date().toISOString(),
    sessions: sessions.size
  });
});

// Create new session
app.get('/api/create-session', (req, res) => {
  try {
    const sessionId = uuidv4().substring(0, 8);
    
    // Get base URL for Vercel
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    
    sessions.set(sessionId, {
      id: sessionId,
      laptop: null,
      mobile: null,
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
    
    res.json({ 
      success: true,
      sessionId: sessionId,
      laptopUrl: `${baseUrl}/laptop.html?id=${sessionId}`,
      mobileUrl: `${baseUrl}/mobile.html?id=${sessionId}`,
      qrData: `${baseUrl}/mobile.html?id=${sessionId}`,
      createdAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ success: false, error: 'Failed to create session' });
  }
});

// Get session status
app.get('/api/session/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (session) {
    session.lastActivity = Date.now();
    res.json({
      success: true,
      exists: true,
      id: session.id,
      laptopConnected: !!session.laptop,
      mobileConnected: !!session.mobile,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    });
  } else {
    res.json({ success: false, exists: false });
  }
});

// Redirect routes for better UX
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/laptop', (req, res) => {
  const sessionId = req.query.id;
  if (sessionId) {
    res.redirect(`/laptop.html?id=${sessionId}`);
  } else {
    res.redirect('/');
  }
});

app.get('/mobile', (req, res) => {
  const sessionId = req.query.id;
  if (sessionId) {
    res.redirect(`/mobile.html?id=${sessionId}`);
  } else {
    res.redirect('/');
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  socket.on('join-session', (data) => {
    try {
      const { sessionId, deviceType } = data;
      console.log(`📱 ${deviceType} joining session: ${sessionId}`);
      
      if (!sessions.has(sessionId)) {
        socket.emit('error', { message: 'Session not found. Please create a new session.' });
        return;
      }
      
      const session = sessions.get(sessionId);
      
      // Store device connection
      if (deviceType === 'laptop') {
        session.laptop = socket.id;
      } else if (deviceType === 'mobile') {
        session.mobile = socket.id;
      }
      
      session.lastActivity = Date.now();
      socket.join(sessionId);
      sessions.set(sessionId, session);
      
      // Notify other device in the session
      socket.to(sessionId).emit('partner-connected', { 
        deviceType,
        timestamp: new Date().toISOString()
      });
      
      // Send current connection status
      io.to(sessionId).emit('connection-status', {
        laptopConnected: !!session.laptop,
        mobileConnected: !!session.mobile,
        sessionId: sessionId
      });
      
      console.log(`✅ ${deviceType} joined session ${sessionId}`);
      
    } catch (error) {
      console.error('Error in join-session:', error);
      socket.emit('error', { message: 'Server error' });
    }
  });
  
  // Screen data from laptop
  socket.on('screen-data', (data) => {
    const { sessionId, imageData } = data;
    socket.to(sessionId).emit('screen-update', imageData);
  });
  
  // Control events from mobile
  socket.on('control-event', (data) => {
    const { sessionId, event, details } = data;
    socket.to(sessionId).emit('control-command', { event, details });
  });
  
  // Mouse movement
  socket.on('mouse-move', (data) => {
    const { sessionId, x, y } = data;
    socket.to(sessionId).emit('mouse-position', { x, y });
  });
  
  // Disconnection handling
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
    
    for (const [sessionId, session] of sessions.entries()) {
      if (session.laptop === socket.id) {
        session.laptop = null;
        io.to(sessionId).emit('partner-disconnected', { deviceType: 'laptop' });
      }
      if (session.mobile === socket.id) {
        session.mobile = null;
        io.to(sessionId).emit('partner-disconnected', { deviceType: 'mobile' });
      }
      
      // Update session
      if (session.laptop || session.mobile) {
        sessions.set(sessionId, session);
      }
    }
  });
});

// Clean up old sessions (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  let cleaned = 0;
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > oneHour) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} old sessions`);
  }
}, 5 * 60 * 1000);

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
});

// Export for Vercel
module.exports = app;
