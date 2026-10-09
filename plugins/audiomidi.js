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
.cb-am-insts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 6px 0; }
.cb-am-inst { padding: 6px 8px; border-radius: 8px; background: rgba(127,127,127,0.1); min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.cb-am-inst b { font-size: 12px; }
.cb-am-inst small { opacity: 0.7; font-size: 10px; line-height: 1.3; }
.cb-am-inst canvas { width: 100%; height: 34px; display: block; border-radius: 4px; background: rgba(0,0,0,0.35); }
.cb-am-inst .cb-row { gap: 4px; flex-wrap: wrap; }
.cb-am-inst .cb-button { padding: 2px 7px; font-size: 11px; }
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
			// The beat tracker can lock onto the off-beats (loud open hats in house music). Kicks and
			// bass notes say where the beat is: if they sit between the beats, move the beats there.
			{
				const b = grid.beats;
				const frac = (t) => {
					let lo = 0, hi = b.length - 1;
					if (t < b[0] || t >= b[hi]) return -1;
					while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m] <= t) lo = m; else hi = m; }
					return (t - b[lo]) / (b[lo + 1] - b[lo]);
				};
				let on = 0, off = 0, count = 0;
				const vote = (t, w) => { const f = frac(t); if (f < 0) return; if (f < 0.12 || f > 0.88) on += w; else if (Math.abs(f - 0.5) < 0.12) off += w; count++; };
				// (a kick that starts with a bass note may be the bass's own attack: it does not vote)
				const bassT = notes.filter(n => n.role == "bass").map(n => n.t);
				for (const h of drums.hits) {
					if (h.kind == "kick" && !bassT.some(t => Math.abs(t - h.t) < 0.04)) vote(h.t, 1);
					else if (h.kind == "snare" || h.kind == "clap") vote(h.t, 0.7);
				}
				for (const t of bassT) vote(t, 0.3);
				if (count >= 8 && off > 1.85 * on && b.length > 2) {
					const shifted = [b[0] - (b[1] - b[0]) / 2];
					for (let i = 0; i + 1 < b.length; i++) shifted.push((b[i] + b[i + 1]) / 2);
					shifted.push(b[b.length - 1] + (b[b.length - 1] - b[b.length - 2]) / 2);
					grid.beats = shifted;
				}
			}
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
			progress(0.98, "Arranging the parts");
			const arr = arrange({ act, frames, onsetAt, notes, hits: drums.hits, beats, startBeat, bpb, chords, duration: x.length / SR, sens: opts.notes });
			progress(0.99, "Measuring the instruments");
			await pause();
			const instruments = opts.instruments === false ? {} : extractInstruments(x, notes, drums.hits, spec.tuning);
			for (const n of notes) { n.t = +n.t.toFixed(4); n.dur = +n.dur.toFixed(4); n.vel = +n.vel.toFixed(3); delete n.bright; delete n.pure; delete n.sustain; delete n.onset; delete n._n; }
			progress(1, "Done");
			return {
				version: 2, bpm: +grid.bpm.toFixed(3), bpmEstimate: +bpm0.toFixed(2), steady: grid.steady, beats: beats.map(b => +b.toFixed(4)), beatsPerBar: bpb, startBeat, startSec: +startSec.toFixed(4),
				duration: x.length / SR, tuning: +spec.tuning.toFixed(1), key: { key: key.key, minor: key.minor, name: NAMES[key.key] + (key.minor ? " minor" : " major") },
				notes, drums: drums.hits, drumTemplates: drums.templates, chords, timbre, arr, instruments,
			};
		}
		// ---------------------------------------------------------------- arrangement
		// Turns the raw transcription into parts a musician would write: everything on the beat grid
		// (16ths, or triplets when the music swings), one-note-at-a-time bass and lead lines chosen over
		// the whole song (no fragments, no gaps), block chords from the harmony, and drum patterns
		// made consistent with how they repeat.
		function arrange(c) {
			const { act, frames, onsetAt, hits, beats, startBeat, bpb, chords, duration } = c, sens = c.sens == undefined ? 0.5 : c.sens;
			const LEAD_VEL = 0.7, BASS_VEL = 0.75, CH_SHORT = 3;
			// chords are struck together: a lone note in the chord part, up where the melody plays and
			// while the melody is silent, is a melody note
			const notes = c.notes.map(n => Object.assign({}, n));
			{
				const leadN = notes.filter(n => n.role == "lead"), chordN = notes.filter(n => n.role == "chords");
				if (leadN.length >= 8) {
					const lp = leadN.map(n => n.midi).sort((a, b) => a - b), low = lp[Math.floor(lp.length * 0.2)];
					for (const n of chordN) {
						if (n.midi < low || n.dur > 0.8) continue;
						if (chordN.some(m => m != n && Math.abs(m.t - n.t) < 0.06)) continue;
						if (leadN.some(m => m.t < n.t + 0.05 && m.t + m.dur > n.t - 0.05)) continue;
						n.role = "lead";
					}
				}
			}
			const A_ = act.A;
			// ---- the grid
			const beatAt = (t) => {
				let lo = 0, hi = beats.length - 1;
				if (t <= beats[0]) return (t - beats[0]) / Math.max(1e-6, beats[1] - beats[0]);
				if (t >= beats[hi]) return hi + (t - beats[hi]) / Math.max(1e-6, beats[hi] - beats[hi - 1]);
				while (hi - lo > 1) { const m = (lo + hi) >> 1; if (beats[m] <= t) lo = m; else hi = m; }
				return lo + (t - beats[lo]) / Math.max(1e-6, beats[lo + 1] - beats[lo]);
			};
			const fits = (S) => {
				let err = 0, w = 0, off = 0;
				for (const n of notes) if (n.vel > 0.25) { const b = beatAt(n.t), f = b * S - Math.round(b * S); err += Math.abs(f) * n.vel; w += n.vel; }
				for (const h of hits) { const b = beatAt(h.t), f = b * S - Math.round(b * S); err += Math.abs(f) * h.vel; w += h.vel; if (S == 3) { const q = ((Math.round(b * 3) % 3) + 3) % 3; if (q) off += h.vel; } }
				return { err: w ? err / w / S : 0, off: w ? off / w : 0 };
			};
			const f4 = fits(4), f3 = fits(3);
			const S = f3.err < f4.err * 0.75 && f3.off > 0.2 ? 3 : 4;
			const stepT = [];
			for (let i = 0; i + 1 < beats.length; i++) for (let k = 0; k < S; k++) stepT.push(beats[i] + (beats[i + 1] - beats[i]) * k / S);
			stepT.push(beats[beats.length - 1]);
			const nSteps = stepT.length - 1;
			const stepOf = (t) => {
				let lo = 0, hi = nSteps;
				if (t <= stepT[0]) return 0;
				if (t >= stepT[hi]) return hi;
				while (hi - lo > 1) { const m = (lo + hi) >> 1; if (stepT[m] <= t) lo = m; else hi = m; }
				return t - stepT[lo] < stepT[lo + 1] - t ? lo : lo + 1;
			};
			const lastStep = Math.min(nSteps, stepOf(duration) + 1);
			// ---- evidence per step and pitch (mean activation over the step)
			const E = new Float32Array(lastStep * NP);
			for (let s = 0; s < lastStep; s++) {
				const f0 = Math.max(0, Math.round(stepT[s] * FPS)), f1 = Math.max(f0 + 1, Math.min(frames, Math.round(stepT[s + 1] * FPS)));
				for (let p = 0; p < NP; p++) {
					let sum = 0;
					for (let f = f0; f < f1; f++) sum += A_[f * NP + p];
					E[s * NP + p] = sum / (f1 - f0);
				}
			}
			const cover = (role) => {
				// where the raw notes of a part are (step x pitch), and where they start
				const m = new Float32Array(lastStep * NP), starts = new Map();
				for (const n of notes) {
					if (n.role != role) continue;
					const p = n.midi - P0;
					if (p < 0 || p >= NP) continue;
					const s0 = stepOf(n.t), s1 = Math.max(s0 + 1, stepOf(n.t + n.dur));
					for (let s = s0; s < Math.min(s1, lastStep); s++) m[s * NP + p] = Math.max(m[s * NP + p], 0.4 + 0.6 * n.vel);
					starts.set(s0 * NP + p, n);
				}
				return { m, starts };
			};
			const pct = (arr, q) => { const v = Array.from(arr).filter(x => x > 0).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 1; };
			const chordAt = (t) => { for (const c of chords) if (t >= c.t - 0.02 && t < c.t + c.dur) return (CHORD_TYPES.find(ct => ct[0] == c.type) || CHORD_TYPES[0])[1].map(x => (c.root + x) % 12); return null; };
			const barSteps = bpb * S, firstStep = startBeat * S;
			// one part: the heard notes on the grid, cleaned up
			function part(role, mono) {
				let list = notes.filter(n => n.role == role).map(n => ({ midi: n.midi, s0: stepOf(n.t), s1: Math.max(stepOf(n.t) + 1, stepOf(n.t + n.dur)), vel: n.vel, onset: n.onset || 0, bend: n.bend, dur: n.dur }));
				// tiny quiet notes are noise
				list = list.filter(n => !(n.dur < Math.max(0.06, 0.45 * (stepT[1] - stepT[0])) && n.vel < 0.45));
				if (role == "chords") {
					// overtones of a chord note struck with it, and quiet notes outside the harmony
					list = list.filter(n => !list.some(m => m != n && Math.abs(m.s0 - n.s0) <= 1 && [12, 19, 24].includes(n.midi - m.midi) && m.vel >= n.vel * 0.8));
					list = list.filter(n => { const tones = chordAt(stepT[n.s0]); return !tones || tones.includes(n.midi % 12) || n.vel > 0.6; });
				}
				list.sort((a, b) => a.s0 - b.s0 || a.midi - b.midi);
				if (role == "lead" && list.length >= 8) {
					// a line that jumps an octave away from where it is playing and straight back is
					// usually the octave of a note whose fundamental was missed: put it back
					const ev = (n, midi) => { const p = midi - P0; if (p < 0 || p >= NP) return 0; let v = 0; for (let s = n.s0; s < Math.min(lastStep, n.s1); s++) v = Math.max(v, E[s * NP + p]); return v; };
					const fixed = list.map((n, i) => {
						const near = list.slice(Math.max(0, i - 8), i + 9).filter(m => m != n).map(m => m.midi).sort((a, b) => a - b);
						const med = near[near.length >> 1];
						for (const dir of [-12, 12]) {
							const to = n.midi + dir;
							if (Math.abs(n.midi - med) > 8 && Math.abs(to - med) < Math.abs(n.midi - med) - 6 && ev(n, to) >= 0.2 * ev(n, n.midi)) return Object.assign({}, n, { midi: to });
						}
						return n;
					});
					list = fixed.sort((a, b) => a.s0 - b.s0 || a.midi - b.midi);
				}
				// fragments of one held note (pumping, tremolo) become one note again
				const merged = [];
				for (const n of list) {
					const prev = merged.filter(m => m.midi == n.midi && m.s1 >= n.s0 - 1 && m.s0 <= n.s0).pop();
					if (prev && (n.onset < 0.3 || n.s0 < prev.s1)) { prev.s1 = Math.max(prev.s1, n.s1); prev.vel = Math.max(prev.vel, n.vel); continue; }
					merged.push(n);
				}
				list = merged;
				// confidence: what the parts sound like when they are wrong (measured on rendered songs):
				// quiet melody notes, one-step bass blips, and short chord notes struck on their own
				const q = 1 - 0.8 * (sens - 0.5);
				if (role == "lead") list = list.filter(n => n.vel >= LEAD_VEL * q || n.s1 - n.s0 >= 4);
				else if (role == "bass") list = list.filter(n => n.s1 - n.s0 > 1 || n.vel >= BASS_VEL * q);
				else if (role == "chords") {
					const at = new Map();
					for (const n of list) for (const d of [-1, 0, 1]) at.set(n.s0 + d, (at.get(n.s0 + d) || 0) + 1);
					list = list.filter(n => n.s1 - n.s0 > CH_SHORT || at.get(n.s0) >= 3 || n.vel >= 0.95);
				}
				// a single voice: a note ends where the next one starts; two at once keep the louder
				if (mono) {
					const out = [];
					for (const n of list) {
						const prev = out[out.length - 1];
						if (prev && n.s0 <= prev.s0) { if (n.vel > prev.vel) out[out.length - 1] = n; continue; }
						if (prev && prev.s1 > n.s0) prev.s1 = n.s0;
						out.push(n);
					}
					list = out;
				}
				return list;
			}
			// Missed notes: music repeats, so a note heard in a bar and in the bar a phrase later is
			// expected in the bars between too - it is added where the audio has that pitch there.
			function complete(list, role) {
				if (list.length < 6) return list;
				const barOf = (s) => Math.floor((s - firstStep) / barSteps), posOf = (s) => ((s - firstStep) % barSteps + barSteps) % barSteps;
				const bars = new Map();
				for (const n of list) { const b = barOf(n.s0); if (!bars.has(b)) bars.set(b, new Set()); bars.get(b).add(posOf(n.s0) * 200 + n.midi); }
				const keys = Array.from(bars.keys());
				let best = null;
				for (const P of [1, 2, 4, 8]) {
					let sim = 0, cnt = 0;
					for (const b of keys) { const o = bars.get(b + P); if (!o) continue; const a = bars.get(b); let inter = 0; for (const x of a) if (o.has(x)) inter++; sim += inter / (a.size + o.size - inter); cnt++; }
					if (cnt >= 2 && (!best || sim / cnt > best.sim + 0.05)) best = { P, sim: sim / cnt };
				}
				if (!best || best.sim < 0.45) return list;
				const norm = pct(E, 0.97) || 1;
				const have = new Set(list.map(n => n.s0 * 200 + n.midi));
				const added = [];
				for (const n of list) {
					for (const dir of [-1, 1]) {
						const s0 = n.s0 + dir * best.P * barSteps;
						if (s0 < 0 || s0 >= lastStep || have.has(s0 * 200 + n.midi)) continue;
						// the other bar must be like this one, and the pitch must be sounding there
						const a = bars.get(barOf(n.s0)), o = bars.get(barOf(s0));
						if (!o || !a) continue;
						let inter = 0; for (const x of a) if (o.has(x)) inter++;
						if (inter / (a.size + o.size - inter) < 0.35) continue;
						const p = n.midi - P0;
						if (p < 0 || p >= NP) continue;
						let ev = 0;
						for (let s = s0; s < Math.min(lastStep, s0 + n.s1 - n.s0); s++) ev = Math.max(ev, E[s * NP + p]);
						if (ev < 0.18 * norm) continue;
						// a held note of the same pitch already covers it
						if (list.some(m => m.midi == n.midi && m.s0 < s0 && m.s1 > s0)) continue;
						have.add(s0 * 200 + n.midi);
						added.push({ midi: n.midi, s0, s1: s0 + (n.s1 - n.s0), vel: n.vel * 0.9, onset: 0, filled: true });
					}
				}
				return list.concat(added).sort((a, b) => a.s0 - b.s0 || a.midi - b.midi);
			}
			const out = (list, role) => list.filter(n => n.s1 > n.s0 && n.s0 < lastStep).map(n => ({ t: stepT[n.s0], dur: stepT[Math.min(nSteps, n.s1)] - stepT[n.s0], midi: n.midi, vel: n.vel, bend: n.bend, role, filled: n.filled }));
			let bassL = complete(part("bass", true), "bass"), leadL = complete(part("lead", true), "lead");
			// completing can put two bass notes on one step: keep one voice
			const monoAgain = (list) => { const res = []; for (const n of list) { const prev = res[res.length - 1]; if (prev && n.s0 == prev.s0) { if (!n.filled && prev.filled) res[res.length - 1] = n; continue; } if (prev && prev.s1 > n.s0) prev.s1 = n.s0; res.push(n); } return res; };
			const bass = out(monoAgain(bassL), "bass"), lead = out(monoAgain(leadL), "lead");
			const chordNotes = out(part("chords", false), "chords");
			// ---- drums: on the grid, one hit per drum per step, and the repeating pattern kept whole
			const kinds = {};
			for (const hh of hits) {
				const s = stepOf(hh.t);
				const list = kinds[hh.kind] || (kinds[hh.kind] = new Map());
				const prev = list.get(s);
				if (!prev || prev.vel < hh.vel) list.set(s, { t: stepT[s], kind: hh.kind, vel: hh.vel });
			}
			const drumsOut = [];
			for (const [kind, list] of Object.entries(kinds)) {
				const steps = Array.from(list.keys());
				const firstBar = Math.floor((Math.min(...steps) - firstStep) / barSteps), lastBar = Math.floor((Math.max(...steps) - firstStep) / barSteps);
				const barsN = lastBar - firstBar + 1;
				if (barsN >= 4) {
					const count = new Float32Array(barSteps), perBar = new Int32Array(barsN);
					for (const s of steps) { const rel = s - firstStep, bar = Math.floor(rel / barSteps) - firstBar; count[((rel % barSteps) + barSteps) % barSteps]++; perBar[bar]++; }
					const usual = Array.from(perBar).sort((a, b) => a - b)[barsN >> 1];
					const vels = Array.from(list.values()).map(x => x.vel).sort((a, b) => a - b), medVel = vels[vels.length >> 1];
					for (let b = 0; b < barsN; b++) {
						if (perBar[b] < 0.5 * usual) continue; // a break or a fill: leave it alone
						for (let j = 0; j < barSteps; j++) {
							const s = firstStep + (firstBar + b) * barSteps + j;
							if (s < 0 || s >= lastStep) continue;
							const share = count[j] / barsN;
							if (share >= 0.75 && !list.has(s)) list.set(s, { t: stepT[s], kind, vel: medVel, filled: true });
							else if (share <= 0.12 && list.has(s) && list.get(s).vel < 0.6 * medVel) list.delete(s);
						}
					}
				}
				for (const v of list.values()) drumsOut.push(v);
			}
			drumsOut.sort((a, b) => a.t - b.t);
			const r4 = (v) => +v.toFixed(4);
			const clean = (list) => list.filter(n => n.dur > 0).map(n => ({ t: r4(n.t), dur: r4(n.dur), midi: n.midi, vel: +Math.min(1, n.vel).toFixed(3), role: n.role, bend: n.bend }));
			return { grid: S, bass: clean(bass), lead: clean(lead), chords: clean(chordNotes), drums: drumsOut.map(d => ({ t: r4(d.t), kind: d.kind, vel: +d.vel.toFixed(3) })) };
		}

		// ---------------------------------------------------------------- instruments
		// Measures how each part sounds so it can be rebuilt as a playable instrument (the Replica
		// plugin): for pitched parts, the strength (and phase) of every harmonic over the first two
		// seconds of a note, the level curve, release, breath/noise and vibrato; for each drum, a
		// pitched body that sweeps and decays plus the noise in 32 bands, each with its own decay.
		// Overlapping notes of other parts are masked out harmonic by harmonic, and many notes are
		// combined with medians, so what remains is the instrument rather than the mix.
		const TIMBRE_TIMES = [0.015, 0.04, 0.08, 0.14, 0.22, 0.35, 0.55, 0.85, 1.3, 2.0];
		const TIMBRE_H = 48;
		const wquantile = (vals, ws, q) => {
			const idx = Array.from(vals.keys()).sort((a, b) => vals[a] - vals[b]);
			let total = 0;
			for (const i of idx) total += ws[i];
			let acc = 0;
			for (const i of idx) { acc += ws[i]; if (acc >= total * q) return vals[i]; }
			return vals[idx[idx.length - 1]];
		};
		const wmedian = (vals, ws) => wquantile(vals, ws, 0.5);
		function extractInstruments(x, notes, hits, tuning, progress) {
			const out = {};
			for (const role of ["bass", "lead", "chords"]) {
				try { const t = extractTone(x, notes, role, hits, tuning); if (t) out[role] = t; }
				catch (error) { if (typeof console != "undefined") console.warn("AudioMidi: measuring", role, error); }
			}
			try { const d = extractDrums(x, hits); if (d && d.pads.length) out.drums = d; }
			catch (error) { if (typeof console != "undefined") console.warn("AudioMidi: measuring drums", error); }
			return out;
		}
		function extractTone(x, notes, role, hits, tuning) {
			const F = TIMBRE_TIMES.length, H = TIMBRE_H, nyq = SR / 2 - 300;
			const tune = (m) => midiHz(m + tuning / 100);
			let cands = notes.filter(n => n.role == role && n.dur >= 0.09 && n.vel >= 0.25);
			if (cands.length < 3) return null;
			// the clearest notes: long, loud, and not hidden under many others
			const busy = (n) => notes.filter(o => o != n && o.t < n.t + Math.min(n.dur, 0.5) && o.t + o.dur > n.t).length;
			cands = cands.map(n => ({ n, score: n.vel * Math.min(1, n.dur / 0.6) / (1 + 0.25 * busy(n)) })).sort((a, b) => b.score - a.score).slice(0, 64).map(c => c.n);
			const mids = cands.map(n => n.midi).sort((a, b) => a - b);
			const lo = mids[0], hi = mids[mids.length - 1], split = mids[mids.length >> 1];
			const zonesN = hi - lo >= 15 && cands.filter(n => n.midi < split).length >= 6 && cands.filter(n => n.midi >= split).length >= 6 ? 2 : 1;
			const hitTimes = hits.map(h => h.t);
			const zones = [];
			let relData = [];
			for (let z = 0; z < zonesN; z++) {
				const list = zonesN == 1 ? cands : cands.filter(n => z == 0 ? n.midi < split : n.midi >= split);
				// measurements: per note, frame and harmonic, the level in dB and how much to trust it
				const V = [], W = [], NOTE = [], FR = [], HA = [];
				const phX = new Float64Array(H), phY = new Float64Array(H);
				const noiseVals = Array.from({ length: F * 4 }, () => []);
				const vib = [];
				list.forEach((n, ni) => {
					const f0n = tune(n.midi);
					// long enough to tell the harmonics of neighbouring notes apart
					const N = f0n < 90 ? 4096 : 2048;
					const t = fftTables(N), binHz = SR / N;
					for (let j = 0; j < F; j++) {
						const T = TIMBRE_TIMES[j];
						// the window must sit inside the note, or it hears the release too
						if (j > 0 && T + 0.25 * N / SR > n.dur + 0.01) break;
						const center = Math.round((n.t + Math.max(T, 0.42 * N / SR)) * SR);
						if (center + N / 2 >= x.length) break;
						const at = center / SR;
						const others = notes.filter(o => o != n && o.t - 0.03 < at + 0.5 * N / SR && o.t + o.dur + 0.12 > at - 0.5 * N / SR);
						const drumNear = hitTimes.some(h => Math.abs(h - at) < 0.5 * N / SR + 0.02);
						frameFFT(x, center, t);
						const re = t.re, im = t.im;
						// re/im hold x*w (real part of the combined transform) mixed with x*dw; take the
						// plain windowed spectrum: X = (Z[k] + conj(Z[N-k])) / 2
						const mag = (k) => { const a = re[k] + re[N - k], b = im[k] - im[N - k]; return 0.5 * Math.hypot(a, b); };
						const cplx = (k) => [0.5 * (re[k] + re[N - k]), 0.5 * (im[k] - im[N - k])];
						const peakNear = (hz, width) => {
							const k0 = Math.max(1, Math.floor((hz - width) / binHz)), k1 = Math.min(N / 2 - 2, Math.ceil((hz + width) / binHz));
							let best = -1, bv = 0;
							for (let k = k0; k <= k1; k++) { const v = mag(k); if (v > bv) { bv = v; best = k; } }
							if (best < 1) return null;
							const a = Math.log(mag(best - 1) + 1e-12), b = Math.log(bv + 1e-12), c = Math.log(mag(best + 1) + 1e-12);
							const d = a - 2 * b + c, off = d < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / d)) : 0;
							return { k: best, hz: (best + off) * binHz, amp: Math.exp(b - 0.25 * (a - c) * off) / (N * 0.25) };
						};
						// the note's real pitch in this frame, from its strongest low harmonics
						let f0 = f0n, sw = 0, sf = 0;
						for (let h = 1; h <= 4; h++) {
							if (h * f0n > nyq) break;
							const p = peakNear(h * f0n, Math.max(1.5 * binHz, 0.03 * h * f0n));
							if (p) { sw += p.amp; sf += p.amp * p.hz / h; }
						}
						if (sw > 0) f0 = sf / sw;
						// how close the nearest harmonic of another sounding note comes (in bins)
						const nearest = (hz) => {
							let best = 1e9;
							for (const o of others) {
								const fo = tune(o.midi), k = Math.round(hz / fo);
								if (k >= 1) best = Math.min(best, (Math.abs(hz - k * fo) - 0.004 * hz) / binHz);
							}
							return best;
						};
						const masked = (hz) => nearest(hz) < 2;
						let harmE = [0, 0, 0, 0], interE = [0, 0, 0, 0], clean = 0;
						const band = (hz) => hz < 1000 ? 0 : hz < 3000 ? 1 : hz < 6000 ? 2 : 3;
						let p1 = null;
						for (let h = 1; h <= H; h++) {
							const hz = h * f0;
							if (hz > nyq) break;
							if (masked(hz)) continue;
							const p = peakNear(hz, Math.max(1.2 * binHz, 0.2 * f0));
							if (!p) continue;
							let w = drumNear ? (hz > 2000 ? 0.15 : 0.4) : 1;
							w *= Math.min(1, n.vel + 0.2);
							if (nearest(hz) < 4.5) w *= 0.5; // a neighbour's skirt adds to it
							V.push(20 * Math.log10(p.amp + 1e-9)); W.push(w); NOTE.push(ni); FR.push(j); HA.push(h);
							// phase relative to the fundamental (waveform shape), from the steady part
							const [cr, ci] = cplx(p.k);
							const ph = Math.atan2(ci, cr) + Math.PI * p.k;
							if (h == 1) p1 = ph;
							else if (p1 != null && j >= 3 && w >= 0.4) { const rel = ph - h * p1; phX[h - 1] += Math.cos(rel) * p.amp; phY[h - 1] += Math.sin(rel) * p.amp; }
							if (h == 1) { phX[0] += p.amp; }
							harmE[band(hz)] += p.amp * p.amp;
							// what lies between this harmonic and the next is breath, bow or noise
							const mid = hz + 0.5 * f0;
							if (mid < nyq && !masked(mid) && !masked(hz + f0)) {
								const k0 = Math.round((mid - 0.12 * f0) / binHz), k1 = Math.round((mid + 0.12 * f0) / binHz);
								let e = 0, c = 0;
								for (let k = Math.max(1, k0); k <= Math.min(N / 2 - 1, k1); k++) { const m = mag(k) / (N * 0.25); e += m * m; c++; }
								if (c) { interE[band(mid)] += e / c * (f0 / binHz) / 1.5; clean++; }
							}
						}
						if (!drumNear && clean >= 3) {
							const tot = harmE.reduce((a, b) => a + b, 0) || 1e-12;
							for (let b = 0; b < 4; b++) if (harmE[b] > 0 || interE[b] > 0) noiseVals[j * 4 + b].push(10 * Math.log10((interE[b] + 1e-12) / tot));
						}
					}
					// vibrato: the pitch of a long note, wobbling around its centre
					if (role == "lead" && n.dur >= 0.6) {
						const N2 = 2048, t2 = fftTables(N2), binHz2 = SR / N2, curve = [];
						const hSel = Math.max(1, Math.min(6, Math.floor(1500 / f0n)));
						for (let tt = n.t + 0.12; tt < n.t + n.dur - 0.05 && curve.length < 160; tt += 0.02) {
							const c = Math.round(tt * SR);
							if (c + N2 / 2 >= x.length) break;
							frameFFT(x, c, t2);
							const hz = hSel * f0n, k0 = Math.max(1, Math.floor(hz * 0.96 / binHz2)), k1 = Math.ceil(hz * 1.04 / binHz2);
							let best = k0, bv = 0;
							for (let k = k0; k <= k1; k++) { const v = Math.hypot(t2.re[k] + t2.re[N2 - k], t2.im[k] - t2.im[N2 - k]); if (v > bv) { bv = v; best = k; } }
							const m = (k) => Math.log(1e-12 + Math.hypot(t2.re[k] + t2.re[N2 - k], t2.im[k] - t2.im[N2 - k]));
							const a = m(best - 1), b = m(best), cc = m(best + 1), d = a - 2 * b + cc;
							const off = d < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - cc) / d)) : 0;
							curve.push(1200 * Math.log2((best + off) * binHz2 / hz));
						}
						if (curve.length >= 20) {
							const sm = curve.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - 6); k <= Math.min(curve.length - 1, i + 6); k++) { s += curve[k]; c++; } return curve[i] - s / c; });
							let cross = 0, rms = 0;
							for (let i = 1; i < sm.length; i++) { if ((sm[i] > 0) != (sm[i - 1] > 0)) cross++; rms += sm[i] * sm[i]; }
							rms = Math.sqrt(rms / sm.length);
							const rate = cross / 2 / (sm.length * 0.02);
							if (rms > 6 && rate >= 3 && rate <= 9) vib.push({ rate, depth: rms * Math.SQRT2 });
							else vib.push({ rate: 0, depth: 0 });
						}
					}
				});
				if (V.length < 20) continue;
				// fit level(note) + shape(frame, harmonic) robustly: every note is louder or softer,
				// the instrument is the same
				const g = new Float64Array(list.length);
				for (let i = 0; i < V.length; i++) if (HA[i] <= 3 && FR[i] <= 3) g[NOTE[i]] = Math.max(g[NOTE[i]] || -200, V[i]);
				for (let i = 0; i < list.length; i++) if (!g[i]) g[i] = -40;
				const S = new Float64Array(F * H).fill(NaN), SW = new Float64Array(F * H);
				for (let iter = 0; iter < 4; iter++) {
					const cellV = Array.from({ length: F * H }, () => []), cellW = Array.from({ length: F * H }, () => []);
					for (let i = 0; i < V.length; i++) { const c = FR[i] * H + HA[i] - 1; cellV[c].push(V[i] - g[NOTE[i]]); cellW[c].push(W[i]); }
					for (let c = 0; c < F * H; c++) {
						SW[c] = cellW[c].reduce((a, b) => a + b, 0);
						// other sounds only ever add energy, so the lower middle is the instrument itself
						S[c] = cellV[c].length ? wquantile(cellV[c], cellW[c], 0.35) : NaN;
					}
					const gs = Array.from({ length: list.length }, () => []), gw = Array.from({ length: list.length }, () => []);
					for (let i = 0; i < V.length; i++) { const c = FR[i] * H + HA[i] - 1; if (!isNaN(S[c])) { gs[NOTE[i]].push(V[i] - S[c]); gw[NOTE[i]].push(W[i]); } }
					for (let k = 0; k < list.length; k++) if (gs[k].length) g[k] = wmedian(gs[k], gw[k]);
				}
				// frames: how many notes reached them
				// how many notes were heard at each frame (a frame few notes reach says little)
				const reachSets = Array.from({ length: F }, () => new Set());
				for (let i = 0; i < V.length; i++) reachSets[FR[i]].add(NOTE[i]);
				const reach = reachSets.map(r => r.size), reachMin = Math.max(2, Math.ceil(0.15 * Math.max(...reach)));
				const levels = new Float64Array(F).fill(NaN);
				// the level of a frame comes from the harmonics measured in most frames, so that
				// filling in different gaps does not make one frame louder than the next
				const seen = new Int32Array(H);
				for (let j = 0; j < F; j++) if (reach[j] >= reachMin) for (let h = 0; h < H; h++) if (!isNaN(S[j * H + h]) && SW[j * H + h] >= 0.5) seen[h]++;
				const validFrames = reach.filter(r => r >= reachMin).length;
				const common = [];
				for (let h = 0; h < H; h++) if (seen[h] >= Math.max(1, 0.6 * validFrames)) common.push(h);
				let lastGood = -1, fullTop = -1e9;
				for (let j = 0; j < F; j++) {
					const row = S.subarray(j * H, j * H + H), rw = SW.subarray(j * H, j * H + H);
					let known = 0;
					for (let h = 0; h < H; h++) if (!isNaN(row[h]) && rw[h] >= 0.5) known++; else row[h] = NaN;
					if (reach[j] < reachMin || known < 2) continue;
					// fill the gaps between measured harmonics (log-linear), and above the last one with its slope
					const idx = []; for (let h = 0; h < H; h++) if (!isNaN(row[h])) idx.push(h);
					for (let h = 0; h < H; h++) {
						if (!isNaN(row[h])) continue;
						const a = idx.filter(i => i < h).pop(), b = idx.find(i => i > h);
						if (a != undefined && b != undefined) row[h] = row[a] + (row[b] - row[a]) * (Math.log(h + 1) - Math.log(a + 1)) / (Math.log(b + 1) - Math.log(a + 1));
					}
					const top = idx.slice(-6);
					let slope = -12;
					if (top.length >= 3) {
						let sx = 0, sy = 0, sxx = 0, sxy = 0;
						for (const h of top) { const lx = Math.log2(h + 1); sx += lx; sy += row[h]; sxx += lx * lx; sxy += lx * row[h]; }
						const den = top.length * sxx - sx * sx;
						if (Math.abs(den) > 1e-9) slope = (top.length * sxy - sx * sy) / den;
					}
					slope = Math.max(-30, Math.min(-4, slope));
					const last = idx[idx.length - 1];
					for (let h = last + 1; h < H; h++) row[h] = row[last] + slope * Math.log2((h + 1) / (last + 1));
					for (let h = 0; h < idx[0]; h++) row[h] = row[idx[0]] - 6;
					let e = 0, ec = 0;
					for (const h of common) ec += Math.pow(10, row[h] / 10);
					for (let h = 0; h < H; h++) e += Math.pow(10, row[h] / 10);
					levels[j] = 10 * Math.log10(common.length >= 2 ? ec : e);
					fullTop = Math.max(fullTop, 10 * Math.log10(e));
					lastGood = j;
				}
				if (lastGood < 0) continue;
				// one odd frame (a hit, a missed note) is not the instrument's shape over time
				{
					const lv0 = Array.from(levels);
					for (let j = 1; j < F - 1; j++) if (!isNaN(lv0[j - 1]) && !isNaN(lv0[j]) && !isNaN(lv0[j + 1])) levels[j] = [lv0[j - 1], lv0[j], lv0[j + 1]].sort((a, b) => a - b)[1];
				}
				// frames no note reached repeat the last one measured
				for (let j = 0; j < F; j++) if (isNaN(levels[j])) {
					const from = j > lastGood ? lastGood : (() => { for (let k = j + 1; k < F; k++) if (!isNaN(levels[k])) return k; return lastGood; })();
					S.copyWithin(j * H, from * H, from * H + H);
					levels[j] = levels[from];
					if (j > lastGood) levels[j] = NaN;
				}
				const phases = new Array(H).fill(null);
				for (let h = 0; h < H; h++) {
					const r = Math.hypot(phX[h], phY[h]);
					let tot = 0;
					// how consistent the phase was: the length of the mean vector against the sum of lengths
					for (let i = 0; i < V.length; i++) if (HA[i] == h + 1 && FR[i] >= 3) tot += Math.pow(10, V[i] / 20);
					if (h == 0) phases[h] = 0;
					else if (tot > 0 && r / tot > 0.45) phases[h] = Math.atan2(phY[h], phX[h]);
				}
				const shape = [];
				for (let j = 0; j < F; j++) for (let h = 0; h < H; h++) shape.push(+(S[j * H + h] - (isNaN(levels[j]) ? levels[lastGood] : levels[j])).toFixed(1));
				// a typical note's level (notes the analysis could not hear clearly do not count)
				const heard = new Set(NOTE);
				const gains = Array.from(g).filter((_, k) => heard.has(k)).sort((a, b) => a - b);
				zones.push({ midi: Math.round(list.reduce((s, n) => s + n.midi, 0) / list.length), shape, phases: phases.map(p => p == null ? null : +p.toFixed(3)), levels: Array.from(levels), lastGood, notes: list.length, noiseVals, vib, loud: gains[gains.length >> 1] + fullTop });
				relData.push(list);
			}
			if (!zones.length) return null;
			// one level curve for the instrument (the zones share it)
			const lv = new Float64Array(F);
			for (let j = 0; j < F; j++) {
				const vals = zones.map(z => z.levels[j]).filter(v => !isNaN(v));
				lv[j] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
			}
			let top = -1e9, lastJ = 0;
			for (let j = 0; j < F; j++) if (!isNaN(lv[j])) { top = Math.max(top, lv[j]); lastJ = j; }
			// after the last frame a note keeps fading at the rate it was fading
			let tail = 0;
			if (lastJ >= 2) tail = Math.max(-60, Math.min(0, (lv[lastJ] - lv[lastJ - 2]) / (TIMBRE_TIMES[lastJ] - TIMBRE_TIMES[lastJ - 2])));
			for (let j = 0; j < F; j++) if (isNaN(lv[j])) lv[j] = lv[lastJ] + tail * (TIMBRE_TIMES[j] - TIMBRE_TIMES[lastJ]);
			// release: how fast a note dies after it ends (notes with nothing after them)
			const rel = [];
			for (const n of relData.flat()) {
				const after = notes.some(o => o != n && o.role == role && o.t > n.t + n.dur - 0.05 && o.t < n.t + n.dur + 0.4);
				if (after || n.dur < 0.15 || hitTimes.some(h => h > n.t + n.dur - 0.08 && h < n.t + n.dur + 0.16)) continue;
				const f0 = tune(n.midi), N = 2048, t = fftTables(N), binHz = SR / N;
				const level = (sec) => {
					const c = Math.round(sec * SR);
					if (c + N / 2 >= x.length) return null;
					const others = notes.filter(o => o != n && o.t < sec + 0.05 && o.t + o.dur + 0.15 > sec - 0.05);
					frameFFT(x, c, t);
					let e = 0, cnt = 0;
					for (let h = 1; h <= 10 && h * f0 < 5000; h++) {
						const hz = h * f0;
						if (others.some(o => { const fo = tune(o.midi), k = Math.round(hz / fo); return k >= 1 && Math.abs(hz - k * fo) < 2 * binHz + 0.004 * hz; })) continue;
						const k = Math.round(hz / binHz);
						let m = 0;
						for (let d = -1; d <= 1; d++) m = Math.max(m, Math.hypot(t.re[k + d] + t.re[N - k - d], t.im[k + d] - t.im[N - k - d]));
						e += m * m; cnt++;
					}
					return cnt >= 2 ? 10 * Math.log10(e / cnt + 1e-20) : null;
				};
				const end = n.t + n.dur;
				const a = level(end - 0.03), b = level(end + 0.1);
				if (a == null || b == null) continue;
				rel.push(Math.max(0.02, Math.min(2.5, 0.13 * 40 / Math.max(1, a - b))));
			}
			const median = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
			const noise = [];
			for (let j = 0; j < F; j++) for (let b = 0; b < 4; b++) {
				const vals = zones.flatMap(z => z.noiseVals[j * 4 + b]);
				noise.push(vals.length >= 3 ? +Math.max(-60, Math.min(-8, median(vals) - 4)).toFixed(1) : -60);
			}
			const vibs = zones.flatMap(z => z.vib);
			const withVib = vibs.filter(v => v.depth > 0);
			const vibrato = withVib.length >= Math.max(2, vibs.length * 0.4) ? { rate: +median(withVib.map(v => v.rate)).toFixed(2), depth: +median(withVib.map(v => v.depth)).toFixed(1) } : { rate: 5.5, depth: 0 };
			const roleNotes = notes.filter(n => n.role == role);
			return {
				kind: "tone", role, times: TIMBRE_TIMES.slice(), H,
				levels: Array.from(lv, v => +(v - top).toFixed(1)), tail: +tail.toFixed(1),
				// how loud a typical note is in the recording (RMS, dB), to keep the balance between parts
				loudness: +(zones.reduce((s, z) => s + z.loud, 0) / zones.length - 3).toFixed(1),
				release: rel.length >= 3 ? +median(rel).toFixed(3) : (role == "chords" ? 0.35 : 0.12),
				noise, vibrato,
				zones: zones.map(z => ({ midi: z.midi, shape: z.shape, phases: z.phases, notes: z.notes })),
				range: [Math.min(...roleNotes.map(n => n.midi)), Math.max(...roleNotes.map(n => n.midi))],
				glide: roleNotes.filter(n => n.bend).length / Math.max(1, roleNotes.length),
				notes: zones.reduce((s, z) => s + z.notes, 0),
			};
		}
		// 32 bands, 30 Hz .. 11 kHz, for the drum models
		const DRUM_BANDS = 32;
		const drumBandHz = (b) => 30 * Math.pow(11000 / 30, (b + 0.5) / DRUM_BANDS);
		function extractDrums(x, hits) {
			const pads = [];
			const N = 512, t = fftTables(N), binHz = SR / N, hop = 64, LEN = 0.7, frames = Math.round(LEN * SR / hop);
			const bandOf = new Int16Array(N / 2).fill(-1);
			for (let k = 1; k < N / 2; k++) { const hz = k * binHz; const b = Math.floor(DRUM_BANDS * Math.log(hz / 30) / Math.log(11000 / 30)); if (b >= 0 && b < DRUM_BANDS) bandOf[k] = b; }
			const bandEnergies = (center) => {
				frameFFT(x, center, t);
				const e = new Float64Array(DRUM_BANDS);
				for (let k = 1; k < N / 2; k++) { const b = bandOf[k]; if (b < 0) continue; const a = t.re[k] + t.re[N - k], c = t.im[k] - t.im[N - k]; e[b] += 0.25 * (a * a + c * c); }
				return e;
			};
			for (const kind of DRUMS) {
				let list = hits.filter(h => h.kind == kind);
				if (list.length < 2) continue;
				// cleanest hits: loud, and not right after another drum
				list = list.map(h => ({ h, score: h.vel - (hits.some(o => o != h && o.t < h.t && o.t > h.t - 0.06) ? 0.5 : 0) })).sort((a, b) => b.score - a.score).slice(0, 40).map(c => c.h);
				const per = [];
				for (const h of list) {
					const s = Math.round(h.t * SR);
					if (s + LEN * SR + N >= x.length || s < N) continue;
					// what was already sounding just before the hit is not the drum
					const bg = new Float64Array(DRUM_BANDS);
					for (let k = 0; k < 4; k++) { const e = bandEnergies(s - N / 2 - k * hop - 32); for (let b = 0; b < DRUM_BANDS; b++) bg[b] += e[b] / 4; }
					const until = hits.filter(o => o.t > h.t + 0.03).reduce((m, o) => Math.min(m, o.t), 1e9) - h.t;
					const E = new Float64Array(frames * DRUM_BANDS).fill(NaN);
					for (let f = 0; f < frames; f++) {
						const sec = f * hop / SR;
						if (sec > until + 0.01 && f > 4) break; // the next hit starts: stop listening
						const e = bandEnergies(s + f * hop - N / 2 + N / 2 - 64);
						for (let b = 0; b < DRUM_BANDS; b++) E[f * DRUM_BANDS + b] = Math.max(0, e[b] - bg[b]);
					}
					per.push(E);
				}
				if (per.length < 2) continue;
				const M = new Float64Array(frames * DRUM_BANDS);
				for (let i = 0; i < M.length; i++) {
					const vals = per.map(E => E[i]).filter(v => !isNaN(v));
					M[i] = vals.length >= Math.max(2, per.length * 0.3) ? vals.sort((a, b) => a - b)[vals.length >> 1] : 0;
				}
				// the body: a low peak that sweeps down (kicks, toms, 808s)
				let tone = null;
				if (/kick|tom/.test(kind)) {
					const N2 = 1024, t2 = fftTables(N2), bin2 = SR / N2;
					const fr = [], amp = [];
					for (let f = 0; f < 24; f++) {
						const freqs = [], amps = [];
						for (const h of list) {
							const c = Math.round(h.t * SR) + N2 / 2 - 128 + f * 128;
							if (c + N2 / 2 >= x.length) continue;
							frameFFT(x, c, t2);
							let best = 0, bv = 0;
							for (let k = Math.max(1, Math.floor(30 / bin2)); k <= Math.ceil(600 / bin2); k++) { const v = Math.hypot(t2.re[k] + t2.re[N2 - k], t2.im[k] - t2.im[N2 - k]); if (v > bv) { bv = v; best = k; } }
							const m = (k) => Math.log(1e-12 + Math.hypot(t2.re[k] + t2.re[N2 - k], t2.im[k] - t2.im[N2 - k]));
							const a = m(best - 1), b = m(best), cc = m(best + 1), d = a - 2 * b + cc;
							const off = d < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - cc) / d)) : 0;
							freqs.push((best + off) * bin2); amps.push(0.5 * bv / (N2 * 0.25));
						}
						if (freqs.length < 2) break;
						fr.push(freqs.sort((a, b) => a - b)[freqs.length >> 1]);
						amp.push(amps.sort((a, b) => a - b)[amps.length >> 1]);
					}
					if (fr.length >= 6) {
						const times = fr.map((_, f) => (N2 / 2 - 128 + f * 128) / SR);
						const peakA = Math.max(...amp);
						let endAt = amp.length - 1;
						for (let f = amp.indexOf(peakA); f < amp.length; f++) if (amp[f] < peakA * 0.03) { endAt = f; break; }
						const f1 = fr.slice(Math.max(1, Math.floor(endAt * 0.6)), endAt + 1).sort((a, b) => a - b)[0] || fr[fr.length - 1];
						const fa = fr[0];
						let tau = 0.03;
						if (fa > f1 * 1.05) {
							const target = f1 + (fa - f1) / Math.E;
							for (let f = 1; f < fr.length; f++) if (fr[f] <= target) { tau = Math.max(0.004, times[f] - times[0]); break; }
						}
						const f0 = Math.min(Math.max(fa, f1), f1 + (fa - f1) * Math.exp(times[0] / tau), 900);
						// decay: from the peak to -40 dB
						let decay = times[endAt] - times[amp.indexOf(peakA)];
						const i40 = amp.findIndex((v, i) => i > amp.indexOf(peakA) && v < peakA * 0.01);
						if (i40 > 0) decay = times[i40] - times[amp.indexOf(peakA)];
						else if (endAt > 2) decay = (times[endAt] - times[amp.indexOf(peakA)]) * 40 / Math.max(1, 20 * Math.log10(peakA / Math.max(1e-9, amp[endAt])));
						tone = { f0: +f0.toFixed(1), f1: +f1.toFixed(1), sweep: +tau.toFixed(4), decay: +Math.max(0.03, Math.min(3, decay)).toFixed(3), amp: peakA };
					}
				}
				// the noise: per band, its peak and how fast it fades
				let peakE = 0, totalE = 0;
				for (let i = 0; i < M.length; i++) peakE = Math.max(peakE, M[i]);
				for (let f = 0; f < frames; f++) { let e = 0; for (let b = 0; b < DRUM_BANDS; b++) e += M[f * DRUM_BANDS + b]; totalE = Math.max(totalE, e); }
				if (peakE <= 0) continue;
				// as RMS: a band with energy E (one-sided sum of |X|^2, Hann window of N) is noise of RMS sqrt(E / (0.1875 N^2))
				const rmsOf = (e) => Math.sqrt(e / (0.1875 * N * N));
				const bands = [], decays = [], attacks = [];
				let lastF = 0;
				for (let b = 0; b < DRUM_BANDS; b++) {
					let pk = 0, pf = 0;
					for (let f = 0; f < frames; f++) if (M[f * DRUM_BANDS + b] > pk) { pk = M[f * DRUM_BANDS + b]; pf = f; }
					if (tone && Math.abs(Math.log2(drumBandHz(b) / Math.max(30, tone.f1))) < 0.7) pk *= 0.35; // the body carries this band
					bands.push(pk > 0 ? +Math.max(-70, 10 * Math.log10(pk / peakE)).toFixed(1) : -70);
					// fade: fit the dB slope from the peak down to -30 dB
					let end = pf;
					for (let f = pf; f < frames; f++) { const v = M[f * DRUM_BANDS + b]; if (v < pk * 0.001) break; end = f; }
					lastF = Math.max(lastF, end);
					const span = (end - pf) * hop / SR;
					const drop = 10 * Math.log10(pk / Math.max(1e-20, M[end * DRUM_BANDS + b] || pk * 0.001));
					decays.push(+Math.max(0.005, Math.min(3, span > 0 && drop > 1 ? span * 60 / drop : 0.05)).toFixed(4));
					attacks.push(+(pf * hop / SR).toFixed(4));
				}
				const toneRms = tone ? tone.amp / Math.SQRT2 : 0;
				if (tone) { tone.level = +Math.max(-40, Math.min(24, 20 * Math.log10(Math.max(1e-9, toneRms) / rmsOf(peakE)))).toFixed(1); delete tone.amp; }
				const level = 10 * Math.log10(rmsOf(totalE) ** 2 + toneRms * toneRms);
				pads.push({ kind, hits: per.length, level, tone, bands, decays, attacks, length: +Math.min(LEN, Math.max(0.08, lastF * hop / SR + 0.05, tone ? tone.decay * 1.2 : 0)).toFixed(3) });
			}
			// loudness relative to the loudest drum
			const top = Math.max(...pads.map(p => p.level), -200);
			for (const p of pads) {
				p.gain = +(p.level - top).toFixed(1);
				delete p.level;
			}
			return { kind: "drums", pads, loudness: +top.toFixed(1) };
		}


		// ---------------------------------------------------------------- voice
		// A hummed, sung or beatboxed recording -> notes and drum hits (Utawa's "Voice to notes").
		// One voice sings one note at a time, so the pitch comes from a YIN tracker (sharper than the
		// song analysis for a single voice) checked against the same spectrum the song analysis
		// reads; onsets, drum bands and the grid work as they do for songs.
		function yinTrack(x, frames, minHz, maxHz) {
			const W = minHz < 70 ? 2048 : 1024, tauMax = Math.min(W >> 1, Math.ceil(SR / minHz)), tauMin = Math.max(2, Math.floor(SR / maxHz));
			const Wi = W - tauMax, N = 2 * W, t = fftTables(N);
			const hz = new Float32Array(frames), conf = new Float32Array(frames), rms = new Float32Array(frames);
			const a = new Float64Array(N), aIm = new Float64Array(N), b = new Float64Array(N), bIm = new Float64Array(N);
			const d = new Float64Array(tauMax + 2), b2 = new Float64Array(W + 1);
			for (let f = 0; f < frames; f++) {
				const s = f * HOP - (W >> 1);
				let e = 0;
				for (let i = 0; i < W; i++) { const v = s + i >= 0 && s + i < x.length ? x[s + i] : 0; b[i] = v; e += v * v; }
				rms[f] = Math.sqrt(e / W);
				if (rms[f] < 1e-4) continue;
				b2[0] = 0;
				for (let i = 0; i < W; i++) b2[i + 1] = b2[i] + b[i] * b[i];
				// r(tau) = sum a[j] b[j + tau], a = the first Wi samples: one FFT product
				for (let i = 0; i < N; i++) { a[i] = i < Wi ? b[i] : 0; aIm[i] = 0; bIm[i] = 0; }
				for (let i = W; i < N; i++) b[i] = 0;
				fft(a, aIm, t); fft(b, bIm, t);
				for (let i = 0; i < N; i++) { const re = a[i] * b[i] + aIm[i] * bIm[i], im = a[i] * bIm[i] - aIm[i] * b[i]; a[i] = re; aIm[i] = -im; }
				fft(a, aIm, t); // conj trick: ifft(X) = conj(fft(conj(X))) / N
				const e1 = b2[Wi];
				let sum = 0, best = -1, bestV = 1e9;
				d[0] = 1;
				for (let tau = 1; tau <= tauMax; tau++) {
					const r = a[tau] / N;
					const dt = Math.max(0, e1 + (b2[tau + Wi] - b2[tau]) - 2 * r);
					sum += dt;
					d[tau] = sum > 0 ? dt * tau / sum : 1;
				}
				// the first dip under the threshold (the YIN rule), else the deepest
				for (let tau = tauMin; tau < tauMax; tau++) {
					if (d[tau] < 0.15 && d[tau] <= d[tau - 1] && d[tau] <= d[tau + 1]) { best = tau; break; }
					if (d[tau] < bestV) { bestV = d[tau]; }
				}
				if (best < 0) for (let tau = tauMin; tau < tauMax; tau++) if (d[tau] == bestV) { best = tau; break; }
				if (best < 0 || d[best] > 0.45) continue;
				const y0 = d[best - 1], y1 = d[best], y2 = d[best + 1], den = y0 - 2 * y1 + y2;
				const shift = den > 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / den)) : 0;
				hz[f] = SR / (best + shift);
				conf[f] = 1 - y1;
			}
			return { hz, conf, rms };
		}
		// how strongly the spectrum supports a pitch (harmonic sum on the log-frequency spectrum)
		function salience(V, f, midi) {
			let s = 0;
			for (let h = 1; h <= 5; h++) {
				const bin = Math.round((midi + 12 * Math.log2(h) - M0) * BPS);
				if (bin < 0 || bin >= NB) break;
				s += Math.max(V[f * NB + bin], V[f * NB + Math.max(0, bin - 1)], V[f * NB + Math.min(NB - 1, bin + 1)]) * Math.pow(0.8, h - 1);
			}
			return s;
		}
		async function voice(take, options, progress = () => { }) {
			const o = Object.assign({ mode: "melody", bpm: 120, beatsPerBar: 4, grid: 4, scale: null, sens: 0.5, align: true, offset: 0 }, options || {});
			// a little silence in front, so a sound at the very start still has an attack to find
			const PAD = 8 * HOP, padSec = PAD / SR;
			const x = new Float32Array(take.length + PAD);
			x.set(take, PAD);
			const mode = o.mode;
			progress(0.02, "Listening");
			const spec = await spectra(x, (v, text) => progress(0.02 + v * 1.2, text));
			const frames = spec.frames;
			const O = onsetEnvelope(spec.D, frames);
			progress(0.45, "Following the pitch");
			await pause();
			const wantNotes = mode != "beatbox", wantDrums = mode == "beatbox" || mode == "auto";
			const P = yinTrack(x, frames, mode == "bass" ? 50 : 65, mode == "bass" ? 700 : 1400);
			const rmsSorted = Array.from(P.rms).filter(v => v > 0).sort((a, b) => a - b);
			const loud = rmsSorted.length ? rmsSorted[Math.floor(rmsSorted.length * 0.95)] : 1;
			const floor = rmsSorted.length ? rmsSorted[Math.floor(rmsSorted.length * 0.1)] : 0;
			const gate = Math.max(floor * 2.5, loud * (0.06 - 0.04 * o.sens));
			// midi per frame (0 = unvoiced), checked against the spectrum for octave slips
			const m = new Float32Array(frames);
			for (let f = 0; f < frames; f++) {
				if (!P.hz[f] || P.rms[f] < gate || P.conf[f] < 0.55) continue;
				let mi = 69 + 12 * Math.log2(P.hz[f] / 440);
				const here = salience(spec.V, f, mi), up = salience(spec.V, f, mi + 12), down = salience(spec.V, f, mi - 12);
				if (up > here * 2.2) mi += 12;
				else if (down > here * 1.6 && mi - 12 >= M0) mi -= 12;
				m[f] = mi;
			}
			// one stray frame is not a note: median of five over voiced runs
			const sm = new Float32Array(frames);
			for (let f = 0; f < frames; f++) {
				if (!m[f]) continue;
				const w = [];
				for (let k = -2; k <= 2; k++) if (f + k >= 0 && f + k < frames && m[f + k]) w.push(m[f + k]);
				w.sort((a, b) => a - b);
				sm[f] = w[w.length >> 1];
			}
			// the singer's own tuning (most people hum a little off A = 440)
			let cx = 0, cy = 0;
			for (let f = 0; f < frames; f++) if (sm[f]) { const a = 2 * Math.PI * (sm[f] - Math.round(sm[f])); cx += Math.cos(a) * P.rms[f]; cy += Math.sin(a) * P.rms[f]; }
			let tuning = Math.atan2(cy, cx) / (2 * Math.PI);
			if (Math.abs(tuning) < 0.12) tuning = 0;
			const beat = 60 / Math.max(20, o.bpm);
			const gridSteps = o.grid > 0 ? o.grid : 0, step = gridSteps ? beat / gridSteps : 0;
			let notes = [], drums = [];
			const onsets = percussiveOnsets(O.env, frames, o.sens);
			const onsetSet = new Set(onsets);
			if (wantNotes) {
				progress(0.6, "Finding the notes");
				// voiced runs (gaps of two frames or less are breaths inside a note)
				const runs = [];
				let start = -1, lastV = -10;
				for (let f = 0; f <= frames; f++) {
					const v = f < frames && sm[f] > 0;
					if (v) { if (start < 0) start = f; lastV = f; }
					else if (start >= 0 && f - lastV > 2) { runs.push([start, lastV + 1]); start = -1; }
				}
				for (const [r0, r1] of runs) {
					// split where the pitch moves to a new note and stays, or where the voice re-attacks
					let s0 = r0;
					const cut = (at) => { if (at - s0 >= 3) notes.push({ f0: s0, f1: at }); s0 = at; };
					for (let f = r0 + 3; f < r1 - 2; f++) {
						// the pitch the note has settled on (not the slide into it)
						const seg = [];
						for (let g = Math.max(s0 + 2, f - 40); g < f; g++) if (sm[g]) seg.push(sm[g]);
						if (seg.length < 3) continue;
						seg.sort((a, b) => a - b);
						const cur = seg[seg.length >> 1];
						let moved = 0;
						for (let k = 0; k < 4 && f + k < r1; k++) if (sm[f + k] && Math.abs(sm[f + k] - cur) > 0.75) moved++;
						if (moved >= 4) {
							// the new note began where the pitch left the old one, or at the dip in level between them
							const target = (sm[f] + sm[Math.min(r1 - 1, f + 3)]) / 2;
							let g = f;
							while (g - 1 > s0 + 2 && sm[g - 1] && Math.abs(sm[g - 1] - cur) > 0.3 * Math.abs(target - cur)) g--;
							let dip = g, low = P.rms[g];
							for (let k = Math.max(s0 + 3, g - 8); k <= g; k++) if (P.rms[k] < low) { low = P.rms[k]; dip = k; }
							cut(low < 0.8 * P.rms[g] ? dip : g);
							f = Math.max(f, s0 + 2);
							continue;
						}
						// re-attack on the same pitch: an onset with a dip in level just before
						if ((onsetSet.has(f) || onsetSet.has(f + 1)) && f - s0 >= 6) {
							const before = Math.min(P.rms[f - 1], P.rms[f - 2]), after = Math.max(P.rms[f + 1], P.rms[f + 2], P.rms[f + 3]);
							if (before < 0.7 * after) cut(f);
						}
					}
					cut(r1);
				}
				const peakRms = Math.max(1e-9, ...notes.map(n => { let p = 0; for (let f = n.f0; f < n.f1; f++) p = Math.max(p, P.rms[f]); return p; }));
				notes = notes.map(n => {
					// the note's pitch: the middle of it (not the scoop in or the fall out)
					const len = n.f1 - n.f0, a = n.f0 + Math.floor(len * 0.2), b = Math.max(a + 1, n.f1 - Math.floor(len * 0.15));
					const vals = [];
					for (let f = a; f < b; f++) if (sm[f]) vals.push(sm[f] - tuning);
					vals.sort((x, y) => x - y);
					const raw = vals.length ? vals[vals.length >> 1] : 60;
					let midi = Math.round(raw);
					if (o.scale && o.scale.length == 12) {
						const inScale = (k) => o.scale[((k % 12) + 12) % 12];
						if (!inScale(midi)) {
							const lo = midi - 1, hi = midi + 1;
							const cand = [lo, hi].filter(inScale).sort((p, q) => Math.abs(p - raw) - Math.abs(q - raw));
							if (cand.length && Math.abs(cand[0] - raw) < 0.85) midi = cand[0];
						}
					}
					let pk = 0;
					for (let f = n.f0; f < n.f1; f++) pk = Math.max(pk, P.rms[f]);
					return { t: n.f0 * HOP / SR, dur: (n.f1 - n.f0) * HOP / SR, midi, vel: Math.min(1, Math.sqrt(pk / peakRms)), raw };
				});
				// too short to be meant
				notes = notes.filter(n => n.dur >= Math.max(0.06, step * 0.4));
				// one note split by a wobble becomes one again
				const merged = [];
				for (const n of notes) {
					const prev = merged[merged.length - 1];
					if (prev && prev.midi == n.midi && n.t - (prev.t + prev.dur) < 0.05 && !onsets.some(f => Math.abs(f * HOP / SR - n.t) < 0.03)) { prev.dur = n.t + n.dur - prev.t; prev.vel = Math.max(prev.vel, n.vel); continue; }
					merged.push(n);
				}
				notes = merged;
				// a hummed bass is sung an octave or two above where a bass plays
				if (mode == "bass" && notes.length) {
					const med = notes.map(n => n.midi).sort((a, b) => a - b)[notes.length >> 1];
					let shift = 0;
					while (med + shift > 47) shift -= 12;
					for (const n of notes) n.midi += shift;
				}
			}
			if (wantDrums) {
				progress(0.75, "Hearing the beatbox");
				// each hit: where its energy sits and how long the hiss lasts
				const hits = [];
				const topEnv = Math.max(1e-9, ...onsets.map(f => O.env[f]));
				for (const f of onsets) {
					// in "auto", a hit on a sung note is the note's start, not a drum
					if (mode == "auto" && sm[f + 2] && P.conf[f + 2] > 0.8) continue;
					const e = new Float64Array(DB);
					for (let g = f; g < Math.min(frames, f + 6); g++) for (let k = 0; k < DB; k++) e[k] += spec.D[g * DB + k];
					let tot = 0, cen = 0, low = 0, high = 0;
					for (let k = 0; k < DB; k++) { tot += e[k]; cen += e[k] * k; if (bandEdges[k + 1] <= 250) low += e[k]; if (bandEdges[k] >= 4000) high += e[k]; }
					if (tot <= 0) continue;
					let hiss = 0;
					const h0 = (() => { let s = 0; for (let k = 0; k < DB; k++) if (bandEdges[k] >= 3000) s += spec.D[f * DB + k] + (f + 1 < frames ? spec.D[(f + 1) * DB + k] : 0); return s; })();
					for (let g = f + 2; g < Math.min(frames, f + 60); g++) { let s = 0; for (let k = 0; k < DB; k++) if (bandEdges[k] >= 3000) s += spec.D[g * DB + k]; if (s < 0.25 * h0 * 0.5) break; hiss = g - f; }
					hits.push({ f, t: f * HOP / SR, cen: cen / tot, low: low / tot, high: high / tot, hiss: hiss * HOP / SR, vel: Math.min(1, Math.sqrt(O.env[f] / topEnv)) });
				}
				// a weak bump in the tail of a hit that sounds like it is that hit ringing, not a new one
				for (let i = hits.length - 1; i > 0; i--) {
					const h = hits[i];
					const prev = hits.slice(0, i).reverse().find(p => h.t - p.t < 0.22 && Math.abs(p.cen - h.cen) < 6 && p.vel > h.vel);
					if (prev && h.vel * h.vel < 0.35 * prev.vel * prev.vel) hits.splice(i, 1);
				}
				// group the hits by sound (whoever beatboxes has their own kick, snare and hat):
				// k-means on where the energy sits, then name the groups from low to high
				if (hits.length) {
					const feat = (hh) => [hh.cen / DB * 4, hh.low * 3, hh.high * 3];
					const sorted = hits.slice().sort((a, b) => a.cen - b.cen);
					const k = Math.min(3, hits.length);
					let cents = [0, Math.floor((sorted.length - 1) / 2), sorted.length - 1].slice(0, k).map(i => feat(sorted[i]));
					let assign = new Array(hits.length).fill(0);
					for (let it = 0; it < 12; it++) {
						assign = hits.map(hh => { const v = feat(hh); let bi = 0, bd = 1e9; cents.forEach((c, i) => { const dd = c.reduce((s, x, j) => s + (x - v[j]) ** 2, 0); if (dd < bd) { bd = dd; bi = i; } }); return bi; });
						cents = cents.map((c, i) => { const mem = hits.filter((_, j) => assign[j] == i); return mem.length ? c.map((_, j) => mem.reduce((s, hh) => s + feat(hh)[j], 0) / mem.length) : c; });
					}
					const order = cents.map((c, i) => [c[0], i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
					const names = order.length == 3 ? ["kick", "snare", "hat"] : order.length == 2 ? ["kick", "snare"] : ["kick"];
					const label = {};
					order.forEach((ci, r) => { label[ci] = names[r]; });
					// absolute sense where groups are not clearly apart
					for (let i = 0; i < hits.length; i++) {
						const hh = hits[i];
						let kind = label[assign[i]];
						if (hh.high > 0.55 && hh.low < 0.1) kind = "hat";
						else if (hh.low > 0.45 && hh.high < 0.15) kind = "kick";
						if (kind == "hat" && hh.hiss > 0.16) kind = "open";
						drums.push({ t: hh.t, kind, vel: +hh.vel.toFixed(3) });
					}
				}
			}
			// ---- onto the song's grid
			progress(0.9, "Placing it on the beat");
			for (const n of notes) n.t -= padSec;
			for (const d of drums) d.t = d.t - padSec;
			// where the bar line is in the take: given (after a count-in), or at the first sound
			let offset = typeof o.offset == "number" ? o.offset : 0;
			if (o.offset == "first") offset = Math.max(0, Math.min(notes.length ? notes[0].t : 1e9, drums.length ? Math.min(...drums.map(d => d.t)) : 1e9, 1e9 - 1));
			if (offset > 1e8) offset = 0;
			if (step && o.align) {
				// the shift (within half a step) that puts the attacks closest to the grid
				const times = notes.map(n => n.t).concat(drums.map(d => d.t));
				if (times.length) {
					let best = offset, bestErr = 1e9;
					for (let k = -12; k <= 12; k++) {
						const off = offset + k / 24 * step;
						let err = 0;
						for (const t of times) { const q = (t - off) / step; err += Math.abs(q - Math.round(q)); }
						if (err < bestErr - 1e-9) { bestErr = err; best = off; }
					}
					offset = best;
				}
			}
			const snap = (t) => step ? Math.max(0, Math.round((t - offset) / step)) * step : Math.max(0, t - offset);
			for (const n of notes) { const s = snap(n.t), e = snap(n.t + n.dur); n.t = s; n.dur = Math.max(step || 0.05, e - s); }
			for (const d of drums) d.t = snap(d.t);
			// one voice: a note ends where the next begins; two on one step keep the louder
			notes.sort((a, b) => a.t - b.t);
			const mono = [];
			for (const n of notes) {
				const prev = mono[mono.length - 1];
				if (prev && Math.abs(n.t - prev.t) < 1e-6) { if (n.vel > prev.vel) mono[mono.length - 1] = n; continue; }
				if (prev && prev.t + prev.dur > n.t) prev.dur = n.t - prev.t;
				mono.push(n);
			}
			notes = mono;
			const seen = new Set();
			drums = drums.filter(d => { const key = d.kind + "@" + d.t.toFixed(4); if (seen.has(key)) return false; seen.add(key); return true; }).sort((a, b) => a.t - b.t);
			progress(1, "Done");
			const pitch = Array.from(sm.subarray(8), (v) => v ? +(v - tuning).toFixed(2) : 0);
			return {
				notes: notes.map(n => ({ t: +n.t.toFixed(4), dur: +n.dur.toFixed(4), midi: n.midi, vel: +n.vel.toFixed(3) })), drums,
				tuning: Math.round(tuning * 100), offset: +offset.toFixed(4), bpm: o.bpm, grid: gridSteps, duration: take.length / SR, fps: FPS, pitch,
			};
		}
		return { analyze, voice, setPause, drumTemplateFromPcm, SR, DRUMS, version: 2 };
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
	function runInWorker(mono, opts, progress, task = "analyze") {
		return new Promise((resolve, reject) => {
			if (typeof Worker == "undefined") return reject(new Error("no workers"));
			if (!workerUrl) {
				const src = "\"use strict\";\nconst AM = (" + amEngine.toString() + ")();\nAM.setPause(() => null);\n" +
					"self.onmessage = async (e) => {\n  try {\n    const r = await AM[e.data.task || \"analyze\"](e.data.mono, e.data.opts, (v, text) => self.postMessage({ progress: v, text }));\n    self.postMessage({ result: r });\n  } catch (error) { self.postMessage({ error: String((error && error.stack) || error) }); }\n};";
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
			worker.postMessage({ mono: copy, opts, task }, [copy.buffer]);
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

	// A hummed, sung or beatboxed take (mono, 22,050 Hz) -> notes / drum hits on the song's grid.
	// options: mode ("melody", "bass", "beatbox", "auto"), bpm, beatsPerBar, grid (steps per beat,
	// 0 = as sung), scale (12 booleans, relative to C), sens (0..1), align, offset (seconds of the downbeat).
	async function analyzeVoice(mono, options = {}, progress = () => { }) {
		if (options.worker !== false) {
			try { return await runInWorker(mono, options, progress, "voice"); }
			catch (error) { console.warn("AudioMidi: listening on the page (" + (error.message || error) + ")"); }
		}
		const e = engine();
		e.setPause(() => new Promise(r => setTimeout(r, 0)));
		return e.voice(mono, options, progress);
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
	// The notes to write: "raw" = every note the analysis heard, otherwise the arrangement.
	function noteSet(result, source) {
		const arr = source != "raw" && source != 1 ? result.arr : null;
		if (!arr) return { notes: result.notes, drums: result.drums };
		return { notes: arr.bass.concat(arr.lead, arr.chords).sort((a, b) => a.t - b.t || a.midi - b.midi), drums: arr.drums };
	}
	// Puts a Replica (an instrument rebuilt from the recording) on a channel.
	function setReplica(doc, channel, params) {
		doc.record(new A.ChangeFL(doc, () => {
			const instrument = doc.song.channels[channel].instruments[0];
			instrument.setTypeAndReset(A.FLConfig.typePlugin, doc.song.getChannelIsNoise(channel));
			instrument.fl.plugin.id = "replica";
			instrument.fl.plugin.params = params;
		}));
	}
	// Replica params for the parts, with volumes that keep the recording's balance.
	function replicaParams(result, role, extra = {}) {
		const rp = B.CarrotPlugins.get("replica");
		const ins = result.instruments || {};
		const m = ins[role];
		if (!rp || !m) return null;
		const louds = Object.values(ins).map(x => x.loudness).filter(Number.isFinite);
		const top = louds.length ? Math.max(...louds) : 0;
		const volume = Number.isFinite(m.loudness) ? Math.max(-18, Math.min(0, m.loudness - top)) : 0;
		const label = role == "drums" ? "Drums" : ROLE_NAMES[role] || role;
		return rp.fromMeasurement(m, Object.assign({ name: label + " from " + (result.fileName || "the recording"), source: result.fileName || "", volume }, extra));
	}
	async function writeSong(host, result, options, original) {
		const doc = host.doc;
		const parts = Object.assign({ drums: true, bass: true, lead: true, chords: true, original: true }, options.parts || {});
		// rebuilt instruments need the Replica plugin (installed, so the song keeps working after a reload)
		let rebuilt = options.sounds != "library" && result.instruments && Object.keys(result.instruments).length > 0;
		if (rebuilt) {
			try { await B.CarrotPlugins.install("replica"); }
			catch (error) { console.warn("AudioMidi: Replica is not available", error); rebuilt = false; }
		}
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
		// the clean arrangement (on the grid, one-voice lines, steady drum patterns) or every note heard
		const { notes: allNotes, drums: allDrums } = noteSet(result, options.source);
		let lastEnd = 0;
		for (const n of allNotes) lastEnd = Math.max(lastEnd, toParts(n.t + n.dur));
		for (const d of allDrums) lastEnd = Math.max(lastEnd, toParts(d.t) + ppb / 4);
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
		const pitched = allNotes.filter(n => parts[n.role] !== false);
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
			const rp = rebuilt ? replicaParams(result, result.instruments[g.role] ? g.role : ["chords", "lead", "bass"].find(r => result.instruments[r])) : null;
			if (rp) setReplica(doc, channel, rp);
			else await setSampler(doc, channel, soundFor(g.role, layout == 0 ? result.timbre[g.role] : null));
			A.carrotWriteNotes(doc, toBars(notes, bars, barParts), { channel, startBar: 0, replace: true, freshPatterns: true, overlap: true });
			written.push(g.name.toLowerCase() + " (" + notes.length + ")");
		}
		// drums: a kit built from the library sounds closest to the recording's
		if (parts.drums && allDrums.length) {
			const channel = take(true);
			if (channel != null) {
				A.carrotNameChannel(doc, channel, "Drums (AudioMidi)");
				const used = PAD_ORDER.filter(k => allDrums.some(d => d.kind == k));
				const rows = {};
				const kit = rebuilt && result.instruments.drums ? replicaParams(result, "drums", { kinds: used.slice(0, 12) }) : null;
				if (kit) {
					used.slice(0, 12).forEach((kind, i) => { rows[kind] = i; });
					setReplica(doc, channel, kit);
				}
				else doc.record(new A.ChangeFL(doc, () => {
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
				if (!kit) for (const pad of doc.song.channels[channel].instruments[0].fl.fpc.pads) if (pad.sampleId) A.FLSampleBank.request(pad.sampleId);
				const notes = [];
				for (const d of allDrums) {
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

	// A voice take (from analyzeVoice) into the song, starting at options.startBar:
	//   notes -> options.channel (Utawa's own channel), or a new channel with options.sound
	//            ("lead", "bass", "keys", "pad", "pluck", "utawa"); beatbox hits -> a new drum channel.
	async function writeVoice(host, r, options = {}) {
		const doc = host.doc, song = doc.song;
		if (doc.synth.playing) doc.performance.pause();
		const ppb = Config.partsPerBeat, barParts = song.beatsPerBar * ppb;
		const beat = 60 / Math.max(1, r.bpm || song.tempo);
		const startBar = Math.max(0, Math.min(Config.barCountMax - 1, options.startBar | 0));
		const toParts = (t) => Math.round(t / beat * ppb);
		const basePitch = Config.keys[song.key].basePitch;
		const sizeOf = (vel) => options.velocity === false ? Config.noteSizeMax : vel > 0.62 ? 3 : vel > 0.32 ? 2 : 1;
		let lastEnd = 0;
		for (const n of r.notes) lastEnd = Math.max(lastEnd, toParts(n.t + n.dur));
		for (const d of r.drums) lastEnd = Math.max(lastEnd, toParts(d.t) + ppb / 4);
		const bars = Math.max(1, Math.min(Config.barCountMax - startBar, Math.ceil(lastEnd / barParts)));
		const written = [];
		if (r.notes.length) {
			let channel = options.channel;
			if (channel == null || options.target == "new") {
				const added = A.carrotNewChannel(doc, false);
				if (!added) { A.flToast("No room for another channel"); return { written, bars }; }
				doc.record(added.group);
				channel = added.index;
				const sound = options.sound || "lead";
				A.carrotNameChannel(doc, channel, (options.name || "Voice") + " (" + sound + ")");
				if (sound == "utawa" && B.CarrotPlugins.get("utawa")) {
					doc.record(new A.ChangeFL(doc, () => {
						const instrument = doc.song.channels[channel].instruments[0];
						instrument.setTypeAndReset(A.FLConfig.typePlugin, false);
						instrument.fl.plugin.id = "utawa";
						instrument.fl.plugin.params = B.CarrotPlugins.get("utawa").defaultParams();
					}));
				}
				else {
					const keys = { lead: "instruments/synth-leads/lead-square", bass: "instruments/bass/finger-bass", keys: "instruments/keys/rhodes", pad: "instruments/pads/pad-warm", pluck: "instruments/plucks/pluck-synth" };
					A.FLSampleBank.request("b:" + (keys[sound] || keys.lead));
					await A.FLSampleBank.whenReady("b:" + (keys[sound] || keys.lead));
					await setSampler(doc, channel, keys[sound] || keys.lead);
				}
			}
			// keep every note inside the channel's range
			const fit = (pitch) => { while (pitch < 0) pitch += 12; while (pitch > Config.maxPitch) pitch -= 12; return pitch; };
			const notes = r.notes.map(n => { const start = toParts(n.t); return { start, end: Math.max(start + 1, toParts(n.t + n.dur)), pitches: [fit(n.midi - basePitch)], size: sizeOf(n.vel) }; });
			A.carrotWriteNotes(doc, toBars(notes, bars, barParts), { channel, startBar, replace: options.replace !== false, freshPatterns: true, overlap: false });
			written.push(r.notes.length + " notes");
		}
		if (r.drums.length) {
			const added = A.carrotNewChannel(doc, true);
			if (added) {
				doc.record(added.group);
				const channel = added.index;
				A.carrotNameChannel(doc, channel, "Beatbox (" + (options.name || "Voice") + ")");
				const used = PAD_ORDER.filter(k => r.drums.some(d => d.kind == k));
				const rows = {};
				doc.record(new A.ChangeFL(doc, () => {
					const instrument = doc.song.channels[channel].instruments[0];
					instrument.setTypeAndReset(A.FLConfig.typeFPC, true);
					const fpc = instrument.fl.fpc;
					used.forEach((kind, i) => {
						if (i >= fpc.pads.length) return;
						const key = (DRUM_SOURCES[kind] || [])[options.kit | 0] || DRUM_SOURCES[kind][0];
						const pad = fpc.pads[i];
						pad.reset();
						pad.sampleId = "b:" + key;
						pad.name = PAD_NAMES[kind];
						if (kind == "hat" || kind == "open") pad.cut = 1;
						rows[kind] = i;
					});
					fpc.kitName = "Beatbox kit";
				}));
				for (const pad of doc.song.channels[channel].instruments[0].fl.fpc.pads) if (pad.sampleId) A.FLSampleBank.request(pad.sampleId);
				const notes = r.drums.filter(d => rows[d.kind] != undefined).map(d => { const start = toParts(d.t); return { start, end: start + 6, pitches: [rows[d.kind]], size: sizeOf(d.vel) }; });
				A.carrotWriteNotes(doc, toBars(notes, bars, barParts), { channel, startBar, replace: true, freshPatterns: true, overlap: true });
				written.push(notes.length + " drum hits");
			}
		}
		return { written, bars, startBar };
	}

	// ======================================================================= UI
	const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
	const ROLE_COLORS = { lead: "#ff7eb6", chords: "#c3e88d", bass: "#4fc3f7" };
	function open(host) {
		const state = { file: null, result: null, busy: false };
		const params = host.params();
		const p = Object.assign({ drums: 0.5, notes: 0.5, length: 2, mode: 0, layout: 0, quantize: 0, source: 0, sounds: 0, bpm: 0, meter: 0, bends: true, velocity: true, parts: { drums: true, bass: true, lead: true, chords: true, original: true } }, params);
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
		const sourceSelect = CarrotUI.select({ label: "Notes", options: ["Clean arrangement (on the beat, no stray notes)", "Every note heard (raw)"], value: params.source | 0, title: "Clean: every part on the song's grid, bass and lead as single lines, missed repeats filled in and stray blips removed. Raw: everything the analysis heard, as played.", onChange: (v) => { params.source = v; if (state.result) { renderStats(); drawView(); } } });
		const soundsSelect = CarrotUI.select({ label: "Sounds", options: ["Rebuilt from the recording (Replica)", "CarrotBox library sounds"], value: params.sounds | 0, title: "Rebuilt: each part plays on an instrument rebuilt from how it sounds in the recording (editable in Replica). Library: the closest CarrotBox sounds.", onChange: (v) => { params.sounds = v; } });
		const instBox = HTML.div({ class: "cb-am-insts" });
		const instSection = CarrotUI.section("Instruments heard (rebuilt, editable)", instBox);
		instSection.style.display = "none";
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
			instBox.innerHTML = "";
			instSection.style.display = "none";
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
				state.result.fileName = state.file.name;
				renderStats();
				renderInstruments();
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
			const set = noteSet(r, params.source);
			stat("Drum hits", String(set.drums.length), Object.entries(set.drums.reduce((m, d) => (m[d.kind] = (m[d.kind] || 0) + 1, m), {})).map(([k, v]) => k + " " + v).join(", "));
			stat("Bass notes", String(set.notes.filter(n => n.role == "bass").length));
			stat("Lead notes", String(set.notes.filter(n => n.role == "lead").length));
			stat("Harmony notes", String(set.notes.filter(n => n.role == "chords").length));
			stat("Glides", String(set.notes.filter(n => n.bend).length));
			if (r.arr) stat("Grid", r.arr.grid == 3 ? "Triplets" : "16ths", r.arr.grid == 3 ? "The music swings: notes are placed on a triplet grid" : "Notes are placed on a sixteenth-note grid");
			const names = r.chords.slice(0, 8).map(c => c.name);
			stat("Chords", names.slice(0, 4).join(" ") || "-", names.join(" "));
		}
		// ---- the instruments heard, rebuilt (Replica)
		async function replica() {
			try { return await B.CarrotPlugins.load("replica"); }
			catch (error) { A.flToast("AudioMidi: the Replica plugin could not be loaded"); return null; }
		}
		function renderInstruments() {
			instBox.innerHTML = "";
			const r = state.result;
			const ins = r && r.instruments || {};
			const roles = ["lead", "chords", "bass", "drums"].filter(role => ins[role]);
			if (!roles.length) { instSection.style.display = "none"; return; }
			instSection.style.display = "";
			for (const role of roles) {
				const m = ins[role];
				const title = role == "drums" ? "Drums" : ROLE_NAMES[role];
				const detail = role == "drums" ? m.pads.length + " drums rebuilt: " + m.pads.map(p => p.kind).join(", ") :
					m.notes + " notes measured" + (m.zones.length > 1 ? ", 2 key zones" : "") + (m.vibrato && m.vibrato.depth > 0 ? ", vibrato" : "") + (m.noise.some(v => v > -40) ? ", breath" : "");
				const pic = HTML.canvas({ width: 160, height: 34 });
				const g = pic.getContext("2d");
				g.fillStyle = ROLE_COLORS[role] || "#ffcb6b";
				if (role == "drums") {
					m.pads.forEach((pad, i) => { const bw = 160 / m.pads.length; for (let b = 0; b < 32; b++) { const v = Math.max(0, 1 + pad.bands[b] / 60); g.fillRect(i * bw + b * (bw - 3) / 32, 34 - v * 30, Math.max(1, (bw - 3) / 32 - 0.3), v * 30); } });
				}
				else {
					const z = m.zones[0];
					for (let h = 0; h < 32; h++) { const v = Math.max(0, 1 + z.shape[4 * m.H + h] / 60); g.fillRect(h * 5, 34 - v * 32, 4, v * 32); }
				}
				const params = () => replicaParams(r, role, role == "drums" ? { kinds: m.pads.map(p => p.kind) } : {});
				const play = CarrotUI.button("Play", async () => {
					const rp = await replica();
					if (!rp) return;
					const sr = 44100, out = new Float32Array(sr * 2.4);
					const put = (pcm, at, gain = 1) => { const o = Math.floor(at * sr); for (let i = 0; i < pcm.length && o + i < out.length; i++) out[o + i] += pcm[i] * gain; };
					const pr = replicaParams(r, role, role == "drums" ? { kinds: m.pads.map(p => p.kind) } : {});
					pr.volume = 0;
					if (role == "drums") {
						const order = ["kick", "hat", "snare", "hat", "kick", "kick", "snare", "open"];
						order.forEach((kind, i) => { const idx = pr.pads.findIndex(pd => pd.kind == kind); if (idx >= 0) put(rp.renderNote(pr, 60, 0.2, sr, 0.9, { pad: idx }), i * 0.25); });
					}
					else {
						const range = m.range || [60, 60], mid = Math.round((range[0] + range[1]) / 2);
						const notes = role == "chords" ? [[0, [mid - 7, mid - 3, mid]], [1.2, [mid - 5, mid - 1, mid + 2]]] : [[0, [mid]], [0.4, [mid + 2]], [0.8, [mid + 4]], [1.2, [mid + 7]], [1.6, [mid]]];
						for (const [at, pitches] of notes) for (const pi of pitches) put(rp.renderNote(pr, pi, role == "chords" ? 1 : 0.32, sr, 0.85), at, role == "chords" ? 0.5 : 1);
					}
					let peak = 0;
					for (const v of out) peak = Math.max(peak, Math.abs(v));
					if (peak > 0.95) for (let i = 0; i < out.length; i++) out[i] *= 0.95 / peak;
					A.FLSampleBank.previewPcm(out, sr, 0, 1, 1, 0.8);
				}, { title: "Hear the rebuilt instrument" });
				const add = CarrotUI.button("Add to song", async () => {
					if (!await replica()) return;
					await B.CarrotPlugins.install("replica");
					const doc = host.doc;
					const added = A.carrotNewChannel(doc, role == "drums");
					if (!added) { A.flToast("AudioMidi: no room for another channel"); return; }
					doc.record(added.group);
					A.carrotNameChannel(doc, added.index, title + " (Replica)");
					setReplica(doc, added.index, params());
					doc.selection.setChannelBar(added.index, doc.bar);
					A.flToast("AudioMidi: " + title.toLowerCase() + " rebuilt on a new channel - open it to edit");
				}, { title: "Put this rebuilt instrument on a new channel, ready to play and edit" });
				const keep = CarrotUI.button("Keep", async () => {
					const rp = await replica();
					if (!rp) return;
					const pr = params();
					if (rp.library.save(pr)) A.flToast("AudioMidi: \"" + pr.name + "\" kept in My instruments (open any Replica to load it)");
				}, { title: "Keep it in My instruments, for any song" });
				instBox.appendChild(HTML.div({ class: "cb-am-inst" }, HTML.b(title), pic, HTML.small(detail), CarrotUI.row(play, add, keep)));
			}
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
			const set = noteSet(r, params.source);
			const top = waveH * 2 + 4, bottom = h - 22;
			let lo = 127, hi = 0;
			for (const n of set.notes) { lo = Math.min(lo, n.midi); hi = Math.max(hi, n.midi); }
			if (hi < lo) { lo = 36; hi = 84; }
			const rowH = (bottom - top) / Math.max(12, hi - lo + 1);
			for (const n of set.notes) {
				ctx.fillStyle = ROLE_COLORS[n.role] || "#ccc";
				ctx.globalAlpha = 0.45 + 0.55 * n.vel;
				const x = secX(n.t), x2 = secX(n.t + n.dur);
				ctx.fillRect(x, bottom - (n.midi - lo + 1) * rowH, Math.max(1.5, x2 - x - 0.5), Math.max(1.5, rowH - 0.5));
			}
			ctx.globalAlpha = 1;
			// drum lanes
			const lanes = ["kick", "snare", "clap", "hat", "open", "tomLow", "tomMid", "tomHigh", "rim", "crash", "ride"];
			ctx.fillStyle = "#ffcb6b";
			for (const d of set.drums) {
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
				const { written, bars } = await writeSong(host, state.result, { parts: params.parts, mode: params.mode == 1 ? "new" : "add", layout: params.layout, quantize: params.quantize, source: params.source == 1 ? "raw" : "clean", sounds: params.sounds == 1 ? "library" : "rebuilt", bends: params.bends, velocity: params.velocity }, params.parts.original && state.file.bytes ? state.file : null);
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
			CarrotUI.hint("AudioMidi listens to a recording and writes it as a song: the bass, lead and harmony on the song's beat grid (with glides), eleven kinds of drum hits, and the instruments themselves, rebuilt from how they sound in the recording (Replica) so they can be played and edited. Clear mixes give the closest copy."),
			HTML.div({ style: "height: 8px;" }), drop, fileInput, info,
			CarrotUI.section("Listen for", HTML.div({ class: "cb-row cb-center" }, ...toggles)),
			CarrotUI.section("Analysis", HTML.div({ class: "cb-row cb-center" }, drumsKnob, notesKnob, lengthSelect, HTML.label({ class: "cb-field" }, "Tempo (BPM)", bpmInput), meterSelect)),
			CarrotUI.section("Writing", HTML.div({ class: "cb-row cb-center" }, modeSelect, sourceSelect, soundsSelect, layoutSelect, quantizeSelect, bendToggle, velocityToggle)),
			bar, stage, stats, instSection, legend, canvas,
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
		analyze, analyzeVoice, writeVoice, decodeFile, writeSong, toRate, SR, engine: amEngine, drumTemplates: () => libraryDrumTemplates().templates, drumSources: DRUM_SOURCES,
	});
})();
