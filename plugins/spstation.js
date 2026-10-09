/*
 * SP Station - the plugin for the Roland SP-404MKII.
 *
 * A working copy of the device's top panel: 160 pads in 10 banks, sample modes
 * (BPM sync, gate, loop and ping-pong, reverse, roll), sample edit (start/end and
 * chop, pitch/speed and envelope, marks), sampling, resampling and skip-back
 * sampling, four effect buses with 44 effects and the six direct effect
 * buttons, the pattern sequencer (pattern select, realtime and TR-REC
 * recording, record settings, undo), DJ mode, hold, sub pad, mute bus,
 * external source with input effects, and every SHIFT + pad function
 * (fixed and 16 velocity, cue, chromatic, exchange, init, pad link, mute
 * groups, metronome, count-in, tap tempo, gain, utility, import/export,
 * pad and effect settings, projects).
 *
 * It talks to the device over USB MIDI (pads, banks, CTRL knobs, effect
 * switches, pattern changes, clock) and only works while an SP-404MKII is
 * connected. In a song it is an instrument: notes play pads, and patterns
 * can be written into the song.
 */
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const A = B.CarrotAPI;
    const { HTML, CarrotUI, CarrotDSP, CarrotSVF, FLSampleBank, Config } = A;

    const TWO_PI = Math.PI * 2;
    const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
    const ftanh = (x) => x <= -3 ? -1 : x >= 3 ? 1 : x * (27 + x * x) / (27 + 9 * x * x);
    const BANKS = "ABCDEFGHIJ";
    const KEEPALIVE = 84;            // the pitch that keeps the instrument awake while the panel plays
    // Pads are numbered like the device (1 = top left, 13 = bottom left). MIDI notes rise from pad 13.
    const slotOf = (label) => (3 - Math.floor((label - 1) / 4)) * 4 + ((label - 1) % 4);
    const labelOf = (slot) => (3 - Math.floor(slot / 4)) * 4 + (slot % 4) + 1;
    const padKey = (bank, label) => BANKS[bank] + label;
    const hw = () => A.CarrotHardware ? A.CarrotHardware.get() : null;
    // checked on every audio block and note (a handful of ports), so unplugging locks at once
    function deviceLive() {
        const h = hw();
        return !!(h && h.spConnected());
    }

    // ============================================================ OLED pixel font (5 x 7)
    const FONT = {
        " ": [0, 0, 0, 0, 0, 0, 0], "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14], "2": [14, 17, 1, 2, 4, 8, 31], "3": [31, 2, 4, 2, 1, 17, 14],
        "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14], "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8], "8": [14, 17, 17, 14, 17, 17, 14],
        "9": [14, 17, 17, 15, 1, 2, 12], A: [14, 17, 17, 17, 31, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
        E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
        J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17],
        O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30],
        T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
        Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31], "-": [0, 0, 0, 31, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12], ":": [0, 12, 12, 0, 12, 12, 0],
        "/": [0, 1, 2, 4, 8, 16, 0], "+": [0, 4, 4, 31, 4, 4, 0], "%": [24, 25, 2, 4, 8, 19, 3], "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8],
        "=": [0, 0, 31, 0, 31, 0, 0], ">": [8, 4, 2, 1, 2, 4, 8], "<": [2, 4, 8, 16, 8, 4, 2], "!": [4, 4, 4, 4, 0, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4],
        ",": [0, 0, 0, 0, 12, 4, 8], "#": [10, 10, 31, 10, 31, 10, 10], "_": [0, 0, 0, 0, 0, 0, 31], "*": [0, 4, 21, 14, 21, 4, 0], "&": [12, 18, 20, 8, 21, 18, 13],
        "'": [12, 4, 8, 0, 0, 0, 0], "[": [14, 8, 8, 8, 8, 8, 14], "]": [14, 2, 2, 2, 2, 2, 14], "|": [4, 4, 4, 4, 4, 4, 4], "~": [0, 0, 8, 21, 2, 0, 0],
        "▶": [16, 24, 28, 30, 28, 24, 16], "■": [0, 31, 31, 31, 31, 31, 0], "●": [0, 14, 31, 31, 31, 14, 0], "←": [0, 4, 8, 31, 8, 4, 0], "→": [0, 4, 2, 31, 2, 4, 0],
        "↑": [4, 14, 21, 4, 4, 4, 0], "↓": [0, 4, 4, 4, 21, 14, 4], "♪": [6, 5, 4, 4, 12, 28, 8],
    };
    class Oled {
        constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8Array(w * h); }
        clear() { this.px.fill(0); }
        set(x, y, v = 1) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = v; }
        rect(x, y, w, h, v = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, v); }
        frame(x, y, w, h) { for (let i = 0; i < w; i++) { this.set(x + i, y); this.set(x + i, y + h - 1); } for (let j = 0; j < h; j++) { this.set(x, y + j); this.set(x + w - 1, y + j); } }
        hline(x, y, w) { for (let i = 0; i < w; i++) this.set(x + i, y); }
        vline(x, y, h) { for (let j = 0; j < h; j++) this.set(x, y + j); }
        // text at pixel position, scale 1 or 2; returns the width drawn
        text(x, y, str, scale = 1, v = 1) {
            str = String(str).toUpperCase();
            let cx = x;
            for (const ch of str) {
                const g = FONT[ch] || FONT["?"];
                for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r] & (16 >> c)) this.rect(cx + c * scale, y + r * scale, scale, scale, v);
                cx += 6 * scale;
            }
            return cx - x;
        }
        textWidth(str, scale = 1) { return String(str).length * 6 * scale; }
        center(y, str, scale = 1, v = 1) { this.text(Math.round((this.w - this.textWidth(str, scale)) / 2), y, str, scale, v); }
        bar(x, y, w, h, value) { this.frame(x, y, w, h); this.rect(x + 1, y + 1, Math.round((w - 2) * clamp(value, 0, 1)), h - 2); }
    }

    // ============================================================ DSP blocks
    class Ring {
        constructor(n) { let s = 1; while (s < n + 4) s <<= 1; this.buf = new Float32Array(s); this.mask = s - 1; this.w = 0; }
        write(x) { this.buf[this.w] = x; this.w = (this.w + 1) & this.mask; }
        // d samples ago (d >= 1)
        read(d) { const p = this.w - d, i = Math.floor(p), f = p - i, m = this.mask; const a = this.buf[i & m], b = this.buf[(i + 1) & m]; return a + (b - a) * f; }
        clear() { this.buf.fill(0); }
    }
    const opk = (hz, sr) => 1 - Math.exp(-TWO_PI * Math.min(hz, sr * 0.45) / sr);
    // Two grains, half a grain apart: a simple pitch shifter (ratio 1 = no change).
    class Shifter {
        constructor(sr, grain = 0.05) { this.l = new Ring(sr * 0.5); this.r = new Ring(sr * 0.5); this.G = Math.max(64, Math.round(grain * sr)); this.p = 0; }
        tick(xl, xr, ratio, out) {
            this.l.write(xl); this.r.write(xr);
            this.p += (1 - ratio) / this.G;
            this.p -= Math.floor(this.p);
            const p1 = this.p, p2 = (p1 + 0.5) % 1, w1 = 1 - Math.abs(2 * p1 - 1), w2 = 1 - w1;
            const d1 = 1 + p1 * this.G, d2 = 1 + p2 * this.G;
            out[0] = this.l.read(d1) * w1 + this.l.read(d2) * w2;
            out[1] = this.r.read(d1) * w1 + this.r.read(d2) * w2;
        }
    }
    // Freeverb-style room, wet only.
    class Verb {
        constructor(sr) {
            const sc = sr / 44100;
            const mk = (n) => ({ b: new Float32Array(Math.max(8, Math.round(n * sc))), p: 0, s: 0 });
            this.cl = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(mk);
            this.cr = [1139, 1211, 1300, 1379, 1445, 1514, 1580, 1640].map(mk);
            this.al = [556, 441, 341, 225].map(mk);
            this.ar = [579, 464, 364, 248].map(mk);
            this.pre = new Ring(sr * 0.25);
        }
        tick(x, size, damp, pre, out) {
            this.pre.write(x);
            const input = (pre > 1 ? this.pre.read(pre) : x) * 0.015;
            const fb = 0.7 + size * 0.28;
            let l = 0, r = 0;
            for (let i = 0; i < 8; i++) {
                const c = this.cl[i], d = this.cr[i];
                let o = c.b[c.p]; c.s = o * (1 - damp) + c.s * damp; c.b[c.p] = input + c.s * fb; if (++c.p >= c.b.length) c.p = 0; l += o;
                o = d.b[d.p]; d.s = o * (1 - damp) + d.s * damp; d.b[d.p] = input + d.s * fb; if (++d.p >= d.b.length) d.p = 0; r += o;
            }
            for (let i = 0; i < 4; i++) {
                const a = this.al[i], b = this.ar[i];
                let v = a.b[a.p]; a.b[a.p] = l + v * 0.5; l = v - l; if (++a.p >= a.b.length) a.p = 0;
                v = b.b[b.p]; b.b[b.p] = r + v * 0.5; r = v - r; if (++b.p >= b.b.length) b.p = 0;
            }
            out[0] = l * 3; out[1] = r * 3;
        }
    }
    const SYNC_DIVS = [[1 / 8, "1/32"], [1 / 6, "1/16T"], [1 / 4, "1/16"], [1 / 3, "1/8T"], [3 / 8, "1/16D"], [1 / 2, "1/8"], [2 / 3, "1/4T"], [3 / 4, "1/8D"], [1, "1/4"], [4 / 3, "1/2T"], [3 / 2, "1/4D"], [2, "1/2"], [4, "1 BAR"]];
    const syncOf = (c) => SYNC_DIVS[Math.min(SYNC_DIVS.length - 1, Math.floor(c * SYNC_DIVS.length))];
    const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const noteName = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
    const pct = (c) => Math.round(c * 100) + "";
    const lin = (c, a, b) => a + (b - a) * c;
    const expv = (c, a, b) => a * Math.pow(b / a, c);
    const ms = (v) => v < 1000 ? Math.round(v) + "MS" : (v / 1000).toFixed(2) + "S";
    const hz = (v) => v < 1000 ? Math.round(v) + "HZ" : (v / 1000).toFixed(1) + "K";
    const SLICE_PATTERNS = [
        "1111111111111111", "1010101010101010", "1101101101101101", "1110111011101110", "1001001010010010", "1100110011001100", "1011011010110110", "1000100010001000",
    ];
    const SCATTER_PATTERNS = ["0000000000000000", "0000000200000002", "0000130000001300", "0002000200020002", "0013001300130013", "0200020402000204", "0013401300134013", "0404040404040404"];

    // Effects: each has three main controls (CTRL 1-3) and the shared CTRL 4-6 (mix, hi-cut, lo-cut).
    // run(st, c, L, R, n, ctx) processes unit-level stereo buffers in place, wet only (the bus mixes dry and wet).
    const FX = [];
    const fx = (id, name, labels, show, make, run, def) => FX.push({ id, name, labels, show, make, run, def: def || [0.5, 0.5, 0.5] });
    const ensure = (st, key, mk) => st[key] || (st[key] = mk());
    function svfPair(st, sr) { return ensure(st, "f", () => [new CarrotSVF(), new CarrotSVF(), new CarrotSVF(), new CarrotSVF()]); }

    fx("filterdrive", "FILTER+DRIVE", ["CUTOFF", "RESONANCE", "DRIVE"], [(c) => hz(expv(c, 40, 18000)), pct, pct], (sr) => ({ sr }), (st, c, L, R, n) => {
        const f = svfPair(st), fc = expv(c[0], 40, 18000), g = 1 + c[2] * 14, norm = 1 / (1 + c[2] * 1.5);
        f[0].set(fc, c[1] * 0.95, st.sr); f[1].set(fc, c[1] * 0.95, st.sr);
        for (let i = 0; i < n; i++) { L[i] = f[0].process(ftanh(L[i] * g) * norm, 0); R[i] = f[1].process(ftanh(R[i] * g) * norm, 0); }
    }, [1, 0.2, 0]);
    function combBank(st, sr, notes, fb, bright, L, R, n, drive) {
        const combs = ensure(st, "combs", () => [0, 1, 2].map(() => ({ l: new Ring(sr * 0.06), r: new Ring(sr * 0.06), sl: 0, sr: 0 })));
        const k = opk(lin(bright, 800, 12000), sr);
        for (let i = 0; i < n; i++) {
            let ol = 0, or = 0;
            for (let j = 0; j < 3; j++) {
                const cb = combs[j], d = sr / CarrotDSP.midiToHz(notes[j]);
                const yl = cb.l.read(d), yr = cb.r.read(d * (notes.spread || 1));
                cb.sl += (yl - cb.sl) * k; cb.sr += (yr - cb.sr) * k;
                cb.l.write(L[i] * 0.3 + (drive ? ftanh(cb.sl * fb * 1.2) : cb.sl * fb));
                cb.r.write(R[i] * 0.3 + (drive ? ftanh(cb.sr * fb * 1.2) : cb.sr * fb));
                ol += yl; or += yr;
            }
            L[i] = ol * 0.8; R[i] = or * 0.8;
        }
    }
    fx("resonator", "RESONATOR", ["ROOT", "BRIGHT", "FEEDBACK"], [(c) => noteName(36 + Math.round(c * 36)), pct, pct], (sr) => ({ sr }), (st, c, L, R, n) => {
        const root = 36 + Math.round(c[0] * 36);
        combBank(st, st.sr, [root, root + 7, root + 12], 0.5 + c[2] * 0.48, c[1], L, R, n, false);
    }, [0.33, 0.5, 0.6]);
    function syncDelay(st, c, L, R, n, ctx, beats, fb, pingpong, tone) {
        const sr = st.sr, d = clamp(beats * ctx.spb, 2, sr * 3.9);
        const dl = ensure(st, "dl", () => new Ring(sr * 4)), dr = ensure(st, "dr", () => new Ring(sr * 4));
        const k = opk(tone || 9000, sr);
        st.fl = st.fl || 0; st.fr = st.fr || 0;
        for (let i = 0; i < n; i++) {
            const yl = dl.read(d), yr = dr.read(d);
            st.fl += (yl - st.fl) * k; st.fr += (yr - st.fr) * k;
            if (pingpong) { dl.write(L[i] * 0.7 + st.fr * fb); dr.write(R[i] * 0.3 + st.fl * fb); }
            else { dl.write(L[i] + st.fl * fb); dr.write(R[i] + st.fr * fb); }
            L[i] = yl; R[i] = yr;
        }
    }
    fx("delay", "DELAY", ["TIME", "FEEDBACK", "LEVEL"], [(c) => syncOf(c)[1], pct, pct], (sr) => ({ sr }), (st, c, L, R, n, ctx) => {
        syncDelay(st, c, L, R, n, ctx, syncOf(c[0])[0], c[1] * 0.93, false);
        for (let i = 0; i < n; i++) { L[i] *= c[2] * 1.5; R[i] *= c[2] * 1.5; }
    }, [0.7, 0.4, 0.6]);
    const iso = (c) => c < 0.5 ? Math.pow(c / 0.5, 2) : 1 + (c - 0.5) * 2;
    fx("isolator", "ISOLATOR", ["LOW", "MID", "HIGH"], [(c) => c < 0.02 ? "KILL" : pct(iso(c) / 2), (c) => c < 0.02 ? "KILL" : pct(iso(c) / 2), (c) => c < 0.02 ? "KILL" : pct(iso(c) / 2)], (sr) => ({ sr, s: [0, 0, 0, 0] }), (st, c, L, R, n) => {
        const kl = opk(250, st.sr), kh = opk(2500, st.sr), gl = iso(c[0]), gm = iso(c[1]), gh = iso(c[2]), s = st.s;
        for (let i = 0; i < n; i++) {
            s[0] += (L[i] - s[0]) * kl; s[1] += (L[i] - s[1]) * kh;
            s[2] += (R[i] - s[2]) * kl; s[3] += (R[i] - s[3]) * kh;
            L[i] = s[0] * gl + (s[1] - s[0]) * gm + (L[i] - s[1]) * gh;
            R[i] = s[2] * gl + (s[3] - s[2]) * gm + (R[i] - s[3]) * gh;
        }
    }, [0.5, 0.5, 0.5]);
    const looperSpeed = (c) => c < 0.5 ? -(0.25 + (0.5 - c) * 3.5) : 0.25 + (c - 0.5) * 3.5;
    fx("djfxlooper", "DJFX LOOPER", ["LENGTH", "SPEED", "ON"], [(c) => syncOf(c)[1], (c) => looperSpeed(c).toFixed(2) + "X", (c) => c > 0.5 ? "ON" : "OFF"], (sr) => ({ sr, on: false, p: 0 }), (st, c, L, R, n, ctx) => {
        const sr = st.sr, bl = ensure(st, "bl", () => new Ring(sr * 4.2)), br = ensure(st, "br", () => new Ring(sr * 4.2));
        const len = clamp(syncOf(c[0])[0] * ctx.spb, 64, sr * 4), speed = looperSpeed(c[1]);
        const on = c[2] > 0.5;
        if (on && !st.on) { st.on = true; st.p = 0; st.len = len; st.anchor = 0; }
        if (!on) st.on = false;
        for (let i = 0; i < n; i++) {
            bl.write(L[i]); br.write(R[i]);
            if (!st.on) continue;
            st.anchor++;
            st.p += speed;
            st.p = ((st.p % st.len) + st.len) % st.len;
            // read from the captured loop (which recedes as new audio is written)
            const back = st.anchor + st.len - st.p;
            const edge = Math.min(st.p, st.len - st.p), fade = Math.min(1, edge / 64);
            L[i] = bl.read(back) * fade; R[i] = br.read(back) * fade;
        }
        if (!st.on) for (let i = 0; i < n; i++) { L[i] = 0; R[i] = 0; }
    }, [0.6, 0.71, 0]);
    function gridTime(ctx, i, div) {
        const beat = ctx.beatPos + i / ctx.spb;
        const step = Math.floor(beat / div);
        return { step, within: (beat - step * div) * ctx.spb, len: div * ctx.spb };
    }
    fx("scatter", "SCATTER", ["TYPE", "DEPTH", "SPEED"], [(c) => String(1 + Math.floor(c * 7.99)), pct, (c) => ["1/16", "1/8", "1/4"][Math.min(2, Math.floor(c * 3))]], (sr) => ({ sr }), (st, c, L, R, n, ctx) => {
        const sr = st.sr, bl = ensure(st, "bl", () => new Ring(sr * 4.2)), br = ensure(st, "br", () => new Ring(sr * 4.2));
        const pat = SCATTER_PATTERNS[Math.min(7, Math.floor(c[0] * 7.99))], div = [0.25, 0.5, 1][Math.min(2, Math.floor(c[2] * 3))];
        for (let i = 0; i < n; i++) {
            bl.write(L[i]); br.write(R[i]);
            const g = gridTime(ctx, i, div);
            const a = +pat[((g.step % 16) + 16) % 16];
            const hit = ((g.step * 2654435761) >>> 0) / 4294967296 < c[1];
            let d = 1;
            if (a && hit) {
                if (a == 1) d = 1 + g.len;                        // repeat the previous step
                else if (a == 2) d = 1 + 2 * g.within;            // reverse
                else if (a == 3) d = 1 + (g.within % (g.len / 4)) + 0;  // stutter
                else if (a == 4) d = 1 + g.within * 0.5;          // half speed
            }
            L[i] = bl.read(Math.min(d, sr * 4)); R[i] = br.read(Math.min(d, sr * 4));
        }
    }, [0.3, 0.7, 0.3]);
    fx("downer", "DOWNER", ["DEPTH", "RATE", "FILTER"], [pct, (c) => syncOf(0.6 + c * 0.4)[1], pct], (sr) => ({ sr, sh: new Shifter(sr, 0.06), o: [0, 0] }), (st, c, L, R, n, ctx) => {
        const div = syncOf(0.6 + c[1] * 0.4)[0], f = svfPair(st), o = st.o;
        for (let i = 0; i < n; i++) {
            const g = gridTime(ctx, i, div), u = g.within / g.len;
            const ratio = Math.pow(2, -c[0] * 12 * u * u / 12);
            st.sh.tick(L[i], R[i], ratio, o);
            if ((i & 15) == 0) { const fc = expv(1 - c[2] * u, 300, 16000); f[0].set(fc, 0.2, st.sr); f[1].set(fc, 0.2, st.sr); }
            L[i] = f[0].process(o[0], 0); R[i] = f[1].process(o[1], 0);
        }
    }, [0.6, 0.3, 0.5]);
    function chorusTick(st, sr, l, r, rate, depthMs, baseMs, out, three) {
        const dl = ensure(st, "cl", () => new Ring(sr * 0.06)), dr = ensure(st, "cr", () => new Ring(sr * 0.06));
        dl.write(l); dr.write(r);
        st.cp = ((st.cp || 0) + rate / sr) % 1;
        const m = sr / 1000;
        if (three) {
            let a = 0, b = 0;
            for (let k = 0; k < 3; k++) { a += dl.read((baseMs + depthMs * Math.sin(TWO_PI * (st.cp + k / 3))) * m); b += dr.read((baseMs + depthMs * Math.sin(TWO_PI * (st.cp + k / 3 + 0.5))) * m); }
            out[0] = a / 3; out[1] = b / 3;
        }
        else {
            const s = Math.sin(TWO_PI * st.cp);
            out[0] = dl.read((baseMs + depthMs * s) * m); out[1] = dr.read((baseMs - depthMs * s) * m);
        }
    }
    fx("waveverb", "WAVE VERB", ["TIME", "MOD", "LEVEL"], [pct, pct, pct], (sr) => ({ sr, v: new Verb(sr), o: [0, 0], o2: [0, 0] }), (st, c, L, R, n) => {
        for (let i = 0; i < n; i++) {
            st.v.tick(0.5 * (L[i] + R[i]), 0.5 + c[0] * 0.48, 0.3, 0, st.o);
            chorusTick(st, st.sr, st.o[0], st.o[1], 0.3 + c[1] * 3, 1 + c[1] * 6, 9, st.o2, false);
            L[i] = st.o2[0] * c[2] * 1.6; R[i] = st.o2[1] * c[2] * 1.6;
        }
    }, [0.7, 0.5, 0.6]);
    fx("echohall", "ECHO HALL", ["TIME", "FEEDBACK", "LEVEL"], [(c) => syncOf(c)[1], pct, pct], (sr) => ({ sr, v: new Verb(sr), o: [0, 0] }), (st, c, L, R, n, ctx) => {
        syncDelay(st, c, L, R, n, ctx, syncOf(c[0])[0], c[1] * 0.9, true, 6000);
        for (let i = 0; i < n; i++) { st.v.tick(0.5 * (L[i] + R[i]), 0.8, 0.4, 0, st.o); L[i] = (L[i] * 0.7 + st.o[0] * 0.5) * c[2] * 1.5; R[i] = (R[i] * 0.7 + st.o[1] * 0.5) * c[2] * 1.5; }
    }, [0.75, 0.5, 0.6]);
    fx("ghostecho", "GHOST ECHO", ["TIME", "FEEDBACK", "TONE"], [(c) => ms(expv(c, 20, 1000)), pct, (c) => hz(expv(c, 400, 12000))], (sr) => ({ sr, s: [0, 0], ap: [new Ring(sr * 0.02), new Ring(sr * 0.02)] }), (st, c, L, R, n) => {
        const sr = st.sr, d = expv(c[0], 20, 1000) * sr / 1000, fb = c[1] * 0.92, k = opk(expv(c[2], 400, 12000), sr);
        const dl = ensure(st, "dl", () => new Ring(sr * 1.1)), dr = ensure(st, "dr", () => new Ring(sr * 1.1));
        for (let i = 0; i < n; i++) {
            const yl = dl.read(d), yr = dr.read(d * 1.013);
            st.s[0] += (yl - st.s[0]) * k; st.s[1] += (yr - st.s[1]) * k;
            // a little diffusion makes the repeats smear
            const al = st.ap[0].read(sr * 0.0071), ar = st.ap[1].read(sr * 0.0093);
            st.ap[0].write(st.s[0] + al * 0.5); st.ap[1].write(st.s[1] + ar * 0.5);
            dl.write(L[i] + (al - st.s[0] * 0.5) * fb); dr.write(R[i] + (ar - st.s[1] * 0.5) * fb);
            L[i] = yl; R[i] = yr;
        }
    }, [0.5, 0.55, 0.4]);
    fx("swirl", "SWIRL", ["DEPTH", "RATE", "LEVEL"], [pct, (c) => expv(c, 0.1, 8).toFixed(2) + "HZ", pct], (sr) => ({ sr, z: [new Float64Array(12), new Float64Array(12)], ph: 0 }), (st, c, L, R, n) => {
        const sr = st.sr, rate = expv(c[1], 0.1, 8);
        let a = 0;
        for (let i = 0; i < n; i++) {
            st.ph = (st.ph + rate / sr) % 1;
            const s = Math.sin(TWO_PI * st.ph);
            if ((i & 15) == 0) { const t = Math.tan(Math.PI * Math.min(sr * 0.45, expv(0.5 + 0.5 * s * c[0], 200, 6000)) / sr); a = (t - 1) / (t + 1); }
            for (let ch = 0; ch < 2; ch++) {
                const buf = ch ? R : L, z = st.z[ch];
                let x = buf[i];
                for (let k = 0; k < 6; k++) { const y = a * x + z[2 * k] - a * z[2 * k + 1]; z[2 * k] = x; z[2 * k + 1] = y; x = y; }
                const pan = ch ? 0.5 - 0.5 * s * c[0] : 0.5 + 0.5 * s * c[0];
                buf[i] = (buf[i] * 0.5 + x * 0.5) * pan * 2 * c[2] * 1.4;
            }
        }
    }, [0.6, 0.4, 0.7]);
    fx("stepfilter", "STEP FILTER", ["RATE", "DEPTH", "RESONANCE"], [(c) => syncOf(c * 0.7)[1], pct, pct], (sr) => ({ sr, step: -1, target: 0.5, v: 0.5 }), (st, c, L, R, n, ctx) => {
        const f = svfPair(st), div = syncOf(c[0] * 0.7)[0];
        for (let i = 0; i < n; i++) {
            const g = gridTime(ctx, i, div);
            if (g.step != st.step) { st.step = g.step; st.target = ((g.step * 2246822519) >>> 0) / 4294967296; }
            st.v += (st.target - st.v) * 0.004;
            if ((i & 15) == 0) { const fc = expv(clamp(0.5 + (st.v - 0.5) * 2 * c[1], 0, 1), 150, 12000); f[0].set(fc, c[2] * 0.9, st.sr); f[1].set(fc, c[2] * 0.9, st.sr); }
            L[i] = f[0].process(L[i], 0); R[i] = f[1].process(R[i], 0);
        }
    }, [0.5, 0.7, 0.5]);
    fx("stopper", "STOPPER", ["SPEED", "LENGTH", "MIX"], [pct, (c) => (0.25 + c * 3.75).toFixed(2) + "BT", pct], (sr) => ({ sr }), (st, c, L, R, n, ctx) => {
        const sr = st.sr, bl = ensure(st, "bl", () => new Ring(sr * 8)), br = ensure(st, "br", () => new Ring(sr * 8));
        const lenBeats = 0.25 + c[1] * 3.75, bar = ctx.beatsPerBar || 4, curve = 1 + c[0] * 2;
        for (let i = 0; i < n; i++) {
            bl.write(L[i]); br.write(R[i]);
            const beat = ctx.beatPos + i / ctx.spb, inBar = ((beat % bar) + bar) % bar, startAt = bar - Math.min(bar, lenBeats);
            let d = 1;
            if (inBar >= startAt) {
                const u = (inBar - startAt) / Math.min(bar, lenBeats), t = (inBar - startAt) * ctx.spb;
                d = 1 + t * Math.pow(u, curve) / (curve + 1) * (curve + 1) * 0.999;
                d = Math.min(d, sr * 7.9);
            }
            L[i] = bl.read(d) * c[2] + L[i] * (1 - c[2]); R[i] = br.read(d) * c[2] + R[i] * (1 - c[2]);
        }
    }, [0.5, 0.25, 1]);
    fx("tapeecho", "TAPE ECHO", ["TIME", "FEEDBACK", "WOW"], [(c) => ms(lin(c, 50, 800)), pct, pct], (sr) => ({ sr, w: 0, s: [0, 0] }), (st, c, L, R, n) => {
        const sr = st.sr, base = lin(c[0], 50, 800) * sr / 1000, fb = c[1] * 0.9, k = opk(4500, sr);
        const dl = ensure(st, "dl", () => new Ring(sr * 1)), dr = ensure(st, "dr", () => new Ring(sr * 1));
        for (let i = 0; i < n; i++) {
            st.w += 1 / sr;
            const mod = 1 + c[2] * (0.006 * Math.sin(TWO_PI * 0.7 * st.w) + 0.002 * Math.sin(TWO_PI * 6.3 * st.w));
            const yl = dl.read(base * mod), yr = dr.read(base * mod * 1.002);
            st.s[0] += (yl - st.s[0]) * k; st.s[1] += (yr - st.s[1]) * k;
            dl.write(ftanh(L[i] + st.s[0] * fb)); dr.write(ftanh(R[i] + st.s[1] * fb));
            L[i] = st.s[0]; R[i] = st.s[1];
        }
    }, [0.4, 0.5, 0.4]);
    fx("timedelay", "TIME CTRL DLY", ["TIME", "FEEDBACK", "LEVEL"], [(c) => ms(expv(c, 1, 1000)), pct, pct], (sr) => ({ sr }), (st, c, L, R, n) => {
        const sr = st.sr, d = Math.max(1, expv(c[0], 1, 1000) * sr / 1000), fb = c[1] * 0.93;
        const dl = ensure(st, "dl", () => new Ring(sr * 1.1)), dr = ensure(st, "dr", () => new Ring(sr * 1.1));
        // glide the time so turning the knob pitches the repeats like the device
        st.d = st.d || d;
        for (let i = 0; i < n; i++) {
            st.d += (d - st.d) * 0.0005;
            const yl = dl.read(st.d), yr = dr.read(st.d);
            dl.write(L[i] + yl * fb); dr.write(R[i] + yr * fb);
            L[i] = yl * c[2] * 1.5; R[i] = yr * c[2] * 1.5;
        }
    }, [0.6, 0.4, 0.6]);
    fx("superfilter", "SUPER FILTER", ["CUTOFF", "RESONANCE", "LFO"], [(c) => hz(expv(c, 40, 18000)), pct, (c) => c < 0.02 ? "OFF" : syncOf(c)[1]], (sr) => ({ sr }), (st, c, L, R, n, ctx) => {
        const f = svfPair(st), div = syncOf(c[2])[0];
        for (let i = 0; i < n; i++) {
            if ((i & 15) == 0) {
                let x = c[0];
                if (c[2] >= 0.02) { const beat = ctx.beatPos + i / ctx.spb; x = clamp(x + 0.25 * Math.sin(TWO_PI * beat / div), 0, 1); }
                const fc = expv(x, 40, 18000);
                for (const s of f) s.set(fc, c[1] * 0.92, st.sr);
            }
            L[i] = f[1].process(f[0].process(L[i], 0), 0); R[i] = f[3].process(f[2].process(R[i], 0), 0);
        }
    }, [0.6, 0.5, 0]);
    fx("warmsat", "WARM SATURATOR", ["DRIVE", "TONE", "LEVEL"], [pct, (c) => hz(expv(c, 1000, 18000)), pct], (sr) => ({ sr, s: [0, 0] }), (st, c, L, R, n) => {
        const g = 1 + c[0] * 10, k = opk(expv(c[1], 1000, 18000), st.sr), out = c[2] * 2 / Math.sqrt(g);
        for (let i = 0; i < n; i++) {
            const a = ftanh(L[i] * g + 0.15 * c[0]) - ftanh(0.15 * c[0]), b = ftanh(R[i] * g + 0.15 * c[0]) - ftanh(0.15 * c[0]);
            st.s[0] += (a - st.s[0]) * k; st.s[1] += (b - st.s[1]) * k;
            L[i] = st.s[0] * out; R[i] = st.s[1] * out;
        }
    }, [0.4, 0.7, 0.5]);
    function vinyl(st, L, R, n, lp, noiseAmt, wow, comp) {
        const sr = st.sr, dl = ensure(st, "dl", () => new Ring(sr * 0.05)), dr = ensure(st, "dr", () => new Ring(sr * 0.05)), k = opk(lp, sr);
        st.s = st.s || [0, 0, 0]; st.t = st.t || 0; st.env = st.env || 0;
        for (let i = 0; i < n; i++) {
            st.t += 1 / sr;
            const d = (8 + wow * 3 * Math.sin(TWO_PI * 0.55 * st.t)) * sr / 1000;
            dl.write(L[i]); dr.write(R[i]);
            let a = dl.read(d), b = dr.read(d);
            if (comp > 0) { const lvl = Math.max(Math.abs(a), Math.abs(b)); st.env = lvl > st.env ? lvl : st.env * 0.9995; const g = 1 / (1 + comp * 4 * st.env); a *= g * (1 + comp); b *= g * (1 + comp); }
            if (Math.random() < 0.0004 * noiseAmt) st.s[2] = (Math.random() * 2 - 1) * noiseAmt;
            st.s[2] *= 0.8;
            const hiss = (Math.random() * 2 - 1) * noiseAmt * 0.01;
            st.s[0] += (a - st.s[0]) * k; st.s[1] += (b - st.s[1]) * k;
            L[i] = st.s[0] + st.s[2] + hiss; R[i] = st.s[1] + st.s[2] + hiss;
        }
    }
    fx("vinyl303", "303 VINYLSIM", ["COMP", "NOISE", "WOW"], [pct, pct, pct], (sr) => ({ sr }), (st, c, L, R, n) => vinyl(st, L, R, n, 9000, c[1], c[2], c[0]), [0.5, 0.4, 0.3]);
    fx("vinyl404", "404 VINYLSIM", ["FREQUENCY", "NOISE", "WOW"], [(c) => hz(expv(c, 1000, 18000)), pct, pct], (sr) => ({ sr }), (st, c, L, R, n) => vinyl(st, L, R, n, expv(c[0], 1000, 18000), c[1], c[2], 0.3), [0.5, 0.4, 0.3]);
    fx("cassette", "CASSETTE SIM", ["TONE", "HISS", "AGE"], [(c) => hz(expv(c, 1500, 16000)), pct, pct], (sr) => ({ sr }), (st, c, L, R, n) => {
        vinyl(st, L, R, n, expv(c[0] * (1 - c[2] * 0.5), 1500, 16000), 0, c[2] * 1.5, 0);
        for (let i = 0; i < n; i++) { const h = (Math.random() * 2 - 1) * c[1] * 0.02; L[i] = ftanh(L[i] * (1 + c[2])) + h; R[i] = ftanh(R[i] * (1 + c[2])) + h; }
    }, [0.6, 0.3, 0.4]);
    function crush(st, L, R, n, bits, down) {
        st.c = st.c || 0; st.h = st.h || [0, 0];
        const q = Math.pow(2, bits - 1);
        for (let i = 0; i < n; i++) {
            if (++st.c >= down) { st.c -= down; st.h[0] = Math.round(L[i] * q) / q; st.h[1] = Math.round(R[i] * q) / q; }
            L[i] = st.h[0]; R[i] = st.h[1];
        }
    }
    fx("lofi", "LO-FI", ["PRE FILTER", "BITS", "RATE"], [(c) => hz(expv(c, 800, 18000)), (c) => Math.round(lin(c, 16, 4)) + "BIT", (c) => (1 + c * 15).toFixed(1) + "X"], (sr) => ({ sr, s: [0, 0] }), (st, c, L, R, n) => {
        const k = opk(expv(c[0], 800, 18000), st.sr);
        for (let i = 0; i < n; i++) { st.s[0] += (L[i] - st.s[0]) * k; st.s[1] += (R[i] - st.s[1]) * k; L[i] = st.s[0]; R[i] = st.s[1]; }
        crush(st, L, R, n, lin(c[1], 16, 4), 1 + c[2] * 15);
    }, [0.6, 0.4, 0.3]);
    fx("reverb", "REVERB", ["TIME", "TONE", "LEVEL"], [pct, pct, pct], (sr) => ({ sr, v: new Verb(sr), o: [0, 0] }), (st, c, L, R, n) => {
        for (let i = 0; i < n; i++) { st.v.tick(0.5 * (L[i] + R[i]), 0.3 + c[0] * 0.68, 0.6 - c[1] * 0.55, 0, st.o); L[i] = st.o[0] * c[2] * 1.4; R[i] = st.o[1] * c[2] * 1.4; }
    }, [0.6, 0.5, 0.5]);
    fx("chorus", "CHORUS", ["RATE", "DEPTH", "LEVEL"], [(c) => expv(c, 0.1, 6).toFixed(2) + "HZ", pct, pct], (sr) => ({ sr, o: [0, 0] }), (st, c, L, R, n) => {
        for (let i = 0; i < n; i++) { chorusTick(st, st.sr, L[i], R[i], expv(c[0], 0.1, 6), 0.3 + c[1] * 4, 8, st.o, false); L[i] = st.o[0] * c[2] * 1.6; R[i] = st.o[1] * c[2] * 1.6; }
    }, [0.4, 0.5, 0.6]);
    fx("junochorus", "JUNO CHORUS", ["MODE", "WIDTH", "LEVEL"], [(c) => ["I", "II", "I+II"][Math.min(2, Math.floor(c * 3))], pct, pct], (sr) => ({ sr, o: [0, 0] }), (st, c, L, R, n) => {
        const mode = Math.min(2, Math.floor(c[0] * 3)), rate = [0.513, 0.863, 9.75][mode], depth = [1.6, 1.9, 0.35][mode];
        for (let i = 0; i < n; i++) {
            chorusTick(st, st.sr, L[i], R[i], rate, depth, 3.6, st.o, false);
            const m = 0.5 * (st.o[0] + st.o[1]), s = 0.5 * (st.o[0] - st.o[1]) * (c[1] * 2);
            L[i] = (m + s) * c[2] * 1.6; R[i] = (m - s) * c[2] * 1.6;
        }
    }, [0, 0.5, 0.6]);
    fx("flanger", "FLANGER", ["RATE", "DEPTH", "FEEDBACK"], [(c) => expv(c, 0.05, 5).toFixed(2) + "HZ", pct, pct], (sr) => ({ sr, ph: 0, f: [0, 0] }), (st, c, L, R, n) => {
        const sr = st.sr, dl = ensure(st, "dl", () => new Ring(sr * 0.02)), dr = ensure(st, "dr", () => new Ring(sr * 0.02));
        for (let i = 0; i < n; i++) {
            st.ph = (st.ph + expv(c[0], 0.05, 5) / sr) % 1;
            const d = (0.3 + c[1] * 6 * (0.5 + 0.5 * Math.sin(TWO_PI * st.ph))) * sr / 1000;
            const yl = dl.read(Math.max(1, d)), yr = dr.read(Math.max(1, d));
            dl.write(L[i] + yl * c[2] * 0.9); dr.write(R[i] + yr * c[2] * 0.9);
            L[i] = 0.5 * (L[i] + yl) * 1.4; R[i] = 0.5 * (R[i] + yr) * 1.4;
        }
    }, [0.3, 0.6, 0.6]);
    fx("phaser", "PHASER", ["RATE", "DEPTH", "RESONANCE"], [(c) => expv(c, 0.05, 6).toFixed(2) + "HZ", pct, pct], (sr) => ({ sr, z: [new Float64Array(16), new Float64Array(16)], ph: 0, fb: [0, 0] }), (st, c, L, R, n) => {
        const sr = st.sr;
        let a = 0;
        for (let i = 0; i < n; i++) {
            st.ph = (st.ph + expv(c[0], 0.05, 6) / sr) % 1;
            if ((i & 15) == 0) { const t = Math.tan(Math.PI * expv(0.5 + 0.5 * Math.sin(TWO_PI * st.ph) * c[1], 150, 5000) / sr); a = (t - 1) / (t + 1); }
            for (let ch = 0; ch < 2; ch++) {
                const buf = ch ? R : L, z = st.z[ch];
                let x = buf[i] + st.fb[ch] * c[2] * 0.85;
                for (let k = 0; k < 8; k++) { const y = a * x + z[2 * k] - a * z[2 * k + 1]; z[2 * k] = x; z[2 * k + 1] = y; x = y; }
                st.fb[ch] = x;
                buf[i] = (buf[i] + x) * 0.7;
            }
        }
    }, [0.3, 0.7, 0.5]);
    fx("wah", "WAH", ["PEAK", "RATE", "DEPTH"], [pct, (c) => c < 0.02 ? "AUTO" : expv(c, 0.2, 8).toFixed(2) + "HZ", pct], (sr) => ({ sr, ph: 0, env: 0 }), (st, c, L, R, n) => {
        const f = svfPair(st), sr = st.sr;
        for (let i = 0; i < n; i++) {
            const lvl = Math.max(Math.abs(L[i]), Math.abs(R[i]));
            st.env = lvl > st.env ? st.env + (lvl - st.env) * 0.05 : st.env * 0.9995;
            st.ph = (st.ph + (c[1] < 0.02 ? 0 : expv(c[1], 0.2, 8)) / sr) % 1;
            if ((i & 15) == 0) {
                const m = c[1] < 0.02 ? clamp(st.env * 3, 0, 1) : 0.5 + 0.5 * Math.sin(TWO_PI * st.ph);
                const fc = expv(clamp(0.2 + m * c[2] * 0.8, 0, 1), 300, 3000);
                f[0].set(fc, 0.5 + c[0] * 0.45, sr); f[1].set(fc, 0.5 + c[0] * 0.45, sr);
            }
            L[i] = f[0].process(L[i], 2) * 1.5; R[i] = f[1].process(R[i], 2) * 1.5;
        }
    }, [0.5, 0.4, 0.7]);
    fx("slicer", "SLICER", ["PATTERN", "RATE", "DEPTH"], [(c) => String(1 + Math.floor(c * 7.99)), (c) => ["1/32", "1/16", "1/8"][Math.min(2, Math.floor(c * 3))], pct], (sr) => ({ sr, g: 1 }), (st, c, L, R, n, ctx) => {
        const pat = SLICE_PATTERNS[Math.min(7, Math.floor(c[0] * 7.99))], div = [0.125, 0.25, 0.5][Math.min(2, Math.floor(c[1] * 3))];
        for (let i = 0; i < n; i++) {
            const g = gridTime(ctx, i, div), on = pat[((g.step % 16) + 16) % 16] == "1" && g.within < g.len * 0.75;
            const target = on ? 1 : 1 - c[2];
            st.g += (target - st.g) * 0.02;
            L[i] *= st.g; R[i] *= st.g;
        }
    }, [0.2, 0.4, 1]);
    fx("tremolo", "TREMOLO/PAN", ["RATE", "DEPTH", "PAN"], [(c) => syncOf(c)[1], pct, (c) => c > 0.5 ? "PAN" : "TREM"], (sr) => ({ sr }), (st, c, L, R, n, ctx) => {
        const div = syncOf(c[0])[0];
        for (let i = 0; i < n; i++) {
            const s = Math.sin(TWO_PI * (ctx.beatPos + i / ctx.spb) / div);
            if (c[2] > 0.5) { L[i] *= 1 - c[1] * 0.5 * (1 + s); R[i] *= 1 - c[1] * 0.5 * (1 - s); }
            else { const g = 1 - c[1] * 0.5 * (1 + s); L[i] *= g; R[i] *= g; }
        }
    }, [0.45, 0.7, 0]);
    fx("chromaticps", "CHROMATIC PS", ["PITCH", "FINE", "MIX"], [(c) => (Math.round(lin(c, -12, 12)) > 0 ? "+" : "") + Math.round(lin(c, -12, 12)), (c) => Math.round(lin(c, -50, 50)) + "CT", pct], (sr) => ({ sr, sh: new Shifter(sr, 0.045), o: [0, 0] }), (st, c, L, R, n) => {
        const ratio = Math.pow(2, (Math.round(lin(c[0], -12, 12)) + lin(c[1], -0.5, 0.5)) / 12);
        for (let i = 0; i < n; i++) { st.sh.tick(L[i], R[i], ratio, st.o); L[i] = L[i] * (1 - c[2]) + st.o[0] * c[2]; R[i] = R[i] * (1 - c[2]) + st.o[1] * c[2]; }
    }, [0.75, 0.5, 1]);
    fx("hyperreso", "HYPER-RESO", ["NOTE", "SPREAD", "FEEDBACK"], [(c) => noteName(36 + Math.round(c * 36)), pct, pct], (sr) => ({ sr }), (st, c, L, R, n) => {
        const root = 36 + Math.round(c[0] * 36), notes = [root, root + 12, root + 19];
        notes.spread = 1 + c[1] * 0.02;
        combBank(st, st.sr, notes, 0.6 + c[2] * 0.38, 0.7, L, R, n, true);
    }, [0.4, 0.4, 0.6]);
    fx("ringmod", "RING MOD", ["FREQ", "SENS", "MIX"], [(c) => hz(expv(c, 20, 2000)), pct, pct], (sr) => ({ sr, ph: 0, env: 0 }), (st, c, L, R, n) => {
        for (let i = 0; i < n; i++) {
            const lvl = Math.max(Math.abs(L[i]), Math.abs(R[i]));
            st.env = lvl > st.env ? lvl : st.env * 0.999;
            st.ph = (st.ph + expv(c[0], 20, 2000) * (1 + c[1] * st.env * 4) / st.sr) % 1;
            const m = Math.sin(TWO_PI * st.ph);
            L[i] = L[i] * (1 - c[2]) + L[i] * m * c[2]; R[i] = R[i] * (1 - c[2]) + R[i] * m * c[2];
        }
    }, [0.5, 0, 1]);
    fx("crusher", "CRUSHER", ["BITS", "RATE", "MIX"], [(c) => Math.round(lin(c, 16, 1)) + "BIT", (c) => (1 + c * 39).toFixed(1) + "X", pct], (sr) => ({ sr }), (st, c, L, R, n) => {
        const dl = Float32Array.from(L.subarray(0, n)), dr = Float32Array.from(R.subarray(0, n));
        crush(st, L, R, n, Math.max(1, lin(c[0], 16, 1)), 1 + c[1] * 39);
        for (let i = 0; i < n; i++) { L[i] = dl[i] * (1 - c[2]) + L[i] * c[2]; R[i] = dr[i] * (1 - c[2]) + R[i] * c[2]; }
    }, [0.5, 0.3, 1]);
    function drive(st, c, L, R, n, hard) {
        const g = 1 + c[0] * 30, k = opk(expv(c[1], 800, 16000), st.sr), out = c[2] * 1.6;
        st.s = st.s || [0, 0];
        for (let i = 0; i < n; i++) {
            const a = hard ? clamp(L[i] * g, -1, 1) : ftanh(L[i] * g), b = hard ? clamp(R[i] * g, -1, 1) : ftanh(R[i] * g);
            st.s[0] += (a - st.s[0]) * k; st.s[1] += (b - st.s[1]) * k;
            L[i] = st.s[0] * out; R[i] = st.s[1] * out;
        }
    }
    fx("overdrive", "OVERDRIVE", ["DRIVE", "TONE", "LEVEL"], [pct, pct, pct], (sr) => ({ sr }), (st, c, L, R, n) => drive(st, c, L, R, n, false), [0.4, 0.5, 0.5]);
    fx("distortion", "DISTORTION", ["DRIVE", "TONE", "LEVEL"], [pct, pct, pct], (sr) => ({ sr }), (st, c, L, R, n) => drive(st, c, L, R, n, true), [0.5, 0.5, 0.4]);
    const eqDb = (c) => (c - 0.5) * 30;
    fx("equalizer", "EQUALIZER", ["LOW", "MID", "HIGH"], [(c) => eqDb(c).toFixed(1) + "DB", (c) => eqDb(c).toFixed(1) + "DB", (c) => eqDb(c).toFixed(1) + "DB"], (sr) => ({ sr, s: [0, 0, 0, 0] }), (st, c, L, R, n) => {
        const kl = opk(300, st.sr), kh = opk(3500, st.sr), g = c.slice(0, 3).map(v => Math.pow(10, eqDb(v) / 20)), s = st.s;
        for (let i = 0; i < n; i++) {
            s[0] += (L[i] - s[0]) * kl; s[1] += (L[i] - s[1]) * kh; s[2] += (R[i] - s[2]) * kl; s[3] += (R[i] - s[3]) * kh;
            L[i] = s[0] * g[0] + (s[1] - s[0]) * g[1] + (L[i] - s[1]) * g[2];
            R[i] = s[2] * g[0] + (s[3] - s[2]) * g[1] + (R[i] - s[3]) * g[2];
        }
    }, [0.5, 0.5, 0.5]);
    fx("compressor", "COMPRESSOR", ["SUSTAIN", "ATTACK", "RATIO"], [pct, (c) => ms(expv(c, 0.1, 100)), (c) => (1 + c * 19).toFixed(1) + ":1"], (sr) => ({ sr, env: 0 }), (st, c, L, R, n) => {
        const thr = Math.pow(10, -c[0] * 40 / 20), ratio = 1 + c[2] * 19, att = Math.exp(-1 / (expv(c[1], 0.1, 100) * st.sr / 1000)), rel = Math.exp(-1 / (0.15 * st.sr));
        const makeup = Math.pow(1 / thr, (1 - 1 / ratio) * 0.6);
        for (let i = 0; i < n; i++) {
            const lvl = Math.max(Math.abs(L[i]), Math.abs(R[i]));
            st.env = lvl > st.env ? lvl + (st.env - lvl) * att : lvl + (st.env - lvl) * rel;
            const gain = st.env > thr ? Math.pow(st.env / thr, 1 / ratio - 1) : 1;
            L[i] *= gain * makeup; R[i] *= gain * makeup;
        }
    }, [0.5, 0.3, 0.3]);
    fx("sxreverb", "SX REVERB", ["TIME", "PRE DELAY", "LEVEL"], [pct, (c) => ms(c * 200), pct], (sr) => ({ sr, v: new Verb(sr), v2: new Verb(sr * 1.13), o: [0, 0], o2: [0, 0] }), (st, c, L, R, n) => {
        for (let i = 0; i < n; i++) {
            const x = 0.5 * (L[i] + R[i]);
            st.v.tick(x, 0.6 + c[0] * 0.39, 0.25, c[1] * 0.2 * st.sr, st.o);
            st.v2.tick(st.o[0] * 0.5, 0.6 + c[0] * 0.39, 0.3, 0, st.o2);
            L[i] = (st.o[0] + st.o2[1] * 0.5) * c[2]; R[i] = (st.o[1] + st.o2[0] * 0.5) * c[2];
        }
    }, [0.7, 0.2, 0.6]);
    fx("sxdelay", "SX DELAY", ["TIME", "FEEDBACK", "LEVEL"], [(c) => syncOf(c)[1], pct, pct], (sr) => ({ sr }), (st, c, L, R, n, ctx) => {
        syncDelay(st, c, L, R, n, ctx, syncOf(c[0])[0], c[1] * 0.92, true, 12000);
        for (let i = 0; i < n; i++) { L[i] *= c[2] * 1.6; R[i] *= c[2] * 1.6; }
    }, [0.65, 0.5, 0.6]);
    fx("clouddelay", "CLOUD DELAY", ["WINDOW", "FEEDBACK", "PITCH"], [(c) => ms(lin(c, 30, 600)), pct, (c) => (Math.round(lin(c, -12, 12)) > 0 ? "+" : "") + Math.round(lin(c, -12, 12))], (sr) => ({ sr, sh: new Shifter(sr, 0.08), o: [0, 0], v: new Verb(sr), o2: [0, 0] }), (st, c, L, R, n) => {
        const sr = st.sr, d = lin(c[0], 30, 600) * sr / 1000, ratio = Math.pow(2, Math.round(lin(c[2], -12, 12)) / 12);
        const dl = ensure(st, "dl", () => new Ring(sr * 0.7)), dr = ensure(st, "dr", () => new Ring(sr * 0.7));
        for (let i = 0; i < n; i++) {
            const yl = dl.read(d), yr = dr.read(d * 1.07);
            st.sh.tick(yl, yr, ratio, st.o);
            st.v.tick(0.5 * (st.o[0] + st.o[1]), 0.85, 0.3, 0, st.o2);
            dl.write(L[i] + (st.o[0] * 0.6 + st.o2[0] * 0.3) * c[1] * 0.9);
            dr.write(R[i] + (st.o[1] * 0.6 + st.o2[1] * 0.3) * c[1] * 0.9);
            L[i] = yl * 0.6 + st.o2[0] * 0.6; R[i] = yr * 0.6 + st.o2[1] * 0.6;
        }
    }, [0.5, 0.6, 1]);
    fx("backspin", "BACK SPIN", ["LENGTH", "SPEED", "ON"], [(c) => syncOf(0.6 + c * 0.4)[1], pct, (c) => c > 0.5 ? "ON" : "OFF"], (sr) => ({ sr, on: false }), (st, c, L, R, n) => {
        const sr = st.sr, bl = ensure(st, "bl", () => new Ring(sr * 4.5)), br = ensure(st, "br", () => new Ring(sr * 4.5));
        const on = c[2] > 0.5;
        if (on && !st.on) { st.on = true; st.d = 1; st.v = 1 + c[1] * 3; }
        if (!on) st.on = false;
        for (let i = 0; i < n; i++) {
            bl.write(L[i]); br.write(R[i]);
            if (!st.on) continue;
            // the record spins backwards fast, then slows to a stop
            st.d = Math.min(sr * 4, st.d + 1 + st.v);
            st.v *= 0.99993;
            const g = Math.min(1, st.v);
            L[i] = bl.read(st.d) * g; R[i] = br.read(st.d) * g;
        }
        if (!st.on) for (let i = 0; i < n; i++) { L[i] = 0; R[i] = 0; }
    }, [0.5, 0.5, 0]);
    fx("gtamp", "GT AMP SIM", ["GAIN", "BASS", "TREBLE"], [pct, pct, pct], (sr) => ({ sr, s: [0, 0, 0, 0, 0, 0] }), (st, c, L, R, n) => {
        const g = 1 + c[0] * 40, kb = opk(250, st.sr), kc = opk(4500, st.sr), hp = opk(80, st.sr), s = st.s;
        const bass = lin(c[1], 0.3, 2), treble = lin(c[2], 0.3, 2);
        for (let ch = 0; ch < 2; ch++) {
            const buf = ch ? R : L, o = ch * 3;
            for (let i = 0; i < n; i++) {
                s[o] += (buf[i] - s[o]) * kb;
                let x = s[o] * bass + (buf[i] - s[o]) * treble;
                s[o + 1] += (x - s[o + 1]) * hp;
                x = ftanh((x - s[o + 1]) * g) * 0.6;
                s[o + 2] += (x - s[o + 2]) * kc;
                buf[i] = s[o + 2];
            }
        }
    }, [0.5, 0.5, 0.5]);
    fx("harmony", "HARMONY", ["INTERVAL", "LEVEL", "MIX"], [(c) => (Math.round(lin(c, -12, 12)) > 0 ? "+" : "") + Math.round(lin(c, -12, 12)), pct, pct], (sr) => ({ sr, sh: new Shifter(sr, 0.04), o: [0, 0] }), (st, c, L, R, n) => {
        const ratio = Math.pow(2, Math.round(lin(c[0], -12, 12)) / 12);
        for (let i = 0; i < n; i++) { st.sh.tick(L[i], R[i], ratio, st.o); L[i] = L[i] * (1 - c[2] * 0.5) + st.o[0] * c[1] * c[2] * 1.4; R[i] = R[i] * (1 - c[2] * 0.5) + st.o[1] * c[1] * c[2] * 1.4; }
    }, [0.79, 0.7, 1]);
    fx("autopan", "AUTO PAN", ["RATE", "DEPTH", "SHAPE"], [(c) => syncOf(c)[1], pct, (c) => c > 0.5 ? "SQUARE" : "SINE"], (sr) => ({ sr, g: [1, 1] }), (st, c, L, R, n, ctx) => {
        const div = syncOf(c[0])[0];
        for (let i = 0; i < n; i++) {
            let s = Math.sin(TWO_PI * (ctx.beatPos + i / ctx.spb) / div);
            if (c[2] > 0.5) s = s > 0 ? 1 : -1;
            st.g[0] += ((1 - c[1] * 0.5 * (1 + s)) - st.g[0]) * 0.01; st.g[1] += ((1 - c[1] * 0.5 * (1 - s)) - st.g[1]) * 0.01;
            L[i] *= st.g[0]; R[i] *= st.g[1];
        }
    }, [0.5, 0.8, 0]);
    const FX_BY_ID = new Map(FX.map((f, i) => [f.id, i]));
    // the six buttons around the display
    const DIRECT_FX = ["filterdrive", "resonator", "delay", "isolator", "djfxlooper"];
    // effects that sound only on their own (no dry part mixed in)
    const FULL_WET = new Set(["filterdrive", "isolator", "stepfilter", "superfilter", "wah", "slicer", "tremolo", "autopan", "equalizer", "compressor", "overdrive", "distortion", "warmsat", "gtamp", "lofi", "crusher", "vinyl303", "vinyl404", "cassette", "downer", "scatter", "stopper", "chromaticps", "ringmod", "harmony", "phaser", "swirl", "flanger"]);
    const LOOPERS = new Set(["djfxlooper", "backspin"]);

    // ============================================================ params
    const PAD_DEFAULT = { s: null, n: "", vol: 1, pan: 0, pitch: 0, speed: 1, st: 0, en: 1, att: 0, hold: 10, rel: 0.01, loop: 0, pp: 0, gate: 0, rev: 0, bpms: 0, bpm: 0, bus: 1, mg: 0, gain: 0, marks: null };
    const SYS_DEFAULT = { bpm: 0, metro: 0, mvol: 0.5, cnt: 0, fixv: 0, fixval: 100, local: 1, sendCtl: 1, sendPc: 1, q: 2, plen: 1, recMode: 0, thr: 0, roll: 2, mono: 0, src: 0, links: null, cue: 0.5, inGain: 1 };
    const QUANTIZE = [[0, "OFF"], [1 / 8, "1/32"], [1 / 4, "1/16"], [1 / 2, "1/8"], [1, "1/4"], [1 / 6, "1/16T"], [1 / 3, "1/8T"]];
    const ROLL_RATES = [[1 / 8, "1/32"], [1 / 6, "1/16T"], [1 / 4, "1/16"], [1 / 3, "1/8T"], [1 / 2, "1/8"], [1, "1/4"]];
    function defaultBus(id, on) {
        const i = FX_BY_ID.get(id);
        return { fx: i, on: on ? 1 : 0, c: FX[i].def.concat([1, 1, 0]) };
    }
    function defaultParams() {
        const p = { v: 1, mode: 0, dbank: 0, chrom: "A13", vol: 0.8, pads: {}, pat: {}, sys: {}, ui: { bank: 0, pad: 13 } };
        p.bus = [defaultBus("filterdrive"), defaultBus("delay"), defaultBus("vinyl404"), defaultBus("reverb")];
        p.inFx = defaultBus("chorus");
        // banks A-E start with CarrotBox kits on the lower three rows (the top row is free for sampling)
        try {
            const kits = A.FLSoundFactory.getKits();
            const order = [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8];
            for (let b = 0; b < 5 && b < kits.length; b++) {
                kits[b].pads.forEach((pad, i) => {
                    if (i >= order.length) return;
                    const info = A.FLSoundFactory.getInfo(pad[0]);
                    p.pads[padKey(b, order[i])] = { s: "b:" + pad[0], n: (info && info.name) || pad[0].split("/").pop(), mg: pad[1] ? 1 : 0 };
                });
            }
        }
        catch (error) { }
        return p;
    }
    const filled = new WeakSet();
    function fill(params) {
        const p = params && typeof params == "object" ? params : {};
        if (filled.has(p)) return p;
        if (!p.pads || typeof p.pads != "object") p.pads = {};
        if (!p.pat || typeof p.pat != "object") p.pat = {};
        if (!p.sys || typeof p.sys != "object") p.sys = {};
        for (const k in SYS_DEFAULT) if (p.sys[k] === undefined) p.sys[k] = SYS_DEFAULT[k];
        if (!Array.isArray(p.bus) || p.bus.length != 4) p.bus = [defaultBus("filterdrive"), defaultBus("delay"), defaultBus("vinyl404"), defaultBus("reverb")];
        for (const b of p.bus.concat([p.inFx || (p.inFx = defaultBus("chorus"))])) {
            if (!(b.fx >= 0 && b.fx < FX.length)) b.fx = 0;
            if (!Array.isArray(b.c)) b.c = FX[b.fx].def.concat([1, 1, 0]);
            while (b.c.length < 6) b.c.push([0.5, 0.5, 0.5, 1, 1, 0][b.c.length]);
        }
        if (typeof p.vol != "number") p.vol = 0.8;
        if (typeof p.mode != "number") p.mode = 0;
        if (typeof p.dbank != "number") p.dbank = 0;
        if (typeof p.chrom != "string") p.chrom = "A13";
        if (!p.ui || typeof p.ui != "object") p.ui = { bank: 0, pad: 13 };
        filled.add(p);
        return p;
    }
    // A pad's settings with the defaults filled in (pads store only what differs).
    function padOf(p, key) {
        const raw = p.pads[key];
        const o = Object.assign({}, PAD_DEFAULT, raw || {});
        o.key = key;
        return o;
    }
    function padSet(p, key, prop, value) {
        const raw = p.pads[key] || (p.pads[key] = {});
        if (value === PAD_DEFAULT[prop] || value == null) delete raw[prop]; else raw[prop] = value;
        if (Object.keys(raw).length == 0) delete p.pads[key];
    }
    const parseKey = (key) => ({ bank: BANKS.indexOf(key[0]), label: +key.slice(1) });
    // A song note -> pad. Pitched channels follow the device's MIDI mode B layout (pitch 0 = bank A
    // pad 13, 16 pads per bank) for banks A-E (or F-J); drum rows play pads of one bank.
    function noteToPad(p, pitch, isDrum) {
        if (isDrum) return pitch < 16 ? { key: padKey(p.dbank | 0, labelOf(pitch)), semis: 0 } : null;
        if ((p.mode | 0) == 2) return pitch == KEEPALIVE ? null : { key: p.chrom, semis: pitch - 36 };
        if (pitch >= 80) return null;
        const bank = (p.mode | 0) * 5 + Math.floor(pitch / 16);
        return { key: padKey(bank, labelOf(pitch % 16)), semis: 0 };
    }
    function padToNote(p, bank, label, isDrum) {
        const slot = slotOf(label);
        if (isDrum) return bank == (p.dbank | 0) && slot < 12 ? slot : null;
        if ((p.mode | 0) == 2) return null;
        const b = bank - (p.mode | 0) * 5;
        return b >= 0 && b < 5 ? b * 16 + slot : null;
    }
    // ============================================================ sample voices
    function velGain(p, vel) {
        const v = p.sys.fixv ? p.sys.fixval : vel;
        return Math.pow(clamp(v, 1, 127) / 127, 1.5);
    }
    function sampleBpm(entry, pad) {
        if (pad.bpm > 0) return pad.bpm;
        const dur = (entry.pcm.length * (pad.en - pad.st)) / entry.rate;
        if (!(dur > 0.2)) return 0;
        let beats = 1;
        while (beats * 60 / dur < 70 && beats < 64) beats *= 2;
        return beats * 60 / dur;
    }
    class SampleVoice {
        // opts: sr, vel, semis, songBpm, gate (held), delay (samples before it starts)
        constructor(p, pad, entry, opts) {
            const pcm = entry.pcm, len = pcm.length;
            this.p = p; this.key = pad.key; this.pad = pad; this.pcm = pcm;
            this.s0 = clamp(Math.floor(pad.st * len), 0, len - 1);
            this.s1 = clamp(Math.floor(pad.en * len), this.s0 + 1, len);
            this.dir = pad.rev ? -1 : 1;
            this.t = this.dir > 0 ? this.s0 : this.s1 - 1;       // where we are in the sample (time)
            // SPEED (and chromatic notes) resample like tape; PITCH keeps the length; BPM SYNC keeps the pitch
            this.base = entry.rate / opts.sr * pad.speed * Math.pow(2, (opts.semis || 0) / 12);
            this.ratio = Math.pow(2, pad.pitch / 12);
            this.stretch = 1;
            if (pad.bpms && opts.songBpm > 0) { const bpm = sampleBpm(entry, pad); if (bpm > 0) this.stretch = clamp(opts.songBpm / bpm, 0.25, 4); }
            this.granular = Math.abs(this.ratio - 1) > 1e-4 || Math.abs(this.stretch - 1) > 1e-3;
            this.G = Math.round(0.045 * opts.sr);
            this.g = [{ start: this.t, age: 0 }, { start: this.t, age: this.G / 2 }];
            const gain = Math.pow(10, pad.gain / 20) * pad.vol * velGain(p, opts.vel || 100);
            const pan = clamp(pad.pan, -1, 1);
            this.gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2;
            this.gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
            this.sr = opts.sr;
            this.attInc = pad.att > 0.0005 ? 1 / (pad.att * opts.sr) : 1;
            this.env = pad.att > 0.0005 ? 0 : 1;
            this.holdLeft = pad.hold >= 10 ? Infinity : pad.hold * opts.sr;
            this.relK = Math.exp(-1 / (Math.max(0.002, pad.rel) * opts.sr * 0.25));
            this.releasing = false;
            this.gate = !!opts.gate;
            this.delay = opts.delay | 0;
            this.done = false;
            this.choke = 1;
            this.bus = pad.bus | 0;
            this.played = 0;
        }
        release() { if (this.pad.gate) this.releasing = true; }
        stop(fast) { this.releasing = true; if (fast) this.relK = Math.exp(-1 / (0.004 * this.sr)); }
        // the sample position for the time pointer, keeping loops and ping-pong in range
        wrap(x) {
            const a = this.s0, b = this.s1;
            if (x >= a && x < b) return x;
            if (!this.pad.loop) return -1;
            const span = b - a;
            if (this.pad.pp) {
                let u = ((x - a) % (2 * span) + 2 * span) % (2 * span);
                return a + (u < span ? u : 2 * span - u - 1e-6);
            }
            return a + (((x - a) % span) + span) % span;
        }
        read(x) {
            const i = Math.floor(x), f = x - i, pcm = this.pcm;
            const a = pcm[i] || 0, b = pcm[i + 1 < this.s1 ? i + 1 : i] || 0;
            return a + (b - a) * f;
        }
        render(L, R, off, n) {
            if (this.paused) return;
            let i = off;
            const end = off + n;
            if (this.delay > 0) { const skip = Math.min(this.delay, n); this.delay -= skip; i += skip; }
            const step = this.base * this.dir;
            for (; i < end; i++) {
                let s;
                if (!this.granular) {
                    const x = this.wrap(this.t);
                    if (x < 0) { this.done = true; break; }
                    s = this.read(x);
                    this.t += step;
                }
                else {
                    // two grains half a grain apart read at the pitch, while time moves at the stretch
                    s = 0;
                    for (const g of this.g) {
                        const w = 1 - Math.abs(2 * g.age / this.G - 1);
                        const x = this.wrap(g.start + g.age * this.base * this.ratio * this.dir);
                        if (x >= 0) s += this.read(x) * w;
                        if (++g.age >= this.G) { g.age = 0; g.start = this.t; }
                    }
                    this.t += step * this.stretch;
                    if (this.wrap(this.t) < 0) { this.done = true; break; }
                }
                if (this.env < 1 && !this.releasing) this.env = Math.min(1, this.env + this.attInc);
                if (--this.holdLeft <= 0 && !this.releasing) this.releasing = true;
                if (this.releasing || this.choke < 1) {
                    this.env *= this.relK;
                    if (this.env < 1e-4) { this.done = true; break; }
                }
                // a short fade at the very end of a one-shot avoids clicks
                let edge = 1;
                if (!this.pad.loop) { const left = this.dir > 0 ? this.s1 - this.t : this.t - this.s0; if (left < 96) edge = Math.max(0, left / 96); }
                const v = s * this.env * edge;
                L[i] += v * this.gl; R[i] += v * this.gr;
                this.played++;
            }
        }
        // where the voice is, 0..1 of the sample (for the display)
        get progress() { return (this.t - this.s0) / Math.max(1, this.s1 - this.s0); }
    }
    // ============================================================ the engine (one per instrument)
    const instances = new WeakMap();
    function instFor(p) {
        let inst = instances.get(p);
        if (!inst) {
            inst = {
                acc: [0, 1, 2].map(() => [new Float32Array(4096), new Float32Array(4096)]),
                voices: [], direct: [], queue: [], held: new Map(), busSt: [null, null, null, null], inSt: null,
                player: null, rec: null, roll: null, dj: null, meters: new Float32Array(4), flash: new Map(), lastKey: null,
                capture: null, skip: null, input: null, tail: 0, beat: 0, playing: false, metroBeat: -1, clicks: [], busMute: [0, 0, 0, 0], pause: false,
                tmp: [new Float32Array(4096), new Float32Array(4096)], master: [new Float32Array(4096), new Float32Array(4096)], beatsPerBar: 4, bpm: 120, spb: 22050,
            };
            instances.set(p, inst);
        }
        return inst;
    }
    function grow(inst, n) {
        if (inst.acc[0][0].length >= n) return;
        const len = Math.max(n, inst.acc[0][0].length * 2);
        inst.acc = [0, 1, 2].map(() => [new Float32Array(len), new Float32Array(len)]);
        inst.tmp = [new Float32Array(len), new Float32Array(len)];
        inst.master = [new Float32Array(len), new Float32Array(len)];
    }
    function linkedKeys(p, key) {
        const links = p.sys.links || {};
        return [key].concat(links[key] || []);
    }
    // Starts a pad (from a note, the panel, the device, a pattern or a roll).
    function startPad(p, inst, key, opts) {
        const pad = Object.assign(padOf(p, key), (opts && opts.padOver) || {});
        if (!pad.s) return null;
        const entry = FLSampleBank.request(pad.s);
        if (!entry || entry.status != "ready" || !entry.pcm || entry.pcm.length < 2) return null;
        if (pad.mg > 0) for (const v of inst.voices) if (!v.done && v.pad.mg == pad.mg && v.key != key) v.stop(true);
        // a pad hit again restarts (the old voice fades out quickly)
        for (const v of inst.voices) if (!v.done && v.key == key && !v.host) v.stop(true);
        const v = new SampleVoice(p, pad, entry, Object.assign({ sr: inst.sr || 44100, songBpm: p.sys.bpm > 0 ? p.sys.bpm : inst.bpm }, opts));
        if (opts && opts.cue) { v.bus = 0; v.gl *= p.sys.cue; v.gr *= p.sys.cue; }
        inst.voices.push(v);
        inst.lastKey = key;
        inst.flash.set(key, performance.now());
        return v;
    }
    function trigger(p, inst, key, vel, delay, opts) {
        const out = [];
        for (const k of linkedKeys(p, key)) {
            const v = startPad(p, inst, k, Object.assign({ vel, delay, gate: true }, opts || {}));
            if (v) { inst.direct.push(v); out.push(v); }
        }
        return out;
    }
    // events from the panel and the device, handled at the start of the next audio block
    function postEvent(p, ev) { instFor(p).queue.push(ev); }
    function busRun(inst, b, bus, L, R, n, ctx) {
        let st = inst.busSt[b];
        if (!st || st.fx != bus.fx || st.sr != ctx.sampleRate) st = inst.busSt[b] = { fx: bus.fx, sr: ctx.sampleRate, s: FX[bus.fx].make(ctx.sampleRate), hl: 0, hr: 0, ll: 0, lr: 0 };
        const def = FX[bus.fx], c = bus.c;
        const dl = inst.tmp[0], dr = inst.tmp[1];
        dl.set(L.subarray(0, n)); dr.set(R.subarray(0, n));
        def.run(st.s, c, L, R, n, ctx);
        const hk = opk(expv(c[4], 300, 20000), ctx.sampleRate), lk = opk(expv(c[5], 20, 2000), ctx.sampleRate), mix = c[3];
        const engaged = LOOPERS.has(def.id) ? !!st.s.on : true;
        const fullWet = FULL_WET.has(def.id) || LOOPERS.has(def.id);
        for (let i = 0; i < n; i++) {
            let wl = L[i], wr = R[i];
            if (c[4] < 0.995) { st.hl += (wl - st.hl) * hk; st.hr += (wr - st.hr) * hk; wl = st.hl; wr = st.hr; }
            if (c[5] > 0.005) { st.ll += (wl - st.ll) * lk; st.lr += (wr - st.lr) * lk; wl -= st.ll; wr -= st.lr; }
            if (!Number.isFinite(wl) || !Number.isFinite(wr)) { wl = 0; wr = 0; st.s = def.make(ctx.sampleRate); }
            if (!engaged) { L[i] = dl[i]; R[i] = dr[i]; }
            else if (fullWet) { L[i] = dl[i] * (1 - mix) + wl * mix; R[i] = dr[i] * (1 - mix) + wr * mix; }
            else { L[i] = dl[i] + wl * mix; R[i] = dr[i] + wr * mix; }
        }
    }
    function patternBeats(p, pat) { return Math.max(1, pat.len || 1) * (instFor(p).bpb || 4); }
    function playRange(p, inst, pat, anchor, from, to, b0, spb) {
        if (!(to > from)) return;
        const len = patternBeats(p, pat);
        for (let k = Math.max(0, Math.floor((from - anchor) / len)); anchor + k * len < to; k++) {
            const cs = anchor + k * len;
            for (const ev of pat.ev) {
                const at = cs + ev[0] / 24;
                if (at < from || at >= to) continue;
                const vs = trigger(p, inst, padKey(ev[1], ev[2]), ev[3], Math.max(0, Math.floor((at - b0) * spb)), { gate: true });
                for (const v of vs) v.gateEnd = at + Math.max(1, ev[4] || 6) / 24;
            }
        }
    }
    // Plays the pattern sequencer, rolls and DJ decks for one block.
    function schedule(p, inst, ctx, n) {
        const b0 = ctx.beatPos, spb = ctx.spb, b1 = b0 + n / spb;
        const pl = inst.player;
        if (pl && !inst.pause) {
            const pat = p.pat[pl.key];
            if (!pat) inst.player = null;
            else {
                if (pl.anchor == null) pl.anchor = pl.startAt != null ? pl.startAt : b0;
                const len = patternBeats(p, pat);
                // a pattern chosen while another plays takes over when the current one comes round
                let switchAt = Infinity;
                if (pl.next) switchAt = b0 < pl.anchor ? pl.anchor : pl.anchor + Math.max(1, Math.ceil((b0 - pl.anchor) / len - 1e-9)) * len;
                playRange(p, inst, pat, pl.anchor, Math.max(b0, pl.anchor), Math.min(b1, switchAt), b0, spb);
                if (switchAt < b1) {
                    pl.key = pl.next; pl.next = null; pl.anchor = switchAt;
                    const np = p.pat[pl.key];
                    if (np) playRange(p, inst, np, switchAt, switchAt, b1, b0, spb);
                }
            }
        }
        // gates of pattern notes end on time
        for (const v of inst.direct) if (v.gateEnd != null && v.gateEnd < b1 && !v.releasing) { v.release(); }
        // roll: the held pad repeats on the grid
        const roll = inst.roll;
        if (roll && roll.key) {
            const div = ROLL_RATES[clamp(p.sys.roll | 0, 0, ROLL_RATES.length - 1)][0];
            let k = Math.ceil(b0 / div - 1e-9);
            for (; k * div < b1; k++) trigger(p, inst, roll.key, roll.vel || 100, Math.floor((k * div - b0) * spb), { gate: false });
        }
        // metronome
        if (p.sys.metro && (inst.player || inst.rec || inst.countIn)) {
            const bar = inst.bpb || 4;
            for (let k = Math.ceil(b0 - 1e-9); k < b1; k++) inst.clicks.push({ at: Math.floor((k - b0) * spb), accent: ((k % bar) + bar) % bar == 0, t: 0 });
        }
    }
    function processInstrument(state, params, L, R, start, end, ctx) {
        const p = fill(params);
        const inst = instFor(p);
        const n = end - start;
        grow(inst, n);
        inst.sr = ctx.sampleRate;
        inst.bpm = ctx.bpm || 120;
        inst.bpb = ctx.beatsPerBar || 4;
        const live = deviceLive();
        const spb = ctx.samplesPerBeat > 0 ? ctx.samplesPerBeat : inst.sr / 2;
        const c2 = { sampleRate: inst.sr, beatPos: ctx.beatPos || 0, spb, bpm: ctx.bpm, beatsPerBar: ctx.beatsPerBar, playing: ctx.playing };
        if (inst.lastEnd != null && Math.abs(c2.beatPos - inst.lastEnd) > 0.02) {
            const jump = c2.beatPos - inst.lastEnd;
            if (inst.player && inst.player.anchor != null) inst.player.anchor += jump;
            if (inst.rec) { inst.rec.start += jump; for (const o of inst.rec.open.values()) o.at += jump; }
            for (const v of inst.direct) if (v.gateEnd != null) v.gateEnd += jump;
        }
        inst.lastEnd = c2.beatPos + n / spb;
        inst.beat = c2.beatPos;
        inst.spb = spb;
        inst.playing = !!ctx.playing;
        // events from the panel / device
        const queue = inst.queue.splice(0);
        if (live) {
            for (const ev of queue) handleEvent(p, inst, ev, c2);
            schedule(p, inst, c2, n);
        }
        else {
            for (const v of inst.voices) v.done = true;
            inst.player = null; inst.roll = null;
        }
        // panel / pattern voices
        for (const v of inst.direct) if (!v.done && !(inst.pause && !v.cueVoice)) v.render(inst.acc[v.bus][0], inst.acc[v.bus][1], 0, n);
        inst.direct = inst.direct.filter(v => !v.done);
        inst.voices = inst.voices.filter(v => !v.done);
        // external source through the input effect
        const mixL = inst.master[0], mixR = inst.master[1];
        mixL.fill(0, 0, n); mixR.fill(0, 0, n);
        if (inst.input && inst.input.monitor && live) {
            const src = inst.input, tl = inst.tmp[0], tr = inst.tmp[1];
            for (let i = 0; i < n; i++) {
                const have = src.w - src.r;
                if (have > 0) { tl[i] = src.l[src.r & src.mask] * p.sys.inGain; tr[i] = src.rr[src.r & src.mask] * p.sys.inGain; src.r++; }
                else { tl[i] = 0; tr[i] = 0; }
            }
            if (src.w - src.r > inst.sr * 0.25) src.r = src.w - Math.round(inst.sr * 0.05);
            const il = Float32Array.from(tl.subarray(0, n)), ir = Float32Array.from(tr.subarray(0, n));
            if (p.inFx.on) busRun(inst, 4, p.inFx, il, ir, n, c2);
            for (let i = 0; i < n; i++) { mixL[i] += il[i]; mixR[i] += ir[i]; }
        }
        // buses 1 and 2 take their pads, then everything goes through buses 3 and 4
        for (let b = 0; b < 3; b++) {
            const [bl, br] = inst.acc[b];
            if (b > 0) {
                const bus = p.bus[b - 1];
                if (bus.on) busRun(inst, b - 1, bus, bl, br, n, c2);
                if (inst.busMute[b - 1]) bl.fill(0, 0, n), br.fill(0, 0, n);
            }
            for (let i = 0; i < n; i++) { mixL[i] += bl[i]; mixR[i] += br[i]; }
            bl.fill(0, 0, n); br.fill(0, 0, n);
        }
        for (let b = 2; b < 4; b++) {
            const bus = p.bus[b];
            if (bus.on) busRun(inst, b, bus, mixL, mixR, n, c2);
            if (inst.busMute[b]) { mixL.fill(0, 0, n); mixR.fill(0, 0, n); }
        }
        // metronome clicks
        if (inst.clicks.length) {
            const sr = inst.sr;
            for (const ck of inst.clicks) {
                for (let i = Math.max(0, ck.at); i < n; i++) {
                    const t = ck.t++ / sr;
                    if (t > 0.03) { ck.done = true; break; }
                    const v = Math.sin(TWO_PI * (ck.accent ? 1760 : 1320) * t) * Math.exp(-t * 160) * p.sys.mvol * 0.6;
                    mixL[i] += v; mixR[i] += v;
                }
                ck.at -= n;
            }
            inst.clicks = inst.clicks.filter(c => !c.done && c.at < n * 4);
        }
        // sampling the output (resample) and the always-on skip-back buffer
        const cap = inst.capture;
        if (cap && cap.kind == "resample" && cap.running) cap.push(mixL, mixR, n);
        if (inst.skip) inst.skip.push(mixL, mixR, n);
        // meters and tails
        let peak = 0;
        for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
        inst.meters[0] = Math.max(peak, inst.meters[0] * 0.92);
        inst.tail = peak > 1e-4 ? 0 : inst.tail + n;
        if (!live || !p.sys.local) return;
        const g = p.vol * Config.pluginBaseExpression * 1.6;
        for (let i = 0; i < n; i++) { L[start + i] += mixL[i] * g; R[start + i] += mixR[i] * g; }
    }
    // Panel and device events: {t: "on"/"off", key, vel, ...}
    function handleEvent(p, inst, ev, ctx) {
        if (ev.t == "on") {
            if (inst.rec && inst.rec.armed && !ev.noRec) recordHit(p, inst, ev, ctx);
            const vs = trigger(p, inst, ev.key, ev.vel || 100, 0, { gate: true, semis: ev.semis || 0, cue: ev.cue });
            const id = ev.id || ev.key;
            inst.held.set(id, (inst.held.get(id) || []).concat(vs));
            if (ev.roll) inst.roll = { key: ev.key, vel: ev.vel };
        }
        else if (ev.t == "off") {
            const id = ev.id || ev.key;
            const vs = inst.held.get(id) || [];
            if (!ev.hold) for (const v of vs) v.release();
            inst.held.delete(id);
            if (inst.rec && inst.rec.armed) recordRelease(p, inst, ev, ctx);
            if (inst.roll && inst.roll.key == ev.key) inst.roll = null;
        }
        else if (ev.t == "stop") {
            for (const v of inst.voices) if (!ev.key || v.key == ev.key) v.stop(true);
        }
        else if (ev.t == "roll") inst.roll = ev.key ? { key: ev.key, vel: ev.vel || 100 } : null;
        else if (ev.t == "play") {
            const bpb = inst.bpb || 4;
            const anchorBar = ctx.playing ? Math.ceil(ctx.beatPos / bpb - 1e-6) * bpb : ctx.beatPos;
            if (inst.player && ev.queue) { inst.player.next = ev.key; }
            else inst.player = { key: ev.key, anchor: null, startAt: ev.now ? ctx.beatPos : anchorBar, cycle: 0, next: null };
        }
        else if (ev.t == "stopPattern") { inst.player = null; for (const v of inst.direct) v.stop(false); }
        else if (ev.t == "rec") startRecording(p, inst, ev, ctx);
        else if (ev.t == "recStop") stopRecording(p, inst);
    }
    // ---- pattern recording (realtime)
    function startRecording(p, inst, ev, ctx) {
        const key = ev.key;
        if (!p.pat[key]) p.pat[key] = { len: p.sys.plen | 0 || 1, ev: [] };
        inst.undo = { key, pat: JSON.parse(JSON.stringify(p.pat[key])) };
        if (p.sys.recMode == 1) p.pat[key].ev = [];
        const bpb = inst.bpb || 4;
        const start = ctx.playing ? Math.ceil(ctx.beatPos / bpb - 1e-6) * bpb : ctx.beatPos + (p.sys.cnt ? bpb : 0);
        inst.countIn = p.sys.cnt ? { until: start } : null;
        inst.rec = { key, armed: true, start, open: new Map() };
        inst.player = { key, anchor: start, startAt: start, cycle: 0, next: null };
    }
    function stopRecording(p, inst) {
        if (inst.rec) for (const [k, e] of inst.rec.open) { e[4] = Math.max(1, e[4] || 6); }
        inst.rec = null;
        inst.countIn = null;
    }
    function recordHit(p, inst, ev, ctx) {
        const rec = inst.rec, pat = p.pat[rec.key];
        if (!pat) return;
        const len = patternBeats(p, pat);
        let pos = ctx.beatPos - rec.start;
        if (pos < 0) return; // still counting in
        pos = ((pos % len) + len) % len;
        const q = QUANTIZE[clamp(p.sys.q | 0, 0, QUANTIZE.length - 1)][0];
        if (q > 0) pos = (Math.round(pos / q) * q) % len;
        const { bank, label } = parseKey(ev.key);
        const e = [Math.round(pos * 24), bank, label, ev.vel || 100, 6];
        pat.ev.push(e);
        pat.ev.sort((a, b) => a[0] - b[0]);
        rec.open.set(ev.key, { e, at: ctx.beatPos });
        inst.changed = true;
    }
    function recordRelease(p, inst, ev, ctx) {
        const o = inst.rec.open.get(ev.key);
        if (!o) return;
        o.e[4] = Math.max(1, Math.round((ctx.beatPos - o.at) * 24));
        inst.rec.open.delete(ev.key);
    }

    // ---- host voices (song notes)
    function createVoice(params, info) {
        const p = fill(params);
        const inst = instFor(p);
        inst.sr = info.sampleRate;
        if (!info.isNoise && (info.notePitch | 0) == KEEPALIVE) return { keep: true, inst, done: false };
        if (!deviceLive()) return { done: true };
        const where = noteToPad(p, info.notePitch | 0, !!info.isNoise);
        if (!where) return { done: true };
        const sv = startPad(p, inst, where.key, { sr: info.sampleRate, vel: Math.round(127 * (info.velocity == undefined ? 0.8 : info.velocity)), semis: where.semis, gate: true });
        if (!sv) return { done: true };
        sv.host = true;
        return { sv, inst, done: false };
    }
    function render(voice, out, start, len, info) {
        if (voice.done) return;
        const inst = voice.inst;
        if (voice.keep) {
            // keeps the instrument awake while the panel, patterns or effect tails are playing
            const busy = inst.direct.length > 0 || inst.player || inst.roll || inst.queue.length > 0 || inst.tail < inst.sr * 4 || (inst.input && inst.input.monitor) || (inst.capture && inst.capture.running) || inst.clicks.length;
            if (!info.gate && !busy) voice.done = true;
            return;
        }
        const sv = voice.sv;
        if (!info.gate) sv.release();
        if (!deviceLive()) { voice.done = true; return; }
        grow(inst, len);
        sv.render(inst.acc[sv.bus][0], inst.acc[sv.bus][1], 0, len);
        if (sv.done) {
            // stay until the bus effects have rung out (the instrument goes to sleep without a voice)
            voice.done = inst.tail > inst.sr * 2 || inst.voices.some(v => v != sv && !v.done);
            if (!voice.done) voice.tailing = (voice.tailing || 0) + len;
            if (voice.tailing > inst.sr * 8) voice.done = true;
        }
    }
    function createInstrumentState() { return {}; }

    // ============================================================ panel look (the device's top panel)
    A.addStyle(`
.cb-window.cb-plugin-spstation { --cb-plugin-color: #e34234; }
.cb-plugin-spstation .cb-window-body { background: #0f0f11 !important; padding: 10px !important; }
.sp-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; user-select: none; -webkit-user-select: none; }
.sp-strip { width: 600px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 11px; color: #9a9ca2; }
.sp-strip .cb-select, .sp-strip .cb-button, .sp-strip .cb-toggle { font-size: 11px; }
.sp-face { width: 600px; box-sizing: border-box; position: relative; padding: 14px 22px 10px; border-radius: 22px; background: linear-gradient(170deg, #2b2c30, #1e1f22 60%, #1a1b1d); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.6); font-family: Arial, Helvetica, sans-serif; }
.sp-screw { position: absolute; width: 11px; height: 11px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #9c9da1, #3e3f43 70%); box-shadow: inset 0 0 0 1px #151517; }
.sp-screw::after { content: ""; position: absolute; left: 2px; right: 2px; top: 5px; height: 1px; background: #1b1b1d; transform: rotate(35deg); }
.sp-top { display: flex; justify-content: space-between; align-items: baseline; padding: 0 12px; }
.sp-brand { color: #e8e8ea; font-size: 22px; font-weight: 800; letter-spacing: 0.02em; }
.sp-brand small { font-size: 10px; font-weight: 600; color: #9c9ea4; margin-left: 6px; letter-spacing: 0.08em; }
.sp-model { color: #f2f2f2; font-size: 21px; font-weight: 900; font-style: italic; letter-spacing: 0.08em; -webkit-text-stroke: 1px #f2f2f2; color: transparent; }
.sp-knobrow { margin: 8px 6px 2px; display: grid; grid-template-columns: repeat(4, 1fr); padding: 8px 6px 4px; border-radius: 16px; background: #141516; box-shadow: inset 0 2px 6px rgba(0,0,0,0.7); }
.sp-kcell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.sp-knob { width: 58px; height: 58px; border-radius: 50%; position: relative; cursor: ns-resize; touch-action: none; background: radial-gradient(circle at 40% 30%, #3a3b3f, #0c0c0d 72%); box-shadow: 0 4px 8px rgba(0,0,0,0.7), inset 0 0 0 2px #1e1f21; }
.sp-knob::before { content: ""; position: absolute; inset: 7px; border-radius: 50%; background: repeating-conic-gradient(#202124 0 6deg, #151517 6deg 12deg); }
.sp-knob .sp-needle { position: absolute; left: 50%; top: 6px; width: 3px; height: 20px; margin-left: -1.5px; border-radius: 2px; background: #f4f4f4; transform-origin: 50% 23px; }
.sp-knob.sp-small { width: 44px; height: 44px; }
.sp-knob.sp-small .sp-needle { top: 5px; height: 14px; transform-origin: 50% 17px; }
.sp-klabel { font-size: 9px; color: #e8e8ea; letter-spacing: 0.06em; text-transform: uppercase; min-height: 11px; text-align: center; }
.sp-klabel.sp-minmax { width: 100%; display: flex; justify-content: space-between; padding: 0 6px; box-sizing: border-box; }
.sp-centre { display: grid; grid-template-columns: 1fr 284px 1fr; align-items: center; margin: 12px 0 6px; padding: 10px 6px; border-radius: 26px; background: #121314; box-shadow: inset 0 2px 8px rgba(0,0,0,0.8); }
.sp-fxcol { display: flex; flex-direction: column; gap: 10px; }
.sp-fxcol.sp-left { align-items: flex-end; padding-right: 4px; }
.sp-fxcol.sp-right { align-items: flex-start; padding-left: 4px; }
.sp-display { width: 278px; height: 278px; border-radius: 50%; margin: 0 auto; background: radial-gradient(circle at 50% 40%, #232427, #0b0b0c 70%); box-shadow: 0 0 0 6px #18191b, inset 0 0 18px rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.sp-oled { width: 256px; height: 128px; background: #050506; image-rendering: pixelated; filter: drop-shadow(0 0 2px rgba(200,225,255,0.45)); border-radius: 6px; box-shadow: 0 0 0 2px #0e0e10; cursor: default; }
.sp-btn { position: relative; min-width: 66px; height: 34px; padding: 0 6px; box-sizing: border-box; border-radius: 7px; border: none; cursor: pointer; background: linear-gradient(#26272a, #121314); box-shadow: 0 3px 0 #050506, inset 0 1px 0 rgba(255,255,255,0.08); color: #f6c27c; font: 800 10.5px/1.05 Arial, Helvetica, sans-serif; text-transform: uppercase; letter-spacing: 0.02em; display: flex; align-items: center; justify-content: center; text-align: center; touch-action: none; }
.sp-btn:active, .sp-btn.sp-down { transform: translateY(2px); box-shadow: 0 1px 0 #050506; }
.sp-btn.sp-lit { color: #fff3dc; background: linear-gradient(#5a3b16, #2c1d0b); box-shadow: 0 3px 0 #050506, 0 0 10px rgba(255,170,60,0.55), inset 0 0 6px rgba(255,190,90,0.6); }
.sp-btn.sp-blink { animation: sp-blink 0.5s steps(1) infinite; }
@keyframes sp-blink { 50% { color: #f6c27c; background: linear-gradient(#26272a, #121314); box-shadow: 0 3px 0 #050506; } }
.sp-btn.sp-red { background: linear-gradient(#e46a73, #b9404b); color: #4a0d14; }
.sp-btn.sp-red.sp-lit { background: linear-gradient(#ff8c96, #e3505c); color: #fff; box-shadow: 0 3px 0 #050506, 0 0 12px rgba(255,80,90,0.8); }
.sp-btn.sp-cream { min-width: 46px; background: linear-gradient(#f3d9b0, #c9a874); color: #2a1a08; }
.sp-btn.sp-cream.sp-lit { background: linear-gradient(#fff2d8, #f1c27a); box-shadow: 0 3px 0 #050506, 0 0 10px rgba(255,210,120,0.8); }
.sp-btn.sp-fx { min-width: 108px; height: 42px; border-radius: 12px; font-size: 12px; font-style: italic; color: #f6c27c; }
.sp-btn.sp-fx.sp-left { border-radius: 18px 10px 10px 18px; transform: skewX(-6deg); }
.sp-btn.sp-fx.sp-right { border-radius: 10px 18px 18px 10px; transform: skewX(6deg); }
.sp-btn.sp-white { color: #f2f2f2; }
.sp-row { display: flex; align-items: flex-end; gap: 8px; margin: 3px 0; }
.sp-group { display: flex; flex-direction: column; gap: 2px; }
.sp-group-title { font-size: 9px; color: #dcdcdc; letter-spacing: 0.06em; text-align: center; border-top: 1px solid #8e8f93; padding-top: 1px; margin: 0 2px; background: #3a3b3f; color: #e6e6e6; }
.sp-group-btns { display: flex; gap: 8px; }
.sp-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.sp-sub { font-size: 8.5px; color: #e8e8ea; letter-spacing: 0.05em; height: 10px; text-transform: uppercase; white-space: nowrap; }
.sp-enter { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-left: auto; }
.sp-padarea { display: grid; grid-template-columns: repeat(4, 1fr) 1fr; gap: 8px 10px; margin-top: 6px; }
.sp-chlabels { grid-column: 1 / 5; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 9px; color: #e8e8ea; text-align: center; }
.sp-chlabels span { border-top: 1px solid #9a9ba0; border-left: 1px solid #9a9ba0; border-right: 1px solid #9a9ba0; height: 6px; line-height: 0; padding-top: 1px; }
.sp-padcell { display: flex; flex-direction: column; align-items: stretch; gap: 3px; }
.sp-pad { height: 82px; border-radius: 9px; position: relative; cursor: pointer; touch-action: none; background: linear-gradient(160deg, #1c1d20, #0b0b0c 70%); box-shadow: 0 4px 0 #050506, inset 0 0 0 1px #2a2b2f; transition: box-shadow 0.05s, background 0.05s; }
.sp-pad .sp-num { position: absolute; right: 10px; top: 6px; font: 900 26px/1 Arial, sans-serif; color: #d9cdf6; text-shadow: 0 0 6px rgba(190,160,255,0.35); }
.sp-pad .sp-dj { position: absolute; left: 9px; bottom: 9px; font: 800 8.5px/1 Arial, sans-serif; color: #c9b8f5; border: 1.5px solid #9f89d6; border-radius: 4px; padding: 2px 3px; }
.sp-pad .sp-name { position: absolute; left: 8px; right: 8px; top: 38px; font: 600 8.5px/1.1 Arial, sans-serif; color: rgba(220,210,250,0.55); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-transform: uppercase; }
.sp-pad.sp-loaded { background: linear-gradient(160deg, #262131, #0e0c12 72%); }
.sp-pad.sp-sel { box-shadow: 0 4px 0 #050506, inset 0 0 0 2px #b59cff; }
.sp-pad.sp-hot { background: linear-gradient(160deg, #7d64c9, #2c2152 70%); box-shadow: 0 2px 0 #050506, 0 0 18px rgba(170,140,255,0.8), inset 0 0 0 1px #c9b6ff; transform: translateY(2px); }
.sp-pad.sp-on { background: linear-gradient(160deg, #4b3c80, #1a1430 72%); }
.sp-pad.sp-alt { background: linear-gradient(160deg, #6b2a33, #210a0e 72%); }
.sp-pad.sp-blue { background: linear-gradient(160deg, #24506b, #081822 72%); }
.sp-pad.sp-amber { background: linear-gradient(160deg, #6b4a14, #22170a 72%); }
.sp-fn { font: 800 8.5px/1 Arial, sans-serif; color: #e8e8ea; text-align: center; border: 1.2px solid #a0a1a6; border-radius: 3px; padding: 2px 0; letter-spacing: 0.04em; }
.sp-fn.sp-lit { color: #111; background: #f6c27c; border-color: #f6c27c; }
.sp-side { height: 82px; border-radius: 9px; background: linear-gradient(160deg, #1e1f22, #0c0c0d 70%); box-shadow: 0 4px 0 #050506, inset 0 0 0 1px #2a2b2f; color: #f6c27c; font: 900 15px/1.05 Arial, sans-serif; display: flex; align-items: flex-start; justify-content: center; padding-top: 12px; text-align: center; cursor: pointer; touch-action: none; }
.sp-side.sp-lit { color: #fff3dc; box-shadow: 0 4px 0 #050506, 0 0 14px rgba(255,170,60,0.6), inset 0 0 0 1px #f6c27c; background: linear-gradient(160deg, #4a3012, #160e05 72%); }
.sp-side.sp-blink { animation: sp-blink2 0.5s steps(1) infinite; }
@keyframes sp-blink2 { 50% { color: #f6c27c; box-shadow: 0 4px 0 #050506, inset 0 0 0 1px #2a2b2f; background: linear-gradient(160deg, #1e1f22, #0c0c0d 70%); } }
.sp-bottom { display: flex; justify-content: space-around; font-size: 9px; color: #c8c9cc; letter-spacing: 0.06em; margin-top: 10px; }
.sp-lock { position: absolute; inset: 0; z-index: 5; border-radius: 22px; background: rgba(8,8,10,0.86); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #eee; text-align: center; padding: 30px; }
.sp-lock b { font-size: 18px; }
.sp-lock .cb-hint { max-width: 380px; }
.sp-help { width: 600px; font-size: 11px; color: #9a9ca2; }
`);

    // ============================================================ the panel
    const DJ_LABELS = { 1: "BEND+", 2: "BPM+", 3: "BEND+", 4: "BPM+", 5: "BEND-", 6: "BPM-", 7: "BEND-", 8: "BPM-", 9: "|◀◀", 10: "SYNC", 11: "|◀◀", 12: "SYNC", 13: "▶/II", 14: "CUE", 15: "▶/II", 16: "CUE" };
    const SHIFT_LABELS = { 1: "FIXED VELOCITY", 2: "16 VELOCITY", 3: "CUE", 4: "CHROMATIC", 5: "EXCHANGE", 6: "INIT PARAM", 7: "PAD LINK", 8: "MUTE GROUPS", 9: "METRONOME", 10: "COUNT-IN", 11: "TAP TEMPO", 12: "GAIN", 13: "UTILITY", 14: "IMPORT/EXPORT", 15: "PAD SETTING", 16: "EFX SETTING" };
    const projectsKey = "carrotSpProjects";
    function loadProjects() { try { return JSON.parse(window.localStorage.getItem(projectsKey) || "{}") || {}; } catch (error) { return {}; } }
    function saveProjects(all) { try { window.localStorage.setItem(projectsKey, JSON.stringify(all)); return true; } catch (error) { return false; } }

    function buildEditor(host) {
        const P = () => fill(host.params());
        const inst = () => instFor(P());
        const root = HTML.div({ class: "sp-wrap", tabindex: "0" });
        const h = hw();
        const ui = {
            shift: false, shiftLatched: false, bank: P().ui.bank | 0, pad: P().ui.pad | 0 || 13, bus: 0, mode: "splash", menu: null, msg: null, splashUntil: performance.now() + 1100,
            hold: false, roll: false, chromatic: false, chromOct: 0, vel16: false, cue: false, dj: false, pattern: false, trrec: null, mg: false, mgValue: 1, gain: false,
            pick: null, latched: new Set(), fxView: 0, pageUntil: 0, padsDown: new Map(), keepTimer: null, taps: [], lastPattern: null,
            sampling: null, resampling: null, skipStart: 0, chop: 8, startendZoom: 0,
        };
        const changed = (commit = true) => { host.changed(commit); };
        const say = (text, ms = 1300) => { ui.msg = { text: String(text).toUpperCase(), until: performance.now() + ms }; };
        const curKey = () => padKey(ui.bank, ui.pad);
        const curPad = () => padOf(P(), curKey());
        const entryOf = (pad) => pad.s ? FLSampleBank.request(pad.s) : null;
        // the instrument sleeps without a note: hold the keep-alive note for a moment
        const keepAwake = () => {
            if (ui.keepTimer) return;
            host.noteOn(KEEPALIVE);
            ui.keepTimer = setTimeout(() => { host.noteOff(KEEPALIVE); ui.keepTimer = null; }, 300);
        };
        const post = (ev) => { postEvent(P(), ev); keepAwake(); };
        const sendDevice = (data) => { if (h && h.output) h.send(data); };

        // ---------------------------------------------------------- knobs and buttons
        const knob = (label, get, set, opts = {}) => {
            const el = HTML.div({ class: "sp-knob" + (opts.small ? " sp-small" : ""), title: opts.title || label });
            const needle = HTML.div({ class: "sp-needle" });
            el.appendChild(needle);
            const draw = () => { needle.style.transform = "rotate(" + (-135 + 270 * clamp(get(), 0, 1)) + "deg)"; };
            let startY = 0, startV = 0, dragging = false;
            el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); dragging = true; startY = e.clientY; startV = get(); });
            el.addEventListener("pointermove", (e) => { if (!dragging) return; set(clamp(startV + (startY - e.clientY) / (e.shiftKey ? 600 : 160), 0, 1), e); draw(); });
            const up = () => { if (dragging) { dragging = false; if (opts.end) opts.end(); } };
            el.addEventListener("pointerup", up);
            el.addEventListener("pointercancel", up);
            el.addEventListener("wheel", (e) => { e.preventDefault(); set(clamp(get() - Math.sign(e.deltaY) * 0.02, 0, 1), e); draw(); if (opts.end) opts.end(); }, { passive: false });
            el.draw = draw;
            draw();
            return el;
        };
        const buttons = {};
        const button = (id, label, opts = {}) => {
            const el = HTML.button({ type: "button", class: "sp-btn" + (opts.cls ? " " + opts.cls : ""), title: opts.title || label.replace(/<br>/g, " ") });
            el.innerHTML = label;
            el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.classList.add("sp-down"); press(id, true, e); });
            const up = (e) => { if (!el.classList.contains("sp-down")) return; el.classList.remove("sp-down"); press(id, false, e); };
            el.addEventListener("pointerup", up);
            el.addEventListener("pointerleave", up);
            buttons[id] = el;
            return el;
        };
        const cell = (el, sub) => HTML.div({ class: "sp-cell" }, el, HTML.div({ class: "sp-sub" }, sub || ""));
        const group = (title, ...cells) => HTML.div({ class: "sp-group" }, HTML.div({ class: "sp-group-title" }, title), HTML.div({ class: "sp-group-btns" }, ...cells));

        // ---------------------------------------------------------- knob row
        const ctrlLabels = [HTML.div({ class: "sp-klabel" }), HTML.div({ class: "sp-klabel" }), HTML.div({ class: "sp-klabel" })];
        const busOf = () => P().bus[ui.bus];
        const ctrlIndex = (i) => i + (ui.shift ? 3 : 0);
        const ctrlKnobs = [0, 1, 2].map(i => knob("CTRL " + (i + 1), () => ctrlGet(i), (v) => ctrlSet(i, v), { end: () => changed(true) }));
        const volKnob = knob("VOLUME", () => P().vol / 1.25, (v) => { P().vol = v * 1.25; changed(false); }, { end: () => changed(true), title: "Volume" });
        const knobRow = HTML.div({ class: "sp-knobrow" },
            HTML.div({ class: "sp-kcell" }, volKnob, HTML.div({ class: "sp-klabel sp-minmax" }, HTML.span("MIN"), HTML.span("VOLUME"), HTML.span("MAX"))),
            ...ctrlKnobs.map((k, i) => HTML.div({ class: "sp-kcell" }, k, ctrlLabels[i])));
        function ctrlGet(i) {
            const p = P();
            const m = ui.mode;
            if (ui.dj) return [inst().djVol ? inst().djVol[0] : 0.8, inst().djVol ? inst().djVol[1] : 0.8, inst().djX == undefined ? 0.5 : inst().djX][i];
            if (m == "startend") { const pad = curPad(); return [pad.st, pad.en, ui.startendZoom][i]; }
            if (m == "pitch") { const pad = curPad(); return [(pad.pitch + 12) / 24, (Math.log2(pad.speed) + 1) / 2, 0.5][i]; }
            if (m == "envelope") { const pad = curPad(); return [Math.sqrt(pad.att / 4), pad.hold >= 10 ? 1 : Math.sqrt(pad.hold / 10), Math.sqrt(pad.rel / 4)][i]; }
            if (m == "chop") return [(ui.chop - 2) / 30, 0, 0][i];
            if (m == "gain") return i == 0 ? (curPad().gain + 24) / 36 : 0.5;
            if (ui.trrec) return [ui.trrec.bar / Math.max(1, (p.pat[ui.trrec.key] || { len: 1 }).len - 1 || 1), ui.trrec.vel / 127, 0][i];
            return busOf().c[ctrlIndex(i)];
        }
        function ctrlSet(i, v) {
            const p = P(), m = ui.mode, key = curKey();
            if (ui.dj) {
                const it = inst();
                it.djVol = it.djVol || [0.8, 0.8];
                if (i < 2) it.djVol[i] = v; else it.djX = v;
                return;
            }
            if (m == "startend") {
                const pad = curPad();
                if (i == 0) padSet(p, key, "st", +Math.min(v, pad.en - 0.001).toFixed(5));
                else if (i == 1) padSet(p, key, "en", +Math.max(v, pad.st + 0.001).toFixed(5));
                else ui.startendZoom = v;
                changed(false);
                return;
            }
            if (m == "pitch") {
                if (i == 0) padSet(p, key, "pitch", Math.round(v * 24 - 12));
                else if (i == 1) padSet(p, key, "speed", +Math.pow(2, v * 2 - 1).toFixed(3));
                changed(false);
                return;
            }
            if (m == "envelope") {
                if (i == 0) padSet(p, key, "att", +(v * v * 4).toFixed(3));
                else if (i == 1) padSet(p, key, "hold", v > 0.99 ? 10 : +(v * v * 10).toFixed(3));
                else padSet(p, key, "rel", +(Math.max(0.01, v * v * 4)).toFixed(3));
                changed(false);
                return;
            }
            if (m == "chop") { if (i == 0) ui.chop = clamp(Math.round(2 + v * 30), 2, 32); return; }
            if (m == "gain") { if (i == 0) { padSet(p, key, "gain", Math.round(v * 36 - 24)); changed(false); } return; }
            if (ui.trrec) {
                const pat = p.pat[ui.trrec.key];
                if (i == 0 && pat) ui.trrec.bar = clamp(Math.round(v * (pat.len - 1)), 0, pat.len - 1);
                if (i == 1) ui.trrec.vel = clamp(Math.round(v * 127), 1, 127);
                return;
            }
            const bus = busOf(), c = ctrlIndex(i);
            bus.c[c] = +v.toFixed(4);
            ui.fxView = performance.now() + 1800;
            changed(false);
            if (p.sys.sendCtl) sendDevice([0xB0 | ui.bus, [16, 17, 18, 80, 81, 82][c], Math.round(v * 127)]);
        }

        // ---------------------------------------------------------- display
        const oled = new Oled(128, 64);
        const canvas = HTML.canvas({ class: "sp-oled", width: "256", height: "128" });
        const g2 = canvas.getContext("2d");
        const display = HTML.div({ class: "sp-display" }, canvas);
        // clicking a menu line picks it, the wheel turns VALUE
        canvas.addEventListener("pointerdown", (e) => {
            if (!ui.menu) { press("enter", true, e); return; }
            const r = canvas.getBoundingClientRect(), y = (e.clientY - r.top) / r.height * 64;
            const line = Math.floor((y - 11) / 10);
            const top = Math.max(0, Math.min(ui.menu.index - 2, ui.menu.items.length - 5));
            if (line >= 0 && line < 5 && top + line < ui.menu.items.length) ui.menu.index = top + line;
        });
        canvas.addEventListener("wheel", (e) => { e.preventDefault(); valueTurn(e.deltaY < 0 ? 1 : -1, e.shiftKey); }, { passive: false });

        // ---------------------------------------------------------- the panel layout (as on the device)
        const fxBtn = (id, label, side) => button(id, label, { cls: "sp-fx sp-" + side, title: label.replace(/<br>/g, " ") + " (on the selected bus)" });
        const centre = HTML.div({ class: "sp-centre" },
            HTML.div({ class: "sp-fxcol sp-left" }, fxBtn("fx0", "FILTER<br>+DRIVE", "left"), fxBtn("fx1", "RESONATOR", "left"), fxBtn("fx2", "DELAY", "left")),
            display,
            HTML.div({ class: "sp-fxcol sp-right" }, fxBtn("fx3", "ISOLATOR", "right"), fxBtn("fx4", "DJFX<br>LOOPER", "right"), fxBtn("mfx", "MFX", "right")));
        const valueKnob = knob("VALUE", () => (ui.valueAngle || 0), () => { }, { small: true });
        // VALUE is an endless encoder: drag or wheel turns it, a click pushes it (ENTER)
        {
            let lastY = null, moved = 0;
            valueKnob.addEventListener("pointerdown", (e) => { lastY = e.clientY; moved = 0; }, true);
            valueKnob.addEventListener("pointermove", (e) => {
                if (lastY == null || !(e.buttons & 1)) return;
                const d = lastY - e.clientY;
                if (Math.abs(d) >= 8) { const steps = Math.trunc(d / 8); lastY -= steps * 8; moved += Math.abs(steps); valueTurn(steps, e.shiftKey); ui.valueAngle = ((ui.valueAngle || 0) + steps * 0.04 + 10) % 1; valueKnob.draw(); }
            }, true);
            valueKnob.addEventListener("pointerup", (e) => { if (lastY != null && moved == 0) press("enter", true, e); lastY = null; }, true);
            valueKnob.addEventListener("wheel", (e) => { e.preventDefault(); e.stopImmediatePropagation(); valueTurn(e.deltaY < 0 ? 1 : -1, e.shiftKey); ui.valueAngle = ((ui.valueAngle || 0) + (e.deltaY < 0 ? 0.04 : -0.04) + 10) % 1; valueKnob.draw(); }, { passive: false, capture: true });
        }
        const rowA = HTML.div({ class: "sp-row" },
            group("PATTERN SEQUENCER", cell(button("patsel", "PATTERN<br>SELECT"), "UNDO"), cell(button("patedit", "PATTERN<br>EDIT")), cell(button("recset", "RECORD<br>SETTING"))),
            group("SAMPLE EDIT", cell(button("startend", "START/<br>END"), "CHOP"), cell(button("pitch", "PITCH/<br>SPEED"), "ENVELOPE"), cell(button("mark", "MARK"))),
            HTML.div({ class: "sp-enter" }, HTML.div({ class: "sp-sub" }, "PUSH ENTER"), valueKnob));
        const rowB = HTML.div({ class: "sp-row" },
            group("SAMPLING", cell(button("del", "DEL", { cls: "sp-white" })), cell(button("rec", "REC", { cls: "sp-red" })), cell(button("resample", "RESAMPLE", { cls: "sp-red" }))),
            group("SAMPLE MODE", cell(button("bpmsync", "BPM<br>SYNC")), cell(button("gate", "GATE")), cell(button("loop", "LOOP"), "PING-PONG"), cell(button("reverse", "REVERSE")), cell(button("roll", "ROLL"), "ROLL SET")));
        const bankBtns = ["A/F", "B/G", "C/H", "D/I", "E/J"].map((l, i) => button("bank" + i, l, { cls: "sp-cream" }));
        const rowC = HTML.div({ class: "sp-row" },
            HTML.div({ class: "sp-group-btns", style: "align-items: flex-start;" }, cell(button("exit", "EXIT", { cls: "sp-white" }), "PATTERN STOP"), cell(button("copy", "COPY")), cell(button("remain", "REMAIN"), "CURRENT PAD")),
            group("BANK", ...bankBtns.map((b, i) => cell(b, i == 3 ? "DJ MODE" : "")), cell(button("shift", "SHIFT"))));
        // pads
        const padEls = {}, fnEls = {};
        const padArea = HTML.div({ class: "sp-padarea" }, HTML.div({ class: "sp-chlabels" }, HTML.span("CH1"), HTML.span("CH2")), HTML.div());
        const side = [["busfx", "BUS FX", "MUTE BUS"], ["hold", "HOLD", "PAUSE"], ["ext", "EXT<br>SOURCE", "INPUT SETTING"], ["subpad", "SUB PAD", "PROJECT"]];
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const label = row * 4 + col + 1;
                const name = HTML.div({ class: "sp-name" });
                const el = HTML.div({ class: "sp-pad", title: "Pad " + label }, HTML.div({ class: "sp-num" }, String(label)), name, HTML.div({ class: "sp-dj" }, DJ_LABELS[label]));
                el.nameEl = name;
                el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); padDown(label, padVelocity(e, el), false); });
                const up = () => padUp(label, false);
                el.addEventListener("pointerup", up);
                el.addEventListener("pointercancel", up);
                // drop audio files or CarrotBox sounds on a pad
                el.addEventListener("dragover", (e) => { if (A.flDragHasPayload(e) || A.flDragHasFiles(e)) { e.preventDefault(); el.classList.add("sp-sel"); } });
                el.addEventListener("dragleave", () => el.classList.remove("sp-sel"));
                el.addEventListener("drop", (e) => { e.preventDefault(); dropOnPad(label, e); });
                padEls[label] = el;
                const fn = HTML.div({ class: "sp-fn" }, SHIFT_LABELS[label]);
                fnEls[label] = fn;
                padArea.appendChild(HTML.div({ class: "sp-padcell" }, el, fn));
            }
            const [id, label, sub] = side[row];
            const s = HTML.div({ class: "sp-side", title: label.replace("<br>", " ") });
            s.innerHTML = label;
            s.addEventListener("pointerdown", (e) => { e.preventDefault(); s.setPointerCapture(e.pointerId); s.classList.add("sp-down"); press(id, true, e); });
            const up = (e) => { if (!s.classList.contains("sp-down")) return; s.classList.remove("sp-down"); press(id, false, e); };
            s.addEventListener("pointerup", up);
            s.addEventListener("pointercancel", up);
            buttons[id] = s;
            padArea.appendChild(HTML.div({ class: "sp-padcell" }, s, HTML.div({ class: "sp-fn" }, sub)));
        }
        const padVelocity = (e, el) => {
            // harder lower on the pad, like hitting the middle of a real pad
            const r = el.getBoundingClientRect();
            return clamp(Math.round(60 + 67 * (e.clientY - r.top) / r.height), 1, 127);
        };
        const screws = ["left: 10px; top: 10px;", "right: 10px; top: 10px;", "left: 10px; bottom: 10px;", "right: 10px; bottom: 10px;"].map(st => HTML.div({ class: "sp-screw", style: st }));
        const lock = HTML.div({ class: "sp-lock" });
        const face = HTML.div({ class: "sp-face" }, ...screws,
            HTML.div({ class: "sp-top" }, HTML.div({ class: "sp-brand" }, "SP STATION", HTML.small("FOR")), HTML.div({ class: "sp-model" }, "SP-404MKII")),
            knobRow, centre, rowA, rowB, rowC, padArea,
            HTML.div({ class: "sp-bottom" }, HTML.span("PHONES"), HTML.span("GAIN"), HTML.span("MIC/GUITAR"), HTML.span("INPUT")), lock);

        // ============================================================ behaviour
        const onOff = (v) => v ? "ON" : "OFF";
        const useShift = () => { if (ui.shiftLatched) { ui.shiftLatched = false; ui.shift = false; } ui.shiftUsed = true; };
        const loadedLabels = (bank) => { const out = []; for (let l = 1; l <= 16; l++) if (P().pads[padKey(bank, l)] && P().pads[padKey(bank, l)].s) out.push(l); return out; };
        // ---- menus: VALUE changes the selected line (SHIFT + VALUE moves), PUSH ENTER runs it / goes on
        const menu = (title, items, extra) => { ui.menu = Object.assign({ title, items, index: 0 }, extra || {}); ui.pick = null; };
        const item = (label, get, inc, enter) => ({ label, get, inc, enter });
        const toggleItem = (label, obj, key, after) => item(label, () => onOff(obj[key]), () => { obj[key] = obj[key] ? 0 : 1; changed(); after && after(); });
        const numItem = (label, obj, key, min, max, step, fmt, after) => item(label, () => fmt ? fmt(obj[key]) : String(obj[key]), (d) => { obj[key] = +clamp(obj[key] + d * step, min, max).toFixed(4); changed(); after && after(); });
        const choiceItem = (label, obj, key, names, after) => item(label, () => names[clamp(obj[key] | 0, 0, names.length - 1)], (d) => { obj[key] = clamp((obj[key] | 0) + d, 0, names.length - 1); changed(); after && after(); });
        const confirm = (text, fn) => { ui.confirm = { text, fn }; };
        function valueTurn(d, moveOnly) {
            if (!deviceLive()) return;
            if (ui.menu) {
                const m = ui.menu, it = m.items[m.index];
                if (moveOnly || ui.shift || !it || !it.inc) { m.index = clamp(m.index + (d > 0 ? 1 : -1), 0, m.items.length - 1); if (m.onMove) m.onMove(m.index); }
                else it.inc(d);
                return;
            }
            if (ui.trrec) { const ls = Array.from({ length: 16 }, (_, i) => i + 1); const i = ls.indexOf(ui.trrec.pad); ui.trrec.pad = ls[(i + (d > 0 ? 1 : 15)) % 16]; return; }
            if (ui.chromatic) { ui.chromOct = clamp(ui.chromOct + Math.sign(d), -3, 3); say("OCTAVE " + (ui.chromOct > 0 ? "+" : "") + ui.chromOct); return; }
            if (ui.mg) { ui.mgValue = clamp(ui.mgValue + Math.sign(d), 0, 4); return; }
            if (ui.dj) { djSelect(moveOnly || ui.shift ? 1 : 0, Math.sign(d)); return; }
            const p = P(), key = curKey(), pad = curPad();
            if (ui.mode == "startend") { const prop = moveOnly || ui.shift ? "en" : "st"; padSet(p, key, prop, +clamp(pad[prop] + d * 0.0005 * (ui.startendZoom > 0.5 ? 0.2 : 1), 0, 1).toFixed(5)); changed(false); return; }
            if (ui.mode == "pitch") { padSet(p, key, "speed", +clamp(pad.speed + d * 0.01, 0.5, 2).toFixed(3)); changed(false); return; }
            if (ui.mode == "envelope") { padSet(p, key, "rel", +clamp(pad.rel + d * 0.01, 0.01, 4).toFixed(3)); changed(false); return; }
            if (ui.mode == "chop") { ui.chop = clamp(ui.chop + Math.sign(d), 2, 32); return; }
            if (ui.mode == "gain") { padSet(p, key, "gain", clamp(pad.gain + Math.sign(d), -24, 12)); changed(false); return; }
            // home: VALUE sets the song tempo
            const doc = host.doc;
            const old = doc.song.tempo;
            doc.record(new A.ChangeTempo(doc, old, old + Math.sign(d)));
            ui.tempoUntil = performance.now() + 1200;
        }
        function enter() {
            if (ui.confirm) { const c = ui.confirm; ui.confirm = null; c.fn(); return; }
            if (ui.menu) {
                const it = ui.menu.items[ui.menu.index];
                if (it && it.enter) it.enter();
                else if (it && it.inc) it.inc(1);
                else ui.menu.index = (ui.menu.index + 1) % ui.menu.items.length;
                return;
            }
            if (ui.mode == "chop") { doChop(); return; }
            if (ui.trrec) { const pl = inst().player; if (pl) post({ t: "stopPattern" }); else post({ t: "play", key: ui.trrec.key, now: true }); return; }
            if (ui.pattern && ui.lastPattern) { post({ t: "play", key: ui.lastPattern, now: !inst().playing }); return; }
            ui.infoUntil = performance.now() + 1500;
        }

        // ---- the buttons
        function press(id, down, e) {
            if (!deviceLive()) return;
            const shift = ui.shift || !!(e && e.shiftKey);
            if (id == "shift") {
                if (down) { ui.shift = true; ui.shiftDownAt = performance.now(); ui.shiftUsed = false; }
                else {
                    if (performance.now() - ui.shiftDownAt < 300 && !ui.shiftUsed) { ui.shiftLatched = !ui.shiftLatched; ui.shift = ui.shiftLatched; }
                    else { ui.shift = false; ui.shiftLatched = false; }
                }
                return;
            }
            if (id == "subpad") {
                if (shift && down) { useShift(); projectMenu(); return; }
                const key = inst().lastKey || curKey();
                if (down) { ui.subDown = true; post({ t: "on", key, vel: 100, roll: ui.roll, id: "sub" }); }
                else if (ui.subDown) { ui.subDown = false; post({ t: "off", key, id: "sub" }); if (ui.roll) post({ t: "roll", key: null }); }
                return;
            }
            if (!down) return;
            if (shift) useShift();
            const p = P(), key = curKey();
            switch (id) {
                case "patsel":
                    if (shift) {
                        const u = inst().undo;
                        if (u) { p.pat[u.key] = u.pat; inst().undo = null; changed(); say("UNDO " + u.key); }
                        else say("NOTHING TO UNDO");
                        break;
                    }
                    ui.pattern = !ui.pattern; ui.trrec = null; ui.menu = null;
                    say(ui.pattern ? "PATTERN SELECT" : "PADS");
                    break;
                case "patedit": patternEditMenu(); break;
                case "recset": recordSettingMenu(); break;
                case "startend":
                    if (shift) { ui.mode = ui.mode == "chop" ? "home" : "chop"; ui.menu = null; break; }
                    ui.mode = ui.mode == "startend" ? "home" : "startend"; ui.menu = null;
                    break;
                case "pitch":
                    if (shift) { ui.mode = ui.mode == "envelope" ? "home" : "envelope"; ui.menu = null; break; }
                    ui.mode = ui.mode == "pitch" ? "home" : "pitch"; ui.menu = null;
                    break;
                case "mark": {
                    if (shift) { padSet(p, key, "marks", null); changed(); say("MARKS CLEARED"); break; }
                    const v = inst().voices.find(x => x.key == key && !x.done);
                    if (!v) { say("PLAY THE PAD, THEN MARK"); break; }
                    const pad = curPad(), at = +clamp(pad.st + (pad.en - pad.st) * v.progress, 0, 1).toFixed(5);
                    const marks = (pad.marks || []).concat([at]).sort((a, b) => a - b);
                    padSet(p, key, "marks", marks.slice(0, 32));
                    changed();
                    say("MARK " + marks.length);
                    break;
                }
                case "del":
                    ui.menu = null;
                    ui.pick = { kind: "del", text: ui.pattern ? "DEL: SELECT PATTERN" : "DEL: SELECT PAD", fn: (label) => {
                        const k = padKey(ui.bank, label);
                        if (ui.pattern) { if (!p.pat[k]) { say("EMPTY"); return; } confirm("DELETE PATTERN " + k + "?", () => { delete p.pat[k]; changed(); say("DELETED"); }); }
                        else { if (!p.pads[k]) { say("EMPTY"); return; } confirm("DELETE " + BANKS[ui.bank] + "-" + label + "?", () => { delete p.pads[k]; post({ t: "stop", key: k }); changed(); say("DELETED"); }); }
                    } };
                    break;
                case "rec":
                    if (shift) { skipBack(); break; }
                    if (ui.pattern || inst().rec) { patternRecButton(); break; }
                    samplingButton("sample");
                    break;
                case "resample": samplingButton("resample"); break;
                case "bpmsync": togglePad("bpms", "BPM SYNC"); break;
                case "gate": togglePad("gate", "GATE"); break;
                case "loop": if (shift) togglePad("pp", "PING-PONG"); else togglePad("loop", "LOOP"); break;
                case "reverse": togglePad("rev", "REVERSE"); break;
                case "roll":
                    if (shift) { rollSetMenu(); break; }
                    ui.roll = !ui.roll;
                    if (!ui.roll) post({ t: "roll", key: null });
                    say("ROLL " + onOff(ui.roll));
                    break;
                case "exit":
                    if (shift) { post({ t: "stopPattern" }); say("PATTERN STOP"); if (p.sys.sendPc) sendDevice([0xFC]); break; }
                    if (ui.confirm) ui.confirm = null;
                    else if (ui.menu) ui.menu = ui.menu.parent || null;
                    else if (ui.pick) ui.pick = null;
                    else if (ui.mode != "home") ui.mode = "home";
                    else if (ui.trrec) ui.trrec = null;
                    else if (ui.dj) setDj(false);
                    else if (ui.pattern) ui.pattern = false;
                    else if (ui.chromatic || ui.vel16 || ui.cue || ui.mg) { ui.chromatic = ui.vel16 = ui.cue = ui.mg = false; say("PADS"); }
                    if (ui.sampling && !ui.sampling.running) cancelSampling();
                    break;
                case "copy":
                    ui.menu = null;
                    ui.pick = { kind: "copy", text: ui.pattern ? "COPY: SELECT PATTERN" : "COPY: SELECT PAD", fn: (label) => {
                        const from = padKey(ui.bank, label);
                        ui.pick = { kind: "copy2", text: "COPY " + from + " TO: SELECT", fn: (l2) => {
                            const to = padKey(ui.bank, l2);
                            if (ui.pattern) { if (p.pat[from]) { p.pat[to] = JSON.parse(JSON.stringify(p.pat[from])); changed(); say("COPIED " + from + ">" + to); } }
                            else if (p.pads[from]) { p.pads[to] = JSON.parse(JSON.stringify(p.pads[from])); changed(); say("COPIED " + from + ">" + to); }
                            else say("EMPTY");
                        } };
                    } };
                    break;
                case "remain":
                    if (shift) { ui.pick = { kind: "current", text: "CURRENT PAD: SELECT", fn: (label) => { ui.pad = label; say("CURRENT " + BANKS[ui.bank] + "-" + label); } }; break; }
                    ui.remainUntil = performance.now() + 2500;
                    break;
                case "busfx":
                    if (shift) { const it = inst(); it.busMute[ui.bus] = it.busMute[ui.bus] ? 0 : 1; say("BUS " + (ui.bus + 1) + " " + (it.busMute[ui.bus] ? "MUTED" : "ON")); break; }
                    ui.bus = (ui.bus + 1) % 4;
                    ui.fxView = performance.now() + 1800;
                    break;
                case "hold":
                    if (shift) { const it = inst(); it.pause = !it.pause; say(it.pause ? "PAUSE" : "PLAY"); break; }
                    ui.hold = !ui.hold;
                    if (!ui.hold) { for (const k of ui.latched) post({ t: "off", key: k }); ui.latched.clear(); }
                    say("HOLD " + onOff(ui.hold));
                    break;
                case "ext":
                    if (shift) { inputSettingMenu(); break; }
                    toggleMonitor();
                    break;
                case "mfx": if (shift) { efxSettingMenu(); break; } mfxMenu(); break;
                case "enter": enter(); break;
                default:
                    if (/^fx\d$/.test(id)) { if (shift) { efxSettingMenu(); break; } directFx(+id.slice(2)); break; }
                    if (/^bank\d$/.test(id)) {
                        const i = +id.slice(4);
                        if (shift && (i == 3 || i == 4)) { setDj(!ui.dj); break; }
                        if (shift) ui.bank = i + 5;
                        else ui.bank = ui.bank == i ? i + 5 : i;
                        p.ui.bank = ui.bank;
                        say("BANK " + BANKS[ui.bank], 700);
                    }
            }
        }
        function togglePad(prop, label) {
            const p = P(), key = curKey(), pad = curPad();
            if (!pad.s) { say("EMPTY PAD"); return; }
            padSet(p, key, prop, pad[prop] ? 0 : 1);
            changed();
            say(label + " " + onOff(!pad[prop]));
        }
        function directFx(i) {
            const p = P(), bus = p.bus[ui.bus], fxIndex = FX_BY_ID.get(DIRECT_FX[i]);
            if (bus.fx == fxIndex) bus.on = bus.on ? 0 : 1;
            else { bus.fx = fxIndex; bus.c = FX[fxIndex].def.concat([1, 1, 0]); bus.on = 1; }
            changed();
            ui.fxView = performance.now() + 1800;
            if (p.sys.sendCtl) sendDevice([0xB0 | ui.bus, 19, bus.on ? 127 : 0]);
        }
        function mfxMenu() {
            const p = P(), bus = p.bus[ui.bus];
            menu("MFX BUS " + (ui.bus + 1), FX.map((f, i) => item(f.name, () => (bus.fx == i ? (bus.on ? "ON" : "OFF") : ""), null, () => {
                if (bus.fx != i) { bus.fx = i; bus.c = FX[i].def.concat([1, 1, 0]); bus.on = 1; } else bus.on = bus.on ? 0 : 1;
                changed(); ui.menu = null; ui.fxView = performance.now() + 1800;
                if (p.sys.sendCtl) sendDevice([0xB0 | ui.bus, 19, bus.on ? 127 : 0]);
            })));
            ui.menu.index = bus.fx;
        }
        function rollSetMenu() {
            const p = P();
            menu("ROLL SET", ROLL_RATES.map((r, i) => item(r[1], () => (p.sys.roll | 0) == i ? "●" : "", null, () => { p.sys.roll = i; changed(); ui.menu = null; say("ROLL " + r[1]); })));
            ui.menu.index = p.sys.roll | 0;
        }

        // ---- pads
        function padDown(label, vel, fromDevice, bank, shiftHeld) {
            if (!deviceLive()) return;
            const p = P();
            if (bank != null && bank != ui.bank && !ui.pattern && !ui.trrec) ui.bank = bank;
            const b = bank != null ? bank : ui.bank;
            const key = padKey(b, label);
            padEls[label] && (padEls[label]._hit = performance.now());
            if (!fromDevice && (ui.shift || shiftHeld)) { useShift(); shiftPad(label); return; }
            if (ui.confirm) return;
            if (ui.pick) { const pk = ui.pick; ui.pick = null; pk.fn(label, key); if (ui.pick == null && pk.after) pk.after(); return; }
            if (ui.mode == "tap") { tap(); return; }
            if (ui.dj) { djPad(label, true); return; }
            if (ui.pattern) { patternPad(label); return; }
            if (ui.trrec) { trrecToggle(label); return; }
            if (ui.mg) { padSet(p, key, "mg", ui.mgValue); changed(); say(BANKS[b] + "-" + label + " GROUP " + (ui.mgValue || "OFF")); return; }
            if (ui.chromatic) { post({ t: "on", key: p.chrom, id: "c" + label, semis: slotOf(label) + ui.chromOct * 12, vel }); return; }
            if (ui.vel16) { post({ t: "on", key: curKey(), id: "v" + label, vel: Math.max(1, (slotOf(label) + 1) * 8 - 1) }); return; }
            ui.pad = label;
            p.ui.pad = label;
            if (ui.hold) {
                if (ui.latched.has(key)) { ui.latched.delete(key); post({ t: "off", key }); post({ t: "stop", key }); return; }
                ui.latched.add(key);
            }
            post({ t: "on", key, vel, roll: ui.roll, cue: ui.cue });
            if (p.sys.thru && !fromDevice) { const enc = h.spEncode(b, slotOf(label)); sendDevice([0x90 | enc.channel, enc.note, vel]); }
        }
        function padUp(label, fromDevice, bank) {
            const p = P();
            const b = bank != null ? bank : ui.bank, key = padKey(b, label);
            if (ui.dj) { djPad(label, false); return; }
            if (ui.chromatic) { post({ t: "off", key: p.chrom, id: "c" + label }); return; }
            if (ui.vel16) { post({ t: "off", key: curKey(), id: "v" + label }); return; }
            if (ui.pattern || ui.trrec || ui.mg || ui.pick || ui.mode == "tap") return;
            post({ t: "off", key, hold: ui.latched.has(key) });
            if (ui.roll) post({ t: "roll", key: null });
            if (p.sys.thru && !fromDevice) { const enc = h.spEncode(b, slotOf(label)); sendDevice([0x80 | enc.channel, enc.note, 0]); }
        }
        function shiftPad(label) {
            const p = P(), key = curKey();
            switch (label) {
                case 1: p.sys.fixv = p.sys.fixv ? 0 : 1; changed(); say("FIXED VELOCITY " + onOff(p.sys.fixv) + (p.sys.fixv ? " " + p.sys.fixval : "")); break;
                case 2: ui.vel16 = !ui.vel16; ui.chromatic = false; say("16 VELOCITY " + onOff(ui.vel16)); break;
                case 3: ui.cue = !ui.cue; say("CUE " + onOff(ui.cue)); break;
                case 4: ui.chromatic = !ui.chromatic; ui.vel16 = false; if (ui.chromatic) { p.chrom = key; changed(); } say(ui.chromatic ? "CHROMATIC " + BANKS[ui.bank] + "-" + ui.pad : "CHROMATIC OFF"); break;
                case 5: ui.pick = { kind: "ex", text: "EXCHANGE: 1ST PAD", fn: (a) => { const ka = padKey(ui.bank, a); ui.pick = { kind: "ex2", text: "EXCHANGE " + ka + " WITH", fn: (b) => { const kb = padKey(ui.bank, b); const t = p.pads[ka]; if (p.pads[kb]) p.pads[ka] = p.pads[kb]; else delete p.pads[ka]; if (t) p.pads[kb] = t; else delete p.pads[kb]; changed(); say("EXCHANGED " + ka + "<>" + kb); } }; } }; break;
                case 6: if (!p.pads[key]) { say("EMPTY PAD"); break; } confirm("INIT " + key + " PARAMS?", () => { const raw = p.pads[key]; p.pads[key] = { s: raw.s, n: raw.n }; changed(); say("INITIALIZED"); }); break;
                case 7: ui.pick = { kind: "link", text: "PAD LINK: 1ST PAD", fn: (a) => { const ka = padKey(ui.bank, a); ui.pick = { kind: "link2", text: "LINK " + ka + " WITH", fn: (b) => {
                    const kb = padKey(ui.bank, b); const links = p.sys.links || (p.sys.links = {});
                    const list = links[ka] || []; const on = !list.includes(kb);
                    links[ka] = on ? list.concat([kb]) : list.filter(x => x != kb);
                    if (!links[ka].length) delete links[ka];
                    changed(); say((on ? "LINKED " : "UNLINKED ") + ka + "+" + kb);
                } }; } }; break;
                case 8: ui.mg = !ui.mg; say(ui.mg ? "MUTE GROUPS: VALUE, PADS" : "MUTE GROUPS OFF"); break;
                case 9: p.sys.metro = p.sys.metro ? 0 : 1; changed(); say("METRONOME " + onOff(p.sys.metro)); break;
                case 10: p.sys.cnt = p.sys.cnt ? 0 : 1; changed(); say("COUNT-IN " + onOff(p.sys.cnt)); break;
                case 11: ui.mode = "tap"; ui.taps = []; say("TAP PAD 11", 900); break;
                case 12: ui.mode = ui.mode == "gain" ? "home" : "gain"; break;
                case 13: utilityMenu(); break;
                case 14: importExportMenu(); break;
                case 15: padSettingMenu(); break;
                case 16: efxSettingMenu(); break;
            }
        }
        function tap() {
            const now = performance.now();
            ui.taps = ui.taps.filter(t => now - t < 2500).concat([now]);
            if (ui.taps.length >= 2) {
                const gaps = [];
                for (let i = 1; i < ui.taps.length; i++) gaps.push(ui.taps[i] - ui.taps[i - 1]);
                const bpm = clamp(Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)), Config.tempoMin, Config.tempoMax);
                const doc = host.doc;
                doc.record(new A.ChangeTempo(doc, doc.song.tempo, bpm));
            }
            ui.tempoUntil = now + 1500;
        }

        // ---- patterns
        function patternPad(label) {
            const p = P(), key = padKey(ui.bank, label);
            ui.lastPattern = key;
            if (!p.pat[key]) { say("PATTERN " + key + " EMPTY"); return; }
            const playing = inst().player;
            post({ t: "play", key, queue: !!playing, now: !playing && !inst().playing });
            if (p.sys.sendPc) sendDevice([0xC0 | ui.bank, label - 1]);
        }
        function patternRecButton() {
            const it = inst();
            if (it.rec) { post({ t: "recStop" }); say("REC STOP"); changed(); return; }
            ui.pick = { kind: "patrec", text: "REC: SELECT PATTERN", fn: (label) => {
                const key = padKey(ui.bank, label);
                ui.lastPattern = key;
                post({ t: "rec", key });
                ui.pattern = false;
                say("REC " + key + (P().sys.cnt ? " (COUNT-IN)" : ""));
            } };
        }
        function patternEditMenu() {
            const p = P(), key = ui.lastPattern || (inst().player && inst().player.key);
            if (!key) { ui.pattern = true; say("SELECT A PATTERN FIRST"); return; }
            const pat = () => p.pat[key] || (p.pat[key] = { len: p.sys.plen | 0 || 1, ev: [] });
            menu("PATTERN " + key, [
                item("TR-REC", () => "→", null, () => { pat(); ui.menu = null; ui.pattern = false; ui.trrec = { key, bar: 0, vel: 100, pad: ui.pad }; say("TR-REC " + key); }),
                item("LENGTH", () => pat().len + " BAR" + (pat().len > 1 ? "S" : ""), (d) => { pat().len = clamp(pat().len + Math.sign(d), 1, 16); changed(); }),
                item("QUANTIZE ALL", () => QUANTIZE[p.sys.q | 0][1], null, () => {
                    const q = QUANTIZE[p.sys.q | 0][0] * 24;
                    if (q > 0) { for (const e of pat().ev) e[0] = (Math.round(e[0] / q) * q) % (pat().len * (inst().bpb || 4) * 24); changed(); say("QUANTIZED"); }
                }),
                item("DOUBLE", () => "", null, () => { const pt = pat(), span = pt.len * (inst().bpb || 4) * 24; pt.ev = pt.ev.concat(pt.ev.map(e => [e[0] + span, e[1], e[2], e[3], e[4]])); pt.len = Math.min(16, pt.len * 2); changed(); say("DOUBLED"); }),
                item("PATTERN → SONG", () => "BAR " + (host.doc.bar + 1), null, () => patternToSong(key)),
                item("SONG → PATTERN", () => "BAR " + (host.doc.bar + 1), null, () => songToPattern(key)),
                item("PLAY / STOP", () => (inst().player && inst().player.key == key ? "▶" : "■"), null, () => { if (inst().player) post({ t: "stopPattern" }); else post({ t: "play", key, now: true }); }),
                item("CLEAR", () => pat().ev.length + " NOTES", null, () => confirm("CLEAR " + key + "?", () => { pat().ev = []; changed(); say("CLEARED"); })),
            ]);
        }
        function recordSettingMenu() {
            const p = P(), s = p.sys;
            menu("RECORD SETTING", [
                choiceItem("QUANTIZE", s, "q", QUANTIZE.map(q => q[1])),
                numItem("LENGTH", s, "plen", 1, 16, 1, (v) => v + " BAR" + (v > 1 ? "S" : "")),
                toggleItem("COUNT-IN", s, "cnt"),
                toggleItem("METRONOME", s, "metro"),
                numItem("METRO LEVEL", s, "mvol", 0, 1, 0.05, (v) => Math.round(v * 100) + ""),
                choiceItem("REC MODE", s, "recMode", ["OVERDUB", "REPLACE"]),
                numItem("THRESHOLD", s, "thr", 0, 1, 0.05, (v) => v <= 0 ? "OFF" : Math.round(-60 + v * 50) + "DB"),
                choiceItem("SAMPLING", s, "mono", ["STEREO", "MONO"]),
            ]);
        }
        function trrecToggle(label) {
            const p = P(), tr = ui.trrec, pat = p.pat[tr.key];
            if (!pat) { ui.trrec = null; return; }
            const bpb = inst().bpb || 4, stepParts = bpb * 24 / 16;
            const pos = Math.round(tr.bar * bpb * 24 + (label - 1) * stepParts);
            const { bank, label: pl } = parseKey(padKey(ui.bank, tr.pad));
            const i = pat.ev.findIndex(e => e[0] == pos && e[1] == bank && e[2] == pl);
            if (i >= 0) pat.ev.splice(i, 1);
            else { pat.ev.push([pos, bank, pl, tr.vel, Math.max(1, Math.round(stepParts))]); pat.ev.sort((a, b) => a[0] - b[0]); }
            changed();
        }
        function patternToSong(key) {
            const p = P(), pat = p.pat[key];
            if (!pat || !pat.ev.length) { say("PATTERN IS EMPTY"); return; }
            const doc = host.doc, song = doc.song, ch = host.target.channel;
            if (ch == undefined) { say("OPEN FROM A CHANNEL"); return; }
            const isDrum = song.getChannelIsNoise(ch), barParts = song.beatsPerBar * Config.partsPerBeat;
            const bars = Array.from({ length: pat.len }, () => []);
            let skipped = 0;
            for (const e of pat.ev) {
                const pitch = padToNote(p, e[1], e[2], isDrum);
                if (pitch == null) { skipped++; continue; }
                const b = Math.floor(e[0] / barParts);
                if (b >= pat.len) continue;
                const s0 = e[0] - b * barParts;
                bars[b].push({ start: s0, end: Math.min(barParts, s0 + Math.max(1, e[4] || 6)), pitches: [pitch], size: clamp(Math.round(e[3] / 127 * Config.noteSizeMax), 1, Config.noteSizeMax) });
            }
            A.carrotWriteNotes(doc, bars, { channel: ch, startBar: doc.bar, overlap: true });
            say("WROTE " + key + " AT BAR " + (doc.bar + 1) + (skipped ? " (" + skipped + " SKIPPED)" : ""), 2000);
        }
        function songToPattern(key) {
            const p = P(), doc = host.doc, song = doc.song, ch = host.target.channel;
            if (ch == undefined) return;
            const isDrum = song.getChannelIsNoise(ch), barParts = song.beatsPerBar * Config.partsPerBeat, len = clamp(p.sys.plen | 0 || 1, 1, 16);
            const ev = [];
            for (let b = 0; b < len && doc.bar + b < song.barCount; b++) {
                const pattern = song.getPattern(ch, doc.bar + b);
                if (!pattern) continue;
                for (const n of pattern.notes) for (const pitch of n.pitches) {
                    const where = noteToPad(p, pitch, isDrum);
                    if (!where) continue;
                    const { bank, label } = parseKey(where.key);
                    ev.push([b * barParts + n.start, bank, label, Math.round(n.pins[0].size / Config.noteSizeMax * 127), n.end - n.start]);
                }
            }
            p.pat[key] = { len, ev: ev.sort((a, b) => a[0] - b[0]) };
            changed();
            say("READ " + ev.length + " NOTES INTO " + key, 1600);
        }

        // ---- sampling, resampling, skip-back
        async function openInput() {
            const it = inst();
            if (it.input && it.input.ctx) return it.input;
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                let dev = devices.find(d => d.kind == "audioinput" && /sp-?404|roland/i.test(d.label));
                const constraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 };
                if (P().sys.src && P().sys.srcId) dev = devices.find(d => d.deviceId == P().sys.srcId) || dev;
                if (dev) constraints.deviceId = { exact: dev.deviceId };
                const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
                if (!dev) {
                    // labels appear once the permission is granted: look again for the SP
                    const again = (await navigator.mediaDevices.enumerateDevices()).find(d => d.kind == "audioinput" && /sp-?404|roland/i.test(d.label));
                    if (again) { stream.getTracks().forEach(t => t.stop()); return openInput.call(null); }
                }
                const sr = it.sr || 44100;
                const Ctx = window.AudioContext || window.webkitAudioContext;
                let ctx;
                try { ctx = new Ctx({ sampleRate: sr }); } catch (error) { ctx = new Ctx(); }
                const src = ctx.createMediaStreamSource(stream);
                const proc = ctx.createScriptProcessor(2048, 2, 2);
                const size = 1 << 17;
                const input = it.input = { ctx, stream, src, proc, l: new Float32Array(size), rr: new Float32Array(size), mask: size - 1, w: 0, r: 0, monitor: false, level: 0, label: (stream.getAudioTracks()[0] || {}).label || "INPUT" };
                proc.onaudioprocess = (e) => {
                    const a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : a;
                    let peak = 0;
                    for (let i = 0; i < a.length; i++) { input.l[input.w & input.mask] = a[i]; input.rr[input.w & input.mask] = b[i]; input.w++; peak = Math.max(peak, Math.abs(a[i]), Math.abs(b[i])); }
                    input.level = Math.max(peak, input.level * 0.85);
                    const cap = it.capture;
                    if (cap && cap.kind == "sample") {
                        if (!cap.running && cap.armed && (P().sys.thr <= 0 ? false : peak > Math.pow(10, (-60 + P().sys.thr * 50) / 20))) { cap.running = true; cap.armed = false; }
                        if (cap.running) cap.push(a, b, a.length);
                    }
                    e.outputBuffer.getChannelData(0).fill(0);
                    if (e.outputBuffer.numberOfChannels > 1) e.outputBuffer.getChannelData(1).fill(0);
                };
                src.connect(proc);
                proc.connect(ctx.destination);
                return input;
            }
            catch (error) {
                say("NO INPUT: ALLOW THE MIC", 2000);
                host.toast("SP Station needs microphone access to sample (choose the SP-404MKII as the input).");
                return null;
            }
        }
        function closeInput() {
            const input = inst().input;
            if (!input) return;
            try { input.proc.disconnect(); input.src.disconnect(); input.stream.getTracks().forEach(t => t.stop()); input.ctx.close(); } catch (error) { }
            inst().input = null;
        }
        async function toggleMonitor() {
            const it = inst();
            if (it.input && it.input.monitor) { it.input.monitor = false; say("EXT SOURCE OFF"); if (!ui.sampling) closeInput(); return; }
            const input = await openInput();
            if (!input) return;
            input.monitor = true;
            input.r = input.w;
            say("EXT SOURCE ON");
        }
        function makeCapture(kind, sr, maxSeconds) {
            return {
                kind, chunks: [], len: 0, running: false, armed: false, max: Math.round(sr * maxSeconds), sr,
                push(l, r, n) { if (!this.running) return; this.chunks.push([Float32Array.from(l.subarray(0, n)), Float32Array.from(r.subarray(0, n))]); this.len += n; if (this.len >= this.max) this.running = false; },
                take() { const L = new Float32Array(this.len), R = new Float32Array(this.len); let o = 0; for (const [a, b] of this.chunks) { L.set(a, o); R.set(b, o); o += a.length; } return [L, R]; },
            };
        }
        async function saveSample(key, L, R, sr, name) {
            const p = P();
            // trim silence at both ends (keep a little air)
            const thr = 0.0015;
            let a = 0, b = L.length;
            while (a < b && Math.abs(L[a]) < thr && Math.abs(R[a]) < thr) a++;
            while (b > a && Math.abs(L[b - 1]) < thr && Math.abs(R[b - 1]) < thr) b--;
            a = Math.max(0, a - Math.round(sr * 0.003)); b = Math.min(L.length, b + Math.round(sr * 0.05));
            if (b - a < sr * 0.02) { say("NOTHING RECORDED"); return; }
            L = L.subarray(a, b); R = R.subarray(a, b);
            const chans = p.sys.mono ? [Float32Array.from(L, (v, i) => 0.5 * (v + R[i]))] : [L, R];
            const wav = A.flEncodeWav(chans, sr);
            const id = await FLSampleBank.addBytes(new Uint8Array(wav), name + ".wav");
            const prev = p.pads[key] || {};
            p.pads[key] = { s: id, n: name };
            if (prev.bus != undefined) p.pads[key].bus = prev.bus;
            changed();
            say("SAVED " + key + " " + (L.length / sr).toFixed(1) + "S", 1800);
        }
        function cancelSampling() {
            const it = inst();
            it.capture = null;
            ui.sampling = null;
            if (it.input && !it.input.monitor) closeInput();
        }
        async function samplingButton(kind) {
            const it = inst();
            const s = ui.sampling;
            if (s && s.kind == kind) {
                if (s.cap.running) {
                    s.cap.running = false;
                    const [L, R] = s.cap.take();
                    ui.sampling = null;
                    it.capture = null;
                    if (kind == "sample" && it.input && !it.input.monitor) closeInput();
                    await saveSample(s.key, L, R, s.cap.sr, (kind == "sample" ? "SMPL " : "RSMP ") + s.key);
                    return;
                }
                if (s.key) {
                    // standby -> recording (with a threshold set, sampling waits for sound)
                    if (s.cap.armed) { s.cap.armed = false; say("STANDBY"); return; }
                    if (kind == "sample" && P().sys.thr > 0) { s.cap.armed = true; say("WAITING FOR SOUND"); }
                    else s.cap.running = true;
                    keepAwake();
                    return;
                }
            }
            if (s) cancelSampling();
            const sr = it.sr || 44100;
            if (kind == "sample") { const input = await openInput(); if (!input) return; }
            const cap = makeCapture(kind, sr, 240);
            ui.sampling = { kind, key: null, cap };
            it.capture = cap;
            ui.pick = { kind: "rectarget", text: (kind == "sample" ? "SAMPLING" : "RESAMPLE") + ": SELECT PAD", fn: (label) => {
                ui.sampling.key = padKey(ui.bank, label);
                ui.pad = label;
                say("STANDBY: PUSH " + (kind == "sample" ? "REC" : "RESAMPLE"), 1500);
            } };
        }
        function ensureSkipBack() {
            const it = inst();
            if (it.skip) return;
            const sr = it.sr || 44100, size = Math.round(sr * 25);
            it.skip = { l: new Float32Array(size), r: new Float32Array(size), w: 0, filled: 0, sr,
                push(l, r, n) { for (let i = 0; i < n; i++) { this.l[this.w] = l[i]; this.r[this.w] = r[i]; this.w = (this.w + 1) % size; } this.filled = Math.min(size, this.filled + n); } };
        }
        async function skipBack() {
            const it = inst(), sk = it.skip;
            if (!sk || sk.filled < sk.sr * 0.1) { say("NOTHING TO SKIP BACK"); return; }
            const size = sk.l.length, n = sk.filled;
            const L = new Float32Array(n), R = new Float32Array(n);
            for (let i = 0; i < n; i++) { const j = (sk.w - n + i + size) % size; L[i] = sk.l[j]; R[i] = sk.r[j]; }
            // the current pad if it's free, else the next free pad in the bank
            let key = curKey();
            if (P().pads[key] && P().pads[key].s) {
                for (let l = 1; l <= 16; l++) { const k = padKey(ui.bank, l); if (!P().pads[k] || !P().pads[k].s) { key = k; break; } }
            }
            await saveSample(key, L, R, sk.sr, "SKIP " + key);
        }

        // ---- start/end, chop
        function doChop() {
            const p = P(), key = curKey(), pad = curPad();
            if (!pad.s) { say("EMPTY PAD"); return; }
            const entry = entryOf(pad);
            if (!entry || entry.status != "ready") { say("LOADING..."); return; }
            let cuts;
            if (pad.marks && pad.marks.length) cuts = [pad.st].concat(pad.marks.filter(m => m > pad.st && m < pad.en), [pad.en]);
            else { cuts = []; for (let i = 0; i <= ui.chop; i++) cuts.push(pad.st + (pad.en - pad.st) * i / ui.chop); }
            // chops go to the free pads after this one (this pad keeps the first chop)
            const free = [];
            for (let l = 1; l <= 16; l++) { const k = padKey(ui.bank, l); if (k != key && (!p.pads[k] || !p.pads[k].s)) free.push(l); }
            const n = Math.min(cuts.length - 1, free.length + 1);
            for (let i = 0; i < n; i++) {
                const k = i == 0 ? key : padKey(ui.bank, free[i - 1]);
                const raw = Object.assign({}, p.pads[key] || {});
                delete raw.marks;
                raw.st = +cuts[i].toFixed(5); raw.en = +cuts[i + 1].toFixed(5);
                raw.n = (pad.n || "CHOP") + " " + (i + 1);
                p.pads[k] = raw;
            }
            changed();
            ui.mode = "home";
            say("CHOP: " + n + " PADS", 1600);
        }

        // ---- DJ mode: two decks (CH1 on the left pads, CH2 on the right)
        function setDj(on) {
            const it = inst();
            ui.dj = on;
            if (on) {
                const loaded = loadedLabels(ui.bank);
                it.decks = it.decks || [{ label: ui.pad, rate: 1, bend: 0, voice: null }, { label: loaded.find(l => l != ui.pad) || ui.pad, rate: 1, bend: 0, voice: null }];
                it.djVol = it.djVol || [0.8, 0.8];
                if (it.djX == undefined) it.djX = 0.5;
                say("DJ MODE");
            }
            else {
                for (const d of it.decks || []) if (d.voice) d.voice.stop(true), d.voice = null;
                say("DJ MODE OFF");
            }
        }
        function djSelect(deck, d) {
            const it = inst(), loaded = loadedLabels(ui.bank);
            if (!loaded.length) return;
            const dk = it.decks[deck];
            const i = loaded.indexOf(dk.label);
            dk.label = loaded[((i < 0 ? 0 : i) + d + loaded.length) % loaded.length];
            dk.bank = ui.bank;
            if (dk.voice) { dk.voice.stop(true); dk.voice = null; djPlay(deck); }
        }
        function djPlay(deck) {
            const p = P(), it = inst(), dk = it.decks[deck];
            const key = padKey(dk.bank != null ? dk.bank : ui.bank, dk.label);
            const v = startPad(p, it, key, { vel: 110, gate: false, padOver: { loop: 1, gate: 0, hold: 10 } });
            if (!v) { say("DECK " + (deck + 1) + " EMPTY"); return; }
            v.base0 = v.base; v.gl0 = v.gl; v.gr0 = v.gr; v.deck = deck;
            it.direct.push(v);
            dk.voice = v;
            keepAwake();
        }
        function djUpdate() {
            const it = inst();
            if (!ui.dj || !it.decks) return;
            const x = it.djX == undefined ? 0.5 : it.djX;
            it.decks.forEach((dk, i) => {
                const v = dk.voice;
                if (!v) return;
                if (v.done) { dk.voice = null; return; }
                v.base = v.base0 * dk.rate * (1 + dk.bend);
                const xf = i == 0 ? Math.cos(x * Math.PI / 2) : Math.sin(x * Math.PI / 2);
                const g = it.djVol[i] * xf * 1.4;
                v.gl = v.gl0 * g; v.gr = v.gr0 * g;
            });
        }
        function djPad(label, down) {
            const it = inst(), deck = ((label - 1) % 4) < 2 ? 0 : 1, dk = it.decks[deck], fn = DJ_LABELS[label];
            if (fn == "BEND+" || fn == "BEND-") { dk.bend = down ? (fn == "BEND+" ? 0.04 : -0.04) : 0; return; }
            if (!down) { if (fn == "CUE" && dk.cueing) { dk.cueing = false; if (dk.voice && !dk.playingBeforeCue) { dk.voice.stop(true); dk.voice = null; } } return; }
            const p = P();
            if (fn == "BPM+") dk.rate = +(dk.rate * 1.01).toFixed(4);
            else if (fn == "BPM-") dk.rate = +(dk.rate / 1.01).toFixed(4);
            else if (fn == "SYNC") {
                const pad = padOf(p, padKey(dk.bank != null ? dk.bank : ui.bank, dk.label)), e = entryOf(pad);
                const bpm = e && e.status == "ready" ? sampleBpm(e, pad) : 0;
                if (bpm > 0) dk.rate = +(host.doc.song.tempo / bpm).toFixed(4);
                say("CH" + (deck + 1) + " SYNC " + (bpm > 0 ? (bpm * dk.rate).toFixed(1) : "?"));
            }
            else if (fn.startsWith("|")) { if (dk.voice) { dk.voice.stop(true); dk.voice = null; } djPlay(deck); }
            else if (fn.startsWith("▶")) {
                if (dk.voice) { dk.voice.paused = !dk.voice.paused; }
                else djPlay(deck);
            }
            else if (fn == "CUE") { dk.playingBeforeCue = !!(dk.voice && !dk.voice.paused); if (dk.voice) dk.voice.stop(true); dk.voice = null; djPlay(deck); dk.cueing = true; }
        }

        // ---- menus for SHIFT + 13..16, SHIFT + SUB PAD, SHIFT + EXT SOURCE
        function utilityMenu() {
            const p = P(), s = h.settings;
            const hwItem = (label, key, names) => item(label, () => names[clamp(s[key] | 0, 0, names.length - 1)], (d) => { s[key] = clamp((s[key] | 0) + d, 0, names.length - 1); h.save(); });
            menu("UTILITY", [
                hwItem("MIDI MODE", "spMode", ["AUTO", "A", "B"]),
                item("NOTE OFFSET", () => String(s.spNoteOffset | 0), (d) => { s.spNoteOffset = clamp((s.spNoteOffset | 0) + d, -24, 24); h.save(); }),
                hwItem("SYNC", "sync", ["OFF", "SEND CLOCK", "FOLLOW SP"]),
                toggleItem("PLAY IN CARROTBOX", p.sys, "local"),
                toggleItem("PADS TO DEVICE", p.sys, "thru"),
                toggleItem("SEND KNOBS", p.sys, "sendCtl"),
                toggleItem("SEND PATTERNS", p.sys, "sendPc"),
                numItem("FIXED VELOCITY", p.sys, "fixval", 1, 127, 1),
                numItem("CUE LEVEL", p.sys, "cue", 0, 1, 0.05, (v) => Math.round(v * 100) + ""),
                choiceItem("SONG NOTES PLAY", p, "mode", ["BANKS A-E", "BANKS F-J", "CHROMATIC"]),
                item("DRUM ROWS PLAY", () => "BANK " + BANKS[p.dbank | 0], (d) => { p.dbank = clamp((p.dbank | 0) + d, 0, 9); changed(); }),
                item("ASK ON CONNECT", () => onOff(s.spOffer), () => { s.spOffer = !s.spOffer; h.save(); }),
                item("INIT ALL", () => "", null, () => confirm("INIT EVERYTHING?", () => { const d = defaultParams(); for (const k of Object.keys(p)) delete p[k]; Object.assign(p, d); filled.delete(p); changed(); say("INITIALIZED"); })),
            ]);
        }
        function importExportMenu() {
            const p = P();
            menu("IMPORT/EXPORT", [
                item("IMPORT FILES", () => "→ " + BANKS[ui.bank] + "-" + ui.pad, null, () => pickFiles(false)),
                item("IMPORT FOLDER/SD", () => "→ BANK " + BANKS[ui.bank], null, () => pickFiles(true)),
                item("FROM LIBRARY", () => "→ " + BANKS[ui.bank] + "-" + ui.pad, null, () => libraryMenu()),
                item("LOAD KIT TO BANK", () => BANKS[ui.bank], null, () => kitMenu()),
                item("EXPORT PAD", () => "WAV", null, () => exportPad()),
                item("EXPORT PROJECT", () => "JSON", null, () => download(new Blob([JSON.stringify(P())], { type: "application/json" }), "sp-station-project.json")),
                item("IMPORT PROJECT", () => "JSON", null, () => importProject()),
            ]);
        }
        function padSettingMenu() {
            const p = P(), key = curKey();
            const pv = (prop) => curPad()[prop];
            const set = (prop, v) => { padSet(p, key, prop, v); changed(); };
            const num = (label, prop, min, max, step, fmt) => item(label, () => fmt ? fmt(pv(prop)) : String(pv(prop)), (d) => set(prop, +clamp(pv(prop) + d * step, min, max).toFixed(4)));
            const tog = (label, prop) => item(label, () => onOff(pv(prop)), () => set(prop, pv(prop) ? 0 : 1));
            menu("PAD " + BANKS[ui.bank] + "-" + ui.pad, [
                item("SAMPLE", () => (pv("n") || (pv("s") ? "SAMPLE" : "EMPTY")).slice(0, 12), null, () => pickFiles(false, true)),
                num("VOLUME", "vol", 0, 2, 0.02, (v) => Math.round(v * 100) + ""),
                num("PAN", "pan", -1, 1, 0.05, (v) => v == 0 ? "C" : (v < 0 ? "L" : "R") + Math.round(Math.abs(v) * 50)),
                item("BUS", () => ["DRY", "BUS 1", "BUS 2"][pv("bus") | 0], (d) => set("bus", clamp((pv("bus") | 0) + Math.sign(d), 0, 2))),
                item("MUTE GROUP", () => pv("mg") ? String(pv("mg")) : "OFF", (d) => set("mg", clamp((pv("mg") | 0) + Math.sign(d), 0, 4))),
                num("PITCH", "pitch", -12, 12, 1, (v) => (v > 0 ? "+" : "") + v),
                num("SPEED", "speed", 0.5, 2, 0.01, (v) => v.toFixed(2) + "X"),
                tog("BPM SYNC", "bpms"),
                num("SAMPLE BPM", "bpm", 0, 300, 0.5, (v) => v <= 0 ? "AUTO" : v.toFixed(1)),
                tog("LOOP", "loop"), tog("PING-PONG", "pp"), tog("GATE", "gate"), tog("REVERSE", "rev"),
                num("GAIN", "gain", -24, 12, 1, (v) => v + "DB"),
                num("ATTACK", "att", 0, 4, 0.01, (v) => v.toFixed(2) + "S"),
                num("HOLD", "hold", 0, 10, 0.05, (v) => v >= 10 ? "MAX" : v.toFixed(2) + "S"),
                num("RELEASE", "rel", 0.01, 4, 0.01, (v) => v.toFixed(2) + "S"),
                item("NAME", () => (pv("n") || "-").slice(0, 12), null, async () => { const name = await CarrotUI.ask({ title: "Pad name", value: pv("n") || "", maxLength: 24 }); if (name != null) set("n", name.trim().slice(0, 24)); }),
            ]);
        }
        function efxSettingMenu() {
            const p = P();
            const rows = () => {
                const bus = p.bus[ui.bus], def = FX[bus.fx];
                const labels = def.labels.concat(["MIX", "HI CUT", "LO CUT"]);
                const fmts = def.show.concat([pct, (c) => c >= 0.995 ? "OFF" : hz(expv(c, 300, 20000)), (c) => c <= 0.005 ? "OFF" : hz(expv(c, 20, 2000))]);
                return [
                    item("BUS", () => String(ui.bus + 1) + (inst().busMute[ui.bus] ? " MUTED" : ""), (d) => { ui.bus = clamp(ui.bus + Math.sign(d), 0, 3); ui.menu.items = rows(); }),
                    item("EFFECT", () => def.name, (d) => { bus.fx = clamp(bus.fx + Math.sign(d), 0, FX.length - 1); bus.c = FX[bus.fx].def.concat([1, 1, 0]); changed(); ui.menu.items = rows(); }),
                    item("ON", () => onOff(bus.on), () => { bus.on = bus.on ? 0 : 1; changed(); }),
                    ...labels.map((l, i) => item("CTRL " + (i + 1) + " " + l, () => fmts[i](bus.c[i]), (d) => { bus.c[i] = +clamp(bus.c[i] + d * 0.01, 0, 1).toFixed(3); changed(); })),
                    item("RESET", () => "", null, () => { bus.c = def.def.concat([1, 1, 0]); changed(); say("RESET"); }),
                ];
            };
            menu("EFX SETTING", rows());
        }
        function inputSettingMenu() {
            const p = P();
            const it = inst();
            menu("INPUT SETTING", [
                item("MONITOR", () => onOff(it.input && it.input.monitor), () => toggleMonitor()),
                item("SOURCE", () => (it.input ? it.input.label : "SP-404MKII").slice(0, 12), null, async () => {
                    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind == "audioinput");
                    menu("SOURCE", devices.map(d => item((d.label || "INPUT").slice(0, 20), () => (p.sys.srcId == d.deviceId ? "●" : ""), null, () => { p.sys.src = 1; p.sys.srcId = d.deviceId; changed(); closeInput(); say("SOURCE SET"); ui.menu = null; })), { parent: ui.menu });
                }),
                numItem("GAIN", p.sys, "inGain", 0, 4, 0.05, (v) => Math.round(v * 100) + ""),
                item("INPUT FX", () => FX[p.inFx.fx].name, (d) => { p.inFx.fx = clamp(p.inFx.fx + Math.sign(d), 0, FX.length - 1); p.inFx.c = FX[p.inFx.fx].def.concat([1, 1, 0]); changed(); }),
                item("INPUT FX ON", () => onOff(p.inFx.on), () => { p.inFx.on = p.inFx.on ? 0 : 1; changed(); }),
                ...[0, 1, 2].map(i => item("FX CTRL " + (i + 1), () => FX[p.inFx.fx].show[i](p.inFx.c[i]), (d) => { p.inFx.c[i] = +clamp(p.inFx.c[i] + d * 0.01, 0, 1).toFixed(3); changed(); })),
            ]);
        }
        function projectMenu() {
            const p = P();
            const all = loadProjects();
            const names = Object.keys(all).sort();
            const save = (name) => { const a = loadProjects(); a[name] = JSON.parse(JSON.stringify(p)); if (saveProjects(a)) { ui.project = name; say("SAVED " + name); } else say("STORAGE FULL"); };
            menu("PROJECT", [
                item("SAVE", () => (ui.project || "NEW").slice(0, 12), null, async () => { const name = ui.project || await CarrotUI.ask({ title: "Project name", value: "PROJECT " + (names.length + 1), maxLength: 20 }); if (name) save(name.trim()); }),
                item("SAVE AS", () => "", null, async () => { const name = await CarrotUI.ask({ title: "Save the project as", value: "PROJECT " + (names.length + 1), maxLength: 20 }); if (name) save(name.trim()); }),
                item("LOAD", () => names.length + " SAVED", null, () => {
                    if (!names.length) { say("NO PROJECTS"); return; }
                    menu("LOAD PROJECT", names.map(n => item(n.slice(0, 20), () => "", null, () => confirm("LOAD " + n.slice(0, 12) + "?", () => {
                        const d = loadProjects()[n];
                        if (!d) return;
                        for (const k of Object.keys(p)) delete p[k];
                        Object.assign(p, d);
                        filled.delete(p);
                        ui.project = n;
                        changed();
                        ui.menu = null;
                        say("LOADED " + n);
                    }))), { parent: ui.menu });
                }),
                item("NEW", () => "", null, () => confirm("NEW PROJECT?", () => { const d = defaultParams(); for (const k of Object.keys(p)) delete p[k]; Object.assign(p, d); filled.delete(p); ui.project = null; changed(); say("NEW PROJECT"); })),
                item("DELETE", () => "", null, () => {
                    if (!names.length) { say("NO PROJECTS"); return; }
                    menu("DELETE PROJECT", names.map(n => item(n.slice(0, 20), () => "", null, () => confirm("DELETE " + n.slice(0, 12) + "?", () => { const a = loadProjects(); delete a[n]; saveProjects(a); ui.menu = null; say("DELETED"); }))), { parent: ui.menu });
                }),
            ]);
        }
        function libraryMenu() {
            CarrotUI.ask({ title: "Find a CarrotBox sound for pad " + BANKS[ui.bank] + "-" + ui.pad, label: "Type a name or a type (kick, snare, 808, piano, vox...)", value: "" }).then((q) => {
                if (q == null) return;
                const words = q.toLowerCase().split(/\s+/).filter(Boolean);
                const found = A.FLSoundFactory.getCatalog().filter(it => words.every(w => (it.path || it.key || "").toLowerCase().includes(w) || (it.name || "").toLowerCase().includes(w))).slice(0, 300);
                if (!found.length) { say("NOTHING FOUND"); return; }
                const key = curKey();
                menu("LIBRARY (" + found.length + ")", found.map(it => item((it.name || it.key).slice(0, 21), () => "", null, () => {
                    P().pads[key] = Object.assign({}, P().pads[key] || {}, { s: "b:" + it.key, n: it.name || it.key });
                    delete P().pads[key].st; delete P().pads[key].en; delete P().pads[key].marks;
                    changed();
                    post({ t: "on", key, vel: 100 });
                    setTimeout(() => post({ t: "off", key }), 400);
                })), { onMove: (i) => { const it = found[i]; const e = FLSampleBank.requestNow("b:" + it.key); if (e && e.pcm) FLSampleBank.previewPcm(e.pcm, e.rate); } });
            });
        }
        function kitMenu() {
            const kits = A.FLSoundFactory.getKits();
            menu("LOAD KIT", kits.map(k => item(k.name.slice(0, 21), () => "", null, () => confirm("KIT TO BANK " + BANKS[ui.bank] + "?", () => {
                const p = P(), order = [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8];
                k.pads.forEach((pad, i) => { if (i < order.length) { const info = A.FLSoundFactory.getInfo(pad[0]); p.pads[padKey(ui.bank, order[i])] = { s: "b:" + pad[0], n: (info && info.name) || pad[0], mg: pad[1] ? 1 : 0 }; } });
                changed();
                ui.menu = null;
                say("LOADED " + k.name);
            }))));
        }
        function pickFiles(folder, single) {
            const input = HTML.input({ type: "file", accept: "audio/*,.wav,.aif,.aiff,.flac,.ogg,.mp3", style: "display: none;" });
            if (folder) { input.setAttribute("webkitdirectory", ""); input.setAttribute("directory", ""); }
            if (!single) input.multiple = true;
            input.addEventListener("change", async () => {
                const files = Array.from(input.files || []).filter(f => /\.(wav|wave|aif|aiff|flac|ogg|mp3|m4a)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                input.remove();
                if (!files.length) return;
                const p = P();
                say("IMPORTING " + files.length, 3000);
                let label = ui.pad, count = 0;
                for (const file of files) {
                    // names like A01.WAV, B-12, J16 go to that pad (an SP card export); the rest fill in order
                    const m = /(^|[^A-Z])([A-J])[-_ ]?0*([1-9]|1[0-6])(?![0-9])/i.exec(file.name.replace(/\.[^.]+$/, ""));
                    let key;
                    if (folder && m) key = m[2].toUpperCase() + (+m[3]);
                    else { if (label > 16) break; key = padKey(ui.bank, label++); }
                    try {
                        const id = await FLSampleBank.addFile(file);
                        p.pads[key] = { s: id, n: file.name.replace(/\.[^.]+$/, "").slice(0, 24) };
                        count++;
                    }
                    catch (error) { }
                    if (single) break;
                }
                changed();
                say("IMPORTED " + count, 1600);
            });
            document.body.appendChild(input);
            input.click();
        }
        async function dropOnPad(label, e) {
            padEls[label].classList.remove("sp-sel");
            const p = P(), key = padKey(ui.bank, label);
            const payload = A.flReadDragPayload(e);
            if (payload && payload.id) { p.pads[key] = { s: payload.id, n: (payload.name || FLSampleBank.getName(payload.id) || "").slice(0, 24) }; changed(); say("LOADED " + key); return; }
            const file = Array.from(e.dataTransfer.files || [])[0];
            if (file) { try { const id = await FLSampleBank.addFile(file); p.pads[key] = { s: id, n: file.name.replace(/\.[^.]+$/, "").slice(0, 24) }; changed(); say("LOADED " + key); } catch (error) { say("CAN'T READ FILE"); } }
        }
        function download(blob, name) {
            const a = HTML.a({ href: URL.createObjectURL(blob), download: name });
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        }
        function exportPad() {
            const pad = curPad(), e = entryOf(pad);
            if (!e || e.status != "ready") { say("EMPTY PAD"); return; }
            const a = Math.floor(pad.st * e.pcm.length), b = Math.max(a + 1, Math.floor(pad.en * e.pcm.length));
            download(new Blob([A.flEncodeWav([e.pcm.subarray(a, b)], e.rate)], { type: "audio/wav" }), (pad.n || curKey()).replace(/[^\w -]/g, "") + ".wav");
            say("EXPORTED");
        }
        function importProject() {
            const input = HTML.input({ type: "file", accept: ".json,application/json", style: "display: none;" });
            input.addEventListener("change", async () => {
                const file = input.files && input.files[0];
                input.remove();
                if (!file) return;
                try {
                    const d = JSON.parse(await file.text());
                    if (!d || typeof d != "object" || !d.pads) throw new Error("not a project");
                    const p = P();
                    for (const k of Object.keys(p)) delete p[k];
                    Object.assign(p, d);
                    filled.delete(p);
                    changed();
                    say("PROJECT IMPORTED");
                }
                catch (error) { say("NOT AN SP PROJECT"); }
            });
            document.body.appendChild(input);
            input.click();
        }

        // ============================================================ the display
        const drawWave = (pad, x, y, w, hgt, opts = {}) => {
            const e = entryOf(pad);
            if (!e || e.status != "ready" || !e.pcm) { oled.text(x + 2, y + Math.max(0, hgt / 2 - 3), e && e.status == "loading" ? "LOADING" : "NO SAMPLE"); return; }
            const pcm = e.pcm, len = pcm.length;
            let a0 = 0, a1 = 1;
            if (opts.zoom) { const span = Math.max(0.02, 1 - opts.zoom * 0.95), c = opts.focus || 0; a0 = clamp(c - span / 2, 0, 1 - span); a1 = a0 + span; }
            for (let i = 0; i < w; i++) {
                const s = Math.floor((a0 + (a1 - a0) * i / w) * len), t = Math.max(s + 1, Math.floor((a0 + (a1 - a0) * (i + 1) / w) * len));
                let pk = 0;
                for (let j = s; j < t; j += Math.max(1, (t - s) >> 6)) pk = Math.max(pk, Math.abs(pcm[j]));
                const hh = Math.max(1, Math.round(pk * hgt / 2));
                oled.vline(x + i, y + hgt / 2 - hh, hh * 2);
            }
            const toX = (u) => x + Math.round((u - a0) / (a1 - a0) * w);
            if (opts.marks) {
                const sx = toX(pad.st), ex = toX(pad.en);
                for (let i = x; i < x + w; i++) if (i < sx || i > ex) for (let j = y; j < y + hgt; j += 2) oled.set(i, j, 0);
                oled.vline(clamp(sx, x, x + w - 1), y - 2, hgt + 4); oled.vline(clamp(ex, x, x + w - 1), y - 2, hgt + 4);
                for (const m of pad.marks || []) for (let j = y; j < y + hgt; j += 3) oled.set(toX(m), j);
            }
            if (opts.chop) for (let i = 1; i < opts.chop; i++) { const u = pad.st + (pad.en - pad.st) * i / opts.chop; for (let j = y; j < y + hgt; j += 2) oled.set(toX(u), j); }
            const v = inst().voices.find(z => z.key == pad.key && !z.done);
            if (v) oled.vline(toX(pad.st + (pad.en - pad.st) * clamp(v.progress, 0, 1)), y - 1, hgt + 2);
        };
        const header = (left, right) => { oled.text(1, 1, left); if (right) oled.text(127 - oled.textWidth(right), 1, right); oled.hline(0, 9, 128); };
        function drawOled() {
            oled.clear();
            const now = performance.now(), p = P(), it = inst();
            if (now < ui.splashUntil) { oled.center(22, "SP-404", 3); }
            else if (ui.confirm) { header("CONFIRM"); oled.center(22, ui.confirm.text.slice(0, 21)); oled.center(40, "PUSH ENTER / EXIT"); }
            else if (ui.menu) {
                const m = ui.menu;
                header(m.title.slice(0, 21));
                const top = Math.max(0, Math.min(m.index - 2, m.items.length - 5));
                for (let i = 0; i < 5 && top + i < m.items.length; i++) {
                    const it2 = m.items[top + i], y = 12 + i * 10, sel = top + i == m.index;
                    if (sel) oled.rect(0, y - 1, 128, 9);
                    const val = it2.get ? String(it2.get()) : "";
                    oled.text(2, y, it2.label.slice(0, val ? Math.max(6, 20 - val.length) : 21), 1, sel ? 0 : 1);
                    if (val) oled.text(126 - oled.textWidth(val.slice(0, 12)), y, val.slice(0, 12), 1, sel ? 0 : 1);
                }
                if (m.items.length > 5) { const sh = Math.max(4, Math.round(52 * 5 / m.items.length)); oled.rect(127, 11 + Math.round((52 - sh) * top / (m.items.length - 5)), 1, sh); }
            }
            else if (ui.sampling) {
                const s = ui.sampling, cap = s.cap;
                header(s.kind == "sample" ? "SAMPLING" : "RESAMPLE", s.key ? s.key : "");
                if (!s.key) oled.center(18, "SELECT PAD");
                else if (cap.running) { oled.text(4, 16, "● REC", 2); oled.text(70, 20, (cap.len / cap.sr).toFixed(1) + "S"); }
                else oled.center(18, cap.armed ? "WAITING FOR SOUND" : "STANDBY: PUSH " + (s.kind == "sample" ? "REC" : "RESAMPLE"));
                const lvl = s.kind == "sample" ? (it.input ? it.input.level : 0) : it.meters[0];
                oled.text(2, 44, "LEVEL");
                oled.bar(36, 44, 90, 7, Math.min(1, Math.sqrt(lvl)));
                if (lvl > 0.98) oled.text(2, 54, "CLIP!");
            }
            else if (ui.pick) { header("SELECT", BANKS[ui.bank]); oled.center(26, ui.pick.text.slice(0, 21)); }
            else if (ui.dj) {
                header("DJ MODE", "BPM " + host.doc.song.tempo);
                (it.decks || []).forEach((dk, i) => {
                    const x = i * 64 + 2, pad = padOf(p, padKey(dk.bank != null ? dk.bank : ui.bank, dk.label));
                    oled.text(x, 12, "CH" + (i + 1) + " " + (dk.voice ? (dk.voice.paused ? "II" : "▶") : "■"));
                    oled.text(x, 21, (pad.n || "EMPTY").slice(0, 10));
                    oled.text(x, 30, (dk.rate * 100 - 100 >= 0 ? "+" : "") + (dk.rate * 100 - 100).toFixed(1) + "%");
                    oled.bar(x, 40, 58, 5, it.djVol ? it.djVol[i] : 0.8);
                });
                oled.text(2, 52, "X"); oled.frame(10, 53, 116, 5); oled.rect(10 + Math.round((it.djX == undefined ? 0.5 : it.djX) * 110), 52, 6, 7);
            }
            else if (ui.trrec) {
                const tr = ui.trrec, pat = p.pat[tr.key] || { len: 1, ev: [] }, bpb = it.bpb || 4, stepParts = bpb * 24 / 16;
                header("TR-REC " + tr.key, "BAR " + (tr.bar + 1) + "/" + pat.len);
                oled.text(1, 12, "PAD " + BANKS[ui.bank] + "-" + tr.pad + " " + (padOf(p, padKey(ui.bank, tr.pad)).n || "").slice(0, 10));
                oled.text(1, 21, "VEL " + tr.vel);
                const { bank, label } = parseKey(padKey(ui.bank, tr.pad));
                let playStep = -1;
                if (it.player && it.player.key == tr.key && it.player.anchor != null) {
                    const beat = it.beat - it.player.anchor, len = pat.len * bpb, pos = ((beat % len) + len) % len;
                    if (Math.floor(pos / bpb) == tr.bar) playStep = Math.floor((pos - tr.bar * bpb) / (bpb / 16));
                }
                for (let s2 = 0; s2 < 16; s2++) {
                    const x = 2 + s2 * 8, y = 34;
                    const pos = Math.round(tr.bar * bpb * 24 + s2 * stepParts);
                    const on = pat.ev.some(e => e[0] == pos && e[1] == bank && e[2] == label);
                    if (on) oled.rect(x, y, 6, 10); else oled.frame(x, y, 6, 10);
                    if (s2 == playStep) oled.hline(x, y + 13, 6);
                    if (s2 % 4 == 0) oled.set(x, y - 2);
                }
                oled.text(1, 55, "PADS=STEPS VALUE=PAD");
            }
            else if (ui.pattern) {
                header("PATTERN " + BANKS[ui.bank], it.rec ? "● REC" : (it.player ? "▶ " + it.player.key : "■"));
                for (let l = 1; l <= 16; l++) {
                    const k = padKey(ui.bank, l), x = 2 + ((l - 1) % 4) * 31, y = 12 + Math.floor((l - 1) / 4) * 13;
                    const playing = it.player && it.player.key == k, has = !!p.pat[k];
                    if (playing && (Math.floor(now / 250) % 2 == 0)) oled.rect(x, y, 29, 11);
                    else if (has) oled.frame(x, y, 29, 11);
                    oled.text(x + 3, y + 2, String(l).padStart(2, " ") + (has ? "*" : ""), 1, playing && Math.floor(now / 250) % 2 == 0 ? 0 : 1);
                }
            }
            else if (ui.mode == "startend" || ui.mode == "chop") {
                const pad = curPad(), chop = ui.mode == "chop";
                header(chop ? "CHOP " + BANKS[ui.bank] + "-" + ui.pad : "START/END " + BANKS[ui.bank] + "-" + ui.pad, chop ? (pad.marks && pad.marks.length ? "MARKS " + (pad.marks.length + 1) : ui.chop + " PARTS") : "");
                drawWave(pad, 0, 14, 128, 26, { marks: true, chop: chop && !(pad.marks && pad.marks.length) ? ui.chop : 0, zoom: chop ? 0 : ui.startendZoom, focus: pad.st });
                const e = entryOf(pad), dur = e && e.status == "ready" ? e.pcm.length / e.rate : 0;
                if (chop) oled.text(1, 55, "CTRL1/VALUE: N  ENTER");
                else { oled.text(1, 46, "S " + (pad.st * dur).toFixed(3) + "S"); oled.text(66, 46, "E " + (pad.en * dur).toFixed(3) + "S"); oled.text(1, 55, "LEN " + ((pad.en - pad.st) * dur).toFixed(3) + "S"); }
            }
            else if (ui.mode == "pitch") {
                const pad = curPad();
                header("PITCH/SPEED", BANKS[ui.bank] + "-" + ui.pad);
                oled.text(4, 16, "PITCH"); oled.text(4, 26, (pad.pitch > 0 ? "+" : "") + pad.pitch, 2);
                oled.text(70, 16, "SPEED"); oled.text(70, 26, pad.speed.toFixed(2), 2);
                oled.text(1, 55, "CTRL1 PITCH CTRL2 SPEED");
            }
            else if (ui.mode == "envelope") {
                const pad = curPad();
                header("ENVELOPE", BANKS[ui.bank] + "-" + ui.pad);
                const ax = 4 + Math.round(Math.sqrt(pad.att / 4) * 36), hx = ax + (pad.hold >= 10 ? 50 : Math.round(Math.sqrt(pad.hold / 10) * 50)), rx = hx + Math.round(Math.sqrt(pad.rel / 4) * 36) + 2;
                const line = (x0, y0, x1, y1) => { const n2 = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n2; i++) oled.set(x0 + (x1 - x0) * i / n2, y0 + (y1 - y0) * i / n2); };
                line(4, 40, ax, 14); line(ax, 14, hx, 14); line(hx, 14, Math.min(126, rx), 40);
                oled.text(1, 46, "A " + pad.att.toFixed(2)); oled.text(44, 46, "H " + (pad.hold >= 10 ? "MAX" : pad.hold.toFixed(2))); oled.text(88, 46, "R " + pad.rel.toFixed(2));
                oled.text(1, 55, "CTRL 1/2/3");
            }
            else if (ui.mode == "gain") { const pad = curPad(); header("GAIN", BANKS[ui.bank] + "-" + ui.pad); oled.center(22, (pad.gain > 0 ? "+" : "") + pad.gain + "DB", 2); oled.text(1, 55, "CTRL1 / VALUE"); }
            else if (ui.mode == "tap" || now < (ui.tempoUntil || 0)) { header(ui.mode == "tap" ? "TAP TEMPO" : "TEMPO"); oled.center(22, String(host.doc.song.tempo), 3); oled.center(52, ui.mode == "tap" ? "TAP PAD 11 / EXIT" : "BPM"); }
            else if (ui.mg) { header("MUTE GROUPS"); oled.center(20, "GROUP " + (ui.mgValue || "OFF"), 2); oled.center(46, "VALUE: GROUP  PAD: SET"); }
            else if (now < (ui.remainUntil || 0)) {
                let count = 0, seconds = 0;
                for (const k of Object.keys(p.pads)) { const e = p.pads[k].s && FLSampleBank.get(p.pads[k].s); if (p.pads[k].s) count++; if (e && e.pcm) seconds += e.pcm.length / e.rate; }
                header("REMAIN");
                oled.text(2, 14, "SAMPLES " + count + "/160");
                oled.text(2, 24, "LENGTH " + (seconds / 60).toFixed(1) + " MIN");
                oled.text(2, 34, "PATTERNS " + Object.keys(p.pat).length + "/160");
                oled.text(2, 44, "CURRENT " + BANKS[ui.bank] + "-" + ui.pad);
            }
            else if (now < ui.fxView) {
                const bus = P().bus[ui.bus], def = FX[bus.fx], o = ui.shift ? 3 : 0;
                header("BUS " + (ui.bus + 1) + (it.busMute[ui.bus] ? " MUTE" : ""), bus.on ? "ON" : "OFF");
                oled.center(13, def.name);
                const labels = def.labels.concat(["MIX", "HI CUT", "LO CUT"]), shows = def.show.concat([pct, (c) => c >= 0.995 ? "OFF" : hz(expv(c, 300, 20000)), (c) => c <= 0.005 ? "OFF" : hz(expv(c, 20, 2000))]);
                for (let i = 0; i < 3; i++) {
                    const x = 2 + i * 42;
                    oled.text(x, 25, labels[o + i].slice(0, 6));
                    oled.text(x, 35, String(shows[o + i](bus.c[o + i])).slice(0, 6));
                    oled.bar(x, 46, 38, 6, bus.c[o + i]);
                }
                oled.text(1, 56, ui.shift ? "CTRL 4-6" : "CTRL 1-3");
            }
            else {
                // home
                const pad = curPad();
                header("BANK " + BANKS[ui.bank], (it.player ? "▶" + it.player.key + " " : "") + host.doc.song.tempo + "BPM");
                oled.text(2, 12, BANKS[ui.bank] + "-" + ui.pad, 2);
                const flags = [pad.bpms ? "SYNC" : "", pad.gate ? "GATE" : "", pad.loop ? (pad.pp ? "PP" : "LOOP") : "", pad.rev ? "REV" : ""].filter(Boolean).join(" ");
                oled.text(52, 12, flags.slice(0, 12));
                oled.text(52, 21, (["DRY", "BUS1", "BUS2"][pad.bus | 0]) + (pad.mg ? " MG" + pad.mg : ""));
                oled.text(2, 29, (pad.n || (pad.s ? "SAMPLE" : "EMPTY")).slice(0, 21));
                drawWave(pad, 0, 38, 128, 12);
                const bus = p.bus[ui.bus];
                oled.text(1, 56, "B" + (ui.bus + 1) + " " + FX[bus.fx].name.slice(0, 14) + " " + (bus.on ? "ON" : ""));
            }
            if (ui.msg && now < ui.msg.until) {
                const t = ui.msg.text.slice(0, 20), w = oled.textWidth(t) + 8;
                const x = Math.round((128 - w) / 2);
                oled.rect(x, 24, w, 15, 0); oled.frame(x, 24, w, 15); oled.text(x + 4, 28, t);
            }
            // paint, slightly glowing
            g2.fillStyle = "#050506";
            g2.fillRect(0, 0, 256, 128);
            g2.fillStyle = "#e9f3ff";
            for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) if (oled.px[y * 128 + x]) g2.fillRect(x * 2, y * 2, 2, 2);
        }

        // ============================================================ lights
        function lights() {
            const p = P(), it = inst(), now = performance.now(), pad = curPad(), bus = p.bus[ui.bus], key = curKey();
            const lit = (id, on, blink) => { const b = buttons[id]; if (!b) return; b.classList.toggle("sp-lit", !!on && !blink); b.classList.toggle("sp-blink", !!blink); };
            lit("patsel", ui.pattern);
            lit("patedit", ui.trrec || (ui.menu && /^PATTERN/.test(ui.menu.title)));
            lit("recset", ui.menu && ui.menu.title == "RECORD SETTING");
            lit("startend", ui.mode == "startend", ui.mode == "chop");
            lit("pitch", ui.mode == "pitch", ui.mode == "envelope");
            lit("mark", pad.marks && pad.marks.length);
            lit("del", ui.pick && ui.pick.kind == "del", ui.confirm && /^DELETE/.test(ui.confirm.text));
            const s = ui.sampling;
            lit("rec", (s && s.kind == "sample" && s.cap.running) || (it.rec && it.rec.armed), (s && s.kind == "sample" && !s.cap.running) || (ui.pick && ui.pick.kind == "patrec"));
            lit("resample", s && s.kind == "resample" && s.cap.running, s && s.kind == "resample" && !s.cap.running);
            lit("bpmsync", pad.bpms); lit("gate", pad.gate); lit("loop", pad.loop, pad.loop && pad.pp); lit("reverse", pad.rev); lit("roll", ui.roll);
            lit("copy", ui.pick && /^copy/.test(ui.pick.kind));
            lit("remain", now < (ui.remainUntil || 0), ui.pick && ui.pick.kind == "current");
            for (let i = 0; i < 5; i++) lit("bank" + i, ui.bank == i, ui.bank == i + 5);
            lit("shift", ui.shift);
            lit("busfx", bus.on && !it.busMute[ui.bus], it.busMute[ui.bus]);
            lit("hold", ui.hold && !it.pause, it.pause);
            lit("ext", it.input && it.input.monitor);
            lit("subpad", ui.subDown);
            for (let i = 0; i < 5; i++) lit("fx" + i, bus.fx == FX_BY_ID.get(DIRECT_FX[i]) && bus.on);
            lit("mfx", bus.on && !DIRECT_FX.includes(FX[bus.fx].id), ui.menu && /^MFX/.test(ui.menu.title));
            // the pads
            const playingKeys = new Set(it.voices.filter(v => !v.done && v.played > 0).map(v => v.key));
            for (let l = 1; l <= 16; l++) {
                const el = padEls[l], k = padKey(ui.bank, l), raw = p.pads[k];
                let cls = "";
                if (ui.pattern) cls = it.player && it.player.key == k ? (Math.floor(now / 200) % 2 ? "sp-hot" : "sp-on") : p.pat[k] ? "sp-on" : "";
                else if (ui.trrec) {
                    const tr = ui.trrec, pat = p.pat[tr.key], bpb = it.bpb || 4, stepParts = bpb * 24 / 16;
                    const { bank, label } = parseKey(padKey(ui.bank, tr.pad)), pos = Math.round(tr.bar * bpb * 24 + (l - 1) * stepParts);
                    cls = pat && pat.ev.some(e => e[0] == pos && e[1] == bank && e[2] == label) ? "sp-on" : "";
                }
                else if (ui.dj) cls = [13, 15].includes(l) && it.decks && it.decks[l == 13 ? 0 : 1].voice && !it.decks[l == 13 ? 0 : 1].voice.paused ? "sp-on" : (l - 1) % 4 < 2 ? "sp-blue" : "sp-amber";
                else if (ui.chromatic) cls = "sp-blue";
                else if (ui.vel16) cls = "sp-amber";
                else if (ui.mg) cls = raw && raw.mg ? (raw.mg == ui.mgValue ? "sp-alt" : "sp-on") : "";
                else if (raw && raw.s) cls = "sp-loaded";
                if (playingKeys.has(k) || now - (el._hit || 0) < 110) cls = "sp-hot";
                el.className = "sp-pad " + cls + (l == ui.pad && !ui.pattern && !ui.trrec && !ui.dj ? " sp-sel" : "");
                const name = raw && raw.n ? raw.n : (raw && raw.s ? FLSampleBank.getName(raw.s) : "");
                if (el.nameEl.textContent != name) el.nameEl.textContent = name;
            }
            // SHIFT shows the pad functions
            const fnOn = { 1: p.sys.fixv, 2: ui.vel16, 3: ui.cue, 4: ui.chromatic, 8: ui.mg, 9: p.sys.metro, 10: p.sys.cnt, 11: ui.mode == "tap", 12: ui.mode == "gain" };
            for (let l = 1; l <= 16; l++) fnEls[l].classList.toggle("sp-lit", !!fnOn[l] || (ui.shift && Math.floor(now / 400) % 2 == 0));
            // the knob labels follow the effect or the edit mode
            const def = FX[bus.fx], o = ui.shift ? 3 : 0;
            const labels = ui.dj ? ["CH1 VOL", "CH2 VOL", "X-FADE"] : ui.mode == "startend" ? ["START", "END", "ZOOM"] : ui.mode == "pitch" ? ["PITCH", "SPEED", ""] : ui.mode == "envelope" ? ["ATTACK", "HOLD", "RELEASE"] : ui.mode == "chop" ? ["CHOPS", "", ""] : ui.mode == "gain" ? ["GAIN", "", ""] : ui.trrec ? ["BAR", "VELOCITY", ""] : def.labels.concat(["MIX", "HI CUT", "LO CUT"]).slice(o, o + 3);
            labels.forEach((t, i) => { if (ctrlLabels[i].textContent != t) ctrlLabels[i].textContent = t; ctrlKnobs[i].draw(); });
            volKnob.draw();
        }

        // ============================================================ the device (USB MIDI)
        const onDevice = (data) => {
            const p = P(), status = data[0], type = status & 0xF0, ch = status & 0x0F;
            if (type == 0x90 || type == 0x80) {
                const where = h.spDecode(ch, data[1]);
                if (!where) return;
                const label = labelOf(where.slot), on = type == 0x90 && data[2] > 0;
                if (on) padDown(label, data[2], true, where.bank); else padUp(label, true, where.bank);
            }
            else if (type == 0xB0 && ch < 4) {
                const cc = data[1], v = data[2] / 127, bus = p.bus[ch];
                const idx = [16, 17, 18, 80, 81, 82].indexOf(cc);
                if (idx >= 0) { bus.c[idx] = +v.toFixed(4); ui.bus = ch; ui.fxView = performance.now() + 1500; changed(false); }
                else if (cc == 19) { bus.on = data[2] >= 64 ? 1 : 0; ui.bus = ch; ui.fxView = performance.now() + 1500; changed(); }
            }
            else if (type == 0xC0 && ch < 10) {
                const key = padKey(ch, (data[1] & 15) + 1);
                ui.lastPattern = key;
                if (p.pat[key]) post({ t: "play", key, queue: !!inst().player, now: !inst().player && !inst().playing });
                else say("SP PATTERN " + key);
            }
        };
        if (h) { h.deviceListeners.add(onDevice); h.spPanelOpen = (h.spPanelOpen || 0) + 1; }
        ensureSkipBack();

        // computer keys play the pads (1-4, Q-R, A-F, Z-V), Enter is ENTER, arrows turn VALUE
        const KEYS = { "1": 1, "2": 2, "3": 3, "4": 4, q: 5, w: 6, e: 7, r: 8, a: 9, s: 10, d: 11, f: 12, z: 13, x: 14, c: 15, v: 16 };
        root.addEventListener("keydown", (e) => {
            if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
            const k = e.key.toLowerCase();
            if (KEYS[k] && !e.repeat && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); padDown(KEYS[k], 100, false, null, e.shiftKey); return; }
            if (e.key == "Enter") { e.preventDefault(); e.stopPropagation(); press("enter", true, e); }
            else if (e.key == "ArrowUp" || e.key == "ArrowRight") { e.preventDefault(); e.stopPropagation(); valueTurn(1, e.shiftKey); }
            else if (e.key == "ArrowDown" || e.key == "ArrowLeft") { e.preventDefault(); e.stopPropagation(); valueTurn(-1, e.shiftKey); }
            else if (e.key == "Backspace") { e.preventDefault(); e.stopPropagation(); press("exit", true, e); }
        });
        root.addEventListener("keyup", (e) => { const k = e.key.toLowerCase(); if (KEYS[k]) { e.stopPropagation(); padUp(KEYS[k], false); } });

        // the lock: nothing works without the device
        const renderLock = () => {
            lock.innerHTML = "";
            const connect = CarrotUI.button("Connect USB MIDI", () => h && h.connect(host.editor), { primary: true });
            lock.append(HTML.b("Connect your SP-404MKII"), HTML.div({ class: "cb-hint" }, "SP Station works only while an SP-404MKII is connected by USB. Plug it in (and allow MIDI in the browser): the panel unlocks by itself."), connect, HTML.div({ class: "cb-hint", style: "font-size: 10px;" }, h ? h.status : "No Web MIDI in this browser."));
        };
        renderLock();

        // ---- strip above the panel: how song notes reach the pads, writing patterns
        const modeSel = CarrotUI.select({ label: "Song notes play", options: ["Banks A-E", "Banks F-J", "Chromatic pad"], value: P().mode, onChange: (v) => { P().mode = v; changed(); } });
        const strip = HTML.div({ class: "sp-strip" }, modeSel,
            CarrotUI.button("Pattern → song", () => { const k = ui.lastPattern || (inst().player && inst().player.key); if (k) patternToSong(k); else say("SELECT A PATTERN"); }, { title: "Write the selected pattern into this channel at the current bar" }),
            CarrotUI.button("Import samples…", () => pickFiles(false), { title: "Load audio files onto the pads from the current one" }),
            HTML.span({ style: "margin-left: auto;" }, "Keys: 1-4 Q-R A-F Z-V pads · Shift = SHIFT · Enter = ENTER · ↑↓ = VALUE"));
        root.append(strip, face);

        // fit the panel to the screen height
        const fit = () => { const z = clamp((window.innerHeight - 170) / 900, 0.6, 1); root.style.zoom = z < 0.995 ? String(z) : ""; };
        fit();
        window.addEventListener("resize", fit);
        let alive = true, seen = false, lastDraw = 0, lastLive = null;
        const frame = () => {
            if (!alive) return;
            if (root.isConnected) seen = true; else if (seen) { cleanup(); return; }
            const now = performance.now();
            const live = deviceLive();
            if (live !== lastLive) { lastLive = live; lock.style.display = live ? "none" : "flex"; if (!live) renderLock(); }
            const it = inst();
            if (it.changed) { it.changed = false; changed(true); }
            if (ui.mode == "tap" && now - (ui.taps[ui.taps.length - 1] || now) > 4000 && ui.taps.length) ui.mode = "home";
            djUpdate();
            // keep the pads' samples loaded so the first hit sounds
            if (now - (ui.prefetchAt || 0) > 1000) { ui.prefetchAt = now; const pads = P().pads; for (const k in pads) if (pads[k].s) FLSampleBank.request(pads[k].s); }
            // keep the instrument running while the panel plays something
            if (live && (it.player || it.direct.length || it.roll || (it.input && it.input.monitor) || (it.capture && it.capture.running) || it.clicks.length)) keepAwake();
            if (now - lastDraw > 33 && root.isConnected) { lastDraw = now; lights(); drawOled(); }
            requestAnimationFrame(frame);
        };
        function cleanup() {
            if (!alive) return;
            alive = false;
            window.removeEventListener("resize", fit);
            if (h) { h.deviceListeners.delete(onDevice); h.spPanelOpen = Math.max(0, (h.spPanelOpen || 1) - 1); }
            const it = inst();
            post({ t: "stopPattern" });
            if (it.rec) post({ t: "recStop" });
            for (const k of ui.latched) post({ t: "off", key: k });
            if (ui.sampling) cancelSampling();
            closeInput();
            it.skip = null;
            if (ui.keepTimer) { clearTimeout(ui.keepTimer); ui.keepTimer = null; }
            host.noteOff(KEEPALIVE);
        }
        host._spCleanup = cleanup;
        host.onRefresh(() => { ui.bank = clamp(P().ui.bank | 0, 0, 9); });
        requestAnimationFrame(frame);
        setTimeout(() => root.focus({ preventScroll: true }), 50);
        return root;
    }

    B.CarrotPlugins.register({
        id: "spstation",
        width: 640,
        defaultParams,
        presets: [],
        randomize: null,
        createVoice,
        render,
        createInstrumentState,
        processInstrument,
        buildEditor,
        onClose: (host) => { if (host._spCleanup) host._spCleanup(); },
        // for CarrotBox's hardware link: which song pitch a device pad is, and back
        padPitch: (params, bank, slot, isDrum) => padToNote(fill(params), bank, labelOf(slot), !!isDrum),
        pitchPad: (params, pitch, isDrum) => { const w = noteToPad(fill(params), pitch, !!isDrum); if (!w) return null; const k = parseKey(w.key); return { bank: k.bank, slot: slotOf(k.label) }; },
        // for tests
        effects: FX.map(f => f.id),
        engine: { instFor, postEvent, processInstrument, fill, defaultParams, padOf, startPad, noteToPad, padToNote, slotOf, labelOf },
    });
})();
