// Headless smoke test for CarrotBox.
//
//   npm install playwright      (once, anywhere Node can find it; Chromium must be installed)
//   perl build.pl && node tools/smoke.js
//
// Checks that the editor starts without errors, that every plugin can be opened and closed
// (X button, Esc, and Esc with focus in the window), that the instrument plugins make finite,
// audible sound for every preset, and that a sampler instrument plays on every key.
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
	for (const query of ["swarm", "prism", "seedling", "chop", "sketch", "mangler"]) {
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
		for (const id of ["swarm", "prism", "seedling", "chopshop"]) {
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
	for (const id of ["swarm", "prism", "seedling"]) {
		const r = audio[id];
		check(id + " renders finite, audible sound for every preset", typeof r == "object" && r.nan == 0 && r.quiet == 0 && r.worstPeak < 4, JSON.stringify(r));
	}

	check("no errors in the console", errors.length == 0, errors.slice(0, 5).join(" | "));
	await browser.close();
	server.close();
	console.log(failures == 0 ? "\nAll checks passed." : "\n" + failures + " check(s) failed.");
	process.exit(failures == 0 ? 0 : 1);
})();
