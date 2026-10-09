// Headless smoke test for CarrotBox.
//
//   npm install playwright      (once, anywhere Node can find it; Chromium must be installed)
//   perl build.pl && node tools/smoke.js
//
// Checks that the editor starts without errors, that every plugin can be opened and closed
// (X button, Esc, and Esc with focus in the window), that the instrument plugins make finite,
// audible sound for every preset (Utawa included), that Live Loops and the sound library render,
// that the FL Studio mode switches cleanly, that the generator makes every part in every style
// (and a full beat) without overlapping notes, and that Sampler, Slicex and FPC play on every key.
const path = require("path");
const serve = require(path.join(__dirname, "serve.js"));
function loadPlaywright() {
	for (const name of ["playwright", "/opt/node22/lib/node_modules/playwright", "playwright-core"]) {
		try { return require(name); } catch (error) { }
	}
	console.error("Playwright is not installed. Run:  npm install playwright");
	process.exit(2);
}
const { chromium } = loadPlaywright();

let failures = 0;
function check(label, ok, detail) {
	if (!ok) failures++;
	console.log((ok ? "ok   " : "FAIL ") + label + (detail === undefined ? "" : "  " + detail));
}

(async () => {
	const port = 8200 + Math.floor(Math.random() * 500);
	const server = await serve(port);
	const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
	const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
	const errors = [];
	page.on("pageerror", e => errors.push("pageerror: " + e.message));
	page.on("console", m => { if (m.type() == "error" && !/Failed to load resource|ERR_CERT|ERR_NAME|ERR_INTERNET/.test(m.text())) errors.push("console: " + m.text()); });
	await page.goto("http://localhost:" + port + "/index.html");
	await page.waitForFunction(() => typeof editor != "undefined", null, { timeout: 20000 });
	await page.waitForTimeout(800);
	check("editor starts", true);

	// ---- plugin windows
	const count = () => page.evaluate(() => document.querySelectorAll(".cb-window").length);
	const launch = async (query) => {
		await page.focus(".beepboxEditor");
		await page.keyboard.press("Tab");
		await page.keyboard.type(query);
		await page.keyboard.press("Enter");
		await page.waitForTimeout(500);
	};
	for (const query of ["swarm", "prism", "seedling", "chop", "sketch", "mangler", "utawa", "live loops", "bouncify", "sp-404", "audiomidi", "curvebox", "synth vault", "replica"]) {
		await launch(query);
		const opened = await count();
		await page.locator(".cb-window .cb-window-title button[title^='Close']").first().click();
		await page.waitForTimeout(150);
		const closedByButton = await count();
		await launch(query);
		await page.locator(".cb-window .cb-window-body").first().click({ position: { x: 5, y: 5 } });
		await page.keyboard.press("Escape");
		await page.waitForTimeout(150);
		const closedByEscInside = await count();
		await launch(query);
		await page.keyboard.press("Escape");
		await page.waitForTimeout(150);
		const closedByEsc = await count();
		check("plugin window " + query + " opens and closes", opened == 1 && closedByButton == 0 && closedByEscInside == 0 && closedByEsc == 0, JSON.stringify([opened, closedByButton, closedByEscInside, closedByEsc]));
		await page.evaluate(() => beepbox.CarrotWindows.closeAll());
	}

	// ---- instrument plugin audio, offline
	const audio = await page.evaluate(() => {
		const doc = editor.doc, song = doc.song;
		const synth = doc.synth;
		const ppb = beepbox.Config.partsPerBeat;
		song.beatsPerBar = 4;
		const inst = song.channels[0].instruments[0];
		inst.type = beepbox.FLConfig.typePlugin;
		const ch = song.channels[0];
		if (ch.bars[0] == 0) { ch.patterns.push(new beepbox.Pattern()); ch.bars[0] = ch.patterns.length; }
		const pattern = song.getPattern(0, 0);
		pattern.notes.length = 0;
		for (let i = 0; i < 4; i++) pattern.notes.push(new beepbox.Note(12 + i * 3, i * ppb, i * ppb + ppb, 3, false));
		const results = {};
		for (const id of ["swarm", "prism", "seedling", "chopshop", "utawa", "synthvault", "replica"]) {
			const plugin = beepbox.CarrotPlugins.get(id);
			if (!plugin) { results[id] = "not registered"; continue; }
			const presets = typeof plugin.presets == "function" ? plugin.presets() : (plugin.presets || []);
			const sets = [plugin.defaultParams()].concat(presets.map(p => Object.assign(plugin.defaultParams(), JSON.parse(JSON.stringify(p.params)))));
			let worstPeak = 0, quiet = 0, nan = 0;
			for (const params of sets) {
				inst.fl.plugin.id = id;
				inst.fl.plugin.params = JSON.parse(JSON.stringify(params));
				synth.samplesPerSecond = 44100;
				synth.computeDelayBufferSizes();
				synth.song = song;
				synth.isPlayingSong = true;
				synth.warmUpSynthesizer(song);
				synth.snapToStart();
				synth.loopRepeatCount = -1;
				const N = Math.floor(44100 * 4 * 60 / song.tempo);
				let peak = 0;
				for (let i = 0; i < N; i += 1024) {
					const n = Math.min(1024, N - i), l = new Float32Array(n), r = new Float32Array(n);
					synth.synthesize(l, r, n, true);
					for (let j = 0; j < n; j++) { if (!Number.isFinite(l[j]) || !Number.isFinite(r[j])) nan++; else peak = Math.max(peak, Math.abs(l[j])); }
				}
				synth.isPlayingSong = false;
				worstPeak = Math.max(worstPeak, peak);
				if (peak < 0.002 && id != "chopshop") quiet++; // Chop Shop is silent until a sample is loaded
			}
			results[id] = { sets: sets.length, nan, quiet, worstPeak: +worstPeak.toFixed(3) };
		}
		return results;
	});
	for (const id of ["swarm", "prism", "seedling", "utawa", "synthvault", "replica"]) {
		const r = audio[id];
		check(id + " renders finite, audible sound for every preset", typeof r == "object" && r.nan == 0 && r.quiet == 0 && r.worstPeak < 4, JSON.stringify(r));
	}

	// ---- Curvebox: every preset, every shaper on its own and random patches stay finite and do something
	const curve = await page.evaluate(async () => {
		const plugin = await beepbox.CarrotPlugins.load("curvebox");
		const sr = 44100, N = sr * 3, bpm = 120;
		const inL = new Float32Array(N), inR = new Float32Array(N);
		let seed = 3;
		const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;
		for (let i = 0; i < N; i++) {
			const saw = ((i * 110 / sr) % 1) * 2 - 1, beat = (i % (sr / 2)) < 2000 ? rand() * Math.exp(-(i % (sr / 2)) / 300) : 0;
			inL[i] = 0.3 * saw + 0.5 * beat;
			inR[i] = 0.3 * ((i * 110.5 / sr) % 1 * 2 - 1) + 0.5 * beat;
		}
		const run = (params) => {
			const state = plugin.createState(sr, params);
			const L = inL.slice(), R = inR.slice();
			const ctx = { sampleRate: sr, beatPos: 0, samplesPerBeat: sr * 60 / bpm, bpm, beatsPerBar: 4, playing: true };
			for (let start = 0; start < N; start += 256) {
				const end = Math.min(N, start + 256);
				ctx.beatPos = start / ctx.samplesPerBeat;
				plugin.process(state, params, L, R, start, end, ctx);
			}
			let nan = 0, peak = 0, diff = 0, energyIn = 0, energyOut = 0;
			for (let i = 0; i < N; i++) {
				if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) { nan++; continue; }
				peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
				diff += Math.abs(L[i] - inL[i]) + Math.abs(R[i] - inR[i]);
				energyIn += inL[i] * inL[i] + inR[i] * inR[i];
				energyOut += L[i] * L[i] + R[i] * R[i];
			}
			return { nan, peak, diff: diff / N, ratioDb: 10 * Math.log10(energyOut / energyIn) };
		};
		const bad = [], inert = [];
		const sets = plugin.presets.map(p => [p.name, JSON.parse(JSON.stringify(p.params))]);
		for (const id of plugin.shaperIds) {
			const params = plugin.defaultParams();
			params.sh = {};
			params.sh[id] = { on: true };
			sets.push(["shaper " + id, params]);
			const banded = plugin.defaultParams();
			banded.sh = {};
			banded.sh[id] = { on: true, band: 2 };
			sets.push(["shaper " + id + " (mid band)", banded]);
		}
		for (let i = 0; i < 6; i++) sets.push(["random " + i, plugin.randomize()]);
		for (const [name, params] of sets) {
			const r = run(params);
			if (r.nan > 0 || r.peak > 4) bad.push(name + " " + JSON.stringify(r));
			else if (r.diff < 1e-3) inert.push(name);
		}
		// a band split that changes nothing must leave the sound as it is
		const neutral = plugin.defaultParams();
		neutral.sh = { volume: { on: true, band: 1, w: [[0, 1, 0], [1, 1, 0]] } };
		const split = run(neutral);
		return { sets: sets.length, bad, inert, splitDb: +split.ratioDb.toFixed(2) };
	});
	check("Curvebox: presets, every shaper, bands and random patches", curve.sets > 40 && curve.bad.length == 0 && curve.inert.length == 0 && Math.abs(curve.splitDb) < 0.5, JSON.stringify(curve));

	// ---- SP Station: offered when an SP-404MKII appears, plays pads, patterns and every effect, locks when unplugged
	const sp = await page.evaluate(async () => {
		const h = beepbox.CarrotAPI.CarrotHardware.get();
		h.editor = editor;
		h.simulateDevice("SP-404MKII");
		await new Promise(r => setTimeout(r, 200));
		const offered = !!document.querySelector(".cb-sp-offer");
		document.querySelectorAll(".cb-sp-offer").forEach(el => el.remove());
		beepbox.CarrotAPI.CarrotHardware._offerOpen = false;
		const plugin = await beepbox.CarrotPlugins.load("spstation");
		const eng = plugin.engine, sr = 44100;
		const params = eng.fill(plugin.defaultParams());
		for (const k of Object.keys(params.pads)) beepbox.CarrotAPI.FLSampleBank.requestNow(params.pads[k].s);
		const run = (seconds, events) => {
			const N = Math.floor(sr * seconds), L = new Float32Array(N), R = new Float32Array(N);
			const ctx = { sampleRate: sr, beatPos: 0, samplesPerBeat: sr / 2, bpm: 120, beatsPerBar: 4, playing: false };
			for (let s = 0; s < N; s += 512) {
				const e = Math.min(N, s + 512);
				ctx.beatPos = s / ctx.samplesPerBeat;
				for (const ev of events.filter(x => x.at >= s && x.at < e)) eng.postEvent(params, ev.ev);
				plugin.processInstrument({}, params, L, R, s, e, ctx);
			}
			let peak = 0, nan = 0;
			for (let i = 0; i < N; i++) { if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) nan++; else peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
			return { peak, nan };
		};
		const pad = run(0.6, [{ at: 0, ev: { t: "on", key: "A13", vel: 120 } }]);
		const bad = [];
		for (let i = 0; i < plugin.effects.length; i++) {
			params.bus[0] = { fx: i, on: 1, c: [0.6, 0.6, 0.4, 1, 1, 0] };
			const r = run(0.5, [{ at: 0, ev: { t: "on", key: "A13", vel: 120 } }, { at: 6000, ev: { t: "on", key: "A14", vel: 100 } }]);
			if (r.nan || r.peak > 2) bad.push(plugin.effects[i]);
		}
		params.bus[0].on = 0;
		params.pat["A1"] = { len: 1, ev: [[0, 0, 13, 120, 6], [24, 0, 15, 100, 6], [48, 0, 14, 110, 6]] };
		const pattern = run(1.6, [{ at: 0, ev: { t: "play", key: "A1", now: true } }]);
		h.simulateDevice(null);
		const locked = run(0.3, [{ at: 0, ev: { t: "on", key: "A13", vel: 120 } }]);
		return { offered, pad: +pad.peak.toFixed(4), effects: plugin.effects.length, bad, pattern: +pattern.peak.toFixed(4), locked: locked.peak };
	});
	check("SP Station: offered on connect, pads, 44 effects, patterns, locked without the device", sp.offered && sp.pad > 0.005 && sp.effects >= 44 && sp.bad.length == 0 && sp.pattern > 0.005 && sp.locked == 0, JSON.stringify(sp));

	// ---- Live Loops: a sample of loops render at two tempos with exact lengths
	const loops = await page.evaluate(() => {
		const L = beepbox.FLLoops, lib = L.library();
		let bad = 0, checked = 0;
		for (let i = 0; i < lib.length; i += 37) {
			for (const c of [{ bpm: 140, key: 0, minor: true, beats: 4 }, { bpm: 90, key: 7, minor: false, beats: 8 }]) {
				const r = L.render(lib[i].id, c);
				const expected = Math.floor(lib[i].bars * c.beats * 60 / c.bpm * 44100);
				let peak = 0;
				for (let k = 0; k < r.pcm.length; k += 3) peak = Math.max(peak, Math.abs(r.pcm[k]));
				checked++;
				if (Math.abs(r.pcm.length - expected) > 2 || !(peak > 0.1) || !(peak < 1.01)) bad++;
			}
		}
		return { total: lib.length, checked, bad, sounds: beepbox.FLSoundFactory.getCatalog().length };
	});
	check("Live Loops library renders (" + loops.total + " loops)", loops.total >= 1200 && loops.bad == 0, JSON.stringify(loops));

	// ---- Utawa lyrics in every language
	const lyrics = await page.evaluate(() => {
		const plugin = beepbox.CarrotPlugins.get("utawa");
		const join = (text, lang) => plugin.parseLyrics(text, lang, true).map(s => s.ph.join(" ")).join(" | ");
		return { en: join("hello night", 0), ja: join("ko n ni chi wa", 1), es: join("perro corazon", 2), zh: join("ni hao xue", 3) };
	});
	check("Utawa parses English, Japanese, Spanish and Chinese lyrics",
		lyrics.en == "h e | l ou | n ai t" && lyrics.ja == "k o | hum:n | n i | ch i | w a" && lyrics.es == "p e | rr o | k o | jr a | s o n" && lyrics.zh == "n i | h au | sh ue e", JSON.stringify(lyrics));
	check("sound library has over 8,400 sounds", loops.sounds >= 8400, String(loops.sounds));
	// ---- Sound Library 3 and the kit generator
	const lib3 = await page.evaluate(() => {
		const F = beepbox.FLSoundFactory;
		const kits = F.getKits();
		const genres = ["Breakcore", "Underground UG", "UK Drill", "Rock", "Indie", "Webcore", "Digicore"];
		const result = { kits: kits.length, missing: [], bad: [] };
		for (const g of genres) {
			const kit = kits.find(k => k.name == g + " Kit");
			if (!kit) { result.missing.push(g); continue; }
			// render the kit's kick, snare and hat
			for (const [key] of kit.pads.slice(0, 4)) {
				const r = F.render(key);
				let peak = 0, bad = 0;
				for (const v of r.pcm) { if (!Number.isFinite(v)) bad++; else peak = Math.max(peak, Math.abs(v)); }
				if (bad || peak < 0.05) result.bad.push(key);
			}
		}
		result.presets = beepbox.EditorConfig.presetCategories.filter(c => /Genre Drum Kits/.test(c.name)).reduce((n, c) => n + c.presets.length, 0);
		return result;
	});
	check("genre kits (breakcore, UG, drill, rock, indie, webcore, digicore...) exist and sound", lib3.kits >= 110 && lib3.missing.length == 0 && lib3.bad.length == 0 && lib3.presets >= 95, JSON.stringify(lib3));
	// ---- Sound Library 4: synth parts in every genre folder and 75 Essentials of every sound type
	const lib4 = await page.evaluate(() => {
		const F = beepbox.FLSoundFactory, cat = F.getCatalog();
		const genres = new Map(), essentials = new Map(), fresh = [];
		const genreFolders = new Set(cat.map(x => /^((?:Packs|Genre Kits)\/[^/]+)\/(Kicks|Snares|Bass|Melodic)\//.exec(x.path)).filter(m => m && !/Essentials|Synth One-Shots/.test(m[1])).map(m => m[1]));
		for (const x of cat) {
			const m = /^((?:Packs|Genre Kits)\/[^/]+)\/(Plucks|Leads|Synths)\//.exec(x.path);
			if (m && genreFolders.has(m[1])) {
				const g = genres.get(m[1]) || { Plucks: 0, Leads: 0, Synths: 0 };
				g[m[2]]++;
				genres.set(m[1], g);
				fresh.push(x.key);
			}
			const e = /^Packs\/Essentials\/([^/]+)\//.exec(x.path);
			if (e) {
				essentials.set(e[1], (essentials.get(e[1]) || 0) + 1);
				fresh.push(x.key);
			}
		}
		const thin = [...genreFolders].filter(g => { const c = genres.get(g); return !c || c.Plucks < 2 || c.Leads < 2 || c.Synths < 2; });
		const small = [...essentials].filter(([, n]) => n < 75).map(([f]) => f);
		const bad = [];
		for (let i = 0; i < fresh.length; i += 29) {
			const r = F.render(fresh[i]);
			let peak = 0, nan = 0;
			for (const v of r.pcm) { if (!Number.isFinite(v)) nan++; else peak = Math.max(peak, Math.abs(v)); }
			if (nan || peak < 0.05) bad.push(fresh[i]);
		}
		return { genreFolders: genreFolders.size, thin, essentialTypes: essentials.size, small, rendered: Math.ceil(fresh.length / 29), bad };
	});
	check("every genre folder has plucks, leads and synths; Essentials has 75 of every sound type", lib4.genreFolders >= 69 && lib4.thin.length == 0 && lib4.essentialTypes >= 29 && lib4.small.length == 0 && lib4.bad.length == 0, JSON.stringify(lib4));

	// ---- FL Studio interface mode turns on and off cleanly
	const fl = await page.evaluate(async () => {
		const before = editor.doc.prefs.colorTheme;
		beepbox.CarrotSettings.set("flStudioUI", true);
		await new Promise(r => setTimeout(r, 100));
		const on = document.documentElement.classList.contains("carrot-fl") && !!document.querySelector(".cfl-top");
		beepbox.CarrotSettings.set("flStudioUI", false);
		await new Promise(r => setTimeout(r, 100));
		return { on, off: !document.documentElement.classList.contains("carrot-fl"), restored: editor.doc.prefs.colorTheme == before };
	});
	check("FL Studio mode switches on and off", fl.on && fl.off && fl.restored, JSON.stringify(fl));

	// ---- melody / rhythm generator: every part in every style, then a full beat
	const gen = await page.evaluate(() => {
		const { CarrotIdeaGen, CARROT_GEN_STYLES } = beepbox.CarrotAPI;
		const song = editor.doc.song;
		const result = { runs: 0, empty: [], overlaps: 0, bad: 0 };
		const parts = ["lead", "hook", "counter", "bass", "arp", "chords", "drums", "perc"];
		const barLength = song.beatsPerBar * 24;
		for (const style of Object.keys(CARROT_GEN_STYLES))
			for (const part of parts) {
				const channel = part == "drums" || part == "perc" ? song.pitchChannelCount : 0;
				const r = CarrotIdeaGen.generate({ song, channel, startBar: 0, bars: 4, part, style, density: 0.6, complexity: 0.6, seed: 11, chordEvery: 2 });
				result.runs++;
				if (!r.bars || r.bars.length != 4 || r.bars.every(b => b.length == 0))
					result.empty.push(style + "/" + part);
				for (const bar of r.bars || []) {
					const notes = beepbox.CarrotAPI.carrotNormalizeNotes(bar, barLength, 200);
					for (const n of bar)
						if (!(n.start >= 0 && n.end <= barLength && n.end > n.start) || n.pitches.some(p => !isFinite(p)))
							result.bad++;
					for (let i = 1; i < notes.length; i++)
						if (notes[i].start < notes[i - 1].end)
							result.overlaps++;
				}
			}
		return result;
	});
	check("generator makes every part in every style", gen.empty.length == 0 && gen.bad == 0 && gen.overlaps == 0, JSON.stringify(gen));
	await page.focus(".beepboxEditor");
	await page.keyboard.press("g");
	await page.waitForTimeout(300);
	const full = await page.evaluate(() => {
		const panel = [...document.querySelectorAll(".cb-window")].find(w => /Generator/.test(w.textContent));
		if (!panel)
			return { opened: false };
		const make = [...panel.querySelectorAll("label.cb-field")].find(l => l.firstChild.textContent == "Make a").querySelector("select");
		make.selectedIndex = make.options.length - 1;
		make.dispatchEvent(new Event("change"));
		const play = [...panel.querySelectorAll(".cb-toggle")].find(b => b.textContent == "Play afterwards");
		if (play.classList.contains("cb-on"))
			play.click();
		const before = editor.doc.song.getChannelCount();
		[...panel.querySelectorAll("button")].find(b => b.textContent == "Generate").click();
		const after = editor.doc.song.getChannelCount();
		let overlaps = 0;
		const song = editor.doc.song;
		for (let c = 0; c < song.getChannelCount(); c++)
			for (let b = 0; b < song.barCount; b++) {
				const p = song.getPattern(c, b);
				if (p)
					for (let i = 1; i < p.notes.length; i++)
						if (p.notes[i].start < p.notes[i - 1].end)
							overlaps++;
			}
		const status = panel.querySelector(".carrot-gen-status").textContent;
		panel.querySelector(".cb-window-title button[title^='Close']").click();
		return { opened: true, added: after - before, overlaps, status };
	});
	check("generator writes a full beat into new channels", full.opened && full.added == 4 && full.overlaps == 0 && /Full beat/.test(full.status), JSON.stringify(full));

	// ---- sample instruments must sound on every key, not just some of them
	const keys = await page.evaluate(async () => {
		const doc = editor.doc, song = doc.song, synth = doc.synth, FL = beepbox.FLConfig, ppb = beepbox.Config.partsPerBeat;
		song.beatsPerBar = 4;
		song.tempo = 150;
		const noiseChannel = song.pitchChannelCount;
		for (let c = 0; c < song.channels.length; c++)
			for (let b = 0; b < song.barCount; b++)
				if (c != 0 && c != noiseChannel) song.channels[c].bars[b] = 0;
		const silent = {};
		const types = [["sampler", FL.typeSampler], ["slicex", FL.typeSlicex], ["fpc", FL.typeFPC]];
		for (const channelIndex of [0, noiseChannel]) {
			const isNoise = song.getChannelIsNoise(channelIndex);
			const channel = song.channels[channelIndex];
			if (channel.bars[0] == 0) { channel.patterns.push(new beepbox.Pattern()); channel.bars[0] = channel.patterns.length; }
			const pitches = isNoise ? [0, 3, 5, 8, 11] : [0, 7, 23, 41, 48, 60, 84];
			for (const [name, type] of types) {
				channel.instruments[0].setTypeAndReset(type, isNoise);
				for (const id of beepbox.FLSampleBank.collectSongSampleIds(song)) await beepbox.FLSampleBank.whenReady(id);
				for (const pitch of pitches) {
					const pattern = song.getPattern(channelIndex, 0);
					pattern.notes.length = 0;
					pattern.notes.push(new beepbox.Note(pitch, 0, ppb, 3, isNoise));
					synth.samplesPerSecond = 44100;
					synth.computeDelayBufferSizes();
					synth.song = song;
					synth.isPlayingSong = true;
					synth.warmUpSynthesizer(song);
					synth.snapToStart();
					synth.loopRepeatCount = -1;
					let peak = 0;
					for (let i = 0; i < 20000; i += 1000) {
						const l = new Float32Array(1000), r = new Float32Array(1000);
						synth.synthesize(l, r, 1000, true);
						for (let j = 0; j < 1000; j++) peak = Math.max(peak, Math.abs(l[j]));
					}
					synth.isPlayingSong = false;
					if (!(peak > 0.001)) (silent[(isNoise ? "drum " : "pitch ") + name] = silent[(isNoise ? "drum " : "pitch ") + name] || []).push(pitch);
				}
			}
		}
		return silent;
	});
	// ---- AudioMidi on a synthetic song: clicks at 100 BPM and a sine bass line
	const am = await page.evaluate(async () => {
		const plugin = beepbox.CarrotPlugins.get("audiomidi");
		const SR = plugin.SR, bpm = 100, beat = 60 / bpm, seconds = 24;
		const x = new Float32Array(Math.floor(seconds * SR));
		let seed = 1;
		const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;
		const bassLine = [45, 48, 50, 52];
		for (let b = 0; b * beat < seconds; b++) {
			const t0 = Math.floor((0.25 + b * beat) * SR);
			// a click on every beat, louder on the downbeat
			for (let i = 0; i < 0.03 * SR && t0 + i < x.length; i++) x[t0 + i] += rand() * (b % 4 == 0 ? 0.9 : 0.5) * Math.exp(-i / (0.006 * SR));
			// one bass note per beat
			const f = 440 * Math.pow(2, (bassLine[b % 4] - 69) / 12);
			for (let i = 0; i < beat * SR * 0.9 && t0 + i < x.length; i++) x[t0 + i] += 0.35 * (Math.sin(2 * Math.PI * f * i / SR) + 0.4 * Math.sin(4 * Math.PI * f * i / SR)) * Math.min(1, i / 200);
		}
		const r = await plugin.analyze(x, {});
		const bass = r.notes.filter(n => n.role == "bass");
		const notes = bass.slice(0, 16).map(n => n.midi);
		const right = bass.filter(n => bassLine.indexOf(n.midi) != -1).length;
		return { bpm: r.bpm, notes: notes.join(" "), right, total: bass.length, drums: r.drums.length };
	});
	check("AudioMidi finds the tempo and the bass line of a test signal", Math.abs(am.bpm - 100) < 0.6 && am.total >= 8 && am.right / am.total > 0.7, JSON.stringify(am));
	// ---- AudioMidi on a small arrangement: kick, snare, hats, bass, chords and a lead at 120 BPM
	const am2 = await page.evaluate(async () => {
		const plugin = beepbox.CarrotPlugins.get("audiomidi");
		const SR = plugin.SR, beat = 0.5, seconds = 16;
		const x = new Float32Array(Math.floor(seconds * SR));
		let seed = 7;
		const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;
		const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
		const tone = (t, midi, dur, amp, partials) => {
			const t0 = Math.floor(t * SR), f = hz(midi);
			for (let i = 0; i < dur * SR && t0 + i < x.length; i++) {
				let v = 0;
				for (let h = 1; h <= partials; h++) v += Math.sin(2 * Math.PI * f * h * i / SR) / h;
				x[t0 + i] += amp * v * Math.min(1, i / 100) * Math.min(1, (dur * SR - i) / 300) * Math.exp(-i / (2 * SR));
			}
		};
		const truth = [];
		const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], bassRoots = [36, 33, 41, 43], lead = [72, 74, 76, 79, 76, 74, 72, 71];
		for (let bar = 0; bar < 8; bar++) {
			const t = 0.25 + bar * 4 * beat, c = bar % 4;
			for (const m of chords[c]) { tone(t, m, 4 * beat * 0.95, 0.09, 6); truth.push({ t, midi: m }); }
			for (let b = 0; b < 4; b++) {
				tone(t + b * beat, bassRoots[c], beat * 0.8, 0.22, 4); truth.push({ t: t + b * beat, midi: bassRoots[c] });
				const k = Math.floor((t + b * beat) * SR);
				// kick (a falling sine), snare (noise and a body) on 2 and 4, closed hats (high noise) between
				let ph = 0;
				for (let i = 0; i < 0.3 * SR && k + i < x.length; i++) { ph += 2 * Math.PI * (45 + 110 * Math.exp(-i / (0.03 * SR))) / SR; x[k + i] += 0.7 * Math.sin(ph) * Math.exp(-i / (0.12 * SR)); }
				if (b % 2) for (let i = 0; i < 0.2 * SR && k + i < x.length; i++) x[k + i] += (0.3 * rand() + 0.3 * Math.sin(2 * Math.PI * 190 * i / SR) * Math.exp(-i / (0.03 * SR))) * Math.exp(-i / (0.06 * SR));
				const h = Math.floor((t + b * beat + beat / 2) * SR);
				let n1 = 0, n2 = 0;
				for (let i = 0; i < 0.06 * SR && h + i < x.length; i++) { const r = rand(), d1 = r - n1, d2 = d1 - n2; n1 = r; n2 = d1; x[h + i] += 0.1 * d2 * Math.exp(-i / (0.015 * SR)); }
			}
			for (let b = 0; b < 2; b++) { const m = lead[(bar * 2 + b) % lead.length]; tone(t + b * 2 * beat, m, beat * 1.8, 0.12, 3); truth.push({ t: t + b * 2 * beat, midi: m }); }
		}
		const r = await plugin.analyze(x, {});
		window.__amSmall = r;
		let hit = 0;
		for (const g of truth) if (r.notes.some(n => Math.abs(n.t - g.t) < 0.06 && n.midi == g.midi)) hit++;
		const correct = r.notes.filter(n => truth.some(g => Math.abs(n.t - g.t) < 0.06 && n.midi == g.midi)).length;
		const kicks = r.drums.filter(d => d.kind == "kick").length, snares = r.drums.filter(d => d.kind == "snare" || d.kind == "clap").length;
		return { snares, bpm: r.bpm, key: r.key.name, recall: +(hit / truth.length).toFixed(2), precision: +(correct / Math.max(1, r.notes.length)).toFixed(2), found: r.notes.length, truth: truth.length, kicks, drums: r.drums.length, chords: (r.chords || []).slice(0, 4).map(c => c.name || c).join(" ") };
	});
	check("AudioMidi transcribes a small arrangement (tempo, key, notes, drums)", Math.abs(am2.bpm - 120) < 0.6 && am2.recall > 0.6 && am2.precision > 0.5 && am2.kicks >= 28 && am2.snares >= 12 && am2.drums < 110 && am2.key == "C major", JSON.stringify(am2));
	// ---- the clean arrangement and the instruments rebuilt from the same test song (Replica)
	const am3 = await page.evaluate(async () => {
		const r = window.__amSmall, rp = await beepbox.CarrotPlugins.load("replica");
		const a = r.arr || {};
		const onGrid = (list) => list.every(n => r.beats.some((b, i) => i + 1 < r.beats.length && [0, 1, 2, 3].some(k => Math.abs(n.t - (b + (r.beats[i + 1] - b) * k / (a.grid || 4))) < 0.002)));
		const out = { grid: a.grid, bass: (a.bass || []).length, lead: (a.lead || []).length, chords: (a.chords || []).length, drums: (a.drums || []).length, onGrid: onGrid((a.bass || []).concat(a.lead || [], a.chords || [])) };
		// one voice at a time in the bass and the lead
		out.mono = ["bass", "lead"].every(role => (a[role] || []).every((n, i, l) => i == 0 || l[i - 1].t + l[i - 1].dur <= n.t + 1e-6));
		out.instruments = Object.keys(r.instruments || {}).join(",");
		out.sounds = {};
		for (const role of Object.keys(r.instruments || {})) {
			const params = rp.fromMeasurement(r.instruments[role], { name: role });
			const pcm = role == "drums" ? rp.renderNote(params, 60, 0.3, 44100, 0.9, { pad: 0 }) : rp.renderNote(params, role == "bass" ? 36 : 64, 0.5, 44100, 0.9);
			let peak = 0, bad = 0;
			for (const v of pcm) { if (!Number.isFinite(v)) bad++; else peak = Math.max(peak, Math.abs(v)); }
			out.sounds[role] = bad ? "NaN" : +peak.toFixed(3);
		}
		return out;
	});
	check("AudioMidi arranges cleanly: parts on the beat grid, one-voice bass and lead", am3.onGrid && am3.mono && am3.bass >= 20 && am3.drums >= 40, JSON.stringify(am3));
	check("AudioMidi rebuilds the instruments it hears and Replica plays them", /bass/.test(am3.instruments) && /drums/.test(am3.instruments) && Object.values(am3.sounds).every(v => typeof v == "number" && v > 0.01 && v < 4), JSON.stringify(am3));
	// ---- Utawa voice to notes: a hummed melody (off pitch, with scoops) and a beatbox
	const voice = await page.evaluate(async () => {
		const am = beepbox.CarrotPlugins.get("audiomidi");
		const SR = am.SR, bpm = 120, beat = 0.5;
		let seed = 5;
		const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;
		const melody = [[0, 60, 1], [1, 62, 0.5], [1.5, 64, 0.5], [2, 65, 1], [3, 67, 2], [5, 65, 1], [6, 64, 1], [7, 62, 1], [8, 60, 2]];
		const x = new Float32Array(Math.ceil(11 * beat * SR));
		let ph = 0;
		for (const [b, midi, len] of melody) {
			const f = 440 * Math.pow(2, (midi - 0.3 - 69) / 12), dur = len * beat * 0.9, k0 = Math.floor(b * beat * SR);
			for (let i = 0; i < dur * SR; i++) {
				const t = i / SR;
				ph += f * Math.pow(2, (-1.2 * Math.exp(-t / 0.04) + (t > 0.2 ? 0.2 * Math.sin(2 * Math.PI * 5.5 * t) : 0)) / 12) / SR;
				let v = 0;
				for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * ph * h) / (h * h);
				x[k0 + i] += 0.3 * v * Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.05);
			}
		}
		for (let i = 0; i < x.length; i++) x[i] += 0.002 * rand();
		const scale = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1].map(Boolean);
		const r = await am.analyzeVoice(x, { mode: "melody", bpm, grid: 4, scale, offset: 0 });
		const right = melody.filter(([b, midi]) => r.notes.some(n => Math.abs(n.t - b * beat) < 0.02 && n.midi == midi)).length;
		// beatbox: "boom" kicks, "pf" snares, "ts" hats
		const y = new Float32Array(Math.ceil(4.5 * SR));
		const pat = [];
		for (let s = 0; s < 16; s++) pat.push([s * 0.5, s % 4 == 0 ? "kick" : s % 4 == 2 ? "snare" : "hat"]);
		let lp = 0, h1 = 0, h2 = 0;
		for (const [b, kind] of pat) {
			const k0 = Math.floor(b * beat * SR);
			if (kind == "kick") { let p = 0; for (let i = 0; i < 0.15 * SR; i++) { p += (90 + 60 * Math.exp(-i / (0.02 * SR))) / SR; y[k0 + i] += 0.6 * Math.sin(2 * Math.PI * p) * Math.exp(-i / (0.05 * SR)); } }
			else if (kind == "snare") for (let i = 0; i < 0.12 * SR; i++) { const r2 = rand(); lp += 0.35 * (r2 - lp); y[k0 + i] += 0.5 * (r2 - lp * 0.6) * Math.exp(-i / (0.04 * SR)); }
			else for (let i = 0; i < 0.05 * SR; i++) { const r2 = rand(), d = r2 - h1; h1 = r2; const d2 = d - h2; h2 = d; y[k0 + i] += 0.25 * d2 * Math.exp(-i / (0.015 * SR)); }
		}
		const rb = await am.analyzeVoice(y, { mode: "beatbox", bpm, grid: 4, offset: 0 });
		const typed = pat.filter(([b, kind]) => rb.drums.some(d => Math.abs(d.t - b * beat) < 0.02 && d.kind == kind)).length;
		return { notes: r.notes.length, right, of: melody.length, tuning: r.tuning, hits: rb.drums.length, typed, ofHits: pat.length };
	});
	check("Utawa voice to notes hears a hummed melody and a beatbox", voice.right >= voice.of - 1 && voice.notes <= voice.of + 1 && voice.typed >= voice.ofHits - 2 && voice.hits <= voice.ofHits + 2, JSON.stringify(voice));
	check("sampler, slicex and fpc sound on every key", Object.keys(keys).length == 0, JSON.stringify(keys));

	check("no errors in the console", errors.length == 0, errors.slice(0, 5).join(" | "));
	await browser.close();
	server.close();
	console.log(failures == 0 ? "\nAll checks passed." : "\n" + failures + " check(s) failed.");
	process.exit(failures == 0 ? 0 : 1);
})();
