    // ======================================================================
    // BeepBox FL: instrument settings for Sampler, Slicex, 3x Osc and FPC,
    // plus rows for the FL effects (Parametric EQ 2, Gross Beat, Soundgoodizer).
    // ======================================================================
    function flDrawWaveform(canvas, entry, settings, options = {}) {
        const width = canvas.clientWidth || 120;
        const height = canvas.clientHeight || 44;
        const ctx = flSetupCanvas(canvas, width, height);
        ctx.clearRect(0, 0, width, height);
        const fg = options.color || flCss("--fl-accent", "#ff9b21");
        if (!entry || entry.status != "ready") {
            ctx.fillStyle = flCss("--secondary-text");
            ctx.font = "11px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(!entry ? "no sample" : entry.status == "missing" ? "missing sample (load project file)" : entry.status == "error" ? "couldn't decode sample" : "loading…", width / 2, height / 2);
            return;
        }
        const viewStart = options.viewStart || 0;
        const viewEnd = options.viewEnd || 1;
        const buckets = Math.max(16, Math.floor(width / (viewEnd - viewStart)));
        const peaks = FLSampleBank.getPeaks(entry.id, Math.min(16384, buckets));
        const mid = height / 2;
        if (settings) {
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            const sx = (settings.start - viewStart) / (viewEnd - viewStart) * width;
            const ex = (settings.end - viewStart) / (viewEnd - viewStart) * width;
            if (sx > 0)
                ctx.fillRect(0, 0, sx, height);
            if (ex < width)
                ctx.fillRect(ex, 0, width - ex, height);
        }
        ctx.strokeStyle = fg;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        const count = peaks.length / 2;
        for (let x = 0; x < width; x++) {
            const t = viewStart + (x / width) * (viewEnd - viewStart);
            const b = Math.min(count - 1, Math.max(0, Math.floor(t * count)));
            const lo = peaks[b * 2], hi = peaks[b * 2 + 1];
            ctx.moveTo(x + 0.5, mid - hi * mid * 0.95);
            ctx.lineTo(x + 0.5, mid - lo * mid * 0.95 + 0.5);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fillRect(0, mid, width, 1);
        if (settings) {
            const toX = (v) => (v - viewStart) / (viewEnd - viewStart) * width;
            if (settings.loop) {
                ctx.fillStyle = "rgba(255,220,80,0.18)";
                ctx.fillRect(toX(settings.loopStart), 0, toX(settings.loopEnd) - toX(settings.loopStart), height);
            }
            if (options.slices) {
                ctx.strokeStyle = flCss("--primary-text", "#fff");
                ctx.lineWidth = 1;
                ctx.font = "9px sans-serif";
                ctx.fillStyle = flCss("--primary-text", "#fff");
                const regions = settings.getSliceRegions();
                regions.forEach((r, i) => {
                    const x = toX(settings.start + (settings.end - settings.start) * r[0]);
                    if (i > 0) {
                        ctx.beginPath();
                        ctx.moveTo(x + 0.5, 0);
                        ctx.lineTo(x + 0.5, height);
                        ctx.stroke();
                    }
                    if (options.labels !== false)
                        ctx.fillText(String(i + 1), x + 2, 9);
                });
            }
        }
    }
    function flDrawEqCurve(canvas, settings, enabled) {
        const width = canvas.clientWidth || 120;
        const height = canvas.clientHeight || 26;
        const ctx = flSetupCanvas(canvas, width, height);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = flCss("--ui-widget-background");
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.beginPath();
        ctx.moveTo(0, height / 2 + 0.5);
        ctx.lineTo(width, height / 2 + 0.5);
        ctx.stroke();
        const minLog = Math.log2(20), maxLog = Math.log2(20000);
        ctx.strokeStyle = enabled ? flCss("--fl-accent", "#ff9b21") : flCss("--secondary-text");
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 2) {
            const hz = Math.pow(2, minLog + (maxLog - minLog) * x / width);
            const db = flPEQResponseDb(settings, hz, 48000);
            const y = height / 2 - Math.max(-24, Math.min(24, db)) / 24 * (height / 2 - 2);
            if (x == 0)
                ctx.moveTo(x, y);
            else
                ctx.lineTo(x, y);
        }
        ctx.stroke();
        settings.bands.forEach((band, i) => {
            if (!band.on)
                return;
            const x = (Math.log2(band.freq) - minLog) / (maxLog - minLog) * width;
            const db = (band.type == 0 || band.type == 6 || band.type == 3 || band.type == 4) ? 0 : band.gain;
            const y = height / 2 - db / 24 * (height / 2 - 2);
            ctx.fillStyle = FLConfig.peqBandColors[i];
            ctx.beginPath();
            ctx.arc(x, y, 2.2, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    class FLInstrumentPanel {
        constructor(doc, editor) {
            this._doc = doc;
            this._editor = editor;
            this._renderedWaveKey = "";
            this._renderedEqKey = "";
            this._renderedStepsKey = "";
            this._selectedPad = 0;
            const record = (mutate) => doc.record(new ChangeFL(doc, mutate));
            const sampler = () => flCurrentInstrument(doc).fl.sampler;
            // ---- Sampler / Slicex
            this._sampleButton = HTML.button({ type: "button", class: "fl-sample-button", title: "Choose a sample from the browser (or drag one here)" }, "…");
            this._sampleRow = HTML.div({ class: "selectRow fl-drop-target" }, HTML.span({ class: "tip", onclick: () => editor._openPrompt("flTip:sample") }, "Sample:"), this._sampleButton);
            this._waveCanvas = HTML.canvas({ class: "fl-wave-canvas fl-drop-target", title: "Click to edit the sample (start/end, loop, slices)" });
            const rootNames = [];
            for (let i = 0; i < 128; i++)
                rootNames.push(flMidiName(i));
            this._rootSelect = flMakeSelect(rootNames, (index) => record(() => { sampler().root = index; }));
            this._rootRow = flSelectRow(editor, "Root Key:", "rootKey", this._rootSelect);
            this._playbackSelect = flMakeSelect(["sustain", "loop", "one-shot"], (index) => record(() => {
                const s = sampler();
                s.loop = (index == 1);
                s.oneShot = (index == 2);
                if (s.loop && s.loopEnd <= s.loopStart) {
                    s.loopStart = 0;
                    s.loopEnd = 1;
                }
            }));
            this._playbackRow = flSelectRow(editor, "Playback:", "playback", this._playbackSelect);
            this._reverseCheck = HTML.input({ type: "checkbox" });
            this._keytrackCheck = HTML.input({ type: "checkbox" });
            this._crunchyCheck = HTML.input({ type: "checkbox" });
            this._reverseCheck.addEventListener("change", () => record(() => { sampler().reverse = this._reverseCheck.checked; }));
            this._keytrackCheck.addEventListener("change", () => record(() => { sampler().keytrack = this._keytrackCheck.checked; }));
            this._crunchyCheck.addEventListener("change", () => record(() => { sampler().crunchy = this._crunchyCheck.checked; }));
            this._checkRow = HTML.div({ class: "fl-check-row" }, HTML.label({ title: "Play the sample backwards" }, this._reverseCheck, "Reverse"), HTML.label({ title: "Follow the note's pitch (off = always the original pitch)" }, this._keytrackCheck, "Pitch"), HTML.label({ title: "No interpolation: grittier, lo-fi pitch shifting" }, this._crunchyCheck, "Lo-fi"));
            this._tuneSlider = flMakeSlider(doc, -100, 100, 1, (v) => { sampler().tune = v; }, "Fine tune (cents)");
            this._tuneRow = flSelectRow(editor, "Fine Tune:", "tune", this._tuneSlider.container);
            this._gainSlider = flMakeSlider(doc, -24, 24, 1, (v) => { sampler().gain = v; }, "Sample gain (dB)");
            this._gainRow = flSelectRow(editor, "Gain:", "gain", this._gainSlider.container);
            this._startSlider = flMakeSlider(doc, 0, 1000, 1, (v) => { const s = sampler(); s.start = Math.min(v / 1000, s.end - 0.001); }, "Sample start");
            this._startRow = flSelectRow(editor, "Start:", "startEnd", this._startSlider.container);
            this._endSlider = flMakeSlider(doc, 0, 1000, 1, (v) => { const s = sampler(); s.end = Math.max(v / 1000, s.start + 0.001); }, "Sample end");
            this._endRow = flSelectRow(editor, "End:", "startEnd", this._endSlider.container);
            this._editSampleButton = HTML.button({ type: "button" }, "Edit Sample…");
            this._browseButton = HTML.button({ type: "button" }, "Browse…");
            this._sampleButtonsRow = HTML.div({ class: "fl-row-buttons" }, this._browseButton, this._editSampleButton);
            // Slicex
            this._sliceModeSelect = flMakeSelect(["auto-detect hits", "4 equal", "8 equal", "16 equal", "32 equal"], (index) => {
                const instrument = flCurrentInstrument(doc);
                const entry = FLSampleBank.get(instrument.fl.sampler.sampleId);
                const mode = index == 0 ? "transients" : [0, 4, 8, 16, 32][index];
                const slices = FLActions.autoSlices(entry, mode);
                record(() => { instrument.fl.sampler.slices = slices; });
                flToast((slices.length + 1) + " slices");
            });
            this._sliceRow = flSelectRow(editor, "Auto Slice:", "slices", this._sliceModeSelect);
            this._chopButton = HTML.button({ type: "button", title: "Write one note per slice into the current pattern" }, "Chop to Pattern");
            this._slicexButtonsRow = HTML.div({ class: "fl-row-buttons" }, this._chopButton);
            this._sliceInfo = HTML.div({ class: "fl-hint", style: "margin: 0 0 4px; text-align: center;" });
            this._sampleGroup = HTML.div({ class: "editor-controls" }, this._sampleRow, this._waveCanvas, this._sampleButtonsRow, this._sliceRow, this._sliceInfo, this._slicexButtonsRow, this._rootRow, this._playbackRow, this._checkRow, this._tuneRow, this._gainRow, this._startRow, this._endRow);
            // ---- 3x Osc
            this._oscShapeSelects = [];
            this._oscLevelSliders = [];
            this._oscCoarseSelects = [];
            this._oscFineSliders = [];
            this._oscGroup = HTML.div({ class: "editor-controls" }, HTML.div({ class: "fl-panel-title" }, "3x OSC"));
            const coarseNames = [];
            for (let i = -48; i <= 48; i++)
                coarseNames.push((i > 0 ? "+" : "") + i + " st");
            for (let i = 0; i < 3; i++) {
                const oscIndex = i;
                const osc = () => flCurrentInstrument(doc).fl.osc3.oscs[oscIndex];
                const shapeSelect = flMakeSelect(FLConfig.oscShapes, (index) => record(() => { osc().shape = index; }), "width: 100%;");
                const levelSlider = flMakeSlider(doc, 0, 100, 1, (v) => { osc().level = v; }, "Osc " + (i + 1) + " level");
                const coarseSelect = flMakeSelect(coarseNames, (index) => record(() => { osc().coarse = index - 48; }), "width: 100%;");
                const fineSlider = flMakeSlider(doc, -100, 100, 1, (v) => { osc().fine = v; }, "Osc " + (i + 1) + " fine tune (cents)");
                this._oscShapeSelects.push(shapeSelect);
                this._oscLevelSliders.push(levelSlider);
                this._oscCoarseSelects.push(coarseSelect);
                this._oscFineSliders.push(fineSlider);
                this._oscGroup.appendChild(HTML.div({ class: "selectRow" }, HTML.span({ class: "tip fl-osc-label", onclick: () => editor._openPrompt("flTip:3xosc") }, "Osc " + (i + 1) + ":"), HTML.div({ class: "selectContainer", style: "width: 5.5em; margin-right: 4px; flex-shrink: 0;" }, shapeSelect), levelSlider.container));
                this._oscGroup.appendChild(HTML.div({ class: "selectRow" }, HTML.span({ class: "fl-osc-label" }, ""), HTML.div({ class: "selectContainer", style: "width: 5.5em; margin-right: 4px; flex-shrink: 0;" }, coarseSelect), fineSlider.container));
            }
            this._amCheck = HTML.input({ type: "checkbox" });
            this._amCheck.addEventListener("change", () => record(() => { flCurrentInstrument(doc).fl.osc3.osc3AM = this._amCheck.checked; }));
            this._phaseRandCheck = HTML.input({ type: "checkbox" });
            this._phaseRandCheck.addEventListener("change", () => record(() => { for (const o of flCurrentInstrument(doc).fl.osc3.oscs)
                o.phaseRand = this._phaseRandCheck.checked; }));
            this._oscGroup.appendChild(HTML.div({ class: "fl-check-row" }, HTML.label({ title: "Use oscillator 3 to modulate the volume of oscillators 1 and 2" }, this._amCheck, "Osc 3 AM"), HTML.label({ title: "Start each note at a random phase (wider, less clicky)" }, this._phaseRandCheck, "Phase rand")));
            // ---- FPC
            this._kitSelect = HTML.select();
            this._kitSelect.addEventListener("change", () => {
                const value = this._kitSelect.value;
                if (value.startsWith("builtin:")) {
                    FLActions.loadBuiltinKit(doc, value.slice(8));
                }
                this._renderedKitOptions = "";
            });
            this._padButtons = [];
            this._padGrid = HTML.div({ class: "fl-pad-grid" });
            for (let row = 2; row >= 0; row--) {
                for (let col = 0; col < 4; col++) {
                    const padIndex = row * 4 + col;
                    const pad = HTML.button({ type: "button", class: "fl-pad fl-drop-target" }, "");
                    pad.addEventListener("pointerdown", () => {
                        this._selectedPad = padIndex;
                        flCurrentInstrument(doc).fl.fpc.selectedPad = padIndex;
                        FLActions.previewPad(doc, padIndex);
                        pad.classList.add("fl-hit");
                        setTimeout(() => pad.classList.remove("fl-hit"), 120);
                        doc.notifier.changed();
                    });
                    this._installDrop(pad, (payload) => FLActions.loadSample(doc, payload, { pad: padIndex }));
                    this._padButtons[padIndex] = pad;
                    this._padGrid.appendChild(pad);
                }
            }
            const pad = () => flCurrentInstrument(doc).fl.fpc.pads[this._selectedPad];
            this._padLabel = HTML.div({ class: "fl-panel-title" });
            this._padVolumeSlider = flMakeSlider(doc, 0, 100, 1, (v) => { pad().volume = v; }, "Pad volume");
            this._padTuneSlider = flMakeSlider(doc, -24, 24, 1, (v) => { pad().tune = v; }, "Pad tune (semitones)");
            this._padCutSelect = flMakeSelect(["none", "group 1", "group 2", "group 3", "group 4"], (index) => record(() => { pad().cut = index; }));
            this._padReverseCheck = HTML.input({ type: "checkbox" });
            this._padReverseCheck.addEventListener("change", () => record(() => { pad().reverse = this._padReverseCheck.checked; }));
            this._padLoadButton = HTML.button({ type: "button" }, "Load Sound…");
            this._padClearButton = HTML.button({ type: "button" }, "Clear Pad");
            this._padClearButton.addEventListener("click", () => record(() => { pad().reset(); }));
            this._fpcGroup = HTML.div({ class: "editor-controls" }, HTML.div({ class: "fl-panel-title" }, "FPC"), flSelectRow(editor, "Kit:", "fpc", this._kitSelect), this._padGrid, this._padLabel, flSelectRow(editor, "Pad Vol:", "fpc", this._padVolumeSlider.container), flSelectRow(editor, "Pad Tune:", "fpc", this._padTuneSlider.container), flSelectRow(editor, "Cut Group:", "cutGroup", this._padCutSelect), HTML.div({ class: "fl-check-row" }, HTML.label(this._padReverseCheck, "Reverse pad")), HTML.div({ class: "fl-row-buttons" }, this._padLoadButton, this._padClearButton));
            // ---- Plugin instruments
            this._pluginSelect = HTML.select({ title: "Which plugin this instrument uses" });
            this._pluginSelect.addEventListener("change", () => {
                const id = this._pluginSelect.value;
                if (id == "manage") {
                    this._renderedPluginKey = "";
                    carrotOpen(editor, "flPlugins");
                    return;
                }
                if (!id || !CarrotPlugins.get(id))
                    return;
                const plugin = CarrotPlugins.get(id);
                record(() => {
                    const instrument = flCurrentInstrument(doc);
                    instrument.fl.plugin.id = id;
                    instrument.fl.plugin.params = plugin.defaultParams();
                });
                carrotOpenCurrentInstrumentPlugin(editor);
            });
            this._pluginOpenButton = HTML.button({ type: "button", class: "fl-wide-button", title: "Open the plugin window (double-click the instrument name works too)" }, "Open plugin window");
            this._pluginOpenButton.addEventListener("click", () => {
                const instrument = flCurrentInstrument(doc);
                if (instrument.fl.plugin.id && !CarrotPlugins.get(instrument.fl.plugin.id))
                    carrotOpen(editor, "flPlugins");
                else
                    carrotOpenCurrentInstrumentPlugin(editor);
            });
            this._pluginStatus = HTML.div({ class: "fl-panel-title" });
            this._renderedPluginKey = "";
            this._pluginGroup = HTML.div(flSelectRow(editor, "Plugin:", "plugin", this._pluginSelect), HTML.div({ class: "selectRow" }, this._pluginOpenButton), this._pluginStatus);
            this.typeContainer = HTML.div({ class: "editor-controls" }, this._sampleGroup, this._oscGroup, this._fpcGroup, this._pluginGroup);
            // ---- FL effects rows
            this._peqCanvas = HTML.canvas({ class: "fl-mini-graph", title: "Click to open Parametric EQ 2" });
            this._peqCanvas.addEventListener("click", () => editor._openPrompt("flEQ:instrument"));
            this._peqRow = HTML.div({ class: "selectRow" }, HTML.span({ class: "tip", onclick: () => editor._openPrompt("flTip:peq") }, "Param EQ 2:"), this._peqCanvas);
            const gross = () => flCurrentInstrument(doc).fl.gross;
            this._grossVolumeSelect = flMakeSelect(FLConfig.grossVolumePresets.map(p => p.name), (index) => record(() => { gross().volume = index; }));
            this._grossTimeSelect = flMakeSelect(FLConfig.grossTimePresets.map(p => p.name), (index) => record(() => { gross().time = index; }));
            this._grossLengthSelect = flMakeSelect(FLConfig.grossLengths.map(p => p.name), (index) => record(() => { gross().length = index; }));
            this._grossMixSlider = flMakeSlider(doc, 0, 100, 1, (v) => { gross().mix = v; }, "Gross Beat mix");
            this._grossStepsCanvas = HTML.canvas({ class: "fl-steps", title: "Draw the volume steps" });
            this._installStepsEditor(this._grossStepsCanvas, () => gross());
            this._grossGroup = HTML.div({ class: "editor-controls" }, flSelectRow(editor, "Gross Vol:", "gross", this._grossVolumeSelect), this._grossStepsCanvas, flSelectRow(editor, "Gross Time:", "gross", this._grossTimeSelect), flSelectRow(editor, "Gross Sync:", "gross", this._grossLengthSelect), flSelectRow(editor, "Gross Mix:", "gross", this._grossMixSlider.container));
            const sg = () => flCurrentInstrument(doc).fl.sg;
            this._sgModeSelect = flMakeSelect(FLConfig.sgModes, (index) => record(() => { sg().mode = index; }));
            this._sgAmountSlider = flMakeSlider(doc, 0, 100, 1, (v) => { sg().amount = v; }, "Soundgoodizer amount");
            this._sgGroup = HTML.div({ class: "editor-controls" }, flSelectRow(editor, "Goodizer:", "soundgoodizer", this._sgModeSelect), flSelectRow(editor, "Goodness:", "soundgoodizer", this._sgAmountSlider.container));
            this._insertsUI = new CarrotInsertsUI(editor, false);
            this._insertsGroup = HTML.div(HTML.div({ class: "fl-panel-title" }, "Plugin effects"), this._insertsUI.container);
            this.fxContainer = HTML.div({ class: "editor-controls" }, this._peqRow, this._grossGroup, this._sgGroup, this._insertsGroup);
            // ---- events
            const openBrowser = () => editor.flShowBrowser(true);
            this._sampleButton.addEventListener("click", openBrowser);
            this._browseButton.addEventListener("click", openBrowser);
            this._padLoadButton.addEventListener("click", openBrowser);
            this._editSampleButton.addEventListener("click", () => editor._openPrompt("flSample"));
            this._waveCanvas.addEventListener("click", () => editor._openPrompt("flSample"));
            this._chopButton.addEventListener("click", () => FLActions.chopToPattern(doc));
            this._installDrop(this._sampleRow, (payload) => FLActions.loadSample(doc, payload));
            this._installDrop(this._waveCanvas, (payload) => FLActions.loadSample(doc, payload));
        }
        _installDrop(element, onPayload) {
            element.addEventListener("dragover", (event) => {
                if (flDragHasPayload(event) || flDragHasFiles(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                    element.classList.add("fl-drop");
                }
            });
            element.addEventListener("dragleave", () => element.classList.remove("fl-drop"));
            element.addEventListener("drop", async (event) => {
                element.classList.remove("fl-drop");
                const payload = flReadDragPayload(event);
                if (payload) {
                    event.preventDefault();
                    event.stopPropagation();
                    onPayload(payload);
                }
                else if (flDragHasFiles(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                    const file = Array.from(event.dataTransfer.files).find(f => flIsAudioFileName(f.name));
                    if (file) {
                        try {
                            const id = await FLSampleBank.addFile(file);
                            onPayload({ id, name: file.name });
                        }
                        catch (error) {
                            flToast("Couldn't load " + file.name + ": " + (error.message || error));
                        }
                    }
                }
            });
        }
        _installStepsEditor(canvas, getSettings) {
            let drawing = false;
            const apply = (event) => {
                const rect = canvas.getBoundingClientRect();
                const step = Math.max(0, Math.min(15, Math.floor((event.clientX - rect.left) / rect.width * 16)));
                const value = Math.max(0, Math.min(8, Math.round((1 - (event.clientY - rect.top) / rect.height) * 8)));
                const settings = getSettings();
                if (settings.steps[step] != value) {
                    settings.steps[step] = value;
                    this._doc.notifier.changed();
                }
            };
            canvas.addEventListener("pointerdown", (event) => {
                drawing = true;
                canvas.setPointerCapture(event.pointerId);
                apply(event);
            });
            canvas.addEventListener("pointermove", (event) => { if (drawing)
                apply(event); });
            const finish = () => {
                if (!drawing)
                    return;
                drawing = false;
                this._doc.record(new ChangeFL(this._doc, () => { }));
            };
            canvas.addEventListener("pointerup", finish);
            canvas.addEventListener("pointercancel", finish);
        }
        _renderPlugin(fl) {
            const id = fl.plugin.id;
            const installed = CarrotPlugins.installedIds().filter(other => CarrotPlugins.info(other).kind == "instrument");
            const key = id + "|" + installed.join(",") + "|" + CarrotPlugins.loaded().map(p => p.id).join(",");
            if (key == this._renderedPluginKey)
                return;
            this._renderedPluginKey = key;
            this._pluginSelect.innerHTML = "";
            if (id == null)
                this._pluginSelect.appendChild(HTML.option({ value: "" }, "(choose a plugin)"));
            const ids = new Set(installed);
            if (id)
                ids.add(id);
            for (const other of ids) {
                const info = CarrotPlugins.info(other);
                const label = (info ? info.name : other) + (CarrotPlugins.isLoaded(other) ? "" : CarrotPlugins.isInstalled(other) ? " (loading…)" : " (not installed)");
                this._pluginSelect.appendChild(HTML.option({ value: other }, label));
            }
            this._pluginSelect.appendChild(HTML.option({ value: "manage" }, "Plugin Manager..."));
            this._pluginSelect.value = id || "";
            const info = id ? CarrotPlugins.info(id) : null;
            if (id == null) {
                this._pluginOpenButton.textContent = "Choose a plugin (Tab)";
                this._pluginStatus.textContent = "Install plugins in the Plugin Manager";
            }
            else if (!CarrotPlugins.isLoaded(id)) {
                this._pluginOpenButton.textContent = CarrotPlugins.isInstalled(id) ? "Loading " + (info ? info.name : id) + "…" : "Install " + (info ? info.name : id);
                this._pluginStatus.textContent = "This plugin isn't installed, so it's silent";
            }
            else {
                this._pluginOpenButton.textContent = "Open " + (info ? info.name : id);
                this._pluginStatus.textContent = info ? info.alt + "-style plugin" : "";
            }
        }
        _drawSteps(canvas, settings) {
            const width = canvas.clientWidth || 120;
            const height = canvas.clientHeight || 30;
            const ctx = flSetupCanvas(canvas, width, height);
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = flCss("--ui-widget-background");
            ctx.fillRect(0, 0, width, height);
            const stepWidth = width / 16;
            for (let i = 0; i < 16; i++) {
                const h = settings.steps[i] / 8 * (height - 2);
                ctx.fillStyle = (i % 4 == 0) ? flCss("--fl-accent", "#ff9b21") : flCss("--fl-accent-2", "#9be36b");
                ctx.fillRect(i * stepWidth + 1, height - 1 - h, stepWidth - 2, h);
            }
        }
        render() {
            const doc = this._doc;
            const instrument = flCurrentInstrument(doc);
            const type = instrument.type;
            const fl = instrument.fl;
            const isSampleType = (type == FLConfig.typeSampler || type == FLConfig.typeSlicex);
            const isSlicex = (type == FLConfig.typeSlicex);
            this._sampleGroup.style.display = isSampleType ? "" : "none";
            this._oscGroup.style.display = (type == FLConfig.typeThreeOsc) ? "" : "none";
            this._fpcGroup.style.display = (type == FLConfig.typeFPC) ? "" : "none";
            this._pluginGroup.style.display = (type == FLConfig.typePlugin) ? "" : "none";
            if (type == FLConfig.typePlugin)
                this._renderPlugin(fl);
            this._insertsGroup.style.display = fl.inserts.length > 0 ? "" : "none";
            if (fl.inserts.length > 0)
                this._insertsUI.render();
            if (isSampleType) {
                const s = fl.sampler;
                const entry = s.sampleId == null ? undefined : FLSampleBank.request(s.sampleId);
                const name = s.sampleName || FLSampleBank.getName(s.sampleId) || "(none)";
                if (this._sampleButton.textContent != name)
                    this._sampleButton.textContent = name;
                this._sampleButton.title = (entry && entry.status == "missing") ? "This sample isn't in this browser. Load the project .json that contains it, or pick a new sound." : name;
                setSelectedValue(this._rootSelect, s.root);
                setSelectedValue(this._playbackSelect, s.loop ? 1 : (s.oneShot ? 2 : 0));
                this._reverseCheck.checked = s.reverse;
                this._keytrackCheck.checked = s.keytrack;
                this._crunchyCheck.checked = s.crunchy;
                this._tuneSlider.updateValue(s.tune);
                this._gainSlider.updateValue(Math.round(s.gain));
                this._startSlider.updateValue(Math.round(s.start * 1000));
                this._endSlider.updateValue(Math.round(s.end * 1000));
                this._rootRow.style.display = isSlicex ? "none" : "";
                this._playbackRow.style.display = isSlicex ? "none" : "";
                this._sliceRow.style.display = isSlicex ? "" : "none";
                this._slicexButtonsRow.style.display = isSlicex ? "" : "none";
                this._sliceInfo.style.display = isSlicex ? "" : "none";
                if (isSlicex) {
                    const count = s.getSliceRegions().length;
                    const isNoise = doc.song.getChannelIsNoise(doc.channel);
                    this._sliceInfo.textContent = count + " slices · " + (isNoise ? "rows 1-" + Math.min(12, count) : "keys from C4 (" + flMidiName(Config.keys[doc.song.key].basePitch + 48) + ") up");
                }
                const waveKey = [s.sampleId, entry ? entry.status : "", s.start, s.end, s.loop, s.loopStart, s.loopEnd, s.slices.join(","), isSlicex, this._waveCanvas.clientWidth, ColorConfig._styleElement.textContent.length].join("|");
                if (waveKey != this._renderedWaveKey) {
                    this._renderedWaveKey = waveKey;
                    flDrawWaveform(this._waveCanvas, entry, s, { slices: isSlicex, labels: isSlicex });
                }
            }
            if (type == FLConfig.typeThreeOsc) {
                const o3 = fl.osc3;
                for (let i = 0; i < 3; i++) {
                    setSelectedValue(this._oscShapeSelects[i], o3.oscs[i].shape);
                    this._oscLevelSliders[i].updateValue(o3.oscs[i].level);
                    setSelectedValue(this._oscCoarseSelects[i], o3.oscs[i].coarse + 48);
                    this._oscFineSliders[i].updateValue(o3.oscs[i].fine);
                }
                this._amCheck.checked = o3.osc3AM;
                this._phaseRandCheck.checked = o3.oscs.every(o => o.phaseRand);
            }
            if (type == FLConfig.typeFPC) {
                const fpc = fl.fpc;
                this._selectedPad = Math.max(0, Math.min(FLConfig.fpcPadCount - 1, fpc.selectedPad));
                const kitOptions = FLSoundFactory.getKits().map(k => k.name).join("|") + "|" + fpc.kitName;
                if (this._renderedKitOptions != kitOptions) {
                    this._renderedKitOptions = kitOptions;
                    this._kitSelect.innerHTML = "";
                    this._kitSelect.appendChild(HTML.option({ value: "custom", disabled: true }, fpc.kitName && FLSoundFactory.getKits().every(k => k.name != fpc.kitName) ? fpc.kitName : "custom kit"));
                    for (const kit of FLSoundFactory.getKits())
                        this._kitSelect.appendChild(HTML.option({ value: "builtin:" + kit.name }, kit.name));
                }
                const builtin = FLSoundFactory.getKits().find(k => k.name == fpc.kitName);
                this._kitSelect.value = builtin ? "builtin:" + builtin.name : "custom";
                for (let i = 0; i < FLConfig.fpcPadCount; i++) {
                    const pad = fpc.pads[i];
                    const button = this._padButtons[i];
                    const label = (i + 1) + (pad.sampleId ? "\n" + pad.name : "");
                    if (button.textContent != label)
                        button.textContent = label;
                    button.classList.toggle("fl-selected", i == this._selectedPad);
                    button.classList.toggle("fl-empty", pad.sampleId == null);
                    button.title = pad.sampleId ? pad.name + (pad.cut ? " (cut group " + pad.cut + ")" : "") : "Empty pad: drop a sound here";
                }
                const pad = fpc.pads[this._selectedPad];
                this._padLabel.textContent = "Pad " + (this._selectedPad + 1) + (pad.sampleId ? ": " + pad.name : " (empty)");
                this._padVolumeSlider.updateValue(pad.volume);
                this._padTuneSlider.updateValue(pad.tune);
                setSelectedValue(this._padCutSelect, pad.cut);
                this._padReverseCheck.checked = pad.reverse;
            }
            // FX rows
            this._peqRow.style.display = (fl.fx & FLConfig.fxPEQ) ? "" : "none";
            this._grossGroup.style.display = (fl.fx & FLConfig.fxGross) ? "" : "none";
            this._sgGroup.style.display = (fl.fx & FLConfig.fxSoundgoodizer) ? "" : "none";
            if (fl.fx & FLConfig.fxPEQ) {
                const eqKey = fl.peq.hash() + "|" + ColorConfig._styleElement.textContent.length + "|" + this._peqCanvas.clientWidth;
                if (eqKey != this._renderedEqKey) {
                    this._renderedEqKey = eqKey;
                    flDrawEqCurve(this._peqCanvas, fl.peq, true);
                }
            }
            if (fl.fx & FLConfig.fxGross) {
                setSelectedValue(this._grossVolumeSelect, fl.gross.volume);
                setSelectedValue(this._grossTimeSelect, fl.gross.time);
                setSelectedValue(this._grossLengthSelect, fl.gross.length);
                this._grossMixSlider.updateValue(fl.gross.mix);
                const custom = fl.gross.volume == FLConfig.grossCustomIndex;
                this._grossStepsCanvas.style.display = custom ? "" : "none";
                if (custom) {
                    const key = fl.gross.steps.join(",") + this._grossStepsCanvas.clientWidth + ColorConfig._styleElement.textContent.length;
                    if (key != this._renderedStepsKey) {
                        this._renderedStepsKey = key;
                        this._drawSteps(this._grossStepsCanvas, fl.gross);
                    }
                }
            }
            if (fl.fx & FLConfig.fxSoundgoodizer) {
                setSelectedValue(this._sgModeSelect, fl.sg.mode);
                this._sgAmountSlider.updateValue(fl.sg.amount);
            }
        }
    }
