import 'dotenv/config';
import { createServer } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, normalize, resolve } from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { openDeepgramConnection } from './deepgramClient';
import { SessionManager } from './sessionManager';
import { fakeBrainProcess } from './brainStub';
import { streamBackupClip } from './backupAudio';
import { ClientToEarMessage, EarToClientMessage, Transcript, WireTranscript } from './types';
import { bufferToArrayBuffer } from './util';

const PORT = Number(process.env.PORT ?? 8080);
const sessionManager = new SessionManager();

const PUBLIC_DIR = resolve(__dirname, '..', 'public');
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

const httpServer = createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url ?? '/index.html';
  const filePath = normalize(join(PUBLIC_DIR, urlPath));

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
});

const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`[ear] test harness:      http://localhost:${PORT}`);
  console.log(`[ear] WebSocket server:  ws://localhost:${PORT}`);
});

wss.on('connection', (ws: WebSocket) => {
  const sessionId = randomUUID();
  let deepgramConn: ReturnType<typeof openDeepgramConnection> | null = null;

  send(ws, { type: 'status', message: `connected (sessionId=${sessionId})` });

  function ensureDeepgram() {
    if (deepgramConn) return deepgramConn;

    deepgramConn = openDeepgramConnection({
      onTranscript: (transcript: Transcript) => {
        handleTranscript(ws, sessionId, transcript);
      },
      onUtteranceEnd: () => {
        console.log(`[ear:${sessionId}] utterance end`);
      },
      onError: (err: unknown) => {
        console.error(`[ear:${sessionId}] deepgram error`, err);
        send(ws, { type: 'status', message: 'speech-to-text error — see server logs' });
      },
      onClose: () => {
        console.log(`[ear:${sessionId}] deepgram connection closed`);
      },
    });

    return deepgramConn;
  }

  ws.on('message', (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      const conn = ensureDeepgram();
      conn.send(bufferToArrayBuffer(data));
      return;
    }

    let msg: ClientToEarMessage;
    try {
      msg = JSON.parse(data.toString('utf-8'));
    } catch {
      return;
    }

    // Accept the Next.js app's session_start/session_end and the standalone
    // harness's start/stop interchangeably.
    if (msg.type === 'start' || msg.type === 'session_start') {
      ensureDeepgram();
      // Echo session_start so the FE reducer initializes the session
      // (status → listening, stores sessionId).
      send(ws, { type: 'session_start', sessionId });
      send(ws, { type: 'status', message: 'listening (auto-detecting language)' });
    } else if (msg.type === 'stop' || msg.type === 'session_end') {
      deepgramConn?.requestClose();
      deepgramConn = null;
      send(ws, { type: 'session_end', sessionId });
    } else if (msg.type === 'useBackupClip') {
      const conn = ensureDeepgram();
      streamBackupClip(conn, msg.clipName).catch((err) => {
        console.error(`[ear:${sessionId}] backup clip failed`, err);
        send(ws, { type: 'status', message: 'backup clip failed — see server logs' });
      });
    }
  });

  ws.on('close', () => {
    deepgramConn?.requestClose();
    sessionManager.clear(sessionId);
    console.log(`[ear:${sessionId}] client disconnected`);
  });
});

function handleTranscript(ws: WebSocket, sessionId: string, transcript: Transcript) {
  // Enrich the internal transcript into the frontend's WireTranscript shape.
  const wire: WireTranscript = {
    sessionId,
    text: transcript.text,
    isFinal: transcript.isFinal,
    confidence: transcript.confidence,
    language: transcript.language,
    timestamp: Date.now(),
  };

  if (!transcript.isFinal) {
    send(ws, { type: 'interim_transcript', transcript: wire });
    return;
  }

  const decision = sessionManager.decide(sessionId, transcript);

  switch (decision.action) {
    case 'forward':
      send(ws, { type: 'final_transcript', transcript: wire });
      // Brain handoff is out of scope (stub only logs) — left intentionally.
      void fakeBrainProcess(transcript);
      break;

    case 'reprompt':
      send(ws, {
        type: 'reprompt',
        repromptMessage: "I didn't catch that, can you repeat?",
      });
      break;

    case 'escalate':
      send(ws, {
        type: 'escalation',
        escalate: decision.reason,
        escalationReason: 'low_confidence_audio',
      });
      break;
  }
}

function send(ws: WebSocket, msg: EarToClientMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
