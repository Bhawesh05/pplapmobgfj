document.addEventListener('DOMContentLoaded', function() {
    // Get session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('id');
    
    // DOM elements
    const startBtn = document.getElementById('startSharing');
    const stopBtn = document.getElementById('stopSharing');
    const screenVideo = document.getElementById('screenVideo');
    const screenCanvas = document.getElementById('screenCanvas');
    const statusDiv = document.getElementById('connectionStatus');
    const sessionIdDisplay = document.getElementById('sessionIdDisplay');
    const qualitySelect = document.getElementById('qualitySelect');
    
    // Variables
    let socket = null;
    let mediaStream = null;
    let screenStream = null;
    let canvasContext = null;
    let isSharing = false;
    let captureInterval = null;
    let currentQuality = 'medium';
    
    // Quality settings
    const qualitySettings = {
        low: { width: 640, height: 480, interval: 300 },
        medium: { width: 1024, height: 768, interval: 200 },
        high: { width: 1280, height: 720, interval: 100 }
    };
    
    // Initialize
    if (sessionId) {
        sessionIdDisplay.textContent = sessionId;
        connectToSocket();
    } else {
        statusDiv.textContent = '❌ No session ID found. Please go back and create a session.';
        startBtn.disabled = true;
    }
    
    // Set up canvas context
    if (screenCanvas) {
        canvasContext = screenCanvas.getContext('2d');
        screenCanvas.width = 800;
        screenCanvas.height = 600;
    }
    
    // Event listeners
    if (startBtn) startBtn.addEventListener('click', startScreenShare);
    if (stopBtn) stopBtn.addEventListener('click', stopScreenShare);
    if (qualitySelect) qualitySelect.addEventListener('change', updateQuality);
    
    // Socket.io connection
    function connectToSocket() {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to server');
            socket.emit('join-session', { 
                sessionId: sessionId, 
                deviceType: 'laptop' 
            });
            updateStatus('✅ Connected. Waiting for mobile...', 'disconnected');
        });
        
        socket.on('partner-connected', (data) => {
            if (data.deviceType === 'mobile') {
                updateStatus('📱 Mobile connected! Ready to share screen.', 'connected');
            }
        });
        
        socket.on('partner-disconnected', (data) => {
            if (data.deviceType === 'mobile') {
                updateStatus('📱 Mobile disconnected', 'disconnected');
            }
        });
        
        socket.on('control-command', handleControlCommand);
        
        socket.on('mouse-position', (data) => {
            // Could draw mouse cursor on canvas here
            console.log('Mouse position:', data.x, data.y);
        });
        
        socket.on('error', (message) => {
            alert('Error: ' + message);
        });
    }
    
    // Start screen sharing
    async function startScreenShare() {
        try {
            updateStatus('🔄 Requesting screen share...', 'disconnecting');
            
            // Get screen stream
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                    frameRate: { ideal: 10, max: 15 }
                },
                audio: false
            });
            
            // Display in video element
            screenVideo.srcObject = screenStream;
            screenVideo.play();
            
            // Start capturing frames
            startCapturing();
            
            // Update UI
            startBtn.disabled = true;
            stopBtn.disabled = false;
            isSharing = true;
            
            updateStatus('📺 Screen sharing active! Mobile can now see and control.', 'connected');
            
            // Handle when user stops sharing via browser UI
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                stopScreenShare();
            });
            
        } catch (error) {
            console.error('Error starting screen share:', error);
            updateStatus('❌ Failed to share screen. Please try again.', 'disconnected');
        }
    }
    
    // Stop screen sharing
    function stopScreenShare() {
        if (captureInterval) {
            clearInterval(captureInterval);
            captureInterval = null;
        }
        
        if (screenStream) {
            screenStream.getTracks().forEach(track => track.stop());
            screenStream = null;
        }
        
        screenVideo.srcObject = null;
        
        startBtn.disabled = false;
        stopBtn.disabled = true;
        isSharing = false;
        
        updateStatus('⏸️ Screen sharing stopped', 'disconnected');
    }
    
    // Capture and send screen frames
    function startCapturing() {
        const settings = qualitySettings[currentQuality];
        
        captureInterval = setInterval(() => {
            if (!screenStream || !canvasContext) return;
            
            try {
                // Draw current video frame to canvas
                canvasContext.drawImage(screenVideo, 0, 0, settings.width, settings.height);
                
                // Get image data as JPEG (compressed)
                const imageData = screenCanvas.toDataURL('image/jpeg', 0.7);
                
                // Send to mobile via socket
                if (socket && socket.connected) {
                    socket.emit('screen-data', {
                        sessionId: sessionId,
                        imageData: imageData
                    });
                }
            } catch (error) {
                console.error('Error capturing frame:', error);
            }
        }, settings.interval);
    }
    
    // Handle control commands from mobile
    function handleControlCommand(data) {
        console.log('Control command:', data.event, data.details);
        
        // In a real implementation, you would simulate these events
        // For now, we'll just log them
        switch(data.event) {
            case 'click':
                simulateClick(data.details.x, data.details.y);
                break;
            case 'rightClick':
                simulateRightClick(data.details.x, data.details.y);
                break;
            case 'scrollUp':
                simulateScroll('up');
                break;
            case 'scrollDown':
                simulateScroll('down');
                break;
            case 'keypress':
                simulateKeyPress(data.details.key);
                break;
        }
    }
    
    // Simulation functions (for demonstration)
    function simulateClick(x, y) {
        console.log(`Simulating click at (${x}, ${y})`);
        // In a real app, you would use robotjs or similar for actual control
    }
    
    function simulateRightClick(x, y) {
        console.log(`Simulating right click at (${x}, ${y})`);
    }
    
    function simulateScroll(direction) {
        console.log(`Simulating scroll ${direction}`);
    }
    
    function simulateKeyPress(key) {
        console.log(`Simulating key press: ${key}`);
    }
    
    // Update quality setting
    function updateQuality() {
        currentQuality = qualitySelect.value;
        if (isSharing) {
            stopScreenShare();
            setTimeout(startScreenShare, 500);
        }
    }
    
    // Update status display
    function updateStatus(message, className) {
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + className;
    }
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        stopScreenShare();
        if (socket) {
            socket.disconnect();
        }
    });
});
