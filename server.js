const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Socket.io with CORS for Vercel
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store active sessions (in-memory - will use Supabase later)
const sessions = new Map();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/laptop', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'laptop.html'));
});

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// API to create new session
app.get('/create-session', (req, res) => {
  const sessionId = uuidv4().substring(0, 8);
  sessions.set(sessionId, {
    laptop: null,
    mobile: null,
    createdAt: Date.now()
  });
  
  // For Vercel deployment - use the request's origin
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  const baseUrl = `${protocol}://${host}`;
  
  res.json({ 
    sessionId: sessionId,
    laptopUrl: `${baseUrl}/laptop?id=${sessionId}`,
    mobileUrl: `${baseUrl}/mobile?id=${sessionId}`
  });
});

// Get session status
app.get('/session-status/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (session) {
    res.json({
      exists: true,
      laptopConnected: !!session.laptop,
      mobileConnected: !!session.mobile
    });
  } else {
    res.json({ exists: false });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  socket.on('join-session', (data) => {
    const { sessionId, deviceType } = data;
    
    if (!sessions.has(sessionId)) {
      socket.emit('error', 'Session not found');
      return;
    }
    
    const session = sessions.get(sessionId);
    
    if (deviceType === 'laptop') {
      session.laptop = socket.id;
    } else if (deviceType === 'mobile') {
      session.mobile = socket.id;
    }
    
    socket.join(sessionId);
    sessions.set(sessionId, session);
    
    // Notify other device
    socket.to(sessionId).emit('partner-connected', { deviceType });
    
    // Send connection status to both
    io.to(sessionId).emit('connection-status', {
      laptopConnected: !!session.laptop,
      mobileConnected: !!session.mobile
    });
    
    console.log(`Device ${deviceType} joined session ${sessionId}`);
  });
  
  // Handle screen data from laptop
  socket.on('screen-data', (data) => {
    const { sessionId, imageData } = data;
    socket.to(sessionId).emit('screen-update', imageData);
  });
  
  // Handle mobile controls
  socket.on('control-event', (data) => {
    const { sessionId, event, details } = data;
    socket.to(sessionId).emit('control-command', { event, details });
  });
  
  // Handle mouse move
  socket.on('mouse-move', (data) => {
    const { sessionId, x, y } = data;
    socket.to(sessionId).emit('mouse-position', { x, y });
  });
  
  socket.on('disconnect', () => {
    // Find and clean up disconnected sessions
    for (const [sessionId, session] of sessions.entries()) {
      if (session.laptop === socket.id) {
        session.laptop = null;
        io.to(sessionId).emit('partner-disconnected', { deviceType: 'laptop' });
      }
      if (session.mobile === socket.id) {
        session.mobile = null;
        io.to(sessionId).emit('partner-disconnected', { deviceType: 'mobile' });
      }
      
      // Remove session if both devices disconnected
      if (!session.laptop && !session.mobile) {
        sessions.delete(sessionId);
      } else {
        sessions.set(sessionId, session);
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

// Vercel provides PORT environment variable
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// Export for Vercel serverless
module.exports = app;
