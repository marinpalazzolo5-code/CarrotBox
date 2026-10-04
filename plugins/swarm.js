/*
 * Swarm - a fast, friendly hybrid synth for CarrotBox.
 *
 *  - 3 oscillators (12 waveforms) with up to 8-voice unison each
 *  - sub oscillator and noise generator
 *  - two multimode filters (serial, parallel or split routing)
 *  - amp and mod envelopes, 2 LFOs and a 6-slot mod matrix
 *  - stereo width and a built-in effect rack
 *
 * Instrument plugin: every note creates one voice (see createVoice/render).
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotFX, CarrotDSP, CarrotADSR, CarrotSVF, CarrotDelayLine, CarrotWavetable, carrotFxRack, carrotSyncOptions, carrotSyncBeats } = A;

    const BLOCK = 16;
    const MAX_UNISON = 8;
    const WAVES = ["Sine", "Triangle", "Saw", "Square", "Pulse", "Saw-Tri morph", "Organ", "Strings", "Reed", "Glass", "Digital", "Noise"];
    const FILTER_TYPES = ["Low pass 12", "Low pass 24", "High pass 12", "High pass 24", "Band pass", "Notch", "Off"];
    const ROUTES = ["Serial (1 > 2)", "Parallel", "Split (Osc 1 + Sub > 1, rest > 2)"];
    const LFO_SHAPES = ["Sine", "Triangle", "Saw up", "Saw down", "Square", "Sample & hold"];
    const SOURCES = ["None", "LFO 1", "LFO 2", "Mod envelope", "Velocity", "Key follow"];
    const DESTS = ["Pitch (+/-24 st)", "Filter 1 cutoff", "Filter 2 cutoff", "Filter 1 resonance", "Osc 1 level", "Osc 2 level", "Osc 3 level", "Pulse width / morph", "Unison detune", "Volume"];
    const OCTAVES = ["-3", "-2", "-1", "0", "+1", "+2", "+3"];
    const UNISONS = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const SUB_WAVES = ["Sine", "Triangle", "Square"];
    const SUB_OCTAVES = ["-1 oct", "-2 oct"];
    const MATRIX_SLOTS = 6;

    A.addStyle(`
.cb-swarm-oscs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.cb-swarm-panel .cb-row { justify-content: flex-start; }
.cb-swarm-wave { display: block; width: 100%; height: 44px; margin: 3px 0 4px; }
.cb-swarm-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.cb-swarm-mtx { display: grid; grid-template-columns: 1.1fr 1.5fr 1.6fr; gap: 4px 6px; align-items: center; }
.cb-swarm-mtx select { width: 100%; }
.cb-swarm-mtx input[type=range] { width: 100%; }
.cb-swarm-mtx .cb-head { font-size: 10px; color: var(--secondary-text, #aaa); text-transform: uppercase; letter-spacing: 0.08em; }
.cb-swarm-scope { display: block; width: 100%; height: 40px; }
`);

    // -------------------------------------------------------------- defaults
    function osc(wave, level, extra) {
        return Object.assign({ wave, oct: 3, semi: 0, fine: 0, level, uni: 1, detune: 0.2, pw: 0.5 }, extra || {});
    }
    function filter(type, cutoff, extra) {
        return Object.assign({ type, cutoff, res: 0.15, drive: 0, key: 0, env: 0 }, extra || {});
    }
    function lfo(shape, rate, extra) {
        return Object.assign({ shape, rate, sync: false, div: 9, fade: 0, key: true }, extra || {});
    }
    function defaults() {
        return {
            osc: [osc(2, 0.9, { uni: 3, detune: 0.22 }), osc(2, 0, { uni: 3, detune: 0.22, fine: 6 }), osc(3, 0, { oct: 2 })],
            sub: { wave: 0, oct: 0, level: 0 },
            noise: { level: 0, color: 0.6 },
            f1: filter(1, 7000, { key: 0.3 }),
            f2: filter(6, 1200),
            route: 0,
            amp: { a: 0.005, d: 0.4, s: 0.8, r: 0.25 },
            mod: { a: 0.001, d: 0.45, s: 0, r: 0.3 },
            lfo: [lfo(0, 2), lfo(1, 0.5)],
            mtx: [0, 1, 2, 3, 4, 5].map(() => ({ src: 0, dst: 1, amt: 0 })),
            vel: 0.5,
            level: 0.8,
            width: 0.3,
            fx: [],
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
            else if (s && typeof s == "object") {
                target[key] = merge(target[key] && typeof target[key] == "object" ? target[key] : {}, s);
            }
            else target[key] = s;
        }
        return target;
    }
    // Fills in anything missing (older songs, hand-edited params) in place.
    function fill(params) {
        const d = defaults();
        const p = params;
        const fillObject = (target, base) => {
            for (const key of Object.keys(base)) {
                const b = base[key];
                if (target[key] === undefined || target[key] === null) target[key] = Array.isArray(b) ? b.map(x => (x && typeof x == "object") ? JSON.parse(JSON.stringify(x)) : x) : (b && typeof b == "object") ? JSON.parse(JSON.stringify(b)) : b;
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
        fillObject(p, d);
        return p;
    }
    function make(over) {
        return merge(defaults(), over);
    }

    // ------------------------------------------------------------ wavetables
    const tables = {};
    function getTable(wave) {
        if (tables[wave]) return tables[wave];
        const count = 128;
        const amps = new Float64Array(count), phases = new Float64Array(count);
        for (let h = 1; h <= count; h++) {
            let a = 0, ph = 0;
            switch (wave) {
                case 6: a = { 1: 1, 2: 0.75, 3: 0.55, 4: 0.5, 6: 0.35, 8: 0.3 }[h] || 0; break;
                case 7: a = (1 / h) * Math.max(0, 1 - h / 70); ph = Math.PI * 0.37 * h * h; break;
                case 8: a = (h & 1) ? (1 / Math.sqrt(h)) * (0.4 + 1.4 * Math.exp(-Math.pow((h - 7) / 3.2, 2))) * Math.max(0, 1 - h / 60) : 0; break;
                case 9: a = [1, 0, 0.55, 0, 0.12, 0.38, 0, 0.22, 0.05, 0, 0.14, 0, 0.07, 0.09][h - 1] || (h < 24 ? 0.04 / Math.sqrt(h) : 0); break;
                case 10: a = (1 / Math.sqrt(h)) * (h % 3 == 0 ? 0.2 : 1) * (h % 2 ? 1 : 0.55); ph = (h % 2) ? 0 : Math.PI / 2; break;
            }
            amps[h - 1] = a;
            phases[h - 1] = ph;
        }
        return tables[wave] = CarrotWavetable.build(amps, phases, true);
    }

    // Fills out[0..n) with one oscillator voice. Returns the new phase.
    function fillOsc(wave, phase, dt, pw, out, n, level, add) {
        if (dt <= 0 || level == 0) return phase;
        switch (wave) {
            case 0:
                for (let i = 0; i < n; i++) {
                    const v = Math.sin(phase * 6.283185307179586) * level;
                    out[i] = add ? out[i] + v : v;
                    phase += dt; if (phase >= 1) phase -= 1;
                }
                break;
            case 1:
                for (let i = 0; i < n; i++) {
                    const v = (1 - 4 * Math.abs(phase - 0.5)) * level;
                    out[i] = add ? out[i] + v : v;
                    phase += dt; if (phase >= 1) phase -= 1;
                }
                break;
            case 2:
                for (let i = 0; i < n; i++) {
                    let v = 2 * phase - 1;
                    if (phase < dt) { const t = phase / dt; v -= t + t - t * t - 1; }
                    else if (phase > 1 - dt) { const t = (phase - 1) / dt; v -= t * t + t + t + 1; }
                    v *= level;
                    out[i] = add ? out[i] + v : v;
                    phase += dt; if (phase >= 1) phase -= 1;
                }
                break;
            case 3:
            case 4: {
                const width = wave == 3 ? 0.5 : Math.max(0.05, Math.min(0.95, pw));
                const dc = (2 * width - 1);
                for (let i = 0; i < n; i++) {
                    let v = phase < width ? 1 : -1;
                    // polyBLEP at both edges
                    if (phase < dt) { const t = phase / dt; v += t + t - t * t - 1; }
                    else if (phase > 1 - dt) { const t = (phase - 1) / dt; v += t * t + t + t + 1; }
                    let q = phase - width; if (q < 0) q += 1;
                    if (q < dt) { const t = q / dt; v -= t + t - t * t - 1; }
                    else if (q > 1 - dt) { const t = (q - 1) / dt; v -= t * t + t + t + 1; }
                    v = (v - dc) * level;
                    out[i] = add ? out[i] + v : v;
                    phase += dt; if (phase >= 1) phase -= 1;
                }
                break;
            }
            case 5: {
                // pw 0 = triangle, 1 = saw
                const m = Math.max(0, Math.min(1, pw));
                for (let i = 0; i < n; i++) {
                    let saw = 2 * phase - 1;
                    if (phase < dt) { const t = phase / dt; saw -= t + t - t * t - 1; }
                    else if (phase > 1 - dt) { const t = (phase - 1) / dt; saw -= t * t + t + t + 1; }
                    const tri = 1 - 4 * Math.abs(phase - 0.5);
                    const v = (tri + (saw - tri) * m) * level;
                    out[i] = add ? out[i] + v : v;
                    phase += dt; if (phase >= 1) phase -= 1;
                }
                break;
            }
            case 11:
                for (let i = 0; i < n; i++) {
                    const v = (Math.random() * 2 - 1) * level;
                    out[i] = add ? out[i] + v : v;
                }
                break;
            default: {
                const mips = getTable(wave);
                const mip = CarrotWavetable.mipFor(dt);
                for (let i = 0; i < n; i++) {
                    const v = CarrotWavetable.read(mips, mip, phase) * level;
                    out[i] = add ? out[i] + v : v;
                    phase += dt; if (phase >= 1) phase -= 1;
                }
            }
        }
        return phase;
    }

    // ---------------------------------------------------------------- voice
    function softClip(x) {
        if (x > 3) return 1;
        if (x < -3) return -1;
        return x * (27 + x * x) / (27 + 9 * x * x);
    }
    function lfoValue(shape, phase, voice, index) {
        switch (shape) {
            case 0: return Math.sin(phase * 6.283185307179586);
            case 1: return 1 - 4 * Math.abs(phase - 0.5);
            case 2: return 2 * phase - 1;
            case 3: return 1 - 2 * phase;
            case 4: return phase < 0.5 ? 1 : -1;
            default: return voice.hold[index];
        }
    }
    function createVoice(params, info) {
        fill(params);
        const sr = info.sampleRate;
        const voice = {
            sr, done: false, released: false, age: 0,
            phases: [new Float64Array(MAX_UNISON), new Float64Array(MAX_UNISON), new Float64Array(MAX_UNISON)],
            subPhase: 0, noiseLP: 0,
            amp: new CarrotADSR(), mod: new CarrotADSR(),
            f: [[new CarrotSVF(), new CarrotSVF()], [new CarrotSVF(), new CarrotSVF()]],
            lfoPhase: [0, 0], hold: [Math.random() * 2 - 1, Math.random() * 2 - 1], lfoAge: 0,
            bus1: new Float32Array(BLOCK), bus2: new Float32Array(BLOCK), tmp: new Float32Array(BLOCK),
            midi: info.midi, velocity: info.velocity,
        };
        for (let o = 0; o < 3; o++) {
            for (let v = 0; v < MAX_UNISON; v++) voice.phases[o][v] = Math.random();
        }
        // The first voice of every oscillator starts at the same phase so notes are punchy and repeatable.
        for (let o = 0; o < 3; o++) voice.phases[o][0] = 0;
        const p = params;
        voice.amp.set(p.amp.a, p.amp.d, p.amp.s, p.amp.r, sr);
        voice.mod.set(p.mod.a, p.mod.d, p.mod.s, p.mod.r, sr);
        voice.amp.trigger();
        voice.mod.trigger();
        for (let i = 0; i < 2; i++) if (!p.lfo[i].key) voice.lfoPhase[i] = Math.random();
        return voice;
    }
    function filterStage(voice, which, p, type, x) {
        const f = voice.f[which];
        switch (type) {
            case 0: return f[0].process(x, 0);
            case 1: return f[1].process(f[0].process(x, 0), 0);
            case 2: return f[0].process(x, 1);
            case 3: return f[1].process(f[0].process(x, 1), 1);
            case 4: return f[0].process(x, 2);
            case 5: return f[0].process(x, 3);
        }
        return x;
    }
    function render(voice, out, start, len, info) {
        const p = fill(info.params);
        const sr = info.sampleRate;
        voice.sr = sr;
        if (!info.gate && !voice.released) {
            voice.released = true;
            voice.amp.release();
            voice.mod.release();
        }
        voice.amp.set(p.amp.a, p.amp.d, p.amp.s, p.amp.r, sr);
        voice.mod.set(p.mod.a, p.mod.d, p.mod.s, p.mod.r, sr);
        const bpm = info.bpm || 120;
        const blockSeconds = BLOCK / sr;
        const freqStep = Math.pow(info.freqScale || 1, BLOCK);
        let baseFreq = info.freq;
        const midi = info.midi;
        const keyFollow = Math.max(-1, Math.min(1, (midi - 60) / 36));
        const velocity = info.velocity == undefined ? 1 : info.velocity;
        const velAmp = 1 - p.vel + p.vel * velocity;
        const masterLevel = p.level * 1.15;
        const routeMode = p.route | 0;
        const bus1 = voice.bus1, bus2 = voice.bus2, tmp = voice.tmp;
        const dest = new Float64Array(DESTS.length);
        const srcValue = new Float64Array(SOURCES.length);
        srcValue[4] = velocity;
        srcValue[5] = keyFollow;
        let index = start;
        const end = start + len;
        while (index < end) {
            const n = Math.min(BLOCK, end - index);
            // ---- modulation sources (control rate)
            voice.age += n;
            for (let i = 0; i < 2; i++) {
                const l = p.lfo[i];
                const hz = l.sync ? (bpm / 60) / carrotSyncBeats(l.div | 0) : l.rate;
                const before = voice.lfoPhase[i];
                voice.lfoPhase[i] += hz * n / sr;
                if (voice.lfoPhase[i] >= 1) { voice.lfoPhase[i] -= Math.floor(voice.lfoPhase[i]); voice.hold[i] = Math.random() * 2 - 1; }
                let v = lfoValue(l.shape | 0, voice.lfoPhase[i], voice, i);
                if (l.fade > 0) v *= Math.min(1, (voice.age / sr) / l.fade);
                srcValue[1 + i] = v;
            }
            const modLevel = voice.mod.next();
            for (let i = 1; i < n; i++) voice.mod.next();
            srcValue[3] = modLevel;
            dest.fill(0);
            for (let i = 0; i < MATRIX_SLOTS; i++) {
                const m = p.mtx[i];
                if (!m || !m.amt || !m.src) continue;
                dest[m.dst | 0] += srcValue[m.src | 0] * m.amt;
            }
            // ---- oscillators
            bus1.fill(0, 0, n);
            bus2.fill(0, 0, n);
            const pitchSemi = dest[0] * 24;
            for (let o = 0; o < 3; o++) {
                const od = p.osc[o];
                const level = Math.max(0, Math.min(1.5, od.level + dest[4 + o]));
                if (level <= 0.0005) continue;
                const uni = Math.max(1, Math.min(MAX_UNISON, od.uni | 0 || 1));
                const detuneCents = Math.max(0, Math.min(1, od.detune + dest[8])) * 70;
                const pw = Math.max(0, Math.min(1, od.pw + dest[7] * 0.5));
                const semis = ((od.oct | 0) - 3) * 12 + od.semi + od.fine / 100 + pitchSemi;
                const centerHz = baseFreq * Math.pow(2, semis / 12);
                const norm = level / Math.sqrt(uni);
                const target = routeMode == 2 && o == 0 ? bus1 : (routeMode == 2 ? bus2 : bus1);
                for (let v = 0; v < uni; v++) {
                    const spread = uni == 1 ? 0 : (v / (uni - 1)) * 2 - 1;
                    const hz = centerHz * Math.pow(2, (spread * detuneCents) / 1200);
                    const dt = Math.min(0.45, hz / sr);
                    if (od.wave == 11) { fillOsc(11, 0, 1, pw, tmp, n, norm, false); }
                    else voice.phases[o][v] = fillOsc(od.wave | 0, voice.phases[o][v], dt, pw, tmp, n, norm, false);
                    for (let i = 0; i < n; i++) target[i] += tmp[i];
                }
            }
            // sub
            if (p.sub.level > 0.0005) {
                const subHz = baseFreq * Math.pow(2, (pitchSemi - 12 * ((p.sub.oct | 0) + 1)) / 12);
                const dt = Math.min(0.45, subHz / sr);
                const w = p.sub.wave | 0;
                const shape = w == 0 ? 0 : w == 1 ? 1 : 3;
                voice.subPhase = fillOsc(shape, voice.subPhase, dt, 0.5, tmp, n, p.sub.level * 0.9, false);
                for (let i = 0; i < n; i++) bus1[i] += tmp[i];
            }
            // noise
            if (p.noise.level > 0.0005) {
                const coef = 0.04 + 0.96 * p.noise.color * p.noise.color;
                let lp = voice.noiseLP;
                const g = p.noise.level * 0.8;
                for (let i = 0; i < n; i++) {
                    lp += ((Math.random() * 2 - 1) - lp) * coef;
                    (routeMode == 2 ? bus2 : bus1)[i] += lp * g * (coef < 0.3 ? 2.2 : 1);
                }
                voice.noiseLP = lp;
            }
            // ---- filters
            const cutoffOf = (fp, extra) => {
                const octaves = srcValue[3] * fp.env * 6 + extra + fp.key * (midi - 60) / 12;
                return Math.max(20, Math.min(sr * 0.45, fp.cutoff * Math.pow(2, octaves)));
            };
            const f1 = p.f1, f2 = p.f2;
            const t1 = f1.type | 0, t2 = f2.type | 0;
            const c1 = cutoffOf(f1, dest[1] * 5), c2 = cutoffOf(f2, dest[2] * 5);
            const r1 = Math.max(0, Math.min(1, f1.res + dest[3] * 0.5));
            for (let k = 0; k < 2; k++) {
                voice.f[0][k].set(c1, r1, sr);
                voice.f[1][k].set(c2, f2.res, sr);
            }
            const drive1 = 1 + f1.drive * 6, drive2 = 1 + f2.drive * 6;
            const volMod = Math.max(0, 1 + dest[9]);
            for (let i = 0; i < n; i++) {
                let y;
                const a = bus1[i], b = bus2[i];
                if (routeMode == 0) {
                    y = a;
                    if (t1 != 6) y = filterStage(voice, 0, f1, t1, f1.drive > 0 ? softClip(y * drive1) : y);
                    if (t2 != 6) y = filterStage(voice, 1, f2, t2, f2.drive > 0 ? softClip(y * drive2) : y);
                }
                else if (routeMode == 1) {
                    const yy1 = t1 != 6 ? filterStage(voice, 0, f1, t1, f1.drive > 0 ? softClip(a * drive1) : a) : a;
                    const yy2 = t2 != 6 ? filterStage(voice, 1, f2, t2, f2.drive > 0 ? softClip(a * drive2) : a) : a;
                    y = (t1 != 6 && t2 != 6) ? (yy1 + yy2) * 0.7 : (t1 != 6 ? yy1 : yy2);
                }
                else {
                    const yy1 = t1 != 6 ? filterStage(voice, 0, f1, t1, f1.drive > 0 ? softClip(a * drive1) : a) : a;
                    const yy2 = t2 != 6 ? filterStage(voice, 1, f2, t2, f2.drive > 0 ? softClip(b * drive2) : b) : b;
                    y = yy1 + yy2;
                }
                const env = voice.amp.next();
                out[index + i] += y * env * velAmp * masterLevel * volMod;
            }
            if (voice.released && voice.amp.done) voice.done = true;
            index += n;
            baseFreq *= freqStep;
        }
        if (!(Math.abs(voice.noiseLP) < 1e6)) voice.noiseLP = 0;
        if (voice.amp.done && voice.released) voice.done = true;
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
            const inc = 0.35 / sr;
            let phase = state.phase;
            for (let i = start; i < end; i++) {
                const m = (L[i] + R[i]) * 0.5;
                state.dl.write(m);
                state.dr.write(m);
                const lfo = Math.sin(phase * 6.283185307179586);
                const wl = state.dl.read(sr * (0.0072 + 0.0011 * lfo));
                const wr = state.dr.read(sr * (0.0113 - 0.0013 * lfo));
                L[i] = L[i] * (1 - w * 0.45) + wl * w * 0.55 - wr * w * 0.1;
                R[i] = R[i] * (1 - w * 0.45) + wr * w * 0.55 - wl * w * 0.1;
                phase += inc; if (phase >= 1) phase -= 1;
            }
            state.phase = phase;
        }
    }

    // ---------------------------------------------------------------- presets
    const PRESETS = [
        { group: "Leads", name: "Super Saw Lead", params: make({ osc: [{ uni: 7, detune: 0.35 }, { level: 0.7, uni: 5, detune: 0.3, fine: 9, oct: 3 }], f1: { cutoff: 9000, res: 0.2, key: 0.5 }, amp: { s: 0.85, r: 0.3 }, width: 0.6, fx: [CarrotFX.defaults("delay"), CarrotFX.defaults("reverb")] }) },
        { group: "Leads", name: "Square Pluck Lead", params: make({ osc: [{ wave: 3, uni: 2, detune: 0.1 }, { wave: 4, level: 0.5, pw: 0.35, oct: 4, uni: 2 }], f1: { type: 1, cutoff: 2200, res: 0.3, env: 0.45, key: 0.4 }, mod: { a: 0.001, d: 0.28, s: 0, r: 0.2 }, amp: { d: 0.35, s: 0.55, r: 0.2 } }) },
        { group: "Leads", name: "Hoover", params: make({ osc: [{ wave: 2, uni: 8, detune: 0.8, oct: 2 }, { wave: 2, level: 0.8, uni: 8, detune: 0.7, oct: 3, fine: 17 }, { wave: 3, level: 0.5, oct: 1 }], f1: { type: 1, cutoff: 3500, res: 0.35, drive: 0.4 }, mtx: [{ src: 1, dst: 0, amt: 0.02 }], lfo: [{ shape: 0, rate: 4.5 }], amp: { s: 0.9 }, width: 0.7 }) },
        { group: "Leads", name: "Reed Solo", params: make({ osc: [{ wave: 8, uni: 2, detune: 0.12 }, { wave: 5, level: 0.4, pw: 0.7, oct: 3 }], f1: { type: 0, cutoff: 3800, res: 0.1, key: 0.6 }, lfo: [{ shape: 0, rate: 5.2, fade: 0.6 }], mtx: [{ src: 1, dst: 0, amt: 0.012 }], amp: { a: 0.04, s: 0.9, r: 0.25 } }) },
        { group: "Bass", name: "Sub Bass", params: make({ osc: [{ wave: 0, oct: 2, uni: 1, level: 0.9 }, { wave: 1, level: 0.25, oct: 3, uni: 1 }], sub: { level: 0.4 }, f1: { type: 0, cutoff: 900 }, amp: { a: 0.003, d: 0.2, s: 0.95, r: 0.12 }, width: 0 }) },
        { group: "Bass", name: "Acid Squelch", params: make({ osc: [{ wave: 2, oct: 2, uni: 1, level: 0.9 }], f1: { type: 1, cutoff: 450, res: 0.78, drive: 0.3, env: 0.85 }, mod: { a: 0.001, d: 0.22, s: 0, r: 0.1 }, amp: { a: 0.002, d: 0.3, s: 0.7, r: 0.08 }, width: 0 }) },
        { group: "Bass", name: "Reese", params: make({ osc: [{ wave: 2, oct: 2, uni: 3, detune: 0.18 }, { wave: 2, oct: 2, level: 0.9, uni: 3, detune: 0.18, fine: 13 }], sub: { level: 0.35 }, f1: { type: 1, cutoff: 1100, res: 0.25 }, lfo: [{ shape: 1, rate: 0.35 }], mtx: [{ src: 1, dst: 1, amt: 0.35 }], amp: { s: 0.95, r: 0.2 }, width: 0.25 }) },
        { group: "Bass", name: "Wobble", params: make({ osc: [{ wave: 2, oct: 2, uni: 3, detune: 0.12 }, { wave: 3, oct: 2, level: 0.6 }], sub: { level: 0.3 }, f1: { type: 1, cutoff: 700, res: 0.5, drive: 0.25 }, lfo: [{ shape: 1, rate: 2, sync: true, div: 6 }], mtx: [{ src: 1, dst: 1, amt: 0.55 }], amp: { s: 0.95, r: 0.15 }, width: 0.2 }) },
        { group: "Pads", name: "Warm Pad", params: make({ osc: [{ wave: 7, uni: 5, detune: 0.3 }, { wave: 1, level: 0.5, oct: 2, uni: 3, detune: 0.2 }], f1: { type: 1, cutoff: 2400, res: 0.12 }, amp: { a: 0.7, d: 1.2, s: 0.8, r: 1.4 }, width: 0.8, fx: [CarrotFX.defaults("chorus"), CarrotFX.defaults("reverb")] }) },
        { group: "Pads", name: "Glass Pad", params: make({ osc: [{ wave: 9, uni: 4, detune: 0.25 }, { wave: 0, level: 0.4, oct: 4 }], f1: { type: 0, cutoff: 5200 }, lfo: [{ shape: 0, rate: 0.25 }], mtx: [{ src: 1, dst: 1, amt: 0.2 }], amp: { a: 0.9, d: 1.5, s: 0.85, r: 1.8 }, width: 0.9, fx: [CarrotFX.defaults("reverb")] }) },
        { group: "Pads", name: "Dark Choir", params: make({ osc: [{ wave: 8, uni: 6, detune: 0.3, oct: 2 }, { wave: 7, level: 0.5, oct: 3, uni: 4, detune: 0.25 }], noise: { level: 0.05, color: 0.2 }, f1: { type: 1, cutoff: 1500, res: 0.2 }, amp: { a: 1.1, d: 1.5, s: 0.85, r: 2.2 }, width: 0.9, fx: [CarrotFX.defaults("reverb")] }) },
        { group: "Keys", name: "Electric Piano", params: make({ osc: [{ wave: 0, uni: 2, detune: 0.05 }, { wave: 9, level: 0.35, oct: 4 }], f1: { type: 0, cutoff: 4200, key: 0.6, env: 0.25 }, mod: { a: 0.001, d: 0.5, s: 0, r: 0.3 }, amp: { a: 0.002, d: 1.4, s: 0.0, r: 0.35 }, vel: 0.8, width: 0.4 }) },
        { group: "Keys", name: "Drawbar Organ", params: make({ osc: [{ wave: 6, uni: 1, level: 0.9 }, { wave: 6, level: 0.4, oct: 4 }], f1: { type: 6 }, amp: { a: 0.005, d: 0.1, s: 1, r: 0.06 }, vel: 0.1, width: 0.3 }) },
        { group: "Plucks", name: "Mallet Pluck", params: make({ osc: [{ wave: 1, uni: 2, detune: 0.06 }, { wave: 9, level: 0.5, oct: 4 }], f1: { type: 1, cutoff: 3000, env: 0.5, key: 0.5 }, mod: { d: 0.2, s: 0, r: 0.1 }, amp: { d: 0.55, s: 0, r: 0.2 }, width: 0.35, fx: [CarrotFX.defaults("reverb")] }) },
        { group: "Plucks", name: "Arp Pluck", params: make({ osc: [{ wave: 2, uni: 3, detune: 0.18 }, { wave: 3, level: 0.4, oct: 2 }], f1: { type: 1, cutoff: 1800, res: 0.25, env: 0.6, key: 0.5 }, mod: { d: 0.18, s: 0, r: 0.1 }, amp: { d: 0.3, s: 0, r: 0.14 }, width: 0.5, fx: [Object.assign(CarrotFX.defaults("delay"), { mix: 0.3 })] }) },
        { group: "FX", name: "Riser", params: make({ osc: [{ wave: 2, uni: 8, detune: 0.9 }, { wave: 11, level: 0.6 }], noise: { level: 0.35, color: 0.8 }, f1: { type: 1, cutoff: 300, res: 0.45, env: 0.9 }, mod: { a: 3, d: 0.5, s: 1, r: 0.5 }, amp: { a: 1.2, d: 1, s: 1, r: 1 }, mtx: [{ src: 3, dst: 0, amt: 0.25 }], width: 0.9 }) },
        { group: "FX", name: "Laser Zap", params: make({ osc: [{ wave: 3, uni: 2, detune: 0.2 }], f1: { type: 1, cutoff: 6000, res: 0.5 }, mod: { a: 0.001, d: 0.2, s: 0, r: 0.1 }, mtx: [{ src: 3, dst: 0, amt: 0.7 }], amp: { d: 0.25, s: 0, r: 0.1 }, width: 0.5 }) },
    ];

    // --------------------------------------------------------------- randomize
    function randomize() {
        const r = Math.random, pick = (a) => a[Math.floor(r() * a.length)];
        const p = defaults();
        const waves = [0, 1, 2, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        p.osc[0] = osc(pick(waves), 0.8 + r() * 0.2, { uni: 1 + Math.floor(r() * 6), detune: 0.1 + r() * 0.4, pw: 0.2 + r() * 0.6, oct: 2 + Math.floor(r() * 2) });
        p.osc[1] = osc(pick(waves), r() < 0.7 ? 0.3 + r() * 0.6 : 0, { uni: 1 + Math.floor(r() * 4), detune: 0.1 + r() * 0.4, pw: r(), oct: 2 + Math.floor(r() * 3), fine: Math.round((r() - 0.5) * 30) });
        p.osc[2] = osc(pick(waves), r() < 0.3 ? 0.2 + r() * 0.5 : 0, { oct: 2 + Math.floor(r() * 2), semi: pick([0, 0, 7, 12, -12]) });
        p.sub.level = r() < 0.4 ? 0.2 + r() * 0.4 : 0;
        p.noise.level = r() < 0.2 ? r() * 0.2 : 0;
        p.f1 = filter(pick([0, 1, 1, 1, 2, 4]), CarrotDSP.expMap(r(), 300, 12000), { res: r() * 0.55, drive: r() < 0.3 ? r() * 0.5 : 0, key: r() * 0.7, env: (r() - 0.3) * 0.9 });
        p.f2 = filter(r() < 0.25 ? pick([0, 2, 5]) : 6, CarrotDSP.expMap(r(), 200, 8000), { res: r() * 0.3 });
        p.route = r() < 0.8 ? 0 : 1;
        const pad = r() < 0.4;
        p.amp = { a: pad ? 0.2 + r() * 1.2 : 0.002 + r() * 0.03, d: 0.1 + r() * 1.5, s: pad ? 0.6 + r() * 0.4 : r(), r: 0.1 + r() * (pad ? 2 : 0.8) };
        p.mod = { a: 0.001 + r() * 0.2, d: 0.1 + r() * 1.2, s: r() * 0.4, r: 0.1 + r() };
        p.lfo[0] = lfo(pick([0, 1, 2, 4, 5]), CarrotDSP.expMap(r(), 0.1, 12));
        p.mtx[0] = { src: 1, dst: pick([0, 1, 1, 7, 8]), amt: (r() - 0.5) * 0.7 };
        p.mtx[1] = { src: 3, dst: pick([0, 1]), amt: (r() - 0.4) * 0.6 };
        p.width = 0.2 + r() * 0.7;
        return p;
    }

    // ------------------------------------------------------------------ editor
    function drawWave(canvas, wave, pw) {
        const { ctx, w, h } = CarrotUI.ctx(canvas);
        ctx.fillStyle = "#0b0d12";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke();
        const n = Math.max(64, Math.floor(w));
        const buf = new Float32Array(n);
        const dt = 2 / n;
        if (wave == 11) { for (let i = 0; i < n; i++) buf[i] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 2 - 1 + 0; }
        else fillOsc(wave, 0, dt, pw, buf, n, 1, false);
        ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--cb-plugin-color").trim() || "#ffb02e";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const x = i / (n - 1) * w;
            const y = h / 2 - Math.max(-1.2, Math.min(1.2, buf[i])) * (h / 2 - 4);
            if (i == 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    function filterMagnitude(type, cutoff, res, f, sr) {
        if (type == 6) return 1;
        const x = Math.tan(Math.PI * Math.min(f, sr * 0.49) / sr) / Math.tan(Math.PI * Math.min(cutoff, sr * 0.47) / sr);
        const k = 2 - 1.96 * res;
        const x2 = x * x;
        const den = Math.sqrt((1 - x2) * (1 - x2) + k * k * x2);
        let m;
        switch (type) {
            case 0: case 1: m = 1 / den; if (type == 1) m *= m; break;
            case 2: case 3: m = x2 / den; if (type == 3) m *= m; break;
            case 4: m = k * x / den; break;
            default: m = Math.abs(1 - x2) / den;
        }
        return m;
    }
    function drawFilter(canvas, p) {
        const { ctx, w, h } = CarrotUI.ctx(canvas);
        ctx.fillStyle = "#0b0d12";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        for (const hz of [100, 1000, 10000]) {
            const x = Math.log(hz / 20) / Math.log(1000) * w;
            ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
        }
        for (const db of [-24, -12, 0, 12]) {
            const y = h * (1 - (db + 36) / 60);
            ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
        }
        const sr = 44100;
        const route = p.route | 0;
        const t1 = p.f1.type | 0, t2 = p.f2.type | 0;
        const color = getComputedStyle(canvas).getPropertyValue("--cb-plugin-color").trim() || "#ffb02e";
        const curve = (fn, stroke, alpha) => {
            ctx.beginPath();
            for (let x = 0; x <= w; x += 2) {
                const f = 20 * Math.pow(1000, x / w);
                const db = 20 * Math.log10(Math.max(1e-4, fn(f)));
                const y = h * (1 - (Math.max(-36, Math.min(24, db)) + 36) / 60);
                if (x == 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
        };
        const m1 = (f) => filterMagnitude(t1, p.f1.cutoff, p.f1.res, f, sr);
        const m2 = (f) => filterMagnitude(t2, p.f2.cutoff, p.f2.res, f, sr);
        if (t1 != 6) curve(m1, "#ffffff", 0.35);
        if (t2 != 6) curve(m2, "#9be36b", 0.35);
        curve((f) => route == 0 ? m1(f) * m2(f) : (t1 != 6 && t2 != 6 ? (m1(f) + m2(f)) * 0.7 : (t1 != 6 ? m1(f) : m2(f))), color, 1);
    }
    function drawScope(canvas, l) {
        const { ctx, w, h } = CarrotUI.ctx(canvas);
        ctx.fillStyle = "#0b0d12";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--cb-plugin-color").trim() || "#ffb02e";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const rnd = CarrotDSP.rng(7);
        let hold = rnd() * 2 - 1;
        const shape = l.shape | 0;
        for (let x = 0; x <= w; x++) {
            const t = x / w;
            const steps = 8;
            if (shape == 5 && Math.floor(t * steps) != Math.floor(((x - 1) / w) * steps)) hold = rnd() * 2 - 1;
            const v = shape == 5 ? hold : CarrotDSP.lfo(shape, t);
            const y = h / 2 - v * (h / 2 - 5);
            if (x == 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    function buildEditor(host) {
        fill(host.params());
        const root = HTML.div({ class: "cb-swarm-panel" });
        // The song stores the number of unison voices (1-8); the menu shows it.
        const unisonSelect = (path) => {
            const el = CarrotUI.select({ label: "Unison", options: UNISONS, value: Math.max(0, (host.get(path, 1) | 0) - 1), title: "Stacked, detuned voices per note (more = thicker, uses more CPU)", onChange: (i) => host.set(path, i + 1) });
            el.setValue = (v) => { el.menu.selectedIndex = Math.max(0, Math.min(MAX_UNISON - 1, (v | 0) - 1)); };
            return host._bind(el, path, 1);
        };
        const redraws = [];
        const wc = () => host.params();

        // ---- Oscillators tab
        const oscPanels = HTML.div({ class: "cb-swarm-oscs" });
        for (let o = 0; o < 3; o++) {
            const base = "osc." + o + ".";
            const canvas = HTML.canvas({ class: "cb-canvas cb-swarm-wave" });
            redraws.push(() => drawWave(canvas, wc().osc[o].wave | 0, wc().osc[o].pw));
            const waveSelect = host.select(base + "wave", { label: "Waveform", options: WAVES, def: 2, onChange: () => redraws.forEach(f => f()) });
            const pw = host.knob(base + "pw", { label: "PW / Morph", min: 0, max: 1, def: 0.5, small: true, format: v => Math.round(v * 100) + "%", onInput: () => drawWave(canvas, wc().osc[o].wave | 0, wc().osc[o].pw) });
            oscPanels.appendChild(CarrotUI.section("Oscillator " + (o + 1),
                waveSelect, canvas,
                CarrotUI.row(
                    host.knob(base + "level", { label: "Level", min: 0, max: 1, def: o == 0 ? 0.9 : 0, small: true, format: v => Math.round(v * 100) + "%" }),
                    host.select(base + "oct", { label: "Octave", options: OCTAVES, def: 3 }),
                    host.knob(base + "semi", { label: "Semi", min: -12, max: 12, step: 1, def: 0, small: true }),
                    host.knob(base + "fine", { label: "Fine", min: -100, max: 100, step: 1, def: 0, unit: "c", small: true })),
                CarrotUI.row(
                    unisonSelect(base + "uni"),
                    host.knob(base + "detune", { label: "Detune", min: 0, max: 1, def: 0.2, small: true, format: v => Math.round(v * 100) + "%" }),
                    pw)));
        }
        const extras = CarrotUI.cols(2,
            CarrotUI.section("Sub & noise", CarrotUI.row(
                host.select("sub.wave", { label: "Sub wave", options: SUB_WAVES, def: 0 }),
                host.select("sub.oct", { label: "Sub octave", options: SUB_OCTAVES, def: 0 }),
                host.knob("sub.level", { label: "Sub", min: 0, max: 1, def: 0, small: true, format: v => Math.round(v * 100) + "%" }),
                host.knob("noise.level", { label: "Noise", min: 0, max: 1, def: 0, small: true, format: v => Math.round(v * 100) + "%" }),
                host.knob("noise.color", { label: "Color", min: 0, max: 1, def: 0.6, small: true, format: v => Math.round(v * 100) + "%" }))),
            CarrotUI.section("Output", CarrotUI.row(
                host.knob("level", { label: "Volume", min: 0, max: 1.5, def: 0.8, small: true, format: v => Math.round(v * 100) + "%" }),
                host.knob("vel", { label: "Velocity", min: 0, max: 1, def: 0.5, small: true, format: v => Math.round(v * 100) + "%", title: "How much note volume changes the loudness" }),
                host.knob("width", { label: "Width", min: 0, max: 1, def: 0.3, small: true, format: v => Math.round(v * 100) + "%", title: "Stereo spread (a short modulated stereo widener)" }))));
        const oscTab = HTML.div(oscPanels, extras);

        // ---- Filter tab
        const filterCanvas = HTML.canvas({ class: "cb-canvas", style: "height: 90px;" });
        redraws.push(() => drawFilter(filterCanvas, wc()));
        const refreshFilter = () => drawFilter(filterCanvas, wc());
        const filterPanel = (n) => {
            const base = "f" + n + ".";
            return CarrotUI.section("Filter " + n, CarrotUI.row(
                host.select(base + "type", { label: "Type", options: FILTER_TYPES, def: n == 1 ? 1 : 6, onChange: refreshFilter }),
                host.knob(base + "cutoff", { label: "Cutoff", min: 20, max: 20000, curve: "exp", unit: "Hz", def: n == 1 ? 7000 : 1200, small: true, onInput: refreshFilter }),
                host.knob(base + "res", { label: "Resonance", min: 0, max: 1, def: 0.15, small: true, format: v => Math.round(v * 100) + "%", onInput: refreshFilter }),
                host.knob(base + "drive", { label: "Drive", min: 0, max: 1, def: 0, small: true, format: v => Math.round(v * 100) + "%" }),
                host.knob(base + "key", { label: "Key track", min: 0, max: 1, def: 0, small: true, format: v => Math.round(v * 100) + "%" }),
                host.knob(base + "env", { label: "Env amount", min: -1, max: 1, def: 0, small: true, format: v => (v > 0 ? "+" : "") + Math.round(v * 100) + "%", title: "How far the mod envelope opens (or closes) the cutoff" })));
        };
        const routeSelect = host.select("route", { label: "Routing", options: ROUTES, def: 0, onChange: refreshFilter });
        const envs = CarrotUI.cols(2,
            CarrotUI.section("Amp envelope", host.envelope("amp", { value: { a: 0.005, d: 0.4, s: 0.8, r: 0.25 }, label: "Amp envelope" })),
            CarrotUI.section("Mod envelope", host.envelope("mod", { value: { a: 0.001, d: 0.45, s: 0, r: 0.3 }, label: "Mod envelope" })));
        const filterTab = HTML.div(CarrotUI.section("Response", filterCanvas, CarrotUI.row(routeSelect)), filterPanel(1), filterPanel(2), envs);

        // ---- Modulation tab
        const lfoPanel = (i) => {
            const base = "lfo." + i + ".";
            const scope = HTML.canvas({ class: "cb-canvas cb-swarm-scope" });
            const draw = () => drawScope(scope, wc().lfo[i]);
            redraws.push(draw);
            const rate = host.knob(base + "rate", { label: "Rate", min: 0.02, max: 30, curve: "exp", unit: "Hz", def: i == 0 ? 2 : 0.5, small: true });
            const div = host.select(base + "div", { label: "Sync rate", options: carrotSyncOptions(), def: 9 });
            const syncToggle = host.toggle(base + "sync", { label: "Tempo sync", def: false, onChange: update });
            function update() {
                const sync = !!wc().lfo[i].sync;
                rate.style.display = sync ? "none" : "";
                div.style.display = sync ? "" : "none";
            }
            host.onRefresh(update);
            update();
            return CarrotUI.section("LFO " + (i + 1), scope, CarrotUI.row(
                host.select(base + "shape", { label: "Shape", options: LFO_SHAPES, def: i == 0 ? 0 : 1, onChange: draw }),
                rate, div, syncToggle,
                host.knob(base + "fade", { label: "Fade in", min: 0, max: 4, def: 0, unit: "s", small: true }),
                host.toggle(base + "key", { label: "Key sync", def: true, title: "Restart the LFO with every note" })));
        };
        const matrix = HTML.div({ class: "cb-swarm-mtx" });
        matrix.appendChild(HTML.div({ class: "cb-head" }, "Source"));
        matrix.appendChild(HTML.div({ class: "cb-head" }, "Destination"));
        matrix.appendChild(HTML.div({ class: "cb-head" }, "Amount"));
        for (let i = 0; i < MATRIX_SLOTS; i++) {
            const base = "mtx." + i + ".";
            const src = host.select(base + "src", { options: SOURCES, def: 0, title: "Modulation source" });
            const dst = host.select(base + "dst", { options: DESTS, def: 1, title: "Modulation destination" });
            const amount = HTML.input({ type: "range", min: "-100", max: "100", step: "1", title: "Amount (double-click to zero)" });
            amount.addEventListener("keydown", e => e.stopPropagation());
            amount.addEventListener("input", () => host.set(base + "amt", (+amount.value) / 100));
            amount.addEventListener("dblclick", () => { amount.value = "0"; host.set(base + "amt", 0); });
            amount.setValue = (v) => { amount.value = String(Math.round((v || 0) * 100)); };
            host._bind(amount, base + "amt", 0);
            matrix.append(src.menu || src, dst.menu || dst, amount);
        }
        const modTab = HTML.div(CarrotUI.cols(2, lfoPanel(0), lfoPanel(1)), CarrotUI.section("Modulation matrix", matrix, CarrotUI.hint("Pick a source, a destination and how much. Pitch is +/-24 semitones at full amount, filter cutoffs +/-5 octaves.")));

        // ---- FX tab
        const fxTab = HTML.div(CarrotUI.section("Instrument effects (after the voice, before the song's mixer)", carrotFxRack(host, "fx", { max: 6 })), CarrotUI.hint("Swarm is mono per note; the Width knob on the Oscillators tab and chorus / phaser / delay here make it wide."));

        const tabs = CarrotUI.tabs([["Oscillators", oscTab], ["Filters & envelopes", filterTab], ["Modulation", modTab], ["Effects", fxTab]], () => setTimeout(() => { redraws.forEach(f => f()); }));
        host.onRefresh(() => redraws.forEach(f => f()));
        root.appendChild(tabs);
        setTimeout(() => redraws.forEach(f => f()), 30);
        return root;
    }

    B.CarrotPlugins.register({
        id: "swarm",
        width: 760,
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
