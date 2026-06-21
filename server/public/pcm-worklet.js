/**
 * AudioWorkletProcessor: converts the browser's native Float32 mic samples
 * into 16-bit PCM at 16kHz mono — the exact format deepgramClient.ts
 * configures the Deepgram connection to expect (encoding: 'linear16',
 * sample_rate: 16000). Keeping this conversion here (not in deepgramClient)
 * means the WS server just forwards bytes — no re-encoding on the server.
 */
class PCMWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inputSampleRate = options.processorOptions.inputSampleRate;
    this.targetSampleRate = 16000;
    this.resampleRatio = this.inputSampleRate / this.targetSampleRate;
    this.carry = []; // leftover samples between process() calls for downsampling
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    // Naive linear-interpolation downsample to 16kHz. Good enough for STT;
    // do not over-engineer this for a 3-minute demo.
    const samples = Array.from(input);
    const combined = this.carry.concat(samples);
    const outLength = Math.floor(combined.length / this.resampleRatio);
    const pcm16 = new Int16Array(outLength);

    let srcIndex = 0;
    for (let i = 0; i < outLength; i++) {
      const idx = Math.floor(srcIndex);
      const sample = combined[idx] ?? 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      srcIndex += this.resampleRatio;
    }

    this.carry = combined.slice(Math.floor(srcIndex));

    if (pcm16.length > 0) {
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-worklet', PCMWorklet);
