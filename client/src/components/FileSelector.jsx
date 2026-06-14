import React, { useState, useRef } from 'react';
import { UploadCloud, File, AlertCircle } from 'lucide-react';

export default function FileSelector({ onFileSelect }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFile(file);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleFile(file);
    }
  };

  const handleFile = (file) => {
    setSelectedFile(file);
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleConfirm = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <div
        className={`glass-panel border-2 border-dashed rounded-3xl p-8 md:p-12 text-center transition-all duration-300 ${
          isDragActive 
            ? 'border-accent bg-accent/5 scale-[1.01]' 
            : 'border-card-border/70 hover:border-accent/50'
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileInput}
          id="file-upload-input"
        />

        {!selectedFile ? (
          <div className="flex flex-col items-center cursor-pointer group" onClick={triggerFileInput}>
            <div className="w-16 h-16 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-accent/20 transition-all duration-300">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-text-main mb-2">Drag and drop your file here</h3>
            <p className="text-sm text-text-muted mb-4">or click to browse your local device</p>
            <span className="text-[11px] font-medium tracking-wide uppercase px-2.5 py-1 rounded-md bg-card-border/40 text-text-muted">
              Any file type supported
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-accent/15 text-accent flex items-center justify-center mb-5 animate-bounce">
              <File className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-text-main max-w-xs truncate mb-1" title={selectedFile.name}>
              {selectedFile.name}
            </h4>
            <p className="text-xs text-text-muted mb-4">{formatBytes(selectedFile.size)}</p>

            {selectedFile.size > 50 * 1024 * 1024 && (
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-left max-w-sm mb-6">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  This file is larger than 50MB. We support up to 500MB+ using IndexedDB streaming, but transfer speeds and hashing times will depend on your hardware.
                </p>
              </div>
            )}

            <div className="flex gap-3 w-full max-w-xs mt-2">
              <button
                onClick={() => setSelectedFile(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-card-border bg-card-bg/25 hover:bg-card-bg/70 text-sm font-semibold transition-all duration-200 cursor-pointer"
              >
                Change File
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 btn-primary text-sm font-semibold"
              >
                Generate Room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
