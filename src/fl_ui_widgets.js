    // ======================================================================
    // BeepBox FL: small UI helpers and editor actions shared by the panels.
    // ======================================================================
    const FL_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    // FL Studio names MIDI note 60 "C5".
    function flMidiName(midi) {
        return FL_NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12));
    }
    function flIconButton(iconVar, title, extraClass = "") {
        const b = HTML.button({ type: "button", class: "fl-icon-button " + extraClass, title: title });
        b.style.setProperty("--fl-icon", "var(" + iconVar + ")");
        return b;
    }
    function flToast(message, millis = 2600) {
        if (typeof CarrotSettings != "undefined" && CarrotSettings.get("toasts") === false)
            return;
        let toast = document.querySelector(".fl-toast");
        const host = document.querySelector(".beepboxEditor") || document.body;
        if (!toast) {
            toast = HTML.div({ class: "fl-toast" });
            host.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = "1";
        clearTimeout(flToast._timer);
        flToast._timer = setTimeout(() => { toast.style.opacity = "0"; }, millis);
    }
    const flCssCache = new Map();
    let flCssCacheTheme = null;
    function flCss(variableName, fallback = "#888") {
        const theme = ColorConfig._styleElement.textContent;
        if (flCssCacheTheme !== theme) {
            flCssCache.clear();
            flCssCacheTheme = theme;
        }
        let value = flCssCache.get(variableName);
        if (value == undefined) {
            value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim() || fallback;
            flCssCache.set(variableName, value);
        }
        return value;
    }
    // Resolves "var(--x)" style color strings for canvas drawing.
    function flResolve(color) {
        const match = /^var\((--[\w-]+)\)$/.exec(color);
        return match ? flCss(match[1]) : color;
    }
    function flChannelColors(song, channel) {
        const c = ColorConfig.getChannelColor(song, channel);
        return { secondaryChannel: flResolve(c.secondaryChannel), primaryChannel: flResolve(c.primaryChannel), secondaryNote: flResolve(c.secondaryNote), primaryNote: flResolve(c.primaryNote) };
    }
    function flSetupCanvas(canvas, width, height) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(width * dpr));
        const h = Math.max(1, Math.round(height * dpr));
        if (canvas.width != w || canvas.height != h) {
            canvas.width = w;
            canvas.height = h;
        }
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return ctx;
    }
    function flCurrentInstrument(doc) {
        const channel = doc.song.channels[doc.channel];
        return channel.instruments[Math.max(0, Math.min(channel.instruments.length - 1, doc.getCurrentInstrument() | 0))];
    }
    function flMakeSlider(doc, min, max, step, apply, title = "") {
        return new Slider(HTML.input({ style: "margin: 0;", type: "range", min: String(min), max: String(max), value: String(min), step: String(step), title: title }), doc, (oldValue, newValue) => new ChangeFL(doc, () => apply(newValue)));
    }
    function flMakeSelect(options, onChange, style = "") {
        const menu = HTML.select({ style: style });
        options.forEach((label, index) => menu.appendChild(HTML.option({ value: index }, label)));
        menu.addEventListener("change", () => onChange(menu.selectedIndex));
        return menu;
    }
    function flSelectRow(editor, label, tipName, control) {
        return HTML.div({ class: "selectRow" }, HTML.span({ class: "tip", onclick: () => editor._openPrompt("flTip:" + tipName) }, label), control.tagName == "SELECT" ? HTML.div({ class: "selectContainer" }, control) : control);
    }
    // Drag & drop payloads from the sound browser.
    const FL_DRAG_TYPE = "application/x-beepbox-fl-sound";
    function flReadDragPayload(event) {
        try {
            const text = event.dataTransfer.getData(FL_DRAG_TYPE);
            return text ? JSON.parse(text) : null;
        }
        catch (error) {
            return null;
        }
    }
    function flDragHasPayload(event) {
        return event.dataTransfer && Array.from(event.dataTransfer.types || []).indexOf(FL_DRAG_TYPE) != -1;
    }
    function flDragHasFiles(event) {
        return event.dataTransfer && Array.from(event.dataTransfer.types || []).indexOf("Files") != -1;
    }
    class FLActions {
        // Turns a browser payload ({id,name} or {kitId,path,name}) into a sample id.
        static async payloadToSampleId(payload) {
            if (payload.id)
                return payload.id;
            if (payload.kitId) {
                await FLKitLibrary.load();
                const kit = FLKitLibrary.kits.find(k => k.id == payload.kitId);
                if (!kit)
                    throw new Error("That kit is no longer in your library.");
                return FLKitLibrary.getKitFileSampleId(kit, payload.path);
            }
            throw new Error("Nothing to load.");
        }
        static _applySampleMetadata(sampler, entry) {
            if (entry && entry.status == "ready") {
                if (entry.rootKey != null)
                    sampler.root = entry.rootKey;
                if (entry.loopStart != null && entry.loopEnd != null && entry.loopEnd > entry.loopStart + 16) {
                    sampler.loop = true;
                    sampler.loopStart = entry.loopStart / entry.pcm.length;
                    sampler.loopEnd = entry.loopEnd / entry.pcm.length;
                }
                if (sampler.sampleId && sampler.sampleId.startsWith("b:")) {
                    const info = FLSoundFactory.render(sampler.sampleId.slice(2));
                    if (info && info.loop) {
                        sampler.loop = true;
                        sampler.loopStart = info.loop[0];
                        sampler.loopEnd = info.loop[1];
                    }
                }
            }
        }
        static autoSlices(entry, mode, sensitivity = 0.5, song = null) {
            if (!entry || entry.status != "ready")
                return [];
            if (mode == "transients") {
                let slices = FLSampleBank.detectTransients(entry.pcm, entry.rate, sensitivity);
                if (entry.cues && entry.cues.length > 0)
                    slices = entry.cues.map(c => c / entry.pcm.length).filter(x => x > 0.001 && x < 0.999);
                if (slices.length > 31)
                    slices = slices.filter((x, i) => i % Math.ceil(slices.length / 31) == 0);
                return slices;
            }
            const count = typeof mode == "number" ? mode : 8;
            const slices = [];
            for (let i = 1; i < count; i++)
                slices.push(i / count);
            return slices;
        }
        // Loads a sample into the current instrument. FPC loads into the
        // selected pad; Sampler/Slicex swap their sample; any other instrument
        // is turned into a Sampler.
        static async loadSample(doc, payload, options = {}) {
            let id;
            try {
                id = await FLActions.payloadToSampleId(payload);
            }
            catch (error) {
                flToast(String(error.message || error));
                return;
            }
            const entry = id.startsWith("b:") ? FLSampleBank.requestNow(id) : await FLSampleBank.whenReady(id);
            if (entry.status != "ready") {
                flToast("Couldn't decode " + (payload.name || "that file") + ".");
                return;
            }
            const name = (payload.name || entry.name || FLSampleBank.getName(id)).replace(/\.[a-z0-9]{2,5}$/i, "");
            const channel = options.channel != undefined ? options.channel : doc.channel;
            if (options.channel != undefined && options.channel != doc.channel) {
                doc.selection.setChannelBar(options.channel, doc.bar);
            }
            const isNoise = doc.song.getChannelIsNoise(channel);
            const instrument = doc.song.channels[channel].instruments[doc.getCurrentInstrument()];
            doc.record(new ChangeFL(doc, () => {
                if (instrument.type == FLConfig.typeFPC) {
                    const padIndex = options.pad != undefined ? options.pad : instrument.fl.fpc.selectedPad;
                    const pad = instrument.fl.fpc.pads[padIndex];
                    pad.sampleId = id;
                    pad.name = name;
                    instrument.fl.fpc.kitName = "";
                    return;
                }
                if (instrument.type != FLConfig.typeSampler && instrument.type != FLConfig.typeSlicex) {
                    instrument.type = FLConfig.typeSampler;
                    instrument.fl.sampler.reset();
                    instrument.fl.sampler.oneShot = isNoise;
                    instrument.chord = Config.chords.dictionary["simultaneous"].index;
                    instrument.effects &= ~(1 << 11);
                    instrument.clearInvalidEnvelopeTargets();
                }
                const sampler = instrument.fl.sampler;
                const keepRoot = sampler.root;
                sampler.sampleId = id;
                sampler.sampleName = name;
                sampler.start = 0;
                sampler.end = 1;
                sampler.loop = false;
                sampler.root = keepRoot;
                FLActions._applySampleMetadata(sampler, entry);
                if (instrument.type == FLConfig.typeSlicex) {
                    sampler.slices = FLActions.autoSlices(entry, "transients");
                    if (sampler.slices.length < 2)
                        sampler.slices = FLActions.autoSlices(entry, 8);
                }
            }));
            flToast("Loaded " + name + (instrument.type == FLConfig.typeFPC ? " into pad " + ((options.pad != undefined ? options.pad : instrument.fl.fpc.selectedPad) + 1) : ""));
        }
        static async loadFolderIntoFPC(doc, payloads, kitName) {
            const instrument = flCurrentInstrument(doc);
            const ids = [];
            for (const payload of payloads.slice(0, FLConfig.fpcPadCount)) {
                try {
                    ids.push({ id: await FLActions.payloadToSampleId(payload), name: (payload.name || "").replace(/\.[a-z0-9]{2,5}$/i, "") });
                }
                catch (error) {
                    console.warn(error);
                }
            }
            if (ids.length == 0)
                return;
            doc.record(new ChangeFL(doc, () => {
                if (instrument.type != FLConfig.typeFPC) {
                    instrument.type = FLConfig.typeFPC;
                    instrument.chord = Config.chords.dictionary["simultaneous"].index;
                    instrument.effects &= ~(1 << 11);
                    instrument.clearInvalidEnvelopeTargets();
                }
                const fpc = instrument.fl.fpc;
                for (let i = 0; i < FLConfig.fpcPadCount; i++) {
                    fpc.pads[i].reset();
                    if (ids[i]) {
                        fpc.pads[i].sampleId = ids[i].id;
                        fpc.pads[i].name = ids[i].name;
                        if (/hat|hh/i.test(ids[i].name))
                            fpc.pads[i].cut = 1;
                    }
                }
                fpc.kitName = kitName || "";
            }));
            flToast("Loaded " + ids.length + " sounds onto the FPC pads");
        }
        static loadBuiltinKit(doc, kitName) {
            const instrument = flCurrentInstrument(doc);
            doc.record(new ChangeFL(doc, () => {
                if (instrument.type != FLConfig.typeFPC) {
                    instrument.type = FLConfig.typeFPC;
                    instrument.chord = Config.chords.dictionary["simultaneous"].index;
                    instrument.effects &= ~(1 << 11);
                    instrument.clearInvalidEnvelopeTargets();
                }
                instrument.fl.fpc.loadBuiltinKit(kitName);
            }));
            for (const pad of instrument.fl.fpc.pads)
                FLSampleBank.request(pad.sampleId);
        }
        // Writes one note per slice into the current pattern, spread over the bar.
        static chopToPattern(doc) {
            const instrument = flCurrentInstrument(doc);
            const settings = instrument.fl.sampler;
            const regions = settings.getSliceRegions();
            const isNoise = doc.song.getChannelIsNoise(doc.channel);
            const maxSlices = isNoise ? Config.drumCount : 36;
            const partsPerBar = doc.song.beatsPerBar * Config.partsPerBeat;
            const group = new ChangeGroup();
            group.append(new ChangeEnsurePatternExists(doc, doc.channel, doc.bar));
            const pattern = doc.getCurrentPattern();
            if (pattern == null)
                return;
            group.append(new ChangeNoteTruncate(doc, pattern, 0, partsPerBar));
            const positions = regions.map(r => Math.round(r[0] * partsPerBar));
            for (let i = 0; i < Math.min(regions.length, maxSlices); i++) {
                const start = Math.min(partsPerBar - 1, positions[i]);
                let end = (i + 1 < positions.length) ? positions[i + 1] : partsPerBar;
                end = Math.max(start + 1, Math.min(partsPerBar, end));
                const pitch = isNoise ? i : 48 + i;
                const note = new Note(pitch, start, end, Config.noteSizeMax, false);
                group.append(new ChangeNoteAdded(doc, pattern, note, pattern.notes.length));
            }
            doc.record(group);
            flToast("Chopped " + Math.min(regions.length, maxSlices) + " slices into this pattern");
        }
        static previewPad(doc, padIndex) {
            const isNoise = doc.song.getChannelIsNoise(doc.channel);
            doc.performance.setTemporaryPitches([isNoise ? padIndex : 48 + padIndex], Config.partsPerBeat);
        }
    }
