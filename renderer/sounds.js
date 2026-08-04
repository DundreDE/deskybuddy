// All sounds are synthesized on the fly with the Web Audio API — no audio files.
let ctx = null;

function getCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(audioCtx, { freq, duration, type = 'sine', peakGain = 0.18, delay = 0, freqEnd = null }) {
  const start = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd !== null) {
    osc.frequency.linearRampToValueAtTime(freqEnd, start + duration);
  }
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + Math.min(0.03, duration * 0.3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseClick(audioCtx, { duration = 0.05, delay = 0, filterFreq = 1200, peakGain = 0.2 }) {
  const start = audioCtx.currentTime + delay;
  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(peakGain, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(gain).connect(audioCtx.destination);
  src.start(start);
}

function playSqueak() {
  const audioCtx = getCtx();
  const base = 520 + Math.random() * 60;
  tone(audioCtx, { freq: base, freqEnd: base * 1.5, duration: 0.12, type: 'triangle', peakGain: 0.16 });
  tone(audioCtx, { freq: base * 1.4, freqEnd: base * 1.9, duration: 0.12, type: 'triangle', peakGain: 0.14, delay: 0.11 });
}

function playEatCrunch() {
  const audioCtx = getCtx();
  for (let i = 0; i < 3; i++) {
    noiseClick(audioCtx, { duration: 0.06, delay: i * 0.09, filterFreq: 900 + Math.random() * 400, peakGain: 0.22 });
  }
  tone(audioCtx, { freq: 180, freqEnd: 140, duration: 0.15, type: 'sine', peakGain: 0.12, delay: 0.02 });
}

function playYawn() {
  const audioCtx = getCtx();
  tone(audioCtx, { freq: 260, freqEnd: 150, duration: 0.9, type: 'sine', peakGain: 0.1 });
}

function playThud() {
  const audioCtx = getCtx();
  tone(audioCtx, { freq: 110, freqEnd: 60, duration: 0.18, type: 'sine', peakGain: 0.22 });
  noiseClick(audioCtx, { duration: 0.05, filterFreq: 300, peakGain: 0.15 });
}

function playChirp() {
  const audioCtx = getCtx();
  const base = 700 + Math.random() * 80;
  tone(audioCtx, { freq: base, freqEnd: base * 1.2, duration: 0.09, type: 'square', peakGain: 0.1 });
}

window.BuddySounds = { playSqueak, playEatCrunch, playYawn, playThud, playChirp };
