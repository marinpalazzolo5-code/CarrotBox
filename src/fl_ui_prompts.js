    // ======================================================================
    // BeepBox FL: prompts (pop-up editors).
    // Edits made in these editors are applied live (so you can hear them) and
    // saved into the song history when the editor is closed.
    // ======================================================================
    class FLLivePrompt {
        constructor(doc, isInstrumentSetting) {
            this._doc = doc;
            this._isInstrumentSetting = isInstrumentSetting;
            this.flKeepsPlaying = true;
            this._doneButton = HTML.button({ class: "okayButton", style: "width: 8em;", type: "button" }, "Done");
            this._closeButton = HTML.button({ class: "cancelButton", type: "button", title: "Close" });
            this._doneButton.addEventListener("click", () => this.flClose());
            this._closeButton.addEventListener("click", () => this.flClose());
            this._changed = false;
        }
        _watch(fn) {
            this._watchProxy = () => { if (!this._closed)
                fn(); };
            this._doc.notifier.watch(this._watchProxy);
        }
        _unwatch() {
            this._closed = true;
            const proxy = this._watchProxy;
            if (proxy)
                setTimeout(() => this._doc.notifier.unwatch(proxy));
        }
        _mutate(fn) {
            fn();
            this._changed = true;
            if (this._isInstrumentSetting) {
                const instrument = flCurrentInstrument(this._doc);
                instrument.preset = instrument.type;
            }
            this._doc.notifier.changed();
        }
        flClose() {
            this._doc.prompt = null;
            if (this._changed) {
                this._doc.record(new ChangeFL(this._doc, () => { }, this._isInstrumentSetting), true);
            }
            else {
                this._doc.undo();
            }
        }
        cleanUp() {
        }
    }
    // ---------------------------------------------------------- Parametric EQ 2
    const flEqPresets = [
        ["Flat", []],
        ["Low cut (80 Hz)", [[0, true, 0, 80, 0, 0.71, 2]]],
        ["Kick punch", [[1, true, 1, 60, 4, 0.71, 1], [2, true, 2, 320, -4, 1.4, 1], [4, true, 2, 4000, 3, 1.2, 1]]],
        ["808 clean-up", [[0, true, 0, 28, 0, 0.71, 3], [2, true, 2, 250, -4, 1.0, 1], [6, true, 6, 9000, 0, 0.71, 2]]],
        ["Vocal presence", [[0, true, 0, 90, 0, 0.71, 2], [2, true, 2, 220, -2.5, 1.2, 1], [4, true, 2, 3200, 3, 1.0, 1], [5, true, 5, 11000, 3, 0.71, 1]]],
        ["Smile curve", [[1, true, 1, 100, 4, 0.71, 1], [3, true, 2, 1000, -2, 0.8, 1], [5, true, 5, 8000, 4, 0.71, 1]]],
        ["De-mud", [[2, true, 2, 300, -4.5, 1.3, 1]]],
        ["Air", [[5, true, 5, 10000, 5, 0.71, 1]]],
        ["Bass boost", [[1, true, 1, 80, 6, 0.71, 1]]],
        ["Telephone", [[0, true, 0, 400, 0, 0.71, 4], [3, true, 2, 1500, 5, 1.0, 1], [6, true, 6, 3400, 0, 0.71, 4]]],
        ["Lo-fi", [[0, true, 0, 150, 0, 0.71, 2], [3, true, 2, 1000, 3, 0.9, 1], [6, true, 6, 4000, 0, 0.71, 2]]],
        ["Radio", [[0, true, 0, 300, 0, 0.71, 3], [3, true, 3, 1800, 0, 0.5, 1], [6, true, 6, 5000, 0, 0.71, 3]]],
    ];
    class FLEQPrompt extends FLLivePrompt {
        constructor(doc, target) {
            super(doc, target != "master");
            this._target = target;
            this._selectedBand = 3;
            this._drag = null;
            this._spectrum = null;
            const song = doc.song;
            const title = target == "master" ? "Master" : (song.channels[doc.channel].name || ("Channel " + (doc.channel + 1))) + " · " + (EditorConfig.valueToPreset(flCurrentInstrument(doc).preset) || { name: Config.instrumentTypeNames[flCurrentInstrument(doc).type] }).name;
            this._enabledCheck = HTML.input({ type: "checkbox" });
            this._analyzerCheck = HTML.input({ type: "checkbox", checked: true });
            this._presetSelect = HTML.select(HTML.option({ value: "-1", selected: true, disabled: true }, "Presets…"));
            flEqPresets.forEach((p, i) => this._presetSelect.appendChild(HTML.option({ value: String(i) }, p[0])));
            this._outputSlider = HTML.input({ type: "range", min: "-18", max: "18", step: "0.5", style: "width: 110px;" });
            this._outputLabel = HTML.span({ style: "width: 4em; display: inline-block;" });
            this._canvas = HTML.canvas({ class: "fl-eq-canvas" });
            this._bandsGrid = HTML.div({ class: "fl-eq-bands" });
            this._bandControls = [];
            for (let i = 0; i < 7; i++)
                this._bandsGrid.appendChild(this._makeBandColumn(i));
            const width = Math.min(820, window.innerWidth - 80);
            this._resetButton = HTML.button({ type: "button" }, "Reset");
            this.container = HTML.div({ class: "prompt fl-prompt noSelection", style: `width: ${width}px;` }, HTML.h2("Parametric EQ 2"), HTML.div({ style: "text-align: center; color: var(--secondary-text); margin-top: 2px;" }, title), HTML.div({ class: "fl-prompt-row" }, HTML.label({ style: "display: flex; align-items: center; gap: 6px;" }, this._enabledCheck, "Enabled"), HTML.div({ class: "selectContainer", style: "width: 10em;" }, this._presetSelect), HTML.span("Output:"), this._outputSlider, this._outputLabel, HTML.label({ style: "display: flex; align-items: center; gap: 6px; margin-left: auto;" }, this._analyzerCheck, "Spectrum")), this._canvas, this._bandsGrid, HTML.div({ class: "fl-hint" }, "Drag a dot to move a band. Scroll over it to change its width (Q). Double-click to reset its gain, right-click to switch it on or off. Click an empty spot to switch on the next free band there."), HTML.div({ class: "fl-prompt-row", style: "justify-content: space-between;" }, this._resetButton, this._doneButton), this._closeButton);
            this._enabledCheck.addEventListener("change", () => this._mutate(() => {
                if (this._target == "master") {
                    song.fl.masterFx = this._enabledCheck.checked ? (song.fl.masterFx | FLConfig.fxPEQ) : (song.fl.masterFx & ~FLConfig.fxPEQ);
                }
                else {
                    const fl = flCurrentInstrument(doc).fl;
                    fl.fx = this._enabledCheck.checked ? (fl.fx | FLConfig.fxPEQ) : (fl.fx & ~FLConfig.fxPEQ);
                }
            }));
            this._presetSelect.addEventListener("change", () => {
                const preset = flEqPresets[Number(this._presetSelect.value)];
                this._mutate(() => {
                    const s = this._settings();
                    s.reset();
                    for (const b of preset[1]) {
                        const band = s.bands[b[0]];
                        band.on = b[1];
                        band.type = b[2];
                        band.freq = b[3];
                        band.gain = b[4];
                        band.q = b[5];
                        band.slope = b[6];
                    }
                    this._enable();
                });
                this._presetSelect.value = "-1";
                this._refresh();
            });
            this._outputSlider.addEventListener("input", () => this._mutate(() => { this._settings().outGain = Number(this._outputSlider.value); this._enable(); }));
            this._resetButton.addEventListener("click", () => this._mutate(() => { this._settings().reset(); }));
            this._installCanvas();
            this._analyzer = { channel: target == "master" ? -1 : doc.channel, instrument: doc.getCurrentInstrument(), data: new Float32Array(8192), pos: 0, lastWrite: 0 };
            doc.synth.flAnalyzer = this._analyzer;
            this._watch(() => this._refresh());
            this._running = true;
            const loop = () => {
                if (!this._running)
                    return;
                this._draw();
                window.requestAnimationFrame(loop);
            };
            window.requestAnimationFrame(loop);
            setTimeout(() => this._refresh());
        }
        _settings() {
            return this._target == "master" ? this._doc.song.fl.masterPeq : flCurrentInstrument(this._doc).fl.peq;
        }
        _isEnabled() {
            return this._target == "master" ? (this._doc.song.fl.masterFx & FLConfig.fxPEQ) != 0 : (flCurrentInstrument(this._doc).fl.fx & FLConfig.fxPEQ) != 0;
        }
        _enable() {
            if (this._target == "master")
                this._doc.song.fl.masterFx |= FLConfig.fxPEQ;
            else
                flCurrentInstrument(this._doc).fl.fx |= FLConfig.fxPEQ;
        }
        _makeBandColumn(index) {
            const color = FLConfig.peqBandColors[index];
            const on = HTML.input({ type: "checkbox" });
            const type = HTML.select();
            FLConfig.peqTypes.forEach((name, i) => type.appendChild(HTML.option({ value: String(i) }, name)));
            const freq = HTML.input({ type: "number", min: String(FLConfig.peqMinHz), max: String(FLConfig.peqMaxHz), step: "1", title: "Frequency (Hz)" });
            const gain = HTML.input({ type: "number", min: "-18", max: "18", step: "0.5", title: "Gain (dB)" });
            const q = HTML.input({ type: "number", min: "0.1", max: "18", step: "0.05", title: "Bandwidth (Q)" });
            const slope = HTML.select({ title: "Slope" });
            [12, 24, 36, 48, 60].forEach((db, i) => slope.appendChild(HTML.option({ value: String(i + 1) }, db + " dB/oct")));
            const column = HTML.div({ class: "fl-eq-band", style: `--band-color: ${color};` }, HTML.label(on, HTML.b({ style: `color: ${color};` }, "Band " + (index + 1))), type, HTML.label("Hz", freq), HTML.label("dB", gain), HTML.label("Q", q), slope);
            const band = () => this._settings().bands[index];
            on.addEventListener("change", () => this._mutate(() => { band().on = on.checked; this._enable(); }));
            type.addEventListener("change", () => this._mutate(() => { band().type = Number(type.value); band().on = true; this._enable(); }));
            freq.addEventListener("change", () => this._mutate(() => { band().freq = Math.max(FLConfig.peqMinHz, Math.min(FLConfig.peqMaxHz, Number(freq.value) || 1000)); }));
            gain.addEventListener("change", () => this._mutate(() => { band().gain = Math.max(-18, Math.min(18, Number(gain.value) || 0)); }));
            q.addEventListener("change", () => this._mutate(() => { band().q = Math.max(0.1, Math.min(18, Number(q.value) || 1)); }));
            slope.addEventListener("change", () => this._mutate(() => { band().slope = Number(slope.value); }));
            column.addEventListener("pointerdown", () => { this._selectedBand = index; this._refresh(); });
            for (const input of [freq, gain, q])
                input.addEventListener("keydown", (event) => event.stopPropagation());
            this._bandControls[index] = { column, on, type, freq, gain, q, slope };
            return column;
        }
        _refresh() {
            const s = this._settings();
            this._enabledCheck.checked = this._isEnabled();
            this._outputSlider.value = String(s.outGain);
            this._outputLabel.textContent = (s.outGain > 0 ? "+" : "") + s.outGain.toFixed(1) + " dB";
            s.bands.forEach((band, i) => {
                const c = this._bandControls[i];
                c.on.checked = band.on;
                c.type.value = String(band.type);
                if (document.activeElement != c.freq)
                    c.freq.value = String(Math.round(band.freq));
                if (document.activeElement != c.gain)
                    c.gain.value = String(band.gain);
                if (document.activeElement != c.q)
                    c.q.value = String(band.q);
                c.slope.value = String(band.slope);
                const usesGain = (band.type == 1 || band.type == 2 || band.type == 5);
                c.gain.disabled = !usesGain;
                c.slope.style.display = (band.type == 0 || band.type == 6) ? "" : "none";
                c.column.classList.toggle("fl-selected", i == this._selectedBand);
                c.column.style.opacity = band.on ? "1" : "0.55";
            });
        }
        // ---- graph geometry
        _xToHz(x, width) {
            return Math.pow(2, Math.log2(20) + (Math.log2(20000) - Math.log2(20)) * x / width);
        }
        _hzToX(hz, width) {
            return (Math.log2(hz) - Math.log2(20)) / (Math.log2(20000) - Math.log2(20)) * width;
        }
        _dbToY(db, height) {
            return height / 2 - db / 24 * (height / 2 - 8);
        }
        _yToDb(y, height) {
            return (height / 2 - y) / (height / 2 - 8) * 24;
        }
        _nodePosition(band, width, height) {
            const usesGain = (band.type == 1 || band.type == 2 || band.type == 5);
            return { x: this._hzToX(band.freq, width), y: this._dbToY(usesGain ? band.gain : 0, height) };
        }
        _installCanvas() {
            const canvas = this._canvas;
            const local = (event) => {
                const rect = canvas.getBoundingClientRect();
                return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
            };
            const nearest = (p) => {
                const s = this._settings();
                let best = -1, bestDistance = 14;
                s.bands.forEach((band, i) => {
                    const n = this._nodePosition(band, p.width, p.height);
                    const d = Math.hypot(n.x - p.x, n.y - p.y);
                    if (d < bestDistance && (band.on || d < 10)) {
                        bestDistance = d;
                        best = i;
                    }
                });
                return best;
            };
            canvas.addEventListener("contextmenu", (event) => event.preventDefault());
            canvas.addEventListener("pointerdown", (event) => {
                const p = local(event);
                let index = nearest(p);
                if (event.button == 2) {
                    if (index != -1)
                        this._mutate(() => { const b = this._settings().bands[index]; b.on = !b.on; this._enable(); });
                    return;
                }
                if (index == -1) {
                    const s = this._settings();
                    index = s.bands.findIndex(b => !b.on);
                    if (index == -1)
                        return;
                    this._mutate(() => {
                        const band = s.bands[index];
                        band.on = true;
                        if (band.type == 0 || band.type == 6)
                            band.type = 2;
                        band.freq = this._xToHz(p.x, p.width);
                        band.gain = Math.round(this._yToDb(p.y, p.height) * 2) / 2;
                        this._enable();
                    });
                }
                this._selectedBand = index;
                this._drag = { index };
                canvas.setPointerCapture(event.pointerId);
                this._refresh();
            });
            canvas.addEventListener("pointermove", (event) => {
                if (!this._drag)
                    return;
                const p = local(event);
                this._mutate(() => {
                    const band = this._settings().bands[this._drag.index];
                    band.freq = Math.round(Math.max(FLConfig.peqMinHz, Math.min(FLConfig.peqMaxHz, this._xToHz(Math.max(0, Math.min(p.width, p.x)), p.width))));
                    if (band.type == 1 || band.type == 2 || band.type == 5)
                        band.gain = Math.max(-18, Math.min(18, Math.round(this._yToDb(p.y, p.height) * 2) / 2));
                });
            });
            const end = () => { this._drag = null; };
            canvas.addEventListener("pointerup", end);
            canvas.addEventListener("pointercancel", end);
            canvas.addEventListener("dblclick", (event) => {
                const index = nearest(local(event));
                if (index != -1)
                    this._mutate(() => { this._settings().bands[index].gain = 0; });
            });
            canvas.addEventListener("wheel", (event) => {
                const p = local(event);
                const index = nearest(p) != -1 ? nearest(p) : this._selectedBand;
                event.preventDefault();
                this._selectedBand = index;
                this._mutate(() => {
                    const band = this._settings().bands[index];
                    band.q = Math.max(0.1, Math.min(18, Math.round(band.q * Math.exp(-event.deltaY * 0.002) * 100) / 100));
                });
            }, { passive: false });
        }
        _computeSpectrum(width) {
            const analyzer = this._analyzer;
            const size = 4096;
            if (!this._fftReal) {
                this._fftReal = new Float32Array(size);
                this._fftImag = new Float32Array(size);
                this._window = new Float32Array(size);
                for (let i = 0; i < size; i++)
                    this._window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1));
            }
            const re = this._fftReal, im = this._fftImag;
            const data = analyzer.data;
            const mask = data.length - 1;
            const start = analyzer.pos - size;
            for (let i = 0; i < size; i++) {
                re[i] = data[(start + i) & mask] * this._window[i];
                im[i] = 0;
            }
            fastFourierTransform(re, im);
            const sampleRate = this._doc.synth.samplesPerSecond || 44100;
            const points = Math.max(16, Math.floor(width / 3));
            if (!this._spectrum || this._spectrum.length != points)
                this._spectrum = new Float32Array(points).fill(-100);
            const stale = performance.now() - analyzer.lastWrite > 250;
            for (let p = 0; p < points; p++) {
                const f0 = this._xToHz(p / points * width, width);
                const f1 = this._xToHz((p + 1) / points * width, width);
                const b0 = Math.max(1, Math.floor(f0 / sampleRate * size));
                const b1 = Math.max(b0 + 1, Math.min(size / 2, Math.ceil(f1 / sampleRate * size)));
                let power = 0;
                for (let b = b0; b < b1; b++)
                    power = Math.max(power, re[b] * re[b] + im[b] * im[b]);
                let db = stale ? -100 : 10 * Math.log10(power + 1e-12) - 20;
                const old = this._spectrum[p];
                this._spectrum[p] = db > old ? old + (db - old) * 0.6 : old + (db - old) * 0.12;
            }
        }
        _draw() {
            const canvas = this._canvas;
            const width = canvas.clientWidth || 600;
            const height = Math.max(180, Math.min(320, Math.round(width * 0.38)));
            canvas.style.height = height + "px";
            const ctx = flSetupCanvas(canvas, width, height);
            ctx.fillStyle = "#0c0f12";
            ctx.fillRect(0, 0, width, height);
            // grid
            ctx.font = "10px Roboto, sans-serif";
            ctx.textBaseline = "top";
            for (const hz of [30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000]) {
                const x = Math.round(this._hzToX(hz, width)) + 0.5;
                ctx.fillStyle = "rgba(255,255,255,0.08)";
                ctx.fillRect(x, 0, 1, height);
                ctx.fillStyle = "rgba(255,255,255,0.35)";
                ctx.fillText(hz >= 1000 ? (hz / 1000) + "k" : String(hz), x + 2, height - 12);
            }
            for (let db = -24; db <= 24; db += 6) {
                const y = Math.round(this._dbToY(db, height)) + 0.5;
                ctx.fillStyle = db == 0 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.07)";
                ctx.fillRect(0, y, width, 1);
                if (db != 0 && Math.abs(db) <= 18) {
                    ctx.fillStyle = "rgba(255,255,255,0.3)";
                    ctx.fillText((db > 0 ? "+" : "") + db, 3, y + 1);
                }
            }
            // spectrum
            if (this._analyzerCheck.checked) {
                this._computeSpectrum(width);
                const s = this._spectrum;
                ctx.beginPath();
                ctx.moveTo(0, height);
                for (let p = 0; p < s.length; p++) {
                    const x = (p + 0.5) / s.length * width;
                    const y = height - Math.max(0, Math.min(1, (s[p] + 90) / 90)) * height * 0.92;
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(width, height);
                ctx.closePath();
                ctx.fillStyle = "rgba(120,170,255,0.22)";
                ctx.fill();
            }
            const settings = this._settings();
            const enabled = this._isEnabled();
            const sampleRate = 48000;
            // band curves
            settings.bands.forEach((band, i) => {
                if (!band.on)
                    return;
                ctx.beginPath();
                for (let x = 0; x <= width; x += 3) {
                    const db = flBandResponseDb(band, this._xToHz(x, width), sampleRate);
                    const y = this._dbToY(Math.max(-30, Math.min(30, db)), height);
                    if (x == 0)
                        ctx.moveTo(x, y);
                    else
                        ctx.lineTo(x, y);
                }
                ctx.strokeStyle = FLConfig.peqBandColors[i];
                ctx.globalAlpha = i == this._selectedBand ? 0.9 : 0.45;
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.globalAlpha = 1;
            });
            // total
            ctx.beginPath();
            for (let x = 0; x <= width; x += 2) {
                const db = flPEQResponseDb(settings, this._xToHz(x, width), sampleRate);
                const y = this._dbToY(Math.max(-30, Math.min(30, db)), height);
                if (x == 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            }
            ctx.strokeStyle = enabled ? "#ffffff" : "rgba(255,255,255,0.4)";
            ctx.lineWidth = 2.2;
            ctx.stroke();
            // nodes
            settings.bands.forEach((band, i) => {
                const n = this._nodePosition(band, width, height);
                ctx.beginPath();
                ctx.arc(n.x, n.y, i == this._selectedBand ? 7.5 : 6, 0, Math.PI * 2);
                ctx.fillStyle = band.on ? FLConfig.peqBandColors[i] : "rgba(120,120,120,0.6)";
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "#0c0f12";
                ctx.stroke();
                ctx.fillStyle = "#0c0f12";
                ctx.font = "bold 9px Roboto, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(i + 1), n.x, n.y + 0.5);
                ctx.textAlign = "left";
            });
            const band = settings.bands[this._selectedBand];
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.font = "12px Roboto, sans-serif";
            ctx.textBaseline = "top";
            ctx.fillText("Band " + (this._selectedBand + 1) + " · " + FLConfig.peqTypes[band.type] + " · " + (band.freq >= 1000 ? (band.freq / 1000).toFixed(2) + " kHz" : Math.round(band.freq) + " Hz") + ((band.type == 1 || band.type == 2 || band.type == 5) ? " · " + (band.gain > 0 ? "+" : "") + band.gain + " dB" : "") + " · Q " + band.q.toFixed(2) + (band.on ? "" : " (off)"), 8, 6);
        }
        cleanUp() {
            this._running = false;
            if (this._doc.synth.flAnalyzer == this._analyzer)
                this._doc.synth.flAnalyzer = null;
            this._unwatch();
        }
    }
    // ---------------------------------------------------------- Sample editor
    class FLSampleEditorPrompt extends FLLivePrompt {
        constructor(doc, editor) {
            super(doc, true);
            this._editor = editor;
            this._viewStart = 0;
            this._viewEnd = 1;
            this._drag = null;
            const instrument = flCurrentInstrument(doc);
            this._isSlicex = instrument.type == FLConfig.typeSlicex;
            this._canvas = HTML.canvas({ class: "fl-sample-canvas" });
            this._nameLabel = HTML.div({ style: "text-align: center; color: var(--secondary-text); margin-top: 2px;" });
            this._browseButton = HTML.button({ type: "button" }, "Browse…");
            this._importInput = HTML.input({ type: "file", accept: "audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff,.m4a", style: "display: none;" });
            this._importButton = HTML.button({ type: "button" }, "Import File…");
            this._previewButton = HTML.button({ type: "button" }, "Preview");
            this._zoomOutButton = HTML.button({ type: "button", title: "Zoom out" }, "−");
            this._zoomInButton = HTML.button({ type: "button", title: "Zoom in (or scroll on the waveform)" }, "+");
            this._fitButton = HTML.button({ type: "button" }, "Fit");
            const rootNames = [];
            for (let i = 0; i < 128; i++)
                rootNames.push(flMidiName(i));
            this._rootSelect = flMakeSelect(rootNames, (i) => this._mutate(() => { this._s().root = i; }));
            this._playbackSelect = flMakeSelect(["sustain", "loop", "one-shot"], (i) => this._mutate(() => {
                const s = this._s();
                s.loop = i == 1;
                s.oneShot = i == 2;
                if (s.loop && s.loopEnd <= s.loopStart) {
                    s.loopStart = s.start;
                    s.loopEnd = s.end;
                }
            }));
            this._reverseCheck = HTML.input({ type: "checkbox" });
            this._reverseCheck.addEventListener("change", () => this._mutate(() => { this._s().reverse = this._reverseCheck.checked; }));
            this._sensitivity = HTML.input({ type: "range", min: "0", max: "100", value: "50", style: "width: 100px;" });
            this._detectButton = HTML.button({ type: "button", title: "Put a slice at every hit/transient" }, "Detect Hits");
            this._equalSelect = HTML.select(HTML.option({ value: "", disabled: true, selected: true }, "Equal slices…"), ...[2, 4, 8, 16, 32].map(n => HTML.option({ value: String(n) }, n + " slices")));
            this._clearButton = HTML.button({ type: "button" }, "Clear Slices");
            this._chopButton = HTML.button({ type: "button", title: "Write one note per slice into the current pattern" }, "Chop to Pattern");
            this._samplerRow = HTML.div({ class: "fl-prompt-row" }, HTML.span("Root key:"), HTML.div({ class: "selectContainer", style: "width: 5em;" }, this._rootSelect), HTML.span("Playback:"), HTML.div({ class: "selectContainer", style: "width: 7em;" }, this._playbackSelect), HTML.label({ style: "display: flex; align-items: center; gap: 6px;" }, this._reverseCheck, "Reverse"));
            this._slicexRow = HTML.div({ class: "fl-prompt-row" }, this._detectButton, HTML.span("Sensitivity"), this._sensitivity, HTML.div({ class: "selectContainer", style: "width: 9em;" }, this._equalSelect), this._clearButton, this._chopButton);
            this._hint = HTML.div({ class: "fl-hint" });
            const width = Math.min(860, window.innerWidth - 80);
            this.container = HTML.div({ class: "prompt fl-prompt noSelection", style: `width: ${width}px;` }, HTML.h2(this._isSlicex ? "Slicex" : "Sample Editor"), this._nameLabel, HTML.div({ class: "fl-prompt-row" }, this._browseButton, this._importButton, this._importInput, this._previewButton, HTML.span({ style: "flex: 1;" }), this._zoomOutButton, this._zoomInButton, this._fitButton), this._canvas, this._samplerRow, this._slicexRow, this._hint, HTML.div({ class: "fl-prompt-row", style: "justify-content: flex-end;" }, this._doneButton), this._closeButton);
            this._samplerRow.style.display = this._isSlicex ? "none" : "";
            this._slicexRow.style.display = this._isSlicex ? "" : "none";
            this._hint.textContent = this._isSlicex
                ? "Click the waveform to add a slice, drag slices to move them, right-click to remove one, double-click a slice to hear it. Slices play from key C4 upward (or drum rows 1-12) and repeat across the rest of the keyboard."
                : "Drag the green (start), red (end) and yellow (loop) markers. Double-click to hear the sample. Scroll to zoom.";
            this._browseButton.addEventListener("click", () => { this.flClose(); editor.flShowBrowser(true); });
            this._importButton.addEventListener("click", () => this._importInput.click());
            this._importInput.addEventListener("change", async () => {
                const file = this._importInput.files[0];
                if (!file)
                    return;
                try {
                    const id = await FLSampleBank.addFile(file);
                    const entry = FLSampleBank.get(id);
                    this._mutate(() => {
                        const s = this._s();
                        s.sampleId = id;
                        s.sampleName = file.name.replace(/\.[a-z0-9]{2,5}$/i, "");
                        s.start = 0;
                        s.end = 1;
                        s.loop = false;
                        FLActions._applySampleMetadata(s, entry);
                        if (this._isSlicex) {
                            s.slices = FLActions.autoSlices(entry, "transients");
                            if (s.slices.length < 2)
                                s.slices = FLActions.autoSlices(entry, 8);
                        }
                    });
                }
                catch (error) {
                    flToast("Couldn't load " + file.name + ": " + (error.message || error));
                }
            });
            this._previewButton.addEventListener("click", () => {
                const entry = this._entry();
                const s = this._s();
                if (entry && entry.status == "ready")
                    FLSampleBank.previewPcm(entry.pcm, entry.rate, s.start, s.end);
            });
            this._zoomInButton.addEventListener("click", () => this._zoom(0.6, 0.5));
            this._zoomOutButton.addEventListener("click", () => this._zoom(1 / 0.6, 0.5));
            this._fitButton.addEventListener("click", () => { this._viewStart = 0; this._viewEnd = 1; });
            this._detectButton.addEventListener("click", () => {
                const entry = this._entry();
                const slices = FLActions.autoSlices(entry, "transients", Number(this._sensitivity.value) / 100);
                this._mutate(() => { this._s().slices = slices; });
                flToast((slices.length + 1) + " slices");
            });
            this._equalSelect.addEventListener("change", () => {
                const count = Number(this._equalSelect.value);
                this._mutate(() => { this._s().slices = FLActions.autoSlices(this._entry(), count); });
                this._equalSelect.value = "";
            });
            this._clearButton.addEventListener("click", () => this._mutate(() => { this._s().slices = []; }));
            this._chopButton.addEventListener("click", () => {
                this.flClose();
                FLActions.chopToPattern(doc);
            });
            this._installCanvas();
            this._watch(() => this._refresh());
            this._running = true;
            const loop = () => {
                if (!this._running)
                    return;
                this._draw();
                window.requestAnimationFrame(loop);
            };
            window.requestAnimationFrame(loop);
            setTimeout(() => this._refresh());
        }
        _s() {
            return flCurrentInstrument(this._doc).fl.sampler;
        }
        _entry() {
            const s = this._s();
            return s.sampleId == null ? null : FLSampleBank.request(s.sampleId);
        }
        _refresh() {
            const s = this._s();
            const entry = this._entry();
            const seconds = entry && entry.status == "ready" ? (entry.pcm.length / entry.rate).toFixed(2) + " s" : (entry ? entry.status : "no sample");
            this._nameLabel.textContent = (s.sampleName || FLSampleBank.getName(s.sampleId) || "(no sample)") + " · " + seconds + (this._isSlicex ? " · " + s.getSliceRegions().length + " slices" : "");
            setSelectedValue(this._rootSelect, s.root);
            setSelectedValue(this._playbackSelect, s.loop ? 1 : (s.oneShot ? 2 : 0));
            this._reverseCheck.checked = s.reverse;
        }
        _zoom(factor, anchor) {
            const span = this._viewEnd - this._viewStart;
            const center = this._viewStart + span * anchor;
            const next = Math.max(0.002, Math.min(1, span * factor));
            this._viewStart = Math.max(0, Math.min(1 - next, center - next * anchor));
            this._viewEnd = this._viewStart + next;
        }
        _markers() {
            const s = this._s();
            const markers = [{ kind: "start", value: s.start, color: "#5ef08a" }, { kind: "end", value: s.end, color: "#ff6b6b" }];
            if (!this._isSlicex && s.loop) {
                markers.push({ kind: "loopStart", value: s.loopStart, color: "#ffd84d" });
                markers.push({ kind: "loopEnd", value: s.loopEnd, color: "#ffd84d" });
            }
            if (this._isSlicex) {
                s.slices.forEach((value, i) => markers.push({ kind: "slice", index: i, value: s.start + (s.end - s.start) * value, color: "#ffffff" }));
            }
            return markers;
        }
        _installCanvas() {
            const canvas = this._canvas;
            const local = (event) => {
                const rect = canvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                return { x, width: rect.width, value: this._viewStart + (x / rect.width) * (this._viewEnd - this._viewStart) };
            };
            const toX = (value, width) => (value - this._viewStart) / (this._viewEnd - this._viewStart) * width;
            const nearestMarker = (p) => {
                let best = null, bestDistance = 8;
                for (const marker of this._markers()) {
                    const d = Math.abs(toX(marker.value, p.width) - p.x);
                    if (d < bestDistance) {
                        bestDistance = d;
                        best = marker;
                    }
                }
                return best;
            };
            canvas.addEventListener("contextmenu", (event) => event.preventDefault());
            canvas.addEventListener("pointerdown", (event) => {
                const p = local(event);
                const marker = nearestMarker(p);
                const s = this._s();
                if (event.button == 2) {
                    if (marker && marker.kind == "slice")
                        this._mutate(() => { s.slices.splice(marker.index, 1); });
                    return;
                }
                if (marker) {
                    this._drag = marker;
                    canvas.setPointerCapture(event.pointerId);
                    return;
                }
                if (this._isSlicex && p.value > s.start && p.value < s.end) {
                    const relative = (p.value - s.start) / (s.end - s.start);
                    this._mutate(() => {
                        s.slices.push(relative);
                        s.slices.sort((a, b) => a - b);
                    });
                    const index = s.slices.indexOf(relative);
                    this._drag = { kind: "slice", index, value: p.value };
                    canvas.setPointerCapture(event.pointerId);
                }
            });
            canvas.addEventListener("pointermove", (event) => {
                const p = local(event);
                if (!this._drag) {
                    canvas.style.cursor = nearestMarker(p) ? "ew-resize" : (this._isSlicex ? "copy" : "default");
                    return;
                }
                const v = Math.max(0, Math.min(1, p.value));
                const drag = this._drag;
                this._mutate(() => {
                    const s = this._s();
                    if (drag.kind == "start")
                        s.start = Math.min(v, s.end - 0.001);
                    else if (drag.kind == "end")
                        s.end = Math.max(v, s.start + 0.001);
                    else if (drag.kind == "loopStart")
                        s.loopStart = Math.min(v, s.loopEnd - 0.0005);
                    else if (drag.kind == "loopEnd")
                        s.loopEnd = Math.max(v, s.loopStart + 0.0005);
                    else if (drag.kind == "slice") {
                        const relative = Math.max(0.0005, Math.min(0.9995, (v - s.start) / (s.end - s.start)));
                        s.slices[drag.index] = relative;
                        const moved = s.slices[drag.index];
                        s.slices.sort((a, b) => a - b);
                        drag.index = s.slices.indexOf(moved);
                    }
                });
            });
            const end = () => { this._drag = null; };
            canvas.addEventListener("pointerup", end);
            canvas.addEventListener("pointercancel", end);
            canvas.addEventListener("dblclick", (event) => {
                const p = local(event);
                const entry = this._entry();
                const s = this._s();
                if (!entry || entry.status != "ready")
                    return;
                if (this._isSlicex) {
                    const relative = (p.value - s.start) / (s.end - s.start);
                    const region = s.getSliceRegions().find(r => relative >= r[0] && relative < r[1]);
                    if (region)
                        FLSampleBank.previewPcm(entry.pcm, entry.rate, s.start + (s.end - s.start) * region[0], s.start + (s.end - s.start) * region[1]);
                }
                else {
                    FLSampleBank.previewPcm(entry.pcm, entry.rate, Math.max(s.start, p.value), s.end);
                }
            });
            canvas.addEventListener("wheel", (event) => {
                event.preventDefault();
                const p = local(event);
                if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
                    const span = this._viewEnd - this._viewStart;
                    const shift = (event.shiftKey ? event.deltaY : event.deltaX) / p.width * span;
                    this._viewStart = Math.max(0, Math.min(1 - span, this._viewStart + shift));
                    this._viewEnd = this._viewStart + span;
                }
                else {
                    this._zoom(Math.exp(event.deltaY * 0.002), p.x / p.width);
                }
            }, { passive: false });
        }
        _draw() {
            const canvas = this._canvas;
            const width = canvas.clientWidth || 600;
            const height = 210;
            canvas.style.height = height + "px";
            const s = this._s();
            const entry = this._entry();
            flDrawWaveform(canvas, entry, s, { viewStart: this._viewStart, viewEnd: this._viewEnd, slices: this._isSlicex, color: "#59d8ff" });
            const ctx = canvas.getContext("2d");
            const toX = (value) => (value - this._viewStart) / (this._viewEnd - this._viewStart) * width;
            for (const marker of this._markers()) {
                if (marker.kind == "slice")
                    continue;
                const x = Math.round(toX(marker.value)) + 0.5;
                ctx.fillStyle = marker.color;
                ctx.fillRect(x - 1, 0, 2, height);
                ctx.beginPath();
                const label = { start: "S", end: "E", loopStart: "L", loopEnd: "L" }[marker.kind];
                ctx.moveTo(x, 0);
                ctx.lineTo(x + (marker.kind == "end" || marker.kind == "loopEnd" ? -10 : 10), 0);
                ctx.lineTo(x, 12);
                ctx.fill();
                ctx.fillStyle = "#000";
                ctx.font = "bold 8px sans-serif";
                ctx.fillText(label, x + (marker.kind == "end" || marker.kind == "loopEnd" ? -7 : 2), 5);
            }
            // playback position of the current preview isn't tracked; show the zoom range instead.
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.font = "10px Roboto, sans-serif";
            if (entry && entry.status == "ready") {
                const seconds = (v) => (v * entry.pcm.length / entry.rate).toFixed(2) + "s";
                ctx.textBaseline = "bottom";
                ctx.fillText(seconds(this._viewStart), 4, height - 3);
                ctx.textAlign = "right";
                ctx.fillText(seconds(this._viewEnd), width - 4, height - 3);
                ctx.textAlign = "left";
            }
        }
        cleanUp() {
            this._running = false;
            this._unwatch();
        }
    }
    // ---------------------------------------------------------- Master effects
    class FLMasterPrompt extends FLLivePrompt {
        constructor(doc, editor) {
            super(doc, false);
            const song = doc.song;
            const fl = song.fl;
            const toggle = (bit, label) => {
                const check = HTML.input({ type: "checkbox" });
                check.checked = (fl.masterFx & bit) != 0;
                check.addEventListener("change", () => this._mutate(() => { fl.masterFx = check.checked ? (fl.masterFx | bit) : (fl.masterFx & ~bit); }));
                return HTML.label({ style: "display: flex; align-items: center; gap: 8px; cursor: pointer;" }, check, label);
            };
            this._eqCanvas = HTML.canvas({ class: "fl-mini-graph", style: "width: 100%; height: 60px;" });
            const editEq = HTML.button({ type: "button" }, "Open Parametric EQ 2…");
            editEq.addEventListener("click", () => {
                this._mutate(() => { fl.masterFx |= FLConfig.fxPEQ; });
                this._doc.prompt = null;
                this._doc.record(new ChangeFL(this._doc, () => { }, false), true);
                setTimeout(() => editor._openPrompt("flEQ:master"));
            });
            this._eqCanvas.addEventListener("click", () => editEq.click());
            const sgMode = flMakeSelect(FLConfig.sgModes, (i) => this._mutate(() => { fl.masterSg.mode = i; }));
            sgMode.value = String(fl.masterSg.mode);
            const sgAmount = HTML.input({ type: "range", min: "0", max: "100", value: String(fl.masterSg.amount), style: "width: 160px;" });
            sgAmount.addEventListener("input", () => this._mutate(() => { fl.masterSg.amount = Number(sgAmount.value); }));
            const gbVolume = flMakeSelect(FLConfig.grossVolumePresets.map(p => p.name), (i) => this._mutate(() => { fl.masterGross.volume = i; }));
            gbVolume.value = String(fl.masterGross.volume);
            const gbTime = flMakeSelect(FLConfig.grossTimePresets.map(p => p.name), (i) => this._mutate(() => { fl.masterGross.time = i; }));
            gbTime.value = String(fl.masterGross.time);
            const gbLength = flMakeSelect(FLConfig.grossLengths.map(p => p.name), (i) => this._mutate(() => { fl.masterGross.length = i; }));
            gbLength.value = String(fl.masterGross.length);
            const gbMix = HTML.input({ type: "range", min: "0", max: "100", value: String(fl.masterGross.mix), style: "width: 120px;" });
            gbMix.addEventListener("input", () => this._mutate(() => { fl.masterGross.mix = Number(gbMix.value); }));
            const prefs = doc.prefs;
            const metroCheck = HTML.input({ type: "checkbox" });
            metroCheck.checked = prefs.metronomeEnabled;
            metroCheck.addEventListener("change", () => { prefs.metronomeEnabled = metroCheck.checked; prefs.save(); doc.synth.enableMetronome = metroCheck.checked && doc.synth.playing; doc.notifier.changed(); });
            const metroVolume = HTML.input({ type: "range", min: "0", max: "100", value: String(Math.round(prefs.metronomeVolume * 100)), style: "width: 160px;" });
            metroVolume.addEventListener("input", () => { prefs.metronomeVolume = Number(metroVolume.value) / 100; prefs.save(); doc.synth.metronomeVolume = prefs.metronomeVolume; });
            const sel = (s, w) => HTML.div({ class: "selectContainer", style: `width: ${w};` }, s);
            this.container = HTML.div({ class: "prompt fl-prompt noSelection", style: "width: 440px;" }, HTML.h2("Master"), HTML.div({ class: "fl-section" }, HTML.h3(toggle(FLConfig.fxPEQ, "Parametric EQ 2")), this._eqCanvas, HTML.div({ class: "fl-prompt-row" }, editEq)), HTML.div({ class: "fl-section" }, HTML.h3(toggle(FLConfig.fxSoundgoodizer, "Soundgoodizer")), HTML.div({ class: "fl-prompt-row" }, HTML.span("Mode"), sel(sgMode, "9em"), HTML.span("Amount"), sgAmount)), HTML.div({ class: "fl-section" }, HTML.h3(toggle(FLConfig.fxGross, "Gross Beat")), HTML.div({ class: "fl-prompt-row" }, HTML.span("Volume"), sel(gbVolume, "10em"), HTML.span("Time"), sel(gbTime, "10em")), HTML.div({ class: "fl-prompt-row" }, HTML.span("Sync"), sel(gbLength, "6em"), HTML.span("Mix"), gbMix)), HTML.div({ class: "fl-section" }, HTML.h3(HTML.label({ style: "display: flex; align-items: center; gap: 8px; cursor: pointer;" }, metroCheck, "Metronome")), HTML.div({ class: "fl-prompt-row" }, HTML.span("Volume"), metroVolume)), HTML.div({ class: "fl-hint" }, "Master effects process the whole song (they are saved with the song). The metronome is a preference."), HTML.div({ class: "fl-prompt-row", style: "justify-content: flex-end;" }, this._doneButton), this._closeButton);
            setTimeout(() => flDrawEqCurve(this._eqCanvas, fl.masterPeq, (fl.masterFx & FLConfig.fxPEQ) != 0));
            this._watch(() => flDrawEqCurve(this._eqCanvas, fl.masterPeq, (fl.masterFx & FLConfig.fxPEQ) != 0));
        }
        cleanUp() {
            this._unwatch();
        }
    }
    // ---------------------------------------------------------- Themes
    class FLThemePrompt {
        constructor(doc) {
            this._doc = doc;
            this.flKeepsPlaying = true;
            this._closeButton = HTML.button({ class: "cancelButton", type: "button" });
            this._doneButton = HTML.button({ class: "okayButton", type: "button", style: "width: 8em;" }, "Done");
            this._grid = HTML.div({ class: "fl-theme-grid" });
            const names = ["dark classic", "light classic"].concat(Object.keys(ColorConfig.flThemePreviews).filter(n => n != "dark classic" && n != "light classic"));
            for (const name of names) {
                const p = ColorConfig.flThemePreviews[name];
                const dots = HTML.div({ class: "fl-theme-dots" }, ...p.colors.map(c => HTML.span({ style: `background: ${c};` })));
                const card = HTML.button({ type: "button", class: "fl-theme-card", style: `background: ${p.bg}; color: ${p.text};` }, HTML.div({ style: `height: 18px; border-radius: 4px; background: ${p.row}; border-left: 6px solid ${p.accent};` }), dots, HTML.div({ style: "font-size: 12px;" }, name.replace(/\b\w/g, c => c.toUpperCase())));
                card.addEventListener("click", () => {
                    doc.prefs.colorTheme = name;
                    doc.prefs.save();
                    ColorConfig.setTheme(name);
                    for (const other of this._grid.children)
                        other.classList.remove("fl-selected");
                    card.classList.add("fl-selected");
                    doc.notifier.changed();
                });
                if (doc.prefs.colorTheme == name)
                    card.classList.add("fl-selected");
                this._grid.appendChild(card);
            }
            this.container = HTML.div({ class: "prompt fl-prompt noSelection", style: "width: 640px;" }, HTML.h2("Color Theme"), this._grid, HTML.div({ class: "fl-prompt-row", style: "justify-content: flex-end;" }, this._doneButton), this._closeButton);
            this._closeButton.addEventListener("click", () => this.flClose());
            this._doneButton.addEventListener("click", () => this.flClose());
        }
        flClose() {
            this._doc.undo();
        }
        cleanUp() {
        }
    }
    // ---------------------------------------------------------- Tips
    const flTips = {
        sample: ["Sample", "The audio file this instrument plays. Click to open the browser, or drag a sound from the browser (or an audio file from your computer) onto this row or the waveform. Click the waveform to open the sample editor."],
        rootKey: ["Root Key", "The note at which the sample plays at its original pitch (FL Studio naming: C5 is middle C). Samples that include a root key (WAV 'smpl' data) set this automatically."],
        playback: ["Playback", "Sustain: the sample plays while the note is held and fades out with the instrument's fade-out setting. Loop: the yellow loop region repeats while the note is held. One-shot: the whole sample always plays to the end, no matter how short the note is (great for drums)."],
        tune: ["Fine Tune", "Shifts the sample's pitch in cents (1/100 of a semitone)."],
        gain: ["Gain", "Boosts or cuts the sample's volume in decibels."],
        startEnd: ["Start / End", "Trims the sample. You can also drag the green and red markers in the sample editor."],
        slices: ["Slicex", "Slicex chops a sample into slices and plays each slice from its own key: slice 1 is C4, slice 2 is C♯4 and so on (on a drum channel, slice 1 is the bottom row). Auto-slice finds the hits in a drum loop, or splits it evenly. 'Chop to Pattern' writes the slices into the current pattern so the loop plays back; then rearrange the notes to remix it."],
        "3xosc": ["3x Osc", "Three oscillators mixed together, like FL Studio's classic 3x Osc. For each oscillator choose a wave shape, its level, its coarse pitch (semitones) and fine tune (cents). 'Osc 3 AM' turns oscillator 3 into a volume modulator for the other two. Use BeepBox's EQ, note filter and envelopes to shape the sound."],
        fpc: ["FPC", "Twelve drum pads. On a drum channel, pad 1 is the bottom row and pad 12 the top row (on a pitched channel, the pads follow the notes C to B). Click a pad to hear it and edit its volume and tune, drop sounds from the browser onto pads, or load a whole kit."],
        cutGroup: ["Cut Group", "Pads in the same cut group silence each other, like a closed hi-hat cutting off an open hi-hat."],
        peq: ["Parametric EQ 2", "A 7-band equalizer with low/high cuts (12 to 60 dB per octave), shelves, peaks, band-pass and notch filters, plus a live spectrum analyzer. Click the curve to open the full editor."],
        gross: ["Gross Beat", "Rhythmic volume and time effects synced to the song: trance gates, sidechain pumping, stutters, half-speed, reverse and tape stops. 'Sync' sets how long one cycle lasts. Pick 'custom steps' to draw your own 16-step volume pattern."],
        soundgoodizer: ["Soundgoodizer", "A one-knob 'make it sound good' processor: compression, saturation and EQ in four flavours. A: smooth glue, B: brighter and wider, C: loud and punchy, D: extra bass."],
        ghost: ["Ghost Notes", "Shows the notes of the other channels behind the current pattern, at their real pitch, like FL Studio's ghost notes. Alt+click a ghost note to jump to its channel."],
        view: ["Views", "BeepBox view shows the song as numbered pattern boxes. Playlist view shows one continuous timeline with clips that show their notes; zoom with Ctrl/⌘+scroll (or pinch), resize tracks with Alt+scroll, drag clips to move them and drag a clip's right edge to repeat it."],
    };
    class FLTipPrompt {
        constructor(doc, name) {
            this._doc = doc;
            const tip = flTips[name] || ["BeepBox FL", "No help for this yet."];
            this._closeButton = HTML.button({ class: "cancelButton", type: "button" });
            this.container = HTML.div({ class: "prompt", style: "width: 300px;" }, HTML.div(HTML.h2(tip[0]), HTML.p(tip[1])), this._closeButton);
            this._closeButton.addEventListener("click", () => this._doc.undo());
        }
        cleanUp() {
        }
    }
