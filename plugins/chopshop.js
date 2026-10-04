/*
 * Chop Shop - a sample chopper for CarrotBox.
 *
 *  - finds 16 cues for you (hits first, then the beat grid)
 *  - detects the sample's BPM and musical key
 *  - shifts the key without changing the speed, and stretches the sample to
 *    your song's tempo without changing the pitch
 *  - plays cues from the pads or from keys (or plays the whole sample pitched)
 *  - writes the chopped loop into the current pattern
 *
 * Instrument plugin: every note creates one voice (see createVoice/render).
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotDSP, FLSampleBank, Config, flToast, flMidiName } = A;

    // ---- window skin: black deck, big key / tempo readouts, ringed pads (Serato Sample-like)
    A.addStyle(`
.cb-window.cb-plugin-chopshop { --cb-plugin-color: #ff5a5a; }
.cb-plugin-chopshop .cb-window-body { background: #0d0d0f !important; color: #e6e6e8; }
.cb-window.cb-plugin-chopshop .cb-section { background: #17171a !important; border: 1px solid #2a2a2f !important; border-radius: 6px !important; }
.cb-window.cb-plugin-chopshop .cb-section-title { color: #9b9ba3 !important; font-weight: 700; }
.cb-plugin-chopshop .cb-canvas { background: #050506 !important; border: 1px solid #26262b; border-radius: 4px; }
.cb-plugin-chopshop .cb-chop-readouts { display: flex; gap: 8px; margin: 0 0 8px; }
.cb-plugin-chopshop .cb-chop-readout { flex: 1 1 0; background: #17171a; border: 1px solid #2a2a2f; border-radius: 6px; padding: 5px 10px; }
.cb-plugin-chopshop .cb-chop-readout small { display: block; font-size: 9px; letter-spacing: 0.12em; color: #8a8a92; text-transform: uppercase; }
.cb-plugin-chopshop .cb-chop-readout b { font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: 0.02em; }
.cb-plugin-chopshop .cb-chop-readout b.cb-accent { color: #ff5a5a; }
`);

    const CUES = 16;
    const PLAY_MODES = ["Slice (to the next cue)", "To the end of the sample", "Gate (while the note is held)"];
    const KEY_MODES = ["Cues on keys / drum rows", "Whole sample, pitched by key"];
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    const OUTPUT_GAIN = 2.75;

    A.addStyle(`
.cb-chop-wave { display: block; width: 100%; height: 150px; cursor: crosshair; touch-action: none; }
.cb-chop-pads { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
.cb-chop-pad { height: 46px; border: none; border-radius: 6px; color: #111; font-weight: bold; font-size: 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.15; position: relative; opacity: 0.85; }
.cb-chop-pad small { font-weight: normal; font-size: 9px; opacity: 0.75; }
.cb-chop-pad:hover { opacity: 1; }
.cb-chop-pad.cb-selected { outline: 2px solid #fff; opacity: 1; }
.cb-chop-pad.cb-hit { filter: brightness(1.5); }
.cb-chop-info { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; }
.cb-chop-chip { font-size: 11px; padding: 2px 9px; border-radius: 10px; background: var(--ui-widget-background, #333); color: var(--primary-text, #fff); }
.cb-chop-chip b { color: var(--cb-plugin-color, #ff6b6b); }
.cb-chop-drop { border: 2px dashed var(--ui-widget-focus, #666); border-radius: 8px; padding: 12px 8px; text-align: center; color: var(--secondary-text, #aaa); }
.cb-chop-drop.fl-drop-hover { background: rgba(255,107,107,0.13); color: var(--primary-text, #fff); }
.cb-chop-main { display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 8px; }
.cb-chop-progress { height: 6px; border-radius: 3px; background: var(--ui-widget-background, #333); overflow: hidden; }
.cb-chop-progress div { height: 100%; width: 0; background: var(--cb-plugin-color, #ff6b6b); transition: width 0.1s; }
.cb-chop-bpm { width: 64px; height: 22px; font-size: 12px; text-align: center; border: none; border-radius: 4px; background: var(--ui-widget-background, #333); color: var(--primary-text, #fff); }
`);

    // ------------------------------------------------------------ params
    function defaults() {
        return {
            sample: { id: null, name: "" },
            cues: [],
            bpm: 120,
            key: -1,
            minor: false,
            keyShift: 0,
            sync: false,
            mode: 0,
            play: 0,
            base: 48,
            root: 60,
            gain: 0,
            attack: 2,
            release: 80,
            reverse: false,
            selected: 0,
        };
    }
    function fill(p) {
        const d = defaults();
        for (const key of Object.keys(d)) if (p[key] === undefined || p[key] === null) p[key] = d[key];
        if (!p.sample || typeof p.sample != "object") p.sample = { id: null, name: "" };
        if (!Array.isArray(p.cues)) p.cues = [];
        return p;
    }

    // ---------------------------------------------------------- analysis
    function toMono11k(pcm, rate) {
        const factor = Math.max(1, Math.round(rate / 11025));
        const n = Math.floor(pcm.length / factor);
        const out = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            let sum = 0;
            for (let k = 0; k < factor; k++) sum += pcm[i * factor + k];
            out[i] = sum / factor;
        }
        return { pcm: out, rate: rate / factor };
    }
    function spectralFlux(pcm, rate, size, hop) {
        const re = new Float64Array(size), im = new Float64Array(size);
        const flux = [];
        const maxBin = Math.min(size / 2, Math.floor(4000 / rate * size));
        let prev = new Float64Array(maxBin);
        for (let start = 0; start + size <= pcm.length; start += hop) {
            for (let i = 0; i < size; i++) { re[i] = pcm[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / size)); im[i] = 0; }
            CarrotDSP.fft(re, im, false);
            let f = 0;
            const cur = new Float64Array(maxBin);
            for (let k = 1; k < maxBin; k++) {
                cur[k] = Math.log(1 + 40 * Math.hypot(re[k], im[k]) / size * 8);
                f += Math.max(0, cur[k] - prev[k]);
            }
            flux.push(f);
            prev = cur;
        }
        return flux;
    }
    // Returns { bpm, offset (seconds of the first beat), confidence }.
    function detectTempo(pcm, rate) {
        if (pcm.length / rate < 2) return null;
        const m = toMono11k(pcm, rate);
        const hop = 256, size = 1024;
        const flux = spectralFlux(m.pcm, m.rate, size, hop);
        if (flux.length < 32) return null;
        const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
        const x = flux.map(v => v - mean);
        const secondsPerFrame = hop / m.rate;
        const score = (bpm) => {
            const lag = 60 / bpm / secondsPerFrame;
            if (lag < 2 || lag * 2 > x.length) return -1e9;
            let sum = 0, count = 0;
            for (let k = 1; k <= 4; k++) {
                const l = lag * k;
                if (l * 1 >= x.length - 1) break;
                const i0 = Math.floor(l), fr = l - i0;
                let c = 0;
                for (let i = 0; i + i0 + 1 < x.length; i++) c += x[i] * (x[i + i0] * (1 - fr) + x[i + i0 + 1] * fr);
                sum += c / (x.length - i0) / k;
                count++;
            }
            const prior = Math.exp(-Math.pow(Math.log2(bpm / 120), 2) / (2 * 0.55 * 0.55));
            return (sum / Math.max(1, count)) * (0.4 + 0.6 * prior);
        };
        let best = 120, bestScore = -1e9;
        for (let bpm = 60; bpm <= 200; bpm += 0.5) {
            const s = score(bpm);
            if (s > bestScore) { bestScore = s; best = bpm; }
        }
        // refine
        let refined = best, refinedScore = bestScore;
        for (let bpm = best - 0.5; bpm <= best + 0.5; bpm += 0.05) {
            const s = score(bpm);
            if (s > refinedScore) { refinedScore = s; refined = bpm; }
        }
        // beat phase
        const period = 60 / refined / secondsPerFrame;
        let bestPhase = 0, bestSum = -1e9;
        for (let phase = 0; phase < period; phase += 0.5) {
            let sum = 0;
            for (let t = phase; t < flux.length; t += period) sum += flux[Math.floor(t)];
            if (sum > bestSum) { bestSum = sum; bestPhase = phase; }
        }
        const variance = x.reduce((a, b) => a + b * b, 0) / x.length;
        return { bpm: Math.round(refined * 10) / 10, offset: bestPhase * secondsPerFrame, confidence: Math.max(0, Math.min(1, bestScore / (variance + 1e-9))) };
    }
    // Krumhansl-Schmuckler key finding. Returns { root: 0-11 (C = 0), minor, confidence }.
    function detectKey(pcm, rate) {
        const m = toMono11k(pcm, rate);
        const size = 4096, hop = 2048;
        const re = new Float64Array(size), im = new Float64Array(size);
        const chroma = new Float64Array(12);
        const lo = Math.floor(65 / m.rate * size), hi = Math.floor(1100 / m.rate * size);
        for (let start = 0; start + size <= m.pcm.length; start += hop) {
            for (let i = 0; i < size; i++) { re[i] = m.pcm[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / size)); im[i] = 0; }
            CarrotDSP.fft(re, im, false);
            for (let k = lo; k <= hi; k++) {
                const mag = Math.hypot(re[k], im[k]);
                const hz = k * m.rate / size;
                const pc = ((Math.round(12 * Math.log2(hz / 440)) + 9) % 12 + 12) % 12;
                chroma[pc] += Math.sqrt(mag);
            }
        }
        const total = chroma.reduce((a, b) => a + b, 0);
        if (total <= 0) return null;
        const corr = (profile, shift) => {
            let mc = 0, mp = 0;
            for (let i = 0; i < 12; i++) { mc += chroma[i]; mp += profile[i]; }
            mc /= 12; mp /= 12;
            let num = 0, dc = 0, dp = 0;
            for (let i = 0; i < 12; i++) {
                const c = chroma[(i + shift) % 12] - mc, p = profile[i] - mp;
                num += c * p; dc += c * c; dp += p * p;
            }
            return num / Math.sqrt(dc * dp + 1e-12);
        };
        let best = { root: 0, minor: false, score: -2 }, second = -2;
        for (let root = 0; root < 12; root++) {
            for (const minor of [false, true]) {
                const s = corr(minor ? MINOR_PROFILE : MAJOR_PROFILE, root);
                if (s > best.score) { second = best.score; best = { root, minor, score: s }; }
                else if (s > second) second = s;
            }
        }
        // Drums and noise spread their energy over all 12 notes: no key to find.
        let entropy = 0;
        for (let i = 0; i < 12; i++) { const q = chroma[i] / total; if (q > 0) entropy -= q * Math.log2(q); }
        entropy /= Math.log2(12);
        const tonal = Math.max(0, Math.min(1, (0.97 - entropy) * 12));
        return { root: best.root, minor: best.minor, confidence: tonal * Math.max(0.3, Math.min(1, (best.score - second) * 6 + 0.3)) };
    }
    function keyName(root, minor) {
        return NOTE_NAMES[root] + (minor ? " minor" : " major");
    }
    // Hits first, then the beat grid, then equal slices.
    function findCues(pcm, rate, bpm, offset) {
        let hits = [];
        for (const sens of [0.45, 0.6, 0.75, 0.9, 1]) {
            hits = FLSampleBank.detectTransients(pcm, rate, sens, 0.06);
            if (hits.length >= CUES - 1) break;
        }
        const seconds = pcm.length / rate;
        let cues = [0];
        if (hits.length + 1 > CUES) {
            // keep the strongest-looking ones: spread them evenly through the list
            const picks = [];
            for (let i = 0; i < CUES - 1; i++) picks.push(hits[Math.floor(i * hits.length / (CUES - 1))]);
            cues = cues.concat(picks);
        }
        else cues = cues.concat(hits);
        if (cues.length < CUES) {
            const grid = [];
            if (bpm) {
                const step = 60 / bpm / 2 / seconds;
                for (let t = (offset || 0) / seconds; t < 1; t += step) grid.push(t);
            }
            else for (let i = 1; i < CUES; i++) grid.push(i / CUES);
            for (const g of grid) {
                if (cues.length >= CUES) break;
                if (cues.every(c => Math.abs(c - g) * seconds > 0.04)) cues.push(g);
            }
        }
        let i = 1;
        while (cues.length < CUES && i < 64) {
            const g = (i * 0.0618033 % 1);
            if (cues.every(c => Math.abs(c - g) * seconds > 0.02)) cues.push(g);
            i++;
        }
        for (let k = 0; cues.length < CUES && k < 64; k++) {
            const g = (k + 0.5) / CUES;
            if (cues.indexOf(g) == -1) cues.push(g);
        }
        cues.sort((a, b) => a - b);
        return cues.slice(0, CUES).map(v => Math.round(v * 1e6) / 1e6);
    }

    // --------------------------------------------- key shift / time stretch
    // WSOLA time stretch: output is `ratio` times as long, pitch unchanged.
    class Stretcher {
        constructor(input, ratio) {
            this.input = input;
            this.ratio = Math.max(0.35, Math.min(3, ratio));
            this.frame = 2048;
            this.hop = 512;
            this.tolerance = 256;
            const outLength = Math.ceil(input.length * this.ratio) + this.frame * 2;
            this.out = new Float32Array(outLength);
            this.norm = new Float32Array(outLength);
            this.window = new Float32Array(this.frame);
            for (let i = 0; i < this.frame; i++) this.window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / this.frame);
            this.posS = 0;
            this.prevA = 0;
            this.done = false;
            this.addFrame(0, 0);
        }
        addFrame(posA, posS) {
            const { input, out, norm, window, frame } = this;
            for (let i = 0; i < frame; i++) {
                const s = input[posA + i] || 0, w = window[i], o = posS + i;
                if (o >= out.length) break;
                out[o] += s * w;
                norm[o] += w;
            }
        }
        step(budgetMs) {
            const t0 = performance.now();
            const { input, frame, hop, tolerance } = this;
            while (!this.done && performance.now() - t0 < budgetMs) {
                this.posS += hop;
                const ideal = Math.round(this.posS / this.ratio);
                if (ideal >= input.length) { this.done = true; break; }
                const natural = this.prevA + hop;
                let bestOffset = 0, best = -Infinity;
                for (let d = -tolerance; d <= tolerance; d += 2) {
                    const a = ideal + d;
                    if (a < 0) continue;
                    let c = 0;
                    for (let i = 0; i < 512; i += 4) c += (input[a + i] || 0) * (input[natural + i] || 0);
                    if (c > best) { best = c; bestOffset = d; }
                }
                const posA = Math.max(0, ideal + bestOffset);
                this.addFrame(posA, this.posS);
                this.prevA = posA;
            }
            return this.done ? 1 : Math.min(0.99, this.prevA / Math.max(1, input.length));
        }
        result() {
            const length = Math.floor(this.input.length * this.ratio);
            const out = new Float32Array(length);
            for (let i = 0; i < length; i++) out[i] = this.norm[i] > 1e-4 ? this.out[i] / this.norm[i] : 0;
            return out;
        }
    }
    function resample(input, factor) {
        const length = Math.floor(input.length / factor);
        const out = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            const pos = i * factor, i0 = Math.floor(pos), f = pos - i0;
            out[i] = (input[i0] || 0) * (1 - f) + (input[i0 + 1] || 0) * f;
        }
        return out;
    }
    const processed = new Map();
    function processKey(id, shift, tempoRatio) {
        return id + "|" + shift + "|" + tempoRatio.toFixed(3);
    }
    // Returns the processed entry {pcm, rate, status, progress}; starts the work when needed.
    function getProcessed(id, shift, tempoRatio, listener) {
        const entry = FLSampleBank.request(id);
        if (!entry || entry.status != "ready" || entry.pcm.length < 2) return null;
        if (shift == 0 && Math.abs(tempoRatio - 1) < 0.002) return { pcm: entry.pcm, rate: entry.rate, status: "ready", progress: 1, raw: true };
        const key = processKey(id, shift, tempoRatio);
        let job = processed.get(key);
        if (job) {
            processed.delete(key);
            processed.set(key, job);
            if (listener && job.status != "ready") job.listeners.push(listener);
            return job;
        }
        if (entry.pcm.length / entry.rate > 45) return null;
        job = { pcm: null, rate: entry.rate, status: "working", progress: 0, listeners: listener ? [listener] : [] };
        processed.set(key, job);
        while (processed.size > 6) processed.delete(processed.keys().next().value);
        const pitch = Math.pow(2, shift / 12);
        const stretcher = new Stretcher(entry.pcm, tempoRatio * pitch);
        const tick = () => {
            if (processed.get(key) !== job) return;
            job.progress = stretcher.step(14);
            for (const l of job.listeners) l(job);
            if (!stretcher.done) { setTimeout(tick, 2); return; }
            let result = stretcher.result();
            if (Math.abs(pitch - 1) > 1e-6) result = resample(result, pitch);
            job.pcm = result;
            job.status = "ready";
            job.progress = 1;
            for (const l of job.listeners) l(job);
            job.listeners = [];
        };
        setTimeout(tick, 0);
        return job;
    }
    function songMajorRoot(song) {
        const flags = Config.scales[song.scale].flags;
        const minor = flags[3] && !flags[4];
        const root = ((Config.keys[song.key].basePitch % 12) + 12) % 12;
        return { root, minor };
    }

    // ------------------------------------------------------------- voice
    function resolveBuffer(params, info) {
        const id = params.sample && params.sample.id;
        if (!id) return null;
        let tempoRatio = 1;
        if (params.sync && params.bpm > 0 && info.bpm > 0) tempoRatio = Math.round(params.bpm / info.bpm * 1000) / 1000;
        const job = getProcessed(id, params.keyShift | 0, tempoRatio, null);
        if (job && job.status == "ready" && job.pcm) return { pcm: job.pcm, rate: job.rate, ratio: job.raw ? 1 : 1 };
        const raw = FLSampleBank.request(id);
        if (raw && raw.status == "ready") return { pcm: raw.pcm, rate: raw.rate, ratio: 1, fallback: true };
        return null;
    }
    function cueRegion(params, cueIndex, length) {
        const cues = params.cues;
        if (!cues.length) return [0, length];
        const i = Math.max(0, Math.min(cues.length - 1, cueIndex));
        const start = cues[i] * length;
        let end = length;
        if (params.play == 0) {
            for (const c of cues) if (c * length > start + 8 && c * length < end) end = c * length;
        }
        return [Math.floor(start), Math.floor(end)];
    }
    function createVoice(params, info) {
        fill(params);
        const mode = params.mode | 0;
        let cue = 0;
        if (mode == 0) {
            // Cue 1 sits on the first key and the cues run upward; keys outside that range repeat the cues
            // so every key plays something.
            const raw = info.isNoise ? Math.round(info.notePitch) : Math.round(info.notePitch - params.base);
            const count = Math.max(1, Math.min(CUES, params.cues.length));
            cue = ((raw % count) + count) % count;
        }
        return { cue, pos: -1, start: 0, end: 0, dir: 1, level: 0, released: false, done: false, fade: 0, attackSamples: 0, rate: 1, lastId: null };
    }
    function render(voice, out, start, len, info) {
        if (voice.done) return;
        const params = fill(info.params);
        if (!info.gate && !voice.released) voice.released = true;
        const buf = resolveBuffer(params, info);
        if (!buf) return;
        const pcm = buf.pcm, length = pcm.length;
        const sr = info.sampleRate;
        if (voice.pos < 0) {
            const mode = params.mode | 0;
            const region = mode == 0 ? cueRegion(params, voice.cue, length) : [params.cues.length ? Math.floor(params.cues[Math.max(0, Math.min(params.cues.length - 1, params.selected | 0))] * length) : 0, length];
            voice.start = region[0];
            voice.end = Math.max(region[0] + 2, region[1]);
            voice.dir = params.reverse ? -1 : 1;
            voice.pos = voice.dir > 0 ? voice.start : voice.end - 1;
            voice.attackSamples = Math.max(1, Math.floor(params.attack / 1000 * sr));
            voice.age = 0;
            voice.gain = Math.pow(10, params.gain / 20) * OUTPUT_GAIN * (info.velocity == undefined ? 1 : (0.35 + 0.65 * info.velocity));
        }
        const mode = params.mode | 0;
        const rateBase = buf.rate / sr;
        const pitched = mode == 1 ? Math.pow(2, (info.midi - params.root) / 12) : 1;
        const gate = (params.play == 2 || mode == 1);
        const releaseSamples = Math.max(1, Math.floor(params.release / 1000 * sr));
        let pos = voice.pos, fade = voice.fade;
        for (let i = 0; i < len; i++) {
            if (voice.done) break;
            const i0 = Math.floor(pos);
            if (i0 < voice.start || i0 >= voice.end - 1) { voice.done = true; break; }
            const f = pos - i0;
            let s = pcm[i0] * (1 - f) + pcm[i0 + 1] * f;
            let env = Math.min(1, (voice.age + 1) / voice.attackSamples);
            if (gate && voice.released) {
                fade += 1 / releaseSamples;
                if (fade >= 1) { voice.done = true; break; }
                env *= 1 - fade;
            }
            else {
                // tiny fade at the very end of the slice avoids clicks
                const remaining = voice.dir > 0 ? voice.end - 1 - pos : pos - voice.start;
                if (remaining < 64) env *= Math.max(0, remaining / 64);
            }
            out[start + i] += s * env * voice.gain;
            pos += voice.dir * rateBase * pitched;
            voice.age++;
        }
        voice.pos = pos;
        voice.fade = fade;
    }

    // ---------------------------------------------------------------- editor
    function cueColor(i, alpha) {
        return "hsla(" + Math.round(i / CUES * 340) + ", 75%, 62%, " + (alpha == undefined ? 1 : alpha) + ")";
    }
    function buildEditor(host) {
        fill(host.params());
        const root = HTML.div();
        const getP = () => fill(host.params());
        const state = { view: [0, 1], drag: null, entry: null, analyzing: false, hit: -1 };
        const rawEntry = () => { const p = getP(); return p.sample.id ? FLSampleBank.request(p.sample.id) : null; };
        const songTempo = () => host.song.tempo;
        const tempoRatio = () => { const p = getP(); return p.sync && p.bpm > 0 ? p.bpm / songTempo() : 1; };
        const currentProcessed = () => {
            const p = getP();
            if (!p.sample.id) return null;
            return getProcessed(p.sample.id, p.keyShift | 0, Math.round(tempoRatio() * 1000) / 1000, onProgress);
        };

        // ----------------------------------------------------- waveform
        const wave = HTML.canvas({ class: "cb-canvas cb-chop-wave", title: "Drag a cue marker to move it. Click to hear from that spot. Double-click to move the selected pad's cue here. Scroll to zoom." });
        const draw = () => {
            const { ctx, w, h } = CarrotUI.ctx(wave);
            const p = getP();
            ctx.fillStyle = "#0b0d12";
            ctx.fillRect(0, 0, w, h);
            const entry = rawEntry();
            if (!entry || entry.status != "ready") {
                ctx.fillStyle = "rgba(255,255,255,0.35)";
                ctx.font = "12px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(!p.sample.id ? "Drop a sample here, or choose one below" : entry && entry.status == "missing" ? "This sample isn't in this browser - load the project file that contains it" : "Loading...", w / 2, h / 2);
                return;
            }
            const [v0, v1] = state.view;
            const peaks = FLSampleBank.getPeaks(p.sample.id, Math.min(16384, Math.max(64, Math.floor(w / (v1 - v0)))));
            const mid = h / 2, count = peaks.length / 2;
            ctx.strokeStyle = "#ff8f8f";
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            for (let x = 0; x < w; x++) {
                const t = v0 + (x / w) * (v1 - v0);
                const b = Math.min(count - 1, Math.max(0, Math.floor(t * count)));
                ctx.moveTo(x + 0.5, mid - peaks[b * 2 + 1] * (mid - 14));
                ctx.lineTo(x + 0.5, mid - peaks[b * 2] * (mid - 14) + 0.5);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
            // beat grid
            if (p.bpm > 0) {
                const seconds = entry.pcm.length / entry.rate;
                const step = 60 / p.bpm / seconds;
                ctx.fillStyle = "rgba(255,255,255,0.07)";
                const first = Math.ceil(v0 / step);
                for (let k = first; k * step < v1; k++) ctx.fillRect(Math.round((k * step - v0) / (v1 - v0) * w), 0, 1, h);
            }
            p.cues.forEach((c, i) => {
                if (c < v0 || c > v1) return;
                const x = Math.round((c - v0) / (v1 - v0) * w) + 0.5;
                ctx.fillStyle = cueColor(i, i == p.selected ? 1 : 0.8);
                ctx.fillRect(x - 1, 0, i == p.selected ? 3 : 2, h);
                ctx.beginPath();
                ctx.moveTo(x, 0); ctx.lineTo(x + 14, 0); ctx.lineTo(x + 14, 12); ctx.lineTo(x, 12);
                ctx.fill();
                ctx.fillStyle = "#111";
                ctx.font = "bold 9px sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                ctx.fillText(String(i + 1), x + 3, 2);
            });
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.font = "10px sans-serif";
            ctx.textBaseline = "bottom";
            ctx.textAlign = "left";
            ctx.fillText(((v0 * entry.pcm.length / entry.rate)).toFixed(2) + "s", 4, h - 3);
            ctx.textAlign = "right";
            ctx.fillText(((v1 * entry.pcm.length / entry.rate)).toFixed(2) + "s", w - 4, h - 3);
        };
        const posFromEvent = (event) => {
            const rect = wave.getBoundingClientRect();
            const [v0, v1] = state.view;
            return { x: event.clientX - rect.left, w: rect.width, t: v0 + (event.clientX - rect.left) / rect.width * (v1 - v0) };
        };
        const nearestCue = (pos) => {
            const p = getP();
            const [v0, v1] = state.view;
            let best = -1, bestD = 8;
            p.cues.forEach((c, i) => {
                const d = Math.abs((c - v0) / (v1 - v0) * pos.w - pos.x);
                if (d < bestD) { bestD = d; best = i; }
            });
            return best;
        };
        const auditionFrom = (fraction, toNext) => {
            const job = currentProcessed();
            const p = getP();
            const entry = rawEntry();
            if (!entry || entry.status != "ready") return;
            const buf = job && job.status == "ready" && job.pcm ? job : { pcm: entry.pcm, rate: entry.rate };
            let end = 1;
            if (toNext && p.play == 0) for (const c of p.cues) if (c > fraction + 0.0005 && c < end) end = c;
            FLSampleBank.previewPcm(buf.pcm, buf.rate, fraction, end);
        };
        const selectCue = (i) => { const p = getP(); p.selected = i; host.changed(); refreshAll(); };
        wave.addEventListener("pointerdown", (event) => {
            const p = getP();
            if (!p.sample.id) return;
            const pos = posFromEvent(event);
            const cue = nearestCue(pos);
            wave.setPointerCapture(event.pointerId);
            if (cue >= 0) {
                state.drag = { cue, moved: false };
                if (p.selected != cue) { p.selected = cue; host.changed(); refreshPads(); }
            }
            else state.drag = { pan: true, x: event.clientX, view: state.view.slice(), t: pos.t };
        });
        wave.addEventListener("pointermove", (event) => {
            const pos = posFromEvent(event);
            if (!state.drag) { wave.style.cursor = nearestCue(pos) >= 0 ? "ew-resize" : "crosshair"; return; }
            const p = getP();
            if (state.drag.cue != undefined) {
                p.cues[state.drag.cue] = Math.max(0, Math.min(0.9995, pos.t));
                state.drag.moved = true;
                host.changed();
                draw();
            }
            else if (state.drag.pan && Math.abs(event.clientX - state.drag.x) > 4) state.drag.panning = true;
        });
        const release = (event) => {
            if (!state.drag) return;
            const d = state.drag;
            state.drag = null;
            const pos = posFromEvent(event);
            if (d.cue != undefined) { if (!d.moved) auditionFrom(getP().cues[d.cue], true); else refreshAll(); }
            else if (d.pan) auditionFrom(Math.max(0, Math.min(0.999, pos.t)), true);
        };
        wave.addEventListener("pointerup", release);
        wave.addEventListener("pointercancel", () => { state.drag = null; });
        wave.addEventListener("dblclick", (event) => {
            const p = getP();
            if (!p.sample.id) return;
            const pos = posFromEvent(event);
            p.cues[p.selected | 0] = Math.max(0, Math.min(0.9995, pos.t));
            host.changed(); refreshAll();
        });
        wave.addEventListener("wheel", (event) => {
            event.preventDefault();
            const pos = posFromEvent(event);
            const [v0, v1] = state.view;
            const span = v1 - v0;
            const next = Math.max(0.005, Math.min(1, span * Math.exp(event.deltaY * 0.0015)));
            const a = (pos.t - v0) / span;
            const n0 = Math.max(0, Math.min(1 - next, pos.t - a * next));
            state.view = [n0, n0 + next];
            draw();
        }, { passive: false });

        // ------------------------------------------------------- pads
        const padGrid = HTML.div({ class: "cb-chop-pads" });
        const pads = [];
        const padLabel = (i) => {
            const p = getP();
            if (host.song.getChannelIsNoise(host.target.channel != undefined ? host.target.channel : host.editor.doc.channel)) return "row " + (i + 1);
            return flMidiName(Config.keys[host.song.key].basePitch + p.base + i);
        };
        for (let row = 3; row >= 0; row--) {
            for (let col = 0; col < 4; col++) {
                const i = row * 4 + col;
                const pad = HTML.button({ type: "button", class: "cb-chop-pad" });
                pad.style.background = cueColor(i, 1);
                pad.addEventListener("pointerdown", () => {
                    const p = getP();
                    p.selected = i;
                    host.changed();
                    auditionFrom(p.cues[i] != undefined ? p.cues[i] : 0, true);
                    pad.classList.add("cb-hit");
                    setTimeout(() => pad.classList.remove("cb-hit"), 140);
                    refreshPads();
                    draw();
                });
                pads[i] = pad;
                padGrid.appendChild(pad);
            }
        }
        const refreshPads = () => {
            const p = getP();
            const entry = rawEntry();
            const seconds = entry && entry.status == "ready" ? entry.pcm.length / entry.rate : 0;
            pads.forEach((pad, i) => {
                pad.innerHTML = "";
                pad.append(HTML.span(String(i + 1)), HTML.small(p.cues[i] != undefined ? (p.cues[i] * seconds).toFixed(2) + "s" : "-"), HTML.small(padLabel(i)));
                pad.classList.toggle("cb-selected", i == (p.selected | 0));
                pad.style.opacity = p.cues[i] != undefined ? "" : "0.35";
            });
        };

        // ---------------------------------------------------- loading
        const info = HTML.div({ class: "cb-chop-info" });
        const progress = HTML.div({ class: "cb-chop-progress" }, HTML.div());
        const status = CarrotUI.hint("Load a loop, a vocal, a drum break or a full song snippet.");
        const bpmInput = HTML.input({ type: "number", class: "cb-chop-bpm", min: "30", max: "300", step: "0.1", title: "The sample's tempo. Edit if the detected value is wrong (try doubling or halving it)." });
        bpmInput.addEventListener("keydown", (e) => e.stopPropagation());
        bpmInput.addEventListener("change", () => { const p = getP(); p.bpm = Math.max(30, Math.min(300, +bpmInput.value || 120)); host.changed(); refreshAll(); });
        const onProgress = (job) => {
            progress.firstChild.style.width = job.raw ? "0%" : Math.round(job.progress * 100) + "%";
            if (job.raw) return;
            if (job.status == "ready") { status.textContent = "Ready: key shift and tempo sync are applied."; draw(); }
            else status.textContent = "Processing the sample (key shift / tempo sync)... " + Math.round(job.progress * 100) + "%";
        };
        // big readouts over the waveform, like a sampler deck: key, tempo, cues, length
        const readout = (label) => { const b = HTML.b("-"); const el = HTML.div({ class: "cb-chop-readout" }, HTML.small(label), b); el.value = b; return el; };
        const rKey = readout("Key"), rBpm = readout("BPM"), rCues = readout("Cues"), rLen = readout("Length");
        const readouts = HTML.div({ class: "cb-chop-readouts" }, rKey, rBpm, rCues, rLen);
        const refreshReadouts = () => {
            const p = getP();
            const entry = rawEntry();
            const ready = entry && entry.status == "ready";
            const shifted = p.key >= 0 ? (((p.key + (p.keyShift | 0)) % 12) + 12) % 12 : -1;
            rKey.value.textContent = shifted >= 0 ? keyName(shifted, p.minor) : "-";
            rKey.value.classList.toggle("cb-accent", !!p.keyShift);
            rBpm.value.textContent = p.bpm ? (p.sync ? Math.round(songTempo()) + " (" + p.bpm + ")" : String(p.bpm)) : "-";
            rBpm.value.classList.toggle("cb-accent", !!p.sync);
            rCues.value.textContent = ready ? String(p.cues.length) : "-";
            rLen.value.textContent = ready ? (entry.pcm.length / entry.rate).toFixed(2) + " s" : "-";
        };
        const refreshInfo = () => {
            refreshReadouts();
            const p = getP();
            const entry = rawEntry();
            info.innerHTML = "";
            if (!entry || entry.status != "ready") return;
            const seconds = entry.pcm.length / entry.rate;
            info.append(
                HTML.span({ class: "cb-chop-chip" }, HTML.b(p.sample.name || "Sample"), " " + seconds.toFixed(2) + "s"),
                HTML.span({ class: "cb-chop-chip" }, "BPM ", HTML.b(p.bpm ? String(p.bpm) : "?")),
                HTML.span({ class: "cb-chop-chip" }, "Key ", HTML.b(p.key >= 0 ? keyName(p.key, p.minor) : "?")));
            if (p.sync && p.bpm) info.append(HTML.span({ class: "cb-chop-chip" }, "Speed ", HTML.b((songTempo() / p.bpm * 100).toFixed(0) + "%"), " of original"));
            if (p.keyShift) info.append(HTML.span({ class: "cb-chop-chip" }, "Shifted ", HTML.b((p.keyShift > 0 ? "+" : "") + p.keyShift + " st")));
            bpmInput.value = p.bpm ? String(p.bpm) : "";
        };
        const setSample = async (sample) => {
            const entry = await FLSampleBank.whenReady(sample.id);
            if (!entry || entry.status != "ready") { host.toast("Couldn't read " + (sample.name || "that file") + "."); return; }
            const p = getP();
            p.sample = { id: sample.id, name: sample.name || FLSampleBank.getName(sample.id) };
            p.keyShift = 0;
            p.sync = false;
            p.bpm = 0;
            p.key = -1;
            state.view = [0, 1];
            status.textContent = "Analyzing...";
            host.changed();
            refreshAll();
            await analyze();
        };
        const analyze = async (cuesToo = true) => {
            const p = getP();
            const entry = rawEntry();
            if (!entry || entry.status != "ready") return;
            state.analyzing = true;
            await new Promise(r => setTimeout(r, 20));
            try {
                const tempo = detectTempo(entry.pcm, entry.rate);
                const key = detectKey(entry.pcm, entry.rate);
                p.bpm = tempo ? tempo.bpm : (p.bpm || 0);
                if (key && key.confidence > 0.3 && entry.pcm.length / entry.rate > 0.3) { p.key = key.root; p.minor = key.minor; } else { p.key = -1; }
                if (cuesToo) p.cues = findCues(entry.pcm, entry.rate, tempo ? tempo.bpm : null, tempo ? tempo.offset : 0);
                p.selected = 0;
                status.textContent = "Found " + p.cues.length + " cues" + (tempo ? ", about " + tempo.bpm + " BPM" : "") + (p.key >= 0 ? ", " + keyName(p.key, p.minor) : "") + ". Drag the markers to adjust.";
            }
            catch (error) {
                console.error(error);
                status.textContent = "Couldn't analyze that sample: " + (error.message || error);
            }
            state.analyzing = false;
            host.changed();
            refreshAll();
        };
        const dropZone = HTML.div({ class: "cb-chop-drop" }, "Drop a sample here (or drag one from the Sound Browser)");
        host.acceptSampleDrops(dropZone, setSample);
        host.acceptSampleDrops(wave, setSample);
        const chooseButton = CarrotUI.button("Choose file...", async () => { const s = await host.pickAudioFile(); if (s) setSample(s); }, { primary: true });
        const hearButton = CarrotUI.button("Hear it", () => auditionFrom(0, false), { title: "Play the whole sample with the current key shift / tempo" });
        const stopButton = CarrotUI.button("Stop", () => FLSampleBank.stopPreview());

        // -------------------------------------------------- controls
        const syncKeyButton = CarrotUI.button("Match song key", () => {
            const p = getP();
            if (p.key < 0) { host.toast("Analyze the sample first."); return; }
            const song = songMajorRoot(host.song);
            const sampleRoot = (p.key + (p.minor ? 3 : 0)) % 12;
            const songRoot = (song.root + (song.minor ? 3 : 0)) % 12;
            let shift = ((songRoot - sampleRoot) % 12 + 12) % 12;
            if (shift > 6) shift -= 12;
            p.keyShift = shift;
            host.changed(); refreshAll();
            host.toast("Shifted " + (shift > 0 ? "+" : "") + shift + " semitones to fit the song's key");
        }, { title: "Shift the sample to the key of the song (speed stays the same)" });
        const analyzeButton = CarrotUI.button("Re-analyze", () => analyze(true), { title: "Detect BPM, key and cues again" });
        const equalButton = CarrotUI.button("16 equal cues", () => {
            const p = getP();
            p.cues = []; for (let i = 0; i < CUES; i++) p.cues.push(i / CUES);
            host.changed(); refreshAll();
        });
        const gridButton = CarrotUI.button("Cues on the beat", () => {
            const p = getP();
            const entry = rawEntry();
            if (!entry || entry.status != "ready" || !p.bpm) return;
            const seconds = entry.pcm.length / entry.rate;
            const tempo = detectTempo(entry.pcm, entry.rate);
            const offset = tempo ? tempo.offset : 0;
            const step = 60 / p.bpm / seconds * (p.bpm > 140 ? 2 : 1);
            p.cues = [];
            for (let t = offset / seconds; t < 1 && p.cues.length < CUES; t += step) p.cues.push(Math.round(t * 1e6) / 1e6);
            while (p.cues.length < CUES) p.cues.push(p.cues[p.cues.length - 1] != undefined ? Math.min(0.999, p.cues[p.cues.length - 1] + step) : 0);
            host.changed(); refreshAll();
        }, { title: "Place the cues on the beats using the BPM" });
        const chopButton = CarrotUI.button("Chop into pattern", () => chopToPattern(host, getP(), rawEntry()), { title: "Write the cues as notes into the current pattern so the loop plays back" });
        const progressRow = HTML.div(progress);
        const controls = HTML.div(
            CarrotUI.section("Sample", dropZone, CarrotUI.row(chooseButton, hearButton, stopButton)),
            CarrotUI.section("Key & tempo",
                CarrotUI.row(
                    host.knob("keyShift", { label: "Key shift", min: -12, max: 12, step: 1, def: 0, unit: " st", small: true, onChange: () => refreshAll() }),
                    HTML.div({ class: "cb-field" }, "BPM", bpmInput),
                    host.toggle("sync", { label: "Sync to song tempo", def: false, title: "Stretch the sample to the song's tempo without changing its pitch", onChange: () => refreshAll() })),
                CarrotUI.row(syncKeyButton, analyzeButton), progressRow),
            CarrotUI.section("Playback",
                CarrotUI.row(
                    host.select("mode", { label: "Keys", options: KEY_MODES, def: 0, onChange: () => refreshPads() }),
                    host.select("play", { label: "Cue plays", options: PLAY_MODES, def: 0 })),
                CarrotUI.row(
                    host.knob("gain", { label: "Gain", min: -24, max: 12, def: 0, unit: "dB", small: true }),
                    host.knob("attack", { label: "Attack", min: 0, max: 200, def: 2, unit: "ms", small: true }),
                    host.knob("release", { label: "Release", min: 5, max: 1000, def: 80, unit: "ms", curve: "exp", small: true }),
                    host.toggle("reverse", { label: "Reverse", def: false }),
                    host.knob("base", { label: "First key", min: 0, max: 72, step: 1, def: 48, small: true, format: (v) => String(Math.round(v)), title: "The note (pitch number) that plays cue 1 on a pitched channel", onChange: () => refreshPads() }))));
        const side = HTML.div(CarrotUI.section("Pads", padGrid, CarrotUI.hint("Cue 1 plays from the first key, then up the keyboard, and the cues repeat on the other keys. On a drum channel, cue 1 is the bottom row.")), CarrotUI.section("Cues", CarrotUI.row(equalButton, gridButton, chopButton)));
        const main = HTML.div({ class: "cb-chop-main" }, HTML.div(readouts, wave, info, status, controls), side);
        root.appendChild(main);

        function refreshAll() {
            host.refresh();
            refreshInfo();
            refreshPads();
            draw();
            const job = currentProcessed();
            if (job) onProgress(job);
            else progress.firstChild.style.width = "0%";
        }
        host.onRefresh(() => { refreshInfo(); refreshPads(); draw(); });
        host._chopListener = () => { if (root.isConnected) refreshAll(); };
        FLSampleBank.onChange(host._chopListener);
        setTimeout(refreshAll, 30);
        return root;
    }
    function chopToPattern(host, p, entry) {
        if (!entry || entry.status != "ready" || p.cues.length == 0) { host.toast("Load a sample first."); return; }
        const song = host.song;
        const ppb = Config.partsPerBeat;
        const barParts = song.beatsPerBar * ppb;
        const seconds = entry.pcm.length / entry.rate;
        const bpm = p.sync ? song.tempo : (p.bpm || song.tempo);
        // length of the sample in song beats when played at its own tempo (or synced)
        const beats = p.sync ? seconds * (p.bpm || song.tempo) / 60 : seconds * song.tempo / 60;
        const totalParts = Math.min(8 * barParts, Math.round(beats * ppb));
        const bars = Math.max(1, Math.ceil(totalParts / barParts));
        const isNoise = host.song.getChannelIsNoise(host.editor.doc.channel);
        const order = p.cues.map((c, i) => ({ cue: c, index: i })).sort((a, b) => a.cue - b.cue);
        const lists = [];
        for (let b = 0; b < bars; b++) lists.push([]);
        order.forEach((item, k) => {
            const start = Math.round(item.cue * beats * ppb);
            const nextCue = k + 1 < order.length ? order[k + 1].cue : 1;
            const end = Math.min(totalParts, Math.max(start + 1, Math.round(nextCue * beats * ppb)));
            if (start >= totalParts) return;
            const bar = Math.floor(start / barParts);
            const s = start - bar * barParts;
            const e = Math.min(barParts, end - bar * barParts);
            if (bar < bars && e > s) lists[bar].push({ start: s, end: e, pitches: [isNoise ? item.index : p.base + item.index], size: Config.noteSizeMax });
        });
        host.writeNotes(lists, { replace: true, freshPatterns: true });
        flToast("Wrote the cues into " + bars + " bar" + (bars == 1 ? "" : "s") + " starting at the current bar");
    }

    B.CarrotPlugins.register({
        id: "chopshop",
        width: 800,
        preferDrums: false,
        anyChannel: true,
        defaultParams: defaults,
        createVoice,
        render,
        buildEditor,
        onClose: (host) => { if (host && host._chopListener) FLSampleBank._listeners.delete(host._chopListener); FLSampleBank.stopPreview(); },
    });
})();
