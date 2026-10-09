/*
 * AudioMidi - turns a recording (WAV, MP3, OGG, FLAC, M4A, AIFF) into a CarrotBox song.
 *
 * The analysis (it runs in a Web Worker, so the editor keeps working):
 *   1. Spectra: one pass with three window lengths (4096, 2048 and 1024 samples at
 *      22,050 Hz). Every spectral peak is reassigned to its exact frequency
 *      (derivative-window reassignment), so partials stay sharp even in the bass.
 *   2. Beat: SuperFlux onsets, a tempo estimate (autocorrelation + comb + prior),
 *      dynamic-programming beat tracking that follows tempo drift, downbeats and
 *      meter (3 or 4 beats per bar) from the kick, snare, bass and chord changes.
 *   3. Notes: per-frame sparse NMF with harmonic templates (four timbre shapes per
 *      pitch, tuned to the recording) explains each spectrum as a set of notes.
 *      Notes are tracked with adaptive hysteresis, re-attacks are split, onsets
 *      are refined with a short window, harmonic ghosts are removed, and glides,
 *      vibrato bends and velocities are measured. Real polyphony: every note keeps
 *      its own start and length.
 *   4. Drums: partially fixed NMF on 48 log bands with eleven drum templates
 *      (made from CarrotBox's own drum sounds) plus free templates that soak up
 *      everything else. The templates then adapt to the recording's kit and the
 *      hits are re-detected: kick, snare, clap, closed and open hat, three toms,
 *      crash, ride and rim.
 *   5. Roles: bass (the lowest line), lead (the top line that moves on its own),
 *      harmony (everything else), key and chord names.
 * Writing: each part goes to its own channel with matched sounds (the drum kit is
 * built from the library sounds closest to the recording's drums), timing follows
 * the beat map (exact or quantized), and the original goes on a muted track.
 *
 * Instruments are CarrotBox sounds, not the originals.
 */
(function () {
	"use strict";
	const B = window.beepbox;
	if (!B || !B.CarrotPlugins) return;
	const A = B.CarrotAPI;
	const { HTML, CarrotUI, Config } = A;

	A.addStyle(`
.cb-am-drop { border: 2px dashed rgba(127,127,127,0.45); border-radius: 10px; padding: 16px; text-align: center; cursor: pointer; transition: background 0.15s; }
.cb-am-drop:hover, .cb-am-drop.cb-hover { background: rgba(0,200,255,0.08); }
.cb-am-drop b { display: block; font-size: 14px; margin-bottom: 4px; }
.cb-am-progress { height: 8px; border-radius: 4px; background: rgba(127,127,127,0.2); overflow: hidden; margin: 8px 0 4px; }
.cb-am-progress div { height: 100%; width: 0%; background: var(--cb-plugin-color, #00c8ff); transition: width 0.1s; }
.cb-am-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin: 8px 0; }
.cb-am-stat { padding: 6px 8px; border-radius: 8px; background: rgba(127,127,127,0.1); min-width: 0; }
.cb-am-stat small { display: block; opacity: 0.65; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.cb-am-stat b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.cb-am-legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 10px; margin: 4px 0; opacity: 0.85; }
.cb-am-legend span::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; background: var(--c); }
`);

	// ======================================================================= engine
	// Everything below works on mono 22,050 Hz audio and only uses typed arrays, so
	// the same code runs in a Web Worker (built from this function's source) or on
	// the page when workers are not available.
	function amEngine() {
		const SR = 22050, HOP = 256, FPS = SR / HOP;
		const BPS = 3, M0 = 24, NB = 96 * BPS;          // log-frequency bins: MIDI 24..120, three per semitone
		const P0 = 28, P1 = 96, NP = P1 - P0 + 1;       // notes we look for: E1..C7
		const DB = 48;                                   // drum bands, 30 Hz .. 11 kHz
		const DRUMS = ["kick", "snare", "clap", "hat", "open", "tomLow", "tomMid", "tomHigh", "crash", "ride", "rim"];
		const DRUM_FAMILIES = [["kick", "tomLow", "tomMid", "tomHigh"], ["snare", "clap", "rim"], ["hat", "open", "crash", "ride"]];
		const DRUM_PRIOR = { kick: 1.8, snare: 1.3, clap: 1.2, hat: 1.5, open: 1.2 }; // the usual drums win close calls
		const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
		const hzMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
		let pause = () => null;
		const setPause = (fn) => { pause = fn; };

		// ---------------------------------------------------------------- FFT
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
			// Hann window and its derivative (per sample) for frequency reassignment
			const win = new Float64Array(n), dwin = new Float64Array(n);
			for (let i = 0; i < n; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); dwin[i] = (Math.PI / n) * Math.sin(2 * Math.PI * i / n); }
			const t = { n, rev, cos, sin, win, dwin, re: new Float64Array(n), im: new Float64Array(n) };
			fftCache.set(n, t);
			return t;
		}
		function fft(re, im, t) {
			const n = t.n, rev = t.rev;
			for (let i = 0; i < n; i++) {
				const j = rev[i];
				if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; }
			}
			const cs = t.cos, sn = t.sin;
			for (let size = 2; size <= n; size <<= 1) {
				const half = size >> 1, step = n / size;
				for (let i = 0; i < n; i += size) {
					for (let j = 0, k = 0; j < half; j++, k += step) {
						const wr = cs[k], wi = sn[k], a = i + j, b = a + half;
						const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
						re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
					}
				}
			}
		}
		// One frame centred on sample `center`: the windowed spectrum (re/im of x*w) and the
		// derivative-window spectrum share one complex FFT (x*w + i x*dw).
		function frameFFT(x, center, t) {
			const n = t.n, re = t.re, im = t.im, w = t.win, dw = t.dwin;
			const start = center - (n >> 1);
			for (let i = 0; i < n; i++) {
				const j = start + i;
				const v = j >= 0 && j < x.length ? x[j] : 0;
				re[i] = v * w[i];
				im[i] = v * dw[i];
			}
			fft(re, im, t);
		}

		// ---------------------------------------------------------------- spectra
		const REGIONS = [[4096, 0, 500, 2], [2048, 500, 1600, 1], [1024, 1600, 8500, 1]]; // window, from Hz, to Hz, frame step
		const bandEdges = (() => {
			const edges = new Float64Array(DB + 1);
			for (let i = 0; i <= DB; i++) edges[i] = 30 * Math.pow(11000 / 30, i / DB);
			return edges;
		})();
		const bandOfShort = new Int16Array(512).fill(-1), bandCountShort = new Float32Array(DB);
		for (let k = 1; k < 512; k++) {
			const hz = k * SR / 1024;
			for (let b = 0; b < DB; b++) if (hz >= bandEdges[b] && hz < bandEdges[b + 1]) { bandOfShort[k] = b; bandCountShort[b]++; break; }
		}
		// low bands narrower than one FFT bin get no bins: they take their neighbours' level
		function fillBands(D, frames) {
			for (let f = 0; f < frames; f++) {
				for (let b = 0; b < DB; b++) {
					if (bandCountShort[b] > 0) continue;
					let l = b - 1, r = b + 1;
					while (l >= 0 && bandCountShort[l] == 0) l--;
					while (r < DB && bandCountShort[r] == 0) r++;
					D[f * DB + b] = l >= 0 && r < DB ? 0.5 * (D[f * DB + l] + D[f * DB + r]) : D[f * DB + (l >= 0 ? l : r)];
				}
			}
		}
		// The percussive part of short-window magnitudes M1 (frames x 512), summed into drum bands.
		function percussiveBands(M1, frames, D) {
			const Ht = new Float32Array(M1.length), Pf = new Float32Array(M1.length);
			for (let k = 1; k < 512; k++) slidingMedian(M1, 512, k, frames, 8, Ht, 512);
			for (let f = 0; f < frames; f++) slidingMedian(M1, 1, f * 512, 512, 8, Pf, 1);
			for (let f = 0; f < frames; f++) {
				for (let k = 1; k < 512; k++) {
					const i = f * 512 + k, h = Ht[i], pp = Pf[i];
					const b = bandOfShort[k];
					if (b >= 0) D[f * DB + b] += M1[i] * (pp * pp / (pp * pp + h * h + 1e-12)) / bandCountShort[b];
				}
			}
			fillBands(D, frames);
			return D;
		}
		// Median of src[offset + j*stride] over j-half..j+half for every j < n (edges clamped),
		// written to out[offset + j*outStride]. A sorted window slides along.
		function slidingMedian(src, stride, offset, n, half, out, outStride) {
			const w = 2 * half + 1, win = new Float64Array(w);
			const at = (j) => src[offset + (j < 0 ? 0 : j >= n ? n - 1 : j) * stride];
			for (let j = -half; j <= half; j++) win[j + half] = at(j);
			win.sort();
			for (let j = 0; j < n; j++) {
				out[offset + j * outStride] = win[half];
				const gone = at(j - half), comes = at(j + half + 1);
				if (gone === comes) continue;
				let i = 0;
				while (i < w - 1 && win[i] !== gone) i++;
				// remove `gone` and insert `comes`, keeping the window sorted
				if (comes > gone) {
					while (i < w - 1 && win[i + 1] < comes) { win[i] = win[i + 1]; i++; }
				}
				else {
					while (i > 0 && win[i - 1] > comes) { win[i] = win[i - 1]; i--; }
				}
				win[i] = comes;
			}
		}
		async function spectra(x, progress) {
			const frames = Math.max(2, Math.ceil(x.length / HOP) + 1);
			const V = new Float32Array(frames * NB);     // reassigned log-frequency magnitude (notes)
			const S1 = new Float32Array(frames * 96);    // semitone magnitude from the short window (timing)
			const D = new Float32Array(frames * DB);     // drum bands from the short window (percussive part)
			const M1 = new Float32Array(frames * 512);   // short-window magnitudes (for the harmonic / percussive split)
			const peaks = new Float64Array(BPS * 40);    // tuning histogram (cents in 1/40 steps of a bin)
			const binScale = BPS / Math.log(2) * 12;
			let last = Date.now();
			for (let r = 0; r < REGIONS.length; r++) {
				const [N, fLo, fHi, every] = REGIONS[r];
				const t = fftTables(N);
				const kLo = Math.max(1, Math.floor(fLo * N / SR)), kHi = Math.min(N / 2 - 1, Math.ceil(fHi * N / SR));
				const norm = 4 / N, twoPiOverN = N / (2 * Math.PI);
				const isShort = N == 1024;
				for (let f = 0; f < frames; f += every) {
					frameFFT(x, f * HOP, t);
					const re = t.re, im = t.im;
					const row = f * NB;
					for (let k = isShort ? 1 : kLo; k <= (isShort ? N / 2 - 1 : kHi); k++) {
						const Xr = re[k], Xi = im[k], Yr = re[N - k], Yi = im[N - k];
						const Ar = 0.5 * (Xr + Yr), Ai = 0.5 * (Xi - Yi);
						const Br = 0.5 * (Xi + Yi), Bi = 0.5 * (Yr - Xr);
						const p2 = Ar * Ar + Ai * Ai;
						const mag = Math.sqrt(p2) * norm;
						if (isShort) M1[f * 512 + k] = mag;
						if (mag < 1e-5) continue;
						// reassigned frequency (in bins)
						const kHat = k - twoPiOverN * (Bi * Ar - Br * Ai) / p2;
						if (!(kHat > 0.5)) continue;
						const hz = kHat * SR / N;
						const pos = (Math.log(hz / 440) * binScale) + (69 - M0) * BPS;
						if (isShort) {
							const s = Math.round(pos / BPS);
							if (s >= 0 && s < 96) S1[f * 96 + s] += mag;
						}
						if (k < kLo || k > kHi || pos < 0 || pos >= NB - 1) continue;
						const b0 = Math.floor(pos), fr = pos - b0;
						V[row + b0] += mag * (1 - fr);
						V[row + b0 + 1] += mag * fr;
						// strong, clean peaks vote for the tuning
						if (mag > 0.02 && Math.abs(kHat - k) < 0.5) {
							const within = ((pos % BPS) + BPS) % BPS; // 0 = exactly on a semitone (A = 440 Hz)
							peaks[Math.min(peaks.length - 1, Math.floor(within * 40))] += mag;
						}
					}
					if (Date.now() - last > 40) { progress(0.03 + 0.27 * (r + f / frames) / REGIONS.length, "Reading the spectrum"); await pause(); last = Date.now(); }
				}
				// the long window ran on every other frame: fill the gaps
				if (every > 1) {
					const topBin = Math.min(NB, Math.ceil((hzMidi(fHi + 30) - M0) * BPS) + 1);
					for (let f = 1; f < frames; f += every) {
						const a = (f - 1) * NB, b = Math.min(frames - 1, f + 1) * NB, row = f * NB;
						for (let k = 0; k < topBin; k++) V[row + k] += 0.5 * (V[a + k] + V[b + k]);
					}
				}
			}
			// Harmonic / percussive split (median filtering): sustained partials are smooth in time,
			// drum hits are smooth across frequency. Drums are analyzed on the percussive part.
			progress(0.3, "Separating drums from notes");
			await pause();
			percussiveBands(M1, frames, D);
			// the same split on the note spectrum (log frequency): drums out of the notes
			{
				const Ht = new Float32Array(V.length), Pf = new Float32Array(V.length);
				for (let b = 0; b < NB; b++) slidingMedian(V, NB, b, frames, 5, Ht, NB);
				for (let f = 0; f < frames; f++) slidingMedian(V, 1, f * NB, NB, 9, Pf, 1);
				for (let i = 0; i < V.length; i++) {
					const h = Ht[i], pp = Pf[i];
					V[i] *= h * h / (h * h + pp * pp + 1e-12);
				}
			}
			// tuning: the most common position of strong peaks inside a semitone (circular mean)
			let cx = 0, cy = 0;
			for (let i = 0; i < peaks.length; i++) { const ang = 2 * Math.PI * (i + 0.5) / peaks.length; cx += Math.cos(ang) * peaks[i]; cy += Math.sin(ang) * peaks[i]; }
			let tuneBins = 0;
			if (cx * cx + cy * cy > 0)
				tuneBins = Math.atan2(cy, cx) / (2 * Math.PI) * BPS; // offset from A = 440 Hz tuning, in bins (-1.5..1.5)
			return { frames, V, S1, D, tuning: tuneBins / BPS * 100 /* cents */ };
		}

		// ---------------------------------------------------------------- onsets and beats
		function onsetEnvelope(D, frames) {
			// SuperFlux on log drum bands: rise against the loudest neighbour of the frame before
			const L = new Float32Array(D.length);
			for (let i = 0; i < D.length; i++) L[i] = Math.log(1 + 1000 * D[i]);
			const env = new Float32Array(frames), low = new Float32Array(frames), mid = new Float32Array(frames), high = new Float32Array(frames);
			for (let f = 2; f < frames; f++) {
				let all = 0, lo = 0, mi = 0, hi = 0;
				for (let b = 0; b < DB; b++) {
					const prev = Math.max(L[(f - 2) * DB + b], L[(f - 1) * DB + Math.max(0, b - 1)], L[(f - 1) * DB + b], L[(f - 1) * DB + Math.min(DB - 1, b + 1)]);
					const d = L[f * DB + b] - prev;
					if (d > 0) {
						all += d;
						if (b < 12) lo += d; else if (b < 34) mi += d; else hi += d;
					}
				}
				env[f] = all; low[f] = lo; mid[f] = mi; high[f] = hi;
			}
			// minus a running mean (0.4 s), half-wave rectified
			const out = new Float32Array(frames);
			const W = Math.round(0.4 * FPS);
			let acc = 0;
			for (let f = 0; f < frames; f++) {
				acc += env[f] - (f - W >= 0 ? env[f - W] : 0);
				out[f] = Math.max(0, env[f] - acc / Math.min(W, f + 1));
			}
			return { env: out, raw: env, low, mid, high };
		}
		function estimateTempo(env, frames, minBpm, maxBpm) {
			const lagMin = Math.floor(FPS * 60 / maxBpm), lagMax = Math.ceil(FPS * 60 / minBpm);
			const ac = new Float64Array(lagMax * 4 + 4);
			let mean = 0;
			for (let f = 0; f < frames; f++) mean += env[f];
			mean /= frames;
			for (let L = 1; L < ac.length && L < frames - 1; L++) {
				let s = 0;
				for (let t = 0; t + L < frames; t++) s += (env[t] - mean) * (env[t + L] - mean);
				ac[L] = s / (frames - L);
			}
			let best = lagMin, bestScore = -Infinity;
			const scores = new Float64Array(lagMax + 2);
			const at = (x) => { const i = Math.floor(x), fr = x - i; return i + 1 < ac.length ? ac[i] * (1 - fr) + ac[i + 1] * fr : 0; };
			for (let L = lagMin; L <= lagMax; L++) {
				const bpm = 60 * FPS / L;
				const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.9, 2));
				const s = prior * (at(L) + 0.5 * at(2 * L) + 0.33 * at(3 * L) + 0.25 * at(4 * L) + 0.25 * Math.max(0, at(L / 2)));
				scores[L] = s;
				if (s > bestScore) { bestScore = s; best = L; }
			}
			// A beat 1.5 times too long (dotted rhythms, trap) splits in three rather than in two:
			// take the faster tempo when its own evidence is close.
			const duple = (L) => Math.max(0, at(L / 2)), triple = (L) => Math.max(0, 0.5 * (at(L / 3) + at(2 * L / 3)));
			const faster = Math.round(best * 2 / 3);
			if (faster >= lagMin && triple(best) > 2 * duple(best) + 1e-9 && scores[faster] > 0.3 * bestScore) {
				best = faster;
				for (const L of [faster - 1, faster + 1]) if (L >= lagMin && scores[L] > scores[best]) best = L;
			}
			let P = best;
			if (best > lagMin && best < lagMax) {
				const a = scores[best - 1], b = scores[best], c = scores[best + 1], d = a - 2 * b + c;
				if (d < 0) P = best + 0.5 * (a - c) / d;
			}
			return 60 * FPS / P;
		}
		// Dynamic programming beat tracking (Ellis 2007): beats land on strong onsets and their
		// spacing stays close to the tempo, but may drift with it.
		function trackBeats(env, frames, bpm, tightness) {
			const P = 60 * FPS / bpm;
			let sd = 0, mean = 0;
			for (let f = 0; f < frames; f++) mean += env[f];
			mean /= frames;
			for (let f = 0; f < frames; f++) sd += (env[f] - mean) * (env[f] - mean);
			sd = Math.sqrt(sd / frames) || 1;
			const local = new Float64Array(frames);
			for (let f = 0; f < frames; f++) local[f] = env[f] / sd;
			const score = new Float64Array(frames), back = new Int32Array(frames).fill(-1);
			const lo = Math.round(P * 0.5), hi = Math.round(P * 2);
			for (let t = 0; t < frames; t++) {
				let best = -Infinity, arg = -1;
				for (let tau = t - hi; tau <= t - lo; tau++) {
					if (tau < 0) continue;
					const l = Math.log((t - tau) / P);
					const v = score[tau] - tightness * l * l;
					if (v > best) { best = v; arg = tau; }
				}
				score[t] = local[t] + (best > 0 ? best : 0);
				back[t] = best > 0 ? arg : -1;
			}
			// best end: the highest score among the last beat period
			let end = frames - 1, bestEnd = -Infinity;
			for (let t = Math.max(0, frames - Math.round(P)); t < frames; t++) if (score[t] > bestEnd) { bestEnd = score[t]; end = t; }
			const beats = [];
			for (let t = end; t >= 0; t = back[t]) beats.push(t);
			beats.reverse();
			return beats;
		}
		// Seconds of each beat, extended over the whole file. Uses a straight grid when the
		// tracked beats are steady (more precise), the tracked beats when the tempo moves.
		function beatGrid(beatFrames, env, frames, bpm) {
			const duration = frames / FPS;
			let beats = beatFrames.map(f => {
				// sub-frame peak position
				const a = env[f - 1] || 0, b = env[f], c = env[f + 1] || 0, d = a - 2 * b + c;
				return (f + (d < 0 && b > 0 ? 0.5 * (a - c) / d : 0)) / FPS;
			});
			let steady = false, period = 60 / bpm;
			if (beats.length >= 8) {
				// least squares line through the beats
				const n = beats.length;
				let sx = 0, sy = 0, sxx = 0, sxy = 0;
				for (let i = 0; i < n; i++) { sx += i; sy += beats[i]; sxx += i * i; sxy += i * beats[i]; }
				const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
				let err = 0;
				for (let i = 0; i < n; i++) err += Math.pow(beats[i] - (icpt + slope * i), 2);
				err = Math.sqrt(err / n);
				period = slope;
				if (err < 0.018) {
					steady = true;
					// whole BPM when it is close (songs are usually made at a whole tempo)
					let b = 60 / slope;
					if (Math.abs(b - Math.round(b)) < 0.2) b = Math.round(b);
					else if (Math.abs(b * 2 - Math.round(b * 2)) < 0.05) b = Math.round(b * 2) / 2;
					period = 60 / b;
					// phase: the offset that best fits the tracked beats
					let off = 0;
					for (let i = 0; i < n; i++) off += beats[i] - i * period;
					off /= n;
					beats = [];
					for (let t = off; t < duration + period; t += period) beats.push(t);
				}
			}
			if (beats.length == 0) beats = [0];
			// extend both ends with the local period
			const head = beats.length > 1 ? beats[1] - beats[0] : period;
			while (beats[0] - head > -head * 0.5 && beats[0] > 0.001) beats.unshift(beats[0] - head);
			const tail = beats.length > 1 ? beats[beats.length - 1] - beats[beats.length - 2] : period;
			while (beats[beats.length - 1] < duration + tail) beats.push(beats[beats.length - 1] + tail);
			const ibi = [];
			for (let i = 1; i < beats.length; i++) ibi.push(beats[i] - beats[i - 1]);
			ibi.sort((a, b) => a - b);
			const median = ibi[ibi.length >> 1] || period;
			return { beats, steady, bpm: steady ? 60 / period : 60 / median };
		}

		// ---------------------------------------------------------------- note templates
		const SHAPES = [
			(h) => 1 / h,                                     // bright: saws, brass, strings, voice
			(h) => Math.pow(h, -1.8),                         // mellow: keys, guitars, plucks
			(h) => [1, 0.25, 0.1, 0.04][h - 1] || 0,          // pure: sine, flute, 808, whistle
			(h) => (h % 2 ? 1 : 0.1) / h,                     // hollow: square, clarinet, chip, FM bells
			(h) => [1, 0.95, 0.6, 0.42, 0.3, 0.2, 0.14, 0.1, 0.07, 0.05][h - 1] || 0, // strong second partial: piano, organ
		];
		function buildTemplates(tuneCents) {
			const shift = tuneCents / 100 * BPS;
			const starts = [0], idx = [], w = [];
			const pitchOf = [], shapeOf = [];
			for (let p = P0; p <= P1; p++) {
				for (let s = 0; s < SHAPES.length; s++) {
					const acc = new Map();
					const f0 = midiHz(p);
					for (let h = 1; h <= 16 && f0 * h < 7900; h++) {
						const a = SHAPES[s](h);
						if (a < 0.005) continue;
						const pos = (hzMidi(f0 * h) - M0) * BPS + shift;
						const c = Math.round(pos);
						for (let b = c - 1; b <= c + 1; b++) {
							if (b < 0 || b >= NB) continue;
							const g = Math.exp(-0.5 * Math.pow((b - pos) / 0.55, 2));
							acc.set(b, (acc.get(b) || 0) + a * g);
						}
					}
					let sum = 0;
					for (const v of acc.values()) sum += v;
					for (const [b, v] of acc) { idx.push(b); w.push(v / sum); }
					starts.push(idx.length);
					pitchOf.push(p);
					shapeOf.push(s);
				}
			}
			// broadband templates for noise and drums (half-octave wide, one per octave)
			for (let c = 6; c < NB; c += 36) {
				let sum = 0;
				const vals = [];
				for (let b = 0; b < NB; b++) { const g = Math.exp(-0.5 * Math.pow((b - c) / 14, 2)); if (g > 0.01) { vals.push([b, g]); sum += g; } }
				for (const [b, g] of vals) { idx.push(b); w.push(g / sum); }
				starts.push(idx.length);
				pitchOf.push(-1);
				shapeOf.push(-1);
			}
			return { starts: Int32Array.from(starts), idx: Int32Array.from(idx), w: Float64Array.from(w), pitchOf: Int16Array.from(pitchOf), shapeOf: Int8Array.from(shapeOf), count: pitchOf.length, shapes: SHAPES.length };
		}
		// Explains every frame's spectrum as a sparse sum of note templates (KL-NMF with the
		// templates fixed, so frames are independent). Returns activations per pitch.
		async function noteActivations(V, frames, T, progress) {
			const Aout = new Float32Array(frames * NP);
			const bright = new Float32Array(frames * NP);   // share of the "bright" shape (timbre)
			const pure = new Float32Array(frames * NP);     // share of the "pure" shape (timbre)
			const noiseStart = NP * T.shapes;
			const H = new Float64Array(T.count), WH = new Float64Array(NB), R = new Float64Array(NB);
			const sal = new Float64Array(NP);
			const active = new Int32Array(T.count);
			const lambda = 0.035;
			// frames too quiet to matter are skipped
			let maxE = 0;
			const energy = new Float64Array(frames);
			for (let f = 0; f < frames; f++) {
				let e = 0;
				for (let b = 0; b < NB; b++) e += V[f * NB + b];
				energy[f] = e;
				if (e > maxE) maxE = e;
			}
			const vmax = (row, b) => Math.max(V[row + Math.max(0, b - 1)], V[row + b], V[row + Math.min(NB - 1, b + 1)]);
			let last = Date.now();
			for (let f = 0; f < frames; f++) {
				const E = energy[f];
				if (E < maxE * 0.002) continue;
				const row = f * NB;
				// salience: harmonic sum for every pitch
				let smax = 0;
				for (let p = 0; p < NP; p++) {
					const f0 = midiHz(P0 + p);
					let s = 0;
					for (let h = 1; h <= 8; h++) {
						const hz = f0 * h;
						if (hz > 7900) break;
						const b = Math.round((hzMidi(hz) - M0) * BPS);
						if (b >= NB) break;
						s += vmax(row, b) * Math.pow(h, -0.6);
					}
					sal[p] = s;
					if (s > smax) smax = s;
				}
				// candidates: the strongest pitches and their octave neighbours
				const order = [];
				for (let p = 0; p < NP; p++) if (sal[p] >= smax * 0.1) order.push(p);
				order.sort((a, b) => sal[b] - sal[a]);
				const chosen = new Set();
				for (let i = 0; i < order.length && i < 10; i++) {
					const p = order[i];
					chosen.add(p);
					if (p - 12 >= 0) chosen.add(p - 12);
					if (p + 12 < NP) chosen.add(p + 12);
				}
				let n = 0, salSum = 0;
				for (const p of chosen) salSum += sal[p];
				for (const p of chosen) {
					for (let s = 0; s < T.shapes; s++) {
						const j = p * T.shapes + s;
						active[n++] = j;
						H[j] = E * 0.85 * sal[p] / (salSum || 1) / T.shapes;
					}
				}
				for (let j = noiseStart; j < T.count; j++) { active[n++] = j; H[j] = E * 0.15 / (T.count - noiseStart); }
				// multiplicative updates
				for (let it = 0; it < 24; it++) {
					WH.fill(1e-9);
					for (let a = 0; a < n; a++) {
						const j = active[a], h = H[j];
						if (h <= 0) continue;
						for (let q = T.starts[j]; q < T.starts[j + 1]; q++) WH[T.idx[q]] += h * T.w[q];
					}
					for (let b = 0; b < NB; b++) R[b] = V[row + b] / WH[b];
					for (let a = 0; a < n; a++) {
						const j = active[a];
						if (H[j] <= 0) continue;
						let num = 0;
						for (let q = T.starts[j]; q < T.starts[j + 1]; q++) num += T.w[q] * R[T.idx[q]];
						H[j] *= num / (1 + (j < noiseStart ? lambda : 0));
					}
				}
				for (let a = 0; a < n; a++) {
					const j = active[a];
					if (j >= noiseStart) { H[j] = 0; continue; }
					const p = T.pitchOf[j] - P0, s = T.shapeOf[j];
					Aout[f * NP + p] += H[j];
					if (s == 0) bright[f * NP + p] += H[j];
					if (s == 2) pure[f * NP + p] += H[j];
					H[j] = 0;
				}
				if (Date.now() - last > 40) { progress(0.42 + 0.33 * f / frames, "Hearing the notes"); await pause(); last = Date.now(); }
			}
			for (let i = 0; i < Aout.length; i++) if (Aout[i] > 0) { bright[i] /= Aout[i]; pure[i] /= Aout[i]; }
			return { A: Aout, bright, pure, energy };
		}

		// ---------------------------------------------------------------- note tracking
		function percentile(values, p) {
			const list = [];
			for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) list.push(values[i]);
			if (list.length == 0) return 0;
			list.sort((a, b) => a - b);
			return list[Math.min(list.length - 1, Math.max(0, Math.floor(p * (list.length - 1))))];
		}
		// Pitch-specific onset strength from the short window: how much the note's first
		// partials rise in each frame.
		function pitchOnsets(S1, frames) {
			const L = new Float32Array(S1.length);
			for (let i = 0; i < S1.length; i++) L[i] = Math.log(1 + 300 * S1[i]);
			const N1 = new Float32Array(S1.length);
			for (let f = 1; f < frames; f++) {
				for (let s = 0; s < 96; s++) {
					const prev = Math.max(L[(f - 1) * 96 + Math.max(0, s - 1)], L[(f - 1) * 96 + s], L[(f - 1) * 96 + Math.min(95, s + 1)]);
					N1[f * 96 + s] = Math.max(0, L[f * 96 + s] - prev);
				}
			}
			// minus the broadband part (a drum hit rises in every semitone at once)
			{
				const med = new Float32Array(S1.length);
				for (let f = 1; f < frames; f++) slidingMedian(N1, 1, f * 96, 96, 12, med, 1);
				for (let i = 0; i < N1.length; i++) N1[i] = Math.max(0, N1[i] - med[i]);
			}
			// scaled so that 1 is a strong onset for this recording
			const nonzero = [];
			for (let i = 0; i < N1.length; i += 7) if (N1[i] > 0) nonzero.push(N1[i]);
			nonzero.sort((a, b) => a - b);
			const scale = nonzero.length ? nonzero[Math.floor(nonzero.length * 0.995)] || 1 : 1;
			for (let i = 0; i < N1.length; i++) N1[i] /= scale;
			return (p, f) => {
				if (f < 1 || f >= frames) return 0;
				let o = 0;
				const base = p - M0;
				for (const [off, wt] of [[0, 1], [12, 0.8], [19, 0.6], [24, 0.45]]) {
					const s = base + off;
					if (s >= 0 && s < 96) o += N1[f * 96 + s] * wt;
				}
				return o;
			};
		}
		function trackNotes(act, frames, onsetAt, env, opts, V, tuning) {
			const { A, bright, pure } = act;
			const sens = Math.max(0, Math.min(1, opts.notes == undefined ? 0.5 : opts.notes));
			// smoothing over five frames (unison beating and vibrato must not chop notes up)
			const S = new Float32Array(A.length);
			const at = (f, p) => A[(f < 0 ? 0 : f >= frames ? frames - 1 : f) * NP + p];
			for (let f = 0; f < frames; f++)
				for (let p = 0; p < NP; p++)
					S[f * NP + p] = (at(f - 2, p) + 2 * at(f - 1, p) + 3 * at(f, p) + 2 * at(f + 1, p) + at(f + 2, p)) / 9;
			// loudness context: the strongest note within half a second
			const frameMax = new Float32Array(frames);
			for (let f = 0; f < frames; f++) { let m = 0; for (let p = 0; p < NP; p++) m = Math.max(m, S[f * NP + p]); frameMax[f] = m; }
			const W = Math.round(0.5 * FPS);
			const local = new Float32Array(frames);
			{
				// sliding maximum (monotonic deque)
				const dq = new Int32Array(frames + 1);
				let head = 0, tail = 0;
				for (let i = 0; i < frames + W; i++) {
					if (i < frames) {
						while (tail > head && frameMax[dq[tail - 1]] <= frameMax[i]) tail--;
						dq[tail++] = i;
					}
					const c = i - W;
					if (c >= 0) {
						while (dq[head] < c - W) head++;
						local[c] = frameMax[dq[head]];
					}
				}
			}
			const gmax = percentile(frameMax, 0.98) || 1;
			const rhoOn = 0.2 - 0.13 * sens, rhoOff = rhoOn * 0.5;
			const floor = gmax * (0.035 - 0.025 * sens);
			const notes = [];
			const minFrames = Math.max(3, Math.round(0.045 * FPS));
			for (let p = 0; p < NP; p++) {
				let on = -1, below = 0, peak = 0;
				const close = (end) => {
					if (end - on >= minFrames) notes.push({ p: p + P0, f0: on, f1: end, peak });
					on = -1; peak = 0;
				};
				for (let f = 0; f < frames; f++) {
					const v = S[f * NP + p];
					const thrOn = Math.max(floor, rhoOn * local[f]), thrOff = Math.max(floor * 0.6, rhoOff * local[f]);
					if (on < 0) {
						if (v > thrOn && (S[Math.min(frames - 1, f + 1) * NP + p] > thrOn || v > 2 * thrOn)) { on = f; below = 0; peak = v; }
					}
					else {
						peak = Math.max(peak, v);
						if (v < thrOff) { if (++below >= 4) close(f - 3); }
						else below = 0;
					}
				}
				if (on >= 0) close(frames);
			}
			// split re-attacks of the same pitch: a clear pitch onset while the note sounds
			const split = [];
			for (const n of notes) {
				let start = n.f0;
				const startOnset = onsetAt(n.p, n.f0) + 1e-6;
				for (let f = n.f0 + Math.round(0.07 * FPS); f < n.f1 - Math.round(0.04 * FPS); f++) {
					const o = onsetAt(n.p, f);
					if (o < 0.35 || o < onsetAt(n.p, f - 1) || o < onsetAt(n.p, f + 1)) continue;
					let dip = Infinity;
					for (let g = Math.max(n.f0, f - 6); g < f; g++) dip = Math.min(dip, S[g * NP + n.p - P0]);
					const rise = S[Math.min(frames - 1, f + 2) * NP + n.p - P0];
					if (o > 0.45 * startOnset && rise > 1.18 * dip) {
						split.push({ p: n.p, f0: start, f1: f, peak: n.peak });
						start = f;
						f += Math.round(0.05 * FPS);
					}
				}
				split.push({ p: n.p, f0: start, f1: n.f1, peak: n.peak });
			}
			// refine onsets: back to where the note starts rising, then to the sharpest pitch onset nearby
			const out = [];
			for (const n of split) {
				const pi = n.p - P0;
				let rise = n.f0;
				let notePeak = 0;
				for (let f = n.f0; f < Math.min(n.f1, n.f0 + Math.round(0.3 * FPS)); f++) notePeak = Math.max(notePeak, S[f * NP + pi]);
				while (rise > 0 && S[(rise - 1) * NP + pi] < S[rise * NP + pi] && S[(rise - 1) * NP + pi] > 0.05 * notePeak) rise--;
				let bestF = rise, best = -1;
				for (let f = Math.max(1, rise - 4); f <= Math.min(frames - 1, n.f0 + 3); f++) {
					const o = onsetAt(n.p, f);
					if (o > best) { best = o; bestF = f; }
				}
				let f0 = best > 0.12 ? bestF : rise;
				// a slow swell (pads, bowed strings) is heard well after it starts
				if (best <= 0.12) {
					let top = rise;
					for (let f = rise; f < Math.min(n.f1, rise + Math.round(0.5 * FPS)); f++) if (S[f * NP + pi] > S[top * NP + pi]) top = f;
					if (top - rise > 0.12 * FPS) f0 = Math.max(0, rise - Math.min(Math.round(0.1 * FPS), Math.round(0.35 * (top - rise))));
				}
				let peak = 0, br = 0, pu = 0, cnt = 0;
				for (let f = n.f0; f < Math.min(n.f1, n.f0 + Math.round(0.12 * FPS)); f++) {
					const v = S[f * NP + pi];
					peak = Math.max(peak, v);
					br += bright[f * NP + pi] * v; pu += pure[f * NP + pi] * v; cnt += v;
				}
				// sustain: level at 70% of the note relative to the peak
				const late = S[Math.min(frames - 1, Math.floor(n.f0 + 0.7 * (n.f1 - n.f0))) * NP + pi];
				const offsetFix = n.p < 60 ? Math.round(0.05 * FPS) : n.p < 72 ? Math.round(0.03 * FPS) : Math.round(0.015 * FPS);
				const f1 = Math.max(f0 + 2, n.f1 - offsetFix);
				out.push({ p: n.p, f0, f1, peak, onset: best, bright: cnt ? br / cnt : 0, pure: cnt ? pu / cnt : 0, sustain: peak > 0 ? late / peak : 0 });
			}
			out.sort((a, b) => a.f0 - b.f0 || a.p - b.p);
			verifyHarmonics(V, out, tuning / 100 * BPS);
			// remove harmonic ghosts: a weak note sitting on a strong note's overtone (or an octave below it)
			const overlap = (a, b) => Math.max(0, Math.min(a.f1, b.f1) - Math.max(a.f0, b.f0));
			for (const n of out) {
				for (const m of out) {
					if (m == n || m.dead || n.dead) continue;
					const d = n.p - m.p;
					const ov = overlap(n, m);
					if (ov < 0.6 * (n.f1 - n.f0)) continue;
					if ((d == 12 || d == 19 || d == 24 || d == 28 || d == 31) && n.peak < 0.45 * m.peak) n.dead = true;
					else if (d == -12 && n.peak < 0.25 * m.peak && Math.abs(n.f0 - m.f0) <= 4) n.dead = true;
				}
			}
			// notes moved onto the same pitch and overlapping become one
			const alive = out.filter(n => !n.dead).sort((a, b) => a.p - b.p || a.f0 - b.f0);
			const bridge = Math.round(0.15 * FPS);
			const merged = [];
			for (const n of alive) {
				const last = merged[merged.length - 1];
				if (last && last.p == n.p && n.f0 < last.f1 - 2) { last.f1 = Math.max(last.f1, n.f1); last.peak = Math.max(last.peak, n.peak); continue; }
				// a note that swells back without a new attack (sidechain pumping, tremolo) goes on
				if (last && last.p == n.p && n.f0 < last.f1 + bridge && n.onset < 0.2) { last.f1 = Math.max(last.f1, n.f1); last.peak = Math.max(last.peak, n.peak); continue; }
				merged.push(n);
			}
			return merged.sort((a, b) => a.f0 - b.f0 || a.p - b.p);
		}
		// Spectral smoothness (Klapuri): a note whose partials are all partials of a lower note
		// with a smooth spectrum is that note's overtone, not a note of its own. Checks the octave,
		// the twelfth and the double octave below every note, and sub-octave ghosts.
		function partialAmp(V, f, p, h, shift) {
			const b = Math.round((hzMidi(midiHz(p) * h) - M0) * BPS + shift);
			if (b < 1 || b >= NB - 1) return 0;
			const row = f * NB;
			return Math.max(V[row + b - 1], V[row + b], V[row + b + 1]);
		}
		function verifyHarmonics(V, notes, shift) {
			const ov = (a, b) => Math.max(0, Math.min(a.f1, b.f1) - Math.max(a.f0, b.f0));
			const middle = (n) => [n.f0 + Math.round((n.f1 - n.f0) * 0.15), Math.max(n.f0 + Math.round((n.f1 - n.f0) * 0.15) + 1, n.f1 - Math.round((n.f1 - n.f0) * 0.15))];
			for (const n of notes) {
				if (n.dead) continue;
				for (const [d, h] of [[12, 2], [19, 3], [24, 4]]) {
					const p = n.p - d;
					if (p < P0) continue;
					const [a, b] = middle(n);
					let own = 0, shared = 0, excess = 0;
					const amps = new Float64Array(11);
					for (let f = a; f < b; f += 2) {
						for (let k = 1; k <= 10; k++) amps[k] = partialAmp(V, f, p, k, shift);
						for (let k = 1; k <= 9; k++) {
							if (k % h == 0) {
								shared += amps[k];
								excess += Math.max(0, amps[k] - 1.3 * 0.5 * (amps[k - 1] + amps[k + 1]));
							}
							else own += amps[k];
						}
					}
					if (shared <= 0) continue;
					if (own / shared > (h == 2 ? 0.5 : 0.8) && excess / shared < 0.12) {
						const lower = notes.find(m => !m.dead && m != n && m.p == p && ov(m, n) > 0.6 * (n.f1 - n.f0) && m.peak > n.peak);
						if (lower) { n.dead = true; break; }
					}
				}
			}
			for (const n of notes) {
				if (n.dead) continue;
				const upper = notes.find(m => !m.dead && m.p == n.p + 12 && ov(m, n) > 0.6 * (n.f1 - n.f0));
				if (!upper) continue;
				const [a, b] = middle(n);
				let own = 0, shared = 0;
				for (let f = a; f < b; f += 2) {
					for (const k of [1, 3, 5]) own += partialAmp(V, f, n.p, k, shift);
					for (const k of [2, 4, 6]) shared += partialAmp(V, f, n.p, k, shift);
				}
				if (shared > 0 && own / shared < 0.15) n.dead = true;
			}
		}
		// Fine pitch of a note over time (semitones relative to its pitch), from the
		// reassigned spectrum around its fundamental (or 2nd harmonic for low notes).
		function pitchCurve(V, n) {
			const curve = [];
			const harmonic = n.p < 45 ? 2 : 1;
			const center = (hzMidi(midiHz(n.p) * harmonic) - M0) * BPS;
			for (let f = n.f0 + 1; f < n.f1; f += 2) {
				const row = f * NB;
				let best = -1, bv = 0;
				for (let b = Math.max(1, Math.round(center - 8 * BPS)); b <= Math.min(NB - 2, Math.round(center + 8 * BPS)); b++) {
					const v = V[row + b];
					if (v > bv && v >= V[row + b - 1] && v >= V[row + b + 1]) { bv = v; best = b; }
				}
				if (best < 0) { curve.push(null); continue; }
				const a = V[row + best - 1], c = V[row + best + 1], d = a - 2 * bv + c;
				const pos = best + (d < 0 ? 0.5 * (a - c) / d : 0);
				curve.push((pos - center) / BPS);
			}
			return curve;
		}

		// ---------------------------------------------------------------- drums
		function drumTemplateFromPcm(pcm) {
			// the sound after 50 ms of silence, through the same separation the analysis uses
			const lead = Math.round(0.05 * SR), len = Math.min(pcm.length, Math.round(0.6 * SR));
			const x = new Float32Array(lead + len + 2048);
			x.set(pcm.subarray(0, len), lead);
			const frames = Math.ceil(x.length / HOP);
			const t = fftTables(1024);
			const M1 = new Float32Array(frames * 512);
			for (let f = 0; f < frames; f++) {
				frameFFT(x, f * HOP, t);
				for (let k = 1; k < 512; k++) {
					const Xr = t.re[k], Xi = t.im[k], Yr = t.re[1024 - k], Yi = t.im[1024 - k];
					const Ar = 0.5 * (Xr + Yr), Ai = 0.5 * (Xi - Yi);
					M1[f * 512 + k] = Math.sqrt(Ar * Ar + Ai * Ai) * 4 / 1024;
				}
			}
			const D = percussiveBands(M1, frames, new Float32Array(frames * DB));
			// the onset frame: the biggest rise of the bands
			let best = 1, bestRise = -1;
			for (let f = 1; f < Math.min(frames, Math.round(lead / HOP) + 6); f++) {
				let rise = 0;
				for (let b = 0; b < DB; b++) rise += Math.max(0, D[f * DB + b] - D[(f - 1) * DB + b]);
				if (rise > bestRise) { bestRise = rise; best = f; }
			}
			const tpl = onsetSpectrum(D, frames, best);
			return Array.from(normalized(tpl));
		}
		// low bands narrower than one FFT bin get no bins: interpolate them
		function fillEmptyBands(v) {
			for (let b = 0; b < v.length; b++) {
				if (v[b] > 0) continue;
				let l = b - 1, r = b + 1;
				while (l >= 0 && !(v[l] > 0)) l--;
				while (r < v.length && !(v[r] > 0)) r++;
				v[b] = l >= 0 && r < v.length ? (v[l] + v[r]) / 2 : l >= 0 ? v[l] : r < v.length ? v[r] : 0;
			}
		}
		// Rough templates for when the library is not available.
		function fallbackTemplates() {
			const shape = (centerHz, width, extra) => {
				const v = new Float64Array(DB);
				for (let b = 0; b < DB; b++) {
					const hz = Math.sqrt(bandEdges[b] * bandEdges[b + 1]);
					v[b] = Math.exp(-0.5 * Math.pow(Math.log2(hz / centerHz) / width, 2)) + (extra ? extra(hz) : 0);
				}
				let s = 0; for (const x of v) s += x;
				return Array.from(v, x => x / s);
			};
			return {
				kick: [shape(60, 0.6, hz => hz > 2000 && hz < 6000 ? 0.05 : 0)], snare: [shape(200, 0.5, hz => hz > 1500 ? 0.4 * Math.exp(-0.5 * Math.pow(Math.log2(hz / 5000) / 1.2, 2)) : 0)],
				clap: [shape(1200, 0.8)], hat: [shape(9000, 0.5)], open: [shape(8000, 0.7)], tomLow: [shape(100, 0.5)], tomMid: [shape(150, 0.5)], tomHigh: [shape(220, 0.5)],
				crash: [shape(6000, 1.1)], ride: [shape(4500, 0.8)], rim: [shape(1700, 0.6)],
			};
		}
		// Percussive onsets: SuperFlux peaks of the percussive bands above an adaptive threshold.
		function percussiveOnsets(env, frames, sens) {
			const out = [];
			const W = Math.round(1.2 * FPS);
			const sorted = Array.from(env).filter(v => v > 0).sort((a, b) => a - b);
			const top = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] : 1;
			// running mean over 2.4 s
			const mean = new Float32Array(frames);
			let acc = 0;
			for (let f = 0; f < frames + W; f++) {
				if (f < frames) acc += env[f];
				if (f - 2 * W - 1 >= 0) acc -= env[f - 2 * W - 1];
				const c = f - W;
				if (c >= 0 && c < frames) mean[c] = acc / Math.min(frames, 2 * W + 1);
			}
			let lastHit = -1e9;
			for (let f = 2; f < frames - 2; f++) {
				const v = env[f];
				if (v < env[f - 1] || v < env[f + 1] || v < env[f - 2] || v < env[f + 2]) continue;
				if (v < (0.06 - 0.04 * sens) * top || v < 1.3 * mean[f]) continue;
				if (f - lastHit < Math.round(0.028 * FPS)) continue;
				out.push(f);
				lastHit = f;
			}
			return out;
		}
		// The spectrum that arrived at an onset: what the percussive bands gained.
		function onsetSpectrum(D, frames, f) {
			const x = new Float64Array(DB);
			for (let b = 0; b < DB; b++) {
				let after = 0, before = 0;
				for (let g = f; g <= Math.min(frames - 1, f + 2); g++) after = Math.max(after, D[g * DB + b]);
				for (let g = Math.max(0, f - 3); g < f; g++) before = Math.max(before, D[g * DB + b]);
				x[b] = Math.max(0, after - before);
			}
			return x;
		}
		// Non-negative amounts of each template that best explain x (KL, multiplicative updates).
		function nnls(x, W, iterations) {
			const C = W.length;
			let total = 0;
			for (let b = 0; b < DB; b++) total += x[b];
			const a = new Float64Array(C).fill(total / C + 1e-12);
			const est = new Float64Array(DB);
			for (let it = 0; it < iterations; it++) {
				est.fill(1e-12);
				for (let c = 0; c < C; c++) { const w = W[c], ac = a[c]; for (let b = 0; b < DB; b++) est[b] += ac * w[b]; }
				for (let c = 0; c < C; c++) {
					const w = W[c];
					let num = 0;
					for (let b = 0; b < DB; b++) num += w[b] * x[b] / est[b];
					a[c] *= num;
				}
			}
			return a;
		}
		const normalized = (v) => { let s = 0; for (const x of v) s += x; return Float64Array.from(v, x => s > 0 ? x / s : 1 / v.length); };
		// Drums: every percussive onset's spectrum is split into the eleven drum templates, first
		// with templates made from CarrotBox's drum sounds, then with templates adapted to the
		// kit of this recording (the average onset spectrum of the hits each class clearly owns).
		async function detectDrums(D, frames, env, opts, progress) {
			const sens = Math.max(0, Math.min(1, opts.drums == undefined ? 0.5 : opts.drums));
			const lib = opts.drumTemplates || fallbackTemplates();
			const classes = DRUMS.filter(c => lib[c] && lib[c].length);
			let W = classes.map(c => {
				const v = new Float64Array(DB);
				for (const t of lib[c]) for (let b = 0; b < DB; b++) v[b] += t[b];
				return normalized(v);
			});
			const onsets = percussiveOnsets(env, frames, sens);
			// whitening: every band counts by how much it rises against its usual level in this
			// recording (quiet hats matter as much as loud kicks)
			const bandWeight = new Float64Array(DB);
			for (let b = 0; b < DB; b++) {
				let m = 0;
				for (let f = 0; f < frames; f++) m += D[f * DB + b];
				bandWeight[b] = 1 / Math.pow(m / frames + 1e-9, 0.85);
			}
			const whiten = (v) => Float64Array.from(v, (x, b) => x * bandWeight[b]);
			W = W.map(w => normalized(whiten(w)));
			const X = onsets.map(f => whiten(onsetSpectrum(D, frames, f)));
			const solve = () => X.map(x => nnls(x, W, 70));
			let amounts = solve();
			progress(0.85, "Hearing the drums");
			await pause();
			const owned = classes.map(() => new Float64Array(DB)), counts = new Int32Array(classes.length);
			amounts.forEach((a, i) => {
				let total = 0;
				for (const v of a) total += v;
				for (let c = 0; c < classes.length; c++) {
					if (a[c] < 0.65 * total) continue;
					const x = normalized(X[i]);
					for (let b = 0; b < DB; b++) owned[c][b] += x[b];
					counts[c]++;
				}
			});
			W = W.map((w, c) => counts[c] >= 3 ? normalized(w.map((v, b) => 0.5 * v + 0.5 * owned[c][b] / counts[c])) : w);
			amounts = solve();
			progress(0.93, "Hearing the drums");
			// a class is there when its amount is a good part of its usual hit size
			const scale = classes.map((_, c) => {
				const v = amounts.map(a => a[c]).filter(x => x > 0).sort((a, b) => a - b);
				return v.length ? v[Math.floor(v.length * 0.9)] || 1e-9 : 1e-9;
			});
			const theta = 0.35 - 0.2 * sens;
			const related = { kick: ["tomLow", "tomMid"], tomLow: ["kick", "tomMid"], tomMid: ["tomLow", "tomHigh", "kick"], tomHigh: ["tomMid", "snare"], snare: ["clap", "rim", "tomHigh"], clap: ["snare", "rim"], rim: ["snare", "clap"], hat: ["open", "ride", "crash"], open: ["hat", "crash", "ride"], crash: ["open", "ride", "hat"], ride: ["crash", "hat", "open"] };
			const highBands = [];
			for (let b = 0; b < DB; b++) if (bandEdges[b] > 5000) highBands.push(b);
			const highAt = (f) => { let e = 0; for (const b of highBands) e += D[f * DB + b]; return e; };
			const hits = [];
			onsets.forEach((f, i) => {
				const a = amounts[i];
				let total = 0;
				for (const v of a) total += v;
				// one drum per family (low, middle, high) per onset: the family must hold a good share
				// of the hit, and its strongest member is the one played
				const present = [];
				for (const family of DRUM_FAMILIES) {
					let share = 0, c = -1;
					for (let k = 0; k < classes.length; k++) {
						if (!family.includes(classes[k])) continue;
						share += a[k];
						if (c < 0 || a[k] * (DRUM_PRIOR[classes[k]] || 1) > a[c] * (DRUM_PRIOR[classes[c]] || 1)) c = k;
					}
					if (c < 0 || share < 0.12 * total) continue;
					const rare = classes[c] == "crash" || classes[c] == "ride";
					if (a[c] / scale[c] < theta || a[c] < (rare ? 0.3 : 0.07) * total) continue;
					present.push(c);
				}
				for (const c of present) {
					const name = classes[c];
					// of two related classes at one onset (a kick and a low tom), the bigger one is right
					if (present.some(o => o != c && (related[name] || []).includes(classes[o]) && a[o] > 1.25 * a[c])) continue;
					let kind = name;
					if (kind == "hat" || kind == "open") {
						// open or closed: how long the highs keep ringing
						let peak = 0;
						for (let g = f; g < Math.min(frames, f + 3); g++) peak = Math.max(peak, highAt(g));
						let ring = 0;
						for (let g = f + 2; g < Math.min(frames, f + Math.round(0.4 * FPS)); g++) {
							if (highAt(g) < 0.3 * peak) break;
							ring++;
						}
						kind = ring > 0.13 * FPS ? "open" : "hat";
					}
					hits.push({ t: f / FPS, kind, vel: +Math.min(1, a[c] / scale[c]).toFixed(3) });
				}
			});
			// one hit of a kind per onset
			const final = [];
			for (const h of hits) {
				const dup = final.find(o => o.kind == h.kind && Math.abs(o.t - h.t) < 0.02);
				if (dup) { dup.vel = Math.max(dup.vel, h.vel); continue; }
				final.push(h);
			}
			const templates = {};
			classes.forEach((c, i) => { templates[c] = Array.from(normalized(W[i].map((v, b) => v / bandWeight[b]))); });
			return { hits: final, templates };
		}

		// ---------------------------------------------------------------- roles, key, chords
		function assignRoles(notes) {
			const tOf = (n) => n.t;
			const end = (n) => n.t + n.dur;
			const sorted = notes.slice().sort((a, b) => a.t - b.t);
			// lowest / highest sounding note over time, sampled every 20 ms
			const duration = notes.reduce((m, n) => Math.max(m, end(n)), 0);
			const steps = Math.ceil(duration / 0.02) + 1;
			const low = new Int32Array(steps).fill(-1), high = new Int32Array(steps).fill(-1);
			sorted.forEach((n, i) => {
				for (let s = Math.floor(n.t / 0.02); s < Math.ceil(end(n) / 0.02) && s < steps; s++) {
					if (low[s] < 0 || n.midi < sorted[low[s]].midi) low[s] = i;
					if (high[s] < 0 || n.midi > sorted[high[s]].midi) high[s] = i;
				}
			});
			const frac = (arr, i, n) => {
				let yes = 0, all = 0;
				for (let s = Math.floor(n.t / 0.02); s < Math.ceil(end(n) / 0.02) && s < steps; s++) { all++; if (arr[s] == i) yes++; }
				return all ? yes / all : 0;
			};
			sorted.forEach((n, i) => { n._low = frac(low, i, n); n._high = frac(high, i, n); });
			for (const n of sorted) {
				const together = sorted.filter(o => o != n && Math.abs(o.t - n.t) < 0.035);
				n._together = together.length;
				n._gapAbove = together.length ? n.midi - Math.max(...together.map(o => o.midi)) : 99;
			}
			// bass: the lowest note (and low enough)
			for (const n of sorted) if (n.midi <= 57 && n._low >= 0.6) n.role = "bass";
			// lead: the top voice that moves on its own (or stands clearly above the chord)
			const medVel = sorted.length ? sorted.map(n => n.vel).sort((a, b) => a - b)[sorted.length >> 1] : 0;
			for (const n of sorted) {
				if (n.role || n.midi < 55) continue;
				const alone = n._together <= 1;
				if (n._high >= 0.7 && (alone || n._gapAbove >= 3 || n.vel >= 1.2 * medVel)) n.role = "lead";
			}
			// one note at a time in the bass and the lead: overlapping ones become harmony
			for (const role of ["bass", "lead"]) {
				const list = sorted.filter(n => n.role == role);
				for (let i = 0; i < list.length; i++) {
					for (let j = i + 1; j < list.length && list[j].t < end(list[i]); j++) {
						const a = list[i], b = list[j];
						if (a.role != role || b.role != role) continue;
						const ov = Math.min(end(a), end(b)) - Math.max(a.t, b.t);
						if (ov <= 0.05) { if (end(a) > b.t) a.dur = Math.max(0.03, b.t - a.t); continue; }
						const loser = role == "bass" ? (a.midi > b.midi ? a : b) : (a.midi < b.midi ? a : b);
						loser.role = null;
					}
				}
			}
			for (const n of sorted) {
				if (!n.role) n.role = "chords";
				delete n._low; delete n._high; delete n._together; delete n._gapAbove;
			}
			return sorted;
		}
		const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
		const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
		function detectKey(hist) {
			const corr = (profile, shift) => {
				let mx = 0, my = 0;
				for (let i = 0; i < 12; i++) { mx += hist[(i + shift) % 12]; my += profile[i]; }
				mx /= 12; my /= 12;
				let num = 0, dx = 0, dy = 0;
				for (let i = 0; i < 12; i++) { const a = hist[(i + shift) % 12] - mx, b = profile[i] - my; num += a * b; dx += a * a; dy += b * b; }
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
		const CHORD_TYPES = [["", [0, 4, 7]], ["m", [0, 3, 7]], ["7", [0, 4, 7, 10]], ["maj7", [0, 4, 7, 11]], ["m7", [0, 3, 7, 10]], ["sus4", [0, 5, 7]], ["sus2", [0, 2, 7]], ["dim", [0, 3, 6]], ["aug", [0, 4, 8]], ["6", [0, 4, 7, 9]], ["m6", [0, 3, 7, 9]]];
		const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
		function chordFor(notes, t0, t1) {
			const chroma = new Float64Array(12), bassPc = new Float64Array(12);
			for (const n of notes) {
				const ov = Math.min(n.t + n.dur, t1) - Math.max(n.t, t0);
				if (ov <= 0) continue;
				const w = ov * (0.3 + n.vel);
				chroma[n.midi % 12] += w;
				if (n.role == "bass") bassPc[n.midi % 12] += w;
			}
			let total = 0; for (const v of chroma) total += v;
			if (total <= 0) return null;
			let best = null, bestScore = -1e9;
			for (let root = 0; root < 12; root++) for (const [suffix, tones] of CHORD_TYPES) {
				let s = 0;
				const set = new Set(tones.map(t => (root + t) % 12));
				for (let pc = 0; pc < 12; pc++) s += set.has(pc) ? chroma[pc] : -0.6 * chroma[pc];
				s = s / total - 0.04 * tones.length + 0.35 * bassPc[root] / total;
				if (s > bestScore) { bestScore = s; best = { root, type: suffix, name: NAMES[root] + suffix }; }
			}
			return best;
		}

		// ---------------------------------------------------------------- main
		async function analyze(mono, options, progress = () => { }) {
			const opts = Object.assign({ drums: 0.5, notes: 0.5, bpm: 0, beatsPerBar: 0 }, options || {});
			const x = mono;
			progress(0.01, "Reading the spectrum");
			const spec = await spectra(x, progress);
			const frames = spec.frames;
			progress(0.31, "Listening for the beat");
			const O = onsetEnvelope(spec.D, frames);
			const bpm0 = opts.bpm > 0 ? opts.bpm : estimateTempo(O.env, frames, 55, 210);
			let bpmTrack = bpm0;
			while (bpmTrack < 68) bpmTrack *= 2;
			while (bpmTrack > 190) bpmTrack /= 2;
			const beatFrames = trackBeats(O.env, frames, bpmTrack, opts.bpm > 0 ? 900 : 350);
			const grid = beatGrid(beatFrames, O.env, frames, opts.bpm > 0 ? opts.bpm : bpmTrack);
			if (opts.bpm > 0) grid.bpm = opts.bpm;
			await pause();
			progress(0.36, "Hearing the notes");
			const T = buildTemplates(spec.tuning);
			const act = await noteActivations(spec.V, frames, T, progress);
			const onsetAt = pitchOnsets(spec.S1, frames);
			const tracked = trackNotes(act, frames, onsetAt, O.env, opts, spec.V, spec.tuning);
			// note list in seconds, with velocity and timbre
			const peakTop = percentile(tracked.map(n => n.peak), 0.95) || 1;
			let notes = tracked.map(n => ({
				t: n.f0 / FPS, dur: Math.max(0.03, (n.f1 - n.f0) / FPS), midi: n.p,
				vel: Math.min(1, Math.sqrt(n.peak / peakTop)), bright: n.bright, pure: n.pure, sustain: n.sustain, onset: n.onset, _n: n,
			}));
			progress(0.75, "Hearing the drums");
			const drums = await detectDrums(spec.D, frames, O.env, opts, progress);
			// low "notes" that start with a kick or tom and die away like one are the drum's own tone
			const drumLow = drums.hits.filter(h => /kick|tom/.test(h.kind));
			notes = notes.filter(n => {
				if (n.midi >= 55 || !drumLow.some(h => Math.abs(h.t - n.t) < 0.05)) return true;
				if (n.dur < 0.16) return false;
				const src = n._n, pi = n.midi - P0;
				const at = (sec) => act.A[Math.min(frames - 1, src.f0 + Math.round(sec * FPS)) * NP + pi];
				let peak = 0;
				for (let f = src.f0; f < Math.min(src.f1, src.f0 + Math.round(0.06 * FPS)); f++) peak = Math.max(peak, act.A[f * NP + pi]);
				return !(at(0.2) < 0.28 * peak && n.midi < 45);
			});
			// A kick drum with a long tail rings at its own low pitch on every hit, under the bass
			// line: a bass is one voice, so a low pitch that keeps sounding along with other bass
			// notes and starts with the kicks is the drum.
			{
				const kicks = drums.hits.filter(h => h.kind == "kick");
				const nearKick = (n) => kicks.some(h => Math.abs(h.t - n.t) < 0.13);
				const under = (n) => notes.some(m => m != n && m.midi > n.midi + 2 && m.midi <= 55 && Math.min(m.t + m.dur, n.t + n.dur) - Math.max(m.t, n.t) > 0.5 * n.dur);
				const votes = new Map(), total = new Map();
				for (const n of notes) {
					if (n.midi > 35) continue;
					total.set(n.midi, (total.get(n.midi) || 0) + 1);
					if (nearKick(n) || under(n)) votes.set(n.midi, (votes.get(n.midi) || 0) + 1);
				}
				for (const [m, v] of votes) {
					if (v >= 3 && v >= 0.7 * total.get(m) && kicks.length >= 4)
						notes = notes.filter(n => !(n.midi == m && (nearKick(n) || under(n))));
				}
			}
			progress(0.95, "Finding the parts, the key and the chords");
			notes = assignRoles(notes);
			// a bass note that glides into the next one without a new attack is one note with a bend
			{
				const bass = notes.filter(n => n.role == "bass").sort((a, b) => a.t - b.t);
				for (let i = 0; i + 1 < bass.length; i++) {
					const a = bass[i], b = bass[i + 1];
					if (a.dead) continue;
					const gap = b.t - (a.t + a.dur);
					if (gap < 0.045 && gap > -0.06 && Math.abs(b.midi - a.midi) <= 12 && b.midi != a.midi && (b.onset || 0) < 0.25) {
						const total = b.t + b.dur - a.t;
						const bends = (a.bend || []).map(([fr, semi]) => [fr * a.dur / total, semi]);
						bends.push([(b.t - a.t) / total, b.midi - a.midi]);
						a.bend = bends;
						a.dur = total;
						b.dead = true;
						bass[i + 1] = a;
					}
				}
				notes = notes.filter(n => !n.dead);
			}
			// glides and bends on the single-voice parts
			for (const n of notes) {
				if (n.bend) { delete n._n; continue; }
				const src = n._n;
				delete n._n;
				if ((n.role == "bass" || n.role == "lead") && n.dur > 0.12) {
					const curve = pitchCurve(spec.V, src);
					const bends = [];
					let lastSemi = 0;
					curve.forEach((c, i) => {
						if (c == null) return;
						const semi = Math.round(c);
						if (semi != lastSemi && Math.abs(c - lastSemi) > 0.7 && Math.abs(semi) <= 12) {
							bends.push([+((i * 2 + 1) / FPS / n.dur).toFixed(3), semi]);
							lastSemi = semi;
						}
					});
					if (bends.length && bends.length <= 6) n.bend = bends;
				}
			}
			// key from the notes themselves
			const hist = new Float64Array(12);
			for (const n of notes) hist[n.midi % 12] += n.dur * (0.3 + n.vel) * (n.role == "bass" ? 1.5 : 1);
			const key = detectKey(hist);
			// downbeat and meter: kicks, bass notes and chord changes on beat 1, snares on 2 and 4
			const beats = grid.beats;
			const near = (list, t, tol) => list.some(e => Math.abs(e - t) < tol);
			const kicks = drums.hits.filter(h => h.kind == "kick").map(h => h.t), snares = drums.hits.filter(h => h.kind == "snare" || h.kind == "clap").map(h => h.t);
			const bassOn = notes.filter(n => n.role == "bass").map(n => n.t);
			const beatSec = 60 / grid.bpm;
			const meters = opts.beatsPerBar > 0 ? [opts.beatsPerBar] : [4, 3];
			let bestMeter = { score: -1e9, bpb: 4, phase: 0 };
			for (const bpb of meters) {
				const half = Math.max(1, Math.floor(bpb / 2));
				for (let d = 0; d < bpb; d++) {
					let s = 0, cnt = 0;
					for (let i = d; i < beats.length; i += bpb) {
						const t = beats[i];
						if (t > x.length / SR) break;
						cnt++;
						if (near(kicks, t, 0.06)) s += 1;
						if (near(bassOn, t, 0.07)) s += 0.8;
						if (near(snares, t, 0.06)) s -= 0.6;
						if (bpb == 4) { if (near(snares, beats[i + 1], 0.06)) s += 0.5; if (near(snares, beats[i + 3], 0.06)) s += 0.5; }
						// chord change at the bar line
						const c1 = chordFor(notes, t - beatSec * half, t), c2 = chordFor(notes, t, t + beatSec * half);
						if (c1 && c2 && c1.name != c2.name) s += 0.7;
					}
					s = cnt ? s / cnt : 0;
					if (bpb == 3) s -= 0.25; // 4/4 unless 3/4 is clearly better
					if (s > bestMeter.score) bestMeter = { score: s, bpb, phase: d };
				}
			}
			const bpb = bestMeter.bpb;
			// bar 0 starts on the last downbeat at or before the first sound
			const firstSound = Math.min(notes.length ? notes[0].t : 1e9, drums.hits.length ? drums.hits[0].t : 1e9);
			let startBeat = bestMeter.phase;
			while (startBeat + bpb < beats.length && beats[startBeat + bpb] <= firstSound + 0.05) startBeat += bpb;
			if (beats[startBeat] > firstSound + 0.05) {
				// the music starts with a pickup: put one more bar of beats in front
				const period = beats[1] - beats[0];
				for (let k = 0; k < bpb; k++) beats.unshift(beats[0] - period);
			}
			const startSec = beats[startBeat];
			// chord names per half bar (or bar in 3/4)
			const chords = [];
			const chordBeats = bpb == 4 ? 2 : bpb;
			for (let i = startBeat; i + 1 < beats.length && beats[i] < x.length / SR; i += chordBeats) {
				const c = chordFor(notes.filter(n => n.role != "lead"), beats[i], beats[Math.min(beats.length - 1, i + chordBeats)]);
				const prev = chords[chords.length - 1];
				if (c && prev && prev.name == c.name) { prev.dur = beats[Math.min(beats.length - 1, i + chordBeats)] - prev.t; continue; }
				if (c) chords.push({ t: beats[i], dur: beats[Math.min(beats.length - 1, i + chordBeats)] - beats[i], name: c.name, root: c.root, type: c.type });
			}
			// timbre summary per part (the writer picks matching sounds)
			const timbre = {};
			for (const role of ["bass", "lead", "chords"]) {
				const list = notes.filter(n => n.role == role);
				if (!list.length) continue;
				const avg = (k) => list.reduce((s, n) => s + n[k] * n.dur, 0) / list.reduce((s, n) => s + n.dur, 0);
				const meanDur = list.reduce((s, n) => s + n.dur, 0) / list.length;
				timbre[role] = { bright: +avg("bright").toFixed(3), pure: +avg("pure").toFixed(3), sustain: +avg("sustain").toFixed(3), meanDur: +meanDur.toFixed(3), glides: list.filter(n => n.bend).length / list.length };
			}
			for (const n of notes) { n.t = +n.t.toFixed(4); n.dur = +n.dur.toFixed(4); n.vel = +n.vel.toFixed(3); delete n.bright; delete n.pure; delete n.sustain; delete n.onset; delete n._n; }
			progress(1, "Done");
			return {
				version: 2, bpm: +grid.bpm.toFixed(3), bpmEstimate: +bpm0.toFixed(2), steady: grid.steady, beats: beats.map(b => +b.toFixed(4)), beatsPerBar: bpb, startBeat, startSec: +startSec.toFixed(4),
				duration: x.length / SR, tuning: +spec.tuning.toFixed(1), key: { key: key.key, minor: key.minor, name: NAMES[key.key] + (key.minor ? " minor" : " major") },
				notes, drums: drums.hits, drumTemplates: drums.templates, chords, timbre,
			};
		}
		return { analyze, setPause, drumTemplateFromPcm, SR, DRUMS, version: 2 };
	}

	// ======================================================================= running the engine
	const SR = 22050;
	let localEngine = null;
	const engine = () => localEngine || (localEngine = amEngine());
	// Drum templates from CarrotBox's own drum sounds (made once, on the page).
	const DRUM_SOURCES = {
		kick: ["808/808-kick", "909/909-kick", "trap/trap-kick", "lo-fi/dusty-kick", "house/house-kick", "drums/kicks/kick-acoustic-01", "drums/kicks/kick-punchy-01", "drums/kicks/kick-deep-01", "drums/kicks/kick-techno-01"],
		snare: ["808/808-snare", "909/909-snare", "trap/trap-snare", "lo-fi/dusty-snare", "drums/snares/snare-acoustic-01", "drums/snares/snare-tight-01", "drums/snares/snare-fat-01"],
		clap: ["808/808-clap", "909/909-clap", "trap/trap-clap", "house/house-clap", "drums/claps/clap-tight-01", "drums/claps/clap-wide-01"],
		hat: ["808/808-closed-hat", "909/909-closed-hat", "trap/trap-hat", "house/house-hat", "lo-fi/muted-hat", "drums/hats/closed-hat-crisp-01", "drums/hats/closed-hat-dark-01", "drums/hats/closed-hat-analog-01"],
		open: ["808/808-open-hat", "909/909-open-hat", "trap/trap-open-hat", "house/house-open-hat", "drums/open-hats/open-hat-01", "drums/open-hats/open-hat-long-01"],
		tomLow: ["808/808-low-tom", "909/909-low-tom", "drums/toms/floor-tom-01", "drums/toms/low-tom-01"],
		tomMid: ["808/808-mid-tom", "drums/toms/mid-tom-01", "drums/toms/rack-tom-01"],
		tomHigh: ["808/808-high-tom", "909/909-high-tom", "drums/toms/high-tom-01"],
		crash: ["909/909-crash", "cymbals/crash", "drums/cymbals/crash-01", "cymbals/splash"],
		ride: ["909/909-ride", "house/house-ride", "drums/cymbals/ride-01", "cymbals/ride-bell"],
		rim: ["808/808-rimshot", "909/909-rim", "trap/trap-rim", "drums/snaps-rims/rimshot-02", "percussion/finger-snap"],
	};
	let drumLibrary = null;
	function libraryDrumTemplates() {
		if (drumLibrary) return drumLibrary;
		const out = { templates: {}, sources: {} };
		for (const kind of Object.keys(DRUM_SOURCES)) {
			out.templates[kind] = [];
			out.sources[kind] = [];
			for (const key of DRUM_SOURCES[kind]) {
				try {
					const r = A.FLSoundFactory.render(key);
					if (!r || !r.pcm || r.pcm.length < 64) continue;
					const tpl = engine().drumTemplateFromPcm(toRate(r.pcm, r.rate, SR));
					out.templates[kind].push(tpl);
					out.sources[kind].push({ key, tpl });
				}
				catch (error) { console.warn("AudioMidi: drum template", key, error); }
			}
		}
		return drumLibrary = out;
	}
	let workerUrl = null;
	function runInWorker(mono, opts, progress) {
		return new Promise((resolve, reject) => {
			if (typeof Worker == "undefined") return reject(new Error("no workers"));
			if (!workerUrl) {
				const src = "\"use strict\";\nconst AM = (" + amEngine.toString() + ")();\nAM.setPause(() => null);\n" +
					"self.onmessage = async (e) => {\n  try {\n    const r = await AM.analyze(e.data.mono, e.data.opts, (v, text) => self.postMessage({ progress: v, text }));\n    self.postMessage({ result: r });\n  } catch (error) { self.postMessage({ error: String((error && error.stack) || error) }); }\n};";
				workerUrl = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
			}
			let worker;
			try { worker = new Worker(workerUrl); }
			catch (error) { return reject(error); }
			worker.onmessage = (e) => {
				const d = e.data;
				if (d.progress != undefined) progress(d.progress, d.text);
				else if (d.result) { worker.terminate(); resolve(d.result); }
				else if (d.error) { worker.terminate(); reject(new Error(d.error)); }
			};
			worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || "worker error")); };
			const copy = mono.slice();
			worker.postMessage({ mono: copy, opts }, [copy.buffer]);
		});
	}
	// mono: Float32Array at 22,050 Hz. options: notes, drums (sensitivity 0..1), bpm (0 = detect), beatsPerBar (0 = detect).
	async function analyze(mono, options = {}, progress = () => { }) {
		const lib = libraryDrumTemplates();
		const opts = Object.assign({}, options, { drumTemplates: lib.templates });
		if (options.worker !== false) {
			try { return await runInWorker(mono, opts, progress); }
			catch (error) { console.warn("AudioMidi: analyzing on the page (" + (error.message || error) + ")"); }
		}
		const e = engine();
		e.setPause(() => new Promise(r => setTimeout(r, 0)));
		return e.analyze(mono, opts, progress);
	}

	// ======================================================================= audio decoding
	// Band-limited resampling (windowed sinc, 16 zero crossings).
	function toRate(pcm, from, to) {
		if (from == to) return pcm;
		const ratio = to / from;
		const out = new Float32Array(Math.max(1, Math.floor(pcm.length * ratio)));
		const cutoff = Math.min(1, ratio) * 0.94;
		const half = 16 / cutoff;
		for (let i = 0; i < out.length; i++) {
			const x = i / ratio;
			const c = Math.floor(x);
			let s = 0, wsum = 0;
			for (let j = Math.ceil(x - half); j <= Math.floor(x + half); j++) {
				if (j < 0 || j >= pcm.length) continue;
				const d = x - j;
				const arg = Math.PI * d * cutoff;
				const sinc = d == 0 ? 1 : Math.sin(arg) / arg;
				const win = 0.5 + 0.5 * Math.cos(Math.PI * d / half);
				const w = sinc * win;
				s += pcm[j] * w;
				wsum += w;
			}
			out[i] = wsum ? s / wsum : 0;
			void c;
		}
		return out;
	}
	async function decodeFile(file) {
		const bytes = new Uint8Array(await file.arrayBuffer());
		let mono = null, seconds = 0, channels = 1;
		// The browser decodes (and resamples) most formats directly.
		try {
			const ctx = new OfflineAudioContext(1, 1, SR);
			const buffer = await ctx.decodeAudioData(bytes.slice().buffer);
			mono = new Float32Array(buffer.length);
			for (let c = 0; c < buffer.numberOfChannels; c++) {
				const data = buffer.getChannelData(c);
				for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
			}
			seconds = buffer.duration;
			channels = buffer.numberOfChannels;
		}
		catch (error) {
			// CarrotBox's own WAV, AIFF and FLAC readers
			const decoded = await A.FLSampleBank.decode(bytes, file.name);
			channels = decoded.channels.length;
			const length = decoded.channels[0].length;
			const mix = new Float32Array(length);
			for (const ch of decoded.channels) for (let i = 0; i < length; i++) mix[i] += ch[i] / channels;
			mono = toRate(mix, decoded.sampleRate, SR);
			seconds = length / decoded.sampleRate;
		}
		// normalize so thresholds behave the same for quiet and loud files
		let peak = 0;
		for (let i = 0; i < mono.length; i++) peak = Math.max(peak, Math.abs(mono[i]));
		if (peak > 0) for (let i = 0; i < mono.length; i++) mono[i] /= peak;
		return { mono, bytes, seconds, channels, name: file.name };
	}

	// ======================================================================= writing
	const ROLE_NAMES = { lead: "Lead", chords: "Harmony", bass: "Bass" };
	// Sounds for each part, picked by what the analysis heard (sustained or plucked, bright or pure).
	function soundFor(role, timbre) {
		const t = timbre || { bright: 0.3, pure: 0.2, sustain: 0.5, meanDur: 0.4, glides: 0 };
		const sustained = t.sustain > 0.45 && t.meanDur > 0.3;
		if (role == "bass") {
			if (t.pure > 0.45 && (t.glides > 0.05 || t.meanDur > 0.5)) return "808s/tuned-c/808-clean-long";
			if (t.pure > 0.5) return "instruments/bass/sub-sine";
			if (sustained) return t.bright > 0.35 ? "instruments/bass/reese-bass-02" : "instruments/bass/moog-ish-bass";
			return "instruments/bass/finger-bass";
		}
		if (role == "lead") {
			if (t.pure > 0.45) return sustained ? "instruments/winds/flute-02" : "instruments/bells/glass-bell";
			if (sustained) return t.bright > 0.35 ? "instruments/synth-leads/lead-saw" : "instruments/synth-leads/lead-square";
			return t.bright > 0.35 ? "instruments/plucks/pluck-synth" : "instruments/keys/rhodes";
		}
		if (sustained) return t.bright > 0.35 ? "instruments/strings/strings-ensemble" : "instruments/pads/pad-warm";
		return t.bright > 0.35 ? "instruments/keys/piano-bright" : "instruments/keys/rhodes";
	}
	const PAD_ORDER = ["kick", "snare", "clap", "hat", "open", "tomLow", "tomMid", "tomHigh", "rim", "crash", "ride"];
	const PAD_NAMES = { kick: "Kick", snare: "Snare", clap: "Clap", hat: "Closed hat", open: "Open hat", tomLow: "Low tom", tomMid: "Mid tom", tomHigh: "High tom", rim: "Rim", crash: "Crash", ride: "Ride" };
	// The library sound whose template is closest to the recording's (adapted) drum template.
	function matchDrumSound(kind, template) {
		const lib = libraryDrumTemplates().sources[kind] || [];
		if (!lib.length) return null;
		if (!template) return lib[0].key;
		let best = lib[0].key, bestScore = -2;
		for (const s of lib) {
			let dot = 0, na = 0, nb = 0;
			for (let b = 0; b < template.length; b++) { dot += template[b] * s.tpl[b]; na += template[b] * template[b]; nb += s.tpl[b] * s.tpl[b]; }
			const cos = dot / Math.sqrt(na * nb || 1);
			if (cos > bestScore) { bestScore = cos; best = s.key; }
		}
		return best;
	}
	// Seconds -> song parts through the beat map (bar 0 = result.startSec).
	function partsMapper(result) {
		const beats = result.beats, ppb = Config.partsPerBeat, last = beats.length - 1;
		return (t) => {
			let pos;
			if (t <= beats[0]) pos = (t - beats[0]) / Math.max(1e-6, beats[1] - beats[0]);
			else if (t >= beats[last]) pos = last + (t - beats[last]) / Math.max(1e-6, beats[last] - beats[last - 1]);
			else {
				let lo = 0, hi = last;
				while (hi - lo > 1) { const m = (lo + hi) >> 1; if (beats[m] <= t) lo = m; else hi = m; }
				pos = lo + (t - beats[lo]) / Math.max(1e-6, beats[lo + 1] - beats[lo]);
			}
			return (pos - result.startBeat) * ppb;
		};
	}
	function quantizer(mode) {
		// mode: 0 smart, 1 exact, 2 sixteenths, 3 thirty-seconds, 4 sixteenth triplets
		return (x) => {
			switch (mode) {
				case 1: return Math.round(x);
				case 2: return Math.round(x / 6) * 6;
				case 3: return Math.round(x / 3) * 3;
				case 4: return Math.round(x / 4) * 4;
			}
			const q16 = Math.round(x / 6) * 6, q12 = Math.round(x / 4) * 4;
			if (Math.abs(x - q16) <= 1.6) return q16;
			if (Math.abs(x - q12) <= 1.1) return q12;
			return Math.round(x);
		};
	}
	// Splits notes over bars: [{start, end (parts from bar 0), pitches, size, pins}] -> bars.
	function toBars(notes, bars, barParts) {
		const out = [];
		for (let b = 0; b < bars; b++) out.push([]);
		for (const n of notes) {
			let s = n.start;
			while (s < n.end) {
				const bar = Math.floor(s / barParts);
				if (bar >= bars) break;
				if (bar < 0) { s = 0; continue; }
				const barEnd = (bar + 1) * barParts, e = Math.min(n.end, barEnd);
				const piece = { start: s - bar * barParts, end: e - bar * barParts, pitches: n.pitches, size: n.size };
				if (n.pins && s == n.start && e == n.end) piece.pins = n.pins;
				out[bar].push(piece);
				s = e;
			}
		}
		return out;
	}
	async function setSampler(doc, channel, key) {
		const id = "b:" + key;
		const entry = A.FLSampleBank.requestNow(id);
		if (!entry || entry.status != "ready") return false;
		doc.record(new A.ChangeFL(doc, () => {
			const instrument = doc.song.channels[channel].instruments[0];
			instrument.setTypeAndReset(A.FLConfig.typeSampler, false);
			const sampler = instrument.fl.sampler;
			sampler.sampleId = id;
			sampler.sampleName = entry.name || key.split("/").pop();
			if (entry.rootKey != null) sampler.root = entry.rootKey;
			const info = A.FLSoundFactory.render(key);
			if (info && info.loop) { sampler.loop = true; sampler.loopStart = info.loop[0]; sampler.loopEnd = info.loop[1]; }
		}));
		return true;
	}
	async function writeSong(host, result, options, original) {
		const doc = host.doc;
		const parts = Object.assign({ drums: true, bass: true, lead: true, chords: true, original: true }, options.parts || {});
		const layout = options.layout | 0;      // 0 by part, 1 everything pitched in one channel, 2 by register
		const quantize = quantizer(options.quantize | 0);
		if (doc.synth.playing) doc.performance.pause();
		if (options.mode == "new") {
			doc.goBackToStart();
			doc.record(new A.ChangeSong(doc, ""), false, true);
		}
		const song = doc.song;
		doc.record(new A.ChangeTempo(doc, song.tempo, Math.max(Config.tempoMin, Math.min(Config.tempoMax, Math.round(result.bpm)))));
		const keyIndex = Config.keys.findIndex(k => k.basePitch % 12 == result.key.key);
		if (keyIndex >= 0) doc.record(new A.ChangeKey(doc, keyIndex));
		const scaleIndex = Config.scales.findIndex(s => s.name == (result.key.minor ? "normal :(" : "normal :)"));
		if (scaleIndex >= 0) doc.record(new A.ChangeScale(doc, scaleIndex));
		if (song.beatsPerBar != result.beatsPerBar) doc.record(new A.ChangeBeatsPerBar(doc, result.beatsPerBar, "splice"));
		const ppb = Config.partsPerBeat, barParts = result.beatsPerBar * ppb;
		const toParts = partsMapper(result);
		const basePitch = Config.keys[song.key].basePitch;
		let lastEnd = 0;
		for (const n of result.notes) lastEnd = Math.max(lastEnd, toParts(n.t + n.dur));
		for (const d of result.drums) lastEnd = Math.max(lastEnd, toParts(d.t) + ppb / 4);
		const bars = Math.max(1, Math.min(Config.barCountMax, Math.ceil(lastEnd / barParts)));
		const sizeOf = (vel) => options.velocity === false ? Config.noteSizeMax : vel > 0.62 ? 3 : vel > 0.32 ? 2 : 1;
		const toNote = (n) => {
			const start = quantize(toParts(n.t));
			let end = quantize(toParts(n.t + n.dur));
			if (end <= start) end = start + Math.max(1, Math.min(6, Math.round(toParts(n.t + n.dur) - toParts(n.t))));
			const pitch = n.midi - basePitch;
			const note = { start, end, pitches: [pitch], size: sizeOf(n.vel) };
			if (options.bends !== false && n.bend && n.bend.length) {
				const len = end - start;
				const pins = [{ time: 0, interval: 0, size: note.size }];
				for (const [frac, semi] of n.bend) {
					const time = Math.round(frac * len);
					if (time > pins[pins.length - 1].time && time < len) pins.push({ time, interval: semi, size: note.size });
				}
				pins.push({ time: len, interval: pins[pins.length - 1].interval, size: note.size });
				if (pins.length > 2) note.pins = pins;
			}
			return note;
		};
		const valid = (n) => n.pitches.every(p => p >= 0 && p <= Config.maxPitch);
		// pitched groups
		const groups = [];
		const pitched = result.notes.filter(n => parts[n.role] !== false);
		if (layout == 1) groups.push({ name: "All notes", role: "chords", notes: pitched });
		else if (layout == 2) {
			groups.push({ name: "High", role: "lead", notes: pitched.filter(n => n.midi >= 72) });
			groups.push({ name: "Middle", role: "chords", notes: pitched.filter(n => n.midi >= 55 && n.midi < 72) });
			groups.push({ name: "Low", role: "bass", notes: pitched.filter(n => n.midi < 55) });
		}
		else for (const role of ["lead", "chords", "bass"]) groups.push({ name: ROLE_NAMES[role], role, notes: pitched.filter(n => n.role == role) });
		const freePitched = options.mode == "new" ? Array.from({ length: song.pitchChannelCount }, (_, i) => i) : [];
		const freeNoise = options.mode == "new" ? Array.from({ length: song.noiseChannelCount }, (_, i) => song.pitchChannelCount + i) : [];
		const take = (isNoise) => {
			const list = isNoise ? freeNoise : freePitched;
			if (list.length) return list.shift();
			const added = A.carrotNewChannel(doc, isNoise);
			if (!added) return null;
			doc.record(added.group);
			// adding a pitched channel moves the drum channels up by one
			if (!isNoise) for (let i = 0; i < freeNoise.length; i++) freeNoise[i]++;
			return added.index;
		};
		const written = [];
		for (const g of groups) {
			const notes = g.notes.map(toNote).filter(valid);
			if (!notes.length) continue;
			const channel = take(false);
			if (channel == null) { A.flToast("AudioMidi: no room for another channel (" + g.name + ")"); continue; }
			A.carrotNameChannel(doc, channel, g.name + " (AudioMidi)");
			await setSampler(doc, channel, soundFor(g.role, layout == 0 ? result.timbre[g.role] : null));
			A.carrotWriteNotes(doc, toBars(notes, bars, barParts), { channel, startBar: 0, replace: true, freshPatterns: true, overlap: true });
			written.push(g.name.toLowerCase() + " (" + notes.length + ")");
		}
		// drums: a kit built from the library sounds closest to the recording's
		if (parts.drums && result.drums.length) {
			const channel = take(true);
			if (channel != null) {
				A.carrotNameChannel(doc, channel, "Drums (AudioMidi)");
				const used = PAD_ORDER.filter(k => result.drums.some(d => d.kind == k));
				const rows = {};
				doc.record(new A.ChangeFL(doc, () => {
					const instrument = doc.song.channels[channel].instruments[0];
					instrument.setTypeAndReset(A.FLConfig.typeFPC, true);
					const fpc = instrument.fl.fpc;
					used.forEach((kind, i) => {
						if (i >= fpc.pads.length) return;
						const key = options.matchDrums === false ? (DRUM_SOURCES[kind] || [])[1] || DRUM_SOURCES[kind][0] : matchDrumSound(kind, result.drumTemplates && result.drumTemplates[kind]);
						if (!key) return;
						const pad = fpc.pads[i];
						pad.reset();
						pad.sampleId = "b:" + key;
						pad.name = PAD_NAMES[kind];
						if (kind == "hat" || kind == "open") pad.cut = 1;
						rows[kind] = i;
					});
					fpc.kitName = "AudioMidi kit";
				}));
				for (const pad of doc.song.channels[channel].instruments[0].fl.fpc.pads) if (pad.sampleId) A.FLSampleBank.request(pad.sampleId);
				const notes = [];
				for (const d of result.drums) {
					if (rows[d.kind] == undefined) continue;
					const start = quantize(toParts(d.t));
					notes.push({ start, end: start + 6, pitches: [rows[d.kind]], size: sizeOf(d.vel) });
				}
				A.carrotWriteNotes(doc, toBars(notes, bars, barParts), { channel, startBar: 0, replace: true, freshPatterns: true, overlap: true });
				written.push("drums (" + notes.length + " hits)");
			}
		}
		// the original, muted, for A/B listening
		if (parts.original && original) {
			try {
				const id = await A.FLSampleBank.addBytes(original.bytes, original.name);
				const channel = take(false);
				if (channel != null) {
					const entry = await A.FLSampleBank.whenReady(id);
					doc.record(new A.ChangeFL(doc, () => {
						const ch = doc.song.channels[channel];
						const instrument = ch.instruments[0];
						instrument.setTypeAndReset(A.FLConfig.typeSampler, false);
						const sampler = instrument.fl.sampler;
						sampler.sampleId = id;
						sampler.sampleName = original.name;
						sampler.oneShot = true;
						sampler.keytrack = false;
						// when the recording begins before bar 0, its start is trimmed so the two line up
						const seconds = entry && entry.pcm ? entry.pcm.length / entry.rate : result.duration;
						sampler.start = result.startSec > 0 ? Math.min(0.95, result.startSec / Math.max(0.1, seconds)) : 0;
						ch.name = "Original audio (AudioMidi)";
						ch.muted = true;
					}));
					// ...and when it begins after bar 0 starts (a pickup), its note starts later
					const lead = Math.max(0, Math.round(toParts(0)));
					A.carrotWriteNotes(doc, [[{ start: Math.min(barParts - 1, lead), end: Math.min(barParts, lead + ppb), pitches: [48], size: 3 }]], { channel, startBar: 0, replace: true, freshPatterns: true });
					written.push("original (muted)");
				}
			}
			catch (error) {
				console.warn("AudioMidi: could not add the original audio", error);
			}
		}
		doc.selection.setChannelBar(0, 0);
		return { written, bars };
	}

	// ======================================================================= UI
	const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
	const ROLE_COLORS = { lead: "#ff7eb6", chords: "#c3e88d", bass: "#4fc3f7" };
	function open(host) {
		const state = { file: null, result: null, busy: false };
		const params = host.params();
		const p = Object.assign({ drums: 0.5, notes: 0.5, length: 2, mode: 0, layout: 0, quantize: 0, bpm: 0, meter: 0, bends: true, velocity: true, parts: { drums: true, bass: true, lead: true, chords: true, original: true } }, params);
		Object.assign(params, p);
		if (!params.parts) params.parts = p.parts;
		if (params.parts.chords === undefined) params.parts.chords = true;
		const fileInput = HTML.input({ type: "file", accept: "audio/*,.wav,.mp3,.ogg,.oga,.flac,.m4a,.aac,.aif,.aiff,.opus,.webm", style: "display: none;" });
		const drop = HTML.div({ class: "cb-am-drop", tabindex: "0" }, HTML.b("Drop a song here (WAV, MP3, OGG, FLAC, M4A, AIFF)"), HTML.span({ class: "cb-hint" }, "or click to choose a file. It never leaves this computer."));
		const info = HTML.div({ class: "cb-hint", style: "min-height: 16px; margin-top: 6px;" });
		const bar = HTML.div({ class: "cb-am-progress" }, HTML.div());
		const stage = HTML.div({ class: "cb-hint", style: "min-height: 16px;" });
		const stats = HTML.div({ class: "cb-am-stats" });
		const canvas = CarrotUI.canvas(190);
		const legend = HTML.div({ class: "cb-am-legend" }, HTML.span({ style: "--c: #ff7eb6" }, "Lead"), HTML.span({ style: "--c: #c3e88d" }, "Harmony"), HTML.span({ style: "--c: #4fc3f7" }, "Bass"), HTML.span({ style: "--c: #ffcb6b" }, "Drums"), HTML.span({ style: "--c: rgba(255,255,255,0.4)" }, "Bars"));
		const drumsKnob = host.knob("drums", { label: "Drum sens.", min: 0, max: 1, def: 0.5, format: (v) => Math.round(v * 100) + "%", title: "Higher finds quieter hits (and more false ones)" });
		const notesKnob = host.knob("notes", { label: "Note sens.", min: 0, max: 1, def: 0.5, format: (v) => Math.round(v * 100) + "%", title: "Higher keeps quieter notes" });
		const lengthSelect = CarrotUI.select({ label: "Analyze", options: ["First 30 seconds", "First minute", "First 2 minutes", "First 4 minutes", "Whole file"], value: params.length, onChange: (v) => { params.length = v; } });
		const bpmInput = HTML.input({ type: "number", min: "0", max: "300", step: "0.1", value: params.bpm ? String(params.bpm) : "", placeholder: "auto", style: "width: 64px;" });
		for (const type of ["keydown", "keyup", "keypress"]) bpmInput.addEventListener(type, (e) => e.stopPropagation());
		bpmInput.addEventListener("input", () => { params.bpm = Math.max(0, Math.min(300, parseFloat(bpmInput.value) || 0)); });
		const meterSelect = CarrotUI.select({ label: "Meter", options: ["Detect", "4/4", "3/4"], value: params.meter, onChange: (v) => { params.meter = v; } });
		const modeSelect = CarrotUI.select({ label: "Write into", options: ["New channels in this song", "A new song (replaces this one, Z undoes)"], value: params.mode, onChange: (v) => { params.mode = v; } });
		const layoutSelect = CarrotUI.select({ label: "Channels", options: ["One per part (lead, harmony, bass)", "All notes in one channel", "By register (high, middle, low)"], value: params.layout, onChange: (v) => { params.layout = v; } });
		const quantizeSelect = CarrotUI.select({ label: "Timing", options: ["Smart (snap close notes to the grid)", "Exact (as played)", "1/16 grid", "1/32 grid", "1/16 triplets"], value: params.quantize, onChange: (v) => { params.quantize = v; } });
		const toggles = [["drums", "Drums"], ["bass", "Bass"], ["lead", "Lead"], ["chords", "Harmony"], ["original", "Original (muted)"]].map(([key, label]) =>
			CarrotUI.toggle({ label, value: params.parts[key] !== false, onChange: (v) => { params.parts[key] = v; } }));
		const bendToggle = CarrotUI.toggle({ label: "Pitch bends", value: params.bends !== false, title: "Write glides (808 slides, vocal scoops) as note bends", onChange: (v) => { params.bends = v; } });
		const velocityToggle = CarrotUI.toggle({ label: "Velocity", value: params.velocity !== false, title: "Quiet notes become quieter notes", onChange: (v) => { params.velocity = v; } });
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
		drop.addEventListener("drop", async (e) => {
			e.preventDefault();
			e.stopPropagation();
			drop.classList.remove("cb-hover");
			const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
			if (file) load(file);
			else {
				// a sound dragged from the Sound Browser
				try {
					const payload = A.flReadDragPayload ? A.flReadDragPayload(e) : null;
					if (payload) loadSample(await A.FLActions.payloadToSampleId(payload), payload.name || "sound");
				}
				catch (error) { /* not a sound */ }
			}
		});
		fileInput.addEventListener("change", () => { const file = fileInput.files && fileInput.files[0]; fileInput.value = ""; if (file) load(file); });
		async function load(file) {
			if (state.busy) return;
			info.textContent = "Decoding " + file.name + "...";
			try {
				state.file = await decodeFile(file);
				afterLoad();
			}
			catch (error) {
				console.warn(error);
				info.textContent = "This file could not be decoded. Try WAV, MP3, OGG or FLAC.";
			}
		}
		async function loadSample(id, name) {
			const entry = await A.FLSampleBank.whenReady(id);
			if (!entry || !entry.pcm) return;
			const mono = toRate(entry.pcm, entry.rate, SR);
			let peak = 0;
			for (const v of mono) peak = Math.max(peak, Math.abs(v));
			if (peak > 0) for (let i = 0; i < mono.length; i++) mono[i] /= peak;
			state.file = { mono, bytes: null, seconds: mono.length / SR, channels: 1, name };
			afterLoad();
		}
		function afterLoad() {
			state.result = null;
			writeButton.disabled = true;
			playButton.disabled = false;
			const m = Math.floor(state.file.seconds / 60), s = Math.round(state.file.seconds % 60);
			info.textContent = state.file.name + "  ·  " + m + ":" + String(s).padStart(2, "0") + "  ·  " + (state.file.channels > 1 ? "stereo" : "mono") + ". Press Analyze.";
			stats.innerHTML = "";
			drawView();
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
				state.result = await analyze(mono, { drums: params.drums, notes: params.notes, bpm: params.bpm, beatsPerBar: [0, 4, 3][params.meter | 0] }, setProgress);
				setProgress(1);
				const r = state.result;
				const bars = Math.ceil((r.duration - r.startSec) / (60 / r.bpm * r.beatsPerBar));
				stage.textContent = "Analyzed in " + ((performance.now() - t0) / 1000).toFixed(1) + " s." + (bars > Config.barCountMax ? " Only the first " + Config.barCountMax + " bars fit in a song." : " Check the numbers, then Write to song.");
				renderStats();
				drawView();
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
			const stat = (label, value, title) => stats.appendChild(HTML.div({ class: "cb-am-stat", title: title || value }, HTML.small(label), HTML.b(value)));
			stat("Tempo", (Math.round(r.bpm * 10) / 10) + " BPM" + (r.steady ? "" : " ~"), r.steady ? "Steady tempo" : "The tempo moves; notes follow the beat map");
			stat("Meter", r.beatsPerBar + "/4");
			stat("Key", r.key.name);
			stat("Tuning", (r.tuning > 0 ? "+" : "") + r.tuning + " ct", "Offset from A = 440 Hz");
			stat("Drum hits", String(r.drums.length), Object.entries(r.drums.reduce((m, d) => (m[d.kind] = (m[d.kind] || 0) + 1, m), {})).map(([k, v]) => k + " " + v).join(", "));
			stat("Bass notes", String(r.notes.filter(n => n.role == "bass").length));
			stat("Lead notes", String(r.notes.filter(n => n.role == "lead").length));
			stat("Harmony notes", String(r.notes.filter(n => n.role == "chords").length));
			stat("Glides", String(r.notes.filter(n => n.bend).length));
			const names = r.chords.slice(0, 8).map(c => c.name);
			stat("Chords", names.slice(0, 4).join(" ") || "-", names.join(" "));
		}
		function drawView() {
			const { ctx, w, h } = CarrotUI.ctx(canvas);
			ctx.fillStyle = "#0b0d12";
			ctx.fillRect(0, 0, w, h);
			if (!state.file) {
				ctx.fillStyle = "rgba(255,255,255,0.35)";
				ctx.font = "12px sans-serif";
				ctx.textAlign = "center";
				ctx.fillText("The waveform, beat grid, notes and drum hits appear here", w / 2, h / 2 + 4);
				return;
			}
			const r = state.result;
			const limit = r ? r.duration : state.file.seconds;
			const mono = state.file.mono;
			const len = Math.min(mono.length, Math.floor(limit * SR));
			const waveH = h * 0.16;
			ctx.fillStyle = "rgba(0,200,255,0.3)";
			for (let x = 0; x < w; x++) {
				const a = Math.floor(x / w * len), b = Math.floor((x + 1) / w * len);
				let mx = 0;
				for (let i = a; i < b; i += 4) mx = Math.max(mx, Math.abs(mono[i]));
				ctx.fillRect(x, waveH - mx * waveH * 0.9, 1, Math.max(1, mx * waveH * 1.8));
			}
			if (!r) return;
			const secX = (s) => (s / limit) * w;
			// bar lines from the beat map
			for (let i = r.startBeat; i < r.beats.length; i++) {
				const x = secX(r.beats[i]);
				if (x > w) break;
				const isBar = (i - r.startBeat) % r.beatsPerBar == 0;
				ctx.fillStyle = isBar ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.06)";
				ctx.fillRect(Math.round(x), waveH * 2, 1, h - waveH * 2);
			}
			// piano roll
			const top = waveH * 2 + 4, bottom = h - 22;
			let lo = 127, hi = 0;
			for (const n of r.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
			if (hi < lo) { lo = 36; hi = 84; }
			const rowH = (bottom - top) / Math.max(12, hi - lo + 1);
			for (const n of r.notes) {
				ctx.fillStyle = ROLE_COLORS[n.role] || "#ccc";
				ctx.globalAlpha = 0.45 + 0.55 * n.vel;
				const x = secX(n.t), x2 = secX(n.t + n.dur);
				ctx.fillRect(x, bottom - (n.midi - lo + 1) * rowH, Math.max(1.5, x2 - x - 0.5), Math.max(1.5, rowH - 0.5));
			}
			ctx.globalAlpha = 1;
			// drum lanes
			const lanes = ["kick", "snare", "clap", "hat", "open", "tomLow", "tomMid", "tomHigh", "rim", "crash", "ride"];
			ctx.fillStyle = "#ffcb6b";
			for (const d of r.drums) {
				const lane = lanes.indexOf(d.kind);
				ctx.globalAlpha = 0.4 + 0.6 * d.vel;
				ctx.fillRect(secX(d.t), h - 3 - (lane >= 0 ? lane : 0) * 1.7, 1.5, 1.6);
			}
			ctx.globalAlpha = 1;
		}
		async function write() {
			if (!state.result || state.busy) return;
			state.busy = true;
			writeButton.disabled = true;
			try {
				const { written, bars } = await writeSong(host, state.result, { parts: params.parts, mode: params.mode == 1 ? "new" : "add", layout: params.layout, quantize: params.quantize, bends: params.bends, velocity: params.velocity }, params.parts.original && state.file.bytes ? state.file : null);
				stage.textContent = written.length ? "Wrote " + written.join(", ") + " over " + bars + " bars at " + Math.round(state.result.bpm) + " BPM in " + state.result.key.name + ". Z undoes." : "Nothing to write: no notes were found.";
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
			CarrotUI.hint("AudioMidi listens to a recording and writes it as notes: every note of the harmony with its own timing, the bass and lead lines with their glides, and eleven kinds of drum hits, following the song's beat. The sounds are CarrotBox's own. Clear mixes give the closest copy."),
			HTML.div({ style: "height: 8px;" }), drop, fileInput, info,
			CarrotUI.section("Listen for", HTML.div({ class: "cb-row cb-center" }, ...toggles)),
			CarrotUI.section("Analysis", HTML.div({ class: "cb-row cb-center" }, drumsKnob, notesKnob, lengthSelect, HTML.label({ class: "cb-field" }, "Tempo (BPM)", bpmInput), meterSelect)),
			CarrotUI.section("Writing", HTML.div({ class: "cb-row cb-center" }, modeSelect, layoutSelect, quantizeSelect, bendToggle, velocityToggle)),
			bar, stage, stats, legend, canvas,
			HTML.div({ class: "cb-row", style: "justify-content: flex-end; margin-top: 8px; gap: 6px;" }, playButton, stopButton, analyzeButton, writeButton));
		setTimeout(drawView, 0);
		return root;
	}

	B.CarrotPlugins.register({
		id: "audiomidi",
		width: 760,
		defaultParams: () => ({}),
		open,
		// exposed for tests and other tools
		analyze, decodeFile, writeSong, toRate, SR, engine: amEngine, drumTemplates: () => libraryDrumTemplates().templates, drumSources: DRUM_SOURCES,
	});
})();
