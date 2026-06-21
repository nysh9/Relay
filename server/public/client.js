const WS_URL = `ws://${location.hostname}:8080`;

let ws = null;
let audioContext = null;
let workletNode = null;
let micStream = null;

const elStatus = document.getElementById('status');
const elTranscript = document.getElementById('transcript');
const elBanner = document.getElementById('banner');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnBackupClip = document.getElementById('btnBackupClip');

function setStatus(text) {
  elStatus.textContent = text;
}

function showBanner(text, kind) {
  elBanner.textContent = text;
  elBanner.className = `banner ${kind}`;
  elBanner.style.display = text ? 'block' : 'none';
}

function appendTranscriptLine(text, isFinal, language) {
  const last = elTranscript.lastElementChild;
  if (last && last.dataset.interim === 'true') {
    last.remove();
  }
  const line = document.createElement('div');
  line.textContent = language ? `[${language}] ${text}` : text;
  line.dataset.interim = String(!isFinal);
  line.className = isFinal ? 'line final' : 'line interim';
  elTranscript.appendChild(line);
  elTranscript.scrollTop = elTranscript.scrollHeight;
}

async function start() {
  showBanner('', '');
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', async () => {
    setStatus('connected — requesting mic...');
    ws.send(JSON.stringify({ type: 'start', sessionId: crypto.randomUUID() }));
    await startMic();
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    switch (msg.type) {
      case 'status':
        setStatus(msg.message);
        break;
      case 'session_start':
        setStatus('listening (speak now)');
        break;
      case 'session_end':
        setStatus('stopped');
        break;
      case 'interim_transcript':
      case 'final_transcript':
        appendTranscriptLine(
          msg.transcript.text,
          msg.transcript.isFinal,
          msg.transcript.language
        );
        break;
      case 'reprompt':
        showBanner(msg.repromptMessage, 'warn');
        break;
      case 'escalation':
        showBanner(
          `Escalated to ${msg.escalate === '911' ? 'emergency services' : 'a human operator'}.`,
          'escalate'
        );
        stop();
        break;
    }
  });

  ws.addEventListener('close', () => setStatus('disconnected'));
  ws.addEventListener('error', () => setStatus('connection error — see console'));
}

async function startMic() {
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();

  await audioContext.audioWorklet.addModule('pcm-worklet.js');

  const source = audioContext.createMediaStreamSource(micStream);
  workletNode = new AudioWorkletNode(audioContext, 'pcm-worklet', {
    processorOptions: { inputSampleRate: audioContext.sampleRate },
  });

  workletNode.port.onmessage = (event) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(event.data);
    }
  };

  source.connect(workletNode);
  setStatus('listening (speak now)');
  btnStart.disabled = true;
  btnStop.disabled = false;
}

function stop() {
  ws?.send(JSON.stringify({ type: 'stop' }));
  micStream?.getTracks().forEach((t) => t.stop());
  workletNode?.disconnect();
  audioContext?.close();
  ws?.close();
  setStatus('stopped');
  btnStart.disabled = false;
  btnStop.disabled = true;
}

function useBackupClip() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'useBackupClip' }));
    setStatus('streaming backup clip...');
  } else {
    setStatus('connect first, then use backup clip');
  }
}

btnStart.addEventListener('click', start);
btnStop.addEventListener('click', stop);
btnBackupClip.addEventListener('click', useBackupClip);
