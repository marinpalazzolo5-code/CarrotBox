/*
 * AudioMidi (experimental) - turns an audio file into a CarrotBox song.
 *
 * Load a WAV, MP3, OGG or FLAC and AudioMidi:
 *   1. finds the tempo, the beat grid and the downbeats (onset envelope,
 *      autocorrelation, a comb-filter search for the exact tempo and phase)
 *   2. hears the drums: kick, snare / clap, closed and open hats from
 *      band-limited spectral flux on a 16th-note grid
 *   3. follows the bass line and the lead melody (harmonic summation
 *      salience on a drum-suppressed spectrogram, Viterbi smoothing for the
 *      melody, octave checks for the bass)
 *   4. recognizes the key (Krumhansl profiles) and the chords (chroma
 *      templates per half bar), plus an inner voice between bass and lead
 *   5. writes drums, bass, lead, chords and the inner voice into new channels
 *      (or a new song) at the detected tempo and key, with the original audio
 *      on a muted track for A/B listening.
 *
 * It is an approximation: clear, well-mixed songs with a steady tempo give
 * the closest results. Instruments are CarrotBox sounds, not the originals.
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, Config } = A;
    const SR = 22050;
    const tick = () => new Promise(resolve => setTimeout(resolve, 0));

    A.addStyle(`
.cb-am-drop { border: 2px dashed rgba(127,127,127,0.45); border-radius: 10px; padding: 16px; text-align: center; cursor: pointer; transition: background 0.15s; }
.cb-am-drop:hover, .cb-am-drop.cb-hover { background: rgba(0,200,255,0.08); }
.cb-am-drop b { display: block; font-size: 14px; margin-bottom: 4px; }
.cb-am-progress { height: 8px; border-radius: 4px; background: rgba(127,127,127,0.2); overflow: hidden; margin: 8px 0 4px; }
.cb-am-progress div { height: 100%; width: 0%; background: var(--cb-plugin-color, #00c8ff); transition: width 0.1s; }
.cb-am-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 8px 0; }
.cb-am-stat { padding: 6px 8px; border-radius: 8px; background: rgba(127,127,127,0.1); }
.cb-am-stat small { display: block; opacity: 0.65; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.cb-am-stat b { font-size: 15px; }
.cb-am-badge { display: inline-block; padding: 1px 7px; border-radius: 8px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; background: #ffb02e; color: #111; margin-left: 6px; vertical-align: middle; }
`);

    // ------------------------------------------------------------ FFT
    const fftCache = new Map();
    function fftTables(n) {
        if (fftCache.has(n)) return fftCache.get(n);
        const bits = Math.round(Math.log2(n));
        const rev = new Uint32Array(n);
        for (let i = 0; i < n; i++) {
            let r = 0;
            for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
            rev[i] = r;
        }
        const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
        for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
        const win = new Float64Array(n);
        for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
        const t = { n, rev, cos, sin, win };
        fftCache.set(n, t);
        return t;
    }
    function fft(re, im, t) {
        const n = t.n, rev = t.rev;
        for (let i = 0; i < n; i++) {
            const j = rev[i];
            if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; }
        }
        for (let size = 2; size <= n; size <<= 1) {
            const half = size >> 1, step = n / size;
            for (let i = 0; i < n; i += size) {
                for (let j = 0, k = 0; j < half; j++, k += step) {
                    const wr = t.cos[k], wi = t.sin[k], a = i + j, b = a + half;
                    const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
                }
            }
        }
    }
    // Magnitude spectrogram, bins 0..maxBin-1, as one Float32Array (frame-major).
    async function spectrogram(x, n, hop, maxBin, progress, from, to) {
        const t = fftTables(n);
        const frames = Math.max(1, Math.floor((x.length - n) / hop) + 1);
        const data = new Float32Array(frames * maxBin);
        const re = new Float64Array(n), im = new Float64Array(n);
        let last = performance.now();
        for (let f = 0; f < frames; f++) {
            const off = f * hop;
            for (let i = 0; i < n; i++) { re[i] = (x[off + i] || 0) * t.win[i]; im[i] = 0; }
            fft(re, im, t);
            const row = f * maxBin;
            for (let k = 0; k < maxBin; k++) data[row + k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
            if (performance.now() - last > 35) { progress(from + (to - from) * f / frames); await tick(); last = performance.now(); }
        }
        return { frames, bins: maxBin, data, hop, n, binHz: SR / n };
    }
    // ------------------------------------------------------------ small helpers
    function percentile(values, p) {
        const list = Array.from(values).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
        if (list.length == 0) return 0;
        return list[Math.min(list.length - 1, Math.max(0, Math.floor(p * (list.length - 1))))];
    }
    const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // ------------------------------------------------------------ onsets / drums
    async function onsetFeatures(x, progress) {
        const S = await spectrogram(x, 1024, 256, 512, progress, 0.02, 0.32);
        const { frames, bins, data } = S;
        const L = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) L[i] = Math.log(1 + 60 * data[i]);
        const band = (lo, hi) => [Math.max(1, Math.round(lo / S.binHz)), Math.min(bins - 2, Math.round(hi / S.binHz))];
        const bands = { low: band(30, 130), body: band(150, 450), mid: band(1000, 5000), high: band(6500, 10800), all: band(30, 10800), tonal: band(200, 2500) };
        const out = { fps: SR / 256, frames };
        for (const name in bands) out[name] = new Float32Array(frames);
        out.midBroad = new Float32Array(frames);
        out.highEnergy = new Float32Array(frames);
        out.lowEnergy = new Float32Array(frames);
        for (let f = 1; f < frames; f++) {
            const row = f * bins, prev = (f - 1) * bins;
            for (const name in bands) {
                const [lo, hi] = bands[name];
                let sum = 0, positive = 0;
                for (let k = lo; k <= hi; k++) {
                    // SuperFlux-style: compare with the loudest neighbour of the previous frame
                    const before = Math.max(L[prev + k - 1], L[prev + k], L[prev + k + 1]);
                    const d = L[row + k] - before;
                    if (d > 0) { sum += d; if (d > 0.15) positive++; }
                }
                out[name][f] = sum / (hi - lo + 1);
                if (name == "mid") out.midBroad[f] = positive / (hi - lo + 1);
            }
            let he = 0, le = 0;
            for (let k = bands.high[0]; k <= bands.high[1]; k++) he += L[row + k];
            for (let k = bands.low[0]; k <= bands.low[1]; k++) le += L[row + k];
            out.highEnergy[f] = he / (bands.high[1] - bands.high[0] + 1);
            out.lowEnergy[f] = le / (bands.low[1] - bands.low[0] + 1);
        }
        // the onset envelope: smoothed, minus a moving average, half-wave rectified
        const env = new Float32Array(frames);
        const win = Math.round(out.fps * 0.5);
        let acc = 0;
        const smooth = new Float32Array(frames);
        for (let f = 0; f < frames; f++) smooth[f] = (out.all[f] + (out.all[f - 1] || 0) * 0.5 + (out.all[f + 1] || 0) * 0.5) / 2;
        for (let f = 0; f < frames; f++) {
            acc += smooth[f] - (f - win >= 0 ? smooth[f - win] : 0);
            const mean = acc / Math.min(win, f + 1);
            env[f] = Math.max(0, smooth[f] - mean);
        }
        out.env = env;
        return out;
    }
    function estimateTempo(env, fps) {
        const n = env.length;
        const lagMin = Math.floor(fps * 60 / 200), lagMax = Math.ceil(fps * 60 / 55);
        const ac = new Float64Array(lagMax * 4 + 2);
        for (let L = lagMin; L < ac.length && L < n / 2; L++) {
            let s = 0;
            for (let t = 0; t + L < n; t++) s += env[t] * env[t + L];
            ac[L] = s / (n - L);
        }
        let best = lagMin, bestScore = -1;
        const scores = new Float64Array(lagMax + 2);
        for (let L = lagMin; L <= lagMax; L++) {
            const bpm = 60 * fps / L;
            const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.8, 2));
            const score = prior * (ac[L] + 0.5 * (ac[2 * L] || 0) + 0.25 * (ac[4 * L] || 0));
            scores[L] = score;
            if (score > bestScore) { bestScore = score; best = L; }
        }
        // parabolic refinement
        let P = best;
        if (best > lagMin && best < lagMax) {
            const a = scores[best - 1], b = scores[best], c = scores[best + 1];
            const d = a - 2 * b + c;
            if (d < 0) P = best + 0.5 * (a - c) / d;
        }
        let bpm = 60 * fps / P;
        while (bpm < 72) bpm *= 2;
        while (bpm > 185) bpm /= 2;
        return bpm;
    }
    // The constant tempo and phase whose beat grid lands on the most onsets.
    function fitGrid(env, fps, bpm0, fixed) {
        const n = env.length;
        const at = (t) => {
            const i = Math.floor(t);
            if (i < 0 || i + 1 >= n) return 0;
            const f = t - i;
            return env[i] * (1 - f) + env[i + 1] * f;
        };
        let best = { bpm: bpm0, phase: 0, score: -1 };
        const candidates = [];
        if (fixed) candidates.push(bpm0);
        else for (let b = bpm0 * 0.985; b <= bpm0 * 1.015; b += 0.02) candidates.push(b);
        for (const bpm of candidates) {
            const P = 60 * fps / bpm;
            for (let phase = 0; phase < P; phase += 0.5) {
                let s = 0, count = 0;
                for (let t = phase; t < n; t += P) {
                    s += at(t) + 0.35 * at(t + P / 2);
                    count++;
                }
                s /= Math.max(1, count);
                // tracks are usually made at a whole BPM
                const whole = Math.abs(bpm - Math.round(bpm)) < 0.04 ? 1.004 : 1;
                if (s * whole > best.score) best = { bpm, phase, score: s * whole };
            }
        }
        if (!fixed && Math.abs(best.bpm - Math.round(best.bpm)) < 0.06) best.bpm = Math.round(best.bpm);
        return best;
    }

    // ------------------------------------------------------------ pitch
    async function pitchFeatures(x, progress) {
        const maxBin = Math.round(5200 / (SR / 4096));
        const HOP = 512;
        const S = await spectrogram(x, 4096, HOP, maxBin, progress, 0.32, 0.62);
        const { frames, bins, data } = S;
        const L = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) L[i] = Math.log(1 + 30 * data[i]);
        // Drum-suppressed ("harmonic") spectrogram: median of 5 frames in time for every bin.
        const H = new Float32Array(L.length);
        const w = new Float32Array(5);
        for (let f = 0; f < frames; f++) {
            for (let k = 0; k < bins; k++) {
                for (let j = -2; j <= 2; j++) {
                    const g = Math.min(frames - 1, Math.max(0, f + j));
                    w[j + 2] = L[g * bins + k];
                }
                // median of five
                let a = w[0], b = w[1], c = w[2], d = w[3], e = w[4], t;
                if (a > b) { t = a; a = b; b = t; } if (d > e) { t = d; d = e; e = t; } if (a > d) { t = a; a = d; d = t; t = b; b = e; e = t; }
                if (c > b) { if (b < d) { if (c < d) H[f * bins + k] = c; else H[f * bins + k] = d; } else { if (c < b) H[f * bins + k] = c; else H[f * bins + k] = b; } }
                else { if (c > d) { if (c < b) H[f * bins + k] = c; else H[f * bins + k] = b; } else { if (b < d) H[f * bins + k] = b; else H[f * bins + k] = d; } }
            }
            if (f % 400 == 0) { progress(0.62 + 0.06 * f / frames); await tick(); }
        }
        // The bass gets a longer filter (9 frames, about 0.2 s): kicks and other short
        // low hits drop out, held bass notes stay.
        const bassBins = Math.min(bins, Math.round(720 / S.binHz) + 2);
        const HB = new Float32Array(frames * bassBins);
        const nine = new Float32Array(9);
        for (let f = 0; f < frames; f++) {
            for (let k = 0; k < bassBins; k++) {
                for (let j = -4; j <= 4; j++) nine[j + 4] = L[Math.min(frames - 1, Math.max(0, f + j)) * bins + k];
                // insertion sort of nine values
                for (let a = 1; a < 9; a++) { const v = nine[a]; let b = a - 1; while (b >= 0 && nine[b] > v) { nine[b + 1] = nine[b]; b--; } nine[b + 1] = v; }
                HB[f * bassBins + k] = nine[4];
            }
            if (f % 600 == 0) { progress(0.66 + 0.02 * f / frames); await tick(); }
        }
        // salience per MIDI note 24..96 by harmonic summation
        const M0 = 24, M1 = 96, NM = M1 - M0 + 1;
        const binOf = (hz) => hz / S.binHz;
        const sal = new Float32Array(frames * NM);
        const bassSal = new Float32Array(frames * NM);
        const taps = [], bassTaps = [];
        for (let m = M0; m <= M1; m++) {
            const list = [], blist = [];
            for (let h = 1; h <= 8; h++) {
                const b = binOf(midiHz(m) * h);
                if (b >= bins - 2) break;
                list.push([b, Math.pow(0.84, h - 1)]);
                // bass: the 2nd and 3rd harmonics count most, so a kick drum's lone sine tail does not pass for a bass note
                if (h <= 4 && midiHz(m) * h < 700) blist.push([b, [0.7, 1, 0.75, 0.5][h - 1]]);
            }
            taps.push(list);
            bassTaps.push(blist);
        }
        const read = (row, b) => { const i = Math.floor(b), f = b - i; return H[row + i] * (1 - f) + H[row + i + 1] * f; };
        const readBass = (row, b) => { const i = Math.floor(b), f = b - i; return i + 1 < bassBins ? HB[row + i] * (1 - f) + HB[row + i + 1] * f : 0; };
        for (let f = 0; f < frames; f++) {
            const row = f * bins;
            for (let m = 0; m < NM; m++) {
                let s = 0;
                for (const [b, wt] of taps[m]) s += read(row, b) * wt;
                sal[f * NM + m] = s;
                let bs = 0;
                const brow = f * bassBins;
                for (const [b, wt] of bassTaps[m]) bs += readBass(brow, b) * wt;
                bassSal[f * NM + m] = bs;
            }
            if (f % 400 == 0) { progress(0.68 + 0.08 * f / frames); await tick(); }
        }
        // chroma and the bass-band energy
        const chroma = new Float32Array(frames * 12);
        const bassEnergy = new Float32Array(frames);
        const lo = Math.round(55 / S.binHz), hi = Math.round(2500 / S.binHz);
        const blo = Math.round(40 / S.binHz), bhi = Math.round(250 / S.binHz);
        for (let f = 0; f < frames; f++) {
            const row = f * bins;
            for (let k = lo; k <= hi; k++) {
                const midi = 69 + 12 * Math.log2(k * S.binHz / 440);
                const near = Math.round(midi);
                const weight = Math.max(0, 1 - 2 * Math.abs(midi - near));
                chroma[f * 12 + ((near % 12) + 12) % 12] += H[row + k] * weight;
            }
            let e = 0;
            for (let k = blo; k <= bhi; k++) e += HB[f * bassBins + k];
            bassEnergy[f] = e / (bhi - blo + 1);
        }
        // frame f is centred on (f * HOP + 2048) / SR seconds
        const frameAt = (sec) => (sec * SR - 2048) / HOP;
        return { frames, fps: SR / HOP, frameAt, sal, bassSal, NM, M0, chroma, bassEnergy, H: HB, bins: bassBins, binHz: S.binHz };
    }
    function trackBass(P, sensitivity, O) {
        const { frames, bassSal, NM, M0, bassEnergy } = P;
        // how "kicky" each frame is: a strong low-band onset in the last 0.15 s
        const kick = new Float32Array(frames);
        if (O) {
            const scale = percentile(O.low, 0.95) || 1;
            for (let f = 0; f < frames; f++) {
                const t = (f * 512 + 2048) / SR;
                let mx = 0;
                for (let g = Math.max(0, Math.floor((t - 0.15) * O.fps)); g <= Math.min(O.frames - 1, Math.ceil(t * O.fps)); g++) mx = Math.max(mx, O.low[g]);
                kick[f] = Math.min(1, mx / scale);
            }
        }
        const pitch = new Int16Array(frames).fill(-1);
        const strength = new Float32Array(frames);
        const thr = Math.min(percentile(bassEnergy, 0.3) + (percentile(bassEnergy, 0.9) - percentile(bassEnergy, 0.3)) * (0.32 - 0.25 * sensitivity), percentile(bassEnergy, 0.9) * 0.6);
        const fundamental = (f, m) => {
            const b = midiHz(m) / P.binHz, i = Math.floor(b), fr = b - i, row = f * P.bins;
            return P.H[row + i] * (1 - fr) + P.H[row + i + 1] * fr;
        };
        for (let f = 0; f < frames; f++) {
            if (bassEnergy[f] < thr) continue;
            let best = -1, bestS = 0;
            for (let m = 28; m <= 55; m++) {
                let s = bassSal[f * NM + m - M0];
                // right after a kick, its low thump is not a bass note
                if (m <= 37) s *= 1 - 0.55 * kick[f];
                if (s > bestS) { bestS = s; best = m; }
            }
            if (best < 0) continue;
            // octave check: the lower octave wins only when its own fundamental is really there
            if (best - 12 >= 28 && bassSal[f * NM + best - 12 - M0] > 0.9 * bestS && fundamental(f, best - 12) > 0.75 * fundamental(f, best)) best -= 12;
            // a strong fifth below usually means we found the 3rd harmonic of a lower root
            else if (best - 19 >= 28 && fundamental(f, best - 19) > 0.9 * fundamental(f, best) && bassSal[f * NM + best - 19 - M0] > 0.85 * bestS) best -= 19;
            pitch[f] = best;
            strength[f] = bestS;
        }
        // median of three to remove single-frame jumps
        const out = Int16Array.from(pitch);
        for (let f = 1; f + 1 < frames; f++) {
            const a = pitch[f - 1], b = pitch[f], c = pitch[f + 1];
            if (a == c && a >= 0 && b != a) out[f] = a;
        }
        return { pitch: out, strength };
    }
    // Bass pitch in the time domain (YIN) on a low-passed, 8x decimated copy:
    // much finer pitch than a short FFT can give at 40-250 Hz.
    async function yinBass(x, P, O, sensitivity, progress) {
        // two-biquad Butterworth low-pass at 280 Hz
        const biquad = (fc, q) => {
            const w = 2 * Math.PI * fc / SR, alpha = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + alpha;
            return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: -2 * c / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
        };
        const run = (f, v) => { const y = f.b0 * v + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2; f.x2 = f.x1; f.x1 = v; f.y2 = f.y1; f.y1 = y; return y; };
        const f1 = biquad(280, 0.5412), f2 = biquad(280, 1.3066);
        const D = 8, sr = SR / D;
        const y = new Float32Array(Math.floor(x.length / D));
        for (let i = 0, j = 0; i < x.length; i++) {
            const v = run(f2, run(f1, x[i]));
            if (i % D == 0 && j < y.length) y[j++] = v;
        }
        const W = Math.round(sr * 0.075), tauMin = Math.floor(sr / 260), tauMax = Math.ceil(sr / 38);
        // The kick drum's own low tone: measured just after the strongest kicks. When the
        // kicks agree on a pitch it is notched out, so a long 808 / 909 tail is not read as the bass.
        const yinAt = (start, len) => {
            if (start < 0 || start + len + tauMax >= y.length) return 0;
            let sum = 0, best = -1, bestV = 1e9;
            for (let tau = 1; tau <= tauMax; tau++) {
                let acc = 0;
                for (let j = 0; j < len; j++) { const q = y[start + j] - y[start + j + tau]; acc += q * q; }
                sum += acc;
                const v = sum > 0 ? acc * tau / sum : 1;
                if (tau >= tauMin && v < bestV) { bestV = v; best = tau; }
            }
            return bestV < 0.3 && best > 0 ? sr / best : 0;
        };
        const lowScale0 = percentile(O.low, 0.95) || 1;
        const kickHz = [];
        for (let g = 1; g + 1 < O.frames && kickHz.length < 64; g++) {
            if (O.low[g] > 0.7 * lowScale0 && O.low[g] >= O.low[g - 1] && O.low[g] >= O.low[g + 1]) {
                const hz = yinAt(Math.round((g / O.fps + 0.14) * sr), Math.round(sr * 0.14));
                if (hz > 30 && hz < 90) kickHz.push(hz);
            }
        }
        kickHz.sort((a, b) => a - b);
        let notchHz = 0;
        if (kickHz.length >= 4) {
            // the most common pitch (within 4%): other notes ringing under some kicks do not count
            let bestCount = 0, bestHz = 0;
            for (const hz of kickHz) {
                const near = kickHz.filter(other => Math.abs(other / hz - 1) < 0.04);
                if (near.length > bestCount) { bestCount = near.length; bestHz = near[Math.floor(near.length / 2)]; }
            }
            if (bestCount >= 0.4 * kickHz.length) notchHz = bestHz;
        }
        if (notchHz > 0) {
            const w = 2 * Math.PI * notchHz / sr, q = 5, alpha = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + alpha;
            const n = { b0: 1 / a0, b1: -2 * c / a0, b2: 1 / a0, a1: -2 * c / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
            for (let i = 0; i < y.length; i++) y[i] = run(n, y[i]);
        }
        const frames = P.frames;
        const pitch = new Int16Array(frames).fill(-1);
        const conf = new Float32Array(frames);
        const rms = new Float32Array(frames);
        const d = new Float64Array(tauMax + 2);
        for (let f = 0; f < frames; f++) {
            const t = (f * 512 + 2048) / SR;
            const start = Math.round(t * sr - W / 2);
            if (start < 0 || start + W + tauMax >= y.length) continue;
            let e = 0;
            for (let j = 0; j < W; j++) e += y[start + j] * y[start + j];
            rms[f] = Math.sqrt(e / W);
            let sum = 0, best = -1;
            d[0] = 1;
            for (let tau = 1; tau <= tauMax; tau++) {
                let acc = 0;
                for (let j = 0; j < W; j++) { const q = y[start + j] - y[start + j + tau]; acc += q * q; }
                sum += acc;
                d[tau] = sum > 0 ? acc * tau / sum : 1;
            }
            for (let tau = tauMin; tau < tauMax; tau++) if (d[tau] < 0.2 && d[tau] <= d[tau + 1] && d[tau] <= d[tau - 1]) { best = tau; break; }
            if (best < 0) {
                let mn = 1e9;
                for (let tau = tauMin; tau <= tauMax; tau++) if (d[tau] < mn) { mn = d[tau]; best = tau; }
            }
            const a = d[best - 1], b = d[best], c = d[best + 1];
            const den = a - 2 * b + c;
            const tau = den > 0 ? best + 0.5 * (a - c) / den : best;
            pitch[f] = Math.round(69 + 12 * Math.log2(sr / tau / 440));
            conf[f] = 1 - Math.min(1, b);
            if (f % 600 == 0) { progress(0.76 + 0.04 * f / frames); await tick(); }
        }
        // voicing: loud enough and periodic, and not a kick drum's ringing tail
        // "loud enough" is measured against the loud parts of the song (about 18 dB below them)
        const loud = percentile(rms, 0.9) * (0.2 - 0.14 * sensitivity);
        const lowScale = percentile(O.low, 0.95) || 1;
        const out = new Int16Array(frames).fill(-1);
        const strength = new Float32Array(frames);
        for (let f = 0; f < frames; f++) {
            if (pitch[f] < 28 || pitch[f] > 57 || rms[f] < loud || conf[f] < 0.45) continue;
            const t = (f * 512 + 2048) / SR;
            let kick = 0;
            for (let g = Math.max(0, Math.floor((t - 0.14) * O.fps)); g <= Math.min(O.frames - 1, Math.ceil((t + 0.03) * O.fps)); g++) kick = Math.max(kick, O.low[g] / lowScale);
            // frames under a kick drum are unreliable: leave them to the neighbours
            if (kick > 0.35 && (pitch[f] <= 37 || kick > 0.7)) continue;
            out[f] = pitch[f];
            strength[f] = rms[f] * conf[f];
        }
        // median of three
        const smooth = Int16Array.from(out);
        for (let f = 1; f + 1 < frames; f++) if (out[f - 1] == out[f + 1] && out[f - 1] >= 0 && out[f] != out[f - 1]) smooth[f] = out[f - 1];
        return { pitch: smooth, strength, kickHz: notchHz };
    }
    // Lead melody: Viterbi over notes 52..88 plus "silent", on normalized salience.
    async function trackMelody(P, bass, sensitivity, progress) {
        const { frames, sal, NM, M0 } = P;
        const lo = 52, hi = 88, S = hi - lo + 1;
        // voicing: frames whose strongest melody-range note is loud enough
        const frameMaxes = new Float32Array(frames);
        for (let f = 0; f < frames; f++) {
            let mx = 0;
            for (let s = 0; s < S; s++) mx = Math.max(mx, sal[f * NM + lo + s - M0]);
            frameMaxes[f] = mx;
        }
        const gate = percentile(frameMaxes, 0.15 + 0.35 * (1 - sensitivity));
        const top = percentile(frameMaxes, 0.98) || 1;
        let score = new Float64Array(S + 1), next = new Float64Array(S + 1);
        const back = new Int16Array(frames * (S + 1));
        const emit = new Float64Array(S + 1);
        for (let f = 0; f < frames; f++) {
            const b = bass.pitch[f];
            const frameMax = frameMaxes[f] || 1e-9;
            // salience peaks in this frame
            const val = (m) => m >= M0 && m < M0 + NM ? sal[f * NM + m - M0] : 0;
            let topPeak = -1;
            for (let m = hi; m >= lo; m--) {
                const v = val(m);
                // the highest real peak (not an overtone of a peak an octave below)
                if (v >= val(m - 1) && v >= val(m + 1) && v >= 0.42 * frameMax && val(m - 12) < 0.6 * v && val(m - 19) < 0.7 * v) { topPeak = m; break; }
            }
            for (let s = 0; s < S; s++) {
                const m = lo + s;
                // pitch choice relative to this frame, plus a little absolute loudness
                let e = 0.75 * val(m) / frameMax + 0.25 * val(m) / top;
                // an overtone of a stronger lower note is not the melody
                if (val(m - 12) > 0.75 * val(m) || val(m - 19) > 0.85 * val(m)) e *= 0.55;
                // the bass's own overtones are not the melody either
                if (b >= 0) {
                    const d = m - b;
                    if (d == 12 || d == 19 || d == 24 || d == 28 || d == 31 || d == 36) e *= 0.6;
                    if (d < 5) e *= 0.5;
                }
                // the melody is usually the top voice
                e *= 1 + 0.004 * s;
                if (m == topPeak) e *= 1.45;
                emit[s] = e;
            }
            emit[S] = frameMax < gate ? 1.2 : 0.35;
            for (let s = 0; s <= S; s++) {
                let best = -1e9, arg = 0;
                for (let r = 0; r <= S; r++) {
                    let cost;
                    if (r == S && s == S) cost = 0;
                    else if (r == S || s == S) cost = 0.22;
                    else {
                        const d = Math.abs(r - s);
                        cost = d == 0 ? 0 : d <= 12 ? 0.05 + d * 0.025 : 1.2;
                    }
                    const v = score[r] - cost;
                    if (v > best) { best = v; arg = r; }
                }
                next[s] = best + emit[s];
                back[f * (S + 1) + s] = arg;
            }
            const tmp = score; score = next; next = tmp;
            // keep the numbers small
            let mx = -1e9;
            for (let s = 0; s <= S; s++) mx = Math.max(mx, score[s]);
            for (let s = 0; s <= S; s++) score[s] -= mx;
            if (f % 300 == 0) { progress(0.76 + 0.1 * f / frames); await tick(); }
        }
        let state = 0;
        for (let s = 1; s <= S; s++) if (score[s] > score[state]) state = s;
        const pitch = new Int16Array(frames);
        for (let f = frames - 1; f >= 0; f--) {
            pitch[f] = state == S ? -1 : lo + state;
            state = back[f * (S + 1) + state];
        }
        return { pitch };
    }
    // Inner voice: the strongest note between bass and lead that is neither.
    function trackInner(P, bass, lead, sensitivity) {
        const { frames, sal, NM, M0 } = P;
        const pitch = new Int16Array(frames).fill(-1);
        const top = percentile(sal, 0.99) || 1;
        const thr = 0.52 - 0.22 * sensitivity;
        for (let f = 0; f < frames; f++) {
            const b = bass.pitch[f], l = lead.pitch[f];
            let best = -1, bestS = 0;
            for (let m = 45; m <= 76; m++) {
                if (l >= 0 && (Math.abs(m - l) <= 2 || Math.abs(m - l) == 12)) continue;
                if (b >= 0 && ((m - b) % 12 == 0 || m - b == 19 || m - b == 7)) continue;
                if (l >= 0 && m > l) continue;
                const s = sal[f * NM + m - M0];
                if (s > bestS) { bestS = s; best = m; }
            }
            if (best >= 0 && bestS / top > thr) pitch[f] = best;
        }
        return { pitch };
    }
    // ------------------------------------------------------------ key and chords
    const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    function detectKey(total) {
        const corr = (profile, shift) => {
            let mx = 0, my = 0;
            for (let i = 0; i < 12; i++) { mx += total[(i + shift) % 12]; my += profile[i]; }
            mx /= 12; my /= 12;
            let num = 0, dx = 0, dy = 0;
            for (let i = 0; i < 12; i++) {
                const a = total[(i + shift) % 12] - mx, b = profile[i] - my;
                num += a * b; dx += a * a; dy += b * b;
            }
            return num / Math.sqrt(dx * dy || 1);
        };
        let best = { key: 0, minor: false, r: -2 };
        for (let k = 0; k < 12; k++) {
            const a = corr(KS_MAJOR, k), b = corr(KS_MINOR, k);
            if (a > best.r) best = { key: k, minor: false, r: a };
            if (b > best.r) best = { key: k, minor: true, r: b };
        }
        return best;
    }
    function chordScore(chroma, total, root, minor, scale) {
        const third = (root + (minor ? 3 : 4)) % 12, fifth = (root + 7) % 12;
        let s = (chroma[root] * 1.0 + chroma[third] * 0.85 + chroma[fifth] * 0.75) / total;
        // penalty for strong notes that do not belong to the chord
        for (let pc = 0; pc < 12; pc++) if (pc != root && pc != third && pc != fifth) s -= chroma[pc] / total * 0.12;
        if (scale.indexOf(root) != -1 && scale.indexOf(third) != -1 && scale.indexOf(fifth) != -1) s += 0.04;
        return s;
    }
    function chordAt(chroma, key, previous = null, bassPcs = null) {
        let total = 0;
        for (const v of chroma) total += v;
        if (total <= 1e-6) return null;
        const majorScale = [0, 2, 4, 5, 7, 9, 11], minorScale = [0, 2, 3, 5, 7, 8, 10];
        const scale = (key.minor ? minorScale : majorScale).map(i => (i + key.key) % 12);
        let best = null, bestScore = -1e9;
        for (let root = 0; root < 12; root++) {
            for (const minor of [false, true]) {
                let s = chordScore(chroma, total, root, minor, scale);
                // the bass usually plays the root
                if (bassPcs) s += 0.3 * bassPcs[root];
                if (s > bestScore) { bestScore = s; best = { root, minor, score: s }; }
            }
        }
        // hysteresis: stay on the previous chord unless the new one is clearly better
        if (previous && (best.root != previous.root || best.minor != previous.minor)) {
            const stay = chordScore(chroma, total, previous.root, previous.minor, scale) + (bassPcs ? 0.3 * bassPcs[previous.root] : 0);
            if (stay > best.score - 0.008) return { root: previous.root, minor: previous.minor, score: stay };
        }
        return best;
    }

    // ------------------------------------------------------------ main analysis
    // mono: Float32Array at 22050 Hz. Returns everything needed to write the song.
    async function analyze(mono, options, progress = () => { }) {
        const opts = Object.assign({ drums: 0.5, notes: 0.5, bpm: 0, beatsPerBar: 4, chordEvery: 2 }, options);
        progress(0.01, "Listening for the beat");
        const O = await onsetFeatures(mono, (v) => progress(v, "Listening for the beat"));
        const bpm0 = opts.bpm > 0 ? opts.bpm : estimateTempo(O.env, O.fps);
        const grid = fitGrid(O.env, O.fps, bpm0, opts.bpm > 0);
        const beatFrames = 60 * O.fps / grid.bpm;
        progress(0.32, "Following the bass and the melody");
        const Pf = await pitchFeatures(mono, (v) => progress(v, "Following the bass and the melody"));
        const salienceBass = trackBass(Pf, opts.notes, O);
        const yin = await yinBass(mono, Pf, O, opts.notes, (v) => progress(v, "Following the bass"));
        // YIN for the pitch where it is sure, the spectrum where it is not
        const bass = { pitch: new Int16Array(Pf.frames).fill(-1), strength: new Float32Array(Pf.frames) };
        for (let f = 0; f < Pf.frames; f++) {
            const a = yin.pitch[f], b = salienceBass.pitch[f];
            if (a >= 0) { bass.pitch[f] = (b >= 0 && Math.abs(a - b) == 12) ? Math.min(a, b) + 12 * (a > b ? 1 : 0) : a; bass.strength[f] = yin.strength[f]; }
            else if (b >= 0 && opts.notes > 0.6) { bass.pitch[f] = b; bass.strength[f] = salienceBass.strength[f] * 0.5; }
        }
        const lead = await trackMelody(Pf, bass, opts.notes, (v) => progress(v, "Following the melody"));
        const inner = trackInner(Pf, bass, lead, opts.notes);
        progress(0.88, "Finding the key, the chords and the bars");
        // beats in seconds
        const beatSec = 60 / grid.bpm;
        const firstBeat = grid.phase / O.fps;
        const duration = mono.length / SR;
        const beats = [];
        for (let t = firstBeat; t < duration; t += beatSec) beats.push(t);
        const onsetAt = (arr, sec, width = 0.35) => {
            const center = sec * O.fps, half = width * beatFrames / 4;
            let mx = 0;
            for (let f = Math.max(0, Math.floor(center - half)); f <= Math.min(O.frames - 1, Math.ceil(center + half)); f++) mx = Math.max(mx, arr[f]);
            return mx;
        };
        const chromaBetween = (a, b) => {
            const out = new Float64Array(12);
            const f0 = Math.max(0, Math.round(Pf.frameAt(a))), f1 = Math.min(Pf.frames - 1, Math.round(Pf.frameAt(b)) - 1);
            for (let f = f0; f <= f1; f++) for (let i = 0; i < 12; i++) out[i] += Pf.chroma[f * 12 + i];
            return out;
        };
        // downbeat: kicks and chord changes on beat 1, snares on 2 and 4, and
        // songs usually start on a downbeat
        const bpb = opts.beatsPerBar;
        const firstSoundSec = (() => { const thr = percentile(O.env, 0.8); for (let f = 0; f < O.frames; f++) if (O.env[f] > thr) return f / O.fps; return 0; })();
        const firstBeatIndex = Math.max(0, Math.round((firstSoundSec - firstBeat) / beatSec));
        const change = [];
        const half = Math.max(1, Math.floor(bpb / 2));
        for (let i = 0; i < beats.length; i++) {
            if (i < half || i + half >= beats.length) { change.push(0); continue; }
            const a = chromaBetween(beats[i - half], beats[i]), b = chromaBetween(beats[i], beats[i + half]);
            let dot = 0, na = 0, nb = 0;
            for (let k = 0; k < 12; k++) { dot += a[k] * b[k]; na += a[k] * a[k]; nb += b[k] * b[k]; }
            change.push(1 - dot / Math.sqrt(na * nb || 1));
        }
        const changeScale = percentile(change, 0.9) || 1, lowScale = percentile(beats.map(t => onsetAt(O.low, t)), 0.9) || 1, midScale = percentile(beats.map(t => onsetAt(O.mid, t)), 0.9) || 1;
        let downbeat = 0, downScore = -1e9;
        for (let d = 0; d < bpb; d++) {
            let s = 0, n = 0;
            for (let i = 0; i < beats.length; i++) {
                const pos = ((i - d) % bpb + bpb) % bpb;
                if (pos == 0) {
                    s += onsetAt(O.low, beats[i]) / lowScale + 1.4 * change[i] / changeScale;
                    n++;
                }
                if (bpb == 4 && (pos == 1 || pos == 3)) s += 0.25 * onsetAt(O.mid, beats[i]) / midScale;
            }
            s /= Math.max(1, n);
            if (((firstBeatIndex - d) % bpb + bpb) % bpb == 0) s += 0.6;
            if (s > downScore) { downScore = s; downbeat = d; }
        }
        // bar 0 starts on the first downbeat (a pickup before it gets its own bar)
        let startBeat = downbeat;
        if (beats[startBeat] != undefined && firstSoundSec < beats[startBeat] - beatSec * 0.5) startBeat -= bpb;
        const barSec = beatSec * bpb;
        const startSec = firstBeat + startBeat * beatSec;
        const bars = Math.max(1, Math.min(opts.maxBars || 512, Math.ceil((duration - startSec) / barSec)));
        const stepsPerBar = bpb * 4, stepSec = beatSec / 4;
        const steps = bars * stepsPerBar;
        const stepTime = (s) => startSec + s * stepSec;
        // key
        const total = new Float64Array(12);
        for (let f = 0; f < Pf.frames; f++) for (let i = 0; i < 12; i++) total[i] += Pf.chroma[f * 12 + i];
        const key = detectKey(total);
        // chords per half bar (or bar), twice: the chords then refine the key
        const chordSteps = opts.chordEvery == 1 ? stepsPerBar : opts.chordEvery == 3 ? 4 : stepsPerBar / 2;
        let chords = findChords(key);
        const voted = keyFromChords(chords, key);
        if (voted.key != key.key || voted.minor != key.minor) {
            key.key = voted.key;
            key.minor = voted.minor;
            chords = findChords(key);
        }
        function keyFromChords(list, fallback) {
            const found = list.filter(c => c.chord);
            if (found.length < 4) return fallback;
            let best = { key: fallback.key, minor: fallback.minor, score: -1e9 };
            for (let k = 0; k < 12; k++) {
                for (const minor of [false, true]) {
                    const steps7 = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
                    const quality = minor ? [true, null, false, true, true, false, false] : [false, true, true, false, false, true, null];
                    let s = 0;
                    for (const c of found) {
                        const degree = steps7.indexOf((c.chord.root - k + 12) % 12);
                        const fits = degree != -1 && quality[degree] !== null && quality[degree] == c.chord.minor;
                        s += fits ? 1 : -0.6;
                        if (degree == 0 && c.chord.minor == minor) s += 0.8;
                    }
                    if (found[0].chord.root == k && found[0].chord.minor == minor) s += 1;
                    if (k == fallback.key && minor == fallback.minor) s += 1.5;
                    if (s > best.score) best = { key: k, minor, score: s };
                }
            }
            return best;
        }
        function findChords(key) {
        const chords = [];
        let previous = null;
        for (let s = 0; s < steps; s += chordSteps) {
            // share of each pitch class in the bass during this chord
            const bassPcs = new Float64Array(12);
            let bassTotal = 0;
            for (let f = Math.max(0, Math.round(Pf.frameAt(stepTime(s)))); f < Math.min(Pf.frames, Math.round(Pf.frameAt(stepTime(s + chordSteps)))); f++) {
                // the spectral bass track is the better judge of a chord's root
                const m = salienceBass.pitch[f];
                if (m >= 0) { bassPcs[m % 12] += salienceBass.strength[f] || 1; bassTotal += salienceBass.strength[f] || 1; }
            }
            if (bassTotal > 0) for (let i = 0; i < 12; i++) bassPcs[i] /= bassTotal;
            const c = chordAt(chromaBetween(stepTime(s), stepTime(s + chordSteps)), key, previous, bassTotal > 0 ? bassPcs : null);
            chords.push({ step: s, length: chordSteps, chord: c });
            if (c) previous = c;
        }
        return chords;
        }
        // ---- drums on the 16th grid
        const drumSteps = [];
        const kickVals = [], snareVals = [], hatVals = [];
        for (let s = 0; s < steps; s++) {
            const t = stepTime(s);
            const low = onsetAt(O.low, t), body = onsetAt(O.body, t), mid = onsetAt(O.mid, t), high = onsetAt(O.high, t), broad = onsetAt(O.midBroad, t), tonal = onsetAt(O.tonal, t);
            kickVals.push(Math.max(0, low - 0.25 * mid));
            snareVals.push(Math.max(0, (mid * (0.4 + broad) + 0.4 * body) - 0.35 * tonal));
            hatVals.push(Math.max(0, high - 0.2 * low));
        }
        const thresholdFor = (vals, k) => {
            const med = percentile(vals, 0.5), p90 = percentile(vals, 0.92);
            return med + (p90 - med) * k;
        };
        const sens = Math.max(0, Math.min(1, opts.drums));
        const kThr = thresholdFor(kickVals, 0.62 - 0.45 * sens), sThr = thresholdFor(snareVals, 0.66 - 0.45 * sens), hThr = thresholdFor(hatVals, 0.55 - 0.45 * sens);
        const peak = (vals, s) => vals[s] >= (vals[s - 1] || 0) && vals[s] >= (vals[s + 1] || 0);
        for (let s = 0; s < steps; s++) {
            const hits = [];
            const size = (v, thr) => v > thr * 2.2 ? 3 : v > thr * 1.4 ? 2 : 1;
            if (kickVals[s] > kThr && peak(kickVals, s)) hits.push(["kick", size(kickVals[s], kThr)]);
            if (snareVals[s] > sThr && peak(snareVals, s)) hits.push(["snare", size(snareVals[s], sThr)]);
            if (hatVals[s] > hThr && peak(hatVals, s)) {
                // open hat: the highs keep ringing for an 8th note or more
                const f0 = Math.round(stepTime(s) * O.fps);
                const f1 = Math.round((stepTime(s) + stepSec * 2) * O.fps);
                const ring = O.highEnergy[Math.min(O.frames - 1, f1)] / Math.max(1e-6, O.highEnergy[Math.min(O.frames - 1, f0 + 1)]);
                hits.push([ring > 0.88 ? "open" : "hat", size(hatVals[s], hThr)]);
            }
            if (hits.length) drumSteps.push({ step: s, hits });
        }
        // ---- pitched parts on the grid
        const quantize = (track, onset, minFrames = 0.5, fillGaps = false) => {
            const out = [];
            for (let s = 0; s < steps; s++) {
                const a = stepTime(s) - stepSec * 0.25, b = stepTime(s) + stepSec * 0.75;
                const f0 = Math.max(0, Math.round(Pf.frameAt(a))), f1 = Math.min(Pf.frames - 1, Math.round(Pf.frameAt(b)));
                const counts = new Map();
                let voiced = 0, n = 0;
                for (let f = f0; f <= f1; f++) {
                    n++;
                    const p = track.pitch[f];
                    if (p >= 0) { voiced++; counts.set(p, (counts.get(p) || 0) + 1); }
                }
                let best = -1, bestCount = 0;
                for (const [p, c] of counts) if (c > bestCount) { bestCount = c; best = p; }
                out.push(n > 0 && voiced / n >= minFrames ? best : -1);
            }
            // a one- or two-step gap between the same note (a kick covered it) is filled
            for (let s = 1; s + 1 < steps; s++) {
                if (out[s] >= 0) continue;
                if (out[s - 1] >= 0 && out[s - 1] == out[s + 1]) out[s] = out[s - 1];
                else if (s + 2 < steps && out[s + 1] < 0 && out[s - 1] >= 0 && out[s - 1] == out[s + 2] && fillGaps) { out[s] = out[s + 1] = out[s - 1]; }
            }
            // notes: runs of the same pitch, split where the part plays again
            const notes = [];
            for (let s = 0; s < steps;) {
                const p = out[s];
                if (p < 0) { s++; continue; }
                let e = s + 1;
                while (e < steps && out[e] == p && !(onset && onset(e))) e++;
                notes.push({ step: s, length: e - s, midi: p });
                s = e;
            }
            return notes.filter(n => n.length >= 1);
        };
        const bassOnsetThr = percentile(O.low, 0.9) * 0.6;
        const bassNotes = quantize(bass, (s) => onsetAt(O.low, stepTime(s)) > bassOnsetThr && onsetAt(O.body, stepTime(s)) > percentile(O.body, 0.75), 0.3, true);
        // frames under a kick are skipped, so a bass note that starts with the kick is
        // found a 16th late: move it back onto the kick
        for (let i = 0; i < bassNotes.length; i++) {
            const n = bassNotes[i];
            const before = i > 0 ? bassNotes[i - 1].step + bassNotes[i - 1].length : 0;
            if (n.step - 1 >= before && onsetAt(O.low, stepTime(n.step - 1)) > bassOnsetThr && !(onsetAt(O.low, stepTime(n.step)) > bassOnsetThr)) {
                n.step -= 1;
                n.length += 1;
            }
        }
        const tonalThr = percentile(O.tonal, 0.88);
        const leadNotes = quantize(lead, (s) => onsetAt(O.tonal, stepTime(s), 0.25) > tonalThr)
        const innerNotes = quantize(inner, null, 0.6).filter(n => n.length >= 2);
        progress(1, "Done");
        return {
            bpm: grid.bpm, bpmEstimate: bpm0, key, bars, kickHz: yin.kickHz, beatsPerBar: bpb, stepsPerBar, startSec, duration,
            drums: drumSteps, bass: bassNotes, lead: leadNotes, inner: innerNotes, chords,
            curves: { env: O.env, fps: O.fps },
        };
    }

    // ------------------------------------------------------------ writing
    const PRESETS = { lead: "3x Osc Square Lead", bass: "Boo Bass (3x Osc)", chords: "E-Piano (sampled)", inner: "Strings (sampled)", drums: "TR-909 Kit" };
    function toBars(notes, result, makePitches) {
        const bars = [];
        for (let b = 0; b < result.bars; b++) bars.push([]);
        const per = result.stepsPerBar, parts = Config.partsPerBeat / 4;
        for (const n of notes) {
            let step = n.step, left = n.length;
            while (left > 0) {
                const bar = Math.floor(step / per);
                if (bar >= result.bars) break;
                const inBar = step % per;
                const take = Math.min(left, per - inBar);
                const pitches = makePitches(n);
                if (pitches.length) bars[bar].push({ start: inBar * parts, end: (inBar + take) * parts, pitches, size: n.size == undefined ? Config.noteSizeMax : n.size });
                step += take;
                left -= take;
            }
        }
        return bars;
    }
    function chordVoicing(chord, previous) {
        const tones = [chord.root, (chord.root + (chord.minor ? 3 : 4)) % 12, (chord.root + 7) % 12];
        let best = null, bestCost = 1e9;
        for (let inv = 0; inv < 3; inv++) {
            const v = [];
            let last = -1;
            for (let k = 0; k < 3; k++) {
                const pc = tones[(k + inv) % 3];
                let m = pc + 12 * Math.floor((57 - pc) / 12);
                while (m <= last) m += 12;
                v.push(m);
                last = m;
            }
            const cost = previous ? v.reduce((s, m, k) => s + Math.abs(m - previous[k]), 0) : Math.abs(v[0] - 55);
            if (cost < bestCost) { bestCost = cost; best = v; }
        }
        return best;
    }
    async function writeSong(host, result, parts, mode, original) {
        const doc = host.doc;
        const synth = doc.synth;
        if (synth.playing) doc.performance.pause();
        if (mode == "new") {
            doc.goBackToStart();
            doc.record(new A.ChangeSong(doc, ""), false, true);
        }
        const song = doc.song;
        // tempo, key, meter
        doc.record(new A.ChangeTempo(doc, song.tempo, Math.round(result.bpm)));
        const keyIndex = Config.keys.findIndex(k => k.basePitch % 12 == result.key.key);
        if (keyIndex >= 0) doc.record(new A.ChangeKey(doc, keyIndex));
        const scaleIndex = Config.scales.findIndex(s => s.name == (result.key.minor ? "normal :(" : "normal :)"));
        if (scaleIndex >= 0) doc.record(new A.ChangeScale(doc, scaleIndex));
        if (song.beatsPerBar != result.beatsPerBar) doc.record(new A.ChangeBeatsPerBar(doc, result.beatsPerBar, "splice"));
        const basePitch = Config.keys[song.key].basePitch;
        const toPitch = (midi) => Math.max(0, Math.min(Config.maxPitch, midi - basePitch));
        const channelFor = (name, isNoise, preset) => {
            const added = A.carrotNewChannel(doc, isNoise);
            if (!added) return null;
            doc.record(added.group);
            const channel = added.index;
            A.carrotNameChannel(doc, channel, name);
            try {
                if (isNoise) {
                    const kits = A.FLSoundFactory.getKits().map(k => k.name);
                    A.FLActions.loadBuiltinKit(doc, kits.indexOf(preset) != -1 ? preset : kits[0]);
                }
                else {
                    const value = A.EditorConfig.nameToPresetValue(preset);
                    if (value != null) doc.record(new A.ChangePreset(doc, value));
                }
            }
            catch (error) { console.warn("AudioMidi: could not set the instrument", error); }
            return channel;
        };
        // In a new song, reuse its empty default channels.
        const freePitched = mode == "new" ? Array.from({ length: song.pitchChannelCount }, (_, i) => i) : [];
        const freeNoise = mode == "new" ? Array.from({ length: song.noiseChannelCount }, (_, i) => song.pitchChannelCount + i) : [];
        const take = (name, isNoise, preset) => {
            const list = isNoise ? freeNoise : freePitched;
            if (list.length > 0) {
                const channel = list.shift();
                doc.selection.setChannelBar(channel, 0);
                A.carrotNameChannel(doc, channel, name);
                if (isNoise) A.FLActions.loadBuiltinKit(doc, preset);
                else {
                    const value = A.EditorConfig.nameToPresetValue(preset);
                    if (value != null) doc.record(new A.ChangePreset(doc, value));
                }
                return channel;
            }
            return channelFor(name, isNoise, preset);
        };
        const written = [];
        const write = (channel, bars, label) => {
            if (channel == null) return;
            A.carrotWriteNotes(doc, bars, { channel, startBar: 0, replace: true, freshPatterns: true });
            written.push(label);
        };
        // pitched channels first (they shift the drum channels' numbers)
        if (parts.lead && result.lead.length) {
            const channel = take("Lead (AudioMidi)", false, PRESETS.lead);
            write(channel, toBars(result.lead, result, n => [toPitch(n.midi)]), "lead");
        }
        if (parts.inner && result.inner.length) {
            const channel = take("Inner voice (AudioMidi)", false, PRESETS.inner);
            write(channel, toBars(result.inner, result, n => [toPitch(n.midi)]), "inner voice");
        }
        if (parts.chords && result.chords.some(c => c.chord)) {
            let previous = null;
            const notes = [];
            for (let i = 0; i < result.chords.length; i++) {
                const c = result.chords[i];
                if (!c.chord) continue;
                // merge repeated chords into one long note
                let length = c.length;
                while (i + 1 < result.chords.length && result.chords[i + 1].chord && result.chords[i + 1].chord.root == c.chord.root && result.chords[i + 1].chord.minor == c.chord.minor) { length += result.chords[i + 1].length; i++; }
                const voicing = chordVoicing(c.chord, previous);
                previous = voicing;
                notes.push({ step: c.step, length, voicing, size: 2 });
            }
            const channel = take("Chords (AudioMidi)", false, PRESETS.chords);
            write(channel, toBars(notes, result, n => n.voicing.map(toPitch)), "chords");
        }
        if (parts.bass && result.bass.length) {
            const channel = take("Bass (AudioMidi)", false, PRESETS.bass);
            write(channel, toBars(result.bass, result, n => [toPitch(n.midi)]), "bass");
        }
        if (parts.drums && result.drums.length) {
            const channel = take("Drums (AudioMidi)", true, PRESETS.drums);
            if (channel != null) {
                const roles = A.CarrotIdeaGen.kitRoles(doc.song, channel);
                const row = (name) => (roles[name] && roles[name][0] != undefined) ? roles[name][0] : 0;
                const notes = [];
                for (const d of result.drums)
                    for (const [name, size] of d.hits)
                        notes.push({ step: d.step, length: 1, row: row(name == "kick" ? "kick" : name == "snare" ? "snare" : name == "open" ? "open" : "hat"), size });
                write(channel, toBars(notes, result, n => [n.row]), "drums");
            }
        }
        // the original, muted, for A/B listening
        if (parts.original && original) {
            try {
                const id = await A.FLSampleBank.addBytes(original.bytes, original.name);
                const added = A.carrotNewChannel(doc, false);
                if (added) {
                    doc.record(added.group);
                    const channel = added.index;
                    await A.FLActions.loadSample(doc, { id, name: original.name });
                    doc.record(new A.ChangeFL(doc, () => {
                        const ch = doc.song.channels[channel];
                        const instrument = ch.instruments[0];
                        instrument.fl.sampler.oneShot = true;
                        instrument.fl.sampler.keytrack = false;
                        ch.name = "Original audio (AudioMidi)";
                        ch.muted = true;
                    }));
                    // the audio starts where bar 0 starts (a negative start trims the beginning)
                    const parts24 = Config.partsPerBeat;
                    const offset = Math.round(-result.startSec / (60 / Math.round(result.bpm)) * parts24);
                    if (offset >= 0) A.carrotWriteNotes(doc, [[{ start: Math.min(offset, result.beatsPerBar * parts24 - 1), end: Math.min(result.beatsPerBar * parts24, offset + parts24), pitches: [48], size: 3 }]], { channel, startBar: 0, replace: true, freshPatterns: true });
                    else {
                        doc.record(new A.ChangeFL(doc, () => {
                            const sampler = doc.song.channels[channel].instruments[0].fl.sampler;
                            sampler.start = Math.min(0.95, result.startSec / Math.max(0.1, result.duration));
                        }));
                        A.carrotWriteNotes(doc, [[{ start: 0, end: parts24, pitches: [48], size: 3 }]], { channel, startBar: 0, replace: true, freshPatterns: true });
                    }
                    written.push("original (muted)");
                }
            }
            catch (error) {
                console.warn("AudioMidi: could not add the original audio", error);
            }
        }
        doc.selection.setChannelBar(0, 0);
        return written;
    }

    // ------------------------------------------------------------ decoding
    async function decodeFile(file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const ctx = new OfflineAudioContext(1, 1, SR);
        const buffer = await ctx.decodeAudioData(bytes.slice().buffer);
        const mono = new Float32Array(buffer.length);
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const data = buffer.getChannelData(c);
            for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
        }
        // normalize so thresholds behave the same for quiet and loud files
        let peak = 0;
        for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
        if (peak > 0) for (let i = 0; i < mono.length; i++) mono[i] /= peak;
        return { mono, bytes, seconds: buffer.duration, channels: buffer.numberOfChannels, name: file.name };
    }

    // ------------------------------------------------------------ UI
    function open(host) {
        const state = { file: null, result: null, busy: false };
        const params = host.params();
        const p = Object.assign({ drums: 0.5, notes: 0.5, length: 2, mode: 0, chordEvery: 0, bpm: 0, parts: { drums: true, bass: true, lead: true, chords: true, inner: true, original: true } }, params);
        Object.assign(params, p);
        if (!params.parts) params.parts = p.parts;
        const fileInput = HTML.input({ type: "file", accept: "audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.aif,.aiff", style: "display: none;" });
        const drop = HTML.div({ class: "cb-am-drop", tabindex: "0" }, HTML.b("Drop a song here (WAV, MP3, OGG, FLAC)"), HTML.span({ class: "cb-hint" }, "or click to choose a file. It stays on this computer."));
        const info = HTML.div({ class: "cb-hint", style: "min-height: 16px; margin-top: 6px;" });
        const bar = HTML.div({ class: "cb-am-progress" }, HTML.div());
        const stage = HTML.div({ class: "cb-hint", style: "min-height: 16px;" });
        const stats = HTML.div({ class: "cb-am-stats" });
        const canvas = CarrotUI.canvas(150);
        const drumsKnob = host.knob("drums", { label: "Drum sens.", min: 0, max: 1, def: 0.5, format: (v) => Math.round(v * 100) + "%", title: "Higher finds quieter hits (and more false ones)" });
        const notesKnob = host.knob("notes", { label: "Note sens.", min: 0, max: 1, def: 0.5, format: (v) => Math.round(v * 100) + "%", title: "Higher keeps quieter notes in the bass, lead and inner voice" });
        const lengthSelect = CarrotUI.select({ label: "Analyze", options: ["First 30 seconds", "First minute", "First 2 minutes", "First 4 minutes", "Whole file"], value: params.length, onChange: (v) => { params.length = v; } });
        const chordSelect = CarrotUI.select({ label: "Chords every", options: ["Half bar", "Bar", "Beat"], value: params.chordEvery, onChange: (v) => { params.chordEvery = v; } });
        const bpmInput = HTML.input({ type: "number", min: "0", max: "300", step: "0.1", value: params.bpm ? String(params.bpm) : "", placeholder: "auto", style: "width: 64px;" });
        for (const type of ["keydown", "keyup", "keypress"]) bpmInput.addEventListener(type, (e) => e.stopPropagation());
        bpmInput.addEventListener("input", () => { params.bpm = Math.max(0, Math.min(300, parseFloat(bpmInput.value) || 0)); });
        const modeSelect = CarrotUI.select({ label: "Write into", options: ["New channels in this song", "A new song (replaces this one, Z undoes)"], value: params.mode, onChange: (v) => { params.mode = v; } });
        const toggles = [["drums", "Drums"], ["bass", "Bass"], ["lead", "Lead"], ["chords", "Chords"], ["inner", "Inner voice"], ["original", "Original (muted)"]].map(([key, label]) =>
            CarrotUI.toggle({ label, value: params.parts[key] !== false, onChange: (v) => { params.parts[key] = v; } }));
        const analyzeButton = CarrotUI.button("Analyze", () => run(), { primary: true });
        const writeButton = CarrotUI.button("Write to song", () => write(), { primary: true });
        const playButton = CarrotUI.button("Play original", () => playOriginal());
        const stopButton = CarrotUI.button("Stop", () => A.FLSampleBank.stopPreview());
        writeButton.disabled = true;
        playButton.disabled = true;
        const setProgress = (v, text) => {
            bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + "%";
            if (text) stage.textContent = text + "...";
        };
        const pick = () => fileInput.click();
        drop.addEventListener("click", pick);
        drop.addEventListener("keydown", (e) => { if (e.key == "Enter" || e.key == " ") { e.preventDefault(); pick(); } });
        drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("cb-hover"); });
        drop.addEventListener("dragleave", () => drop.classList.remove("cb-hover"));
        drop.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            drop.classList.remove("cb-hover");
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) load(file);
        });
        fileInput.addEventListener("change", () => { const file = fileInput.files && fileInput.files[0]; fileInput.value = ""; if (file) load(file); });
        async function load(file) {
            if (state.busy) return;
            info.textContent = "Decoding " + file.name + "...";
            try {
                state.file = await decodeFile(file);
                state.result = null;
                writeButton.disabled = true;
                playButton.disabled = false;
                const m = Math.floor(state.file.seconds / 60), s = Math.round(state.file.seconds % 60);
                info.textContent = file.name + "  ·  " + m + ":" + String(s).padStart(2, "0") + "  ·  " + (state.file.channels > 1 ? "stereo" : "mono") + ". Press Analyze.";
                drawWave();
            }
            catch (error) {
                console.warn(error);
                info.textContent = "This file could not be decoded by your browser. Try a WAV or MP3.";
            }
        }
        function playOriginal() {
            if (!state.file) return;
            A.FLSampleBank.previewPcm(state.file.mono, SR, 0, 1, 1, 0.7);
        }
        async function run() {
            if (!state.file || state.busy) return;
            state.busy = true;
            analyzeButton.disabled = true;
            writeButton.disabled = true;
            const doc = host.doc;
            if (doc.synth.playing) doc.performance.pause();
            const limit = [30, 60, 120, 240, 1e9][params.length | 0];
            const mono = state.file.mono.subarray(0, Math.min(state.file.mono.length, Math.floor(limit * SR)));
            const t0 = performance.now();
            try {
                state.result = await analyze(mono, { drums: params.drums, notes: params.notes, bpm: params.bpm, chordEvery: [2, 1, 3][params.chordEvery | 0], maxBars: Config.barCountMax }, setProgress);
                const r = state.result;
                setProgress(1);
                stage.textContent = "Analyzed in " + ((performance.now() - t0) / 1000).toFixed(1) + " s. Check the numbers, then Write to song.";
                renderStats();
                drawWave();
                writeButton.disabled = false;
            }
            catch (error) {
                console.error(error);
                stage.textContent = "Analysis failed: " + (error.message || error);
            }
            state.busy = false;
            analyzeButton.disabled = false;
        }
        function renderStats() {
            const r = state.result;
            stats.innerHTML = "";
            const stat = (label, value) => stats.appendChild(HTML.div({ class: "cb-am-stat" }, HTML.small(label), HTML.b(value)));
            stat("Tempo", (Math.round(r.bpm * 10) / 10) + " BPM");
            stat("Key", NAMES[r.key.key] + (r.key.minor ? " minor" : " major"));
            stat("Bars", String(r.bars));
            const hits = r.drums.reduce((n, d) => n + d.hits.length, 0);
            stat("Drum hits", String(hits));
            stat("Bass notes", String(r.bass.length));
            stat("Lead notes", String(r.lead.length));
            stat("Inner notes", String(r.inner.length));
            const names = r.chords.filter(c => c.chord).slice(0, 8).map(c => NAMES[c.chord.root] + (c.chord.minor ? "m" : ""));
            stat("Chords", names.slice(0, 4).join(" ") || "-");
        }
        function drawWave() {
            const { ctx, w, h } = CarrotUI.ctx(canvas);
            ctx.fillStyle = "#0b0d12";
            ctx.fillRect(0, 0, w, h);
            if (!state.file) {
                ctx.fillStyle = "rgba(255,255,255,0.35)";
                ctx.font = "12px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("The waveform, beat grid and detected notes appear here", w / 2, h / 2 + 4);
                return;
            }
            const r = state.result;
            const limit = r ? r.duration : state.file.seconds;
            const mono = state.file.mono;
            const len = Math.min(mono.length, Math.floor(limit * SR));
            const mid = h * 0.22;
            ctx.fillStyle = "rgba(0,200,255,0.35)";
            for (let x = 0; x < w; x++) {
                const a = Math.floor(x / w * len), b = Math.floor((x + 1) / w * len);
                let mx = 0;
                for (let i = a; i < b; i += 4) mx = Math.max(mx, Math.abs(mono[i]));
                ctx.fillRect(x, mid - mx * mid * 0.9, 1, Math.max(1, mx * mid * 1.8));
            }
            if (!r) return;
            const secX = (s) => (s / limit) * w;
            const barSec = 60 / r.bpm * r.beatsPerBar, stepSec = 60 / r.bpm / 4;
            ctx.strokeStyle = "rgba(255,255,255,0.12)";
            for (let b = 0; b <= r.bars; b++) {
                const x = secX(r.startSec + b * barSec);
                ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
            }
            const lane = (top, height, notes, color, lo, hi) => {
                ctx.fillStyle = color;
                for (const n of notes) {
                    const x = secX(r.startSec + n.step * stepSec), x2 = secX(r.startSec + (n.step + n.length) * stepSec);
                    const y = top + height - (n.midi - lo) / Math.max(1, hi - lo) * height;
                    ctx.fillRect(x, y - 1, Math.max(1.5, x2 - x - 0.5), 2.5);
                }
            };
            lane(h * 0.48, h * 0.24, r.lead, "#ff7eb6", 52, 88);
            lane(h * 0.6, h * 0.2, r.inner, "#c3e88d", 45, 76);
            lane(h * 0.78, h * 0.18, r.bass, "#4fc3f7", 28, 55);
            ctx.fillStyle = "#ffcb6b";
            for (const d of r.drums) {
                const x = secX(r.startSec + d.step * stepSec);
                for (const [name] of d.hits) {
                    const y = name == "kick" ? h - 4 : name == "snare" ? h - 9 : h - 14;
                    ctx.fillRect(x, y, 1.5, 3);
                }
            }
        }
        async function write() {
            if (!state.result || state.busy) return;
            state.busy = true;
            writeButton.disabled = true;
            try {
                const written = await writeSong(host, state.result, params.parts, params.mode == 1 ? "new" : "add", params.parts.original ? state.file : null);
                stage.textContent = written.length ? "Wrote " + written.join(", ") + " at " + Math.round(state.result.bpm) + " BPM in " + NAMES[state.result.key.key] + (state.result.key.minor ? " minor" : " major") + ". Z undoes." : "Nothing to write: no notes were found.";
                A.flToast("AudioMidi: song written");
            }
            catch (error) {
                console.error(error);
                stage.textContent = "Writing failed: " + (error.message || error);
            }
            state.busy = false;
            writeButton.disabled = false;
        }
        const root = HTML.div(
            CarrotUI.hint("Experimental: AudioMidi listens to a song and writes its drums, bass, lead, chords and inner voice as notes, at the song's tempo and key. Expect a starting point to fix by ear, not a perfect copy: clear mixes with a steady beat work best."),
            HTML.div({ style: "height: 8px;" }), drop, fileInput, info,
            CarrotUI.section("Listen for", HTML.div({ class: "cb-row cb-center" }, ...toggles)),
            CarrotUI.section("Settings", HTML.div({ class: "cb-row cb-center" }, drumsKnob, notesKnob, lengthSelect, chordSelect, HTML.label({ class: "cb-field" }, "Tempo (BPM)", bpmInput), modeSelect)),
            bar, stage, stats, canvas,
            HTML.div({ class: "cb-row", style: "justify-content: flex-end; margin-top: 8px; gap: 6px;" }, playButton, stopButton, analyzeButton, writeButton));
        setTimeout(drawWave, 0);
        return root;
    }

    B.CarrotPlugins.register({
        id: "audiomidi",
        width: 720,
        defaultParams: () => ({}),
        open,
        // exposed for tests
        analyze, decodeFile, writeSong, SR,
    });
})();
