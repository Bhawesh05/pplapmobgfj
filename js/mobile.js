document.addEventListener('DOMContentLoaded', function() {
    // Get session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('id');
    
    // DOM elements
    const remoteScreen = document.getElementById('remoteScreen');
    const statusDiv = document.getElementById('connectionStatus');
    const touchOverlay = document.getElementById('touchOverlay');
    const controlButtons = document.querySelectorAll('.control-btn');
    
    // Variables
    let socket = null;
    let isConnected = false;
    let screenWidth = 1;
    let screenHeight = 1;
    let lastTouch = null;
    
    // Initialize
    if (sessionId) {
        connectToSocket();
        setupTouchControls();
    } else {
        statusDiv.textContent = '❌ No session ID found. Please scan QR code or use correct link.';
    }
    
    // Set up control buttons
    controlButtons.forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleControlAction(action);
        });
    });
    
    // Socket.io connection
    function connectToSocket() {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to server');
            socket.emit('join-session', { 
                sessionId: sessionId, 
                deviceType: 'mobile' 
            });
            updateStatus('✅ Connected. Waiting for laptop screen...', 'disconnected');
        });
        
        socket.on('partner-connected', (data) => {
            if (data.deviceType === 'laptop') {
                updateStatus('📺 Laptop connected! Waiting for screen...', 'connected');
            }
        });
        
        socket.on('partner-disconnected', (data) => {
            if (data.deviceType === 'laptop') {
                updateStatus('📺 Laptop disconnected', 'disconnected');
                remoteScreen.src = '';
            }
        });
        
        socket.on('screen-update', (imageData) => {
            if (!isConnected) {
                isConnected = true;
                updateStatus('📺 Screen connected! Touch to control.', 'connected');
            }
            
            // Update screen image
            remoteScreen.src = imageData;
            
            // Extract screen dimensions from image (approximate)
            const img = new Image();
            img.onload = function() {
                screenWidth = this.width;
                screenHeight = this.height;
            };
            img.src = imageData;
        });
        
        socket.on('error', (message) => {
            alert('Error: ' + message);
        });
    }
    
    // Set up touch controls
    function setupTouchControls() {
        if (!touchOverlay) return;
        
        let isTouching = false;
        let startX, startY;
        
        touchOverlay.addEventListener('touchstart', function(e) {
            e.preventDefault();
            if (!isConnected) return;
            
            const touch = e.touches[0];
            const rect = touchOverlay.getBoundingClientRect();
            
            // Calculate position relative to screen
            const x = ((touch.clientX - rect.left) / rect.width) * screenWidth;
            const y = ((touch.clientY - rect.top) / rect.height) * screenHeight;
            
            startX = x;
            startY = y;
            isTouching = true;
            
            // Send mouse move
            socket.emit('mouse-move', {
                sessionId: sessionId,
                x: Math.round(x),
                y: Math.round(y)
            });
            
            lastTouch = { x, y, time: Date.now() };
        });
        
        touchOverlay.addEventListener('touchmove', function(e) {
            e.preventDefault();
            if (!isConnected || !isTouching) return;
            
            const touch = e.touches[0];
            const rect = touchOverlay.getBoundingClientRect();
            
            const x = ((touch.clientX - rect.left) / rect.width) * screenWidth;
            const y = ((touch.clientY - rect.top) / rect.height) * screenHeight;
            
            // Send mouse move
            socket.emit('mouse-move', {
                sessionId: sessionId,
                x: Math.round(x),
                y: Math.round(y)
            });
            
            lastTouch = { x, y, time: Date.now() };
        });
        
        touchOverlay.addEventListener('touchend', function(e) {
            e.preventDefault();
            if (!isConnected || !isTouching) return;
            
            isTouching = false;
            
            // Determine if it was a click or drag
            if (lastTouch && Date.now() - lastTouch.time < 200) {
                // It's a click
                sendControlEvent('click', {
                    x: Math.round(lastTouch.x),
                    y: Math.round(lastTouch.y)
                });
            }
        });
        
        // Double tap for right click
        let lastTap = 0;
        touchOverlay.addEventListener('touchend', function(e) {
            if (!isConnected) return;
            
            const currentTime = Date.now();
            const tapLength = currentTime - lastTap;
            
            if (tapLength < 300 && tapLength > 0) {
                // Double tap detected - right click
                const rect = touchOverlay.getBoundingClientRect();
                const touch = e.changedTouches[0];
                
                const x = ((touch.clientX - rect.left) / rect.width) * screenWidth;
                const y = ((touch.clientY - rect.top) / rect.height) * screenHeight;
                
                sendControlEvent('rightClick', {
                    x: Math.round(x),
                    y: Math.round(y)
                });
            }
            
            lastTap = currentTime;
        });
    }
    
    // Handle control button actions
    function handleControlAction(action) {
        if (!isConnected) {
            alert('Please wait for laptop screen to connect');
            return;
        }
        
        switch(action) {
            case 'click':
                // Simulate click at center
                sendControlEvent('click', {
                    x: Math.round(screenWidth / 2),
                    y: Math.round(screenHeight / 2)
                });
                break;
                
            case 'rightClick':
                sendControlEvent('rightClick', {
                    x: Math.round(screenWidth / 2),
                    y: Math.round(screenHeight / 2)
                });
                break;
                
            case 'scrollUp':
                sendControlEvent('scrollUp', { amount: 100 });
                break;
                
            case 'scrollDown':
                sendControlEvent('scrollDown', { amount: 100 });
                break;
                
            case 'keyboard':
                const key = prompt('Enter key to press (e.g., "Enter", "Tab", "a", "b"):');
                if (key) {
                    sendControlEvent('keypress', { key: key });
                }
                break;
                
            case 'back':
                window.history.back();
                break;
        }
    }
    
    // Send control event to laptop
    function sendControlEvent(event, details) {
        if (socket && socket.connected) {
            socket.emit('control-event', {
                sessionId: sessionId,
                event: event,
                details: details
            });
        }
    }
    
    // Update status display
    function updateStatus(message, className) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + className;
    }
    
    // Keyboard support
    document.addEventListener('keydown', function(e) {
        if (!isConnected) return;
        
        // Prevent default for certain keys
        if ([32, 37, 38, 39, 40].includes(e.keyCode)) {
            e.preventDefault();
        }
        
        sendControlEvent('keypress', { key: e.key });
    });
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (socket) {
            socket.disconnect();
        }
    });
});
