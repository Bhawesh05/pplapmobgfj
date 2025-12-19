document.addEventListener('DOMContentLoaded', function() {
    const createBtn = document.getElementById('createSession');
    const sessionLinksDiv = document.getElementById('sessionLinks');
    const connectionStatus = document.getElementById('connectionStatus');
    const qrSection = document.querySelector('.qr-section');
    
    let socket = null;
    let currentSessionId = null;
    let qrcode = null;
    
    if (createBtn) {
        createBtn.addEventListener('click', createNewSession);
    }
    
    // Set up copy buttons
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-copy') || e.target.closest('.btn-copy')) {
            const btn = e.target.classList.contains('btn-copy') ? e.target : e.target.closest('.btn-copy');
            const targetId = btn.getAttribute('data-target');
            const text = document.getElementById(targetId).textContent;
            copyToClipboard(text);
            
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            btn.style.background = 'linear-gradient(to right, #28a745, #20c997)';
            
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = 'linear-gradient(to right, #007bff, #0056b3)';
            }, 2000);
        }
    });
    
    function createNewSession() {
        createBtn.disabled = true;
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Session...';
        
        fetch('/create-session')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
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
                        document.getElementById("qrcode").innerHTML = "";
                    }
                    qrcode = new QRCode(document.getElementById("qrcode"), {
                        text: data.mobileUrl,
                        width: 200,
                        height: 200,
                        colorDark: "#2c3e50",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                    qrSection.classList.remove('hidden');
                }
                
                // Connect to socket
                connectToSocket(data.sessionId);
                
                createBtn.innerHTML = '<i class="fas fa-check"></i> Session Created!';
                
                // Start checking connection status
                checkConnectionStatus();
                
                // Smooth scroll to session links
                sessionLinksDiv.scrollIntoView({ behavior: 'smooth' });
            })
            .catch(error => {
                console.error('Error:', error);
                createBtn.disabled = false;
                createBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Create New Session';
                alert('Failed to create session. Please check your internet connection and try again.');
            });
    }
    
    function connectToSocket(sessionId) {
        socket = io();
        
        socket.on('connect', () => {
            console.log('Connected to server');
            updateStatus('<i class="fas fa-sync fa-spin"></i> Waiting for devices to connect...', 'disconnected');
            
            socket.emit('join-session', { 
                sessionId: sessionId, 
                deviceType: 'server' 
            });
        });
        
        socket.on('connection-status', (data) => {
            updateConnectionDisplay(data);
        });
        
        socket.on('partner-connected', (data) => {
            const device = data.deviceType === 'laptop' ? 'Laptop' : 'Mobile';
            const icon = data.deviceType === 'laptop' ? 'fa-laptop' : 'fa-mobile-alt';
            updateStatus(`<i class="fas ${icon}"></i> ${device} connected!`, 'connected');
        });
        
        socket.on('partner-disconnected', (data) => {
            const device = data.deviceType === 'laptop' ? 'Laptop' : 'Mobile';
            updateStatus(`<i class="fas fa-exclamation-triangle"></i> ${device} disconnected`, 'disconnected');
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
            statusText = '<i class="fas fa-check-circle"></i> ✅ Both devices connected! Ready to go!';
            statusClass = 'connected';
        } else if (laptopConnected) {
            statusText = '<i class="fas fa-laptop"></i> 📺 Laptop connected, waiting for mobile...';
            statusClass = 'disconnecting';
        } else if (mobileConnected) {
            statusText = '<i class="fas fa-mobile-alt"></i> 📱 Mobile connected, waiting for laptop...';
            statusClass = 'disconnecting';
        } else {
            statusText = '<i class="fas fa-sync fa-spin"></i> ⏳ Waiting for devices to connect...';
            statusClass = 'disconnected';
        }
        
        updateStatus(statusText, statusClass);
    }
    
    function updateStatus(message, className) {
        if (connectionStatus) {
            connectionStatus.innerHTML = message;
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
            })
            .catch(error => {
                console.error('Error checking status:', error);
            });
        
        // Check every 3 seconds
        setTimeout(checkConnectionStatus, 3000);
    }
    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('Text copied to clipboard');
        }).catch(err => {
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
    
    // Add animation to features on scroll
    const features = document.querySelectorAll('.feature');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });
    
    features.forEach(feature => {
        feature.style.opacity = '0';
        feature.style.transform = 'translateY(20px)';
        feature.style.transition = 'all 0.5s ease';
        observer.observe(feature);
    });
});
