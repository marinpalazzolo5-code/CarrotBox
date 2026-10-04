    // ======================================================================
    // BeepBox FL: the sound browser (FL Studio's left-hand browser).
    // Built-in packs, FPC kits, your imported sound/drum kits, the samples in
    // the current project and a plugin picker. Click to preview, double-click
    // (or the "Load" button, or drag) to load into the current instrument.
    // ======================================================================
    class FLSoundBrowser {
        constructor(doc, editor) {
            this._doc = doc;
            this._editor = editor;
            this._expanded = new Set(["packs", "kits", "mykits", "project", "plugins"]);
            this._selectedKey = null;
            this._search = "";
            this._dirty = true;
            this._storedSamples = [];
            this._visibleRows = [];
            this._closeButton = HTML.button({ type: "button", class: "cancelButton", style: "position: relative; top: 0; right: 0;", title: "Close (F8)" });
            this._searchInput = HTML.input({ type: "search", placeholder: "Search sounds…" });
            this._tree = HTML.div({ class: "fl-tree", tabIndex: 0 });
            this._folderInput = HTML.input({ type: "file", style: "display: none;", multiple: true });
            this._folderInput.setAttribute("webkitdirectory", "");
            this._filesInput = HTML.input({ type: "file", style: "display: none;", multiple: true, accept: "audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff,.m4a,.zip" });
            this._importFolderButton = HTML.button({ type: "button", title: "Import a sound kit / drum kit folder (for example an FL Studio kit, or FL Studio's own Data/Patches/Packs folder)" }, "+ Kit Folder");
            this._importFilesButton = HTML.button({ type: "button", title: "Import audio files or a .zip kit" }, "+ Files / Zip");
            this._status = HTML.div({ class: "fl-browser-status" });
            this.container = HTML.div({ class: "fl-browser noSelection", style: "display: none;" }, HTML.div({ class: "fl-browser-header" }, HTML.h3("Browser"), this._closeButton), this._searchInput, this._tree, HTML.div({ class: "fl-browser-footer" }, this._importFolderButton, this._importFilesButton), this._status, this._folderInput, this._filesInput);
            this._closeButton.addEventListener("click", () => editor.flShowBrowser(false));
            this._searchInput.addEventListener("input", () => {
                this._search = this._searchInput.value.trim().toLowerCase();
                this._dirty = true;
                this.render();
            });
            this._searchInput.addEventListener("keydown", (event) => {
                event.stopPropagation();
                if (event.key == "ArrowDown") {
                    this._tree.focus();
                    this._moveSelection(1);
                    event.preventDefault();
                }
            });
            this._importFolderButton.addEventListener("click", () => this._folderInput.click());
            this._importFilesButton.addEventListener("click", () => this._filesInput.click());
            this._folderInput.addEventListener("change", () => { this._import(this._folderInput.files); this._folderInput.value = ""; });
            this._filesInput.addEventListener("change", () => { this._import(this._filesInput.files); this._filesInput.value = ""; });
            this._tree.addEventListener("keydown", (event) => {
                if (event.key == "ArrowDown" || event.key == "ArrowUp") {
                    event.preventDefault();
                    event.stopPropagation();
                    this._moveSelection(event.key == "ArrowDown" ? 1 : -1);
                }
                else if (event.key == "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    const row = this._visibleRows.find(r => r.key == this._selectedKey);
                    if (row)
                        this._activate(row);
                }
                else if (event.key == "ArrowRight" || event.key == "ArrowLeft") {
                    event.preventDefault();
                    event.stopPropagation();
                    const row = this._visibleRows.find(r => r.key == this._selectedKey);
                    if (row && row.type == "folder") {
                        if (event.key == "ArrowRight")
                            this._expanded.add(row.key);
                        else
                            this._expanded.delete(row.key);
                        this._dirty = true;
                        this.render();
                    }
                }
            });
            this.container.addEventListener("dragover", (event) => {
                if (flDragHasFiles(event)) {
                    event.preventDefault();
                    this.container.classList.add("fl-drop");
                }
            });
            this.container.addEventListener("dragleave", (event) => {
                if (event.target == this.container)
                    this.container.classList.remove("fl-drop");
            });
            this.container.addEventListener("drop", async (event) => {
                this.container.classList.remove("fl-drop");
                if (!flDragHasFiles(event))
                    return;
                event.preventDefault();
                const files = await FLKitLibrary.filesFromDataTransfer(event.dataTransfer);
                this._import(files);
            });
            FLSampleBank.onChange(() => {
                this._dirty = true;
                if (this.isVisible())
                    this.render();
            });
            FLKitLibrary.load().then(() => { this._dirty = true; this.render(); });
            this._refreshStored();
        }
        isVisible() {
            return this.container.style.display != "none";
        }
        async _refreshStored() {
            this._storedSamples = await FLSampleBank.listStoredSamples();
            this._dirty = true;
            if (this.isVisible())
                this.render();
        }
        async _import(fileList) {
            const files = Array.from(fileList || []);
            if (files.length == 0)
                return;
            this._status.textContent = "Importing " + files.length + " file" + (files.length == 1 ? "" : "s") + "…";
            try {
                const kits = await FLKitLibrary.importFiles(files, (message) => { this._status.textContent = message; });
                const total = kits.reduce((sum, kit) => sum + kit.files.length, 0);
                this._status.textContent = total == 0 ? "No audio files found." : "Imported " + total + " sounds into My Kits.";
                for (const kit of kits)
                    this._expanded.add("mykit:" + kit.id);
                this._expanded.add("mykits");
                if (kits.length == 1 && kits[0].files.length > 0) {
                    this._selectedKey = "mykit:" + kits[0].id;
                }
            }
            catch (error) {
                console.error(error);
                this._status.textContent = "Import failed: " + (error.message || error);
            }
            this._dirty = true;
            this.render();
        }
        // ------------------------------------------------------------ model
        _buildModel() {
            const roots = [];
            // Plugins
            const plugins = { key: "plugins", name: "Plugins", type: "folder", children: [] };
            const pluginEntries = [
                ["3x Osc", "Classic three-oscillator synth", () => this._setType(FLConfig.typeThreeOsc)],
                ["FPC", "12 drum pads (works best on a drum channel)", () => this._setType(FLConfig.typeFPC)],
                ["Sampler", "Play any sample across the keyboard", () => this._setType(FLConfig.typeSampler)],
                ["Slicex", "Chop a loop into slices", () => this._setType(FLConfig.typeSlicex)],
                ["Parametric EQ 2", "7-band EQ with spectrum (instrument effect)", () => this._toggleFx(FLConfig.fxPEQ)],
                ["Gross Beat", "Beat-synced gates & time effects (instrument effect)", () => this._toggleFx(FLConfig.fxGross)],
                ["Soundgoodizer", "One-knob loudness & glue (instrument effect)", () => this._toggleFx(FLConfig.fxSoundgoodizer)],
                ["Master Effects…", "EQ, Soundgoodizer and Gross Beat on the whole song", () => this._editor._openPrompt("flMaster")],
            ];
            for (const [name, title, action] of pluginEntries) {
                plugins.children.push({ key: "plugin:" + name, name, title, type: "plugin", action });
            }
            // CarrotBox plugins that are installed: click to use them.
            for (const info of CarrotPlugins.catalog) {
                if (!CarrotPlugins.isInstalled(info.id))
                    continue;
                const loaded = CarrotPlugins.isLoaded(info.id);
                const verb = info.kind == "instrument" ? "Load on this channel" : info.kind == "effect" ? "Add to this instrument" : "Open";
                plugins.children.push({
                    key: "plugin:" + info.id, name: info.name + (loaded ? "" : " (loading...)"), title: info.alt + "-style " + info.kind + ": " + verb, type: "plugin",
                    action: () => {
                        if (!loaded)
                            return;
                        carrotRecordUse(info.id);
                        if (info.kind == "instrument")
                            carrotLoadInstrumentPlugin(this._editor, info.id, false);
                        else if (info.kind == "effect")
                            carrotAddInsert(this._editor, info.id, false);
                        else
                            carrotOpenTool(this._editor, info.id);
                    },
                });
            }
            roots.push(plugins);
            // Current project
            const project = { key: "project", name: "Current Project", type: "folder", children: [] };
            const used = FLSampleBank.collectSongSampleIds(this._doc.song);
            for (const id of used) {
                project.children.push({ key: "proj:" + id, name: FLSampleBank.getName(id), type: "sound", payload: { id, name: FLSampleBank.getName(id) } });
            }
            const recent = { key: "recent", name: "Recently Imported", type: "folder", children: [] };
            for (const sample of this._storedSamples.slice(0, 200)) {
                recent.children.push({ key: "rec:" + sample.id, name: sample.name, type: "sound", payload: { id: sample.id, name: sample.name } });
            }
            if (recent.children.length > 0)
                project.children.push(recent);
            roots.push(project);
            // Built-in packs
            const packs = { key: "packs", name: "Packs (built-in)", type: "folder", children: [] };
            const folders = new Map();
            for (const item of FLSoundFactory.getCatalog()) {
                const parts = item.path.split("/");
                let parent = packs;
                let path = "packs";
                for (let i = 0; i < parts.length - 1; i++) {
                    path += "/" + parts[i];
                    let folder = folders.get(path);
                    if (!folder) {
                        folder = { key: path, name: parts[i], type: "folder", children: [] };
                        folders.set(path, folder);
                        parent.children.push(folder);
                    }
                    parent = folder;
                }
                parent.children.push({ key: "b:" + item.key, name: item.name, type: "sound", payload: { id: "b:" + item.key, name: item.name } });
            }
            roots.push(packs);
            // Built-in FPC kits
            const kits = { key: "kits", name: "Drum Kits (built-in)", type: "folder", children: [] };
            for (const kit of FLSoundFactory.getKits()) {
                const kitNode = { key: "kit:" + kit.name, name: kit.name, type: "folder", kitName: kit.name, children: [] };
                kit.pads.forEach((pad, i) => {
                    const info = FLSoundFactory.getInfo(pad[0]);
                    kitNode.children.push({ key: "kit:" + kit.name + ":" + i, name: (i + 1) + ". " + (info ? info.name : pad[0]), type: "sound", payload: { id: "b:" + pad[0], name: info ? info.name : pad[0] } });
                });
                kits.children.push(kitNode);
            }
            roots.push(kits);
            // Imported kits
            const mine = { key: "mykits", name: "My Kits", type: "folder", children: [], empty: "Import a kit folder or .zip below. Kits made for FL Studio work great." };
            for (const kit of FLKitLibrary.kits) {
                const kitNode = { key: "mykit:" + kit.id, name: kit.name, type: "folder", kitId: kit.id, removable: true, children: [] };
                const subfolders = new Map();
                for (const file of kit.files) {
                    const parts = file.path.split("/");
                    let parent = kitNode;
                    let path = "mykit:" + kit.id;
                    for (let i = 0; i < parts.length - 1; i++) {
                        path += "/" + parts[i];
                        let folder = subfolders.get(path);
                        if (!folder) {
                            folder = { key: path, name: parts[i], type: "folder", kitId: kit.id, children: [] };
                            subfolders.set(path, folder);
                            parent.children.push(folder);
                        }
                        parent = folder;
                    }
                    const name = parts[parts.length - 1];
                    parent.children.push({ key: "kf:" + kit.id + ":" + file.path, name: name.replace(/\.[a-z0-9]{2,5}$/i, ""), type: "sound", payload: { kitId: kit.id, path: file.path, name } });
                }
                mine.children.push(kitNode);
            }
            roots.push(mine);
            return roots;
        }
        _flatten(roots) {
            const rows = [];
            if (this._search) {
                const walk = (node, path) => {
                    if (node.type == "folder") {
                        for (const child of node.children)
                            walk(child, path + node.name + " / ");
                    }
                    else if ((path + node.name).toLowerCase().indexOf(this._search) != -1) {
                        rows.push(Object.assign({}, node, { depth: 0, hint: path }));
                    }
                };
                for (const root of roots)
                    walk(root, "");
                return rows.slice(0, 400);
            }
            const walk = (node, depth) => {
                rows.push(Object.assign({}, node, { depth }));
                if (node.type == "folder" && this._expanded.has(node.key)) {
                    if (node.children.length == 0 && node.empty)
                        rows.push({ key: node.key + ":empty", name: node.empty, type: "note", depth: depth + 1 });
                    for (const child of node.children)
                        walk(child, depth + 1);
                }
            };
            for (const root of roots)
                walk(root, 0);
            return rows;
        }
        // ------------------------------------------------------------ view
        render() {
            if (!this.isVisible() || !this._dirty)
                return;
            this._dirty = false;
            const scrollTop = this._tree.scrollTop;
            this._visibleRows = this._flatten(this._buildModel());
            const fragment = document.createDocumentFragment();
            for (const row of this._visibleRows) {
                fragment.appendChild(this._makeRow(row));
            }
            this._tree.innerHTML = "";
            this._tree.appendChild(fragment);
            this._tree.scrollTop = scrollTop;
        }
        _makeRow(row) {
            const classes = "fl-tree-row " + (row.type == "folder" ? "fl-folder" : row.type == "sound" ? "fl-sound" : "fl-plugin") + (row.key == this._selectedKey ? " fl-selected" : "");
            const arrow = HTML.span({ class: "fl-tree-arrow" }, row.type == "folder" ? (this._expanded.has(row.key) ? "▾" : "▸") : "");
            const name = HTML.span({ class: "fl-tree-name", title: row.title || row.hint || row.name }, row.name);
            const element = HTML.div({ class: classes, style: `padding-left: ${4 + row.depth * 12}px;` }, arrow, HTML.span({ class: "fl-tree-icon" }), name);
            if (row.type == "note") {
                element.style.color = "var(--secondary-text)";
                element.style.whiteSpace = "normal";
                element.style.height = "auto";
                element.style.cursor = "default";
                element.querySelector(".fl-tree-icon").style.display = "none";
                return element;
            }
            if (row.type == "plugin") {
                element.querySelector(".fl-tree-icon").style.display = "none";
                name.style.paddingLeft = "8px";
            }
            const addAction = (label, title, action) => {
                const b = HTML.button({ type: "button", class: "fl-tree-action", title }, label);
                b.addEventListener("click", (event) => { event.stopPropagation(); action(); });
                b.addEventListener("dblclick", (event) => event.stopPropagation());
                element.appendChild(b);
            };
            if (row.type == "sound") {
                addAction("Load", "Load into the current instrument (FPC: the selected pad)", () => FLActions.loadSample(this._doc, row.payload));
                element.draggable = true;
                element.addEventListener("dragstart", (event) => {
                    event.dataTransfer.setData(FL_DRAG_TYPE, JSON.stringify(row.payload));
                    event.dataTransfer.setData("text/plain", row.name);
                    event.dataTransfer.effectAllowed = "copy";
                });
            }
            else if (row.type == "folder" && row.kitName) {
                addAction("→ FPC", "Load this kit onto the FPC pads", () => FLActions.loadBuiltinKit(this._doc, row.kitName));
            }
            else if (row.type == "folder" && row.kitId) {
                addAction("→ FPC", "Put the sounds in this folder on the FPC pads", () => {
                    const sounds = [];
                    const collect = (node) => {
                        for (const child of node.children) {
                            if (child.type == "sound")
                                sounds.push(child.payload);
                        }
                        if (sounds.length < FLConfig.fpcPadCount) {
                            for (const child of node.children)
                                if (child.type == "folder")
                                    collect(child);
                        }
                    };
                    const model = this._findNode(this._buildModel(), row.key);
                    if (model)
                        collect(model);
                    FLActions.loadFolderIntoFPC(this._doc, sounds, row.name);
                });
                if (row.removable) {
                    addAction("✕", "Remove this kit from your library", () => {
                        if (window.confirm("Remove \"" + row.name + "\" from My Kits? (Songs that already use its sounds keep working.)")) {
                            FLKitLibrary.removeKit(row.kitId).then(() => { this._dirty = true; this.render(); });
                        }
                    });
                }
            }
            element.addEventListener("click", () => {
                this._selectedKey = row.key;
                for (const other of this._tree.querySelectorAll(".fl-selected"))
                    other.classList.remove("fl-selected");
                element.classList.add("fl-selected");
                if (row.type == "folder") {
                    if (this._expanded.has(row.key))
                        this._expanded.delete(row.key);
                    else
                        this._expanded.add(row.key);
                    this._dirty = true;
                    this.render();
                }
                else if (row.type == "sound") {
                    this._preview(row);
                }
                else if (row.type == "plugin") {
                    row.action();
                }
            });
            element.addEventListener("dblclick", () => {
                if (row.type == "sound")
                    FLActions.loadSample(this._doc, row.payload);
            });
            return element;
        }
        _findNode(nodes, key) {
            for (const node of nodes) {
                if (node.key == key)
                    return node;
                if (node.children) {
                    const found = this._findNode(node.children, key);
                    if (found)
                        return found;
                }
            }
            return null;
        }
        _moveSelection(delta) {
            const selectable = this._visibleRows.filter(r => r.type == "sound" || r.type == "folder" || r.type == "plugin");
            let index = selectable.findIndex(r => r.key == this._selectedKey);
            index = Math.max(0, Math.min(selectable.length - 1, index + delta));
            const row = selectable[index];
            if (!row)
                return;
            this._selectedKey = row.key;
            const elements = this._tree.children;
            for (let i = 0; i < elements.length; i++) {
                const isSelected = this._visibleRows[i] && this._visibleRows[i].key == row.key;
                elements[i].classList.toggle("fl-selected", isSelected);
                if (isSelected)
                    elements[i].scrollIntoView({ block: "nearest" });
            }
            if (row.type == "sound")
                this._preview(row);
        }
        _activate(row) {
            if (row.type == "sound")
                FLActions.loadSample(this._doc, row.payload);
            else if (row.type == "plugin")
                row.action();
            else if (row.type == "folder") {
                if (this._expanded.has(row.key))
                    this._expanded.delete(row.key);
                else
                    this._expanded.add(row.key);
                this._dirty = true;
                this.render();
            }
        }
        _preview(row) {
            const payload = row.payload;
            if (payload.id) {
                FLSampleBank.preview(payload.id);
            }
            else if (payload.kitId) {
                const kit = FLKitLibrary.kits.find(k => k.id == payload.kitId);
                if (kit)
                    FLKitLibrary.previewKitFile(kit, payload.path).catch((error) => { this._status.textContent = "Can't play " + payload.name + ": " + (error.message || error); });
            }
        }
        _setType(type) {
            const doc = this._doc;
            const isNoise = doc.song.getChannelIsNoise(doc.channel);
            doc.record(new ChangePreset(doc, type));
            flToast("This channel now uses " + ["Sampler", "3x Osc", "FPC", "Slicex"][type - 9] + (type == FLConfig.typeFPC && !isNoise ? " (tip: FPC is meant for drum channels)" : ""));
        }
        _toggleFx(bit) {
            const doc = this._doc;
            const instrument = flCurrentInstrument(doc);
            doc.record(new ChangeFL(doc, () => { instrument.fl.fx ^= bit; }));
            doc.addedEffect = (instrument.fl.fx & bit) != 0;
            flToast(FLConfig.fxNames[FLConfig.fxBits.indexOf(bit)] + ((instrument.fl.fx & bit) ? " added to" : " removed from") + " this instrument");
        }
    }
