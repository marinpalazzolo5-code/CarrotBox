    // ======================================================================
    // BeepBox FL: styles for the new UI (kept in BeepBox's visual language).
    // ======================================================================
    const flIcon = (body, viewBox = "-13 -13 26 26") => `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="${viewBox}">${body}</svg>')`;
    document.head.appendChild(HTML.style({ type: "text/css" }, `
:root {
	--fl-metronome-symbol: ${flIcon('<path d="M -2 -9 L 2 -9 L 7 8 L -7 8 z M -1 -6 L -4 6 L 4 6 L 1 -6 z" fill="gray" fill-rule="evenodd"/><path d="M 0 3 L 6 -7" stroke="gray" stroke-width="1.6"/><circle cx="4" cy="-4" r="1.8" fill="gray"/>')};
	--fl-playlist-symbol: ${flIcon('<rect x="-9" y="-8" width="18" height="2" fill="gray"/><rect x="-9" y="-4" width="7" height="4" rx="1" fill="gray"/><rect x="-1" y="-4" width="10" height="4" rx="1" fill="gray"/><rect x="-9" y="2" width="11" height="4" rx="1" fill="gray"/><rect x="3" y="2" width="6" height="4" rx="1" fill="gray"/>')};
	--fl-grid-symbol: ${flIcon('<rect x="-9" y="-8" width="5" height="4" fill="gray"/><rect x="-3" y="-8" width="5" height="4" fill="gray"/><rect x="3" y="-8" width="5" height="4" fill="gray"/><rect x="-9" y="-2" width="5" height="4" fill="gray"/><rect x="-3" y="-2" width="5" height="4" fill="gray"/><rect x="3" y="-2" width="5" height="4" fill="gray"/><rect x="-9" y="4" width="5" height="4" fill="gray"/><rect x="-3" y="4" width="5" height="4" fill="gray"/><rect x="3" y="4" width="5" height="4" fill="gray"/>')};
	--fl-browser-symbol: ${flIcon('<path d="M -9 -7 L -3 -7 L -1 -5 L 9 -5 L 9 7 L -9 7 z" fill="gray"/><rect x="-7" y="-2" width="14" height="1.5" fill="black" opacity="0.5"/><rect x="-7" y="1.5" width="10" height="1.5" fill="black" opacity="0.5"/>')};
	--fl-master-symbol: ${flIcon('<rect x="-8" y="-9" width="2" height="18" fill="gray"/><rect x="-1" y="-9" width="2" height="18" fill="gray"/><rect x="6" y="-9" width="2" height="18" fill="gray"/><rect x="-10" y="1" width="6" height="3" rx="1" fill="gray"/><rect x="-3" y="-6" width="6" height="3" rx="1" fill="gray"/><rect x="4" y="3" width="6" height="3" rx="1" fill="gray"/>')};
	--fl-ghost-symbol: ${flIcon('<path d="M -7 9 L -7 -2 A 7 7 0 0 1 7 -2 L 7 9 L 4.5 6.5 L 2 9 L 0 6.5 L -2 9 L -4.5 6.5 z" fill="gray"/><circle cx="-2.5" cy="-1.5" r="1.5" fill="black"/><circle cx="2.5" cy="-1.5" r="1.5" fill="black"/>')};
	--fl-play-small-symbol: ${flIcon('<path d="M -4 -6 L -4 6 L 6 0 z" fill="gray"/>')};
	--fl-folder-symbol: ${flIcon('<path d="M -8 -6 L -3 -6 L -1 -4 L 8 -4 L 8 6 L -8 6 z" fill="gray"/>')};
	--fl-wave-symbol: ${flIcon('<path d="M -9 0 L -7 -5 L -5 4 L -3 -7 L -1 6 L 1 -3 L 3 5 L 5 -2 L 7 2 L 9 0" stroke="gray" stroke-width="1.6" fill="none"/>')};
}
.beepboxEditor .fl-bar {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	grid-column-gap: 4px;
	margin: 2px 0;
}
.beepboxEditor .fl-bar button {
	padding: 0;
	min-width: 0;
}
.beepboxEditor .fl-icon-button::before {
	content: "";
	position: absolute;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
	pointer-events: none;
	width: var(--button-size);
	height: var(--button-size);
	background: currentColor;
	-webkit-mask-repeat: no-repeat;
	-webkit-mask-position: center;
	mask-repeat: no-repeat;
	mask-position: center;
	-webkit-mask-image: var(--fl-icon);
	mask-image: var(--fl-icon);
}
.beepboxEditor .fl-icon-button.fl-on {
	background: var(--fl-accent, ${ColorConfig.loopAccent});
	color: ${ColorConfig.invertedText};
}
.beepboxEditor .fl-ghost-button, .beepboxEditor .fl-zoom-x-button {
	width: var(--button-size);
	position: absolute;
	top: 6px;
	z-index: 2;
	opacity: 0.85;
}
.beepboxEditor .fl-ghost-button { left: 40px; }
.beepboxEditor .fl-missing-sample {
	position: absolute;
	left: 50%;
	top: 8px;
	transform: translateX(-50%);
	padding: 4px 10px;
	border-radius: 5px;
	background: ${ColorConfig.uiWidgetBackground};
	color: ${ColorConfig.primaryText};
	font-size: 12px;
	z-index: 3;
	display: none;
	cursor: pointer;
}
/* ---------------------------------------------------------- instrument panels */
.beepboxEditor .fl-panel-title {
	margin: 4px 0 2px;
	text-align: center;
	color: ${ColorConfig.secondaryText};
	font-size: 12px;
	letter-spacing: 0.05em;
}
.beepboxEditor .fl-sample-button {
	width: 62.5%;
	flex-shrink: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	padding: 0 4px 0 22px !important;
	text-align: left;
}
.beepboxEditor .fl-sample-button::before {
	content: "";
	position: absolute;
	left: 0;
	top: 0;
	width: 22px;
	height: 100%;
	background: currentColor;
	-webkit-mask-image: var(--fl-wave-symbol);
	mask-image: var(--fl-wave-symbol);
	-webkit-mask-repeat: no-repeat;
	mask-repeat: no-repeat;
	-webkit-mask-position: center;
	mask-position: center;
}
/* BeepBox positions every canvas absolutely; these ones live in normal flow. */
.beepboxEditor .fl-wave-canvas, .beepboxEditor .fl-mini-graph, .beepboxEditor .fl-steps, .beepboxEditor .fl-eq-canvas, .beepboxEditor .fl-sample-canvas {
	position: relative;
	max-width: 100%;
}
.beepboxEditor .fl-wave-canvas {
	width: 100%;
	height: 44px;
	display: block;
	border-radius: 4px;
	background: ${ColorConfig.uiWidgetBackground};
	cursor: pointer;
	margin: 2px 0;
}
.beepboxEditor .fl-row-buttons {
	display: flex;
	gap: 2px;
	margin: 2px 0;
}
.beepboxEditor .fl-row-buttons > button, .beepboxEditor .fl-row-buttons > .selectContainer {
	flex: 1;
	min-width: 0;
	padding: 0 2px;
	font-size: 12px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.beepboxEditor .fl-check-row {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	align-items: center;
	margin: 2px 0;
	gap: 2px 6px;
	font-size: 12px;
	color: ${ColorConfig.secondaryText};
	max-width: 100%;
}
.beepboxEditor .fl-check-row label {
	display: flex;
	align-items: center;
	gap: 4px;
	cursor: pointer;
	white-space: nowrap;
}
.beepboxEditor .fl-check-row input[type=checkbox] {
	transform: scale(1.1);
	margin: 0;
}
.beepboxEditor .fl-osc-label {
	width: 3.2em;
	flex-shrink: 0;
	color: ${ColorConfig.secondaryText};
}
.beepboxEditor .fl-pad-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 3px;
	margin: 3px 0;
}
.beepboxEditor .fl-pad {
	white-space: pre-line;
	height: 34px;
	padding: 1px 2px !important;
	font-size: 10px;
	line-height: 1.05;
	overflow: hidden;
	word-break: break-word;
	border-radius: 4px;
	transition: filter 0.08s;
}
.beepboxEditor .fl-pad.fl-selected {
	box-shadow: inset 0 0 0 2px var(--fl-accent, ${ColorConfig.loopAccent});
}
.beepboxEditor .fl-pad.fl-empty {
	opacity: 0.45;
}
.beepboxEditor .fl-pad.fl-hit {
	filter: brightness(1.6);
}
.beepboxEditor .fl-pad.fl-drop, .beepboxEditor .fl-drop-target.fl-drop {
	box-shadow: inset 0 0 0 2px ${ColorConfig.hoverPreview};
}
.beepboxEditor .fl-mini-graph {
	height: 26px;
	width: 62.5%;
	flex-shrink: 0;
	cursor: pointer;
	background: ${ColorConfig.editorBackground};
	border-radius: 2px;
}
.beepboxEditor .fl-steps {
	width: 100%;
	height: 30px;
	display: block;
	cursor: pointer;
	margin: 2px 0;
}
/* ---------------------------------------------------------- browser */
.beepboxEditor .fl-browser {
	grid-area: browser-area;
	display: flex;
	flex-direction: column;
	min-height: 0;
	width: 230px;
	background: var(--fl-panel, ${ColorConfig.editorBackground});
	border-right: 2px solid ${ColorConfig.uiWidgetBackground};
	font-size: 12px;
	z-index: 20;
}
.beepboxEditor:not(.fl-view) .fl-browser {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	box-shadow: 4px 0 18px rgba(0,0,0,0.5);
}
.beepboxEditor .fl-browser-header {
	display: flex;
	align-items: center;
	gap: 4px;
	padding: 4px;
}
.beepboxEditor .fl-browser-header h3 {
	flex: 1;
	margin: 0;
	font-size: 14px;
	font-weight: normal;
	color: ${ColorConfig.secondaryText};
}
.beepboxEditor .fl-browser-header button {
	width: var(--button-size);
	flex-shrink: 0;
}
.beepboxEditor .fl-browser input[type=search] {
	margin: 0 4px 4px;
	height: 22px;
	padding: 0 6px;
	border-radius: 4px;
	border: 1px solid ${ColorConfig.uiWidgetFocus};
	background: ${ColorConfig.editorBackground};
	color: ${ColorConfig.primaryText};
	font: inherit;
}
.beepboxEditor .fl-tree {
	flex: 1;
	overflow: auto;
	min-height: 0;
	padding-bottom: 8px;
}
.beepboxEditor .fl-tree-row {
	display: flex;
	align-items: center;
	height: 20px;
	padding-right: 4px;
	cursor: pointer;
	white-space: nowrap;
	color: ${ColorConfig.primaryText};
	user-select: none;
	-webkit-user-select: none;
}
.beepboxEditor .fl-tree-row:hover {
	background: ${ColorConfig.uiWidgetBackground};
}
.beepboxEditor .fl-tree-row.fl-selected {
	background: ${ColorConfig.uiWidgetFocus};
}
.beepboxEditor .fl-tree-row .fl-tree-icon {
	width: 18px;
	height: 18px;
	flex-shrink: 0;
	background: ${ColorConfig.secondaryText};
	-webkit-mask-repeat: no-repeat;
	-webkit-mask-position: center;
	-webkit-mask-size: 18px 18px;
	mask-repeat: no-repeat;
	mask-position: center;
	mask-size: 18px 18px;
}
.beepboxEditor .fl-tree-row.fl-folder .fl-tree-icon {
	-webkit-mask-image: var(--fl-folder-symbol);
	mask-image: var(--fl-folder-symbol);
	background: var(--fl-accent, ${ColorConfig.loopAccent});
}
.beepboxEditor .fl-tree-row.fl-sound .fl-tree-icon {
	-webkit-mask-image: var(--fl-wave-symbol);
	mask-image: var(--fl-wave-symbol);
}
.beepboxEditor .fl-tree-row .fl-tree-name {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	padding-left: 3px;
}
.beepboxEditor .fl-tree-row .fl-tree-action {
	display: none;
	height: 16px;
	padding: 0 5px;
	font-size: 10px;
	border-radius: 3px;
	margin-left: 3px;
}
.beepboxEditor .fl-tree-row:hover .fl-tree-action, .beepboxEditor .fl-tree-row.fl-selected .fl-tree-action {
	display: inline-block;
}
.beepboxEditor .fl-tree-arrow {
	width: 10px;
	flex-shrink: 0;
	color: ${ColorConfig.secondaryText};
	font-size: 9px;
}
.beepboxEditor .fl-browser-footer {
	display: flex;
	flex-wrap: wrap;
	gap: 3px;
	padding: 4px;
	border-top: 1px solid ${ColorConfig.uiWidgetBackground};
}
.beepboxEditor .fl-browser-footer button {
	flex: 1 1 45%;
	font-size: 11px;
	height: 22px;
}
.beepboxEditor .fl-browser-status {
	padding: 2px 6px 4px;
	color: ${ColorConfig.secondaryText};
	font-size: 11px;
	min-height: 14px;
}
.beepboxEditor .fl-browser.fl-drop {
	box-shadow: inset 0 0 0 3px var(--fl-accent, ${ColorConfig.loopAccent});
}
/* ---------------------------------------------------------- playlist */
.beepboxEditor .fl-playlist {
	display: flex;
	flex-direction: column;
	min-height: 0;
	height: 100%;
	position: relative;
	user-select: none;
	-webkit-user-select: none;
}
.beepboxEditor .fl-playlist-toolbar {
	display: flex;
	align-items: center;
	gap: 3px;
	height: 26px;
	flex-shrink: 0;
	padding: 0 2px 2px;
	font-size: 12px;
	color: ${ColorConfig.secondaryText};
}
.beepboxEditor .fl-playlist-toolbar button {
	height: 22px;
	min-width: 24px;
	padding: 0 6px;
	font-size: 12px;
}
.beepboxEditor .fl-playlist-toolbar .fl-title {
	flex: 1;
	padding-left: 6px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.beepboxEditor .fl-playlist-toolbar input[type=range] {
	width: 90px;
	height: 22px;
}
.beepboxEditor .fl-playlist-body {
	flex: 1;
	display: flex;
	min-height: 0;
	position: relative;
	border-top: 1px solid ${ColorConfig.uiWidgetBackground};
}
.beepboxEditor .fl-playlist-headers {
	width: 132px;
	flex-shrink: 0;
	overflow: hidden;
	position: relative;
	background: var(--fl-panel, ${ColorConfig.editorBackground});
}
.beepboxEditor .fl-playlist-headers-inner {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
}
.beepboxEditor .fl-track-header {
	display: flex;
	align-items: center;
	box-sizing: border-box;
	border-bottom: 1px solid ${ColorConfig.editorBackground};
	padding: 0 3px 0 0;
	gap: 3px;
	overflow: hidden;
	background: ${ColorConfig.uiWidgetBackground};
	cursor: pointer;
}
.beepboxEditor .fl-track-header.fl-selected {
	background: ${ColorConfig.uiWidgetFocus};
}
.beepboxEditor .fl-track-stripe {
	width: 6px;
	align-self: stretch;
	flex-shrink: 0;
}
.beepboxEditor .fl-track-name {
	flex: 1;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	font-size: 12px;
	color: ${ColorConfig.primaryText};
}
.beepboxEditor .fl-track-sub {
	display: block;
	font-size: 10px;
	color: ${ColorConfig.secondaryText};
	overflow: hidden;
	text-overflow: ellipsis;
}
.beepboxEditor .fl-track-header button {
	width: 18px;
	height: 18px;
	padding: 0;
	font-size: 10px;
	flex-shrink: 0;
	border-radius: 3px;
}
.beepboxEditor .fl-track-header button.fl-on {
	background: var(--fl-accent, ${ColorConfig.loopAccent});
	color: ${ColorConfig.invertedText};
}
.beepboxEditor .fl-playlist-scroller {
	flex: 1;
	overflow: auto;
	position: relative;
	min-width: 0;
}
.beepboxEditor .fl-playlist-canvas {
	position: sticky;
	left: 0;
	top: 0;
	display: block;
}
.beepboxEditor .fl-playlist-sizer {
	position: absolute;
	left: 0;
	top: 0;
	width: 1px;
	height: 1px;
	pointer-events: none;
}
/* ---------------------------------------------------------- FL view layout */
#beepboxEditorContainer.fl-container {
	max-width: none !important;
	width: 100% !important;
	padding: 0 !important;
	height: 100vh;
	display: block !important;
	box-sizing: border-box;
}
.beepboxEditor.fl-view {
	width: 100%;
	height: 100vh;
	grid-template-columns: max-content minmax(0, 1fr) 262px;
	grid-template-rows: minmax(200px, 55fr) minmax(120px, 45fr);
	grid-template-areas: "browser-area pattern-area settings-area" "browser-area track-area settings-area";
	grid-row-gap: 0;
	grid-column-gap: 4px;
}
.beepboxEditor.fl-view .pattern-area {
	height: 100%;
	min-height: 0;
}
.beepboxEditor.fl-view .track-area {
	min-height: 0;
	display: flex;
	flex-direction: column;
	padding-top: 6px;
}
.beepboxEditor.fl-view .trackAndMuteContainer, .beepboxEditor.fl-view .barScrollBar {
	display: none !important;
}
.beepboxEditor.fl-view .settings-area {
	width: 262px;
	overflow-y: auto;
	grid-template-rows: min-content min-content min-content min-content min-content;
	padding-right: 4px;
	box-sizing: border-box;
}
.beepboxEditor.fl-view .fl-split-handle {
	display: block;
}
.beepboxEditor .fl-split-handle {
	display: none;
	height: 6px;
	margin-top: -6px;
	cursor: ns-resize;
	position: relative;
	z-index: 5;
}
.beepboxEditor .fl-split-handle::after {
	content: "";
	position: absolute;
	left: 40%;
	right: 40%;
	top: 2px;
	height: 2px;
	border-radius: 2px;
	background: ${ColorConfig.uiWidgetFocus};
}
@media (max-width: 710px) {
	.beepboxEditor.fl-view {
		height: auto;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: min-content 300px min-content;
		grid-template-areas: "pattern-area" "track-area" "settings-area";
	}
	.beepboxEditor.fl-view .settings-area { width: auto; }
	.beepboxEditor.fl-view .fl-browser { position: fixed; left: 0; top: 0; bottom: 0; }
}
/* ---------------------------------------------------------- prompts */
.beepboxEditor .fl-prompt {
	text-align: left;
	max-width: calc(100vw - 40px);
	max-height: calc(100vh - 40px);
	overflow: auto;
	box-sizing: border-box;
}
.beepboxEditor .fl-prompt h2 {
	text-align: center;
}
.beepboxEditor .fl-prompt .fl-prompt-row {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	margin-top: 8px;
	font-size: 13px;
}
.beepboxEditor .fl-prompt .fl-prompt-row > * {
	flex-shrink: 0;
}
.beepboxEditor .fl-prompt .fl-prompt-row button {
	padding: 0 10px;
}
.beepboxEditor .fl-prompt .fl-prompt-row .selectContainer select {
	padding-right: 18px;
}
.beepboxEditor .fl-eq-canvas, .beepboxEditor .fl-sample-canvas {
	display: block;
	width: 100%;
	border-radius: 6px;
	background: #0c0f12;
	touch-action: none;
	cursor: crosshair;
}
.beepboxEditor .fl-eq-bands {
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
	gap: 4px;
	margin-top: 8px;
	font-size: 11px;
}
.beepboxEditor .fl-eq-band {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 4px;
	border-radius: 5px;
	background: ${ColorConfig.uiWidgetBackground};
	border-top: 3px solid var(--band-color);
}
.beepboxEditor .fl-eq-band.fl-selected {
	box-shadow: inset 0 0 0 1px var(--band-color);
}
.beepboxEditor .fl-eq-band select, .beepboxEditor .fl-eq-band input {
	height: 20px;
	font-size: 11px;
	width: 100%;
	box-sizing: border-box;
}
.beepboxEditor .fl-eq-band input[type=number] {
	background: ${ColorConfig.editorBackground};
	border: 1px solid ${ColorConfig.uiWidgetFocus};
	color: ${ColorConfig.primaryText};
	border-radius: 3px;
	padding: 0 2px;
}
.beepboxEditor .fl-eq-band label {
	display: flex;
	align-items: center;
	gap: 4px;
	color: ${ColorConfig.secondaryText};
}
.beepboxEditor .fl-theme-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	gap: 8px;
	margin-top: 12px;
}
.beepboxEditor .fl-theme-card {
	height: 74px;
	border-radius: 8px;
	padding: 6px !important;
	display: flex !important;
	flex-direction: column;
	justify-content: space-between;
	text-align: left;
	box-shadow: inset 0 0 0 1px rgba(128,128,128,0.4) !important;
}
.beepboxEditor .fl-theme-card.fl-selected {
	box-shadow: inset 0 0 0 3px var(--fl-accent, ${ColorConfig.loopAccent}) !important;
}
.beepboxEditor .fl-theme-dots {
	display: flex;
	gap: 3px;
}
.beepboxEditor .fl-theme-dots span {
	width: 14px;
	height: 8px;
	border-radius: 2px;
}
.beepboxEditor .fl-section {
	border-radius: 8px;
	background: ${ColorConfig.uiWidgetBackground};
	padding: 8px 10px;
	margin-top: 10px;
}
.beepboxEditor .fl-section h3 {
	margin: 0 0 4px;
	font-size: 14px;
	font-weight: normal;
	display: flex;
	align-items: center;
	gap: 8px;
}
.beepboxEditor .fl-hint {
	color: ${ColorConfig.secondaryText};
	font-size: 11px;
	margin-top: 6px;
}
.beepboxEditor .fl-toast {
	position: fixed;
	left: 50%;
	bottom: 24px;
	transform: translateX(-50%);
	background: ${ColorConfig.uiWidgetFocus};
	color: ${ColorConfig.primaryText};
	padding: 8px 16px;
	border-radius: 8px;
	z-index: 1000;
	box-shadow: 0 4px 18px rgba(0,0,0,0.5);
	font-size: 13px;
	pointer-events: none;
	transition: opacity 0.3s;
}
`));
