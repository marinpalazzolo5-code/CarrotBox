# CarrotBox

CarrotBox is a mod of [BeepBox](https://github.com/johnnesky/beepbox) (by John Nesky, MIT license). It keeps BeepBox's simple, fast way of writing music in the browser and adds a playlist view, samples and sound kits, FL Studio style effects, a plugin system with six plugins, a bigger set of color themes and a long list of small quality-of-life improvements.

Everything you know from BeepBox still works, and old BeepBox song links still open.

CarrotBox runs entirely in the browser. There is no server, no account and nothing to install: open `index.html` (through any static web server, see [Running it](#running-it)) and start writing.

---

## Contents

- [Quick start](#quick-start)
- [What CarrotBox adds to BeepBox](#what-carrotbox-adds-to-beepbox)
- [Views: grid and playlist](#views-grid-and-playlist)
- [Writing notes](#writing-notes)
- [Samples, Slicex, FPC and 3x Osc](#samples-slicex-fpc-and-3x-osc)
- [The Sound Browser and kits](#the-sound-browser-and-kits)
- [Effects and the master chain](#effects-and-the-master-chain)
- [Plugins](#plugins)
  - [Using plugins](#using-plugins)
  - [Swarm](#swarm-hybrid-synth)
  - [Prism](#prism-wavetable-synth)
  - [Seedling](#seedling-grow-your-sounds)
  - [Chop Shop](#chop-shop-sample-chopper)
  - [Sketchpad](#sketchpad-idea-sketcher)
  - [Mangler FX](#mangler-fx-effect-rack)
- [Tools: generator, recorder, metronome](#tools-generator-recorder-metronome)
- [Settings and preferences](#settings-and-preferences)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Saving, sharing and storage](#saving-sharing-and-storage)
- [Troubleshooting and FAQ](#troubleshooting-and-faq)
- [Development](#development)
  - [Running it](#running-it)
  - [Repository layout](#repository-layout)
  - [Building](#building)
  - [Testing](#testing)
  - [Writing a plugin](#writing-a-plugin)
- [What was fixed](#what-was-fixed)
- [Known limitations](#known-limitations)
- [Credits and license](#credits-and-license)

---

## Quick start

1. Start a static web server in the repository folder and open `index.html` (see [Running it](#running-it)). The editor loads in a second or two.
2. Click the gray rows of the piano roll to add notes. Press `Space` to play.
3. Press `Tab` to open the **plugin launcher**, type a few letters of a plugin's name and press `Enter`. All six plugins are installed by default.
4. Press `F8` to open the **Sound Browser**. Double-click a sound to load it into the current instrument.
5. Press `F5` to switch between BeepBox's pattern grid and the **Playlist**.
6. Press `?` at any time to see every keyboard shortcut. Press `Esc` to close the topmost window.

Your work is stored in the page address (as in BeepBox). **File > Save Project + Samples** also saves any audio you imported.

---

## What CarrotBox adds to BeepBox

| Area | What you get |
| --- | --- |
| Views | A second view, the **Playlist**, with one continuous timeline of clips that show their notes; zoom, track height, drag/copy/repeat clips, loop in the ruler. |
| Editing | Single notes inside chords, overlapping notes, **ghost notes** from other channels, snap override with `Alt`, humanize and quantize, clear pattern, copy bar to next bar. |
| Instruments | **Sampler**, **Slicex**, **FPC** (12 drum pads) and **3x Osc**, in addition to every BeepBox instrument. |
| Sounds | A **Sound Browser** with hundreds of built-in generated sounds, plus your own kits (folders, files or `.zip`). |
| Effects | **Parametric EQ 2**, **Gross Beat** and **Soundgoodizer** on any instrument and on the master. |
| Plugins | **Swarm**, **Prism**, **Seedling**, **Chop Shop**, **Sketchpad** and **Mangler FX** (all optional and installed on demand). |
| Tools | Lead / melody **generator**, **audio recorder**, **metronome** with volume, 18 color themes, an optional modern skin, UI sounds, interface zoom. |
| Saving | Song URLs remember everything except audio files; **Save Project + Samples** writes a `.json` that includes your samples; drop a file onto the page to open it; optional "warn before leaving". |
| Polish | A settings panel that actually changes things, a shortcuts cheat sheet, toast messages, remembered window positions, user presets for plugins, recently used plugins, and much more (see [What was fixed](#what-was-fixed)). |

No emoji are used anywhere in the interface. Icons are plain text badges or drawn shapes, so they look the same on every system.

---

## Views: grid and playlist

Use the **View** button or `F5` to switch.

**Pattern grid** is the classic BeepBox editor: the numbered boxes choose which pattern plays in each bar of each channel.

**Playlist** is one continuous timeline:

| Action | How |
| --- | --- |
| Zoom horizontally | `Ctrl` + mouse wheel |
| Change track height | `Alt` + mouse wheel |
| Move a clip | Drag it |
| Copy a clip | `Ctrl` (or the Command key) + drag |
| Repeat a clip | Drag its right edge |
| Delete a clip | Right-click it |
| Make a new pattern | Double-click an empty cell |
| Set the loop | Drag in the ruler |

Clips draw a small preview of their notes, so you can see the shape of a song at a glance.

---

## Writing notes

Everything from BeepBox still applies: click the gray rows to add notes, click above or below a note to build a chord, drag horizontally to change the length and vertically to bend the pitch. In addition:

- **Single notes in chords.** Drag the end of one note inside a chord and only that note changes. Notes may overlap like in a piano roll.
- **Ghost notes.** The ghost button above the piano roll shows the other channels' notes behind the current one. `Alt`-click a ghost note to jump to its channel.
- **No snapping.** Hold `Alt` while dragging to ignore the rhythm grid.
- **Humanize** (`Shift` + `H`) gives each note a small random volume change, and **Quantize** (`Shift` + `Q`) snaps notes back to the rhythm grid.
- **Clear pattern** (`Shift` + `Backspace`) empties the pattern under the cursor.
- **Copy bar to next bar** (`Ctrl` + `D`).
- **Mute and solo** with `M` and `S` (add `Shift` for all others / the whole group).
- **Live preview.** Clicking the piano keys or the piano roll makes sound immediately, also when the song is stopped.

---

## Samples, Slicex, FPC and 3x Osc

Choose the instrument type in the instrument settings. The sample instruments share the same sample bank, so a sound only exists once in memory.

### Sampler

Plays one sample across the keyboard. Load a sound by double-clicking it in the Sound Browser, with **Browse...**, or by dropping an audio file on the pattern area, the sample name or the waveform in the instrument panel. The instrument panel has:

- **Playback** (one-shot, loop and so on), **Reverse**, **Pitch** (follow the note's pitch, or always play at the original pitch) and **Crunchy** (no interpolation, for a grittier lo-fi pitch shift)
- **Fine tune** (cents), **Gain** (dB), and **Start** / **End** sliders
- **Edit Sample...** (or a click on the waveform) opens the **sample editor**: drag the green (start), red (end) and yellow (loop) markers, scroll to zoom, double-click to hear the sample, and choose the root key, playback mode and reverse. **Import** loads another file into the same instrument.

The sampler plays every key. If a sample is very quiet or very loud, use its gain. A sample that is still loading (a large file, a kit that is being read) plays as soon as it is ready; you do not need to reload.

### Slicex

Slicex chops a loop into slices and spreads them over the keyboard so you can play a beat or re-sequence a loop.

- **Auto Slice** by detected hits or into 4, 8, 16 or 32 equal parts. The sample editor adds a sensitivity slider for **Detect Hits**, more equal-slice choices and **Clear Slices**.
- Click the waveform in the sample editor to add a slice, drag a slice to move it, right-click to remove it, double-click to hear it.
- **Chop to Pattern** writes one note per slice into the current pattern so the loop plays back as it was.
- On a pitch channel, slice 1 is on **C4** and the slices run upward from there (the panel prints the exact range). On a drum channel, rows 1 to 12 play slices 1 to 12.

### FPC

Twelve drum pads in a 4 by 3 grid. Click a pad to select it (and hear it), then use **Load Sound...** or drag a sound from the Sound Browser onto it. Each pad has its own **volume**, **tune**, **reverse** and a **cut group** (groups 1 to 4: pads in the same group cut each other off, for example closed and open hi-hat), and **Clear Pad** empties it. The kit loader's **Auto-map** fills the pads with a drummer-friendly set from a loaded kit. FPC is meant for drum (noise) channels, where each row plays one pad.

### 3x Osc

A classic three-oscillator synth. Each oscillator has a shape, a level, a coarse tuning (plus or minus four octaves) and a fine tuning in cents. Optional **AM** lets oscillator 3 modulate the others, and **random phase** gives every note a different start. Add BeepBox's envelopes, filter and effects as usual.

---

## The Sound Browser and kits

Press `F8` (or `B`) to show or hide the browser. It lists:

- **Built-in sounds.** Hundreds of drum hits, 808s, bass notes, keys, plucks, pads, FX and loops that are generated by CarrotBox itself when you use them. No third party audio ships with the project.
- **Your sounds.** Anything you import is stored in your browser and shows up here.
- **Kits.** Folders, files or `.zip` archives you load through **File > Drum Kit / Sound Kit Loader** (`K`). Kits are categorized for you (kick, snare, clap, hats, cymbals, toms, percussion, FX, vocal, loops, melodic). Use **Auto map** to turn a kit into FPC pads.

Use the search box to filter. Click a sound to select it (sounds preview as you select them), then press its **Load** button or double-click it to load it into the current instrument, or drag it onto an FPC pad or the instrument's waveform. Folders and kits have a **→ FPC** button that puts their sounds on the FPC pads. **File > Import FL Studio Packs Folder** reads a folder of samples that you own.

---

## Effects and the master chain

Three effects are available on every instrument, and on the master (`F9`):

- **Parametric EQ 2** - seven bands with a spectrum analyzer.
- **Gross Beat** - beat-synced volume gates, stutters, reverses and time effects.
- **Soundgoodizer** - a one-knob compressor / maximizer.

The master chain processes the whole song, including what **Export Song** renders.

---

## Plugins

### Using plugins

Plugins are small separate files in the `plugins/` folder, loaded when the page starts. All six are installed by default; remove the ones you do not use in the Plugin Manager and CarrotBox will not even download them.

- **Launcher** (`Tab`): a searchable list of everything installed. Type to filter, arrows and `Enter` to pick, `Esc` to close. Plugins you used recently float to the top.
- **Plugin Manager** (right-click or `Shift`-click the plugin button in the second toolbar row, or Settings > Plugin Manager): install and remove plugins. The sizes shown are real file sizes.
- **Loading an instrument plugin** puts it on the current instrument. **Effect plugins** are added to the instrument's effect list. **Tools** open their own window and write notes into the song.
- **Plugin windows** are floating panels. Drag the title bar to move, double-click it (or use the minimize button) to collapse, and close with the X button, with `Esc`, or by clicking outside a modal one. They remember where you left them. Space, undo and the other editor shortcuts, and the computer-keyboard piano, keep working while a plugin window has focus.
- **Presets.** Every plugin has a preset menu with the factory presets, **Save as my preset...**, **Copy settings** and **Paste settings** (move a sound between channels or songs), **Reset to default** and a **Random** button. Your own presets appear under "My presets" and can be deleted from the same menu.
- **Knobs.** Drag to change, hold `Shift` for fine control, double-click to reset, right-click to type a value (it understands what the knob shows: `42` on a percent knob is 42%, `1.5k` on a frequency knob is 1500 Hz, `250ms` on a time knob is a quarter second). The mouse wheel works too.
- **Everything saves with the song.** Plugin parameters are part of the song URL and the project file.

Setting: **Open plugin window when loading a plugin** controls whether picking a plugin also opens its window.

The six plugins below are original CarrotBox plugins. Each is a CarrotBox take on the workflow of a well-known commercial plugin and shares no code or data with it.

### Swarm (hybrid synth)

A fast, friendly synth in the spirit of Hive 2.

- 3 oscillators with 12 waveforms (sine, triangle, saw, square, pulse, saw/triangle morph, organ, strings, reed, glass, digital, noise), each with octave, semitone, fine tune, pulse width / morph and up to **8 voices of unison** with detune
- a sub oscillator (sine, triangle or square, one or two octaves down) and a noise generator
- two multimode filters (low pass 12/24, high pass 12/24, band pass, notch) in serial, parallel or split routing
- amp and modulation envelopes, 2 LFOs and a **6-slot mod matrix** (pitch, cutoffs, resonance, oscillator levels, pulse width / morph, unison detune, volume)
- stereo width, velocity sensitivity and an effect rack (see [Mangler FX](#mangler-fx-effect-rack) for the available effects)
- 17 factory presets (leads, basses, pads, keys, plucks, FX) and a Random button

### Prism (wavetable synth)

A wavetable synth in the spirit of Serum.

- two **morphing wavetable oscillators** with 10 built-in tables (basic shapes, analog PWM, saw stack, vowels, digital sweep, FM bell, organ drawbars, hollow reed, glass harmonics, and a user table)
- 10 **warp modes** per oscillator (sync, bend, mirror, asym, flip, fold, quantize, FM from the other oscillator)
- a **3D wavetable view** that shows the frames and the current position
- a **wavetable editor**: draw your own frames, or import any audio file and cut it into frames
- band-limited playback, so high notes do not alias
- sub, noise, a filter with comb modes, 3 envelopes, 4 LFOs, 2 macros and a **10-slot mod matrix**
- effect rack and 15 factory presets

### Seedling (grow your sounds)

A sound design tool in the spirit of Synplant. You do not program parameters, you grow sounds.

- **Plant.** Every sound has a "DNA" of 20 genes (shape, overtone, mix, detune, FM, noise, drive, sub, tremolo, vibrato, cutoff, resonance, filter envelope, attack, decay, sustain, release, pitch drop and more). Press **Plant** to make the current sound the root and grow a ring of 12 mutated **branches**. Click a branch to move there and hear it, then plant again from that spot. **Back to the root** and undo let you explore without getting lost, and **Mutation** controls how far the branches stray.
- **Genes.** Edit the DNA directly with knobs when you want a specific change.
- **Genopatch.** Drop in or choose an audio sample and Seedling uses a genetic algorithm to evolve a patch that imitates it (this takes a few seconds). Hear the target, grow, then keep the result.
- Effect rack with up to 6 effects, and a Random button.

### Chop Shop (sample chopper)

A sample chopper in the spirit of Serato Sample.

- drop in or choose a sample; Chop Shop **finds 16 cues** automatically and shows them as markers on the waveform and as pads
- it **detects the tempo (BPM) and the key** of the sample. Both can be corrected by hand and re-analyzed, and neither is guessed for very short sounds
- **Key shift** changes the pitch without changing the speed, and **Sync to song tempo** stretches the sample to the song's BPM without changing the pitch (both use high quality time stretching)
- drag a cue marker to move it, click the waveform to hear from that point, double-click to put the selected pad's cue there, snap cues to the beat grid
- cue 1 plays from the first key and the rest follow up the keyboard (on a drum channel, cue 1 is the bottom row)
- **Chop into pattern** writes the cues as notes into the current pattern so the chopped loop plays back on its own

### Sketchpad (idea sketcher)

A tool in the spirit of MidiSketch. It writes notes into the song and has four tabs:

- **Melody.** Draw a line with the mouse (right-drag or `Alt`-drag to erase, lift the pen for rests). The line snaps to the song's scale or, with **Snap to scale** off, to any semitone. Choose the length and rhythm, preview, and **insert** it as notes in the current channel.
- **Chords.** Pick a progression (pop, emotional, 50s, jazzy, rock, minor epic, dark, uplifting, canon) or build one slot by slot with scale degree, chord type (triad, seventh, sus 2, sus 4, add 9, sixth, power) and inversion. Choose a rhythm (whole bar, half notes, quarter notes, off-beat stabs, syncopated, charleston, pumping eighths), voicing and octave, then insert.
- **Bass.** A bass line that follows the chord progression.
- **Arp.** Arpeggiates the chord progression (up, down, up and down, down and up, random, converge, root between).

Every tab can write to the bar you choose (0 means the bar you have selected), and everything it writes is one undo step.

### Mangler FX (effect rack)

A creative multi-effect rack in the spirit of UGFX. Chain up to **8 effects** from this list:

Distortion, Bitcrusher, Filter, Chorus, Flanger, Phaser, Delay, Reverb, Glitch Repeat, Tape Stop, Ring Mod, Tremolo / Pan, Compressor, Multiband (OTT), Stereo Width, Lo-fi / Vinyl, 3-Band EQ, Noise Gate, De-esser and Utility.

- a **signal flow** diagram shows the chain
- **4 macros** can each control any parameter of any effect with a positive or negative amount, which makes it easy to build one-knob sweeps, drops and builds
- input gain, dry/wet and output gain
- 13 factory presets (Space Sweep, Tape Warble, Stutter Gate, Halftime Brake, Pulse Pan, Bit Furnace, Fold Machine, Radio Wreck, Dub Echo, Cathedral, Jet Flange and more)

The same rack is built into Swarm, Prism and Seedling as their "Effects" tab.

---

## Tools: generator, recorder, metronome

- **Lead / melody generator** (`G`): makes ideas that fit the song's key and scale. Choose what to make (lead melody, counter-melody, bass line, arpeggio, chords or drum groove), the style (pop, trap / drill, house / EDM, lo-fi / chill and more), the length (1 to 8 bars) and the form (AABA, ABAB, AAAB, ABAC or free). It starts from **your own 4 notes**, from ideas already in your song, or both. **Density**, **Complexity** and register shape the result. **Generate** gives a brand new idea, **Variation** a close one, **Next bars** continues after it; the result is written into the current channel or a new channel as one undo step (`Z` undoes it) and can play right away.
- **Audio recorder** (**File > Audio Recorder...**): records your **microphone** (voice or an instrument) with a mixing effect chain. Choose the input device, record with the song playing and a count-in, keep several takes, and set the effect tail, fades, output level and normalize. **Preview with FX**, then **Place in song**, **Load into current instrument** (as a sample) or **Download WAV**.
- **Metronome** (toolbar button or `T`): its volume is in Settings.
- **Color themes**: 18 themes, including FL Studio style ones, dark and light classics, high contrast, Dracula, Nord and more.
- **Modern skin**: an optional look with rounded panels and softer shadows (Settings > Modern UI).

---

## Settings and preferences

BeepBox's own **Preferences** menu still holds the classic options (auto follow, ghost notes, piano keys, note colors, layout and so on). Every entry works and takes effect right away.

CarrotBox's own panel is the **Settings** button next to the other buttons (or `,`):

| Setting | What it does |
| --- | --- |
| Modern UI | Switches to the polished skin. |
| Interface size | Zooms the whole editor (good for high resolution screens). |
| Color theme | Opens the theme picker. |
| Layout | BeepBox's wide / tall / focus layouts. |
| Reduce motion | Turns animations off. |
| UI sounds + volume | Soft clicks when you press buttons and open windows. |
| Metronome volume | The click volume. |
| Extra keyboard shortcuts | Turns the extra single-key shortcuts (`K`, `G`, `E`, `B`, `T`, `,`, `?`) on or off. `Tab`, `F5`, `F8`, `F9` and `Esc` always work. |
| Open plugin window when loading a plugin | Off = plugins load silently. |
| Show messages | The small notices at the bottom of the editor. |
| Warn before leaving | Ask before closing or reloading when there are changes you have not saved or exported. |
| Show play state in the page title | The browser tab says "Playing" while the song plays. |
| Keyboard shortcuts | Opens the shortcut list. |
| Plugin Manager | Install or remove plugins. |
| Imported samples and kits | Shows how much space your imports use and lets you clear them. |
| Reset these settings | Puts everything in this panel back to its default. |

Settings are stored in your browser (`localStorage`), so they stay when you reload and are not part of the song.

---

## Keyboard shortcuts

Press `?` for this list inside CarrotBox.

**Playback**

| Keys | Action |
| --- | --- |
| `Space` | Play / pause |
| `Shift` + `Space` | Play from the mouse position |
| `[` / `]` | Move the playhead back / forward a bar |
| `F` | Back to the start |
| `H` | Jump to the selected bar |
| `T` | Metronome on / off |

**Editing**

| Keys | Action |
| --- | --- |
| `Z` / `Y` | Undo / redo |
| `C` / `V` | Copy / paste |
| `A` | Select all |
| `Ctrl` + `D` | Copy bar to next bar |
| `Shift` + `Backspace` | Clear pattern |
| `Shift` + `H` | Humanize volumes |
| `Shift` + `Q` | Quantize to grid |
| `0` - `9` | Set pattern number |
| `M` / `S` | Mute / solo channel (`Shift` for the others) |
| `Alt` (while dragging) | No snapping |
| `Alt` + click on a ghost note | Jump to that note's channel |

**Views and windows**

| Keys | Action |
| --- | --- |
| `F5` | Grid / playlist |
| `F8` or `B` | Sound Browser |
| `F9` | Master effects |
| `Tab` | Plugin launcher |
| `E` | Edit the current plugin or sample |
| `Esc` | Close the topmost window |

**Tools and files**

| Keys | Action |
| --- | --- |
| `K` | Drum kit / sound kit loader |
| `G` | Lead / melody generator |
| `,` | CarrotBox settings |
| `?` | Shortcut list |
| `Ctrl` + `S` | Export song |
| `Ctrl` + `O` | Import song |

Single-letter shortcuts are paused while you are typing in a text box, a plugin window's number field or the launcher search.

---

## Saving, sharing and storage

- **The address bar is the song.** CarrotBox keeps the current song in the URL, as BeepBox does. Plugin settings, effects and sample references are included. Copy the address or use **File > Copy Song URL** and **Share Song URL**.
- **Audio is not in the URL.** Built-in sounds are generated by CarrotBox, so a link that uses them works anywhere. Samples you imported yourself are too large for a link: the link only remembers which one was used, and it plays where that sample is in the library. To move such a song to another computer use **Save Project + Samples**.
- **Save Project + Samples (.json).** Writes the whole song plus the audio files it needs. Open it with **File > Import Song** or just drag the file onto the page. `.mid` files can be dropped on the page too.
- **Drop audio.** Dropping one audio file on the pattern area loads it into the current instrument as a sample; dropping several files, a folder or a `.zip` opens the kit importer.
- **Export Song** writes WAV/MP3/MIDI/JSON like BeepBox.
- **Recover Recent Song** lists the last songs you worked on (kept in your browser). Choose a version and press **Open this version**.
- **Where things are stored.** Settings, installed plugin list, user presets and recently used plugins are in `localStorage`. Imported samples and kits are in `IndexedDB`. Both belong to the website address you are using, so a different address (or a private window) starts empty. Use **Settings > Imported samples & kits > Clear** to free the space.
- **Warn before leaving** (Settings) asks before you close the tab when changes were not saved or exported.

---

## Troubleshooting and FAQ

**There is no sound.** Browsers keep audio paused until you interact with the page: press `Space`, click a piano key or press Play once. Check the volume slider next to Play and the mute buttons of the channel.

**A plugin is missing in the launcher.** Plugins are loaded from the `plugins/` folder, so the page must be served over HTTP (not opened from `file://`) and the file must exist next to `index.html`. Also check the Plugin Manager: a plugin that was removed there does not load.

**A song with a plugin opens with a plain instrument.** The plugin is not installed in this browser (it was removed in the Plugin Manager, or its file could not be loaded). Install it in the Plugin Manager and reopen the song.

**A sample plays only some notes.** Sampler plays every key. Slicex plays one slice per key from C4 up (the panel tells you the range), and FPC plays one pad per row. In Chop Shop, cue 1 sits on the first key and the rest follow upward.

**A sample from a file does not load.** CarrotBox decodes what your browser can decode (WAV, MP3, OGG, FLAC and AAC in most browsers). A file that fails to decode shows a message instead of breaking the editor.

**I cannot close a plugin window.** Use the X in the title bar or press `Esc` (it works from inside the window as well). **Window** state is not saved with the song. If a window ever ends up off screen, press `Esc`, reopen it, and drag its title bar.

**Everything looks too small / too large.** Settings > Interface size.

**The browser tab warns me when I leave.** That is the **Warn before leaving** option in Settings.

**Why are there no samples from FL Studio or other commercial packs?** None are bundled. The built-in sounds are generated by CarrotBox. You can load your own files and folders, including packs you own.

---

## Development

### Running it

CarrotBox needs a web server (plugins and samples are loaded with `fetch` and script tags). Any static server works. The repository includes a tiny one that needs only Node:

```sh
./dev.sh            # builds and serves on http://localhost:8123/
./dev.sh 9000       # same on another port
# or, without building:
node tools/serve.js 8123
python3 -m http.server 8123
```

Then open `http://localhost:8123/` (or `/index.html`).

### Repository layout

```
index.html              the page; loads carrotbox_editor.js and creates the editor
carrotbox_editor.js     the built editor bundle (generated by build.pl, committed)
build.pl                builds the bundle and syntax-checks it and the plugins
dev.sh                  build + serve
plugins/                the six plugins, one file each, loaded on demand
  swarm.js prism.js seedling.js chopshop.js sketchpad.js mangler.js
src/
  beepbox_base.js       the (modded) BeepBox editor; includes the files below
  fl_changes.js         undo-able changes for the CarrotBox features
  fl_codec.js           song URL / JSON encoding of the CarrotBox data
  fl_dsp.js             sample playback, effects (EQ, Gross Beat, ...), plugin voices
  fl_samples.js         sample bank, kits, decoding, importing
  fl_soundfactory.js    the built-in generated sounds
  fl_soundpacks.js      the built-in sound catalog
  fl_presets.js         instrument presets
  fl_themes.js          color themes
  fl_plugins.js         plugin catalog, registry, effect rack engine
  fl_ui_plugins.js      plugin windows, launcher, manager, UI kit (CarrotUI)
  fl_ui_instrument.js   the instrument panel for Sampler / Slicex / 3x Osc / FPC
  fl_ui_browser.js      the Sound Browser
  fl_ui_editor.js       playlist glue, menus, project saving
  fl_ui_playlist.js     the playlist view
  fl_ui_prompts.js      EQ, master, sample editor and other prompts
  fl_ui_widgets.js      shared widgets
  fl_ui_style.js        the stylesheet
  fl_ui_extras.js       settings, shortcuts, kit loader, generator, recorder
  fl_leadgen.js         the lead / melody generator
  fl_settings.js        BeepBox preference additions
tools/
  serve.js              static file server
  smoke.js              headless smoke test (Playwright)
```

### Building

`carrotbox_editor.js` is generated. After changing anything in `src/`, run:

```sh
perl build.pl
```

`build.pl` expands the `//@@INCLUDE file.js@@` lines in `src/beepbox_base.js`, so all modules share one closure with BeepBox's own classes, writes `carrotbox_editor.js`, updates the download sizes in the plugin catalog from the real plugin files and syntax-checks the bundle and every plugin (it uses `node --check`, or JavaScriptCore on macOS if Node is missing). Plugins are plain scripts and are not bundled: edit a file in `plugins/` and reload the page.

### Testing

`tools/smoke.js` is a headless browser test that starts the editor, opens and closes every plugin window in all three ways, renders every preset of the instrument plugins offline and checks the audio is finite and audible, and fails on any console error.

```sh
npm install playwright      # once, plus: npx playwright install chromium
perl build.pl && node tools/smoke.js
```

### Writing a plugin

A plugin is one JavaScript file in `plugins/` that registers itself. **Add it to the catalog first**: `CARROT_PLUGIN_CATALOG` at the top of `src/fl_plugins.js` lists the id, name, kind (`instrument`, `effect` or `tool`), file name, badge text and color, and `register()` throws for an id that is not listed. Then rebuild.

The skeleton for an instrument:

```js
(function () {
    "use strict";
    const B = window.beepbox;
    if (!B || !B.CarrotPlugins) return;
    const { HTML, CarrotUI } = B.CarrotAPI;

    B.CarrotPlugins.register({
        id: "myplugin",
        defaultParams: () => ({ level: 0.8, tone: 0.5 }),
        presets: [{ name: "Bright", params: { tone: 0.9 } }],
        randomize: (params) => Object.assign(params, { tone: Math.random() }),
        width: 520,

        // one voice per note
        createVoice(params, info) { return { phase: 0, done: false }; },
        // fill out[start .. start+len) with mono audio; set voice.done = true when finished
        render(voice, out, start, len, info) {
            for (let i = 0; i < len; i++) {
                out[start + i] += Math.sin(voice.phase) * info.gate * 0.2;
                voice.phase += 2 * Math.PI * info.freq / info.sampleRate;
            }
        },

        // the window contents; `host` binds controls to the parameters
        buildEditor(host) {
            return HTML.div(host.knob("level", { label: "Level", min: 0, max: 1, def: 0.8 }));
        },
    });
})();
```

Things to know:

- **Parameters** live in the song and are always a plain JSON object. Merge them with your defaults when you read them (`Object.assign({}, defaults, params)`): a plugin that loads late may be handed `{}`.
- **`info`** for voices has `freq`, `freqScale`, `gate`, `params`, `sampleRate`, `midi`, `notePitch`, `velocity`, `isNoise`, `bpm` and `key`.
- **Gain staging:** CarrotBox scales plugin voices by a small base expression (0.04), so aim for a peak of about 0.5 to 1 in `render`.
- **Effects** implement `createState(params, info)` and `process(state, params, left, right, start, end, ctx)` instead of voices. Instrument plugins can also offer `createInstrumentState` / `processInstrument` for per-instrument processing, as Swarm does for its effect rack.
- **Tools** implement `open(host)` and use `host.writeNotes(...)` to put notes in the song.
- **The host** (`buildEditor(host)`) gives you `knob`, `select`, `toggle`, `envelope` and `fxParam` bindings that update the song and undo history for you, `noteOn` / `noteOff` / `previewNote` for audio previews, `pickAudioFile`, `acceptSampleDrops` and `sample()` for audio files.
- **`beepbox.CarrotAPI`** also exports `CarrotUI` (knobs, selects, tabs, sections, buttons), `CarrotFX` and `carrotFxRack` (the effect rack), DSP helpers (`CarrotDSP`, `CarrotADSR`, `CarrotSVF`, `CarrotDelayLine`, `CarrotWavetable`), `FLSampleBank`, `carrotToNorm` / `carrotFromNorm`, `flToast` and `addStyle`. Read the existing plugins for working examples of each.
- Use `onClose(host)` to clean up timers or audio when the window closes.

---

## What was fixed

This section lists the main problems found in the first version of the mod and what was done about them.

**Startup and wiring**

- Two modules (the settings / shortcuts / kit / generator / recorder code and the melody generator) were never included in the bundle, so most buttons did nothing or threw errors. They are included and initialized now.
- The page loaded a stale bundle through an old HTML file. `index.html` now loads the current build, `dev.sh` points at a file that exists and `build.pl` really syntax-checks the output.
- The `plugins/` folder was empty. The six plugins are written and included.
- A failing listener in the change notifier could freeze the whole UI. Listeners are isolated now.
- `localStorage` errors (private mode, blocked storage) no longer break startup.

**Preferences and settings**

- Buttons and options in the preferences and settings that did nothing now work: Modern UI, interface size, reduce motion, UI sounds, extra shortcuts, messages, warn before leaving, play state title, metronome volume, plugin auto-open and reset.
- The settings panel is wired to the real preferences, shows the real storage use and can clear it.
- Pressing `Esc` closes the topmost window or panel everywhere.

**Samples**

- The slowest built-in sounds (piano chords and the melodic loops) are now two to five times faster to generate (the worst case dropped from about 360 ms to about 125 ms), so first use is much less likely to glitch playback.
- Live preview (clicking keys, the piano roll, or hearing notes while stopped) was silent in some cases because the audio engine was never woken up; it is woken up now.
- NaN and out-of-range values in sample playback (empty or very short samples, extreme markers, zero-length loops) are guarded so they can no longer take down the audio or the editor.
- A race that left a kit half-loaded when a note was played too early was fixed; notes wait for their sample.
- Choosing, dropping or decoding a bad file shows a message instead of leaving the editor in a broken state.
- Every instrument panel is clamped to a valid instrument, which fixes crashes after deleting channels or switching types quickly.
- Slicex states its key range in the panel, and FPC / Chop Shop explain where their pads and cues are.

**Windows and UI**

- Plugin windows could not be closed in several situations. They now close with the X button, `Esc` (also with focus inside) and, for modal ones, an outside click.
- The sample editor and other canvases overflowed their panels and made prompts jump. They are laid out correctly in every theme.
- Check boxes and rows wrapped badly in narrow panels; they wrap now.
- Layout glitches in plugin windows (clipped controls, controls that did not wrap, canvases that overflowed) were cleaned up. The plugin UI is one consistent kit with the same knobs, selects, tabs and sections everywhere.
- A negative SVG width error in the bar scroll bar when the window was tiny.
- Deleting bars while the song plays with auto-follow on could leave the selected bar past the end of the song, and the next click in the grid threw an error. The selected bar and channel are always kept inside the song now.
- "View in Song Player" and "Copy HTML Embed Code" pointed to a player page that is not part of CarrotBox. They were removed, and **Recover Recent Song** now opens a version directly instead of embedding a player.
- Every emoji was removed from the interface (menus, buttons, plugin icons, toasts, README). Badges are text or drawn icons.

**Plugins**

- **Swarm**, **Prism**, **Seedling**, **Chop Shop**, **Sketchpad** and **Mangler FX** were written and tested: windows, presets, randomize, undo, saving in song URLs and project files, and offline audio rendering for finite, audible output.

**Quality of life**

- Shortcuts cheat sheet (`?`), settings panel (`,`), sound browser (`B`), kit loader (`K`), generator (`G`), edit plugin (`E`), metronome (`T`).
- Plugin launcher with search and recently used plugins; user presets; copy / paste settings; reset to default; plugin keyboard focus handling; remembered window positions.
- Right-click on any knob to type a value in the units it shows (percent, kHz, ms, dB); double-click to reset; wheel support.
- Renaming patterns and tracks, naming presets, typing knob values and copying text use small in-page dialogs instead of the browser's own prompt, which froze the page and stopped the audio while it was open.
- Drag and drop a song, project or audio file onto the page.
- Warn before leaving with unsaved changes (optional), play state in the page title, toast messages, undo-friendly operations.
- More color themes (18) and a modern skin; interface scale; reduced motion option.
- Humanize, quantize, clear pattern, copy bar to next bar.
- Honest download sizes in the Plugin Manager.
- A smoke test, a development server and this README.

---

## Known limitations

- Audio runs on a script processor node (as in BeepBox). A very heavy song on a slow computer can crackle; raise the buffer by closing other tabs or reduce unison voices and effects.
- Built-in sounds are generated the first time you use them. Almost all take a few milliseconds; the longest melodic loops take about a tenth of a second, which can cause one tiny hiccup if they start while the song is playing.
- Slicex plays slices from C4 upward only. Use the slice markers if you need a different layout.
- Imported samples live in your browser. Move them between computers with **Save Project + Samples**.
- Songs made with CarrotBox only open fully in CarrotBox. BeepBox will ignore the extra data (and the stock BeepBox site cannot play plugin instruments).

---

## Credits and license

CarrotBox is built on **BeepBox** by John Nesky and the BeepBox contributors, used under the MIT license. The names of commercial products mentioned in this document are trademarks of their owners, and CarrotBox is not affiliated with them. The plugins are original works inspired by the way those tools are used and contain no code, samples or presets from them. FL Studio is a trademark of Image-Line; CarrotBox contains no FL Studio content.

CarrotBox is released under the **MIT license**, the same as BeepBox:

```
MIT License

Copyright (c) 2012-2022 John Nesky and contributing authors (BeepBox)
Copyright (c) CarrotBox contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
