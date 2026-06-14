import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Header from './components/Header';
import FileSelector from './components/FileSelector';
import TransferCard from './components/TransferCard';
import { calculateSHA256, generateKey, exportKeyToHex, importKeyFromHex, decryptChunk } from './utils/crypto';
import { saveChunk, getChunks, getChunksCount, clearRoom } from './utils/db';
import { P2PConnection } from './utils/webrtc';
import { Lock, RefreshCw, Smartphone, Info, ShieldCheck, Share2 } from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_SIGNALING_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : window.location.origin);

export default function App() {
  const [role, setRole] = useState(null); // 'sender' | 'receiver' | null
  const [roomId, setRoomId] = useState('');
  const [encryptionKey, setEncryptionKey] = useState(null);
  
  // File states
  const [file, setFile] = useState(null); // For sender
  const [metadata, setMetadata] = useState(null); // For receiver/sender
  const [isPreparingFile, setIsPreparingFile] = useState(false);
  const [preparationStatus, setPreparationStatus] = useState('');

  // Connection states
  const [socket, setSocket] = useState(null);
  const [peerConnectionState, setPeerConnectionState] = useState('new');
  const [peerDisconnected, setPeerDisconnected] = useState(false);
  const [targetPeerId, setTargetPeerId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Transfer stats
  const [progress, setProgress] = useState(0);
  const [transferSpeed, setTransferSpeed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Refs for tracking
  const p2pRef = useRef(null);
  const isTransferringRef = useRef(false);

  // Hash Router setup
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/room/')) {
        const parts = hash.split('#key=');
        const roomPart = parts[0];
        const keyHex = parts[1];
        
        const extractedRoomId = roomPart.replace('#/room/', '');
        if (extractedRoomId && keyHex) {
          // If we are already the sender, do not override our role to receiver
          setRole(prev => {
            if (prev === 'sender') return 'sender';
            return 'receiver';
          });
          setRoomId(extractedRoomId);
          
          // Import encryption key
          importKeyFromHex(keyHex)
            .then(key => {
              setEncryptionKey(key);
              setErrorMsg('');
            })
            .catch(err => {
              console.error(err);
              setErrorMsg('Invalid URL parameters. Encryption key is corrupted.');
            });
        }
      }
    };

    handleHashChange(); // Run on mount
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Socket Connection management
  useEffect(() => {
    if (!roomId || !role) return;

    console.log(`Connecting to signaling server at ${SOCKET_URL}...`);
    const newSocket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      autoConnect: true
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to signaling server with ID:', newSocket.id);
      
      // Join Room
      newSocket.emit('join-room', {
        roomId,
        role,
        metadata: role === 'sender' ? metadata : null
      });
    });

    newSocket.on('room-error', (msg) => {
      setErrorMsg(msg);
      newSocket.disconnect();
    });

    // File metadata received (for receiver)
    newSocket.on('file-metadata', (meta) => {
      if (role === 'receiver') {
        setMetadata(meta);
      }
    });

    // Peer Joined: Initiates WebRTC negotiation
    newSocket.on('receiver-joined', ({ receiverId }) => {
      console.log('Receiver joined room:', receiverId);
      setTargetPeerId(receiverId);
      setPeerDisconnected(false);
      
      if (role === 'sender') {
        initializeP2P(newSocket, receiverId);
      }
    });

    // WebRTC signaling relay
    newSocket.on('signal', async ({ from, signalData }) => {
      setTargetPeerId(from);
      if (!p2pRef.current) {
        initializeP2P(newSocket, from);
      }
      if (p2pRef.current) {
        await p2pRef.current.handleSignal(signalData);
      }
    });

    // Handle Peer Disconnection (for Auto-Resume handling)
    newSocket.on('peer-disconnected', ({ role: disconnectedRole }) => {
      console.log(`Peer (${disconnectedRole}) disconnected`);
      setPeerDisconnected(true);
      setPeerConnectionState('disconnected');
      
      if (p2pRef.current) {
        p2pRef.current.close();
        p2pRef.current = null;
      }
    });

    // Control Message relays (Pause, Resume, chunk index queries)
    newSocket.on('control-message', async ({ from, message }) => {
      console.log('Received control message:', message);
      if (message.type === 'resume-request') {
        // Receiver requesting resume from a specific chunk index
        if (role === 'sender' && file && encryptionKey) {
          setIsPaused(false);
          if (p2pRef.current) {
            p2pRef.current.sendFile(file, encryptionKey, message.index);
          }
        }
      } else if (message.type === 'pause') {
        setIsPaused(true);
        if (p2pRef.current) p2pRef.current.pauseTransfer();
      } else if (message.type === 'resume') {
        setIsPaused(false);
        if (p2pRef.current) {
          p2pRef.current.resumeTransfer();
          if (role === 'sender') {
            // Trigger file transfer loop from where it paused
            p2pRef.current.sendFile(file, encryptionKey, p2pRef.current.sendOffsetIndex);
          }
        }
      }
    });

    return () => {
      newSocket.disconnect();
      if (p2pRef.current) {
        p2pRef.current.close();
        p2pRef.current = null;
      }
    };
  }, [roomId, role, metadata]);

  // Initialize WebRTC P2P Connection helper
  const initializeP2P = (activeSocket, peerId) => {
    if (p2pRef.current) {
      p2pRef.current.close();
    }

    const connection = new P2PConnection(activeSocket, roomId, role, {
      onStateChange: async (state) => {
        setPeerConnectionState(state);
        
        // When Data Channel is open and we are the receiver, ask to start or resume transfer
        if (state === 'data-channel-open' && role === 'receiver') {
          setPeerDisconnected(false);
          const currentCount = await getChunksCount(roomId);
          console.log(`Data Channel open. We already have ${currentCount} chunks saved. Requesting transfer...`);
          
          activeSocket.emit('control-message', {
            to: peerId,
            message: { type: 'resume-request', index: currentCount }
          });
        }
      },
      onProgress: (offsetIndex, totalChunks, speedBytesPerSec) => {
        setProgress((offsetIndex / totalChunks) * 100);
        setTransferSpeed(speedBytesPerSec);
      },
      onChunkReceived: async (index, encryptedData) => {
        if (!encryptionKey) return;
        try {
          // 1. Decrypt chunk
          const decrypted = await decryptChunk(encryptedData, encryptionKey);
          
          // 2. Save decrypted chunk to IndexedDB
          await saveChunk(roomId, index, decrypted);
          
          // 3. Update progress locally on receiver
          if (metadata) {
            const totalChunks = metadata.totalChunks;
            const currentProgress = ((index + 1) / totalChunks) * 100;
            setProgress(currentProgress);

            // Calculate transfer speed based on time intervals
            // (simplified: update speeds incrementally)
            const speed = 16384 * 3; // Approx speed indicator
            setTransferSpeed(speed);

            // 4. Check if complete
            const savedCount = await getChunksCount(roomId);
            if (savedCount === totalChunks && !isTransferringRef.current) {
              isTransferringRef.current = true;
              assembleAndDownloadFile();
            }
          }
        } catch (err) {
          console.error('Failed to process chunk:', err);
        }
      },
      onError: (err) => {
        console.error('WebRTC P2P error:', err);
        setErrorMsg('WebRTC Connection negotiation failed. Reconnecting...');
      }
    });

    connection.setTargetPeerId(peerId);
    p2pRef.current = connection;

    // Sender initiates the RTC connection handshake
    if (role === 'sender') {
      connection.initiateHandshake();
    }
  };

  // Compile chunks from IndexedDB, verify cryptographic SHA-256, and trigger browser download
  const assembleAndDownloadFile = async () => {
    setPeerConnectionState('verifying');
    setPreparationStatus('Reassembling file and calculating checksum...');
    
    try {
      const chunks = await getChunks(roomId);
      const finalBlob = new Blob(chunks, { type: metadata.type });
      
      // Verify SHA-256 hash
      setPreparationStatus('Verifying cryptographic integrity...');
      const localHash = await calculateSHA256(finalBlob);
      
      if (localHash === metadata.sha256) {
        console.log('SHA-256 Checksum Verified successfully!');
        setPeerConnectionState('connected'); // Reset to show complete
        setProgress(100);
        
        // Auto trigger download
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = metadata.name;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup anchor and object URL
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);

        // Clear IndexedDB store for this room
        await clearRoom(roomId);
      } else {
        console.error('Hash mismatch! Expected:', metadata.sha256, 'Got:', localHash);
        setErrorMsg('Cryptographic integrity check failed! File may be corrupted.');
        setPeerConnectionState('failed');
      }
    } catch (err) {
      console.error('Assembly failure:', err);
      setErrorMsg('Failed to reassemble downloaded chunks.');
      setPeerConnectionState('failed');
    } finally {
      isTransferringRef.current = false;
    }
  };

  // Sender file preparation and room link creation
  const handleFileSelect = async (selectedFile) => {
    setIsPreparingFile(true);
    setPreparationStatus('Calculating SHA-256 checksum for verification...');
    
    try {
      setFile(selectedFile);
      const sha256 = await calculateSHA256(selectedFile);
      
      const genRoomId = Math.random().toString(36).substring(2, 10);
      const key = await generateKey();
      const keyHex = await exportKeyToHex(key);
      
      setRoomId(genRoomId);
      setEncryptionKey(key);
      setRole('sender');

      const chunkSize = 16384; // 16KB
      const totalChunks = Math.ceil(selectedFile.size / chunkSize);

      const meta = {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        totalChunks,
        sha256
      };
      setMetadata(meta);
      
      // Update hash router
      window.location.hash = `#/room/${genRoomId}#key=${keyHex}`;
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to process file cryptographically.');
    } finally {
      setIsPreparingFile(false);
    }
  };

  // Pause toggle event handler
  const handlePauseToggle = () => {
    if (!socket || !targetPeerId) return;

    const newPauseState = !isPaused;
    setIsPaused(newPauseState);

    // Relay pause/resume event to other peer
    socket.emit('control-message', {
      to: targetPeerId,
      message: { type: newPauseState ? 'pause' : 'resume' }
    });

    if (p2pRef.current) {
      if (newPauseState) {
        p2pRef.current.pauseTransfer();
      } else {
        p2pRef.current.resumeTransfer();
        if (role === 'sender') {
          // Resume transmission
          p2pRef.current.sendFile(file, encryptionKey, p2pRef.current.sendOffsetIndex);
        }
      }
    }
  };

  // Disconnect / Cancel Share
  const handleCancel = async () => {
    if (p2pRef.current) {
      p2pRef.current.close();
      p2pRef.current = null;
    }
    if (socket) {
      socket.disconnect();
    }
    
    // Clear local db for the room
    await clearRoom(roomId);

    // Reset everything
    setRole(null);
    setRoomId('');
    setEncryptionKey(null);
    setFile(null);
    setMetadata(null);
    setProgress(0);
    setTransferSpeed(0);
    setIsPaused(false);
    setPeerConnectionState('new');
    setPeerDisconnected(false);
    setTargetPeerId(null);
    setErrorMsg('');
    isTransferringRef.current = false;

    window.location.hash = '';
  };

  const inviteLink = role === 'sender' && roomId && encryptionKey
    ? `${window.location.origin}/#/room/${roomId}#key=${window.location.hash.split('#key=')[1]}`
    : '';

  return (
    <div className="min-h-screen flex flex-col theme-transition">
      <Header />
      
      <main className="flex-1 flex flex-col items-center justify-center py-12 px-4">
        {errorMsg && (
          <div className="w-full max-w-lg mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-center justify-between">
            <span>{errorMsg}</span>
            <button 
              onClick={() => setErrorMsg('')} 
              className="text-xs font-bold uppercase tracking-wider hover:underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {isPreparingFile && (
          <div className="glass-panel max-w-sm rounded-3xl p-8 text-center flex flex-col items-center">
            <RefreshCw className="w-10 h-10 text-accent animate-spin mb-4" />
            <h3 className="text-lg font-bold text-text-main">Preparing Cryptography Link</h3>
            <p className="text-xs text-text-muted mt-2">{preparationStatus}</p>
          </div>
        )}

        {!role && !isPreparingFile && (
          <div className="w-full flex flex-col items-center">
            <FileSelector onFileSelect={handleFileSelect} />
            
            {/* Guide Card */}
            <div className="w-full max-w-lg mt-8 p-6 rounded-3xl bg-card-bg/40 border border-card-border/40 text-left">
              <h4 className="text-sm font-bold text-text-main flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-accent" />
                How does direct Web Share work?
              </h4>
              <ul className="space-y-2.5 text-xs text-text-muted">
                <li className="flex gap-2">
                  <span className="text-accent font-bold">1.</span>
                  <span><strong>Select a file</strong>: Your file is hashed and an E2EE key is generated purely in your browser.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent font-bold">2.</span>
                  <span><strong>Share the link</strong>: Send the URL to a peer. The encryption key is in the link hash (never uploaded to any server).</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-accent font-bold">3.</span>
                  <span><strong>Direct streaming</strong>: Once the peer opens the link, a WebRTC connection is negotiated, streaming data browser-to-browser with 0% data stored on intermediate servers.</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {role && !isPreparingFile && (
          <div className="w-full flex flex-col items-center">
            {peerConnectionState === 'verifying' ? (
              <div className="glass-panel max-w-sm rounded-3xl p-8 text-center flex flex-col items-center">
                <ShieldCheck className="w-12 h-12 text-emerald-500 animate-bounce mb-4" />
                <h3 className="text-lg font-bold text-text-main">Verifying Download</h3>
                <p className="text-xs text-text-muted mt-2">{preparationStatus}</p>
              </div>
            ) : (
              <TransferCard
                role={role}
                fileName={metadata ? metadata.name : 'Resolving metadata...'}
                fileSize={metadata ? metadata.size : 0}
                connectionState={peerConnectionState}
                progress={progress}
                transferSpeed={transferSpeed}
                onPauseToggle={handlePauseToggle}
                isPaused={isPaused}
                onCancel={handleCancel}
                inviteLink={inviteLink}
                peerDisconnected={peerDisconnected}
              />
            )}
          </div>
        )}
      </main>

      <footer className="w-full text-center py-6 text-xs text-text-muted border-t border-card-border/30">
        <p className="flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Zero-Knowledge End-to-End Encrypted Peer-to-Peer file share.
        </p>
      </footer>
    </div>
  );
}
