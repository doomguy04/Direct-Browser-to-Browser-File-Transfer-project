// P2P WebRTC Connection Manager with backpressure support and index-prefixed packets

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:stun.twilio.com:3478' }
  ]
};

export class P2PConnection {
  constructor(socket, roomId, role, targetPeerId, options = {}) {
    this.socket = socket;
    this.roomId = roomId;
    this.role = role;
    this.targetPeerId = targetPeerId;
    this.peerConnection = null;
    this.dataChannel = null;
    
    // Callback registers
    this.onStateChange = options.onStateChange || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this.onChunkReceived = options.onChunkReceived || (() => {});
    this.onError = options.onError || (() => {});
    
    // Transfer variables
    this.isSending = false;
    this.isPaused = false;
    this.sendOffsetIndex = 0;
    this.chunkSize = 16384; // 16KB chunks
    this.iceCandidatesQueue = []; // Queue for candidates arriving before remote description is set

    this.init();
  }

  init() {
    try {
      this.peerConnection = new RTCPeerConnection(ICE_SERVERS);
      console.log('RTCPeerConnection initialized');

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          // Send ICE candidate to signaling peer
          this.socket.emit('signal', {
            to: this.targetPeerId,
            signalData: { type: 'candidate', candidate: event.candidate }
          });
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection.connectionState;
        console.log(`WebRTC Connection State Changed: ${state}`);
        this.onStateChange(state);
      };

      if (this.role === 'sender') {
        // Sender creates the Data Channel
        this.dataChannel = this.peerConnection.createDataChannel('fileTransfer', {
          ordered: true
        });
        this.setupDataChannelEvents();
      } else {
        // Receiver waits for the Data Channel
        this.peerConnection.ondatachannel = (event) => {
          this.dataChannel = event.channel;
          this.setupDataChannelEvents();
        };
      }
    } catch (err) {
      console.error('Failed to initialize WebRTC:', err);
      this.onError(err);
    }
  }

  setupDataChannelEvents() {
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      console.log('Data channel opened successfully');
      this.onStateChange('data-channel-open');
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
      this.onStateChange('data-channel-closed');
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.onError(error);
    };

    if (this.role === 'receiver') {
      this.dataChannel.onmessage = (event) => {
        this.handleIncomingChunk(event.data);
      };
    }
  }

  // Handle WebRTC signal relay from Socket.io
  async handleSignal(signalData) {
    try {
      if (signalData.type === 'offer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signalData));
        await this.processBufferedCandidates();
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        this.socket.emit('signal', {
          to: this.targetPeerId,
          signalData: answer
        });
      } else if (signalData.type === 'answer') {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(signalData));
        await this.processBufferedCandidates();
      } else if (signalData.type === 'candidate') {
        if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
          await this.peerConnection.addIceCandidate(signalData.candidate);
        } else {
          this.iceCandidatesQueue.push(signalData.candidate);
        }
      }
    } catch (err) {
      console.error('Error handling WebRTC signal:', err);
      this.onError(err);
    }
  }

  async processBufferedCandidates() {
    if (this.iceCandidatesQueue.length === 0) return;
    console.log(`Processing ${this.iceCandidatesQueue.length} buffered ICE candidates`);
    while (this.iceCandidatesQueue.length > 0) {
      const candidate = this.iceCandidatesQueue.shift();
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (err) {
        console.error('Error adding buffered ICE candidate:', err);
      }
    }
  }

  // Initiate WebRTC handshake (Offer)
  async initiateHandshake() {
    if (this.role !== 'sender') return;
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      this.socket.emit('signal', {
        to: this.targetPeerId,
        signalData: offer
      });
    } catch (err) {
      console.error('Error initiating WebRTC handshake:', err);
      this.onError(err);
    }
  }

  // Receiver processing incoming chunk packet
  handleIncomingChunk(arrayBuffer) {
    // Read the chunk index (4 bytes)
    const view = new DataView(arrayBuffer);
    const index = view.getUint32(0, false);
    
    // Encrypted payload starts at index 4
    const encryptedData = arrayBuffer.slice(4);
    
    this.onChunkReceived(index, encryptedData);
  }

  // Sender transferring a file using chunking and backpressure control
  async sendFile(file, encryptionKey, startFromIndex = 0) {
    if (this.isSending && startFromIndex === 0) return;
    this.isSending = true;
    this.isPaused = false;
    this.sendOffsetIndex = startFromIndex;

    const totalChunks = Math.ceil(file.size / this.chunkSize);
    console.log(`Starting transfer. Chunks: ${totalChunks}. Resuming from: ${this.sendOffsetIndex}`);

    const startTime = Date.now();
    let lastProgressTime = startTime;
    let bytesSentSinceLastInterval = 0;

    // Load crypto module dynamically to avoid bundle issues
    const { encryptChunk } = await import('./crypto.js');

    this.dataChannel.bufferedAmountLowThreshold = 65536; // 64KB threshold

    while (this.sendOffsetIndex < totalChunks && this.isSending && !this.isPaused) {
      if (this.dataChannel.readyState !== 'open') {
        console.warn('Data channel closed mid-transfer');
        this.isSending = false;
        break;
      }

      // Check for backpressure (limit queued buffer size to 1MB)
      if (this.dataChannel.bufferedAmount > 1048576) {
        await new Promise((resolve) => {
          this.dataChannel.onbufferedamountlow = () => {
            this.dataChannel.onbufferedamountlow = null;
            resolve();
          };
        });
      }

      const offset = this.sendOffsetIndex * this.chunkSize;
      const slice = file.slice(offset, offset + this.chunkSize);
      const arrayBuffer = await slice.arrayBuffer();
      
      try {
        // Encrypt the slice
        const encryptedBuffer = await encryptChunk(arrayBuffer, encryptionKey);
        
        // Build packet: [4-byte Index] + [Encrypted Chunk Buffer]
        const packet = new Uint8Array(4 + encryptedBuffer.byteLength);
        const view = new DataView(packet.buffer);
        view.setUint32(0, this.sendOffsetIndex, false);
        packet.set(new Uint8Array(encryptedBuffer), 4);
        
        // Send packet
        this.dataChannel.send(packet.buffer);
        
        // Progress tracking calculations
        const bytesSent = arrayBuffer.byteLength;
        bytesSentSinceLastInterval += bytesSent;
        this.sendOffsetIndex++;

        const now = Date.now();
        if (now - lastProgressTime >= 300 || this.sendOffsetIndex === totalChunks) {
          const timeElapsed = (now - lastProgressTime) / 1000; // seconds
          const speedBytesPerSec = bytesSentSinceLastInterval / timeElapsed;
          
          this.onProgress(this.sendOffsetIndex, totalChunks, speedBytesPerSec);
          
          bytesSentSinceLastInterval = 0;
          lastProgressTime = now;
        }
      } catch (err) {
        console.error('Encryption/Send failure:', err);
        this.onError(err);
        this.isSending = false;
        break;
      }
    }

    if (this.sendOffsetIndex === totalChunks) {
      this.isSending = false;
      console.log('Transfer complete from sender perspective');
    }
  }

  pauseTransfer() {
    this.isPaused = true;
    console.log(`Transfer paused at chunk index: ${this.sendOffsetIndex}`);
  }

  resumeTransfer() {
    this.isPaused = false;
    console.log('Transfer resumed');
  }

  cancelTransfer() {
    this.isSending = false;
    this.isPaused = false;
    this.sendOffsetIndex = 0;
    console.log('Transfer cancelled');
  }

  // Cleanup peer connection
  close() {
    this.isSending = false;
    this.isPaused = false;
    
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    console.log('P2P Connection cleaned up');
  }
}
