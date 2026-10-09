/*
 * Replica - instruments rebuilt from a recording, for CarrotBox.
 *
 * AudioMidi measures how each part of a song sounds and hands the measurements to Replica,
 * which plays them back as a real instrument (no samples):
 *
 *  - pitched parts: the strength and phase of 48 harmonics at ten moments of a note (from the
 *    first 15 ms to two seconds), up to two key zones, the level curve, the release, the
 *    breath/noise in four bands and the vibrato. Playback morphs through band-limited
 *    wavetables built from those harmonics, so every pitch sounds like the original.
 *  - drums: per drum, a pitched body that sweeps and decays plus noise in 32 bands, each with
 *    its own level, attack and decay, resynthesized on the fly.
 *
 * Everything measured can be edited: draw harmonics frame by frame, tilt the brightness, change
 * the level curve, release, noise, vibrato, filter, unison and glide, or reshape any drum.
 * Instruments can be kept in "My instruments" and loaded into any song.
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotSVF, CarrotWavetable, CarrotDelayLine, flToast } = A;

    A.addStyle(`
.cb-window.cb-plugin-replica { --cb-plugin-color: #7fdbff; }
.cb-plugin-replica .cb-window-body { background: linear-gradient(#1c2430, #141a22) !important; color: #d5e3ee; }
.cb-plugin-replica .cb-canvas { background: #0a0e13 !important; border: 1px solid #2c3a49; border-radius: 4px; }
.cb-plugin-replica .cb-section { background: rgba(255,255,255,0.03) !important; border: 1px solid #263240 !important; }
.cb-plugin-replica .cb-knob .cb-arc { stroke: var(--cb-section-accent, #7fdbff); }
.cb-rp-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
.cb-rp-name { font-size: 15px; font-weight: 700; min-width: 0; flex: 1 1 200px; background: transparent; border: 1px solid transparent; color: inherit; border-radius: 4px; padding: 3px 6px; }
.cb-rp-name:hover, .cb-rp-name:focus { border-color: #2c3a49; background: rgba(0,0,0,0.25); }
.cb-rp-src { font-size: 11px; opacity: 0.7; }
.cb-rp-frames { display: flex; gap: 3px; flex-wrap: wrap; margin: 4px 0; }
.cb-rp-frame { width: 56px; height: 34px; padding: 0; border-radius: 4px; border: 1px solid #2c3a49; background: #0a0e13; cursor: pointer; position: relative; }
.cb-rp-frame.cb-on { border-color: #7fdbff; box-shadow: 0 0 0 1px #7fdbff inset; }
.cb-rp-frame span { position: absolute; right: 2px; top: 1px; font-size: 8.5px; color: #cfe3f2; background: rgba(10,14,19,0.75); border-radius: 2px; padding: 0 2px; }
.cb-rp-pads { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5px; margin-bottom: 6px; }
.cb-rp-pad { padding: 8px 4px; border-radius: 6px; border: 1px solid #2c3a49; background: linear-gradient(#253140, #1a2330); color: #d5e3ee; font-size: 11px; cursor: pointer; text-align: center; }
.cb-rp-pad.cb-on { border-color: #7fdbff; box-shadow: 0 0 8px rgba(127,219,255,0.35); }
.cb-rp-pad small { display: block; opacity: 0.6; font-size: 9px; margin-top: 2px; }
.cb-rp-lib { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
`);

    // ------------------------------------------------------------------ data
    const TIMES = [0.015, 0.04, 0.08, 0.14, 0.22, 0.35, 0.55, 0.85, 1.3, 2.0];
    const H = 48, F = TIMES.length, NOISE_BANDS = 4, DRUM_BANDS = 32;
    const NOISE_HZ = [[60, 1000], [1000, 3000], [3000, 6000], [6000, 14000]];
    const ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const CODE = new Map(Array.from(ALPH, (c, i) => [c, i]));
    // harmonic levels: 1.5 dB steps from 0 down to -94.5 dB, one character each
    const encDb = (list) => Array.from(list, v => ALPH[Math.max(0, Math.min(63, Math.round(-(Number.isFinite(v) ? v : -95) / 1.5)))]).join("");
    const decDb = (text, n) => { const out = new Float64Array(n).fill(-94.5); for (let i = 0; i < Math.min(n, text.length); i++) out[i] = -1.5 * (CODE.get(text[i]) || 0); return out; };
    // phases: 64 steps around the circle, "." = not measured
    const encPh = (list) => Array.from(list, v => v == null || !Number.isFinite(v) ? "." : ALPH[((Math.round(v / (2 * Math.PI) * 64) % 64) + 64) % 64]).join("");
    const decPh = (text, n) => { const out = new Array(n).fill(null); for (let i = 0; i < Math.min(n, (text || "").length); i++) out[i] = text[i] == "." ? null : (CODE.get(text[i]) || 0) / 64 * 2 * Math.PI; return out; };
    const drumBandHz = (b) => 30 * Math.pow(11000 / 30, (b + 0.5) / DRUM_BANDS);
    const PAD_NAMES = { kick: "Kick", snare: "Snare", clap: "Clap", hat: "Closed hat", open: "Open hat", tomLow: "Low tom", tomMid: "Mid tom", tomHigh: "High tom", rim: "Rim", crash: "Crash", ride: "Ride" };

    // A warm default (a soft saw that darkens as it rings), so a fresh Replica is never silent.
    function defaultZone() {
        const shape = [];
        for (let j = 0; j < F; j++) {
            const row = [];
            let e = 0;
            for (let h = 1; h <= H; h++) { const a = (1 / h) * Math.exp(-(h - 1) * (0.05 + 0.05 * j)); row.push(a); e += a * a; }
            for (const a of row) shape.push(20 * Math.log10(a / Math.sqrt(e) + 1e-9));
        }
        return { midi: 60, amps: encDb(shape), phases: "" };
    }
    function toneDefaults() {
        return {
            times: TIMES.slice(), zones: [defaultZone()], levels: [0, 0, -0.5, -1, -1.6, -2.4, -3.4, -4.6, -6, -7.5], tail: -3, release: 0.25,
            noise: new Array(F * NOISE_BANDS).fill(-48), vibRate: 5.5, vibDepth: 0, vibDelay: 0.25,
        };
    }
    const KNOBS = {
        volume: 0, attack: 0, decay: 1, hold: 0, releaseScale: 1, tilt: 0, oddEven: 0, morph: 1, freeze: -1, noiseMix: 1,
        cutoff: 1, reso: 0, unison: 1, detune: 12, width: 0.25, glide: 0, octave: 0, fine: 0, vel: 0.7,
    };
    function defaultParams() {
        return Object.assign({ v: 1, mode: "tone", name: "Replica", source: "", role: "lead" }, toneDefaults(), KNOBS);
    }
    function fill(p) {
        if (!p || typeof p != "object") return defaultParams();
        if (p.mode == "drums") {
            if (!Array.isArray(p.pads)) p.pads = [];
            if (p.volume == undefined) p.volume = 0;
            for (const pad of p.pads) fillPad(pad);
            return p;
        }
        if (!Array.isArray(p.zones) || !p.zones.length) Object.assign(p, toneDefaults());
        if (!Array.isArray(p.times) || p.times.length != F) p.times = TIMES.slice();
        if (!Array.isArray(p.levels) || p.levels.length != F) p.levels = toneDefaults().levels;
        if (!Array.isArray(p.noise) || p.noise.length != F * NOISE_BANDS) p.noise = new Array(F * NOISE_BANDS).fill(-60);
        for (const k of ["tail", "release", "vibRate", "vibDepth", "vibDelay"]) if (typeof p[k] != "number") p[k] = toneDefaults()[k];
        for (const k of Object.keys(KNOBS)) if (typeof p[k] != "number") p[k] = KNOBS[k];
        return p;
    }
    function fillPad(pad) {
        if (!Array.isArray(pad.bands) || pad.bands.length != DRUM_BANDS) pad.bands = new Array(DRUM_BANDS).fill(-30);
        if (!Array.isArray(pad.decays) || pad.decays.length != DRUM_BANDS) pad.decays = new Array(DRUM_BANDS).fill(0.15);
        if (!Array.isArray(pad.attacks) || pad.attacks.length != DRUM_BANDS) pad.attacks = new Array(DRUM_BANDS).fill(0.002);
        const d = { gain: 0, length: 0.5, tune: 0, decayScale: 1, toneMix: 1, noiseMix: 1, tilt: 0, level: 0, choke: pad.kind == "hat" || pad.kind == "open" ? 1 : 0 };
        for (const k of Object.keys(d)) if (typeof pad[k] != "number") pad[k] = d[k];
        if (!pad.name) pad.name = PAD_NAMES[pad.kind] || "Pad";
        return pad;
    }

    // ------------------------------------------------------------- tone engine
    // Wavetables for every zone and frame, rebuilt when the harmonics or their shaping change.
    const compiled = new Map();
    function signature(p) {
        let s = p.tilt.toFixed(2) + "|" + p.oddEven.toFixed(2);
        for (const z of p.zones) s += "|" + z.midi + ":" + z.amps + ":" + (z.phases || "");
        return s;
    }
    function compile(p) {
        const sig = signature(p);
        let c = compiled.get(sig);
        if (c) return c;
        const zones = p.zones.map(z => {
            const shape = decDb(z.amps || "", F * H);
            const ph = decPh(z.phases, H);
            // waveform phases: measured as cosine phases relative to the fundamental; the table
            // starts where the fundamental crosses zero (no click at the start of a note)
            const phases = new Float64Array(H);
            for (let h = 1; h <= H; h++) phases[h - 1] = ph[h - 1] == null ? 0 : ph[h - 1] + Math.PI / 2 - h * Math.PI / 2;
            const frames = [];
            for (let j = 0; j < F; j++) {
                const amps = new Float64Array(H);
                let e = 0;
                for (let h = 1; h <= H; h++) {
                    let db = shape[j * H + h - 1] + p.tilt * Math.log2(h);
                    if (h > 1 && p.oddEven > 0 && h % 2 == 0) db += 20 * Math.log10(Math.max(1e-4, 1 - p.oddEven));
                    if (h > 1 && p.oddEven < 0 && h % 2 == 1) db += 20 * Math.log10(Math.max(1e-4, 1 + p.oddEven));
                    const a = db <= -94 ? 0 : Math.pow(10, db / 20);
                    amps[h - 1] = a;
                    e += a * a;
                }
                // every frame at the same loudness (RMS 1/sqrt2); the level curve does the rest
                const k = e > 0 ? 1 / Math.sqrt(e) : 0;
                for (let h = 0; h < H; h++) amps[h] *= k;
                frames.push(CarrotWavetable.build(amps, phases, false));
            }
            return { midi: z.midi, frames };
        });
        c = { zones };
        compiled.set(sig, c);
        if (compiled.size > 24) compiled.delete(compiled.keys().next().value);
        return c;
    }
    // position in the frame list (0..F-1) for a time since the note began
    function frameAt(times, t) {
        if (t <= times[0]) return 0;
        for (let j = 1; j < times.length; j++) if (t < times[j]) return j - 1 + (t - times[j - 1]) / (times[j] - times[j - 1]);
        return times.length - 1;
    }
    // level (dB) of the note at time t
    function levelAt(p, t) {
        const times = p.times, lv = p.levels, last = times.length - 1;
        if (t <= times[0]) return lv[0];
        if (t >= times[last]) return lv[last] + p.tail * (t - times[last]);
        const x = frameAt(times, t), j = Math.floor(x), f = x - j;
        return lv[j] + (lv[j + 1] - lv[j]) * f;
    }
    // drums share choke groups per instrument: a closed hat silences a ringing open hat
    const chokeGroups = new WeakMap();

    function createVoice(params, info) {
        const p = fill(params);
        if (p.mode == "drums") return createDrumVoice(p, info);
        const c = compile(p);
        const n = Math.max(1, Math.min(7, p.unison | 0));
        const voice = {
            kind: "tone", c, t: 0, rel: -1, relFrom: 0, done: false,
            phase: new Float64Array(n).map((_, i) => i == 0 ? 0 : Math.random()),
            spread: new Float64Array(n).map((_, i) => n == 1 ? 0 : (i / (n - 1)) * 2 - 1),
            noise: [new CarrotSVF(), new CarrotSVF(), new CarrotSVF(), new CarrotSVF()], seed: (Math.random() * 2147483646 + 1) | 0,
            filter: new CarrotSVF(), glide: 0, vibPhase: Math.random(), lastGain: 0,
        };
        if (p.glide > 0 && info.prevDelta != null && info.prevGap != null && info.prevGap < 0.06 && Math.abs(info.prevDelta) <= 24) voice.glide = -info.prevDelta;
        const sr = info.sampleRate;
        voice.noiseNorm = NOISE_HZ.map(([lo, hi], i) => {
            const fc = Math.sqrt(lo * hi);
            voice.noise[i].set(fc, 0.25, sr);
            // the band-pass (k = 1.51) lets through about (pi/2)(1.51 fc) of the spectrum; noise of +-1 has variance 1/3
            return 1 / Math.sqrt(Math.min(1, Math.PI / 2 * 1.51 * fc / (sr / 2)) / 3);
        });
        return voice;
    }
    const BLOCK = 32;
    function render(voice, out, start, len, info) {
        if (voice.kind == "drum") return renderDrum(voice, out, start, len, info);
        const p = fill(info.params);
        const c = voice.c, sr = info.sampleRate, zones = c.zones;
        if (!info.gate && voice.rel < 0) { voice.rel = 0; voice.relFrom = voice.lastGain; }
        const vel = info.velocity == undefined ? 1 : info.velocity;
        const velAmp = 1 - p.vel + p.vel * vel;
        const master = Math.pow(10, p.volume / 20) * 0.55 * velAmp;
        const midi = info.midi + p.octave * 12 + p.fine / 100;
        // zone blend by pitch
        let za = 0, zb = 0, zf = 0;
        if (zones.length > 1) {
            const lo = zones[0], hi = zones[zones.length - 1];
            if (midi <= lo.midi) { za = zb = 0; }
            else if (midi >= hi.midi) { za = zb = zones.length - 1; }
            else { za = 0; zb = zones.length - 1; zf = (midi - lo.midi) / (hi.midi - lo.midi); }
        }
        const n = voice.phase.length, uniNorm = 1 / Math.sqrt(n);
        const freqStep = Math.pow(info.freqScale || 1, BLOCK);
        let freq = info.freq;
        const filterOn = p.cutoff < 0.999;
        const relTime = Math.max(0.005, p.release * p.releaseScale);
        let index = start;
        const end = start + len;
        while (index < end) {
            const m = Math.min(BLOCK, end - index);
            const t = voice.t;
            // timbre position (frozen, or moving at the morph speed)
            const fp = p.freeze >= 0 ? Math.min(F - 1, p.freeze) : frameAt(p.times, t * p.morph / Math.max(0.05, p.decay));
            const j0 = Math.floor(fp), j1 = Math.min(F - 1, j0 + 1), jf = fp - j0;
            // level: the measured curve (time scaled by Decay), an extra attack, hold, then release
            let db = levelAt(p, Math.max(0, t - p.hold) / Math.max(0.05, p.decay));
            let gain = Math.pow(10, db / 20);
            if (p.attack > 0) gain *= Math.min(1, t / p.attack);
            if (voice.rel >= 0) {
                gain = voice.relFrom * Math.exp(-6.9 * voice.rel / relTime);
                voice.rel += m / sr;
                if (voice.rel > relTime * 1.3) voice.done = true;
            }
            voice.lastGain = gain;
            // pitch: glide in from the last note, vibrato after its delay
            let semis = p.octave * 12 + p.fine / 100;
            if (voice.glide) { semis += voice.glide * Math.exp(-t / Math.max(0.005, p.glide * 0.4)); if (t > p.glide * 3) voice.glide = 0; }
            if (p.vibDepth > 0 && t > p.vibDelay) {
                const fade = Math.min(1, (t - p.vibDelay) / 0.3);
                semis += Math.sin(voice.vibPhase * 2 * Math.PI) * p.vibDepth / 100 * fade;
                voice.vibPhase = (voice.vibPhase + p.vibRate * m / sr) % 1;
            }
            const f0 = freq * Math.pow(2, semis / 12);
            const dt0 = f0 / sr;
            const mip = CarrotWavetable.mipFor(dt0);
            const A0 = zones[za].frames[j0][mip], A1 = zones[za].frames[j1][mip];
            const B0 = zones[zb].frames[j0][mip], B1 = zones[zb].frames[j1][mip];
            const wA0 = (1 - zf) * (1 - jf), wA1 = (1 - zf) * jf, wB0 = zf * (1 - jf), wB1 = zf * jf;
            // noise in four bands, relative to the harmonic level
            const nb = [0, 0, 0, 0];
            if (p.noiseMix > 0) for (let b = 0; b < NOISE_BANDS; b++) {
                const v0 = p.noise[j0 * NOISE_BANDS + b], v1 = p.noise[j1 * NOISE_BANDS + b];
                const v = v0 + (v1 - v0) * jf;
                // dB against the harmonics (RMS 1/sqrt2); the band filter passes a share of the white noise
                nb[b] = v <= -59 ? 0 : Math.pow(10, v / 20) * p.noiseMix * Math.SQRT1_2 * voice.noiseNorm[b];
            }
            const anyNoise = nb[0] + nb[1] + nb[2] + nb[3] > 0;
            if (filterOn) voice.filter.set(20 * Math.pow(1000, p.cutoff), p.reso * 0.9, sr);
            const g = gain * master * uniNorm;
            const dts = voice.dts || (voice.dts = new Float64Array(n));
            for (let u = 0; u < n; u++) dts[u] = dt0 * (n == 1 ? 1 : Math.pow(2, voice.spread[u] * p.detune / 1200));
            const phase = voice.phase, blend = zf > 0;
            for (let i = 0; i < m; i++) {
                let s = 0;
                for (let u = 0; u < n; u++) {
                    const ph = phase[u];
                    const pos = ph * 2048, k = pos | 0, fr = pos - k;
                    let v = wA0 * (A0[k] + (A0[k + 1] - A0[k]) * fr) + wA1 * (A1[k] + (A1[k + 1] - A1[k]) * fr);
                    if (blend) v += wB0 * (B0[k] + (B0[k + 1] - B0[k]) * fr) + wB1 * (B1[k] + (B1[k + 1] - B1[k]) * fr);
                    s += v;
                    let nph = ph + dts[u];
                    if (nph >= 1) nph -= Math.floor(nph);
                    phase[u] = nph;
                }
                s *= g;
                if (anyNoise) {
                    voice.seed = (voice.seed * 16807) % 2147483647;
                    const w = (voice.seed / 2147483647 * 2 - 1) * gain * master;
                    for (let b = 0; b < NOISE_BANDS; b++) if (nb[b] > 0) s += voice.noise[b].process(w, 2) * nb[b];
                }
                if (filterOn) s = voice.filter.process(s, 0);
                out[index + i] += s;
            }
            voice.t += m / sr;
            index += m;
            freq *= freqStep;
            if (voice.rel < 0 && db < -80 && p.tail < 0) voice.done = true;
        }
    }

    // ------------------------------------------------------------- drum engine
    // Each pad is resynthesized into a buffer at the output rate when it first plays (and again
    // after it is edited): a body (sine with an exponential pitch sweep) plus 32 noise bands.
    const padCache = new Map();
    function padSignature(pad, sr) {
        return sr + "|" + JSON.stringify([pad.tone, pad.bands, pad.decays, pad.attacks, pad.length, pad.tune, pad.decayScale, pad.toneMix, pad.noiseMix, pad.tilt, pad.gain]);
    }
    function synthPad(pad, sr) {
        const sig = padSignature(pad, sr);
        const cached = padCache.get(sig);
        if (cached) return cached;
        const ds = Math.max(0.1, pad.decayScale);
        const length = Math.min(3, Math.max(0.05, pad.length * ds) + 0.03);
        const N = Math.ceil(length * sr);
        const out = new Float32Array(N);
        const tuneRatio = Math.pow(2, pad.tune / 12);
        // noise bands (one white noise through a bank of band-pass filters)
        if (pad.noiseMix > 0) {
            let seed = 12345;
            const white = new Float32Array(N);
            for (let i = 0; i < N; i++) { seed = (seed * 16807) % 2147483647; white[i] = seed / 2147483647 * 2 - 1; }
            const ratio = Math.pow(11000 / 30, 1 / DRUM_BANDS);
            for (let b = 0; b < DRUM_BANDS; b++) {
                const fc = drumBandHz(b) * tuneRatio;
                if (fc > sr * 0.45) continue;
                const db = pad.bands[b] + pad.tilt * Math.log2(drumBandHz(b) / 1000);
                if (db <= -60) continue;
                const bw = fc * (Math.sqrt(ratio) - 1 / Math.sqrt(ratio));
                const q = fc / Math.max(1, bw);
                // RBJ band-pass, 0 dB peak; scaled so white noise in gives RMS 1 out
                const w0 = 2 * Math.PI * fc / sr, alpha = Math.sin(w0) / (2 * q), a0 = 1 + alpha;
                const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w0) / a0, a2 = (1 - alpha) / a0;
                const enbw = Math.PI / 2 * bw;
                const norm = 1 / Math.sqrt(Math.max(1e-6, enbw / (sr / 2)) / 3); // white noise of +-1 has variance 1/3
                const amp = Math.pow(10, db / 20) * norm * pad.noiseMix;
                const att = Math.max(0.0005, pad.attacks[b] || 0.001), tau = Math.max(0.002, pad.decays[b] * ds) / 6.9;
                let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
                for (let i = 0; i < N; i++) {
                    const t = i / sr;
                    const env = t < att ? t / att : Math.exp(-(t - att) / tau);
                    if (t > att && env < 1e-4) break;
                    const x = white[i];
                    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
                    x2 = x1; x1 = x; y2 = y1; y1 = y;
                    out[i] += y * amp * env;
                }
            }
        }
        // the body
        if (pad.tone && pad.toneMix > 0) {
            const tn = pad.tone;
            const f0 = Math.max(20, tn.f0) * tuneRatio, f1 = Math.max(20, tn.f1) * tuneRatio, sweep = Math.max(0.001, tn.sweep);
            const tau = Math.max(0.01, tn.decay * ds) / 4.6;
            const amp = Math.SQRT2 * Math.pow(10, (tn.level || 0) / 20) * pad.toneMix;
            let ph = 0;
            for (let i = 0; i < N; i++) {
                const t = i / sr;
                const f = f1 + (f0 - f1) * Math.exp(-t / sweep);
                ph += f / sr;
                const env = Math.min(1, t / 0.0015) * Math.exp(-t / tau);
                out[i] += Math.sin(2 * Math.PI * ph) * amp * env;
            }
        }
        // loudness: the recording's balance between drums
        const win = Math.max(1, Math.round(0.01 * sr));
        let peak = 0, acc = 0;
        for (let i = 0; i < N; i++) { acc += out[i] * out[i]; if (i >= win) acc -= out[i - win] * out[i - win]; peak = Math.max(peak, acc / win); }
        const target = 0.32 * Math.pow(10, (pad.gain || 0) / 20);
        const k = peak > 0 ? target / Math.sqrt(peak) : 0;
        for (let i = 0; i < N; i++) out[i] *= k;
        // a short fade at the end
        const fade = Math.min(N, Math.round(0.01 * sr));
        for (let i = 0; i < fade; i++) out[N - 1 - i] *= i / fade;
        padCache.set(sig, out);
        if (padCache.size > 64) padCache.delete(padCache.keys().next().value);
        return out;
    }
    function padIndexFor(p, info) {
        const n = p.pads.length;
        if (!n) return -1;
        if (info.isNoise) return Math.max(0, Math.round(info.notePitch || 0)) % n;
        return ((Math.round(info.midi) - 36) % n + n) % n;
    }
    function createDrumVoice(p, info) {
        const idx = padIndexFor(p, info);
        if (idx < 0) return { kind: "drum", done: true, buf: null };
        const pad = p.pads[idx];
        const voice = { kind: "drum", pad, buf: null, pos: 0, done: false, choke: 0, rate: 1, sr: info.sampleRate };
        // hats choke each other
        if (pad.choke > 0) {
            let set = chokeGroups.get(p);
            if (!set) chokeGroups.set(p, set = new Set());
            for (const other of set) if (other.pad != pad && other.pad.choke == pad.choke && !other.done) other.choke = 1;
            set.add(voice);
            if (set.size > 16) for (const v of set) if (v.done) set.delete(v);
        }
        return voice;
    }
    function renderDrum(voice, out, start, len, info) {
        if (voice.done || !voice.pad) { voice.done = true; return; }
        const p = fill(info.params);
        if (!voice.buf) voice.buf = synthPad(voice.pad, info.sampleRate);
        const buf = voice.buf, n = buf.length;
        const vel = info.velocity == undefined ? 1 : info.velocity;
        const g = Math.pow(10, ((p.volume || 0) + (voice.pad.level || 0)) / 20) * (0.35 + 0.65 * vel);
        let pos = voice.pos;
        const rate = voice.rate;
        for (let i = 0; i < len; i++) {
            const k = pos | 0;
            if (k + 1 >= n) { voice.done = true; break; }
            let v = buf[k] + (buf[k + 1] - buf[k]) * (pos - k);
            if (voice.choke > 0) { voice.choke *= 0.995; v *= voice.choke; if (voice.choke < 1e-3) { voice.done = true; break; } else voice.choke = Math.max(1e-4, voice.choke); }
            out[start + i] += v * g;
            pos += rate;
        }
        voice.pos = pos;
    }

    // ------------------------------------------------------- instrument effects
    function createInstrumentState(sampleRate) {
        return { dl: new CarrotDelayLine(Math.ceil(sampleRate * 0.04)), dr: new CarrotDelayLine(Math.ceil(sampleRate * 0.04)), phase: 0 };
    }
    function processInstrument(state, params, L, R, start, end, ctx) {
        const p = fill(params);
        if (p.mode == "drums") return;
        const w = p.width;
        if (!(w > 0.001)) return;
        const sr = ctx.sampleRate, inc = 0.27 / sr;
        let phase = state.phase;
        for (let i = start; i < end; i++) {
            const m = (L[i] + R[i]) * 0.5;
            state.dl.write(m);
            state.dr.write(m);
            const lfo = Math.sin(phase * 6.283185307179586);
            const wl = state.dl.read(sr * (0.0071 + 0.0009 * lfo)), wr = state.dr.read(sr * (0.0113 - 0.0011 * lfo));
            L[i] = L[i] * (1 - w * 0.4) + wl * w * 0.5 - wr * w * 0.1;
            R[i] = R[i] * (1 - w * 0.4) + wr * w * 0.5 - wl * w * 0.1;
            phase += inc; if (phase >= 1) phase -= 1;
        }
        state.phase = phase;
    }

    // A note rendered offline (previews, tests): mono Float32Array.
    function renderNote(params, midi, seconds = 0.8, sampleRate = 44100, velocity = 0.9, options = {}) {
        const p = fill(JSON.parse(JSON.stringify(params)));
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const info = { freq, freqScale: 1, gate: true, params: p, sampleRate, midi, notePitch: options.pad != undefined ? options.pad : 0, velocity, isNoise: options.pad != undefined, bpm: 120, prevDelta: null, prevGap: null };
        const voice = createVoice(p, info);
        const total = Math.ceil((seconds + (p.mode == "drums" ? 2 : Math.min(4, p.release * p.releaseScale * 1.3 + 0.05))) * sampleRate);
        const out = new Float32Array(total);
        const block = 256;
        for (let i = 0; i < total; i += block) {
            info.gate = i < seconds * sampleRate;
            render(voice, out, i, Math.min(block, total - i), info);
            if (voice.done) return out.subarray(0, i + block);
        }
        return out;
    }

    // A generic model for a drum, for kits that need a drum the recording did not give enough of.
    function defaultPad(kind) {
        const bands = [], decays = [], attacks = new Array(DRUM_BANDS).fill(0.001);
        const shape = {
            kick: { lo: 40, hi: 3000, peak: 80, tilt: -9, dec: 0.12, tone: { f0: 160, f1: 52, sweep: 0.03, decay: 0.45, level: 6 } },
            snare: { lo: 150, hi: 11000, peak: 2500, tilt: -2, dec: 0.18, tone: { f0: 240, f1: 185, sweep: 0.02, decay: 0.12, level: -4 } },
            clap: { lo: 500, hi: 9000, peak: 1500, tilt: -3, dec: 0.2 },
            hat: { lo: 5000, hi: 11000, peak: 9000, tilt: 0, dec: 0.05 },
            open: { lo: 4000, hi: 11000, peak: 8000, tilt: 0, dec: 0.45 },
            tomLow: { lo: 60, hi: 3000, peak: 120, tilt: -8, dec: 0.15, tone: { f0: 140, f1: 90, sweep: 0.05, decay: 0.5, level: 6 } },
            tomMid: { lo: 80, hi: 4000, peak: 180, tilt: -8, dec: 0.13, tone: { f0: 210, f1: 140, sweep: 0.05, decay: 0.4, level: 6 } },
            tomHigh: { lo: 100, hi: 5000, peak: 260, tilt: -8, dec: 0.12, tone: { f0: 300, f1: 210, sweep: 0.04, decay: 0.35, level: 6 } },
            crash: { lo: 2000, hi: 11000, peak: 6000, tilt: 0, dec: 1.6 },
            ride: { lo: 3000, hi: 11000, peak: 7000, tilt: -1, dec: 1.2, tone: { f0: 2400, f1: 2350, sweep: 0.2, decay: 1, level: -12 } },
            rim: { lo: 400, hi: 8000, peak: 1800, tilt: -2, dec: 0.04, tone: { f0: 820, f1: 800, sweep: 0.05, decay: 0.05, level: -2 } },
        }[kind] || { lo: 200, hi: 8000, peak: 1500, tilt: -3, dec: 0.15 };
        for (let b = 0; b < DRUM_BANDS; b++) {
            const hz = drumBandHz(b);
            const inside = hz >= shape.lo && hz <= shape.hi;
            bands.push(+(inside ? -Math.abs(Math.log2(hz / shape.peak)) * 3 + shape.tilt * Math.max(0, Math.log2(hz / shape.peak)) * 0.5 : -60).toFixed(1));
            decays.push(+(shape.dec * (hz > 6000 ? 0.7 : 1)).toFixed(3));
        }
        return fillPad({ kind, name: PAD_NAMES[kind] || kind, tone: shape.tone ? Object.assign({}, shape.tone) : null, bands, decays, attacks, length: Math.min(2, shape.dec * 2 + (shape.tone ? shape.tone.decay : 0)), gain: kind == "kick" || kind == "snare" ? 0 : -4 });
    }

    // ------------------------------------------------------ from measurements
    // AudioMidi's measurement of one part -> Replica params.
    function fromMeasurement(m, options = {}) {
        if (!m) return null;
        const name = options.name || "Replica";
        if (m.kind == "drums") {
            let pads = m.pads.map(pd => fillPad({
                kind: pd.kind, name: PAD_NAMES[pd.kind] || pd.kind, tone: pd.tone ? Object.assign({}, pd.tone) : null,
                bands: smoothBands(pd.bands), decays: smoothDecays(pd.decays, pd.bands, pd.length), attacks: pd.attacks.slice(),
                length: pd.length, gain: pd.gain,
            }));
            // a kit in a given order (the rows a song uses), generic drums where nothing was measured
            if (Array.isArray(options.kinds)) pads = options.kinds.map(kind => pads.find(pd => pd.kind == kind) || defaultPad(kind));
            return { v: 1, mode: "drums", name, source: options.source || "", role: "drums", pads, volume: options.volume || 0 };
        }
        const p = defaultParams();
        Object.assign(p, {
            name, source: options.source || "", role: m.role,
            times: (m.times || TIMES).slice(0, F), levels: m.levels.slice(0, F), tail: m.tail, release: m.release,
            noise: m.noise.slice(0, F * NOISE_BANDS), vibRate: m.vibrato ? m.vibrato.rate : 5.5, vibDepth: m.vibrato ? m.vibrato.depth : 0,
            zones: m.zones.map(z => ({ midi: z.midi, amps: encDb(z.shape), phases: encPh(z.phases) })),
            measured: { notes: m.notes, range: m.range },
        });
        // parts that slide get a little glide; chords get some width
        p.glide = m.glide > 0.25 ? 0.06 : 0;
        p.width = m.role == "chords" ? 0.35 : m.role == "bass" ? 0 : 0.2;
        p.vibDelay = 0.2;
        if (options.volume != undefined) p.volume = options.volume;
        if (m.role == "bass") p.octave = 0;
        p.orig = { zones: p.zones.map(z => Object.assign({}, z)), levels: p.levels.slice(), tail: p.tail, release: p.release, noise: p.noise.slice() };
        return p;
    }
    // Drum bands that could not be measured (too narrow for the analysis, or empty) take their
    // neighbours' values.
    function smoothBands(bands) {
        const v = bands.map(x => x <= -69 ? NaN : x);
        for (let b = 0; b < v.length; b++) if (isNaN(v[b])) {
            let lo = b - 1, hi = b + 1;
            while (lo >= 0 && isNaN(v[lo])) lo--;
            while (hi < v.length && isNaN(v[hi])) hi++;
            const a = lo >= 0 ? v[lo] : NaN, c = hi < v.length ? v[hi] : NaN;
            v[b] = isNaN(a) ? (isNaN(c) ? -60 : c) : isNaN(c) ? a : a + (c - a) * (b - lo) / (hi - lo);
        }
        return v.map((x, b) => +((v[Math.max(0, b - 1)] + 2 * x + v[Math.min(v.length - 1, b + 1)]) / 4).toFixed(1));
    }
    function smoothDecays(decays, bands, length) {
        const strong = decays.filter((d, b) => bands[b] > -40).sort((a, b) => a - b);
        const typical = strong.length ? strong[strong.length >> 1] : 0.15;
        const v = decays.map((d, b) => bands[b] > -40 ? Math.min(d, Math.max(typical * 3, 0.05), (length || 0.7) * 1.3) : typical);
        // a median of three keeps single odd bands from ringing on
        return v.map((x, b) => +[v[Math.max(0, b - 1)], x, v[Math.min(v.length - 1, b + 1)]].sort((a, c) => a - c)[1].toFixed(4));
    }

    // --------------------------------------------------------------- library
    const LIB_KEY = "carrotReplicaLibrary";
    const library = {
        list() {
            try { const v = JSON.parse(window.localStorage.getItem(LIB_KEY) || "[]"); return Array.isArray(v) ? v : []; }
            catch (error) { return []; }
        },
        save(params) {
            const list = library.list();
            const entry = { name: params.name || "Replica", saved: Date.now(), params: JSON.parse(JSON.stringify(params)) };
            const at = list.findIndex(e => e.name == entry.name);
            if (at >= 0) list[at] = entry; else list.push(entry);
            try { window.localStorage.setItem(LIB_KEY, JSON.stringify(list)); return true; }
            catch (error) { flToast("Replica: no room left to save instruments in this browser"); return false; }
        },
        remove(name) {
            const list = library.list().filter(e => e.name != name);
            try { window.localStorage.setItem(LIB_KEY, JSON.stringify(list)); } catch (error) { }
        },
    };

    // ------------------------------------------------------------------ editor
    const fmtS = (v) => v < 1 ? Math.round(v * 1000) + " ms" : v.toFixed(2) + " s";
    const fmtDb = (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " dB";
    const fmtHz = (v) => v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v) + " Hz";
    function header(host, rebuild) {
        const p = fill(host.params());
        const name = HTML.input({ class: "cb-rp-name", type: "text", value: p.name || "Replica", maxlength: "60", spellcheck: "false", title: "Name of this instrument" });
        for (const type of ["keydown", "keyup", "keypress"]) name.addEventListener(type, (e) => e.stopPropagation());
        name.addEventListener("change", () => { host.set("name", name.value.trim() || "Replica"); });
        const m = p.measured;
        const src = HTML.span({ class: "cb-rp-src" }, p.source ? "Rebuilt from " + p.source + (m && m.notes ? " (" + m.notes + " notes measured)" : "") : (p.mode == "drums" ? "Drum kit" : "Instrument"));
        const lib = HTML.select({ class: "cb-select", title: "Instruments you kept in this browser" });
        const fillLib = () => {
            lib.innerHTML = "";
            lib.appendChild(HTML.option({ value: "" }, "My instruments..."));
            for (const e of library.list()) lib.appendChild(HTML.option({ value: e.name }, e.name + (e.params.mode == "drums" ? " (drums)" : "")));
        };
        fillLib();
        lib.addEventListener("keydown", (e) => e.stopPropagation());
        lib.addEventListener("change", () => {
            const entry = library.list().find(e => e.name == lib.value);
            lib.value = "";
            if (!entry) return;
            host.replaceParams(fill(JSON.parse(JSON.stringify(entry.params))));
            rebuild();
            flToast("Replica: loaded " + entry.name);
        });
        const save = CarrotUI.button("Keep", () => {
            const params = host.params();
            params.name = name.value.trim() || params.name || "Replica";
            if (library.save(params)) { fillLib(); flToast("Replica: \"" + params.name + "\" kept in My instruments"); }
        }, { title: "Keep this instrument in My instruments (in this browser) to load it in other songs" });
        const remove = CarrotUI.button("Forget", () => {
            const n = name.value.trim();
            if (!library.list().some(e => e.name == n)) { flToast("Replica: \"" + n + "\" is not in My instruments"); return; }
            library.remove(n);
            fillLib();
            flToast("Replica: removed \"" + n + "\" from My instruments");
        }, { title: "Remove the instrument with this name from My instruments" });
        return HTML.div({ class: "cb-rp-head" }, name, src, HTML.div({ class: "cb-rp-lib" }, lib, save, remove));
    }
    // a canvas you can draw values on: values(), set(i, v), range [lo, hi]
    function drawBars(canvas, opts) {
        let drag = null;
        const pick = (e) => {
            const r = canvas.getBoundingClientRect();
            const n = opts.count();
            const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n)));
            const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
            return { i, v: opts.hi - y * (opts.hi - opts.lo) };
        };
        canvas.style.touchAction = "none";
        canvas.style.cursor = "crosshair";
        canvas.addEventListener("pointerdown", (e) => {
            if (e.button != 0) return;
            canvas.setPointerCapture(e.pointerId);
            drag = { last: null, all: e.shiftKey };
            const at = pick(e);
            opts.set(at.i, at.v, drag.all);
            drag.last = at;
            opts.redraw();
        });
        canvas.addEventListener("pointermove", (e) => {
            if (!drag) return;
            const at = pick(e);
            // fill the bars between the last point and this one
            const a = drag.last || at;
            const step = at.i >= a.i ? 1 : -1;
            for (let i = a.i; ; i += step) {
                const f = at.i == a.i ? 1 : (i - a.i) / (at.i - a.i);
                opts.set(i, a.v + (at.v - a.v) * f, drag.all);
                if (i == at.i) break;
            }
            drag.last = at;
            opts.redraw();
        });
        const end = () => { if (drag) { drag = null; opts.done(); } };
        canvas.addEventListener("pointerup", end);
        canvas.addEventListener("pointercancel", end);
    }

    function toneEditor(host, rebuild) {
        const P = () => fill(host.params());
        let frame = 4, zone = 0;
        const redraws = [];
        const redrawAll = () => redraws.forEach(f => { try { f(); } catch (error) { console.warn(error); } });
        const shapeOf = () => { const p = P(); const z = p.zones[Math.min(zone, p.zones.length - 1)]; return { z, db: decDb(z.amps || "", F * H) }; };
        // ---- one cycle of the wave
        const wave = CarrotUI.canvas(90);
        redraws.push(() => {
            const { ctx, w, h } = CarrotUI.ctx(wave);
            const c = compile(P());
            const tables = c.zones[Math.min(zone, c.zones.length - 1)].frames[frame][0];
            let peak = 1e-9;
            for (let i = 0; i < 2048; i++) peak = Math.max(peak, Math.abs(tables[i]));
            ctx.strokeStyle = "rgba(255,255,255,0.12)";
            ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
            ctx.strokeStyle = "#7fdbff"; ctx.lineWidth = 2; ctx.beginPath();
            for (let x = 0; x <= w; x++) { const v = tables[Math.min(2047, Math.floor(x / w * 2048))] / peak; const y = h / 2 - v * h * 0.42; if (x == 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "10px sans-serif";
            ctx.fillText("One cycle at " + fmtS(P().times[frame]) + " into the note", 6, 12);
        });
        // ---- frames strip
        const strip = HTML.div({ class: "cb-rp-frames" });
        const buildStrip = () => {
            strip.innerHTML = "";
            const { db } = shapeOf();
            for (let j = 0; j < F; j++) {
                const c = HTML.canvas({ width: 56, height: 34, style: "width: 100%; height: 100%; display: block;" });
                const b = HTML.button({ type: "button", class: "cb-rp-frame" + (j == frame ? " cb-on" : ""), title: "Frame " + (j + 1) + ": " + fmtS(P().times[j]) + " into the note" }, c, HTML.span(fmtS(P().times[j])));
                b.addEventListener("click", () => { frame = j; buildStrip(); redrawAll(); });
                const g = c.getContext("2d");
                g.fillStyle = "#7fdbff";
                for (let h = 0; h < 24; h++) { const v = Math.max(0, 1 + db[j * H + h] / 60); g.fillRect(h * 56 / 24, 34 - v * 32, 56 / 24 - 0.6, v * 32); }
                strip.appendChild(b);
            }
        };
        redraws.push(buildStrip);
        // ---- harmonic editor
        const bars = CarrotUI.canvas(150);
        bars.title = "Draw the strength of each harmonic for this frame. Shift-drag draws on every frame.";
        redraws.push(() => {
            const { ctx, w, h } = CarrotUI.ctx(bars);
            const { db } = shapeOf();
            const p = P();
            const orig = p.orig && p.orig.zones[zone] ? decDb(p.orig.zones[zone].amps, F * H) : null;
            for (let d = 0; d <= 60; d += 12) { const y = (-d - 0) / -66 * h; ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(0, y, w, 1); ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "9px sans-serif"; ctx.fillText("-" + d, 2, y + 10); }
            const bw = w / H;
            for (let k = 0; k < H; k++) {
                const v = Math.max(0, 1 + db[frame * H + k] / 66);
                ctx.fillStyle = k == 0 ? "#ffcb6b" : "#7fdbff";
                ctx.globalAlpha = 0.85;
                ctx.fillRect(k * bw + 1, h - v * h, Math.max(1, bw - 2), v * h);
                if (orig) { const o = Math.max(0, 1 + orig[frame * H + k] / 66); ctx.globalAlpha = 0.6; ctx.fillStyle = "#fff"; ctx.fillRect(k * bw + 1, h - o * h, Math.max(1, bw - 2), 1.5); }
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "10px sans-serif";
            ctx.fillText("Harmonics 1-48 (dB) - white marks: as measured", w - 230, 12);
        });
        let pending = null;
        drawBars(bars, {
            lo: -66, hi: 0, count: () => H,
            set: (i, v, all) => {
                const p = host.params(), z = p.zones[Math.min(zone, p.zones.length - 1)];
                pending = pending || decDb(z.amps || "", F * H);
                for (let j = 0; j < F; j++) if (all || j == frame) pending[j * H + i] = Math.max(-94, Math.min(0, v <= -64 ? -94 : v));
                z.amps = encDb(pending);
            },
            redraw: () => { redrawAll(); },
            done: () => { pending = null; host.changed(true); },
        });
        const editShape = (fn) => {
            const p = host.params(), z = p.zones[Math.min(zone, p.zones.length - 1)];
            const db = decDb(z.amps || "", F * H);
            fn(db);
            z.amps = encDb(db);
            host.changed(true);
            redrawAll();
        };
        const tools = CarrotUI.row(
            CarrotUI.button("Smooth", () => editShape(db => { const row = db.slice(frame * H, frame * H + H); for (let k = 1; k < H - 1; k++) db[frame * H + k] = (row[k - 1] + 2 * row[k] + row[k + 1]) / 4; }), { title: "Soften this frame's harmonics" }),
            CarrotUI.button("Frame to all", () => editShape(db => { for (let j = 0; j < F; j++) if (j != frame) for (let k = 0; k < H; k++) db[j * H + k] = db[frame * H + k]; }), { title: "Use this frame's harmonics for the whole note (a steady tone)" }),
            CarrotUI.button("Brighter", () => editShape(db => { for (let j = 0; j < F; j++) for (let k = 1; k < H; k++) db[j * H + k] = Math.min(0, db[j * H + k] + 1.5 * Math.log2(k + 1)); })),
            CarrotUI.button("Darker", () => editShape(db => { for (let j = 0; j < F; j++) for (let k = 1; k < H; k++) db[j * H + k] -= 1.5 * Math.log2(k + 1); })),
            CarrotUI.button("Back to measured", () => {
                const p = host.params();
                if (!p.orig) { flToast("Replica: nothing measured to go back to"); return; }
                p.zones = p.orig.zones.map(z => Object.assign({}, z));
                p.levels = p.orig.levels.slice(); p.tail = p.orig.tail; p.release = p.orig.release; p.noise = p.orig.noise.slice();
                host.changed(true);
                host.refresh();
                redrawAll();
            }, { title: "Undo every edit to the harmonics and level curve" }));
        const zoneSel = P().zones.length > 1 ? CarrotUI.select({ label: "Key zone", options: P().zones.map(z => "Around " + noteName(z.midi)), value: 0, onChange: (v) => { zone = v; redrawAll(); } }) : HTML.span();
        // ---- level curve
        const curve = CarrotUI.canvas(96);
        curve.title = "The note's level over time (as measured). Drag the points up or down.";
        const tMax = 2.6;
        const xOf = (t, w) => Math.log(1 + t / 0.01) / Math.log(1 + tMax / 0.01) * w;
        redraws.push(() => {
            const { ctx, w, h } = CarrotUI.ctx(curve);
            const p = P();
            const yOf = (db) => h - 6 - Math.max(0, 1 + db / 48) * (h - 16);
            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            for (const t of [0.01, 0.1, 0.5, 1, 2]) { const x = xOf(t, w); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "9px sans-serif"; ctx.fillText(fmtS(t), x + 2, h - 2); }
            ctx.strokeStyle = "#9be36b"; ctx.lineWidth = 2; ctx.beginPath();
            for (let x = 0; x <= w; x += 2) { const t = 0.01 * (Math.pow(1 + tMax / 0.01, x / w) - 1); let db = levelAt(p, Math.max(0, t - p.hold) / Math.max(0.05, p.decay)); if (p.attack > 0) db += 20 * Math.log10(Math.max(1e-3, Math.min(1, t / p.attack))); const y = yOf(db); if (x == 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
            ctx.fillStyle = "#9be36b";
            p.times.forEach((t, j) => { ctx.beginPath(); ctx.arc(xOf(t, w), yOf(p.levels[j]), j == frame ? 5 : 3.5, 0, 7); ctx.fill(); });
        });
        {
            let drag = null;
            curve.style.touchAction = "none";
            curve.addEventListener("pointerdown", (e) => {
                const r = curve.getBoundingClientRect(), p = P();
                const x = e.clientX - r.left;
                let best = 0, bd = 1e9;
                p.times.forEach((t, j) => { const d = Math.abs(xOf(t, r.width) - x); if (d < bd) { bd = d; best = j; } });
                drag = { j: best };
                frame = best;
                curve.setPointerCapture(e.pointerId);
                buildStrip();
            });
            curve.addEventListener("pointermove", (e) => {
                if (!drag) return;
                const r = curve.getBoundingClientRect();
                const y = Math.max(0, Math.min(1, (r.height - 6 - (e.clientY - r.top)) / (r.height - 16)));
                host.params().levels[drag.j] = +(-48 + 48 * y).toFixed(1);
                redrawAll();
            });
            const end = () => { if (drag) { drag = null; host.changed(true); } };
            curve.addEventListener("pointerup", end);
            curve.addEventListener("pointercancel", end);
        }
        const k = (path, spec) => host.knob(path, Object.assign({ onInput: () => redrawAll() }, spec));
        // option 0 = the timbre moves as measured (freeze -1), option j + 1 holds frame j
        const freezeSel = CarrotUI.select({ label: "Timbre over time", options: ["Moves like the original"].concat(TIMES.map((t, j) => "Hold frame " + (j + 1) + " (" + fmtS(t) + ")")), value: Math.round(P().freeze) + 1, onChange: (v) => { host.set("freeze", v - 1); redrawAll(); } });
        host.onRefresh(() => freezeSel.setValue(Math.round(P().freeze) + 1));
        const play = (pitch) => host.previewNote(pitch, 0.9);
        const preview = CarrotUI.row(HTML.span({ class: "cb-hint" }, "Play:"), ...[[24, "C2"], [36, "C3"], [48, "C4"], [60, "C5"]].map(([pi, label]) => CarrotUI.button(label, () => play(pi))));
        const root = HTML.div(
            CarrotUI.section("Timbre", CarrotUI.row(zoneSel, preview), wave, strip, bars, tools),
            CarrotUI.cols(2,
                CarrotUI.section("Shape", CarrotUI.row(
                    k("tilt", { label: "Brightness", min: -6, max: 6, def: 0, format: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " dB/oct" }),
                    k("oddEven", { label: "Odd / even", min: -1, max: 1, def: 0, format: (v) => v < -0.02 ? "Even " + Math.round(-v * 100) + "%" : v > 0.02 ? "Odd " + Math.round(v * 100) + "%" : "As heard" }),
                    k("morph", { label: "Morph speed", min: 0.25, max: 4, def: 1, curve: "exp", format: (v) => v.toFixed(2) + "x" }),
                    k("noiseMix", { label: "Breath", min: 0, max: 3, def: 1, format: (v) => Math.round(v * 100) + "%" })),
                    freezeSel),
                CarrotUI.section("Level", curve, CarrotUI.row(
                    k("attack", { label: "Attack", min: 0, max: 2, def: 0, format: fmtS }),
                    k("hold", { label: "Hold", min: 0, max: 2, def: 0, format: fmtS }),
                    k("decay", { label: "Decay time", min: 0.25, max: 4, def: 1, curve: "exp", format: (v) => v.toFixed(2) + "x" }),
                    k("tail", { label: "Fade after", min: -60, max: 0, def: -3, format: (v) => v.toFixed(1) + " dB/s" }),
                    k("release", { label: "Release", min: 0.01, max: 4, def: 0.25, curve: "exp", format: fmtS })))),
            CarrotUI.cols(2,
                CarrotUI.section("Voice", CarrotUI.row(
                    k("octave", { label: "Octave", min: -3, max: 3, def: 0, step: 1, format: (v) => (v > 0 ? "+" : "") + v }),
                    k("fine", { label: "Fine", min: -100, max: 100, def: 0, format: (v) => Math.round(v) + " ct" }),
                    k("glide", { label: "Glide", min: 0, max: 0.5, def: 0, format: (v) => v <= 0 ? "Off" : fmtS(v) }),
                    k("unison", { label: "Unison", min: 1, max: 7, def: 1, step: 1, format: (v) => String(v | 0) }),
                    k("detune", { label: "Detune", min: 0, max: 50, def: 12, format: (v) => Math.round(v) + " ct" }),
                    k("width", { label: "Width", min: 0, max: 1, def: 0.25, format: (v) => Math.round(v * 100) + "%" }),
                    k("vel", { label: "Velocity", min: 0, max: 1, def: 0.7, format: (v) => Math.round(v * 100) + "%" }),
                    k("volume", { label: "Volume", min: -24, max: 12, def: 0, format: fmtDb }))),
                CarrotUI.section("Vibrato & filter", CarrotUI.row(
                    k("vibRate", { label: "Vib. rate", min: 0.5, max: 12, def: 5.5, format: (v) => v.toFixed(1) + " Hz" }),
                    k("vibDepth", { label: "Vib. depth", min: 0, max: 100, def: 0, format: (v) => Math.round(v) + " ct" }),
                    k("vibDelay", { label: "Vib. delay", min: 0, max: 2, def: 0.25, format: fmtS }),
                    k("cutoff", { label: "Cutoff", min: 0, max: 1, def: 1, format: (v) => v >= 0.999 ? "Open" : fmtHz(20 * Math.pow(1000, v)) }),
                    k("reso", { label: "Resonance", min: 0, max: 1, def: 0, format: (v) => Math.round(v * 100) + "%" })))),
            CarrotUI.hint("Every part of this sound was measured from the recording: the harmonics at ten moments of a note (the frames), how loud it is over time, its release, breath noise and vibrato. Draw on the harmonics, drag the level curve, or use the knobs; \"Back to measured\" undoes it all."));
        host.onRefresh(() => redrawAll());
        setTimeout(redrawAll, 0);
        return root;
    }
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

    function drumEditor(host, rebuild) {
        const P = () => fill(host.params());
        let sel = 0;
        const redraws = [];
        const redrawAll = () => redraws.forEach(f => { try { f(); } catch (error) { console.warn(error); } });
        const isNoise = () => { const inst = host.instrument && host.instrument(); const t = host.target; return t && t.channel != undefined ? host.doc.song.getChannelIsNoise(t.channel) : true; };
        const audition = (i) => host.previewNote(isNoise() ? i : 24 + i, 0.6);
        const grid = HTML.div({ class: "cb-rp-pads" });
        const buildGrid = () => {
            grid.innerHTML = "";
            P().pads.forEach((pad, i) => {
                const b = HTML.button({ type: "button", class: "cb-rp-pad" + (i == sel ? " cb-on" : ""), title: "Row " + (i + 1) + " of the drum channel. Click to hear and edit." }, pad.name || "Pad", HTML.small(pad.tone ? "body + noise" : "noise"));
                b.addEventListener("click", () => { sel = i; buildGrid(); buildPad(); audition(i); });
                grid.appendChild(b);
            });
        };
        const padBox = HTML.div();
        const buildPad = () => {
            padBox.innerHTML = "";
            redraws.length = 0;
            const pads = P().pads;
            if (!pads.length) { padBox.appendChild(CarrotUI.hint("This kit has no drums yet. AudioMidi fills it from a recording.")); return; }
            sel = Math.min(sel, pads.length - 1);
            const base = "pads." + sel + ".";
            const pad = pads[sel];
            const wave = CarrotUI.canvas(70);
            redraws.push(() => {
                const { ctx, w, h } = CarrotUI.ctx(wave);
                const buf = synthPad(P().pads[sel], 22050);
                let peak = 1e-9;
                for (const v of buf) peak = Math.max(peak, Math.abs(v));
                ctx.fillStyle = "#ffcb6b";
                for (let x = 0; x < w; x++) {
                    const a = Math.floor(x / w * buf.length), b2 = Math.floor((x + 1) / w * buf.length);
                    let m = 0;
                    for (let i = a; i < b2; i++) m = Math.max(m, Math.abs(buf[i]));
                    ctx.fillRect(x, h / 2 - m / peak * h * 0.45, 1, Math.max(1, m / peak * h * 0.9));
                }
                ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "10px sans-serif";
                ctx.fillText(fmtS(buf.length / 22050), w - 50, 12);
            });
            const bandsC = CarrotUI.canvas(110);
            bandsC.title = "The noise in 32 bands, 30 Hz to 11 kHz. Draw to reshape it.";
            redraws.push(() => {
                const { ctx, w, h } = CarrotUI.ctx(bandsC);
                const pd = P().pads[sel];
                const bw = w / DRUM_BANDS;
                for (let b = 0; b < DRUM_BANDS; b++) {
                    const v = Math.max(0, 1 + pd.bands[b] / 60);
                    ctx.fillStyle = "#7fdbff";
                    ctx.globalAlpha = 0.85;
                    ctx.fillRect(b * bw + 1, h - v * h, bw - 2, v * h);
                    // decay as a dot height: longer rings higher
                    const d = Math.min(1, Math.log(1 + pd.decays[b] / 0.01) / Math.log(1 + 2 / 0.01));
                    ctx.globalAlpha = 1; ctx.fillStyle = "#ff7eb6";
                    ctx.fillRect(b * bw + bw / 2 - 2, h - d * h, 4, 2);
                }
                ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "9px sans-serif";
                for (const hz of [100, 1000, 5000]) { const b = DRUM_BANDS * Math.log(hz / 30) / Math.log(11000 / 30); ctx.fillText(fmtHz(hz), b * bw, 10); }
                ctx.fillText("bars: level  -  pink: how long it rings", w - 170, 10);
            });
            drawBars(bandsC, {
                lo: -60, hi: 0, count: () => DRUM_BANDS,
                set: (i, v) => { host.params().pads[sel].bands[i] = +Math.max(-60, Math.min(0, v)).toFixed(1); },
                redraw: () => redrawAll(),
                done: () => { host.changed(true); audition(sel); },
            });
            const k = (key, spec) => host.knob(base + key, Object.assign({ onInput: () => redrawAll() }, spec));
            const name = HTML.input({ type: "text", value: pad.name || "", maxlength: "24", style: "width: 120px;" });
            for (const type of ["keydown", "keyup", "keypress"]) name.addEventListener(type, (e) => e.stopPropagation());
            name.addEventListener("change", () => { host.set(base + "name", name.value || "Pad"); buildGrid(); });
            const bodyKnobs = pad.tone ? CarrotUI.row(
                k("tone.f0", { label: "Body start", min: 20, max: 1000, def: pad.tone.f0, curve: "exp", format: fmtHz }),
                k("tone.f1", { label: "Body end", min: 20, max: 800, def: pad.tone.f1, curve: "exp", format: fmtHz }),
                k("tone.sweep", { label: "Sweep", min: 0.001, max: 0.3, def: pad.tone.sweep, curve: "exp", format: fmtS }),
                k("tone.decay", { label: "Body decay", min: 0.02, max: 3, def: pad.tone.decay, curve: "exp", format: fmtS }),
                k("tone.level", { label: "Body level", min: -40, max: 24, def: pad.tone.level || 0, format: fmtDb })) : CarrotUI.row(CarrotUI.button("Add a body", () => {
                    host.params().pads[sel].tone = { f0: 180, f1: 60, sweep: 0.03, decay: 0.4, level: 0 };
                    host.changed(true);
                    buildPad();
                }, { title: "Give this drum a pitched body (like a kick or tom)" }));
            padBox.append(
                CarrotUI.section("Drum: " + (pad.name || "Pad"), CarrotUI.row(HTML.label({ class: "cb-field" }, "Name", name), CarrotUI.button("Play", () => audition(sel))), wave, bandsC),
                CarrotUI.cols(2,
                    CarrotUI.section("Sound", CarrotUI.row(
                        k("tune", { label: "Tune", min: -24, max: 24, def: 0, format: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " st" }),
                        k("decayScale", { label: "Decay", min: 0.25, max: 4, def: 1, curve: "exp", format: (v) => v.toFixed(2) + "x" }),
                        k("tilt", { label: "Color", min: -6, max: 6, def: 0, format: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " dB/oct" }),
                        k("noiseMix", { label: "Noise", min: 0, max: 2, def: 1, format: (v) => Math.round(v * 100) + "%" }),
                        k("toneMix", { label: "Body", min: 0, max: 2, def: 1, format: (v) => Math.round(v * 100) + "%" }),
                        k("level", { label: "Level", min: -24, max: 12, def: 0, format: fmtDb })),
                        host.select(base + "choke", { label: "Choke group", options: ["None", "1 (hats)", "2", "3"], def: 0, title: "Drums in the same group cut each other off" })),
                    CarrotUI.section("Body", bodyKnobs)));
            host.onRefresh(() => redrawAll());
            setTimeout(redrawAll, 0);
        };
        buildGrid();
        buildPad();
        return HTML.div(
            CarrotUI.section("Kit", grid, CarrotUI.row(host.knob("volume", { label: "Kit volume", min: -24, max: 12, def: 0, format: fmtDb }))),
            padBox,
            CarrotUI.hint("Each drum was rebuilt from the recording: a pitched body that sweeps down (kicks and toms) and noise in 32 bands, each with its own level and ring. On a drum channel, row 1 plays the first pad, row 2 the second, and so on."));
    }
    function buildEditor(host) {
        const root = HTML.div();
        const rebuild = () => {
            root.innerHTML = "";
            const p = fill(host.params());
            root.append(header(host, rebuild), p.mode == "drums" ? drumEditor(host, rebuild) : toneEditor(host, rebuild));
        };
        rebuild();
        return root;
    }

    B.CarrotPlugins.register({
        id: "replica",
        width: 720,
        defaultParams,
        createVoice,
        render,
        createInstrumentState,
        processInstrument,
        buildEditor,
        anyChannel: true,
        // for AudioMidi and tests
        fromMeasurement, defaultPad, renderNote, library, compile, synthPad, fill,
    });
})();
