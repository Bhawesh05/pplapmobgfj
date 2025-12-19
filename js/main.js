document.addEventListener('DOMContentLoaded', function() {
    const createBtn = document.getElementById('createSession');
    const sessionLinksDiv = document.getElementById('sessionLinks');
    const connectionStatus = document.getElementById('connectionStatus');
    const qrSection = document.getElementById('qrSection');
    
    let socket = null;
    let currentSessionId = null;
    let qrcode = null;
    
    if (createBtn) {
        createBtn.addEventListener('click', createNewSession);
    }
    
    // Set up copy buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-copy')) {
            const targetId = e.target.getAttribute('data-target');
            const text = document.getElementById(targetId).textContent;
            copyToClipboard(text);
            e.target.textContent = 'Copied!';
            setTimeout(() => {
                e.target.textContent = 'Copy Link';
            }, 2000);
        }
    });
    
    function createNewSession() {
        createBtn.disabled = true;
        createBtn.textContent = 'Creating Session...';
        
        fetch('/create-session')
            .then(response => response.json())
            .then(data => {
                currentSessionId = data.sessionId;
                
                // Display links
                document.getElementById('laptopUrl').textContent = data.laptopUrl;
                document.getElementById('mobileUrl').textContent = data.mobileUrl;
                
                // Show session links
                sessionLinksDiv.classList.remove('hidden');
                
                // Generate QR code for mobile
                if (typeof QRCode !== 'undefined') {
                    if (qrcode) {
                        qrcode.clear();
                    }
                    qrcode = new QRCode(document.getElementById("qrcode"), {
                        text: data.mobileUrl,
                        width: 200,
                        height: 200,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                    qrSection.classList.remove('hidden');
                }
                
                // Connect to socket
                connectToSocket(data.sessionId);
                
                createBtn.textContent = 'Session Created!';
                
                // Start checking connection status
                checkConnectionStatus();
            })
            .catch(error => {
                console.error('Error:', error);
                createBtn.disabled = false;
                createBtn.textContent = 'Create New Session';
                alert('Failed to create session. Please try again.');
            });
    }
    
    function connectToSocket(sessionId) {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to server');
            updateStatus('Waiting for devices to connect...', 'disconnected');
        });
        
        socket.on('connection-status', (data) => {
            updateConnectionDisplay(data);
        });
        
        socket.on('partner-connected', (data) => {
            const device = data.deviceType === 'laptop' ? 'Laptop' : 'Mobile';
            updateStatus(`${device} connected!`, 'connected');
        });
        
        socket.on('partner-disconnected', (data) => {
            const device = data.deviceType === 'laptop' ? 'Laptop' : 'Mobile';
            updateStatus(`${device} disconnected`, 'disconnected');
        });
        
        socket.on('error', (message) => {
            alert('Error: ' + message);
        });
    }
    
    function updateConnectionDisplay(data) {
        const laptopConnected = data.laptopConnected;
        const mobileConnected = data.mobileConnected;
        
        let statusText = '';
        let statusClass = 'disconnected';
        
        if (laptopConnected && mobileConnected) {
            statusText = '✅ Both devices connected! Ready to go!';
            statusClass = 'connected';
        } else if (laptopConnected) {
            statusText = '📺 Laptop connected, waiting for mobile...';
            statusClass = 'disconnecting';
        } else if (mobileConnected) {
            statusText = '📱 Mobile connected, waiting for laptop...';
            statusClass = 'disconnecting';
        } else {
            statusText = '⏳ Waiting for devices to connect...';
            statusClass = 'disconnected';
        }
        
        updateStatus(statusText, statusClass);
    }
    
    function updateStatus(message, className) {
        if (connectionStatus) {
            connectionStatus.textContent = message;
            connectionStatus.className = 'status ' + className;
        }
    }
    
    function checkConnectionStatus() {
        if (!currentSessionId) return;
        
        fetch(`/session-status/${currentSessionId}`)
            .then(response => response.json())
            .then(data => {
                if (data.exists) {
                    updateConnectionDisplay(data);
                }
            });
        
        // Check every 3 seconds
        setTimeout(checkConnectionStatus, 3000);
    }
    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).catch(err => {
            console.error('Failed to copy: ', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        });
    }
});
