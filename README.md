
##App link-https://direct-browser-to-browser-file-tran.vercel.app/


# Direct-Browser-to-Browser-File-Transfer
=======
# P2P Web Share (Direct Browser-to-Browser E2EE File Transfer)

A lightweight, decentralized, and secure peer-to-peer (P2P) file-sharing web application. Users can select or drag-and-drop a file to generate a unique room invite link. Recipients opening the link connect directly to the sender's browser to stream the file using WebRTC. A lightweight central signaling server coordinates the initial handshake but never reads, processes, or stores any part of the file data.

## ⚡ Core Features

1. **Zero-Knowledge End-to-End Encryption (E2EE)**: 
   - Uses the browser's **Web Crypto API (AES-GCM)** to encrypt file chunks before transmission.
   - The encryption key is generated locally and appended to the URL as a hash fragment (e.g. `/#/room/ROOM_ID#key=ENCRYPTION_KEY`).
   - Because URL hash fragments are never sent to the signaling server, the server is mathematically blind to the key, ensuring complete privacy.

2. **RAM-Safe Large File Support (>500MB)**:
   - Avoids browser heap crashes by storing received encrypted chunks directly into **IndexedDB** instead of keeping them in memory.
   - Converts buffers into browser-managed `Blob` chunks on disk, supporting transfers of hundreds of megabytes safely.

3. **Cryptographic Integrity Verification**:
   - Generates a **SHA-256 hash** of the file prior to sending.
   - Computes and compares the SHA-256 hash of the reassembled file on the receiver side to guarantee zero data corruption.

4. **Connection Churn Recovery (Auto-Resume)**:
   - Tracks chunk indexes sequentially.
   - If the network drops or connection fails, the receiver queries IndexedDB and tells the sender to resume streaming from the last verified chunk index, eliminating the need to restart the download from 0%.

5. **Advanced WebRTC Streaming with Backpressure**:
   - Raw binary transfers are sent directly peer-to-peer.
   - Handles backpressure throttling by monitoring `bufferedAmount` and yielding on `bufferedamountlow` event to prevent local memory overflow.

6. **Creamish & Reddish Aesthetics**:
   - Elegant, dynamic styling utilizing **Tailwind CSS v4**'s HSL variables.
   - **Light Mode**: Warm, calming cream and sand backgrounds (`hsl(36, 40%, 97%)`) with dark charcoal text.
   - **Dark Mode**: Rich, premium burgundy/cherry backgrounds (`hsl(355, 35%, 8%)`) with soft cream text.
   - Features responsive layouts, glassmorphism card UI, and subtle micro-animations (e.g. glowing badges, pulsing icons).

---

## 🛠️ Tech Stack

| Layer | Suggested Technologies |
| :--- | :--- |
| **Frontend** | React.js, Tailwind CSS v4, Lucide Icons |
| **P2P Communication** | HTML5 WebRTC API (Native `RTCPeerConnection` & `RTCDataChannel`) |
| **Backend Signaling** | Node.js + Express.js + Socket.io |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Recommended version v18+)
- [npm](https://www.npmjs.com/)

### Installation

Clone the repository and install dependencies for the root orchestrator, frontend client, and backend server:

```bash
# Clone the repository
git clone <repository-url>
cd Mars

# Install dependencies for all workspace prefixes
npm run install:all
```

*This script will run `npm install` at the root, and execute prefix installations in both `./server` and `./client` directories.*

---

## 💻 Running the Application

To launch both the Node.js signaling server and the React frontend concurrently in development mode:

```bash
npm run dev
```

- **Frontend Client**: Runs at [http://localhost:3000](http://localhost:3000)
- **Signaling Server**: Runs at [http://localhost:5000](http://localhost:5000)

---

## 🧪 How to Test Locally

1. Open a browser window to [http://localhost:3000](http://localhost:3000).
2. Select or drag-and-drop a file (e.g., a 20MB image, zip, or document).
3. Click **"Generate Room"**.
4. Copy the generated invite link containing the room ID and encryption key.
5. Open a **new Incognito window** (or another browser like Firefox) and paste the link.
6. The connection will establish via WebRTC. Notice the E2EE indicator and progress speeds.
7. Once completed, the file will be decrypted, verified by its SHA-256 hash, and downloaded automatically.
8. To test connection churn recovery: Turn off your network or disconnect your signaling server mid-transfer. Once reconnected, the transfer will resume exactly from the last saved chunk index.

---

## 🌐 Deployment Guide

This project is designed to be easily deployed to modern cloud hosting platforms.

### 1. Deploy the Backend (Signaling Server) to **Render**

The repository contains a `render.yaml` Blueprint spec for Render.

1. Go to [Render](https://render.com/) and log in.
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub repository.
4. Render will read the `render.yaml` configuration automatically and configure:
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `node index.js`
5. Click **Apply** to deploy.
6. Once deployed, copy your Render web service URL (e.g. `https://p2p-web-share-signaling.onrender.com`).

### 2. Deploy the Frontend (React Client) to **Vercel**

1. Go to [Vercel](https://vercel.com/) and log in.
2. Click **Add New** -> **Project** and import your GitHub repository.
3. In the project setup panel, click **Edit** next to **Root Directory** and select the **`client`** folder.
4. Vercel will automatically detect **Vite** and configure the build settings:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`
5. Expand the **Environment Variables** section and add:
   - **Key**: `VITE_SIGNALING_URL`
   - **Value**: Your Render signaling server URL (from step 1, e.g. `https://p2p-web-share-signaling.onrender.com`)
6. Click **Deploy**.
7. Once deployed, open your Vercel URL and start sharing files!

---

## 📁 Project Architecture

- **`server/index.js`**: Relays WebRTC signaling offers, answers, and candidates, and tracks room size limits (1-to-1).
- **`client/src/utils/crypto.js`**: Key generation, hex exports, and chunk encryption/decryption using AES-GCM.
- **`client/src/utils/db.js`**: IndexedDB storage operations for tracking and writing file slices.
- **`client/src/utils/webrtc.js`**: WebRTC connection wrapper managing lifecycle, backpressure queue threshold, and index-prefixed binary packets.

