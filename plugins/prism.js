/*
 * Prism - a wavetable synth for CarrotBox.
 *
 *  - two morphing wavetable oscillators with 10 warp modes and up to 8-voice unison
 *  - ten built-in tables, a 3D table view, and a User table you can draw or
 *    import from an audio file
 *  - sub oscillator, noise, multimode filter (with comb filters)
 *  - 3 envelopes, 4 LFOs, 2 macros and a 10-slot mod matrix
 *  - an effect rack
 *
 * Instrument plugin: every note creates one voice (see createVoice/render).
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotFX, CarrotDSP, CarrotADSR, CarrotSVF, CarrotDelayLine, CarrotWavetable, CarrotWavetableBank, FLSampleBank, carrotFxRack, carrotSyncOptions, carrotSyncBeats, flToast } = A;

    const BLOCK = 16;
    const MAX_UNISON = 8;
    const HARMONICS = 192;
    const USER_POINTS = 128;
    const USER_MAX_FRAMES = 8;
    const TABLES = ["Basic shapes", "Analog PWM", "Saw stack", "Vowels", "Digital sweep", "FM bell", "Organ drawbars", "Hollow reed", "Glass harmonics", "User table"];
    const WARPS = ["None", "Sync", "Bend +", "Bend -", "Bend +/-", "Mirror", "Asym", "Flip", "Fold", "Quantize", "FM from other osc"];
    const FILTER_TYPES = ["Low pass 12", "Low pass 24", "High pass 12", "Band pass", "Notch", "Peak", "Comb +", "Comb -", "Off"];
    const LFO_SHAPES = ["Sine", "Triangle", "Saw up", "Saw down", "Square", "Sample & hold", "Smooth random"];
    const SOURCES = ["None", "LFO 1", "LFO 2", "LFO 3", "LFO 4", "Env 2", "Env 3", "Velocity", "Key follow", "Macro 1", "Macro 2"];
    const DESTS = ["Osc A position", "Osc B position", "Osc A warp", "Osc B warp", "Osc A level", "Osc B level", "Osc A pitch (24 st)", "Osc B pitch (24 st)", "All pitch (24 st)", "Filter cutoff", "Filter resonance", "Unison detune", "Noise level", "Sub level", "Volume"];
    const OCTAVES = ["-3", "-2", "-1", "0", "+1", "+2", "+3"];
    const UNISONS = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const SUB_WAVES = ["Sine", "Triangle", "Square", "Saw"];
    const MATRIX_SLOTS = 10;

    A.addStyle(`
.cb-prism-oscs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.cb-prism-view { display: block; width: 100%; height: 96px; margin: 3px 0 4px; }
.cb-prism-mtx { display: grid; grid-template-columns: 1fr 1.4fr 1.4fr 36px; gap: 4px 6px; align-items: center; }
.cb-prism-mtx select { width: 100%; }
.cb-prism-mtx input[type=range] { width: 100%; }
.cb-prism-mtx .cb-head { font-size: 10px; color: var(--secondary-text, #aaa); text-transform: uppercase; letter-spacing: 0.08em; }
.cb-prism-mtx .cb-val { font-size: 10px; color: var(--secondary-text, #aaa); text-align: right; }
.cb-prism-draw { display: block; width: 100%; height: 170px; cursor: crosshair; touch-action: none; }
.cb-prism-frames { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; margin: 4px 0; }
.cb-prism-frame { width: 54px; height: 30px; border-radius: 4px; border: 1px solid transparent; background: #0b0d12; cursor: pointer; padding: 0; }
.cb-prism-frame.cb-on { border-color: var(--cb-plugin-color, #4fc3f7); }
.cb-prism-scope { display: block; width: 100%; height: 40px; }
`);

    // ----------------------------------------------------------- tables
    function analyze(wave) {
        const N = wave.length;
        const re = Float64Array.from(wave), im = new Float64Array(N);
        CarrotDSP.fft(re, im, false);
        const amps = new Float64Array(HARMONICS), phases = new Float64Array(HARMONICS);
        for (let h = 1; h <= HARMONICS; h++) {
            const x = h / (HARMONICS + 1);
            const sigma = Math.sin(Math.PI * x) / (Math.PI * x);
            amps[h - 1] = 2 * Math.hypot(re[h], im[h]) / N * sigma;
            phases[h - 1] = Math.atan2(re[h], -im[h]);
        }
        return { amps, phases };
    }
    function timeFrames(count, fn) {
        const frames = [];
        for (let f = 0; f < count; f++) {
            const wave = new Float64Array(2048);
            const t = count == 1 ? 0 : f / (count - 1);
            for (let i = 0; i < 2048; i++) wave[i] = fn(t, i / 2048);
            frames.push(analyze(wave));
        }
        return frames;
    }
    function harmFrames(count, fn) {
        const frames = [];
        for (let f = 0; f < count; f++) {
            const amps = new Float64Array(HARMONICS), phases = new Float64Array(HARMONICS);
            fn(count == 1 ? 0 : f / (count - 1), amps, phases);
            frames.push({ amps, phases });
        }
        return frames;
    }
    const bump = (h, center, width) => Math.exp(-Math.pow((h - center) / width, 2));
    const sineW = (x) => Math.sin(2 * Math.PI * x);
    const triW = (x) => 1 - 4 * Math.abs(x - 0.5);
    const sawW = (x) => 2 * x - 1;
    const squareW = (x) => (x < 0.5 ? 1 : -1);
    const pulseW = (x) => (x < 0.12 ? 1 : -1) + 0.76;
    const SHAPE_FNS = [sineW, triW, sawW, squareW, pulseW];
    const VOWELS = [[6, 11], [4, 17], [3, 21], [4, 7], [3, 7]];
    const tableCache = {};
    function builtinFrames(index) {
        switch (index) {
            case 0: return timeFrames(9, (t, x) => {
                const p = t * 4, i = Math.min(3, Math.floor(p)), u = p - i;
                return SHAPE_FNS[i](x) * (1 - u) + SHAPE_FNS[i + 1](x) * u;
            });
            case 1: return timeFrames(10, (t, x) => {
                const w = 0.5 - 0.46 * t;
                return (x < w ? 1 : -1) - (2 * w - 1);
            });
            case 2: return harmFrames(8, (t, amps, phases) => {
                const cutoff = Math.pow(2, Math.round(t * 7));
                for (let h = 1; h <= HARMONICS; h++) { amps[h - 1] = h <= cutoff ? 1 / h : 0; phases[h - 1] = Math.PI; }
            });
            case 3: return harmFrames(9, (t, amps, phases) => {
                const p = t * 4, i = Math.min(3, Math.floor(p)), u = p - i;
                const f1 = VOWELS[i][0] * (1 - u) + VOWELS[i + 1][0] * u, f2 = VOWELS[i][1] * (1 - u) + VOWELS[i + 1][1] * u;
                for (let h = 1; h <= HARMONICS; h++) amps[h - 1] = Math.pow(h, -0.7) * (0.12 + bump(h, f1, 1.7) + 0.6 * bump(h, f2, 2.8)) * (h < 60 ? 1 : 0.3);
            });
            case 4: return harmFrames(12, (t, amps, phases) => {
                const c = 1 + t * 30;
                for (let h = 1; h <= HARMONICS; h++) { amps[h - 1] = (0.22 / h) + bump(h, c, 1.3) * 0.9; phases[h - 1] = (h * h * 0.5) % (2 * Math.PI); }
            });
            case 5: return timeFrames(12, (t, x) => Math.sin(2 * Math.PI * x + t * 6 * Math.sin(2 * Math.PI * 3 * x)));
            case 6: {
                const regs = [[1, 0, 0, 0, 0, 0], [1, 0.8, 0, 0, 0, 0], [1, 0.6, 0.8, 0.3, 0, 0], [1, 1, 1, 1, 1, 1], [1, 0.5, 0.3, 0.8, 0.4, 0.6], [0.6, 1, 0.2, 0.9, 0.7, 0.9]];
                const hs = [1, 2, 3, 4, 6, 8];
                return regs.map((reg) => {
                    const amps = new Float64Array(HARMONICS), phases = new Float64Array(HARMONICS);
                    hs.forEach((h, i) => { amps[h - 1] = reg[i]; });
                    return { amps, phases };
                });
            }
            case 7: return harmFrames(8, (t, amps, phases) => {
                const even = 1 - t * 0.95, c = 4 + t * 12;
                for (let h = 1; h <= HARMONICS; h++) amps[h - 1] = ((h & 1) ? 1 : even) * Math.pow(h, -0.8) * (0.5 + bump(h, c, 3));
            });
            case 8: return harmFrames(8, (t, amps, phases) => {
                for (let h = 1; h <= HARMONICS; h++) {
                    amps[h - 1] = (h < 48 ? 1 / Math.sqrt(h) : 0) * (0.15 + 0.85 * Math.pow(Math.abs(Math.sin(h * (0.5 + t * 2.5))), 3));
                    phases[h - 1] = (h * h * 0.31) % (2 * Math.PI);
                }
            });
        }
        return timeFrames(1, (t, x) => sineW(x));
    }
    function framesToBank(frames) {
        return new CarrotWavetableBank(frames.map(f => CarrotWavetable.build(f.amps, f.phases, true)));
    }
    // A user frame is USER_POINTS samples of one cycle in -127..127.
    function userFrameToHarmonics(points) {
        const N = points.length;
        const re = new Float64Array(N), im = new Float64Array(N);
        for (let i = 0; i < N; i++) re[i] = points[i] / 127;
        CarrotDSP.fft(re, im, false);
        const amps = new Float64Array(N / 2), phases = new Float64Array(N / 2);
        for (let h = 1; h < N / 2; h++) {
            amps[h - 1] = 2 * Math.hypot(re[h], im[h]) / N;
            phases[h - 1] = Math.atan2(re[h], -im[h]);
        }
        return { amps, phases };
    }
    // The User table is rebuilt only when its frames object or revision changes
    // (the editor bumps user.rev after every edit), never per audio block.
    let userCache = { frames: null, rev: -1, bank: null };
    function userBank(params) {
        if (!params.user || !Array.isArray(params.user.frames) || params.user.frames.length == 0) params.user = { frames: defaultUserFrames() };
        const frames = params.user.frames;
        const rev = params.user.rev | 0;
        if (userCache.frames !== frames || userCache.rev !== rev) {
            userCache = { frames, rev, bank: framesToBank(frames.map(f => userFrameToHarmonics(f))) };
        }
        return userCache.bank;
    }
    function bankFor(params, index) {
        index = Math.max(0, Math.min(TABLES.length - 1, index | 0));
        if (index == TABLES.length - 1) return userBank(params);
        if (!tableCache[index]) tableCache[index] = framesToBank(builtinFrames(index));
        return tableCache[index];
    }
    function defaultUserFrames() {
        const make = (fn) => { const f = []; for (let i = 0; i < USER_POINTS; i++) f.push(Math.round(Math.max(-1, Math.min(1, fn(i / USER_POINTS))) * 127)); return f; };
        return [make(sineW), make(triW), make(sawW), make(squareW)];
    }

    // --------------------------------------------------------------- params
    function oscDefaults(level) {
        return { table: 0, pos: 0, warp: 0, warpAmt: 0, oct: 3, semi: 0, fine: 0, level, uni: 1, detune: 0.2, blend: 0.8, phase: 0, rand: 0.5 };
    }
    function lfoDefaults(shape, rate) {
        return { shape, rate, sync: false, div: 9, fade: 0, key: true };
    }
    function defaults() {
        return {
            a: oscDefaults(0.85),
            b: Object.assign(oscDefaults(0), { table: 1 }),
            sub: { wave: 0, oct: 0, level: 0 },
            noise: { level: 0, color: 0.7 },
            filter: { type: 8, cutoff: 8000, res: 0.15, drive: 0, key: 0.3, mix: 1 },
            env: [{ a: 0.004, d: 0.5, s: 0.8, r: 0.3 }, { a: 0.001, d: 0.4, s: 0, r: 0.3 }, { a: 0.2, d: 0.6, s: 0.5, r: 0.5 }],
            lfo: [lfoDefaults(0, 2), lfoDefaults(1, 0.5), lfoDefaults(2, 1), lfoDefaults(5, 4)],
            macro: [0, 0],
            mtx: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => ({ src: 0, dst: 0, amt: 0 })),
            vel: 0.5,
            level: 0.8,
            width: 0.25,
            fx: [],
            user: { frames: defaultUserFrames() },
        };
    }
    function merge(target, source) {
        for (const key of Object.keys(source)) {
            const s = source[key];
            if (Array.isArray(s)) {
                if (!Array.isArray(target[key])) target[key] = [];
                s.forEach((item, i) => {
                    if (item && typeof item == "object" && !Array.isArray(item)) target[key][i] = merge(target[key][i] && typeof target[key][i] == "object" ? target[key][i] : {}, item);
                    else target[key][i] = item;
                });
            }
            else if (s && typeof s == "object") target[key] = merge(target[key] && typeof target[key] == "object" ? target[key] : {}, s);
            else target[key] = s;
        }
        return target;
    }
    function fill(params) {
        const fillObject = (target, base) => {
            for (const key of Object.keys(base)) {
                const b = base[key];
                if (target[key] === undefined || target[key] === null) target[key] = JSON.parse(JSON.stringify(b));
                else if (key == "user") continue;
                else if (Array.isArray(b)) {
                    if (!Array.isArray(target[key])) target[key] = [];
                    b.forEach((item, i) => {
                        if (item && typeof item == "object") {
                            if (!target[key][i] || typeof target[key][i] != "object") target[key][i] = {};
                            fillObject(target[key][i], item);
                        }
                        else if (target[key][i] === undefined) target[key][i] = item;
                    });
                }
                else if (b && typeof b == "object") {
                    if (typeof target[key] != "object") target[key] = {};
                    fillObject(target[key], b);
                }
            }
        };
        fillObject(params, defaults());
        return params;
    }
    function make(over) {
        return merge(defaults(), over);
    }

    // ----------------------------------------------------------------- DSP
    function warpPhase(mode, p, a) {
        switch (mode) {
            case 1: { const q = p * (1 + a * 7); return q - Math.floor(q); }
            case 2: return Math.pow(p, 1 + a * 3);
            case 3: return 1 - Math.pow(1 - p, 1 + a * 3);
            case 4: return p < 0.5 ? 0.5 * Math.pow(p * 2, 1 + a * 3) : 1 - 0.5 * Math.pow((1 - p) * 2, 1 + a * 3);
            case 5: { const m = p < 0.5 ? p * 2 : 2 - 2 * p; return p + (m - p) * a; }
            case 6: { const w = 0.5 - 0.45 * a; return p < w ? 0.5 * p / w : 0.5 + 0.5 * (p - w) / (1 - w); }
        }
        return p;
    }
    function warpOut(mode, v, p, a) {
        switch (mode) {
            case 7: return p > 1 - a * 0.5 ? -v : v;
            case 8: return a <= 0 ? v : Math.sin(v * (1 + a * 5) * 1.5707963);
            case 9: { const steps = Math.pow(2, 8 - a * 7); return Math.round(v * steps) / steps; }
        }
        return v;
    }
    // Fills out[0..n) with one oscillator (all its unison voices).
    function fillTable(bank, pos, phases, uni, dt0, detuneCents, blend, warp, wamt, out, n, level, fm, tmpWeights) {
        const mipDt = dt0 * (warp == 1 ? 1 + wamt * 7 : (warp >= 2 && warp <= 4) ? 1 + wamt * 3 : warp == 10 ? 3 : (warp == 8 ? 2.5 : 1)) * Math.pow(2, detuneCents / 1200);
        const mip = CarrotWavetable.mipFor(mipDt);
        let norm = 0;
        for (let v = 0; v < uni; v++) {
            const spread = uni == 1 ? 0 : (v / (uni - 1)) * 2 - 1;
            const w = 1 - (1 - blend) * Math.abs(spread) * 0.85;
            tmpWeights[v] = w;
            norm += w * w;
        }
        norm = level / Math.sqrt(Math.max(1e-6, norm));
        for (let v = 0; v < uni; v++) {
            const spread = uni == 1 ? 0 : (v / (uni - 1)) * 2 - 1;
            const dt = Math.min(0.45, dt0 * Math.pow(2, spread * detuneCents / 1200));
            const gain = tmpWeights[v] * norm;
            let ph = phases[v];
            if (warp == 0) {
                for (let i = 0; i < n; i++) {
                    out[i] += bank.read(pos, ph, mip) * gain;
                    ph += dt; if (ph >= 1) ph -= 1;
                }
            }
            else {
                for (let i = 0; i < n; i++) {
                    let p = ph;
                    if (warp == 10) { if (fm) { p += fm[i] * wamt * 0.4; p -= Math.floor(p); } }
                    else p = warpPhase(warp, p, wamt);
                    let value = bank.read(pos, p, mip);
                    if (warp >= 7 && warp <= 9) value = warpOut(warp, value, ph, wamt);
                    out[i] += value * gain;
                    ph += dt; if (ph >= 1) ph -= 1;
                }
            }
            phases[v] = ph;
        }
    }
    function lfoValue(shape, phase, hold, smooth, index) {
        switch (shape) {
            case 0: return Math.sin(phase * 6.283185307179586);
            case 1: return 1 - 4 * Math.abs(phase - 0.5);
            case 2: return 2 * phase - 1;
            case 3: return 1 - 2 * phase;
            case 4: return phase < 0.5 ? 1 : -1;
            case 5: return hold[index];
            default: { const t = phase * phase * (3 - 2 * phase); return smooth[index * 2] + (smooth[index * 2 + 1] - smooth[index * 2]) * t; }
        }
    }
    function softClip(x) {
        if (x > 3) return 1;
        if (x < -3) return -1;
        return x * (27 + x * x) / (27 + 9 * x * x);
    }
    function createVoice(params, info) {
        fill(params);
        const sr = info.sampleRate;
        const voice = {
            sr, done: false, released: false, age: 0,
            pa: new Float64Array(MAX_UNISON), pb: new Float64Array(MAX_UNISON),
            subPhase: 0, noiseLP: 0,
            env: [new CarrotADSR(), new CarrotADSR(), new CarrotADSR()],
            f: [new CarrotSVF(), new CarrotSVF()],
            lfoPhase: [0, 0, 0, 0], hold: [0, 0, 0, 0].map(() => Math.random() * 2 - 1), smooth: new Float64Array(8),
            bufA: new Float32Array(BLOCK), bufB: new Float32Array(BLOCK), bus: new Float32Array(BLOCK), weights: new Float64Array(MAX_UNISON),
            comb: new Float32Array(Math.ceil(sr / 18) + 8), combPos: 0,
        };
        for (let i = 0; i < 8; i++) voice.smooth[i] = Math.random() * 2 - 1;
        const p = params;
        for (const [k, osc] of [["pa", p.a], ["pb", p.b]]) {
            for (let v = 0; v < MAX_UNISON; v++) voice[k][v] = (osc.phase + (v == 0 ? 0 : Math.random() * osc.rand)) % 1;
        }
        for (let i = 0; i < 3; i++) { voice.env[i].set(p.env[i].a, p.env[i].d, p.env[i].s, p.env[i].r, sr); voice.env[i].trigger(); }
        for (let i = 0; i < 4; i++) if (!p.lfo[i].key) voice.lfoPhase[i] = Math.random();
        return voice;
    }
    function render(voice, out, start, len, info) {
        const p = fill(info.params);
        const sr = info.sampleRate;
        if (!info.gate && !voice.released) {
            voice.released = true;
            for (const e of voice.env) e.release();
        }
        for (let i = 0; i < 3; i++) voice.env[i].set(p.env[i].a, p.env[i].d, p.env[i].s, p.env[i].r, sr);
        const bpm = info.bpm || 120;
        const freqStep = Math.pow(info.freqScale || 1, BLOCK);
        let baseFreq = info.freq;
        const midi = info.midi;
        const velocity = info.velocity == undefined ? 1 : info.velocity;
        const velAmp = 1 - p.vel + p.vel * velocity;
        const masterLevel = p.level * 0.9;
        const bankA = bankFor(p, p.a.table | 0), bankB = bankFor(p, p.b.table | 0);
        const srcValue = new Float64Array(SOURCES.length);
        const dest = new Float64Array(DESTS.length);
        srcValue[7] = velocity;
        srcValue[8] = Math.max(-1, Math.min(1, (midi - 60) / 36));
        srcValue[9] = p.macro[0] || 0;
        srcValue[10] = p.macro[1] || 0;
        const bufA = voice.bufA, bufB = voice.bufB, bus = voice.bus;
        const filter = p.filter;
        const ftype = filter.type | 0;
        let index = start;
        const end = start + len;
        while (index < end) {
            const n = Math.min(BLOCK, end - index);
            voice.age += n;
            for (let i = 0; i < 4; i++) {
                const l = p.lfo[i];
                const hz = l.sync ? (bpm / 60) / carrotSyncBeats(l.div | 0) : l.rate;
                voice.lfoPhase[i] += hz * n / sr;
                if (voice.lfoPhase[i] >= 1) {
                    voice.lfoPhase[i] -= Math.floor(voice.lfoPhase[i]);
                    voice.hold[i] = Math.random() * 2 - 1;
                    voice.smooth[i * 2] = voice.smooth[i * 2 + 1];
                    voice.smooth[i * 2 + 1] = Math.random() * 2 - 1;
                }
                let v = lfoValue(l.shape | 0, voice.lfoPhase[i], voice.hold, voice.smooth, i);
                if (l.fade > 0) v *= Math.min(1, (voice.age / sr) / l.fade);
                srcValue[1 + i] = v;
            }
            let env2 = 0, env3 = 0;
            for (let i = 0; i < n; i++) { env2 = voice.env[1].next(); env3 = voice.env[2].next(); }
            srcValue[5] = env2;
            srcValue[6] = env3;
            dest.fill(0);
            for (let i = 0; i < MATRIX_SLOTS; i++) {
                const m = p.mtx[i];
                if (!m || !m.amt || !m.src) continue;
                dest[m.dst | 0] += srcValue[m.src | 0] * m.amt;
            }
            bus.fill(0, 0, n);
            const allPitch = dest[8] * 24;
            const detuneMod = dest[11];
            // ---- oscillator A
            bufA.fill(0, 0, n);
            const la = Math.max(0, Math.min(1.5, p.a.level + dest[4]));
            if (la > 0.0005) {
                const semis = ((p.a.oct | 0) - 3) * 12 + p.a.semi + p.a.fine / 100 + dest[6] * 24 + allPitch;
                const hz = baseFreq * Math.pow(2, semis / 12);
                fillTable(bankA, Math.max(0, Math.min(1, p.a.pos + dest[0])), voice.pa, Math.max(1, Math.min(MAX_UNISON, p.a.uni | 0 || 1)), Math.min(0.45, hz / sr), Math.max(0, Math.min(1, p.a.detune + detuneMod)) * 70, p.a.blend, p.a.warp | 0, Math.max(0, Math.min(1, p.a.warpAmt + dest[2])), bufA, n, la, p.a.warp == 10 ? bufB : null, voice.weights);
            }
            // ---- oscillator B
            bufB.fill(0, 0, n);
            const lb = Math.max(0, Math.min(1.5, p.b.level + dest[5]));
            if (lb > 0.0005) {
                const semis = ((p.b.oct | 0) - 3) * 12 + p.b.semi + p.b.fine / 100 + dest[7] * 24 + allPitch;
                const hz = baseFreq * Math.pow(2, semis / 12);
                fillTable(bankB, Math.max(0, Math.min(1, p.b.pos + dest[1])), voice.pb, Math.max(1, Math.min(MAX_UNISON, p.b.uni | 0 || 1)), Math.min(0.45, hz / sr), Math.max(0, Math.min(1, p.b.detune + detuneMod)) * 70, p.b.blend, p.b.warp | 0, Math.max(0, Math.min(1, p.b.warpAmt + dest[3])), bufB, n, lb, p.b.warp == 10 ? bufA : null, voice.weights);
            }
            for (let i = 0; i < n; i++) bus[i] = bufA[i] + bufB[i];
            // ---- sub & noise
            const subLevel = Math.max(0, p.sub.level + dest[13]);
            if (subLevel > 0.0005) {
                const hz = baseFreq * Math.pow(2, (allPitch - 12 * ((p.sub.oct | 0) + 1)) / 12);
                const dt = Math.min(0.45, hz / sr);
                const w = p.sub.wave | 0;
                let ph = voice.subPhase;
                for (let i = 0; i < n; i++) {
                    let v;
                    if (w == 0) v = Math.sin(ph * 6.283185307179586);
                    else if (w == 1) v = 1 - 4 * Math.abs(ph - 0.5);
                    else if (w == 2) v = ph < 0.5 ? 0.7 : -0.7;
                    else v = (2 * ph - 1) * 0.7;
                    bus[i] += v * subLevel * 0.8;
                    ph += dt; if (ph >= 1) ph -= 1;
                }
                voice.subPhase = ph;
            }
            const noiseLevel = Math.max(0, p.noise.level + dest[12]);
            if (noiseLevel > 0.0005) {
                const coef = 0.04 + 0.96 * p.noise.color * p.noise.color;
                let lp = voice.noiseLP;
                for (let i = 0; i < n; i++) {
                    lp += ((Math.random() * 2 - 1) - lp) * coef;
                    bus[i] += lp * noiseLevel * 0.8 * (coef < 0.3 ? 2.2 : 1);
                }
                voice.noiseLP = lp;
            }
            // ---- filter
            if (ftype != 8) {
                const octaves = dest[9] * 5 + filter.key * (midi - 60) / 12;
                const cutoff = Math.max(20, Math.min(sr * 0.45, filter.cutoff * Math.pow(2, octaves)));
                const res = Math.max(0, Math.min(1, filter.res + dest[10] * 0.5));
                voice.f[0].set(cutoff, res, sr);
                voice.f[1].set(cutoff, res, sr);
                const drive = 1 + filter.drive * 8;
                const mix = filter.mix;
                if (ftype >= 6) {
                    const delay = Math.max(2, Math.min(voice.comb.length - 4, sr / cutoff));
                    const fb = (ftype == 6 ? 1 : -1) * (0.5 + res * 0.47);
                    const buf = voice.comb;
                    for (let i = 0; i < n; i++) {
                        let x = filter.drive > 0 ? softClip(bus[i] * drive) : bus[i];
                        let rp = voice.combPos - delay; if (rp < 0) rp += buf.length;
                        const i0 = Math.floor(rp), fr = rp - i0;
                        const y0 = buf[i0 % buf.length], y1 = buf[(i0 + 1) % buf.length];
                        const delayed = y0 + (y1 - y0) * fr;
                        const y = x + fb * delayed;
                        buf[voice.combPos] = y;
                        voice.combPos = (voice.combPos + 1) % buf.length;
                        bus[i] = bus[i] + (y * 0.55 - bus[i]) * mix;
                    }
                }
                else {
                    for (let i = 0; i < n; i++) {
                        const x = filter.drive > 0 ? softClip(bus[i] * drive) : bus[i];
                        let y;
                        switch (ftype) {
                            case 0: y = voice.f[0].process(x, 0); break;
                            case 1: y = voice.f[1].process(voice.f[0].process(x, 0), 0); break;
                            case 2: y = voice.f[0].process(x, 1); break;
                            case 3: y = voice.f[0].process(x, 2); break;
                            case 4: y = voice.f[0].process(x, 3); break;
                            default: y = voice.f[0].process(x, 4);
                        }
                        bus[i] = bus[i] + (y - bus[i]) * mix;
                    }
                }
            }
            // ---- amp
            const volMod = Math.max(0, 1 + dest[14]);
            for (let i = 0; i < n; i++) {
                const env = voice.env[0].next();
                out[index + i] += bus[i] * env * velAmp * masterLevel * volMod;
            }
            if (voice.released && voice.env[0].done) voice.done = true;
            index += n;
            baseFreq *= freqStep;
        }
        if (!(Math.abs(voice.noiseLP) < 1e6)) voice.noiseLP = 0;
        if (voice.env[0].done && voice.released) voice.done = true;
    }

    // --------------------------------------------------- instrument effects
    function createInstrumentState(sampleRate) {
        return { fxStates: [], dl: new CarrotDelayLine(Math.ceil(sampleRate * 0.04)), dr: new CarrotDelayLine(Math.ceil(sampleRate * 0.04)), phase: 0 };
    }
    function processInstrument(state, params, L, R, start, end, ctx) {
        const p = fill(params);
        if (p.fx.length > 0) CarrotFX.processChain(state.fxStates, p.fx, L, R, start, end, ctx);
        const w = p.width;
        if (w > 0.001) {
            const sr = ctx.sampleRate;
            const inc = 0.3 / sr;
            let phase = state.phase;
            for (let i = start; i < end; i++) {
                const m = (L[i] + R[i]) * 0.5;
                state.dl.write(m);
                state.dr.write(m);
                const lfo = Math.sin(phase * 6.283185307179586);
                const wl = state.dl.read(sr * (0.0069 + 0.001 * lfo));
                const wr = state.dr.read(sr * (0.0117 - 0.0012 * lfo));
                L[i] = L[i] * (1 - w * 0.45) + wl * w * 0.55 - wr * w * 0.1;
                R[i] = R[i] * (1 - w * 0.45) + wr * w * 0.55 - wl * w * 0.1;
                phase += inc; if (phase >= 1) phase -= 1;
            }
            state.phase = phase;
        }
    }

    // --------------------------------------------------------------- presets
    const reverb = (mix) => Object.assign(CarrotFX.defaults("reverb"), { mix: mix || 0.25 });
    const delay = (mix) => Object.assign(CarrotFX.defaults("delay"), { mix: mix || 0.25 });
    const chorus = () => CarrotFX.defaults("chorus");
    const PRESETS = [
        { group: "Leads", name: "Morph Lead", params: make({ a: { table: 0, pos: 0.55, uni: 3, detune: 0.18 }, filter: { type: 1, cutoff: 6000, res: 0.2 }, lfo: [{ shape: 0, rate: 0.4 }], mtx: [{ src: 1, dst: 0, amt: 0.3 }], fx: [delay(0.2), reverb(0.2)] }) },
        { group: "Leads", name: "Sync Scream", params: make({ a: { table: 2, pos: 0.7, warp: 1, warpAmt: 0.4, uni: 3, detune: 0.2 }, filter: { type: 1, cutoff: 7000, res: 0.15 }, env: [{ a: 0.003, d: 0.4, s: 0.9, r: 0.2 }, { a: 0.001, d: 0.8, s: 0.2, r: 0.3 }], mtx: [{ src: 5, dst: 2, amt: 0.6 }], width: 0.4 }) },
        { group: "Leads", name: "PWM Square", params: make({ a: { table: 1, pos: 0.2, uni: 2, detune: 0.12 }, b: { table: 1, pos: 0.5, level: 0.6, oct: 4, uni: 2 }, lfo: [{ shape: 1, rate: 0.9 }], mtx: [{ src: 1, dst: 0, amt: 0.35 }, { src: 1, dst: 1, amt: -0.35 }], width: 0.5, fx: [chorus()] }) },
        { group: "Bass", name: "Wavetable Sub", params: make({ a: { table: 0, pos: 0, oct: 2, level: 0.9 }, sub: { level: 0.4 }, filter: { type: 0, cutoff: 1400 }, env: [{ a: 0.003, d: 0.3, s: 0.95, r: 0.1 }], width: 0 }) },
        { group: "Bass", name: "Growl Bass", params: make({ a: { table: 3, pos: 0.15, oct: 2, uni: 2, detune: 0.1 }, b: { table: 2, pos: 0.4, oct: 2, level: 0.5, warp: 8, warpAmt: 0.4 }, filter: { type: 1, cutoff: 1500, res: 0.35, drive: 0.35 }, lfo: [{ shape: 1, rate: 2, sync: true, div: 7 }], mtx: [{ src: 1, dst: 0, amt: 0.9 }, { src: 1, dst: 9, amt: 0.3 }], width: 0.2 }) },
        { group: "Bass", name: "Digital Reese", params: make({ a: { table: 4, pos: 0.3, oct: 2, uni: 3, detune: 0.2 }, b: { table: 0, pos: 0.5, oct: 2, level: 0.8, uni: 3, detune: 0.2, fine: 11 }, filter: { type: 1, cutoff: 1800, res: 0.2 }, sub: { level: 0.3 }, width: 0.3 }) },
        { group: "Pads", name: "Vowel Pad", params: make({ a: { table: 3, pos: 0, uni: 5, detune: 0.2 }, b: { table: 7, pos: 0.3, level: 0.4, oct: 4, uni: 3 }, filter: { type: 0, cutoff: 5000 }, env: [{ a: 0.8, d: 1.2, s: 0.85, r: 1.5 }], lfo: [{ shape: 0, rate: 0.12 }], mtx: [{ src: 1, dst: 0, amt: 0.5 }], width: 0.85, fx: [chorus(), reverb(0.35)] }) },
        { group: "Pads", name: "Glass Choir", params: make({ a: { table: 8, pos: 0.4, uni: 4, detune: 0.22 }, b: { table: 6, pos: 0.2, level: 0.3, oct: 4 }, filter: { type: 0, cutoff: 6500 }, env: [{ a: 1, d: 1.2, s: 0.85, r: 2 }], lfo: [{ shape: 6, rate: 0.3 }], mtx: [{ src: 1, dst: 0, amt: 0.35 }, { src: 1, dst: 1, amt: 0.25 }], width: 0.9, fx: [reverb(0.4)] }) },
        { group: "Pads", name: "Evolving Sweep", params: make({ a: { table: 4, pos: 0, uni: 4, detune: 0.25 }, filter: { type: 1, cutoff: 3000, res: 0.2 }, env: [{ a: 0.9, d: 1.5, s: 0.85, r: 1.8 }, { a: 2.5, d: 1, s: 1, r: 1 }], mtx: [{ src: 5, dst: 0, amt: 1 }], width: 0.8, fx: [reverb(0.35)] }) },
        { group: "Keys", name: "Bell Keys", params: make({ a: { table: 5, pos: 0.7 }, b: { table: 0, pos: 0, level: 0.3, oct: 5 }, filter: { type: 0, cutoff: 9000 }, env: [{ a: 0.001, d: 1.6, s: 0, r: 0.5 }, { a: 0.001, d: 0.6, s: 0, r: 0.3 }], mtx: [{ src: 5, dst: 0, amt: -0.6 }], vel: 0.8, width: 0.4, fx: [reverb(0.25)] }) },
        { group: "Keys", name: "Drawbar Organ", params: make({ a: { table: 6, pos: 0.65 }, filter: { type: 8 }, env: [{ a: 0.004, d: 0.1, s: 1, r: 0.08 }], vel: 0.1, width: 0.3 }) },
        { group: "Plucks", name: "Digital Pluck", params: make({ a: { table: 4, pos: 0.5, uni: 2, detune: 0.1 }, filter: { type: 1, cutoff: 1500, res: 0.25 }, env: [{ a: 0.001, d: 0.45, s: 0, r: 0.2 }, { a: 0.001, d: 0.25, s: 0, r: 0.1 }], mtx: [{ src: 5, dst: 0, amt: -0.4 }, { src: 5, dst: 9, amt: 0.6 }], width: 0.45, fx: [delay(0.25)] }) },
        { group: "Plucks", name: "FM Marimba", params: make({ a: { table: 5, pos: 0.35 }, filter: { type: 8 }, env: [{ a: 0.001, d: 0.7, s: 0, r: 0.2 }, { a: 0.001, d: 0.25, s: 0, r: 0.1 }], mtx: [{ src: 5, dst: 0, amt: -0.3 }], vel: 0.7, width: 0.3 }) },
        { group: "FX", name: "Fold Texture", params: make({ a: { table: 8, pos: 0.5, warp: 8, warpAmt: 0.6, uni: 4, detune: 0.4 }, b: { table: 4, pos: 0.7, level: 0.5, warp: 10, warpAmt: 0.5 }, filter: { type: 6, cutoff: 600, res: 0.5 }, lfo: [{ shape: 6, rate: 1.5 }], mtx: [{ src: 1, dst: 2, amt: 0.4 }, { src: 1, dst: 9, amt: 0.4 }], width: 0.9, fx: [delay(0.3), reverb(0.3)] }) },
        { group: "FX", name: "Riser", params: make({ a: { table: 2, pos: 0.3, uni: 8, detune: 0.9 }, noise: { level: 0.3, color: 0.8 }, filter: { type: 1, cutoff: 300, res: 0.4 }, env: [{ a: 1.4, d: 1, s: 1, r: 1 }, { a: 3.5, d: 0.5, s: 1, r: 0.5 }], mtx: [{ src: 5, dst: 9, amt: 0.9 }, { src: 5, dst: 8, amt: 0.25 }], width: 0.9 }) },
    ];

    function randomize(old) {
        const r = Math.random, pick = (arr) => arr[Math.floor(r() * arr.length)];
        const p = defaults();
        p.a = Object.assign(oscDefaults(0.7 + r() * 0.3), { table: Math.floor(r() * 9), pos: r(), warp: pick([0, 0, 0, 1, 2, 3, 4, 5, 6, 8]), warpAmt: r() * 0.7, oct: 2 + Math.floor(r() * 2), uni: 1 + Math.floor(r() * 5), detune: 0.1 + r() * 0.4 });
        p.b = Object.assign(oscDefaults(r() < 0.6 ? 0.2 + r() * 0.5 : 0), { table: Math.floor(r() * 9), pos: r(), warp: pick([0, 0, 1, 8, 10]), warpAmt: r() * 0.6, oct: 2 + Math.floor(r() * 3), fine: Math.round((r() - 0.5) * 24), uni: 1 + Math.floor(r() * 3) });
        p.sub.level = r() < 0.4 ? 0.2 + r() * 0.4 : 0;
        p.filter = { type: pick([0, 1, 1, 2, 3, 6, 8]), cutoff: CarrotDSP.expMap(r(), 300, 12000), res: r() * 0.5, drive: r() < 0.3 ? r() * 0.5 : 0, key: r() * 0.7, mix: 1 };
        const pad = r() < 0.4;
        p.env[0] = { a: pad ? 0.2 + r() * 1.2 : 0.002 + r() * 0.03, d: 0.1 + r() * 1.5, s: pad ? 0.6 + r() * 0.4 : r(), r: 0.1 + r() * (pad ? 2 : 0.8) };
        p.env[1] = { a: 0.001 + r() * 0.3, d: 0.2 + r() * 1.5, s: r() * 0.5, r: 0.2 + r() };
        p.lfo[0] = lfoDefaults(pick([0, 1, 6, 5]), CarrotDSP.expMap(r(), 0.1, 10));
        p.mtx[0] = { src: 1, dst: pick([0, 0, 2, 9]), amt: (r() - 0.3) * 0.8 };
        p.mtx[1] = { src: 5, dst: pick([0, 9, 2]), amt: (r() - 0.3) * 0.8 };
        p.width = 0.2 + r() * 0.7;
        p.user = old && old.user ? old.user : { frames: defaultUserFrames() };
        return p;
    }

    // ------------------------------------------------------------- editor
    function bankPreview(params, which) {
        const o = params[which];
        return { bank: bankFor(params, o.table | 0), pos: o.pos };
    }
    // 3D stack of wavetable frames with the current position highlighted.
    function drawTable3D(canvas, bank, pos, color) {
        const { ctx, w, h } = CarrotUI.ctx(canvas);
        ctx.fillStyle = "#0b0d12";
        ctx.fillRect(0, 0, w, h);
        const frames = bank.frames;
        const n = frames.length;
        const points = 96;
        const slant = 26, rise = Math.min(46, h * 0.5);
        const width = w - slant - 8, ampH = Math.min(26, h * 0.26);
        const current = n == 1 ? 0 : pos * (n - 1);
        const drawFrame = (i, stroke, alpha, lineWidth) => {
            const t = n == 1 ? 0 : i / (n - 1);
            const x0 = 4 + (1 - t) * slant, y0 = h - 10 - t * 0 - (1 - t) * rise;
            ctx.beginPath();
            const mips = frames[Math.min(n - 1, Math.max(0, Math.round(i)))];
            for (let k = 0; k <= points; k++) {
                const v = CarrotWavetable.read(mips, 3, (k / points) * 0.9999);
                const x = x0 + (k / points) * width, y = y0 - ampH * 0.5 - v * ampH * 0.5;
                if (k == 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            ctx.globalAlpha = 1;
        };
        for (let i = 0; i < n; i++) drawFrame(i, "#8aa0b8", 0.4, 1);
        drawFrame(current, color, 1, 2);
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.font = "10px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(n + " frame" + (n == 1 ? "" : "s"), 6, 4);
    }
    function drawScope(canvas, l) {
        const { ctx, w, h } = CarrotUI.ctx(canvas);
        ctx.fillStyle = "#0b0d12";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--cb-plugin-color").trim() || "#4fc3f7";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const rnd = CarrotDSP.rng(11);
        let a = rnd() * 2 - 1, b = rnd() * 2 - 1;
        const shape = l.shape | 0;
        const steps = 6;
        for (let x = 0; x <= w; x++) {
            const t = x / w;
            const seg = Math.floor(t * steps), local = t * steps - seg;
            if (x > 0 && Math.floor(((x - 1) / w) * steps) != seg) { a = b; b = rnd() * 2 - 1; }
            let v;
            if (shape == 5) v = a;
            else if (shape == 6) { const s = local * local * (3 - 2 * local); v = a + (b - a) * s; }
            else v = CarrotDSP.lfo(shape, t);
            const y = h / 2 - v * (h / 2 - 5);
            if (x == 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    function buildEditor(host) {
        fill(host.params());
        const root = HTML.div();
        const redraws = [];
        const getP = () => host.params();
        const percent = (v) => Math.round(v * 100) + "%";
        const pct = { min: 0, max: 1, small: true, format: percent };
        const unisonSelect = (path) => {
            const el = CarrotUI.select({ label: "Unison", options: UNISONS, value: Math.max(0, (host.get(path, 1) | 0) - 1), title: "Stacked, detuned voices per note", onChange: (i) => host.set(path, i + 1) });
            el.setValue = (v) => { el.menu.selectedIndex = Math.max(0, Math.min(MAX_UNISON - 1, (v | 0) - 1)); };
            return host._bind(el, path, 1);
        };
        const oscPanel = (which, title) => {
            const base = which + ".";
            const view = HTML.canvas({ class: "cb-canvas cb-prism-view", title: "Wavetable (the bright line is the current position)" });
            const draw = () => { const pv = bankPreview(getP(), which); drawTable3D(view, pv.bank, pv.pos, getComputedStyle(view).getPropertyValue("--cb-plugin-color").trim() || "#4fc3f7"); };
            redraws.push(draw);
            // dragging on the view scrubs the position
            let scrubbing = false;
            const scrub = (event) => {
                const rect = view.getBoundingClientRect();
                host.set(base + "pos", Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)));
                host.refresh();
                draw();
            };
            view.addEventListener("pointerdown", (event) => { scrubbing = true; view.setPointerCapture(event.pointerId); scrub(event); });
            view.addEventListener("pointermove", (event) => { if (scrubbing) scrub(event); });
            view.addEventListener("pointerup", () => { scrubbing = false; });
            view.addEventListener("pointercancel", () => { scrubbing = false; });
            return CarrotUI.section(title,
                CarrotUI.row(
                    host.select(base + "table", { label: "Wavetable", options: TABLES, def: which == "a" ? 0 : 1, onChange: draw }),
                    host.select(base + "warp", { label: "Warp", options: WARPS, def: 0 })),
                view,
                CarrotUI.row(
                    host.knob(base + "pos", Object.assign({ label: "Position", def: 0, onInput: draw }, pct)),
                    host.knob(base + "warpAmt", Object.assign({ label: "Warp amt", def: 0 }, pct)),
                    host.knob(base + "level", Object.assign({ label: "Level", def: which == "a" ? 0.85 : 0, max: 1 }, pct)),
                    host.select(base + "oct", { label: "Octave", options: OCTAVES, def: 3 }),
                    host.knob(base + "semi", { label: "Semi", min: -12, max: 12, step: 1, def: 0, small: true }),
                    host.knob(base + "fine", { label: "Fine", min: -100, max: 100, step: 1, def: 0, unit: "c", small: true })),
                CarrotUI.row(
                    unisonSelect(base + "uni"),
                    host.knob(base + "detune", Object.assign({ label: "Detune", def: 0.2 }, pct)),
                    host.knob(base + "blend", Object.assign({ label: "Blend", def: 0.8, title: "Loudness of the outer unison voices" }, pct)),
                    host.knob(base + "phase", Object.assign({ label: "Phase", def: 0 }, pct)),
                    host.knob(base + "rand", Object.assign({ label: "Rand", def: 0.5, title: "Random start phase for unison voices" }, pct))));
        };
        const sound = HTML.div(
            HTML.div({ class: "cb-prism-oscs" }, oscPanel("a", "Oscillator A"), oscPanel("b", "Oscillator B")),
            CarrotUI.cols(2,
                CarrotUI.section("Sub & noise", CarrotUI.row(
                    host.select("sub.wave", { label: "Sub wave", options: SUB_WAVES, def: 0 }),
                    host.select("sub.oct", { label: "Octave", options: ["-1 oct", "-2 oct"], def: 0 }),
                    host.knob("sub.level", Object.assign({ label: "Sub", def: 0 }, pct)),
                    host.knob("noise.level", Object.assign({ label: "Noise", def: 0 }, pct)),
                    host.knob("noise.color", Object.assign({ label: "Color", def: 0.7 }, pct)))),
                CarrotUI.section("Output", CarrotUI.row(
                    host.knob("level", { label: "Volume", min: 0, max: 1.5, def: 0.8, small: true, format: percent }),
                    host.knob("vel", Object.assign({ label: "Velocity", def: 0.5 }, pct)),
                    host.knob("width", Object.assign({ label: "Width", def: 0.25, title: "Stereo spread" }, pct)),
                    host.knob("macro.0", Object.assign({ label: "Macro 1", def: 0, title: "A knob you can route anywhere in the Modulation tab" }, pct)),
                    host.knob("macro.1", Object.assign({ label: "Macro 2", def: 0 }, pct))))),
            CarrotUI.section("Filter", CarrotUI.row(
                host.select("filter.type", { label: "Type", options: FILTER_TYPES, def: 8 }),
                host.knob("filter.cutoff", { label: "Cutoff", min: 20, max: 20000, curve: "exp", unit: "Hz", def: 8000, small: true }),
                host.knob("filter.res", Object.assign({ label: "Resonance", def: 0.15 }, pct)),
                host.knob("filter.drive", Object.assign({ label: "Drive", def: 0 }, pct)),
                host.knob("filter.key", Object.assign({ label: "Key track", def: 0.3 }, pct)),
                host.knob("filter.mix", Object.assign({ label: "Mix", def: 1 }, pct)))));

        // ---- modulation tab
        const envPanel = (i, title) => CarrotUI.section(title, host.envelope("env." + i, { value: { a: 0.01, d: 0.4, s: 0.7, r: 0.3 }, label: title }));
        const lfoPanel = (i) => {
            const base = "lfo." + i + ".";
            const scope = HTML.canvas({ class: "cb-canvas cb-prism-scope" });
            const draw = () => drawScope(scope, getP().lfo[i]);
            redraws.push(draw);
            const rate = host.knob(base + "rate", { label: "Rate", min: 0.02, max: 30, curve: "exp", unit: "Hz", def: 1, small: true });
            const div = host.select(base + "div", { label: "Sync rate", options: carrotSyncOptions(), def: 9 });
            const update = () => { const s = !!getP().lfo[i].sync; rate.style.display = s ? "none" : ""; div.style.display = s ? "" : "none"; };
            const syncToggle = host.toggle(base + "sync", { label: "Tempo sync", def: false, onChange: update });
            host.onRefresh(update);
            update();
            return CarrotUI.section("LFO " + (i + 1), scope, CarrotUI.row(
                host.select(base + "shape", { label: "Shape", options: LFO_SHAPES, def: 0, onChange: draw }),
                rate, div, syncToggle,
                host.knob(base + "fade", { label: "Fade in", min: 0, max: 4, def: 0, unit: "s", small: true }),
                host.toggle(base + "key", { label: "Key sync", def: true })));
        };
        const matrix = HTML.div({ class: "cb-prism-mtx" });
        for (const label of ["Source", "Destination", "Amount", ""]) matrix.appendChild(HTML.div({ class: "cb-head" }, label));
        for (let i = 0; i < MATRIX_SLOTS; i++) {
            const base = "mtx." + i + ".";
            const src = host.select(base + "src", { options: SOURCES, def: 0 });
            const dst = host.select(base + "dst", { options: DESTS, def: 0 });
            const amount = HTML.input({ type: "range", min: "-100", max: "100", step: "1", title: "Amount (double-click to zero)" });
            const readout = HTML.div({ class: "cb-val" }, "0");
            amount.addEventListener("keydown", e => e.stopPropagation());
            amount.addEventListener("input", () => { host.set(base + "amt", (+amount.value) / 100); readout.textContent = amount.value; });
            amount.addEventListener("dblclick", () => { amount.value = "0"; host.set(base + "amt", 0); readout.textContent = "0"; });
            amount.setValue = (v) => { amount.value = String(Math.round((v || 0) * 100)); readout.textContent = amount.value; };
            host._bind(amount, base + "amt", 0);
            matrix.append(src.menu || src, dst.menu || dst, amount, readout);
        }
        const mod = HTML.div(
            CarrotUI.cols(3, envPanel(0, "Env 1 (amp)"), envPanel(1, "Env 2"), envPanel(2, "Env 3")),
            CarrotUI.cols(2, lfoPanel(0), lfoPanel(1)),
            CarrotUI.cols(2, lfoPanel(2), lfoPanel(3)),
            CarrotUI.section("Modulation matrix", matrix, CarrotUI.hint("Pitch destinations move +/-24 semitones at full amount; cutoff +/-5 octaves. Env 1 always controls the volume.")));

        // ---- wavetable editor tab
        const table = buildTableEditor(host, redraws);

        // ---- FX tab
        const fxTab = HTML.div(CarrotUI.section("Instrument effects", carrotFxRack(host, "fx", { max: 6 })));

        const tabs = CarrotUI.tabs([["Sound", sound], ["Modulation", mod], ["Wavetable editor", table], ["Effects", fxTab]], () => setTimeout(() => redraws.forEach(f => f()), 0));
        host.onRefresh(() => redraws.forEach(f => f()));
        root.appendChild(tabs);
        setTimeout(() => redraws.forEach(f => f()), 30);
        return root;
    }

    // Draw / import editor for the User table.
    function buildTableEditor(host, redraws) {
        let current = 0;
        const getFrames = () => {
            const p = host.params();
            if (!p.user || !Array.isArray(p.user.frames) || p.user.frames.length == 0) p.user = { frames: defaultUserFrames() };
            return p.user.frames;
        };
        const canvas = HTML.canvas({ class: "cb-canvas cb-prism-draw", title: "Draw the waveform of this frame" });
        const strip = HTML.div({ class: "cb-prism-frames" });
        const status = CarrotUI.hint("Choose \"User table\" as the wavetable of Oscillator A or B to hear what you draw. The frames morph into each other as the position knob moves.");
        const commit = () => { const p = host.params(); p.user.rev = (p.user.rev | 0) + 1; host.changed(); redraws.forEach(f => f()); };
        const drawFrame = (target, points, color) => {
            const { ctx, w, h } = CarrotUI.ctx(target);
            ctx.fillStyle = "#0b0d12";
            ctx.fillRect(0, 0, w, h);
            if (target == canvas) {
                ctx.strokeStyle = "rgba(255,255,255,0.08)";
                for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, h * i / 4 + 0.5); ctx.lineTo(w, h * i / 4 + 0.5); ctx.stroke(); }
                for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(w * i / 8 + 0.5, 0); ctx.lineTo(w * i / 8 + 0.5, h); ctx.stroke(); }
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = target == canvas ? 2 : 1.2;
            ctx.beginPath();
            const n = points.length;
            for (let i = 0; i <= n; i++) {
                const v = points[i % n] / 127;
                const x = i / n * w, y = h / 2 - v * (h / 2 - 3);
                if (i == 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        };
        const render = () => {
            const frames = getFrames();
            current = Math.max(0, Math.min(frames.length - 1, current));
            drawFrame(canvas, frames[current], getComputedStyle(canvas).getPropertyValue("--cb-plugin-color").trim() || "#4fc3f7");
            strip.innerHTML = "";
            frames.forEach((f, i) => {
                const thumb = HTML.canvas({ class: "cb-prism-frame" + (i == current ? " cb-on" : ""), title: "Frame " + (i + 1) });
                thumb.style.width = "54px";
                thumb.style.height = "30px";
                thumb.addEventListener("click", () => { current = i; render(); });
                strip.appendChild(thumb);
                drawFrame(thumb, f, "#8aa0b8");
            });
        };
        redraws.push(render);
        let last = -1;
        const paint = (event) => {
            const rect = canvas.getBoundingClientRect();
            const frame = getFrames()[current];
            const n = frame.length;
            const index = Math.max(0, Math.min(n - 1, Math.round((event.clientX - rect.left) / rect.width * n)));
            const value = Math.round(Math.max(-1, Math.min(1, -(event.clientY - rect.top - rect.height / 2) / (rect.height / 2 - 3))) * 127);
            if (last >= 0 && Math.abs(index - last) > 1) {
                const step = index > last ? 1 : -1;
                const v0 = frame[last];
                for (let i = last + step; i != index; i += step) frame[i] = Math.round(v0 + (value - v0) * ((i - last) / (index - last)));
            }
            frame[index] = value;
            last = index;
            commit();
            render();
        };
        let drawing = false;
        canvas.addEventListener("pointerdown", (event) => { drawing = true; last = -1; canvas.setPointerCapture(event.pointerId); paint(event); event.preventDefault(); });
        canvas.addEventListener("pointermove", (event) => { if (drawing) paint(event); });
        const stop = () => { drawing = false; last = -1; };
        canvas.addEventListener("pointerup", stop);
        canvas.addEventListener("pointercancel", stop);
        const frameOp = (fn) => () => { fn(getFrames()); commit(); render(); };
        const smooth = frameOp((frames) => { const f = frames[current], n = f.length, copy = f.slice(); for (let i = 0; i < n; i++) f[i] = Math.round((copy[(i + n - 1) % n] + 2 * copy[i] + copy[(i + 1) % n]) / 4); });
        const normalize = frameOp((frames) => { const f = frames[current]; let peak = 1; for (const v of f) peak = Math.max(peak, Math.abs(v)); for (let i = 0; i < f.length; i++) f[i] = Math.round(f[i] / peak * 127); });
        const invert = frameOp((frames) => { const f = frames[current]; for (let i = 0; i < f.length; i++) f[i] = -f[i]; });
        const reverse = frameOp((frames) => { frames[current].reverse(); });
        const add = frameOp((frames) => { if (frames.length >= USER_MAX_FRAMES) { flToast("A table can have up to " + USER_MAX_FRAMES + " frames."); return; } frames.splice(current + 1, 0, frames[current].slice()); current++; });
        const remove = frameOp((frames) => { if (frames.length <= 1) { flToast("A table needs at least one frame."); return; } frames.splice(current, 1); current = Math.max(0, current - 1); });
        const fromBuiltin = HTML.select({ class: "cb-select", title: "Copy a built-in table into the User table" });
        fromBuiltin.appendChild(HTML.option({ value: "" }, "Copy from built-in..."));
        TABLES.slice(0, -1).forEach((name, i) => fromBuiltin.appendChild(HTML.option({ value: i }, name)));
        fromBuiltin.addEventListener("keydown", e => e.stopPropagation());
        fromBuiltin.addEventListener("change", () => {
            if (fromBuiltin.value === "") return;
            const bank = bankFor(host.params(), +fromBuiltin.value);
            const total = bank.frames.length;
            const pick = Math.min(total, USER_MAX_FRAMES);
            const frames = [];
            for (let k = 0; k < pick; k++) {
                const mips = bank.frames[Math.round(pick == 1 ? 0 : k / (pick - 1) * (total - 1))];
                const f = [];
                for (let i = 0; i < USER_POINTS; i++) f.push(Math.round(Math.max(-1, Math.min(1, CarrotWavetable.read(mips, 2, i / USER_POINTS))) * 127));
                frames.push(f);
            }
            host.params().user = { frames };
            current = 0;
            fromBuiltin.selectedIndex = 0;
            commit(); render();
        });
        const importButton = CarrotUI.button("Import audio...", async () => {
            const picked = await host.pickAudioFile();
            if (!picked) return;
            const entry = await FLSampleBank.whenReady(picked.id);
            if (!entry || entry.status != "ready") { host.toast("Couldn't read that file."); return; }
            const frames = importFrames(entry.pcm, entry.rate);
            if (frames.length == 0) { host.toast("That sound is too short to make a wavetable."); return; }
            host.params().user = { frames };
            current = 0;
            commit(); render();
            host.toast("Imported " + frames.length + " frames from " + picked.name);
            status.textContent = "Imported \"" + picked.name + "\". Select \"User table\" on an oscillator to play it.";
        }, { title: "Slice an audio file into wavetable frames (single-cycle files work best)" });
        const buttons = CarrotUI.row(
            CarrotUI.button("+ Frame", add, { title: "Duplicate this frame after itself" }),
            CarrotUI.button("Delete frame", remove),
            CarrotUI.button("Smooth", smooth),
            CarrotUI.button("Normalize", normalize),
            CarrotUI.button("Invert", invert),
            CarrotUI.button("Reverse", reverse),
            fromBuiltin, importButton);
        host.onRefresh(render);
        setTimeout(render, 30);
        return HTML.div(CarrotUI.section("User table", strip, canvas, buttons, status));
    }
    // Takes up to 8 evenly spaced single cycles (or 2048-sample windows) out of audio.
    function importFrames(pcm, rate) {
        const frames = [];
        if (pcm.length < 512) return frames;
        const count = Math.max(1, Math.min(USER_MAX_FRAMES, Math.floor(pcm.length / 4096)));
        for (let k = 0; k < count; k++) {
            const start = count == 1 ? 0 : Math.floor(k / (count - 1) * Math.max(0, pcm.length - 4097));
            const hz = CarrotDSP.detectPitch(pcm, rate, start, 4096);
            const cycle = hz && rate / hz >= 32 && rate / hz < 2000 && start + Math.ceil(rate / hz) + 2 < pcm.length ? rate / hz : 2048;
            const window = new Float64Array(2048);
            for (let i = 0; i < 2048; i++) {
                const pos = start + (i / 2048) * cycle;
                const i0 = Math.floor(pos);
                const fr = pos - i0;
                window[i] = (pcm[i0] || 0) * (1 - fr) + (pcm[i0 + 1] || 0) * fr;
            }
            // remove DC and keep 64 harmonics
            let dc = 0; for (let i = 0; i < 2048; i++) dc += window[i]; dc /= 2048;
            const re = Float64Array.from(window, v => v - dc), im = new Float64Array(2048);
            CarrotDSP.fft(re, im, false);
            const out = new Float64Array(USER_POINTS), oim = new Float64Array(USER_POINTS);
            for (let h = 1; h < USER_POINTS / 2; h++) {
                const scale = USER_POINTS / 2048;
                out[h] = re[h] * scale; oim[h] = im[h] * scale;
                out[USER_POINTS - h] = re[2048 - h] * scale; oim[USER_POINTS - h] = im[2048 - h] * scale;
            }
            CarrotDSP.fft(out, oim, true);
            let peak = 1e-9;
            for (let i = 0; i < USER_POINTS; i++) peak = Math.max(peak, Math.abs(out[i]));
            const frame = [];
            for (let i = 0; i < USER_POINTS; i++) frame.push(Math.round(out[i] / peak * 127));
            frames.push(frame);
        }
        return frames;
    }

    B.CarrotPlugins.register({
        id: "prism",
        width: 860,
        defaultParams: defaults,
        presets: PRESETS,
        randomize,
        createVoice,
        render,
        createInstrumentState,
        processInstrument,
        buildEditor,
    });
})();
