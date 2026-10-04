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
	for (const query of ["swarm", "prism", "seedling", "chop", "sketch", "mangler", "utawa", "live loops", "bouncify", "sp-404"]) {
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
		for (const id of ["swarm", "prism", "seedling", "chopshop", "utawa"]) {
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
	for (const id of ["swarm", "prism", "seedling", "utawa"]) {
		const r = audio[id];
		check(id + " renders finite, audible sound for every preset", typeof r == "object" && r.nan == 0 && r.quiet == 0 && r.worstPeak < 4, JSON.stringify(r));
	}

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
	check("sound library has over 2,600 sounds", loops.sounds >= 2600, String(loops.sounds));

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
	check("sampler, slicex and fpc sound on every key", Object.keys(keys).length == 0, JSON.stringify(keys));

	check("no errors in the console", errors.length == 0, errors.slice(0, 5).join(" | "));
	await browser.close();
	server.close();
	console.log(failures == 0 ? "\nAll checks passed." : "\n" + failures + " check(s) failed.");
	process.exit(failures == 0 ? 0 : 1);
})();
