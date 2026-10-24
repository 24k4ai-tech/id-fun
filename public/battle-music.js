// Original, low-volume battle loop synthesized in the browser. No external
// audio file or streaming request is needed.
export function createBattleMusic(button) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let wanted = true;
  try { wanted = localStorage.getItem('arena-music') !== 'off'; } catch { /* Private mode may block storage. */ }
  let active = false;
  let context = null;
  let master = null;
  let noise = null;
  let timer = null;
  let suspendTimer = null;
  let nextAt = 0;
  let step = 0;
  const beat = 60 / 94 / 2;
  const chords = [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52]];
  const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

  function render() {
    const playing = Boolean(active && wanted && timer && context?.state === 'running');
    button.textContent = wanted ? playing ? '♫ 配乐：开' : '♫ 播放配乐' : '♫ 配乐：关';
    button.setAttribute('aria-pressed', String(playing));
    button.title = playing ? '关闭战斗配乐' : '播放战斗配乐';
  }

  function setup() {
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 4500;
    master.connect(lowpass).connect(context.destination);
    noise = context.createBuffer(1, Math.ceil(context.sampleRate * .3), context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function tone(midi, at, duration, volume, type = 'triangle', cutoff = 2500) {
    const source = context.createOscillator();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency(midi), at);
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(volume, at + Math.min(.08, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter).connect(envelope).connect(master);
    source.start(at);
    source.stop(at + duration + .02);
  }

  function drum(at, snare = false) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noise;
    filter.type = snare ? 'bandpass' : 'highpass';
    filter.frequency.value = snare ? 1250 : 5700;
    envelope.gain.setValueAtTime(snare ? .022 : .01, at);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + (snare ? .14 : .055));
    source.connect(filter).connect(envelope).connect(master);
    source.start(at);
    source.stop(at + (snare ? .15 : .06));
  }

  function schedule(index, at) {
    const chord = chords[Math.floor(index / 16) % chords.length];
    if (index % 16 === 0) for (const note of chord) tone(note + 12, at, beat * 14, .008, 'sine', 1200);
    if (index % 4 === 0) tone(chord[0] - 12, at, beat * 3.2, .055, 'triangle', 500);
    if (index % 8 === 0) {
      const kick = context.createOscillator();
      const gain = context.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(85, at);
      kick.frequency.exponentialRampToValueAtTime(42, at + .18);
      gain.gain.setValueAtTime(.075, at);
      gain.gain.exponentialRampToValueAtTime(.0001, at + .2);
      kick.connect(gain).connect(master);
      kick.start(at); kick.stop(at + .21);
    }
    if (index % 8 === 4) drum(at, true);
    if (index % 2 === 0) drum(at);
    if (index % 2 === 1) {
      const note = chord[[0, 1, 2, 1, 0, 2, 1, 2][Math.floor(index / 2) % 8]] + 24;
      tone(note, at, beat * .8, .018, 'triangle', 1700);
    }
  }

  function tick() {
    if (!context || context.state !== 'running') return;
    let scheduled = 0;
    while (nextAt < context.currentTime + .22 && scheduled++ < 8) {
      schedule(step++ % 64, nextAt);
      nextAt += beat;
    }
  }

  function startFromGesture() {
    if (!AudioContextClass || !active || !wanted) return;
    if (timer && context?.state === 'running') return;
    clearTimeout(suspendTimer);
    if (!context) setup();
    context.resume().then(() => {
      if (!active || !wanted) return;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(.29, context.currentTime, .18);
      if (!timer) {
        nextAt = context.currentTime + .04;
        step = 0;
        tick();
        timer = setInterval(tick, 90);
      }
      render();
    }).catch(render);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (context) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0, context.currentTime, .08);
      clearTimeout(suspendTimer);
      suspendTimer = setTimeout(() => { if (!active || !wanted) context.suspend().catch(() => {}); }, 600);
    }
    render();
  }

  button.addEventListener('click', () => {
    if (wanted && context?.state === 'running' && timer) {
      wanted = false;
      stop();
    } else {
      wanted = true;
      startFromGesture();
    }
    try { localStorage.setItem('arena-music', wanted ? 'on' : 'off'); } catch { /* Keep this session's choice. */ }
    render();
  });
  render();
  return {
    enter() {
      active = true;
      if (navigator.userActivation?.isActive) startFromGesture();
      render();
    },
    leave() { active = false; stop(); },
    userGesture: startFromGesture,
  };
}
