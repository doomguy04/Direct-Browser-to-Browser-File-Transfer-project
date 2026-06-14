import React, { useState, useEffect } from 'react';
import { Copy, Check, Lock, Play, Pause, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function TransferCard({
  role,
  fileName,
  fileSize,
  connectionState,
  progress, // 0 to 100
  transferSpeed, // bytes per second
  onPauseToggle,
  isPaused,
  onCancel,
  inviteLink,
  peerDisconnected,
  onReconnect
}) {
  const [copied, setCopied] = useState(false);
  const [eta, setEta] = useState('');

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate ETA
  useEffect(() => {
    if (progress <= 0 || progress >= 100 || transferSpeed <= 0) {
      setEta('');
      return;
    }
    const remainingBytes = fileSize * (1 - progress / 100);
    const remainingSeconds = remainingBytes / transferSpeed;
    
    if (remainingSeconds < 60) {
      setEta(`${Math.round(remainingSeconds)}s remaining`);
    } else {
      const minutes = Math.floor(remainingSeconds / 60);
      const seconds = Math.round(remainingSeconds % 60);
      setEta(`${minutes}m ${seconds}s remaining`);
    }
  }, [progress, transferSpeed, fileSize]);

  // Status mapping
  const getStatusDisplay = () => {
    if (peerDisconnected) {
      return {
        text: 'Peer Disconnected (Auto-reconnecting...)',
        colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
        icon: <AlertTriangle className="w-4 h-4 animate-bounce" />
      };
    }
    
    switch (connectionState) {
      case 'new':
      case 'connecting':
        return {
          text: 'Establishing secure link...',
          colorClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
          icon: <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>
        };
      case 'connected':
      case 'data-channel-open':
        if (progress === 100) {
          return {
            text: 'Completed & Verified',
            colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
            icon: <ShieldCheck className="w-4 h-4" />
          };
        }
        if (isPaused) {
          return {
            text: 'Paused',
            colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
            icon: <Pause className="w-4 h-4" />
          };
        }
        return {
          text: progress > 0 ? 'Streaming File Data...' : 'Peer Connected. Ready.',
          colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
          icon: <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
        };
      case 'disconnected':
      case 'closed':
      case 'failed':
        return {
          text: 'Connection Dropped. Waiting for auto-resume...',
          colorClass: 'text-red-500 bg-red-500/10 border-red-500/20',
          icon: <AlertTriangle className="w-4 h-4" />
        };
      default:
        return {
          text: 'Waiting for Peer to Join...',
          colorClass: 'text-text-muted bg-card-border/30 border-card-border/50',
          icon: <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-text-muted opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-text-muted"></span></span>
        };
    }
  };

  const status = getStatusDisplay();

  return (
    <div className="w-full max-w-lg mx-auto glass-panel rounded-3xl p-6 md:p-8 border border-card-border/60">
      
      {/* Encryption Badge */}
      <div className="flex justify-between items-center mb-6">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${status.colorClass}`}>
          {status.icon}
          <span>{status.text}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
          <Lock className="w-3.5 h-3.5" />
          <span>E2EE (AES-GCM)</span>
        </div>
      </div>

      {/* File Info */}
      <div className="mb-6 p-4 rounded-2xl bg-card-border/30 border border-card-border/40">
        <span className="text-[10px] font-bold tracking-wider uppercase text-text-muted">
          {role === 'sender' ? 'Sharing File' : 'Incoming File'}
        </span>
        <h3 className="text-lg font-bold text-text-main mt-1 truncate" title={fileName}>
          {fileName}
        </h3>
        <p className="text-sm text-text-muted mt-0.5">{formatBytes(fileSize)}</p>
      </div>

      {/* Invite Link for Sender */}
      {role === 'sender' && inviteLink && (
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase text-text-muted mb-2">
            Share this Room Link with recipient
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="flex-1 px-4 py-2.5 rounded-xl text-xs bg-card-border/30 border border-card-border/60 text-text-muted outline-none focus:border-accent"
            />
            <button
              onClick={handleCopyLink}
              className="p-2.5 rounded-xl border border-card-border bg-card-bg/50 hover:bg-card-bg/95 hover:border-card-border text-text-main transition-all duration-200 cursor-pointer shadow-sm active:scale-95 flex items-center justify-center min-w-[44px]"
              title="Copy Room Link"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-accent" />}
            </button>
          </div>
        </div>
      )}

      {/* Progress Section */}
      {(connectionState === 'connected' || connectionState === 'data-channel-open' || progress > 0 || peerDisconnected) && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-text-main">Transfer Progress</span>
            <span className="text-sm font-bold text-accent">{Math.round(progress)}%</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-card-border/40 rounded-full overflow-hidden border border-card-border/50">
            <div
              className={`h-full bg-accent rounded-full transition-all duration-300 ${
                isPaused ? 'opacity-60 bg-amber-500' : ''
              }`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-3 rounded-xl bg-card-border/20 border border-card-border/30">
              <span className="text-[10px] font-bold text-text-muted uppercase">Transfer Speed</span>
              <p className="text-base font-bold text-text-main mt-0.5">
                {isPaused || progress === 100 || transferSpeed <= 0 ? '0 KB/s' : `${formatBytes(transferSpeed)}/s`}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-card-border/20 border border-card-border/30">
              <span className="text-[10px] font-bold text-text-muted uppercase">Time Estimate</span>
              <p className="text-base font-bold text-text-main mt-0.5">
                {progress === 100 ? 'Finished' : isPaused ? 'Paused' : eta || 'Calculating...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Control Actions */}
      <div className="flex gap-3 mt-4">
        {onPauseToggle && (connectionState === 'connected' || connectionState === 'data-channel-open') && progress > 0 && progress < 100 && (
          <button
            onClick={onPauseToggle}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-card-border bg-card-bg/25 hover:bg-card-bg/75 text-sm font-semibold transition-all duration-200 cursor-pointer text-text-main"
          >
            {isPaused ? (
              <>
                <Play className="w-4 h-4 text-emerald-500" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Pause className="w-4 h-4 text-amber-500" />
                <span>Pause</span>
              </>
            )}
          </button>
        )}

        <button
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-semibold transition-all duration-200 cursor-pointer"
        >
          <XCircle className="w-4 h-4" />
          <span>{progress === 100 ? 'Close Room' : 'Cancel Share'}</span>
        </button>
      </div>
    </div>
  );
}
