window.EW = window.EW || {};

window.EW.AudioEngine = class AudioEngine {
    constructor() {
        this.initialized = false;
        this.ctx = null;
        this.masterGain = null;
        this.reverbInput = null;
        this.reverbGain = null;
        this.musicGainNode = null;
        this.musicBaseGain = 0.07;
        this.musicActive = false;
        this.padFilter = null;
        this.ambientActive = false;
        this.ambientNodes = [];
        this.currentChordFreqs = [];
        this.padOscs = [];
    }
    init() {
        if (this.initialized) return;
        try { this.ctx = new(window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.25;
        this.masterGain.connect(this.ctx.destination);
        this._buildLongReverb();
        this.initialized = true;
        this.startAmbient();
        this.startBackgroundMusic();
    }
    _buildLongReverb() {
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0.9;
        const input = this.ctx.createGain();
        input.gain.value = 0.7;
        this.reverbInput = input;
        const delays = [];
        const times = [0.068, 0.076, 0.085, 0.094, 0.104, 0.114, 0.125, 0.137];
        const fbGains = [0.65, 0.62, 0.58, 0.55, 0.50, 0.45, 0.40, 0.35];
        for (let i = 0; i < 8; i++) {
            const d = this.ctx.createDelay(0.25);
            d.delayTime.value = times[i];
            const fb = this.ctx.createGain();
            fb.gain.value = fbGains[i];
            const f = this.ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = 1400 + i * 150;
            f.Q.value = 0.3;
            d.connect(f);
            f.connect(fb);
            fb.connect(d);
            d.connect(this.reverbGain);
            if (i === 0) input.connect(d);
            else delays[i - 1].delay.connect(d);
            delays.push({ delay: d, feedback: fb, filter: f });
        }
        const lowShelf = this.ctx.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 200;
        lowShelf.gain.value = 4.5;
        this.reverbGain.connect(lowShelf);
        lowShelf.connect(this.masterGain);
    }
    startAmbient() {
        if (this.ambientActive) return;
        this.ambientActive = true;
        const deepFreqs = [20, 25, 30];
        const deepGain = this.ctx.createGain();
        deepGain.gain.value = 0.03;
        const deepFilter = this.ctx.createBiquadFilter();
        deepFilter.type = 'lowpass';
        deepFilter.frequency.value = 80;
        deepFilter.connect(deepGain);
        deepGain.connect(this.masterGain);
        deepFreqs.forEach(f => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = f;
            const lfo = this.ctx.createOscillator();
            lfo.frequency.value = 0.01 + Math.random() * 0.02;
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.value = 2;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            const g = this.ctx.createGain();
            g.gain.value = 0.2;
            osc.connect(g);
            g.connect(deepFilter);
            osc.start();
            lfo.start();
            this.ambientNodes.push(osc, lfo, g, lfoGain);
        });
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 4, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.03;
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        const nf = this.ctx.createBiquadFilter();
        nf.type = 'lowpass';
        nf.frequency.value = 200;
        const ng = this.ctx.createGain();
        ng.gain.value = 0.008;
        noise.connect(nf);
        nf.connect(ng);
        ng.connect(this.masterGain);
        noise.start();
        this.ambientNodes.push(noise, nf, ng);
    }
    startBackgroundMusic() {
        if (this.musicActive) return;
        this.musicActive = true;
        const chords = [
            [146.83, 174.61, 220.00, 293.66],
            [220.00, 261.63, 329.63, 440.00],
            [261.63, 329.63, 392.00, 523.25],
            [196.00, 246.94, 293.66, 392.00]
        ];
        let cur = 0;
        this.musicGainNode = this.ctx.createGain();
        this.musicGainNode.gain.value = this.musicBaseGain;
        this.musicGainNode.connect(this.masterGain);
        const musicRev = this.ctx.createGain();
        musicRev.gain.value = 0.9;
        musicRev.connect(this.reverbInput);
        const chordGain = this.ctx.createGain();
        chordGain.gain.value = 0.09;
        chordGain.connect(this.musicGainNode);
        chordGain.connect(musicRev);
        const padGain = this.ctx.createGain();
        padGain.gain.value = 0.06;
        this.padFilter = this.ctx.createBiquadFilter();
        this.padFilter.type = 'lowpass';
        this.padFilter.frequency.value = 220;
        this.padFilter.Q.value = 0.5;
        this.padFilter.connect(padGain);
        padGain.connect(this.musicGainNode);
        padGain.connect(musicRev);
        let activeOscs = [], padOscs = [];
        const playChord = (freqs) => {
            this.currentChordFreqs = freqs;
            activeOscs.forEach(o => { try { o.stop(); } catch (e) {} });
            activeOscs = [];
            freqs.forEach(f => {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = f;
                const g = this.ctx.createGain();
                g.gain.value = 0.09;
                osc.connect(g);
                g.connect(chordGain);
                osc.start();
                activeOscs.push(osc);
            });
            padOscs.forEach(o => { try { o.stop(); } catch (e) {} });
            padOscs = [];
            const root = freqs[0], fifth = freqs[2] || root * 1.5;
            [root, fifth].forEach(f => {
                const osc = this.ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = f;
                const g = this.ctx.createGain();
                g.gain.value = 0.12;
                osc.connect(g);
                g.connect(this.padFilter);
                osc.start();
                padOscs.push(osc);
            });
            this.padOscs = padOscs;
        };
        playChord(chords[0]);
        const filterLFO = this.ctx.createOscillator();
        filterLFO.type = 'sine';
        filterLFO.frequency.value = 0.02;
        const lfoG = this.ctx.createGain();
        lfoG.gain.value = 60;
        filterLFO.connect(lfoG);
        lfoG.connect(this.padFilter.frequency);
        filterLFO.start();
        this.musicInterval = setInterval(() => {
            cur = (cur + 1) % 4;
            const next = chords[cur], now = this.ctx.currentTime;
            const newOscs = [];
            next.forEach(f => {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = f;
                const g = this.ctx.createGain();
                g.gain.setValueAtTime(0, now);
                g.gain.linearRampToValueAtTime(0.09, now + 1.8);
                osc.connect(g);
                g.connect(chordGain);
                osc.start(now);
                newOscs.push(osc);
            });
            activeOscs.forEach(o => { try { o.stop(now + 2.5); } catch (e) {} });
            activeOscs = newOscs;
            padOscs.forEach(o => { try { o.stop(now + 2.0); } catch (e) {} });
            padOscs = [];
            const root = next[0], fifth = next[2] || root * 1.5;
            [root, fifth].forEach(f => {
                const osc = this.ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = f;
                const g = this.ctx.createGain();
                g.gain.setValueAtTime(0, now);
                g.gain.linearRampToValueAtTime(0.12, now + 1.5);
                osc.connect(g);
                g.connect(this.padFilter);
                osc.start(now);
                padOscs.push(osc);
            });
            this.padOscs = padOscs;
            this.currentChordFreqs = next;
        }, 8500 + Math.random() * 4000);
        this.arpInterval = setInterval(() => {
            if (!this.currentChordFreqs) return;
            const freqs = this.currentChordFreqs, now = this.ctx.currentTime;
            const count = Math.floor(Math.random() * 3) + 1;
            const sel = [];
            for (let i = 0; i < count; i++) sel.push(freqs[Math.floor(Math.random() * freqs.length)]);
            sel.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = freq * (Math.random() < 0.5 ? 2 : 1.5);
                const g = this.ctx.createGain();
                const start = now + i * 0.06;
                g.gain.setValueAtTime(0.001, start);
                g.gain.linearRampToValueAtTime(0.06, start + 0.015);
                g.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
                osc.connect(g);
                g.connect(this.musicGainNode);
                g.connect(this.reverbInput);
                osc.start(start);
                osc.stop(start + 0.35);
            });
        }, 280 + Math.random() * 280);
    }
    duckMusic() {
        if (!this.musicGainNode) return;
        const now = this.ctx.currentTime;
        this.musicGainNode.gain.cancelScheduledValues(now);
        this.musicGainNode.gain.setValueAtTime(this.musicBaseGain, now);
        this.musicGainNode.gain.linearRampToValueAtTime(this.musicBaseGain * 0.35, now + 0.02);
        this.musicGainNode.gain.linearRampToValueAtTime(this.musicBaseGain, now + 0.35);
    }
    _playReverbed(source, dryL = 0.4, wetL = 0.7) {
        const dry = this.ctx.createGain();
        dry.gain.value = dryL;
        const wet = this.ctx.createGain();
        wet.gain.value = wetL;
        source.connect(dry);
        source.connect(wet);
        dry.connect(this.masterGain);
        if (this.reverbInput) wet.connect(this.reverbInput);
        else wet.connect(this.masterGain);
        return { dry, wet, source };
    }
    playPing() {
        if (!this.initialized) return;
        this.duckMusic();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(70, now);
        osc.frequency.exponentialRampToValueAtTime(22, now + 0.65);
        const oscGain = this.ctx.createGain();
        oscGain.gain.setValueAtTime(0.35, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
        osc.connect(oscGain);
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) noiseData[i] = (Math.random() * 2 - 1);
        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.18, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(400, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(70, now + 0.3);
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        const mixed = this.ctx.createGain();
        oscGain.connect(mixed);
        noiseGain.connect(mixed);
        this._playReverbed(mixed, 0.5, 0.75);
        noise.start(now);
        osc.start(now);
        osc.stop(now + 1.4);
    }
    playCrystalCollect() {
        if (!this.initialized) return;
        this.duckMusic();
        const now = this.ctx.currentTime;
        [196, 247, 330, 392, 523].forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = f;
            const g = this.ctx.createGain();
            const t = now + i * 0.08;
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(0.18, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
            osc.connect(g);
            this._playReverbed(g, 0.35, 0.65);
            osc.start(t);
            osc.stop(t + 0.8);
        });
    }
    playDamage() {
        if (!this.initialized) return;
        this.duckMusic();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(45, now);
        osc.frequency.exponentialRampToValueAtTime(14, now + 0.35);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.4, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.connect(g);
        this._playReverbed(g, 0.55, 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
    }
    playTideWarning() {
        if (!this.initialized) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(32, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.8);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.1, now);
        g.gain.linearRampToValueAtTime(0.19, now + 0.4);
        g.gain.linearRampToValueAtTime(0.04, now + 0.8);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.9);
    }
    playExitReveal() {
        if (!this.initialized) return;
        this.duckMusic();
        const now = this.ctx.currentTime;
        [165, 220, 277, 330, 440, 550].forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = f;
            const g = this.ctx.createGain();
            const t = now + i * 0.1;
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(0.22, t + 0.03);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
            osc.connect(g);
            this._playReverbed(g, 0.35, 0.75);
            osc.start(t);
            osc.stop(t + 1.3);
        });
    }
    playDarknessDeath() {
        if (!this.initialized) return;
        this.duckMusic();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 1.8);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
        osc.connect(gain);
        this._playReverbed(gain, 0.4, 0.8);
        osc.start(now);
        osc.stop(now + 2.5);
    }
    playTideDeath() {
        if (!this.initialized) return;
        this.duckMusic();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 2.0);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        osc.connect(gain);
        this._playReverbed(gain, 0.5, 0.8);
        osc.start(now);
        osc.stop(now + 2.8);
    }
    playEnemyConsumed() {
        if (!this.initialized) return;
        this.duckMusic();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.7);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc.connect(gain);
        this._playReverbed(gain, 0.4, 0.7);
        osc.start(now);
        osc.stop(now + 1.2);
    }
    playVictory() {
        if (!this.initialized || !this.ctx) return;
        try {
            if (this.musicGainNode) this.duckMusic();
            const now = this.ctx.currentTime;
            const notes = [261, 329, 392, 523, 659];
            notes.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = freq;
                const gain = this.ctx.createGain();
                const start = now + i * 0.12;
                gain.gain.setValueAtTime(0.001, start);
                gain.gain.linearRampToValueAtTime(0.25, start + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
                osc.connect(gain);
                this._playReverbed(gain, 0.45, 0.7);
                osc.start(start);
                osc.stop(start + 1.0);
            });
        } catch (e) { console.warn('Victory sound error', e); }
    }
    resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }
    mute(m) { if (this.masterGain) this.masterGain.gain.value = m ? 0 : 0.25; }
};