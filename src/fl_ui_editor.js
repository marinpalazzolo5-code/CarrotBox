    // ======================================================================
    // CarrotBox: glue between BeepBox's SongEditor and the new features.
    // ======================================================================
    function flPreferenceDefs() {
        return [
            ["autoPlay", (p) => p.autoPlay, "Auto Play on Load"],
            ["autoFollow", (p) => p.autoFollow, "Automatically View Current Bar"],
            ["enableNotePreview", (p) => p.enableNotePreview, "Hear Preview of Added Notes"],
            ["showLetters", (p) => p.showLetters, "Show Piano Keys"],
            ["showFifth", (p) => p.showFifth, 'Highlight "Fifth" of Song Key'],
            ["notesOutsideScale", (p) => p.notesOutsideScale, "Allow Adding Notes Not in Scale"],
            ["setDefaultScale", (p, doc) => p.defaultScale == doc.song.scale, "Use Current Scale as Default"],
            ["showChannels", (p) => p.showChannels, "Show Ghost Notes (other channels)"],
            ["showScrollBar", (p) => p.showScrollBar, "Show Octave Scrollbar"],
            ["alwaysShowSettings", (p) => p.alwaysShowSettings, "Customize All Instruments"],
            ["instrumentCopyPaste", (p) => p.instrumentCopyPaste, "Instrument Copy/Paste Buttons"],
            ["enableChannelMuting", (p) => p.enableChannelMuting, "Enable Channel Muting"],
            ["displayBrowserUrl", (p) => p.displayBrowserUrl, "Display Song Data in URL"],
            ["flMetronome", (p) => p.metronomeEnabled, "Metronome"],
            ["flView", (p) => p.flView == "playlist", "Playlist View, FL style (F5)"],
            ["flBrowser", (p) => p.flBrowserOpen, "Show Sound Browser (F8)"],
            ["layout", null, "Choose Layout..."],
            ["colorTheme", null, "Choose Color Theme..."],
            ["recordingSetup", null, "Set Up Note Recording..."],
            ["flSettings", null, "CarrotBox Settings... (,)"],
            ["flPlugins", null, "Plugin Manager..."],
            ["flShortcuts", null, "Keyboard Shortcuts... (?)"],
        ];
    }
    function flAugmentEditor(editor) {
        const doc = editor.doc;
        editor._flPanel = new FLInstrumentPanel(doc, editor);
        editor._flPlaylist = new FLPlaylistEditor(doc, editor);
        editor._flBrowser = new FLSoundBrowser(doc, editor);
        // Instrument panels: type-specific controls first, FL effects after BeepBox's.
        editor._customInstrumentSettingsGroup.insertBefore(editor._flPanel.typeContainer, editor._eqFilterRow);
        editor._customInstrumentSettingsGroup.insertBefore(editor._flPanel.fxContainer, editor._reverbRow.nextSibling);
        // Toolbar under the play buttons.
        editor._flMetronomeButton = flIconButton("--fl-metronome-symbol", "Metronome");
        editor._flViewButton = flIconButton("--fl-playlist-symbol", "Switch to the FL-style Playlist view (F5)");
        editor._flBrowserButton = flIconButton("--fl-browser-symbol", "Sound browser: samples, kits & plugins (F8)");
        editor._flMasterButton = flIconButton("--fl-master-symbol", "Master effects & metronome volume (F9)");
        editor._flBar = HTML.div({ class: "fl-bar" }, editor._flMetronomeButton, editor._flViewButton, editor._flBrowserButton, editor._flMasterButton);
        const playPauseArea = editor._settingsArea.querySelector(".play-pause-area");
        playPauseArea.appendChild(editor._flBar);
        editor._flMetronomeButton.addEventListener("click", () => {
            doc.prefs.metronomeEnabled = !doc.prefs.metronomeEnabled;
            doc.prefs.save();
            doc.synth.enableMetronome = doc.prefs.metronomeEnabled && doc.synth.playing;
            doc.synth.metronomeVolume = doc.prefs.metronomeVolume;
            flToast(doc.prefs.metronomeEnabled ? "Metronome on" : "Metronome off", 1200);
            doc.notifier.changed();
        });
        editor._flViewButton.addEventListener("click", () => flToggleView(editor));
        editor._flBrowserButton.addEventListener("click", () => editor.flShowBrowser(!doc.prefs.flBrowserOpen));
        editor._flMasterButton.addEventListener("click", () => editor._openPrompt("flMaster"));
        // Ghost notes toggle in the piano roll.
        editor._flGhostButton = flIconButton("--fl-ghost-symbol", "Ghost notes: show other channels' notes (Alt+click one to jump to it)", "fl-ghost-button");
        editor._patternArea.appendChild(editor._flGhostButton);
        editor._flGhostButton.addEventListener("click", () => {
            doc.prefs.showChannels = !doc.prefs.showChannels;
            doc.prefs.save();
            doc.notifier.changed();
        });
        editor._flMissingSamples = HTML.div({ class: "fl-missing-sample", title: "Load the project .json that contains these samples, or choose new sounds." });
        editor._patternArea.appendChild(editor._flMissingSamples);
        editor._flMissingSamples.addEventListener("click", () => editor.flShowBrowser(true));
        // Playlist lives in the track area; the browser in the editor grid.
        editor._flSplitHandle = HTML.div({ class: "fl-split-handle", title: "Drag to resize" });
        editor._trackArea.insertBefore(editor._flSplitHandle, editor._trackArea.firstChild);
        editor._trackArea.appendChild(editor._flPlaylist.container);
        editor.mainLayer.insertBefore(editor._flBrowser.container, editor.mainLayer.firstChild);
        flInstallSplitHandle(editor);
        // Drop audio files / browser sounds on the piano roll to load them.
        editor._patternArea.addEventListener("dragover", (event) => {
            if (flDragHasPayload(event) || flDragHasFiles(event))
                event.preventDefault();
        });
        editor._patternArea.addEventListener("drop", async (event) => {
            const payload = flReadDragPayload(event);
            if (payload) {
                event.preventDefault();
                FLActions.loadSample(doc, payload);
                return;
            }
            if (flDragHasFiles(event)) {
                event.preventDefault();
                const files = await FLKitLibrary.filesFromDataTransfer(event.dataTransfer);
                const audio = files.filter(f => flIsAudioFileName(f.flRelativePath || f.webkitRelativePath || f.name));
                if (audio.length == 1 && !(audio[0].flRelativePath || "").includes("/")) {
                    try {
                        const id = await FLSampleBank.addFile(audio[0]);
                        FLActions.loadSample(doc, { id, name: audio[0].name });
                    }
                    catch (error) {
                        flToast("Couldn't load " + audio[0].name + ": " + (error.message || error));
                    }
                }
                else if (files.length > 0) {
                    editor.flShowBrowser(true);
                    editor._flBrowser._import(files);
                }
            }
        });
        editor.flShowBrowser = (show) => {
            doc.prefs.flBrowserOpen = show;
            doc.prefs.save();
            editor._flBrowser.container.style.display = show ? "" : "none";
            if (show) {
                editor._flBrowser._dirty = true;
                editor._flBrowser.render();
            }
            doc.notifier.changed();
        };
        editor._flBrowser.container.style.display = doc.prefs.flBrowserOpen ? "" : "none";
        FLSampleBank.onChange(() => {
            doc.notifier.changed();
            doc.notifier.enqueueTaskToNotifyWatchers();
        });
        window.addEventListener("beforeunload", () => FLSampleBank.stopPreview());
    }
    function flInstallSplitHandle(editor) {
        const handle = editor._flSplitHandle;
        let dragging = false;
        handle.addEventListener("pointerdown", (event) => {
            dragging = true;
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener("pointermove", (event) => {
            if (!dragging)
                return;
            const rect = editor.mainLayer.getBoundingClientRect();
            const percent = Math.max(25, Math.min(80, (event.clientY - rect.top) / rect.height * 100));
            editor.doc.prefs.flSplit = Math.round(percent);
            flApplyLayout(editor);
            editor.whenUpdated();
        });
        const end = () => {
            if (dragging) {
                dragging = false;
                editor.doc.prefs.save();
            }
        };
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
    }
    function flApplyLayout(editor) {
        const prefs = editor.doc.prefs;
        const playlist = prefs.flView == "playlist";
        const container = editor.mainLayer.parentElement;
        editor.mainLayer.classList.toggle("fl-view", playlist);
        if (container)
            container.classList.toggle("fl-container", playlist);
        if (playlist && !editor.doc.getMobileLayout()) {
            editor.mainLayer.style.gridTemplateRows = `minmax(200px, ${prefs.flSplit}fr) minmax(120px, ${100 - prefs.flSplit}fr)`;
        }
        else {
            editor.mainLayer.style.gridTemplateRows = "";
        }
    }
    function flToggleView(editor) {
        const prefs = editor.doc.prefs;
        prefs.flView = prefs.flView == "playlist" ? "grid" : "playlist";
        prefs.save();
        flApplyLayout(editor);
        flToast(prefs.flView == "playlist" ? "Playlist view (FL style)" : "BeepBox view", 1200);
        editor.doc.notifier.changed();
        setTimeout(() => editor.whenUpdated());
    }
    function flEditorUpdate(editor) {
        const doc = editor.doc;
        const prefs = doc.prefs;
        flApplyLayout(editor);
        const playlist = prefs.flView == "playlist";
        editor._flMetronomeButton.classList.toggle("fl-on", prefs.metronomeEnabled);
        editor._flViewButton.style.setProperty("--fl-icon", playlist ? "var(--fl-grid-symbol)" : "var(--fl-playlist-symbol)");
        editor._flViewButton.title = playlist ? "Switch to BeepBox's pattern grid (F5)" : "Switch to the FL-style Playlist view (F5)";
        editor._flBrowserButton.classList.toggle("fl-on", prefs.flBrowserOpen);
        editor._flGhostButton.classList.toggle("fl-on", prefs.showChannels);
        editor._flPlaylist.container.style.display = playlist ? "" : "none";
        if (playlist)
            editor._flPlaylist.render();
        editor._flPanel.render();
        if (prefs.flBrowserOpen)
            editor._flBrowser.render();
        // Warn about samples that aren't in this browser.
        let missing = 0;
        for (const id of FLSampleBank.collectSongSampleIds(doc.song)) {
            const entry = FLSampleBank.get(id);
            if (entry && (entry.status == "missing" || entry.status == "error"))
                missing++;
        }
        editor._flMissingSamples.style.display = missing > 0 ? "block" : "none";
        editor._flMissingSamples.textContent = missing + " sample" + (missing == 1 ? " is" : "s are") + " missing from this browser";
        editor._flGhostButton.style.left = prefs.showLetters ? "40px" : "6px";
        if (typeof flEditorUpdateExtras == "function")
            flEditorUpdateExtras(editor);
    }
    function flCreatePrompt(editor, name) {
        const doc = editor.doc;
        if (name == "flEQ:instrument")
            return new FLEQPrompt(doc, "instrument");
        if (name == "flEQ:master")
            return new FLEQPrompt(doc, "master");
        if (name == "flSample")
            return new FLSampleEditorPrompt(doc, editor);
        if (name == "flMaster")
            return new FLMasterPrompt(doc, editor);
        if (name == "flTheme")
            return new FLThemePrompt(doc);
        if (name.startsWith("flTip:"))
            return new FLTipPrompt(doc, name.slice(6));
        if (typeof flCreateExtraPrompt == "function")
            return flCreateExtraPrompt(editor, name);
        return null;
    }
    function flHandleMenu(editor, menu, value) {
        const doc = editor.doc;
        if (menu == "file") {
            switch (value) {
                case "saveProject":
                    flSaveProject(doc);
                    return true;
                case "kitLoader":
                    carrotOpen(editor, "flKits");
                    return true;
                case "flPacks":
                    carrotOpen(editor, "flKits:packs");
                    return true;
                case "recorder":
                    carrotOpen(editor, "flRecorder");
                    return true;
                case "hardware":
                    carrotOpen(editor, "flHardware");
                    return true;
            }
        }
        else if (menu == "edit") {
            switch (value) {
                case "leadGen":
                    carrotOpen(editor, "flLeadGen");
                    return true;
                case "duplicateBar":
                    flCopyBarToNext(doc);
                    return true;
                case "clearPattern":
                    flClearPattern(doc);
                    return true;
                case "humanize":
                    flHumanize(doc);
                    return true;
                case "quantize":
                    doc.selection.forceRhythm();
                    flToast("Snapped notes to the rhythm grid");
                    return true;
            }
        }
        else if (menu == "options") {
            switch (value) {
                case "flMetronome":
                    editor._flMetronomeButton.click();
                    return true;
                case "flView":
                    flToggleView(editor);
                    return true;
                case "flBrowser":
                    editor.flShowBrowser(!doc.prefs.flBrowserOpen);
                    return true;
                case "colorTheme":
                    editor._openPrompt("flTheme");
                    return true;
                case "flSettings":
                    carrotOpen(editor, "flSettings");
                    return true;
                case "flPlugins":
                    carrotOpen(editor, "flPlugins");
                    return true;
                case "flShortcuts":
                    carrotOpen(editor, "flShortcuts");
                    return true;
            }
        }
        return false;
    }
    function flTypingInField(event) {
        const target = event.target;
        return target && (target.tagName == "INPUT" && target.type != "range" && target.type != "checkbox" || target.tagName == "TEXTAREA" || target.isContentEditable);
    }
    // Extra keyboard shortcuts. Returns true when the key was handled.
    function flHandleKey(editor, event) {
        const doc = editor.doc;
        if (flTypingInField(event))
            return true;
        if (CarrotFLStudio.handleKey(editor, event))
            return true;
        const ctrl = event.ctrlKey || event.metaKey;
        switch (event.key) {
            case "F5":
                flToggleView(editor);
                event.preventDefault();
                return true;
            case "F8":
                editor.flShowBrowser(!doc.prefs.flBrowserOpen);
                event.preventDefault();
                return true;
            case "F9":
                editor._openPrompt("flMaster");
                event.preventDefault();
                return true;
        }
        if (typeof flHandleExtraKey == "function" && flHandleExtraKey(editor, event))
            return true;
        if (ctrl && !event.shiftKey && (event.key == "d" || event.key == "D")) {
            flCopyBarToNext(doc);
            event.preventDefault();
            return true;
        }
        return false;
    }
    // ------------------------------------------------------------ actions
    function flCopyBarToNext(doc) {
        const song = doc.song;
        const bar = doc.bar;
        const group = new ChangeGroup();
        if (bar + 1 >= song.barCount) {
            if (song.barCount >= Config.barCountMax)
                return;
            group.append(new ChangeBarCount(doc, song.barCount + 1, false));
        }
        const channelStart = doc.selection.boxSelectionActive ? doc.selection.boxSelectionChannel : 0;
        const channelEnd = doc.selection.boxSelectionActive ? channelStart + doc.selection.boxSelectionHeight : song.getChannelCount();
        for (let c = channelStart; c < channelEnd; c++) {
            group.append(new ChangePatternNumbers(doc, song.channels[c].bars[bar], bar + 1, c, 1, 1));
        }
        group.append(new ChangeChannelBar(doc, doc.channel, bar + 1));
        doc.record(group);
        flToast("Copied bar " + (bar + 1) + " to bar " + (bar + 2), 1200);
    }
    function flClearPattern(doc) {
        const pattern = doc.getCurrentPattern();
        if (pattern == null || pattern.notes.length == 0)
            return;
        const group = new ChangeGroup();
        group.append(new ChangeNoteTruncate(doc, pattern, 0, doc.song.beatsPerBar * Config.partsPerBeat));
        doc.record(group);
    }
    function flHumanize(doc) {
        const pattern = doc.getCurrentPattern();
        if (pattern == null)
            return;
        const group = new ChangeSequence();
        for (const note of pattern.notes) {
            const size = Math.max(1, Math.min(Config.noteSizeMax, note.pins[0].size + (Math.random() < 0.5 ? -1 : 0)));
            if (size != note.pins[0].size)
                group.append(new ChangeSizeBend(doc, note, 0, size, note.pins[0].interval, true));
        }
        doc.record(group);
        flToast("Humanized note volumes", 1200);
    }
    async function flSaveProject(doc) {
        const json = doc.song.toJsonObject(true, 1, true);
        const samples = [];
        let failed = 0;
        for (const id of FLSampleBank.collectSongSampleIds(doc.song)) {
            if (!id.startsWith("u:"))
                continue;
            const file = await FLSampleBank.getFileBytes(id);
            if (file)
                samples.push({ id, name: file.name, data: flBytesToBase64(file.bytes) });
            else
                failed++;
        }
        if (samples.length > 0)
            json["samples"] = samples;
        const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
        const name = (doc.song.channels[0].name || "CarrotBox-Project").replace(/[\\/:*?"<>|]+/g, "_");
        save(blob, name + ".json");
        flToast("Saved project" + (samples.length ? " with " + samples.length + " sample" + (samples.length == 1 ? "" : "s") : "") + (failed ? " (" + failed + " missing)" : ""));
    }
