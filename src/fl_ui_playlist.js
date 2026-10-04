    // ======================================================================
    // BeepBox FL: the Playlist view. The whole song as one continuous
    // timeline: each channel is a track and each bar's pattern is a clip that
    // shows its notes. Zoom with Ctrl/⌘+scroll (or pinch), Alt+scroll for
    // track height, middle-drag to pan.
    // ======================================================================
    class FLPlaylistEditor {
        constructor(doc, editor) {
            this._doc = doc;
            this._editor = editor;
            this.rulerHeight = 22;
            this.barWidth = Math.max(10, Math.min(800, Number(FLPlaylistEditor._load("flPlaylistBarWidth")) || 84));
            this.rowHeight = Math.max(22, Math.min(160, Number(FLPlaylistEditor._load("flPlaylistRowHeight")) || 44));
            this._dirty = true;
            this._hover = null;
            this._drag = null;
            this._spaceHeld = false;
            this._renderedHeaderCount = -1;
            this._lastSelectionKey = "";
            this._lastPlayheadX = -1;
            this._zoomOutButton = HTML.button({ type: "button", title: "Zoom out (Ctrl/⌘ + scroll)" }, "−");
            this._zoomInButton = HTML.button({ type: "button", title: "Zoom in (Ctrl/⌘ + scroll)" }, "+");
            this._zoomSlider = HTML.input({ type: "range", min: "0", max: "100", step: "1", title: "Zoom" });
            this._fitButton = HTML.button({ type: "button", title: "Fit the whole song in view" }, "Fit");
            this._rowsSmaller = HTML.button({ type: "button", title: "Shorter tracks (Alt + scroll)" }, "▁");
            this._rowsBigger = HTML.button({ type: "button", title: "Taller tracks (Alt + scroll)" }, "▆");
            this._title = HTML.span({ class: "fl-title" }, "Playlist – Arrangement");
            this._toolbar = HTML.div({ class: "fl-playlist-toolbar" }, this._title, this._rowsSmaller, this._rowsBigger, this._zoomOutButton, this._zoomSlider, this._zoomInButton, this._fitButton);
            this._addPitchButton = HTML.button({ type: "button", title: "Add an instrument track" }, "+ Inst");
            this._addDrumButton = HTML.button({ type: "button", title: "Add a drum track" }, "+ Drum");
            this._headerCorner = HTML.div({ style: `position: absolute; left: 0; right: 0; top: 0; height: ${this.rulerHeight}px; display: flex; gap: 2px; padding: 1px 2px; box-sizing: border-box; z-index: 1; background: var(--fl-panel, ${ColorConfig.editorBackground});` }, this._addPitchButton, this._addDrumButton);
            for (const b of [this._addPitchButton, this._addDrumButton]) {
                b.style.height = (this.rulerHeight - 2) + "px";
                b.style.fontSize = "10px";
                b.style.flex = "1";
                b.style.padding = "0";
            }
            this._headersInner = HTML.div({ class: "fl-playlist-headers-inner" });
            this._headers = HTML.div({ class: "fl-playlist-headers" }, this._headersInner, this._headerCorner);
            this._canvas = HTML.canvas({ style: "position: absolute; left: 0; top: 0;" });
            this._overlay = HTML.canvas({ style: "position: absolute; left: 0; top: 0; pointer-events: none;" });
            this._stage = HTML.div({ class: "fl-playlist-canvas" }, this._canvas, this._overlay);
            this._sizer = HTML.div({ class: "fl-playlist-sizer" });
            this._scroller = HTML.div({ class: "fl-playlist-scroller prefers-big-scrollbars", tabIndex: -1 }, this._stage, this._sizer);
            this._body = HTML.div({ class: "fl-playlist-body" }, this._headers, this._scroller);
            this.container = HTML.div({ class: "fl-playlist" }, this._toolbar, this._body);
            this._trackHeaders = [];
            // ------------------------------------------------- toolbar
            this._zoomInButton.addEventListener("click", () => this._zoomBy(1.4, null));
            this._zoomOutButton.addEventListener("click", () => this._zoomBy(1 / 1.4, null));
            this._zoomSlider.addEventListener("input", () => {
                const bw = 10 * Math.pow(80, Number(this._zoomSlider.value) / 100);
                this._zoomTo(bw, null);
            });
            this._fitButton.addEventListener("click", () => {
                const width = this._scroller.clientWidth - 8;
                this._zoomTo(width / Math.max(1, this._doc.song.barCount), null);
                this._scroller.scrollLeft = 0;
            });
            this._rowsSmaller.addEventListener("click", () => this._setRowHeight(this.rowHeight - 8));
            this._rowsBigger.addEventListener("click", () => this._setRowHeight(this.rowHeight + 8));
            this._addPitchButton.addEventListener("click", () => {
                const group = new ChangeGroup();
                const index = this._doc.song.pitchChannelCount;
                group.append(new ChangeAddChannel(this._doc, index, false));
                if (!group.isNoop()) {
                    group.append(new ChangeChannelBar(this._doc, index, this._doc.bar));
                    this._doc.record(group);
                }
                else
                    flToast("You can have up to " + Config.pitchChannelCountMax + " instrument tracks.");
            });
            this._addDrumButton.addEventListener("click", () => {
                const group = new ChangeGroup();
                const index = this._doc.song.getChannelCount();
                group.append(new ChangeAddChannel(this._doc, index, true));
                if (!group.isNoop()) {
                    group.append(new ChangeChannelBar(this._doc, index, this._doc.bar));
                    this._doc.record(group);
                }
                else
                    flToast("You can have up to " + Config.noiseChannelCountMax + " drum tracks.");
            });
            // ------------------------------------------------- canvas input
            this._scroller.addEventListener("scroll", () => {
                this._headersInner.style.transform = `translateY(${this.rulerHeight - this._scroller.scrollTop}px)`;
                this._dirty = true;
            }, { passive: true });
            this._scroller.addEventListener("wheel", (event) => this._onWheel(event), { passive: false });
            this._scroller.addEventListener("pointerdown", (event) => this._onPointerDown(event));
            this._scroller.addEventListener("pointermove", (event) => this._onPointerMove(event));
            this._scroller.addEventListener("pointerup", (event) => this._onPointerUp(event));
            this._scroller.addEventListener("pointercancel", () => { this._drag = null; this._dirty = true; });
            this._scroller.addEventListener("pointerleave", () => { this._hover = null; this._overlayDirty = true; });
            this._scroller.addEventListener("dblclick", (event) => this._onDoubleClick(event));
            this._scroller.addEventListener("contextmenu", (event) => event.preventDefault());
            this._scroller.addEventListener("dragover", (event) => {
                if (flDragHasPayload(event)) {
                    event.preventDefault();
                    this._hover = this._hitTest(event);
                    this._overlayDirty = true;
                }
            });
            this._scroller.addEventListener("drop", (event) => {
                const payload = flReadDragPayload(event);
                if (payload) {
                    event.preventDefault();
                    const hit = this._hitTest(event);
                    if (hit && hit.channel >= 0)
                        FLActions.loadSample(this._doc, payload, { channel: hit.channel });
                }
            });
            if (typeof ResizeObserver != "undefined") {
                new ResizeObserver(() => { this._dirty = true; }).observe(this._scroller);
            }
            this._animate = () => {
                if (this.container.isConnected && this.container.offsetParent != null)
                    this._frame();
                window.requestAnimationFrame(this._animate);
            };
            window.requestAnimationFrame(this._animate);
        }
        static _load(key) {
            try {
                return window.localStorage.getItem(key);
            }
            catch (error) {
                return null;
            }
        }
        static _save(key, value) {
            try {
                window.localStorage.setItem(key, String(value));
            }
            catch (error) { }
        }
        // ------------------------------------------------------- geometry
        _contentWidth() {
            return (this._doc.song.barCount + 8) * this.barWidth;
        }
        _localPoint(event) {
            const rect = this._scroller.getBoundingClientRect();
            const vx = event.clientX - rect.left;
            const vy = event.clientY - rect.top;
            return { vx, vy, x: vx + this._scroller.scrollLeft, y: vy - this.rulerHeight + this._scroller.scrollTop };
        }
        _hitTest(event) {
            const p = this._localPoint(event);
            const song = this._doc.song;
            const barPos = p.x / this.barWidth;
            const bar = Math.floor(barPos);
            if (p.vy < this.rulerHeight)
                return { ruler: true, bar, barPos, channel: -1, x: p.x, y: p.y };
            const channel = Math.floor(p.y / this.rowHeight);
            const valid = channel >= 0 && channel < song.getChannelCount();
            let clip = 0;
            if (valid && bar >= 0 && bar < song.barCount)
                clip = song.channels[channel].bars[bar];
            const edge = clip > 0 && (p.x - bar * this.barWidth) > this.barWidth - Math.min(10, this.barWidth * 0.3);
            const titleHit = clip > 0 && (p.y - channel * this.rowHeight) < 14;
            return { ruler: false, bar, barPos, channel: valid ? channel : -1, clip, edge, titleHit, x: p.x, y: p.y };
        }
        _zoomTo(barWidth, anchorClientX) {
            const old = this.barWidth;
            const next = Math.max(6, Math.min(800, barWidth));
            if (next == old)
                return;
            const rect = this._scroller.getBoundingClientRect();
            const anchor = anchorClientX == null ? this._scroller.clientWidth / 2 : anchorClientX - rect.left;
            const barAtAnchor = (this._scroller.scrollLeft + anchor) / old;
            this.barWidth = next;
            this._updateSizer();
            this._scroller.scrollLeft = Math.max(0, barAtAnchor * next - anchor);
            FLPlaylistEditor._save("flPlaylistBarWidth", Math.round(next));
            this._dirty = true;
        }
        _zoomBy(factor, anchorClientX) {
            this._zoomTo(this.barWidth * factor, anchorClientX);
        }
        _setRowHeight(height) {
            const next = Math.max(22, Math.min(160, height));
            if (next == this.rowHeight)
                return;
            this.rowHeight = next;
            FLPlaylistEditor._save("flPlaylistRowHeight", next);
            this._renderedHeaderCount = -1;
            this._updateSizer();
            this._dirty = true;
            this.render();
        }
        _updateSizer() {
            const song = this._doc.song;
            this._sizer.style.width = this._contentWidth() + "px";
            this._sizer.style.height = (this.rulerHeight + song.getChannelCount() * this.rowHeight + 24) + "px";
            this._zoomSlider.value = String(Math.round(100 * Math.log(this.barWidth / 10) / Math.log(80)));
        }
        // ------------------------------------------------------- input
        _onWheel(event) {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                const delta = event.deltaMode == 1 ? event.deltaY * 16 : event.deltaY;
                this._zoomBy(Math.exp(-delta * 0.0025), event.clientX);
            }
            else if (event.altKey) {
                event.preventDefault();
                this._setRowHeight(this.rowHeight + (event.deltaY < 0 ? 4 : -4));
            }
        }
        _onPointerDown(event) {
            const doc = this._doc;
            const hit = this._hitTest(event);
            this._scroller.setPointerCapture(event.pointerId);
            if (event.button == 1) {
                event.preventDefault();
                this._drag = { mode: "pan", startX: event.clientX, startY: event.clientY, scrollLeft: this._scroller.scrollLeft, scrollTop: this._scroller.scrollTop };
                return;
            }
            if (hit.ruler) {
                this._drag = { mode: "ruler", startBar: Math.max(0, Math.min(doc.song.barCount - 1, hit.bar)), startBarPos: hit.barPos, moved: false, change: null };
                return;
            }
            if (hit.channel < 0)
                return;
            if (event.button == 2) {
                this._drag = { mode: "delete", touched: new Set() };
                this._deleteAt(hit);
                return;
            }
            if (event.button != 0)
                return;
            if (event.shiftKey) {
                const bar = Math.max(0, Math.min(doc.song.barCount - 1, hit.bar));
                doc.selection.setTrackSelection(doc.selection.boxSelectionX0, bar, doc.selection.boxSelectionY0, hit.channel);
                doc.selection.selectionUpdated();
                this._drag = { mode: "box" };
                return;
            }
            if (hit.clip > 0 && hit.edge) {
                this._drag = { mode: "stretch", channel: hit.channel, bar: hit.bar, pattern: hit.clip, target: hit.bar };
                return;
            }
            if (hit.bar >= 0 && hit.bar < doc.song.barCount) {
                const inBox = doc.selection.boxSelectionActive && hit.bar >= doc.selection.boxSelectionBar && hit.bar < doc.selection.boxSelectionBar + doc.selection.boxSelectionWidth && hit.channel >= doc.selection.boxSelectionChannel && hit.channel < doc.selection.boxSelectionChannel + doc.selection.boxSelectionHeight;
                if (!inBox) {
                    doc.selection.setChannelBar(hit.channel, hit.bar);
                    doc.selection.resetBoxSelection();
                }
                if (hit.clip > 0 || inBox) {
                    this._drag = { mode: "move", channel: hit.channel, bar: hit.bar, pattern: hit.clip, offset: 0, copy: event.ctrlKey || event.metaKey || event.altKey, startBarPos: hit.barPos, box: inBox };
                }
                else {
                    this._drag = { mode: "box" };
                }
            }
        }
        _onPointerMove(event) {
            const doc = this._doc;
            const hit = this._hitTest(event);
            const drag = this._drag;
            if (drag == null) {
                const old = this._hover;
                this._hover = hit;
                if (!old || old.bar != hit.bar || old.channel != hit.channel || old.edge != hit.edge || old.ruler != hit.ruler)
                    this._overlayDirty = true;
                this._scroller.style.cursor = hit.ruler ? "col-resize" : (hit.clip > 0 ? (hit.edge ? "ew-resize" : "grab") : "default");
                return;
            }
            switch (drag.mode) {
                case "pan":
                    this._scroller.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
                    this._scroller.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
                    break;
                case "ruler": {
                    const bar = Math.max(0, Math.min(doc.song.barCount - 1, hit.bar));
                    if (bar != drag.startBar || drag.moved) {
                        drag.moved = true;
                        const start = Math.min(bar, drag.startBar);
                        const end = Math.max(bar, drag.startBar) + 1;
                        const oldStart = drag.change ? drag.change.oldStart : doc.song.loopStart;
                        const oldLength = drag.change ? drag.change.oldLength : doc.song.loopLength;
                        drag.change = new ChangeLoop(doc, oldStart, oldLength, start, end - start);
                        doc.setProspectiveChange(drag.change);
                        this._dirty = true;
                    }
                    break;
                }
                case "delete":
                    this._deleteAt(hit);
                    break;
                case "box": {
                    if (hit.channel < 0 && !hit.ruler)
                        break;
                    const bar = Math.max(0, Math.min(doc.song.barCount - 1, hit.bar));
                    const channel = Math.max(0, Math.min(doc.song.getChannelCount() - 1, hit.channel < 0 ? doc.selection.boxSelectionY1 : hit.channel));
                    if (bar != doc.selection.boxSelectionX1 || channel != doc.selection.boxSelectionY1) {
                        doc.selection.setTrackSelection(doc.selection.boxSelectionX0, bar, doc.selection.boxSelectionY0, channel);
                        doc.selection.selectionUpdated();
                    }
                    break;
                }
                case "move": {
                    const offset = Math.round(hit.barPos - drag.startBarPos);
                    if (offset != drag.offset) {
                        drag.offset = offset;
                        this._overlayDirty = true;
                    }
                    drag.copy = event.ctrlKey || event.metaKey || event.altKey;
                    break;
                }
                case "stretch": {
                    const target = Math.max(drag.bar, Math.min(Config.barCountMax - 1, Math.floor(hit.barPos)));
                    if (target != drag.target) {
                        drag.target = target;
                        this._overlayDirty = true;
                    }
                    break;
                }
            }
            this._hover = hit;
            this._overlayDirty = true;
        }
        _onPointerUp(event) {
            const doc = this._doc;
            const drag = this._drag;
            this._drag = null;
            if (drag == null)
                return;
            switch (drag.mode) {
                case "ruler":
                    if (drag.moved && drag.change) {
                        doc.record(drag.change);
                    }
                    else {
                        if (doc.synth.playing) {
                            doc.synth.playhead = Math.max(0, drag.startBarPos);
                        }
                        else {
                            doc.selection.setChannelBar(doc.channel, drag.startBar);
                        }
                    }
                    break;
                case "delete":
                    if (drag.group)
                        doc.record(drag.group);
                    break;
                case "move":
                    if (drag.offset != 0)
                        this._commitMove(drag);
                    break;
                case "stretch":
                    if (drag.target > drag.bar)
                        this._commitStretch(drag);
                    break;
            }
            this._dirty = true;
        }
        _onDoubleClick(event) {
            const doc = this._doc;
            const hit = this._hitTest(event);
            if (hit.ruler || hit.channel < 0 || hit.bar < 0)
                return;
            if (hit.clip > 0) {
                const pattern = doc.song.channels[hit.channel].patterns[hit.clip - 1];
                const name = window.prompt("Pattern name:", pattern.name || ("Pattern " + hit.clip));
                if (name != null) {
                    doc.record(new ChangeFL(doc, () => { pattern.name = name.trim().slice(0, 40); }, false));
                }
                return;
            }
            const group = new ChangeGroup();
            if (hit.bar >= doc.song.barCount) {
                if (hit.bar >= Config.barCountMax)
                    return;
                group.append(new ChangeBarCount(doc, hit.bar + 1, false));
            }
            group.append(new ChangeEnsurePatternExists(doc, hit.channel, hit.bar));
            group.append(new ChangeChannelBar(doc, hit.channel, hit.bar));
            doc.record(group);
        }
        _deleteAt(hit) {
            const doc = this._doc;
            const drag = this._drag;
            if (hit.channel < 0 || hit.bar < 0 || hit.bar >= doc.song.barCount)
                return;
            const key = hit.channel + ":" + hit.bar;
            if (drag.touched.has(key) || doc.song.channels[hit.channel].bars[hit.bar] == 0)
                return;
            drag.touched.add(key);
            if (!drag.group) {
                drag.group = new ChangeGroup();
                doc.setProspectiveChange(drag.group);
            }
            drag.group.append(new ChangePatternNumbers(doc, 0, hit.bar, hit.channel, 1, 1));
            this._dirty = true;
        }
        _commitMove(drag) {
            const doc = this._doc;
            const song = doc.song;
            let bar0, width, channel0, height;
            if (drag.box) {
                bar0 = doc.selection.boxSelectionBar;
                width = doc.selection.boxSelectionWidth;
                channel0 = doc.selection.boxSelectionChannel;
                height = doc.selection.boxSelectionHeight;
            }
            else {
                bar0 = drag.bar;
                width = 1;
                channel0 = drag.channel;
                height = 1;
            }
            const offset = Math.max(-bar0, Math.min(Config.barCountMax - (bar0 + width), drag.offset));
            if (offset == 0)
                return;
            const group = new ChangeGroup();
            const needed = bar0 + width + offset;
            if (needed > song.barCount)
                group.append(new ChangeBarCount(doc, needed, false));
            const values = [];
            for (let c = channel0; c < channel0 + height; c++) {
                values.push(song.channels[c].bars.slice(bar0, bar0 + width));
            }
            if (!drag.copy) {
                for (let c = channel0; c < channel0 + height; c++)
                    group.append(new ChangePatternNumbers(doc, 0, bar0, c, width, 1));
            }
            for (let c = 0; c < height; c++) {
                for (let b = 0; b < width; b++) {
                    const value = values[c][b];
                    if (value != 0 || !drag.box)
                        group.append(new ChangePatternNumbers(doc, value, bar0 + offset + b, channel0 + c, 1, 1));
                }
            }
            group.append(new ChangeChannelBar(doc, drag.box ? doc.channel : drag.channel, (drag.box ? doc.bar : drag.bar) + offset));
            if (drag.box) {
                doc.selection.boxSelectionX0 += offset;
                doc.selection.boxSelectionX1 += offset;
            }
            doc.record(group);
        }
        _commitStretch(drag) {
            const doc = this._doc;
            const group = new ChangeGroup();
            if (drag.target + 1 > doc.song.barCount)
                group.append(new ChangeBarCount(doc, drag.target + 1, false));
            group.append(new ChangePatternNumbers(doc, drag.pattern, drag.bar + 1, drag.channel, drag.target - drag.bar, 1));
            doc.record(group);
        }
        // ------------------------------------------------------- rendering
        render() {
            this._dirty = true;
            this._overlayDirty = true;
            this._updateSizer();
            this._renderHeaders();
            const selectionKey = this._doc.channel + ":" + this._doc.bar;
            if (selectionKey != this._lastSelectionKey) {
                this._lastSelectionKey = selectionKey;
                if (!this._doc.synth.playing)
                    this._scrollIntoView(this._doc.bar, this._doc.channel);
            }
        }
        _scrollIntoView(bar, channel) {
            const sc = this._scroller;
            const left = bar * this.barWidth, right = left + this.barWidth;
            if (left < sc.scrollLeft)
                sc.scrollLeft = left - this.barWidth * 0.5;
            else if (right > sc.scrollLeft + sc.clientWidth)
                sc.scrollLeft = right - sc.clientWidth + this.barWidth * 0.5;
            const top = channel * this.rowHeight, bottom = top + this.rowHeight + this.rulerHeight;
            if (top < sc.scrollTop)
                sc.scrollTop = top;
            else if (bottom > sc.scrollTop + sc.clientHeight)
                sc.scrollTop = bottom - sc.clientHeight;
        }
        _renderHeaders() {
            const doc = this._doc;
            const song = doc.song;
            const count = song.getChannelCount();
            if (this._renderedHeaderCount != count) {
                this._renderedHeaderCount = count;
                this._headersInner.innerHTML = "";
                this._trackHeaders = [];
                for (let c = 0; c < count; c++) {
                    const channelIndex = c;
                    const stripe = HTML.div({ class: "fl-track-stripe" });
                    const name = HTML.span({ class: "fl-track-name" });
                    const sub = HTML.span({ class: "fl-track-sub" });
                    const muteButton = HTML.button({ type: "button", title: "Mute" }, "M");
                    const soloButton = HTML.button({ type: "button", title: "Solo" }, "S");
                    const header = HTML.div({ class: "fl-track-header" }, stripe, HTML.div({ style: "flex: 1; min-width: 0; display: flex; flex-direction: column;" }, name, sub), muteButton, soloButton);
                    header.style.height = this.rowHeight + "px";
                    header.addEventListener("click", (event) => {
                        if (event.target == muteButton || event.target == soloButton)
                            return;
                        doc.selection.setChannelBar(channelIndex, doc.bar);
                        doc.selection.resetBoxSelection();
                    });
                    header.addEventListener("dblclick", (event) => {
                        if (event.target == muteButton || event.target == soloButton)
                            return;
                        const channel = doc.song.channels[channelIndex];
                        const value = window.prompt("Track name:", channel.name || this._defaultTrackName(channelIndex));
                        if (value != null)
                            doc.record(new ChangeFL(doc, () => { channel.name = value.trim().slice(0, 40); }, false));
                    });
                    muteButton.addEventListener("click", () => {
                        const channel = doc.song.channels[channelIndex];
                        channel.muted = !channel.muted;
                        doc.notifier.changed();
                    });
                    soloButton.addEventListener("click", () => {
                        const channels = doc.song.channels;
                        const isSolo = !channels[channelIndex].muted && channels.every((ch, i) => i == channelIndex || ch.muted);
                        channels.forEach((ch, i) => ch.muted = isSolo ? false : (i != channelIndex));
                        doc.notifier.changed();
                    });
                    header.addEventListener("dragover", (event) => { if (flDragHasPayload(event)) {
                        event.preventDefault();
                        header.classList.add("fl-drop");
                    } });
                    header.addEventListener("dragleave", () => header.classList.remove("fl-drop"));
                    header.addEventListener("drop", (event) => {
                        header.classList.remove("fl-drop");
                        const payload = flReadDragPayload(event);
                        if (payload) {
                            event.preventDefault();
                            FLActions.loadSample(doc, payload, { channel: channelIndex });
                        }
                    });
                    header.classList.add("fl-drop-target");
                    this._headersInner.appendChild(header);
                    this._trackHeaders.push({ header, stripe, name, sub, muteButton, soloButton });
                }
            }
            for (let c = 0; c < count; c++) {
                const th = this._trackHeaders[c];
                const channel = song.channels[c];
                const colors = ColorConfig.getChannelColor(song, c);
                th.stripe.style.background = colors.primaryChannel;
                const label = channel.name || this._defaultTrackName(c);
                if (th.name.textContent != label)
                    th.name.textContent = label;
                const instrument = channel.instruments[Math.max(0, Math.min(channel.instruments.length - 1, doc.viewedInstrument[c] | 0))];
                const preset = EditorConfig.valueToPreset(instrument.preset);
                const sub = (preset ? preset.name : Config.instrumentTypeNames[instrument.type]) + (channel.instruments.length > 1 ? " +" + (channel.instruments.length - 1) : "");
                if (th.sub.textContent != sub)
                    th.sub.textContent = sub;
                th.sub.style.display = this.rowHeight >= 32 ? "" : "none";
                th.header.classList.toggle("fl-selected", c == doc.channel);
                th.muteButton.classList.toggle("fl-on", channel.muted);
                const soloed = !channel.muted && song.channels.every((ch, i) => i == c || ch.muted) && song.channels.length > 1;
                th.soloButton.classList.toggle("fl-on", soloed);
            }
            this._headersInner.style.transform = `translateY(${this.rulerHeight - this._scroller.scrollTop}px)`;
        }
        _defaultTrackName(channelIndex) {
            const song = this._doc.song;
            if (song.getChannelIsNoise(channelIndex)) {
                const n = channelIndex - song.pitchChannelCount + 1;
                return song.noiseChannelCount > 1 ? "Drums " + n : "Drums";
            }
            const instrument = song.channels[channelIndex].instruments[0];
            const preset = EditorConfig.valueToPreset(instrument.preset);
            if (preset && preset.customType == undefined)
                return preset.name.replace(/^./, (c) => c.toUpperCase());
            return "Track " + (channelIndex + 1);
        }
        _frame() {
            const doc = this._doc;
            const synth = doc.synth;
            if (synth.playing && doc.prefs.autoFollow && this._drag == null) {
                const x = synth.playhead * this.barWidth;
                const sc = this._scroller;
                if (x > sc.scrollLeft + sc.clientWidth * 0.85 || x < sc.scrollLeft) {
                    sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.15);
                }
            }
            if (this._dirty) {
                this._dirty = false;
                this._overlayDirty = true;
                this._draw();
            }
            const playheadX = Math.round(synth.playhead * this.barWidth);
            if (this._overlayDirty || playheadX != this._lastPlayheadX) {
                this._overlayDirty = false;
                this._lastPlayheadX = playheadX;
                this._drawOverlay();
            }
        }
        _draw() {
            const doc = this._doc;
            const song = doc.song;
            const width = this._scroller.clientWidth;
            const height = this._scroller.clientHeight;
            this._stage.style.width = width + "px";
            this._stage.style.height = height + "px";
            const ctx = flSetupCanvas(this._canvas, width, height);
            const sx = this._scroller.scrollLeft;
            const sy = this._scroller.scrollTop;
            const bw = this.barWidth;
            const rh = this.rowHeight;
            const top = this.rulerHeight;
            const bg = flCss("--editor-background", "#000");
            const rowBg = flCss("--pitch-background", "#444");
            const widget = flCss("--ui-widget-background", "#444");
            const text = flCss("--primary-text", "#fff");
            const secondary = flCss("--secondary-text", "#999");
            const loopAccent = flCss("--loop-accent", "#74f");
            const inverted = flCss("--inverted-text", "#000");
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);
            const firstBar = Math.max(0, Math.floor(sx / bw));
            const lastBar = Math.ceil((sx + width) / bw);
            const channelCount = song.getChannelCount();
            const firstChannel = Math.max(0, Math.floor(sy / rh));
            const lastChannel = Math.min(channelCount - 1, Math.floor((sy + height - top) / rh));
            const partsPerBar = song.beatsPerBar * Config.partsPerBeat;
            // Track lanes.
            for (let c = firstChannel; c <= lastChannel; c++) {
                const y = top + c * rh - sy;
                ctx.globalAlpha = (c % 2 == 0) ? 0.55 : 0.4;
                ctx.fillStyle = rowBg;
                ctx.fillRect(0, y, width, rh - 1);
                ctx.globalAlpha = 1;
            }
            // Bars after the end of the song.
            const endX = song.barCount * bw - sx;
            if (endX < width) {
                ctx.fillStyle = "rgba(0,0,0,0.45)";
                ctx.fillRect(Math.max(0, endX), top, width, height);
            }
            // Loop region tint.
            const loopX0 = song.loopStart * bw - sx;
            const loopX1 = (song.loopStart + song.loopLength) * bw - sx;
            ctx.globalAlpha = 0.07;
            ctx.fillStyle = loopAccent;
            ctx.fillRect(loopX0, top, loopX1 - loopX0, height);
            ctx.globalAlpha = 1;
            // Grid lines.
            const beatWidth = bw / song.beatsPerBar;
            for (let b = firstBar; b <= lastBar; b++) {
                const x = Math.round(b * bw - sx) + 0.5;
                ctx.fillStyle = (b % 4 == 0) ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)";
                ctx.fillRect(x, top, 1, height);
                if (beatWidth >= 9) {
                    ctx.fillStyle = "rgba(255,255,255,0.04)";
                    for (let beat = 1; beat < song.beatsPerBar; beat++)
                        ctx.fillRect(Math.round(x + beat * beatWidth), top, 1, height);
                }
            }
            // Clips.
            const titleHeight = rh >= 30 ? 13 : 0;
            ctx.textBaseline = "middle";
            ctx.font = "11px Roboto, sans-serif";
            for (let c = firstChannel; c <= lastChannel; c++) {
                const channel = song.channels[c];
                const colors = flChannelColors(song, c);
                const isNoise = song.getChannelIsNoise(c);
                const y = top + c * rh - sy;
                ctx.globalAlpha = channel.muted ? 0.35 : 1;
                for (let b = firstBar; b <= Math.min(lastBar, song.barCount - 1); b++) {
                    const patternIndex = channel.bars[b];
                    if (patternIndex == 0)
                        continue;
                    const pattern = channel.patterns[patternIndex - 1];
                    const x = b * bw - sx + 1;
                    const w = bw - 2;
                    const h = rh - 3;
                    const continuesPrev = b > 0 && channel.bars[b - 1] == patternIndex;
                    this._drawClip(ctx, pattern, patternIndex, colors, isNoise, x, y + 1, w, h, titleHeight, partsPerBar, text, inverted, continuesPrev);
                }
                ctx.globalAlpha = 1;
            }
            // Box selection & selected cell.
            const sel = doc.selection;
            if (sel.boxSelectionActive) {
                const x = sel.boxSelectionBar * bw - sx;
                const y = top + sel.boxSelectionChannel * rh - sy;
                ctx.fillStyle = flCss("--box-selection-fill", "rgba(255,255,255,0.2)");
                ctx.fillRect(x, y, sel.boxSelectionWidth * bw, sel.boxSelectionHeight * rh);
                ctx.setLineDash([5, 3]);
                ctx.strokeStyle = flCss("--hover-preview", "#fff");
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, y + 1, sel.boxSelectionWidth * bw - 2, sel.boxSelectionHeight * rh - 2);
                ctx.setLineDash([]);
            }
            {
                const x = doc.bar * bw - sx;
                const y = top + doc.channel * rh - sy;
                ctx.strokeStyle = flCss("--hover-preview", "#fff");
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, y + 1, bw - 2, rh - 3);
            }
            // Ruler.
            ctx.fillStyle = widget;
            ctx.fillRect(0, 0, width, top);
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = loopAccent;
            const ry = top - 7;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(loopX0 + 1, ry, Math.max(2, loopX1 - loopX0 - 2), 5, 2.5) : ctx.rect(loopX0 + 1, ry, Math.max(2, loopX1 - loopX0 - 2), 5);
            ctx.fill();
            ctx.globalAlpha = 1;
            let labelEvery = 1;
            while (labelEvery * bw < 34)
                labelEvery *= 2;
            ctx.font = "11px Roboto, sans-serif";
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            for (let b = firstBar; b <= lastBar; b++) {
                const x = Math.round(b * bw - sx) + 0.5;
                const major = b % labelEvery == 0;
                ctx.fillStyle = major ? text : secondary;
                ctx.fillRect(x, major ? 3 : 10, 1, major ? top - 3 : top - 10);
                if (major)
                    ctx.fillText(String(b + 1), x + 3, 2);
            }
        }
        _drawClip(ctx, pattern, patternIndex, colors, isNoise, x, y, w, h, titleHeight, partsPerBar, text, inverted, continuesPrev) {
            ctx.fillStyle = colors.secondaryChannel;
            ctx.globalAlpha *= 0.9;
            ctx.beginPath();
            if (ctx.roundRect)
                ctx.roundRect(x, y, w, h, Math.min(4, w / 4));
            else
                ctx.rect(x, y, w, h);
            ctx.fill();
            ctx.globalAlpha /= 0.9;
            if (titleHeight > 0 && w > 4) {
                ctx.fillStyle = colors.primaryChannel;
                ctx.fillRect(x, y, w, titleHeight);
                if (w > 18) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(x, y, w - 2, titleHeight);
                    ctx.clip();
                    ctx.fillStyle = inverted;
                    ctx.textBaseline = "middle";
                    ctx.textAlign = "left";
                    ctx.font = "bold 10px Roboto, sans-serif";
                    const label = continuesPrev && w < 70 ? "" : (pattern.name || ("Pattern " + patternIndex));
                    ctx.fillText(w < 46 && !pattern.name ? String(patternIndex) : label, x + 3, y + titleHeight / 2 + 0.5);
                    ctx.restore();
                }
            }
            else if (w > 14) {
                ctx.fillStyle = text;
                ctx.font = "bold 10px Roboto, sans-serif";
                ctx.textAlign = "left";
                ctx.fillText(String(patternIndex), x + 2, y + 7);
            }
            // Mini note preview.
            const notes = pattern.notes;
            if (notes.length == 0 || w < 6)
                return;
            let minPitch, maxPitch;
            if (isNoise) {
                minPitch = 0;
                maxPitch = Config.drumCount - 1;
            }
            else {
                minPitch = Infinity;
                maxPitch = -Infinity;
                for (const note of notes) {
                    for (const pitch of note.pitches) {
                        for (const pin of note.pins) {
                            minPitch = Math.min(minPitch, pitch + pin.interval);
                            maxPitch = Math.max(maxPitch, pitch + pin.interval);
                        }
                    }
                }
                if (maxPitch - minPitch < 6) {
                    const pad = Math.floor((6 - (maxPitch - minPitch)) / 2);
                    minPitch -= pad;
                    maxPitch = minPitch + 6;
                }
            }
            const bodyTop = y + titleHeight + 2;
            const bodyHeight = h - titleHeight - 4;
            if (bodyHeight < 2)
                return;
            const range = maxPitch - minPitch + 1;
            const rowH = bodyHeight / range;
            const noteH = Math.max(1, Math.min(rowH - (rowH > 3 ? 1 : 0), 6));
            ctx.fillStyle = colors.primaryNote;
            for (const note of notes) {
                const nx = x + note.start / partsPerBar * w;
                const nw = Math.max(1, (note.end - note.start) / partsPerBar * w - (w > 60 ? 1 : 0));
                for (const pitch of note.pitches) {
                    const p = pitch + note.pins[0].interval;
                    const ny = bodyTop + (maxPitch - p) / range * bodyHeight + (rowH - noteH) / 2;
                    ctx.fillRect(nx, ny, nw, noteH);
                }
            }
        }
        _drawOverlay() {
            const doc = this._doc;
            const width = this._scroller.clientWidth;
            const height = this._scroller.clientHeight;
            const ctx = flSetupCanvas(this._overlay, width, height);
            ctx.clearRect(0, 0, width, height);
            const sx = this._scroller.scrollLeft;
            const sy = this._scroller.scrollTop;
            const bw = this.barWidth;
            const rh = this.rowHeight;
            const top = this.rulerHeight;
            const hover = flCss("--hover-preview", "#fff");
            const drag = this._drag;
            if (drag && drag.mode == "move" && drag.offset != 0) {
                const song = doc.song;
                const box = drag.box ? doc.selection : null;
                const bar0 = box ? box.boxSelectionBar : drag.bar;
                const widthBars = box ? box.boxSelectionWidth : 1;
                const channel0 = box ? box.boxSelectionChannel : drag.channel;
                const heightRows = box ? box.boxSelectionHeight : 1;
                const x = (bar0 + drag.offset) * bw - sx;
                const y = top + channel0 * rh - sy;
                ctx.fillStyle = drag.copy ? "rgba(120,255,140,0.25)" : "rgba(255,255,255,0.18)";
                ctx.fillRect(x, y, widthBars * bw, heightRows * rh);
                ctx.strokeStyle = hover;
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, y + 1, widthBars * bw - 2, heightRows * rh - 2);
                ctx.fillStyle = hover;
                ctx.font = "11px Roboto, sans-serif";
                ctx.textBaseline = "bottom";
                ctx.fillText((drag.copy ? "copy " : "move ") + (drag.offset > 0 ? "+" : "") + drag.offset + " bar" + (Math.abs(drag.offset) == 1 ? "" : "s"), x + 4, y - 2);
                void song;
            }
            else if (drag && drag.mode == "stretch") {
                const x = (drag.bar + 1) * bw - sx;
                const y = top + drag.channel * rh - sy;
                ctx.fillStyle = "rgba(255,255,255,0.16)";
                ctx.fillRect(x, y + 1, (drag.target - drag.bar) * bw, rh - 3);
                ctx.strokeStyle = hover;
                ctx.setLineDash([4, 3]);
                ctx.strokeRect(x + 1, y + 2, (drag.target - drag.bar) * bw - 2, rh - 5);
                ctx.setLineDash([]);
            }
            else if (this._hover && !this._hover.ruler && this._hover.channel >= 0 && !drag) {
                const x = this._hover.bar * bw - sx;
                const y = top + this._hover.channel * rh - sy;
                ctx.strokeStyle = hover;
                ctx.globalAlpha = 0.5;
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 1.5, y + 1.5, bw - 3, rh - 4);
                if (this._hover.edge) {
                    ctx.fillStyle = hover;
                    ctx.fillRect(x + bw - 4, y + 4, 2, rh - 9);
                }
                ctx.globalAlpha = 1;
            }
            // Playhead.
            const px = Math.round(doc.synth.playhead * bw - sx) + 0.5;
            if (px >= -2 && px <= width + 2) {
                ctx.fillStyle = flCss("--playhead", "#fff");
                ctx.fillRect(px - 1, 0, 2, height);
                ctx.beginPath();
                ctx.moveTo(px - 6, 0);
                ctx.lineTo(px + 6, 0);
                ctx.lineTo(px, 8);
                ctx.closePath();
                ctx.fill();
            }
        }
    }
