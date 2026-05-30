export class SoundManager {
    constructor() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            this.ctx = null;
        }
    }

    playShoot() {
        if (!this.ctx) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(900, this.ctx.currentTime);
        g.gain.setValueAtTime(0.0015, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.08, this.ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
        o.connect(g); g.connect(this.ctx.destination);
        o.start();
        o.stop(this.ctx.currentTime + 0.15);
    }

    playHit() {
        if (!this.ctx) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(320, this.ctx.currentTime);
        g.gain.setValueAtTime(0.001, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 0.01);
        g.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
        o.connect(g); g.connect(this.ctx.destination);
        o.start();
        o.stop(this.ctx.currentTime + 0.25);
    }

    playExplosion() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 1.0;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-3 * i / bufferSize);
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.2, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        src.connect(g); g.connect(this.ctx.destination);
        src.start();
    }

    playEmpty() {
        if (!this.ctx) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(220, this.ctx.currentTime);
        g.gain.setValueAtTime(0.0005, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.02, this.ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.12);
        o.connect(g); g.connect(this.ctx.destination);
        o.start();
        o.stop(this.ctx.currentTime + 0.12);
    }
}

export const soundManager = new SoundManager();
