    // ======================================================================
    // CarrotBox: idea generator. Makes leads, hooks, counter-melodies,
    // harmonies, bass lines, arps, chords, drum grooves and percussion from
    // 4 seed notes and/or what's already in the song. Pure functions: returns
    // bars of notes for carrotWriteNotes.
    //
    // Rhythm: bars are built from one-beat "cells" (x = new note, - = hold,
    // . = rest) picked by the style's feel, with repetition inside the bar,
    // syncopation from Complexity and more notes from Density.
    // Pitch: every note is a weighted choice between scale steps, small leaps
    // and big leaps, pulled toward a phrase contour, toward chord tones on
    // strong beats, back after leaps, and away from awkward intervals.
    // Catchiness: motifs repeat across the form (AABA, ...), follow the chords
    // and end each phrase on a cadence.
    // ======================================================================
    const CARROT_GEN_CELLS = [
        ["x---", "long"], ["x-..", "short"], ["x...", "short"], ["x-x-", "eighths"], ["x.x.", "staccato"],
        ["x-xx", "sixteenths"], ["xxx-", "sixteenths"], ["xxxx", "sixteenths"], ["x.xx", "sixteenths"],
        ["xx-x", "sync"], ["..x-", "sync"], [".x-x", "sync"], [".xx.", "sync"], ["x..x", "sync"],
        ["x--x", "dotted"], ["x-.x", "dotted"],
        ["--x-", "tie"], ["---x", "tie"], ["-x-x", "tie"],
        ["----", "hold"], ["....", "rest"],
    ].map(([pat, tag]) => ({ pat, tag, onsets: pat.split("").filter(c => c == "x").length }));
    // Feel presets: how much each kind of cell is used.
    const CARROT_GEN_FEELS = {
        even: { long: 1.2, short: 0.4, eighths: 1.4, staccato: 0.5, sixteenths: 0.5, sync: 0.8, dotted: 1, tie: 0.6, hold: 0.5, rest: 0.4 },
        bouncy: { long: 0.8, short: 0.6, eighths: 0.8, staccato: 0.6, sixteenths: 1.3, sync: 1, dotted: 1, tie: 0.5, hold: 0.3, rest: 0.6 },
        offbeat: { long: 0.5, short: 0.8, eighths: 0.9, staccato: 1.2, sixteenths: 0.6, sync: 1.4, dotted: 1, tie: 0.8, hold: 0.3, rest: 0.6 },
        laid: { long: 1.4, short: 0.5, eighths: 1, staccato: 0.4, sixteenths: 0.4, sync: 0.8, dotted: 0.9, tie: 0.8, hold: 1, rest: 0.8 },
        drive: { long: 1, short: 0.6, eighths: 1.6, staccato: 0.6, sixteenths: 0.4, sync: 0.6, dotted: 0.8, tie: 0.5, hold: 0.6, rest: 0.4 },
        busy: { long: 0.6, short: 0.6, eighths: 1.2, staccato: 1.3, sixteenths: 1.4, sync: 0.9, dotted: 0.9, tie: 0.3, hold: 0.3, rest: 0.4 },
        funky: { long: 0.3, short: 1, eighths: 0.6, staccato: 1.3, sixteenths: 1.2, sync: 1.5, dotted: 0.8, tie: 0.6, hold: 0.2, rest: 0.9 },
        floaty: { long: 2, short: 0.2, eighths: 0.5, staccato: 0.1, sixteenths: 0.1, sync: 0.3, dotted: 0.5, tie: 1, hold: 2, rest: 0.6 },
        smooth: { long: 1, short: 0.5, eighths: 0.8, staccato: 0.4, sixteenths: 1, sync: 1.2, dotted: 1, tie: 1, hold: 0.6, rest: 0.6 },
        tresillo: { long: 0.6, short: 0.7, eighths: 0.9, staccato: 0.9, sixteenths: 0.7, sync: 1.2, dotted: 1.8, tie: 0.7, hold: 0.3, rest: 0.5 },
        swing: { long: 0.8, short: 0.7, eighths: 1.6, staccato: 0.7, sixteenths: 0.3, sync: 1.2, dotted: 0.5, tie: 1, hold: 0.4, rest: 0.7 },
        chaos: { long: 0.5, short: 0.8, eighths: 0.8, staccato: 1, sixteenths: 1.6, sync: 1.3, dotted: 0.9, tie: 0.5, hold: 0.3, rest: 0.5 },
    };
    // Drum strings are 16 steps (one 4/4 bar, repeated for longer bars).
    //   x hit, X accent, o ghost, r roll (hats).
    // Roles: k kick, s snare, c clap, h closed hat, o open hat, rd ride,
    //        p perc, rm rim, sh shaker, t toms.
    // Bass steps are [step, tone, length]: R root, 5 fifth, O octave, 3 third,
    //   7 seventh, A approach note into the next chord.
    // Comp (chord rhythm) steps are [step, length].
    const CARROT_GEN_STYLES = {
        pop: { name: "Pop", feel: "even", legato: 0.9, repeat: 0.12, leap: 0.12, contour: "arch",
            chords: { major: [[0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [3, 0, 4, 5]], minor: [[0, 5, 2, 6], [0, 3, 6, 2], [5, 6, 0, 0]] },
            bass: [[[0, "R", 4], [6, "R", 2], [8, "5", 4], [12, "R", 3], [14, "O", 2]], [[0, "R", 6], [8, "R", 6], [14, "A", 2]], [[0, "R", 3], [3, "R", 3], [6, "R", 2], [8, "R", 3], [11, "R", 3], [14, "5", 2]]],
            comp: [[[0, 8], [8, 8]], [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], [[0, 16]]],
            drums: [{ k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x.", o: "..............x." }, { k: "x..x....x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, { k: "x.......x..x....", s: "....x.......x..o", h: "xxxxxxxxxxxxxxxx" }],
            arp: ["up", "updown", "pinky"] },
        trap: { name: "Trap", feel: "bouncy", legato: 0.75, repeat: 0.3, leap: 0.1, contour: "wave", glide: true,
            chords: { major: [[0, 5, 3, 4], [5, 3, 0, 4]], minor: [[0, 0, 5, 4], [0, 5, 6, 5], [0, 3, 5, 4]] },
            bass: [[[0, "R", 10], [10, "R", 3], [14, "5", 2]], [[0, "R", 6], [7, "R", 3], [11, "O", 5]], [[0, "R", 3], [3, "R", 7], [10, "R", 6]]],
            comp: [[[0, 16]], [[0, 8], [8, 8]]],
            drums: [{ k: "x......x..x.....", s: "........x.......", h: "x.x.x.x.x.x.r.x." }, { k: "x.....x...x..x..", s: "........x.......", h: "x.xxx.x.x.r.x.x." }, { k: "x.......xx......", s: "........x.......", h: "x.x.r.x.x.x.rrx.", o: "......x........." }],
            arp: ["up", "random", "pinky"], rolls: true },
        drill: { name: "Drill (UK / NY)", feel: "tresillo", legato: 0.8, repeat: 0.25, leap: 0.12, contour: "falling", glide: true,
            chords: { major: [[5, 3, 0, 4]], minor: [[0, 5, 2, 6], [0, 3, 0, 4], [0, 6, 5, 6], [0, 5, 3, 4]] },
            bass: [[[0, "R", 7], [7, "5", 3], [10, "R", 6]], [[0, "R", 4], [4, "O", 2], [6, "R", 6], [12, "5", 4]], [[0, "R", 3], [3, "R", 5], [10, "3", 6]]],
            comp: [[[0, 16]], [[0, 6], [6, 10]]],
            drums: [{ k: "x.........x.....", s: "........x..x....", h: "x..x..x.x..x..x." }, { k: "x.....x...x.....", s: "........x.....x.", h: "x..x..x...x..x.." }, { k: "x..x......x..x..", s: "........x..x....", h: "x..x..x.r..x..x.", p: "..........x....." }],
            arp: ["down", "random"], rolls: true },
        house: { name: "House", feel: "offbeat", legato: 0.6, repeat: 0.25, leap: 0.15, contour: "wave", swing: [0.25, 16],
            chords: { major: [[5, 3, 0, 4], [0, 4, 5, 3], [1, 4, 0, 5]], minor: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 6, 2]] },
            bass: [[[2, "R", 2], [6, "R", 2], [10, "R", 2], [14, "O", 2]], [[0, "R", 1], [2, "O", 2], [6, "R", 2], [8, "R", 1], [10, "O", 2], [14, "R", 2]], [[3, "R", 2], [7, "R", 2], [11, "5", 2], [14, "O", 2]]],
            comp: [[[2, 2], [6, 2], [10, 2], [14, 2]], [[0, 3], [3, 3], [6, 4], [10, 3], [13, 3]], [[3, 2], [7, 2], [11, 2], [15, 1]]],
            drums: [{ k: "x...x...x...x...", c: "....x.......x...", h: "x.xxx.xxx.xxx.xx", o: "..x...x...x...x." }, { k: "x...x...x...x...", c: "....x.......x...", h: "xxxxxxxxxxxxxxxx" }, { k: "x...x...x...x..x", c: "....x.......x...", s: "...........o....", o: "..x...x...x...x.", sh: "xxxxxxxxxxxxxxxx" }],
            arp: ["up", "updown", "octaves"] },
        techno: { name: "Techno", feel: "busy", legato: 0.5, repeat: 0.35, leap: 0.12, contour: "wave",
            chords: { major: [[0], [0, 3, 0, 3]], minor: [[0], [0, 0, 5, 5], [0, 6, 0, 6]] },
            bass: [[[2, "R", 1], [3, "R", 1], [6, "R", 1], [7, "R", 1], [10, "R", 1], [11, "R", 1], [14, "R", 1], [15, "R", 1]], [[2, "R", 2], [6, "R", 2], [10, "R", 2], [14, "R", 2]], [[1, "R", 1], [3, "R", 1], [5, "O", 1], [7, "R", 1], [9, "R", 1], [11, "O", 1], [13, "R", 1], [15, "5", 1]]],
            comp: [[[0, 1], [3, 1], [6, 1], [10, 1]], [[2, 2], [10, 2]], [[3, 1], [7, 1], [11, 1], [14, 1]]],
            drums: [{ k: "x...x...x...x...", c: "....x.......x...", h: "..x...x...x...x.", rd: "x.x.x.x.x.x.x.x.", p: "...x......x....." }, { k: "x...x...x...x...", h: "xxxxxxxxxxxxxxxx", o: "..x...x...x...x.", c: "........x......." }, { k: "x...x...x...x...", h: "x.xxx.xxx.xxx.xx", o: "..x...x...x...x.", rm: "...x..x....x..x." }],
            arp: ["up", "octaves", "random"] },
        dnb: { name: "Drum & Bass", feel: "laid", legato: 0.85, repeat: 0.15, leap: 0.15, contour: "arch",
            chords: { major: [[3, 4, 2, 5], [0, 5, 3, 4]], minor: [[0, 5, 3, 6], [0, 3, 5, 4], [0, 5, 2, 6]] },
            bass: [[[0, "R", 10], [10, "5", 6]], [[0, "R", 6], [6, "R", 4], [10, "O", 6]], [[0, "R", 3], [3, "R", 7], [10, "R", 3], [13, "A", 3]]],
            comp: [[[0, 16]], [[0, 6], [6, 10]]],
            drums: [{ k: "x.........x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, { k: "x.........x..x..", s: "....x..o....x...", h: "x.xxx.x.x.xxx.x." }, { k: "x.x.......x.....", s: "....x.......x..o", h: "xxxxxxxxxxxxxxxx", rd: "x...x...x...x..." }],
            arp: ["updown", "up"] },
        breakcore: { name: "Breakcore", feel: "chaos", legato: 0.6, repeat: 0.2, leap: 0.25, contour: "wave", chaos: true,
            chords: { major: [[0, 4, 5, 3], [5, 3, 4, 4]], minor: [[0, 5, 2, 6], [0, 6, 5, 4], [0, 3, 5, 5]] },
            bass: [[[0, "R", 4], [4, "R", 4], [8, "5", 4], [12, "O", 4]], [[0, "R", 8], [8, "R", 8]], [[0, "R", 2], [3, "R", 2], [6, "O", 2], [8, "R", 2], [11, "5", 2], [14, "A", 2]]],
            comp: [[[0, 16]], [[0, 4], [6, 4], [12, 4]]],
            drums: [{ k: "x.x.......xx....", s: "....x..o.o..x..o", h: "x.x.x.x.x.x.x.x." }, { k: "x.x.......x.....", s: "....x..x.x..x.xx", h: "xxxxxxxxxxxxxxxx" }, { k: "xx..x.x...x.x...", s: "..x.x.xx.xx.x.xx" }, { k: "x.x...x.x.x.....", s: "....x.x...xxx.x.", o: "..............x." }],
            arp: ["random", "updown", "octaves"] },
        lofi: { name: "Lo-fi / Chill", feel: "laid", legato: 0.95, repeat: 0.1, leap: 0.18, sevenths: true, ninths: true, contour: "falling", swing: [0.6, 16],
            chords: { major: [[1, 4, 0, 5], [3, 2, 1, 0], [0, 5, 1, 4]], minor: [[3, 6, 0, 0], [0, 3, 5, 4], [5, 3, 0, 4]] },
            bass: [[[0, "R", 6], [7, "5", 3], [10, "R", 5]], [[0, "R", 3], [6, "R", 2], [8, "5", 6], [14, "A", 2]]],
            comp: [[[0, 7], [7, 9]], [[0, 16]], [[0, 3], [6, 10]]],
            drums: [{ k: "x......x..x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, { k: "x.......x.x.....", s: "....x.......x.o.", h: "x.x.x.x.x.x.x.x." }],
            arp: ["up", "broken"] },
        boombap: { name: "Boom Bap / Hip-hop", feel: "funky", legato: 0.8, repeat: 0.2, leap: 0.15, sevenths: true, contour: "falling", swing: [0.7, 16],
            chords: { major: [[1, 4, 0, 0], [0, 3, 1, 4]], minor: [[0, 3, 5, 4], [0, 5, 3, 4], [0, 0, 3, 3]] },
            bass: [[[0, "R", 3], [7, "R", 2], [10, "5", 4], [14, "A", 2]], [[0, "R", 5], [6, "R", 2], [10, "O", 2], [12, "5", 4]]],
            comp: [[[0, 6], [10, 6]], [[0, 16]], [[0, 3], [7, 3], [10, 6]]],
            drums: [{ k: "x......x..x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, { k: "x.x.......x..x..", s: "....x..o....x...", h: "x.x.x.x.x.x.x.x.", o: "..............x." }, { k: "x......xx.......", s: "....x.......x..o", h: "x.xxx.x.x.xxx.x." }],
            arp: ["broken", "up"] },
        rnb: { name: "R&B / Neo-soul", feel: "smooth", legato: 0.9, repeat: 0.12, leap: 0.15, sevenths: true, ninths: true, contour: "arch", swing: [0.45, 16],
            chords: { major: [[3, 2, 1, 0], [0, 5, 1, 4], [3, 4, 2, 5]], minor: [[0, 3, 5, 4], [5, 3, 0, 4]] },
            bass: [[[0, "R", 5], [6, "5", 2], [8, "7", 3], [11, "O", 2], [14, "A", 2]], [[0, "R", 7], [8, "R", 3], [11, "5", 3], [14, "A", 2]]],
            comp: [[[0, 6], [6, 4], [10, 6]], [[0, 16]], [[0, 3], [6, 2], [8, 8]]],
            drums: [{ k: "x......x..x.....", s: "....x.......x...", h: "x.xxx.x.x.xxx.x." }, { k: "x.....x...x..x..", s: "....x..o....x...", h: "x.x.x.x.x.x.x.x.", rm: "...x.....x......" }],
            arp: ["broken", "updown"] },
        afro: { name: "Afrobeats / Amapiano", feel: "tresillo", legato: 0.75, repeat: 0.2, leap: 0.15, contour: "wave", swing: [0.3, 16],
            chords: { major: [[3, 0, 4, 5], [0, 5, 3, 4], [1, 4, 0, 0]], minor: [[0, 5, 6, 3], [0, 3, 5, 6]] },
            bass: [[[0, "R", 3], [3, "R", 3], [6, "5", 2], [10, "R", 3], [13, "O", 3]], [[0, "R", 2], [3, "O", 3], [8, "R", 2], [11, "5", 3], [14, "A", 2]]],
            comp: [[[0, 2], [3, 2], [6, 2], [10, 2], [13, 2]], [[3, 3], [11, 3]], [[0, 6], [8, 8]]],
            drums: [{ k: "x..x....x..x....", rm: "...x..x....x..x.", sh: "xxxxxxxxxxxxxxxx", c: "....x.......x...", h: "..x...x...x...x." }, { k: "x.....x.x.....x.", c: "....x.......x...", p: "x..x..x...x..x..", sh: "x.xxx.xxx.xxx.xx" }, { k: "x...x...x...x...", rm: "...x..x...x..x..", sh: "xxxxxxxxxxxxxxxx", p: "......x.......x." }],
            arp: ["broken", "updown"] },
        reggaeton: { name: "Reggaeton / Dembow", feel: "tresillo", legato: 0.75, repeat: 0.25, leap: 0.12, contour: "wave",
            chords: { major: [[5, 3, 0, 4], [0, 4, 5, 3]], minor: [[0, 5, 2, 6], [0, 3, 6, 5]] },
            bass: [[[0, "R", 3], [3, "R", 3], [6, "R", 2], [8, "R", 3], [11, "R", 3], [14, "5", 2]], [[0, "R", 6], [6, "R", 2], [8, "R", 6], [14, "O", 2]]],
            comp: [[[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], [[3, 3], [11, 3]]],
            drums: [{ k: "x...x...x...x...", s: "...x..x....x..x.", h: "x.x.x.x.x.x.x.x." }, { k: "x...x...x...x...", s: "...x..x....x..x.", sh: "x.x.x.x.x.x.x.x." }, { k: "x..x....x..x....", s: "...x..x....x..x.", h: "x.x.x.x.x.x.x.x.", rm: "x..x..x.x..x..x." }],
            arp: ["up", "broken"] },
        rock: { name: "Rock / Pop-punk", feel: "drive", legato: 0.85, repeat: 0.15, leap: 0.15, contour: "rising", power: true,
            chords: { major: [[0, 3, 4, 3], [0, 4, 5, 3], [0, 5, 3, 4]], minor: [[0, 6, 5, 6], [0, 5, 6, 0], [0, 3, 6, 5]] },
            bass: [[[0, "R", 2], [2, "R", 2], [4, "R", 2], [6, "R", 2], [8, "R", 2], [10, "R", 2], [12, "5", 2], [14, "O", 2]], [[0, "R", 4], [4, "R", 2], [6, "R", 2], [8, "5", 4], [12, "R", 2], [14, "A", 2]]],
            comp: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]], [[0, 6], [6, 2], [8, 8]], [[0, 16]]],
            drums: [{ k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, { k: "x.x.....x.x.....", s: "....x.......x...", rd: "x.x.x.x.x.x.x.x." }, { k: "x...x...x...x...", s: "....x.......x...", h: "xxxxxxxxxxxxxxxx" }],
            arp: ["up", "pinky"], crash: true, toms: true },
        indie: { name: "Indie / Alt", feel: "even", legato: 0.8, repeat: 0.15, leap: 0.18, sevenths: false, ninths: true, contour: "arch",
            chords: { major: [[0, 3, 5, 4], [3, 0, 4, 5], [0, 2, 3, 3]], minor: [[0, 5, 2, 6], [0, 3, 6, 6]] },
            bass: [[[0, "R", 2], [2, "R", 2], [4, "5", 2], [6, "R", 2], [8, "R", 2], [10, "O", 2], [12, "5", 2], [14, "3", 2]], [[0, "R", 6], [6, "R", 2], [8, "5", 6], [14, "A", 2]]],
            comp: [[[0, 2], [3, 2], [6, 2], [8, 2], [11, 2], [14, 2]], [[0, 8], [8, 8]]],
            drums: [{ k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, { k: "x..x....x.......", s: "....x.......x...", sh: "x.x.x.x.x.x.x.x." }, { k: "x...x...x...x...", s: "....x.......x...", h: "..x...x...x...x." }],
            arp: ["broken", "up", "pinky"], crash: true, toms: true },
        synthwave: { name: "Synthwave / 80s", feel: "even", legato: 0.85, repeat: 0.15, leap: 0.12, contour: "arch",
            chords: { major: [[5, 3, 0, 4], [0, 4, 5, 3]], minor: [[0, 5, 6, 4], [0, 5, 2, 6]] },
            bass: [[[0, "R", 2], [2, "R", 2], [4, "R", 2], [6, "O", 2], [8, "R", 2], [10, "R", 2], [12, "R", 2], [14, "O", 2]], [[0, "R", 2], [2, "O", 2], [4, "R", 2], [6, "O", 2], [8, "R", 2], [10, "O", 2], [12, "R", 2], [14, "O", 2]]],
            comp: [[[0, 4], [4, 4], [8, 4], [12, 4]], [[0, 16]]],
            drums: [{ k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." }, { k: "x.......x.x.....", s: "....x.......x...", h: "xxxxxxxxxxxxxxxx" }],
            arp: ["up", "updown", "octaves"], crash: true },
        chiptune: { name: "Chiptune", feel: "busy", legato: 0.5, repeat: 0.15, leap: 0.25, contour: "wave",
            chords: { major: [[0, 3, 4, 0], [0, 5, 3, 4]], minor: [[0, 6, 5, 4], [0, 5, 6, 6]] },
            bass: [[[0, "R", 2], [2, "O", 2], [4, "R", 2], [6, "O", 2], [8, "5", 2], [10, "O", 2], [12, "R", 2], [14, "5", 2]], [[0, "R", 4], [4, "5", 4], [8, "O", 4], [12, "5", 4]]],
            comp: [[[0, 2], [4, 2], [8, 2], [12, 2]], [[0, 1], [2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [14, 1]]],
            drums: [{ k: "x.....x.x.......", s: "....x.......x..x", h: "x.x.x.x.x.x.x.x." }, { k: "x...x...x...x...", s: "....x.......x...", h: "xxxxxxxxxxxxxxxx" }],
            arp: ["up", "octaves", "updown"] },
        hyperpop: { name: "Hyperpop / Digicore", feel: "busy", legato: 0.7, repeat: 0.2, leap: 0.25, contour: "rising", glide: true, stutter: true,
            chords: { major: [[3, 4, 5, 0], [0, 4, 5, 3]], minor: [[0, 6, 5, 4], [5, 6, 0, 0]] },
            bass: [[[0, "R", 6], [6, "R", 4], [10, "O", 6]], [[0, "R", 3], [3, "R", 3], [6, "5", 4], [10, "R", 6]]],
            comp: [[[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], [[0, 16]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]]],
            drums: [{ k: "x.....x...x.....", s: "....x.......x...", h: "x.xxx.xxx.xxx.xx" }, { k: "x..x..x...x.x...", s: "....x.......x.x.", h: "xxxxxxxxxxxxxxxx" }, { k: "x.......x.x...x.", s: "....x.......x...", h: "x.x.r.x.x.x.rrrr" }],
            arp: ["octaves", "up", "random"], rolls: true },
        webcore: { name: "Webcore / Glitch", feel: "chaos", legato: 0.9, repeat: 0.18, leap: 0.22, sevenths: true, ninths: true, contour: "valley", stutter: true,
            chords: { major: [[3, 4, 2, 5], [0, 2, 3, 3]], minor: [[0, 5, 2, 6], [5, 2, 6, 0]] },
            bass: [[[0, "R", 8], [8, "5", 8]], [[0, "R", 4], [6, "R", 2], [8, "O", 4], [14, "A", 2]]],
            comp: [[[0, 16]], [[0, 8], [8, 8]]],
            drums: [{ k: "x.....x...x.....", s: "....x.......x.x.", h: "x.xx.x.xx.x.xx.x" }, { k: "x..x......x.....", s: "....x..x....x...", h: "xxxx.x.xxxxx.x.x", p: "........x......." }],
            arp: ["random", "broken", "octaves"] },
        funk: { name: "Funk / Disco", feel: "funky", legato: 0.45, repeat: 0.18, leap: 0.2, sevenths: true, contour: "wave",
            chords: { major: [[0, 3, 0, 4], [1, 4, 1, 4]], minor: [[0, 3, 0, 4], [0, 3, 0, 3]] },
            bass: [[[0, "R", 2], [3, "O", 1], [4, "R", 1], [6, "R", 1], [8, "5", 2], [11, "O", 1], [12, "R", 1], [14, "7", 2]], [[0, "R", 1], [2, "O", 1], [4, "R", 1], [6, "O", 1], [8, "R", 1], [10, "O", 1], [12, "R", 1], [14, "O", 1]]],
            comp: [[[0, 2], [3, 1], [6, 2], [10, 1], [12, 3]], [[2, 1], [6, 1], [10, 1], [14, 1]]],
            drums: [{ k: "x..x..x...x..x..", s: "....x..o.o..x..o", h: "xxxxxxxxxxxxxxxx", o: "......x........." }, { k: "x...x...x...x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x.", o: "..x...x...x...x." }],
            arp: ["broken", "up"] },
        jazz: { name: "Jazz / Swing", feel: "swing", legato: 0.9, repeat: 0.1, leap: 0.2, sevenths: true, ninths: true, contour: "wave", swing: [0.95, 8], walk: true,
            chords: { major: [[1, 4, 0, 0], [0, 5, 1, 4], [2, 5, 1, 4]], minor: [[1, 4, 0, 0], [0, 3, 1, 4]] },
            bass: [[[0, "R", 4], [4, "5", 4], [8, "R", 4], [12, "A", 4]]],
            comp: [[[0, 3], [6, 2]], [[0, 2], [6, 2], [12, 2]], [[4, 2], [10, 2]]],
            drums: [{ k: "o.......o.......", h: "....x.......x...", rd: "x...x.x.x...x.x." }, { k: "o.......o.......", h: "....x.......x...", rd: "x...x.x.x...x.x.", s: "......o......o.." }],
            arp: ["broken", "updown"] },
        ambient: { name: "Ambient / Cinematic", feel: "floaty", legato: 1, repeat: 0.05, leap: 0.2, ninths: true, contour: "arch",
            chords: { major: [[0, 5, 3, 4], [3, 0, 3, 4]], minor: [[0, 5, 3, 6], [0, 5, 2, 6]] },
            bass: [[[0, "R", 16]], [[0, "R", 8], [8, "5", 8]]],
            comp: [[[0, 16]]],
            drums: [{ k: "x.......x.......", s: "........x.......", h: "x...x...x...x..." }, { k: "x...............", rd: "x.......x.......", p: "......x.......x." }],
            arp: ["up", "updown"] },
    };
    const CARROT_GEN_PARTS = [
        ["lead", "Lead melody"], ["hook", "Hook / riff"], ["counter", "Counter-melody"], ["harmony", "Harmony for a lead"],
        ["bass", "Bass line"], ["arp", "Arpeggio"], ["chords", "Chords"], ["drums", "Drum groove"], ["perc", "Percussion"],
        ["full", "Full beat (drums, bass, chords, lead)"],
    ];
    const CARROT_GEN_FORMS = { "AABA": ["A", "A'", "B", "A'"], "ABAB": ["A", "B", "A'", "B'"], "AAAB": ["A", "A'", "A", "B"], "ABAC": ["A", "B", "A'", "C"], "Free": null };
    // Named progressions (scale degrees, 0 = the key's root chord).
    const CARROT_GEN_PROGRESSIONS = [
        [0, 4, 5, 3], [5, 3, 0, 4], [0, 5, 3, 4], [0, 3, 4, 3], [3, 4, 2, 5], [1, 4, 0, 0], [0, 3, 5, 4],
        [0, 6, 5, 6], [0, 5, 2, 6], [0, 3, 0, 4], [3, 0, 4, 5], [0, 0, 3, 3], [0, 2, 3, 3], [0],
    ];
    const CARROT_GEN_CONTOURS = ["auto", "arch", "rising", "falling", "wave", "valley"];
    const CARROT_GEN_HARMONY = ["Smart (3rds, chord-aware)", "3rd above", "3rd below", "6th below", "5th above", "Octave below"];
    class CarrotIdeaGen {
        // options: song, channel, startBar, bars, part, style, density, complexity,
        //   center (pitch), form, seeds (pitches), learn (bool), seed (int),
        //   progression (null | "detect" | degrees), chordEvery (0 bar, 1 two bars, 2 half bar),
        //   notes (0 scale, 1 pentatonic, 2 chord tones), contour, swing (null = style),
        //   refChannel (lead to follow), harmony (CARROT_GEN_HARMONY index), followKick,
        //   fixedChords (keep the chords of an earlier idea),
        //   keepRhythmOf / keepNotesOf / variationOf (bars of an earlier idea)
        static generate(options) {
            const ctx = CarrotIdeaGen.context(options);
            const o = ctx.o;
            let result;
            if (o.part == "drums")
                result = CarrotIdeaGen.drums(ctx);
            else if (o.part == "perc")
                result = CarrotIdeaGen.percussion(ctx);
            else if (o.part == "bass")
                result = CarrotIdeaGen.bass(ctx);
            else if (o.part == "arp")
                result = CarrotIdeaGen.arp(ctx);
            else if (o.part == "chords")
                result = CarrotIdeaGen.chordPart(ctx);
            else if (o.part == "harmony")
                result = CarrotIdeaGen.harmony(ctx);
            else
                result = CarrotIdeaGen.melody(ctx, o.part == "counter" ? "counter" : o.part == "hook" ? "hook" : "lead");
            if (result.bars.length > 0) {
                const melodic = ["lead", "hook", "counter"].indexOf(o.part) != -1;
                if (o.variationOf && o.variationOf.length > 0 && (melodic || o.part == "drums" || o.part == "perc"))
                    result.bars = CarrotIdeaGen.vary(ctx, o.variationOf, melodic);
                if (melodic && o.keepRhythmOf && o.keepRhythmOf.length > 0)
                    result.bars = CarrotIdeaGen.keepRhythm(ctx, o.keepRhythmOf, result.bars);
                else if (melodic && o.keepNotesOf && o.keepNotesOf.length > 0)
                    result.bars = CarrotIdeaGen.keepNotes(ctx, o.keepNotesOf, result.bars);
                // Keep an unswung copy: variations and locks start from it.
                result.straight = result.bars.map(bar => bar.map(n => Object.assign({}, n, { pitches: n.pitches.slice(), pins: n.pins ? n.pins.map(p => Object.assign({}, p)) : null })));
                if (o.part != "harmony")
                    CarrotIdeaGen.applySwing(ctx, result.bars);
            }
            result.chords = CarrotIdeaGen.chordList(ctx);
            result.part = o.part;
            return result;
        }
        static context(options) {
            const o = Object.assign({ bars: 4, part: "lead", style: "pop", density: 0.5, complexity: 0.4, form: "AABA", seeds: [], learn: false, seed: 1, chordEvery: 0, notes: 0, contour: "auto", harmony: 0 }, options);
            const song = o.song;
            const ctx = {
                o, song,
                rng: CarrotDSP.rng((o.seed * 9301 + 49297) >>> 0),
                style: CARROT_GEN_STYLES[o.style] || CARROT_GEN_STYLES.pop,
                barSteps: song.beatsPerBar * 4,
                stepParts: Config.partsPerBeat / 4,
            };
            ctx.learned = o.learn ? CarrotIdeaGen.learn(song, o.channel) : null;
            ctx.scale = o.scale && o.scale.classes ? o.scale : CarrotIdeaGen.scaleClasses(song, o.seeds.concat(ctx.learned ? ctx.learned.pitches : []));
            const half = Math.max(4, Math.round(song.beatsPerBar / 2) * 4);
            ctx.slotSteps = o.chordEvery == 1 ? ctx.barSteps * 2 : o.chordEvery == 2 && song.beatsPerBar >= 4 ? half : ctx.barSteps;
            ctx.chords = Array.isArray(o.fixedChords) && o.fixedChords.length > 0 ? o.fixedChords.slice() : CarrotIdeaGen.chordsFor(ctx);
            return ctx;
        }
        // ---------------------------------------------------------- analysis
        // Pitch classes (relative to the song key) of the scale in use.
        //   classes: a 7-note scale for chords and degrees (the parent major /
        //            minor scale when the song uses a pentatonic or other scale)
        //   melodic: the song's own scale, for melodies
        static scaleClasses(song, pitches) {
            const flags = Config.scales[song.scale].flags;
            let melodic = [];
            for (let i = 0; i < 12; i++)
                if (flags[i])
                    melodic.push(i);
            const major = [0, 2, 4, 5, 7, 9, 11], minor = [0, 2, 3, 5, 7, 8, 10];
            let classes = melodic;
            if (melodic.length >= 12 || melodic.length < 5) {
                // Chromatic ("expert") scale: guess major or minor from the notes.
                const counts = new Array(12).fill(0);
                for (const p of pitches)
                    counts[((p % 12) + 12) % 12]++;
                const score = (set) => set.reduce((sum, c) => sum + counts[c], 0) + (set == major ? 0.5 : 0);
                classes = score(minor) > score(major) ? minor : major;
                melodic = classes;
            }
            else if (melodic.length != 7) {
                classes = melodic.indexOf(3) != -1 && melodic.indexOf(4) == -1 ? minor : major;
            }
            const isMinor = classes.indexOf(3) != -1 && classes.indexOf(4) == -1;
            return { classes, melodic, isMinor };
        }
        // Statistics from the other pitched channels.
        static learn(song, skipChannel) {
            const result = { pitches: [], intervals: new Map(), onsets: new Array(16).fill(0), seeds: [], center: null, count: 0 };
            let bestAverage = -1;
            for (let c = 0; c < song.pitchChannelCount; c++) {
                if (c == skipChannel)
                    continue;
                const sequence = [];
                for (let bar = 0; bar < song.barCount; bar++) {
                    const pattern = song.getPattern(c, bar);
                    if (!pattern)
                        continue;
                    for (const note of pattern.notes) {
                        const top = note.pitches[note.pitches.length - 1];
                        sequence.push({ time: bar * song.beatsPerBar * Config.partsPerBeat + note.start, pitch: top, start: note.start });
                    }
                }
                if (sequence.length == 0)
                    continue;
                sequence.sort((a, b) => a.time - b.time);
                const average = sequence.reduce((s, n) => s + n.pitch, 0) / sequence.length;
                if (average > bestAverage) {
                    bestAverage = average;
                    result.lead = sequence;
                    result.leadChannel = c;
                }
                for (let i = 0; i < sequence.length; i++) {
                    const n = sequence[i];
                    result.pitches.push(n.pitch);
                    result.onsets[Math.round(n.start / (Config.partsPerBeat / 4)) % 16]++;
                    if (i > 0) {
                        const interval = n.pitch - sequence[i - 1].pitch;
                        if (Math.abs(interval) <= 12)
                            result.intervals.set(interval, (result.intervals.get(interval) || 0) + 1);
                    }
                }
                result.count += sequence.length;
            }
            if (result.lead) {
                const distinct = [];
                for (let i = result.lead.length - 1; i >= 0 && distinct.length < 4; i--) {
                    if (distinct.indexOf(result.lead[i].pitch) == -1)
                        distinct.unshift(result.lead[i].pitch);
                }
                result.seeds = distinct;
                result.center = Math.round(bestAverage);
            }
            return result.count > 0 ? result : null;
        }
        // Chords per slot (a bar, two bars or half a bar): the chosen progression,
        // or detected from the other channels, or the style's progression.
        static chordsFor(ctx) {
            const { o, song, scale, style, rng, barSteps, slotSteps, stepParts } = ctx;
            const S = scale.classes;
            const n = S.length;
            let progression;
            if (Array.isArray(o.progression) && o.progression.length > 0)
                progression = o.progression;
            else {
                const list = scale.isMinor ? style.chords.minor : style.chords.major;
                progression = list[Math.floor(rng() * list.length) % list.length];
            }
            progression = progression.map(d => d % n);
            const slots = Math.max(1, Math.ceil(o.bars * barSteps / slotSteps));
            const detect = o.progression == null || o.progression == "detect";
            const chords = [];
            for (let i = 0; i < slots; i++) {
                let detected = null;
                if (detect) {
                    const from = o.startBar * barSteps + i * slotSteps;
                    const weights = new Array(12).fill(0);
                    let total = 0;
                    for (let step = from; step < from + slotSteps; step += barSteps) {
                        const bar = Math.floor(step / barSteps);
                        if (bar >= song.barCount)
                            break;
                        const lo = (step % barSteps) * stepParts;
                        const hi = Math.min(barSteps, step % barSteps + slotSteps) * stepParts;
                        for (let c = 0; c < song.pitchChannelCount; c++) {
                            if (c == o.channel)
                                continue;
                            const pattern = song.getPattern(c, bar);
                            if (!pattern)
                                continue;
                            for (const note of pattern.notes) {
                                const overlap = Math.min(hi, note.end) - Math.max(lo, note.start);
                                if (overlap <= 0)
                                    continue;
                                note.pitches.forEach((p, k) => {
                                    const w = overlap * (note.start == lo ? 2 : 1) * (k == 0 ? 1.4 : 1);
                                    weights[((p % 12) + 12) % 12] += w;
                                    total += w;
                                });
                            }
                        }
                    }
                    if (total > Config.partsPerBeat * 2) {
                        let best = -1, bestScore = 0;
                        for (let d = 0; d < n; d++) {
                            const tones = [S[d], S[(d + 2) % n], S[(d + 4) % n]];
                            const score = weights[tones[0]] * 1.2 + weights[tones[1]] + weights[tones[2]] * 0.8;
                            if (score > bestScore) {
                                bestScore = score;
                                best = d;
                            }
                        }
                        if (best >= 0)
                            detected = best;
                    }
                }
                chords.push(detected != null ? detected : progression[i % progression.length]);
            }
            return chords;
        }
        static chordAt(ctx, bar, step = 0) {
            const slot = Math.floor((bar * ctx.barSteps + Math.max(0, step)) / ctx.slotSteps);
            return ctx.chords[Math.max(0, Math.min(ctx.chords.length - 1, slot))];
        }
        // Chord tones (pitch classes) for scale degree d.
        static chordClasses(ctx, degree, sevenths = false) {
            const S = ctx.scale.classes;
            const n = S.length;
            const tones = [S[degree % n], S[(degree + 2) % n], S[(degree + 4) % n]];
            if (sevenths)
                tones.push(S[(degree + 6) % n]);
            return tones;
        }
        static chordQuality(ctx, degree) {
            const S = ctx.scale.classes;
            const n = S.length;
            const root = S[degree % n];
            const third = (S[(degree + 2) % n] - root + 12) % 12;
            const fifth = (S[(degree + 4) % n] - root + 12) % 12;
            const seventh = (S[(degree + 6) % n] - root + 12) % 12;
            const kind = third == 4 && fifth == 8 ? "aug" : third == 4 ? "maj" : fifth == 6 ? "dim" : "min";
            return { root, kind, seventh };
        }
        static chordName(ctx, degree, sevenths = false) {
            const q = CarrotIdeaGen.chordQuality(ctx, degree);
            const key = Config.keys[(ctx.song.key + q.root) % 12];
            let suffix = q.kind == "maj" ? "" : q.kind == "min" ? "m" : q.kind == "dim" ? "dim" : "aug";
            if (sevenths) {
                if (q.kind == "maj")
                    suffix = q.seventh == 11 ? "maj7" : "7";
                else if (q.kind == "min")
                    suffix = q.seventh == 10 ? "m7" : "m(maj7)";
                else if (q.kind == "dim")
                    suffix = q.seventh == 10 ? "m7b5" : "dim7";
            }
            return (key ? key.name : "?") + suffix;
        }
        static roman(ctx, degree) {
            const numerals = ["I", "II", "III", "IV", "V", "VI", "VII"];
            const q = CarrotIdeaGen.chordQuality(ctx, degree);
            const base = numerals[degree % 7] || "?";
            return q.kind == "maj" || q.kind == "aug" ? base + (q.kind == "aug" ? "+" : "") : base.toLowerCase() + (q.kind == "dim" ? "°" : "");
        }
        // Text for a progression button / select, in this song's key.
        static progressionLabel(song, degrees) {
            const ctx = { song, scale: CarrotIdeaGen.scaleClasses(song, []) };
            return degrees.map(d => CarrotIdeaGen.roman(ctx, d)).join(" ") + "   (" + degrees.map(d => CarrotIdeaGen.chordName(ctx, d)).join(" ") + ")";
        }
        static chordList(ctx) {
            const list = [];
            const sevenths = !!ctx.style.sevenths || ctx.o.complexity > 0.65;
            for (let i = 0; i < ctx.chords.length; i++) {
                const step = i * ctx.slotSteps;
                if (step >= ctx.o.bars * ctx.barSteps)
                    break;
                list.push({ bar: Math.floor(step / ctx.barSteps), step: step % ctx.barSteps, degree: ctx.chords[i], name: CarrotIdeaGen.chordName(ctx, ctx.chords[i], sevenths), roman: CarrotIdeaGen.roman(ctx, ctx.chords[i]) });
            }
            return list;
        }
        // All pitches in the scale between lo and hi.
        static scalePitches(ctx, lo, hi, classes = ctx.scale.classes) {
            const list = [];
            for (let p = Math.max(0, lo); p <= Math.min(Config.maxPitch, hi); p++) {
                if (classes.indexOf(p % 12) != -1)
                    list.push(p);
            }
            return list;
        }
        static nearestIndex(list, pitch) {
            let best = 0;
            for (let i = 1; i < list.length; i++)
                if (Math.abs(list[i] - pitch) < Math.abs(list[best] - pitch))
                    best = i;
            return best;
        }
        static melodyClasses(ctx) {
            const S = ctx.scale.classes;
            if (ctx.o.notes == 1 && S.length == 7)
                return (ctx.scale.isMinor ? [0, 2, 3, 4, 6] : [0, 1, 2, 4, 5]).map(i => S[i]);
            return ctx.scale.melodic || S;
        }
        // Notes of another channel inside the idea's bars: [bar][{start, end, pitch, size, pins}] in parts.
        static referenceNotes(ctx) {
            const { o, song } = ctx;
            const read = (channel) => {
                const bars = [];
                let count = 0;
                for (let b = 0; b < o.bars; b++) {
                    const pattern = o.startBar + b < song.barCount ? song.getPattern(channel, o.startBar + b) : null;
                    const list = [];
                    if (pattern) {
                        for (const note of pattern.notes) {
                            list.push({ start: note.start, end: note.end, pitch: note.pitches[note.pitches.length - 1], size: note.pins[0] ? note.pins[0].size : Config.noteSizeMax, pins: note.pins.map(p => ({ interval: p.interval, time: p.time, size: p.size })) });
                            count++;
                        }
                    }
                    bars.push(list);
                }
                return count > 0 ? { channel, bars } : null;
            };
            // The chosen channel first, then the song's lead (the highest channel with notes here).
            const tried = new Set();
            const order = [];
            if (o.refChannel != null && o.refChannel < song.pitchChannelCount && o.refChannel != o.channel)
                order.push(o.refChannel);
            if (ctx.learned && ctx.learned.leadChannel != null)
                order.push(ctx.learned.leadChannel);
            for (const channel of order) {
                if (tried.has(channel))
                    continue;
                tried.add(channel);
                const found = read(channel);
                if (found)
                    return found;
            }
            let best = null, bestAverage = -1;
            for (let c = 0; c < song.pitchChannelCount; c++) {
                if (c == o.channel || tried.has(c))
                    continue;
                const found = read(c);
                if (!found)
                    continue;
                let sum = 0, n = 0;
                for (const bar of found.bars)
                    for (const note of bar) {
                        sum += note.pitch;
                        n++;
                    }
                if (sum / n > bestAverage) {
                    bestAverage = sum / n;
                    best = found;
                }
            }
            return best;
        }
        static sounding(list, part) {
            if (!list)
                return null;
            for (const n of list)
                if (n.start <= part && n.end > part)
                    return n;
            return null;
        }
        static pickWeighted(rng, items, weights) {
            let total = 0;
            for (const w of weights)
                total += Math.max(0, w);
            if (!(total > 0))
                return items[Math.floor(rng() * items.length)];
            let r = rng() * total;
            for (let i = 0; i < items.length; i++) {
                r -= Math.max(0, weights[i]);
                if (r <= 0)
                    return items[i];
            }
            return items[items.length - 1];
        }
        // ------------------------------------------------------------ rhythm
        // A one-bar rhythm: [{step, len}] in 16th steps, built from beat cells.
        static rhythm(ctx, opt) {
            const { o, rng, style, barSteps, learned } = ctx;
            const feel = CARROT_GEN_FEELS[style.feel] || CARROT_GEN_FEELS.even;
            const beats = Math.ceil(barSteps / 4);
            const density = opt.density;
            const maxLearned = learned && learned.count > 8 ? Math.max(...learned.onsets) : 0;
            const weightOf = (cell, beat, lastBeat) => {
                let w = feel[cell.tag] != undefined ? feel[cell.tag] : 0.5;
                w *= Math.pow(1.9, (cell.onsets - 1.6) * (density - 0.45) * 2);
                if (cell.tag == "sync" || cell.tag == "dotted" || cell.tag == "tie")
                    w *= 0.6 + o.complexity * 1.2;
                if (cell.tag == "sixteenths")
                    w *= 0.7 + o.complexity * 0.8;
                if (beat == 0 && cell.pat[0] != "x")
                    w *= opt.pickup ? 0.35 : 0.06;
                if (cell.tag == "rest" && (beat == 0 || lastBeat))
                    w *= 0.2;
                if (opt.avoid) {
                    for (let i = 0; i < 4; i++)
                        if (cell.pat[i] == "x" && opt.avoid.has(beat * 4 + i))
                            w *= 0.3;
                    if (cell.onsets > 0 && cell.tag != "hold")
                        w *= 0.9;
                }
                if (maxLearned > 0) {
                    let sim = 0;
                    for (let i = 0; i < 4; i++)
                        if (cell.pat[i] == "x")
                            sim += learned.onsets[(beat * 4 + i) % 16] / maxLearned;
                    w *= 0.6 + 0.8 * sim / Math.max(1, cell.onsets);
                }
                if (lastBeat && opt.phraseEnd)
                    w *= (cell.tag == "long" || cell.tag == "hold" || cell.tag == "short") ? 4 : 0.3;
                return w;
            };
            const cells = [];
            for (let beat = 0; beat < beats; beat++) {
                const lastBeat = beat == beats - 1;
                let cell = null;
                if (!(lastBeat && opt.phraseEnd)) {
                    if (beat >= 2 && rng() < (opt.hook ? 0.55 : 0.3))
                        cell = cells[beat - 2];
                    else if (beat >= 1 && rng() < 0.1)
                        cell = cells[beat - 1];
                }
                if (!cell)
                    cell = CarrotIdeaGen.pickWeighted(rng, CARROT_GEN_CELLS, CARROT_GEN_CELLS.map(c => weightOf(c, beat, lastBeat)));
                cells.push(cell);
            }
            const chars = cells.map(c => c.pat).join("").slice(0, barSteps).split("");
            if (chars[0] == "-")
                chars[0] = "x";
            // Guarantee a minimum number of notes (the seed notes need room).
            let onsets = chars.filter(c => c == "x").length;
            let guard = 0;
            while (onsets < opt.minNotes && guard++ < 64) {
                const s = Math.floor(rng() * barSteps / 2) * 2;
                if (chars[s] != "x") {
                    chars[s] = "x";
                    onsets++;
                }
            }
            const rhythm = [];
            let current = null;
            for (let s = 0; s < barSteps; s++) {
                const c = chars[s];
                if (c == "x") {
                    current = { step: s, len: 1 };
                    rhythm.push(current);
                }
                else if (c == "-" && current)
                    current.len++;
                else
                    current = null;
            }
            for (let i = 0; i < rhythm.length; i++) {
                const r = rhythm[i];
                const next = i + 1 < rhythm.length ? rhythm[i + 1].step : barSteps;
                if (r.step + r.len >= next && r.len >= 2 && style.legato < 0.98)
                    r.len = Math.max(1, Math.round(r.len * (0.4 + 0.6 * style.legato)));
            }
            if (opt.phraseEnd && rhythm.length > 0) {
                const last = rhythm[rhythm.length - 1];
                last.len = Math.max(last.len, Math.min(barSteps - last.step, 4));
            }
            return rhythm;
        }
        // Swing: delays the off-beat 8ths or 16ths (in place).
        static applySwing(ctx, bars) {
            const style = ctx.style;
            const amount = ctx.o.swing != null ? ctx.o.swing : (style.swing ? style.swing[0] : 0);
            if (!(amount > 0.01))
                return;
            const unit = style.swing ? style.swing[1] : 16;
            const beat = Config.partsPerBeat;
            const span = unit == 8 ? beat : beat / 2;
            // amount 1 = triplet swing (the off-beat lands 2/3 of the way through).
            const shift = (span / 6) * amount;
            const warp = (t) => {
                const base = Math.floor(t / span) * span;
                const x = t - base;
                const mid = span / 2;
                const y = x <= mid ? x * (mid + shift) / mid : mid + shift + (x - mid) * (mid - shift) / mid;
                return base + y;
            };
            for (const bar of bars) {
                for (const n of bar) {
                    const s = Math.round(warp(n.start));
                    const e = Math.round(warp(n.end));
                    if (n.pins) {
                        const len = n.end - n.start;
                        const newLen = Math.max(1, e - s);
                        n.pins = n.pins.map(p => ({ interval: p.interval, size: p.size, time: Math.round(p.time * newLen / Math.max(1, len)) }));
                    }
                    n.start = s;
                    n.end = Math.max(s + 1, e);
                }
            }
        }
        // ------------------------------------------------------------ melody
        static contourAt(name, t) {
            switch (name) {
                case "rising": return 0.2 + 0.7 * t;
                case "falling": return 0.85 - 0.65 * t;
                case "wave": return 0.5 + 0.35 * Math.sin(t * Math.PI * 2);
                case "valley": return 0.75 - 0.5 * Math.sin(t * Math.PI);
                default: return 0.3 + 0.55 * Math.sin(t * Math.PI);
            }
        }
        static melody(ctx, mode) {
            const { o, rng, style, barSteps, stepParts } = ctx;
            const counter = mode == "counter", hook = mode == "hook";
            const ref = counter ? CarrotIdeaGen.referenceNotes(ctx) : null;
            let center = o.center != null ? o.center : (ctx.learned && ctx.learned.center != null ? ctx.learned.center : 48);
            if (counter && o.center == null) {
                let sum = 0, count = 0;
                if (ref)
                    for (const bar of ref.bars)
                        for (const n of bar) {
                            sum += n.pitch;
                            count++;
                        }
                center = (count > 0 ? Math.round(sum / count) : center) - 8;
            }
            const span = Math.round((hook ? 6 : 7) + o.complexity * 5);
            const classes = CarrotIdeaGen.melodyClasses(ctx);
            const list = CarrotIdeaGen.scalePitches(ctx, center - span, center + span, classes);
            if (list.length < 5)
                return { bars: [], description: "No room for a melody here." };
            // Seed notes (the user's 4 notes, or the song's last lead notes).
            let seeds = o.seeds.filter(p => p != null);
            if (seeds.length == 0 && ctx.learned && !counter)
                seeds = ctx.learned.seeds.slice();
            if (counter)
                seeds = [];
            const seedIdx = seeds.map(p => CarrotIdeaGen.nearestIndex(list, p + 12 * Math.round((center - p) / 12)));
            const density = counter ? o.density * 0.6 : hook ? Math.min(1, o.density + 0.1) : o.density;
            const contour = o.contour && o.contour != "auto" ? o.contour : (hook ? "wave" : style.contour || "arch");
            const pRepeat = style.repeat + (hook ? 0.12 : 0);
            const pStep = 0.62 - o.complexity * 0.2;
            const pSmall = 0.24 + o.complexity * 0.1;
            const pLeap = style.leap + o.complexity * 0.15;
            const learnedHist = CarrotIdeaGen._learnedMoves(ctx);
            const phraseBars = Math.min(4, o.bars);
            const mid = CarrotIdeaGen.nearestIndex(list, center);
            const sevenths = !!style.sevenths;
            const isChordTone = (pitch, bar, step) => CarrotIdeaGen.chordClasses(ctx, CarrotIdeaGen.chordAt(ctx, bar, step), sevenths).indexOf(pitch % 12) != -1;
            const clampIdx = (i) => Math.max(0, Math.min(list.length - 1, i));
            // Weighted choice of each note's pitch.
            const choose = (rhythm, bar, startIdx, useSeeds, contourShift = 0) => {
                const result = [];
                let idx = clampIdx(startIdx);
                let prevMove = 0, repeats = 0;
                for (let i = 0; i < rhythm.length; i++) {
                    if (useSeeds && i < seedIdx.length) {
                        prevMove = i > 0 ? seedIdx[i] - seedIdx[i - 1] : 0;
                        idx = seedIdx[i];
                        result.push(idx);
                        continue;
                    }
                    const r = rhythm[i];
                    const strong = r.step % 8 == 0 ? 2 : r.step % 4 == 0 ? 1 : 0;
                    const t = (((bar % phraseBars) + r.step / barSteps) / phraseBars);
                    const target = mid + (CarrotIdeaGen.contourAt(contour, t) - 0.5 + contourShift) * list.length * 0.6;
                    const refNote = ref ? CarrotIdeaGen.sounding(ref.bars[bar], r.step * stepParts) : null;
                    const refPrev = ref && i > 0 ? CarrotIdeaGen.sounding(ref.bars[bar], rhythm[i - 1].step * stepParts) : null;
                    const candidates = [], weights = [];
                    for (let j = Math.max(0, idx - 6); j <= Math.min(list.length - 1, idx + 6); j++) {
                        const move = j - idx;
                        const am = Math.abs(move);
                        let w = am == 0 ? pRepeat * (repeats >= 2 ? 0.05 : 1) : am == 1 ? pStep : am == 2 ? pSmall : am <= 4 ? pLeap : pLeap * 0.35;
                        w *= Math.exp(-Math.abs(j - target) * 0.32);
                        const ct = isChordTone(list[j], bar, r.step);
                        if (strong == 2)
                            w *= ct ? 3.5 : 0.25;
                        else if (strong == 1)
                            w *= ct ? 1.8 : 0.6;
                        else if (am >= 3 && !ct)
                            w *= 0.3;
                        if (o.notes == 2)
                            w *= ct ? 1 : 0.02;
                        if (r.len >= 6)
                            w *= ct ? 1.6 : 0.5;
                        if (Math.abs(prevMove) >= 3)
                            w *= (Math.sign(move) == -Math.sign(prevMove) && am >= 1 && am <= 2) ? 3 : 0.4;
                        const semis = Math.abs(list[j] - list[idx]);
                        if (semis == 6 || semis == 10 || semis == 11 || semis > 12)
                            w *= 0.12;
                        if (learnedHist)
                            w *= 0.6 + (learnedHist.get(move) || 0);
                        if (refNote) {
                            const iv = ((refNote.pitch - list[j]) % 12 + 12) % 12;
                            w *= (iv == 3 || iv == 4 || iv == 8 || iv == 9) ? 2.6 : (iv == 0 || iv == 7 || iv == 5) ? 1 : (strong > 0 || r.len >= 4 ? 0.1 : 0.5);
                            if (list[j] >= refNote.pitch - 1)
                                w *= 0.2;
                            if (refPrev && refPrev != refNote) {
                                const leadDir = Math.sign(refNote.pitch - refPrev.pitch);
                                if (leadDir != 0 && Math.sign(move) == -leadDir)
                                    w *= 1.5;
                            }
                        }
                        candidates.push(j);
                        weights.push(w);
                    }
                    const next = CarrotIdeaGen.pickWeighted(rng, candidates, weights);
                    prevMove = next - idx;
                    repeats = prevMove == 0 ? repeats + 1 : 0;
                    idx = next;
                    result.push(idx);
                }
                return result;
            };
            // Shift a motif diatonically to follow the chord change.
            const transpose = (motif, fromBar, toBar) => {
                const n = ctx.scale.classes.length;
                let s = ((CarrotIdeaGen.chordAt(ctx, toBar) - CarrotIdeaGen.chordAt(ctx, fromBar)) % n + n) % n;
                if (s > n / 2)
                    s -= n;
                const factor = classes.length / n;
                return motif.map(i => clampIdx(i + Math.round(s * factor)));
            };
            const cadence = (motif, rhythm, bar, final) => {
                if (motif.length == 0)
                    return;
                const last = rhythm[rhythm.length - 1];
                const chord = CarrotIdeaGen.chordClasses(ctx, CarrotIdeaGen.chordAt(ctx, bar, last.step), false);
                const wanted = final ? (chord.indexOf(0) != -1 ? [0] : [chord[0]]) : chord.filter(c => c != 0);
                let best = motif[motif.length - 1], bestDistance = 1e9;
                for (let j = 0; j < list.length; j++) {
                    if (wanted.indexOf(list[j] % 12) != -1 && Math.abs(j - motif[motif.length - 1]) < bestDistance) {
                        bestDistance = Math.abs(j - motif[motif.length - 1]);
                        best = j;
                    }
                }
                motif[motif.length - 1] = best;
                if (motif.length >= 2 && Math.abs(motif[motif.length - 2] - best) > 2)
                    motif[motif.length - 2] = clampIdx(best + (motif[motif.length - 2] > best ? 1 : -1));
            };
            const form = hook ? ["A", "A", "A", "A'"] : (CARROT_GEN_FORMS[o.form] || null);
            const store = {};
            let lastMotif = null;
            const bars = [];
            const startIdx = seedIdx.length > 0 ? seedIdx[0] : mid;
            for (let b = 0; b < o.bars; b++) {
                const label = form ? form[b % 4] : null;
                const letter = label ? label[0] : null;
                const vary = label != null && label.length > 1;
                const phraseIndex = Math.floor(b / 4);
                const endOfPhrase = (b % 4 == 3) || b == o.bars - 1;
                const final = b == o.bars - 1 || phraseIndex % 2 == 1;
                let avoid = null;
                if (ref) {
                    avoid = new Set();
                    for (const n of ref.bars[b])
                        avoid.add(Math.round(n.start / stepParts));
                }
                let rhythm, motif;
                const source = letter ? store[letter] : null;
                if (source && (hook || rng() > o.complexity * 0.2)) {
                    rhythm = source.rhythm.map(r => Object.assign({}, r));
                    motif = transpose(source.notes, source.bar, b);
                    if (vary && rhythm.length >= 3) {
                        const keep = Math.max(1, Math.ceil(rhythm.length * 0.6));
                        const tail = choose(rhythm.slice(keep), b, motif[keep - 1], false);
                        motif = motif.slice(0, keep).concat(tail);
                    }
                }
                else {
                    const useSeeds = b == 0 && seeds.length > 0;
                    rhythm = CarrotIdeaGen.rhythm(ctx, { density, minNotes: useSeeds ? Math.max(3, seeds.length) : 3, avoid, phraseEnd: endOfPhrase && !hook, hook, pickup: counter || rng() < 0.25 });
                    let from = startIdx;
                    if (lastMotif && lastMotif.length > 0)
                        from = clampIdx(lastMotif[lastMotif.length - 1] + (letter == "B" ? 2 : letter == "C" ? -2 : 0));
                    motif = choose(rhythm, b, from, useSeeds, letter == "B" ? 0.12 : letter == "C" ? -0.1 : 0);
                    if (letter && !store[letter])
                        store[letter] = { notes: motif.slice(), bar: b, rhythm: rhythm.map(r => Object.assign({}, r)) };
                }
                lastMotif = motif;
                if (endOfPhrase && (!hook || b == o.bars - 1)) {
                    cadence(motif, rhythm, b, final);
                    const last = rhythm[rhythm.length - 1];
                    last.len = Math.max(last.len, Math.min(barSteps - last.step, 6));
                }
                const notes = [];
                for (let i = 0; i < rhythm.length && i < motif.length; i++) {
                    const r = rhythm[i];
                    const accent = r.step % 4 == 0 ? Config.noteSizeMax : (style.feel == "funky" && r.step % 2 == 1 ? 1 : 2);
                    notes.push({ start: r.step * stepParts, end: Math.min(barSteps, r.step + r.len) * stepParts, pitches: [list[clampIdx(motif[i])]], size: accent });
                }
                bars.push(notes);
            }
            const what = counter ? "Counter-melody" : hook ? "Hook" : "Melody";
            const note = counter && !ref ? " (no lead found to answer, so it follows the chords)" : "";
            return { bars, description: what + " in " + (ctx.scale.isMinor ? "minor" : "major") + ", " + style.name + (form && !hook ? ", form " + o.form : "") + note };
        }
        static _learnedMoves(ctx) {
            if (!ctx.learned || ctx.learned.intervals.size == 0)
                return null;
            // Semitone intervals as approximate scale steps, normalized 0..1.
            const map = new Map();
            let max = 0;
            for (const [interval, count] of ctx.learned.intervals) {
                const steps = Math.round(interval / 1.75);
                const v = (map.get(steps) || 0) + count;
                map.set(steps, v);
                max = Math.max(max, v);
            }
            if (max == 0)
                return null;
            for (const [k, v] of map)
                map.set(k, v / max);
            return map;
        }
        // ----------------------------------------------------------- harmony
        static harmony(ctx) {
            const { o, style } = ctx;
            const ref = CarrotIdeaGen.referenceNotes(ctx);
            if (!ref)
                return { bars: [], description: "No melody in bars " + (o.startBar + 1) + "-" + (o.startBar + o.bars) + " to harmonize. Select the channel with your melody, set Bar to where it starts and try again." };
            const classes = ctx.scale.classes;
            const list = CarrotIdeaGen.scalePitches(ctx, 0, Config.maxPitch);
            const mode = o.harmony | 0;
            const offsets = [null, 2, -2, -5, 4, null][mode];
            const bars = ref.bars.map((notes, b) => notes.map(n => {
                const idx = CarrotIdeaGen.nearestIndex(list, n.pitch);
                const chromatic = n.pitch - list[idx];
                let pitch;
                if (mode == 5)
                    pitch = n.pitch - 12;
                else if (offsets != null)
                    pitch = list[Math.max(0, Math.min(list.length - 1, idx + offsets))] + chromatic;
                else {
                    // Smart: a 3rd above, or the next chord tone above when the 3rd clashes.
                    const step = Math.round(n.start / ctx.stepParts);
                    const chord = CarrotIdeaGen.chordClasses(ctx, CarrotIdeaGen.chordAt(ctx, b, step), !!style.sevenths);
                    pitch = list[Math.min(list.length - 1, idx + 2)] + chromatic;
                    const strong = step % 4 == 0 || n.end - n.start >= Config.partsPerBeat;
                    if (strong && chord.indexOf(((pitch % 12) + 12) % 12) == -1) {
                        for (const k of [3, 4, 1]) {
                            const alt = list[Math.min(list.length - 1, idx + k)];
                            if (chord.indexOf(alt % 12) != -1) {
                                pitch = alt;
                                break;
                            }
                        }
                    }
                }
                return { start: n.start, end: n.end, pitches: [Math.max(0, Math.min(Config.maxPitch, pitch))], size: Math.max(1, n.size - 1), pins: n.pins && n.pins.length > 2 ? n.pins : null };
            }));
            void classes;
            return { bars, description: "Harmony (" + CARROT_GEN_HARMONY[mode] + ") for channel " + (ref.channel + 1) };
        }
        // -------------------------------------------------------------- bass
        static kickOnsets(ctx) {
            const { o, song, stepParts } = ctx;
            const bars = [];
            let found = 0;
            for (let b = 0; b < o.bars; b++) {
                const set = new Set();
                for (let c = song.pitchChannelCount; c < song.getChannelCount(); c++) {
                    if (o.startBar + b >= song.barCount)
                        continue;
                    const pattern = song.getPattern(c, o.startBar + b);
                    if (!pattern)
                        continue;
                    const roles = CarrotIdeaGen.kitRoles(song, c);
                    for (const note of pattern.notes) {
                        if (note.pitches.some(p => roles.kick.indexOf(p) != -1)) {
                            set.add(Math.round(note.start / stepParts));
                            found++;
                        }
                    }
                }
                bars.push(Array.from(set).sort((a, b2) => a - b2));
            }
            return found > 0 ? bars : null;
        }
        static bass(ctx) {
            const { o, rng, style, barSteps, stepParts } = ctx;
            const center = o.center != null ? Math.min(o.center, 40) : (style.glide ? 26 : 28);
            const kicks = o.followKick ? CarrotIdeaGen.kickOnsets(ctx) : null;
            const base = style.bass[Math.floor(rng() * style.bass.length) % style.bass.length];
            const rootPitchFor = (degree) => {
                const root = CarrotIdeaGen.chordClasses(ctx, degree)[0];
                let p = root + 12 * Math.floor((center - root) / 12);
                if (p < center - 6)
                    p += 12;
                return p;
            };
            const toneFor = (kind, bar, step, nextBar, nextStep) => {
                const degree = CarrotIdeaGen.chordAt(ctx, bar, step);
                const chord = CarrotIdeaGen.chordClasses(ctx, degree, true);
                const rootPitch = rootPitchFor(degree);
                const rel = (c) => (c - chord[0] + 12) % 12;
                switch (kind) {
                    case "5": return rootPitch + rel(chord[2]);
                    case "O": return rootPitch + 12;
                    case "3": return rootPitch + rel(chord[1]);
                    case "7": return rootPitch + rel(chord[3]);
                    case "A": {
                        const nextDegree = CarrotIdeaGen.chordAt(ctx, nextBar, nextStep);
                        const target = rootPitchFor(nextDegree);
                        if (nextDegree == degree)
                            return rootPitch + rel(chord[2]) - 12 * (rootPitch + rel(chord[2]) > center + 7 ? 1 : 0);
                        const below = target - 1, above = target + 1;
                        const inScale = (p) => ctx.scale.classes.indexOf(((p % 12) + 12) % 12) != -1;
                        if (o.complexity > 0.55)
                            return rng() < 0.5 ? below : above;
                        return inScale(below) ? below : inScale(target - 2) ? target - 2 : above;
                    }
                    default: return rootPitch;
                }
            };
            const bars = [];
            for (let b = 0; b < o.bars; b++) {
                let pattern = [];
                if (style.walk) {
                    for (let s = 0; s < barSteps; s += 4) {
                        const lastBeat = s + 4 >= barSteps || CarrotIdeaGen.chordAt(ctx, b, s + 4) != CarrotIdeaGen.chordAt(ctx, b, s);
                        const kind = s == 0 ? "R" : lastBeat ? "A" : ["5", "3", "O", "5"][Math.floor(rng() * 4)];
                        pattern.push([s, kind, 4]);
                    }
                }
                else if (kicks && kicks[b] && kicks[b].length > 0) {
                    const k = kicks[b];
                    for (let i = 0; i < k.length; i++) {
                        const next = i + 1 < k.length ? k[i + 1] : barSteps;
                        const kind = i == 0 ? "R" : (o.complexity > 0.5 && k[i] % 4 != 0 && rng() < 0.4 ? "O" : i == k.length - 1 && rng() < o.complexity ? "A" : "R");
                        pattern.push([k[i], kind, Math.max(1, Math.round((next - k[i]) * Math.min(1, style.legato + 0.1)))]);
                    }
                }
                else {
                    for (let offset = 0; offset < barSteps; offset += 16)
                        for (const [step, kind, len] of base)
                            if (offset + step < barSteps)
                                pattern.push([offset + step, kind, len]);
                    if (o.density > 0.7 && !style.glide)
                        pattern.push([barSteps - 1, "O", 1]);
                    if (o.density < 0.3)
                        pattern = pattern.filter(([step], i) => i == 0 || step % 4 == 0);
                }
                pattern.sort((a, c) => a[0] - c[0]);
                pattern = pattern.filter((entry, i) => i == 0 || entry[0] != pattern[i - 1][0]);
                const notes = [];
                for (let i = 0; i < pattern.length; i++) {
                    const [step, kind, len] = pattern[i];
                    const next = i + 1 < pattern.length ? pattern[i + 1][0] : barSteps;
                    const nextBar = next >= barSteps ? Math.min(o.bars - 1, b + 1) : b;
                    let k = kind;
                    if (i == pattern.length - 1 && b + 1 < o.bars && kind == "R" && rng() < o.complexity * 0.6 && CarrotIdeaGen.chordAt(ctx, b + 1, 0) != CarrotIdeaGen.chordAt(ctx, b, step))
                        k = "A";
                    const pitch = toneFor(k, b, step, nextBar, next % barSteps);
                    const end = Math.min(barSteps, step + len, next);
                    notes.push({ start: step * stepParts, end: end * stepParts, pitches: [Math.max(0, pitch)], size: step % 4 == 0 ? 3 : 2 });
                }
                // 808 glides into the next note.
                if (style.glide && o.complexity > 0.25) {
                    for (let i = 0; i + 1 < notes.length; i++) {
                        const a = notes[i], c = notes[i + 1];
                        const diff = c.pitches[0] - a.pitches[0];
                        const len = a.end - a.start;
                        if (diff != 0 && Math.abs(diff) <= 12 && c.start - a.end <= stepParts * 2 && len >= stepParts * 2 && rng() < 0.3 + o.complexity * 0.45) {
                            // Slide into the next note (the 808 note is held up to it).
                            a.end = c.start;
                            const full = a.end - a.start;
                            const g = Math.min(full - 1, stepParts * 2);
                            a.pins = [{ interval: 0, time: 0, size: a.size }, { interval: 0, time: full - g, size: a.size }, { interval: diff, time: full, size: a.size }];
                        }
                    }
                }
                bars.push(notes);
            }
            const how = style.walk ? "walking " : kicks ? "following the kick, " : "";
            return { bars, description: "Bass line, " + how + style.name };
        }
        // --------------------------------------------------------------- arp
        static arp(ctx) {
            const { o, rng, style, barSteps, stepParts } = ctx;
            const center = o.center != null ? o.center : 52;
            const triplets = o.density > 0.85;
            const rate = triplets ? Config.partsPerBeat / 6 : o.density > 0.45 ? stepParts : stepParts * 2;
            const modes = (style.arp || ["up"]).concat(o.complexity > 0.5 ? ["converge", "random"] : []);
            const mode = modes[Math.floor(rng() * modes.length) % modes.length];
            const octaves = o.complexity > 0.6 ? 2 : 1;
            const gate = Math.max(0.35, Math.min(1, style.legato));
            const bars = [];
            const barParts = barSteps * stepParts;
            for (let b = 0; b < o.bars; b++) {
                const notes = [];
                let i = 0;
                for (let t = 0; t + rate <= barParts; t += rate, i++) {
                    const step = Math.floor(t / stepParts);
                    const chord = CarrotIdeaGen.chordClasses(ctx, CarrotIdeaGen.chordAt(ctx, b, step), style.sevenths || o.complexity > 0.7);
                    const tones = [];
                    for (let oct = 0; oct < octaves; oct++)
                        for (const c of chord) {
                            let p = c + 12 * Math.floor((center - c) / 12);
                            if (p < center - 2)
                                p += 12;
                            tones.push(p + 12 * oct);
                        }
                    tones.sort((a, c) => a - c);
                    tones.push(tones[0] + 12 * octaves);
                    let order;
                    switch (mode) {
                        case "down":
                            order = tones.slice().reverse();
                            break;
                        case "updown":
                            order = tones.concat(tones.slice(1, -1).reverse());
                            break;
                        case "pinky":
                            order = [].concat(...tones.slice(0, -1).map(x => [x, tones[tones.length - 1]]));
                            break;
                        case "broken":
                            order = [];
                            for (let k = 0; k + 1 < tones.length; k++)
                                order.push(tones[k], tones[Math.min(tones.length - 1, k + 2)]);
                            break;
                        case "converge":
                            order = [];
                            for (let lo = 0, hi = tones.length - 1; lo <= hi; lo++, hi--) {
                                order.push(tones[lo]);
                                if (hi != lo)
                                    order.push(tones[hi]);
                            }
                            break;
                        case "octaves":
                            order = [tones[0], tones[0] + 12, tones[1], tones[1] + 12];
                            break;
                        default:
                            order = tones;
                    }
                    const pitch = mode == "random" ? tones[Math.floor(rng() * tones.length)] : order[i % order.length];
                    const accent = triplets ? (i % 3 == 0) : (style.feel == "offbeat" || style.feel == "tresillo") ? [0, 3, 6, 8, 11, 14].indexOf(step % 16) != -1 && t % stepParts == 0 : step % 4 == 0 && t % stepParts == 0;
                    notes.push({ start: t, end: t + Math.max(1, Math.round(rate * gate)), pitches: [pitch], size: accent ? 3 : 2 });
                }
                bars.push(notes);
            }
            return { bars, description: "Arpeggio (" + mode + (triplets ? ", triplets" : "") + "), " + style.name };
        }
        // ------------------------------------------------------------ chords
        static chordPart(ctx) {
            const { o, rng, style, barSteps, stepParts } = ctx;
            const center = o.center != null ? o.center : 50;
            const comp = style.comp[Math.floor(rng() * style.comp.length) % style.comp.length];
            const sevenths = !!style.sevenths || o.complexity > 0.65;
            const ninths = !!style.ninths && o.complexity > 0.45;
            const voicingFor = (degree, previous) => {
                const S = ctx.scale.classes;
                const n = S.length;
                if (style.power && o.complexity < 0.7) {
                    const root = S[degree % n];
                    let p = root + 12 * Math.floor((center - 9 - root) / 12);
                    if (p < center - 15)
                        p += 12;
                    return [p, p + ((S[(degree + 4) % n] - root + 12) % 12), p + 12];
                }
                let chord = CarrotIdeaGen.chordClasses(ctx, degree, sevenths);
                if (ninths)
                    chord = [chord[0], chord[1], sevenths ? chord[3] : chord[2], S[(degree + 1) % n]];
                let best = null, bestCost = 1e9;
                for (let inversion = 0; inversion < chord.length; inversion++) {
                    // Keep the added 9th off the bottom of the chord.
                    if (ninths && inversion == 3)
                        continue;
                    const voicing = [];
                    let last = -1;
                    for (let k = 0; k < chord.length; k++) {
                        const c = chord[(k + inversion) % chord.length];
                        let p = c + 12 * Math.floor((center - 6 - c) / 12);
                        while (p <= last)
                            p += 12;
                        voicing.push(p);
                        last = p;
                    }
                    const cost = previous ? voicing.reduce((s, p, k) => s + Math.abs(p - (previous[k] != undefined ? previous[k] : p)), 0) : Math.abs(voicing[0] - (center - 6));
                    if (cost < bestCost) {
                        bestCost = cost;
                        best = voicing;
                    }
                }
                return best;
            };
            const bars = [];
            let previous = null;
            for (let b = 0; b < o.bars; b++) {
                let hits = [];
                for (let offset = 0; offset < barSteps; offset += 16)
                    for (const [step, len] of comp)
                        if (offset + step < barSteps)
                            hits.push([offset + step, len]);
                if (o.density < 0.3)
                    hits = hits.filter(([step]) => step % 8 == 0 || step == hits[0][0]);
                if (o.density > 0.75 && comp.length <= 2)
                    hits.push([barSteps - 2, 2]);
                // A chord change inside a hit starts a new hit there.
                for (let s = ctx.slotSteps - (b * barSteps) % ctx.slotSteps; s < barSteps; s += ctx.slotSteps) {
                    if (s <= 0)
                        continue;
                    const covered = hits.some(([step, len]) => step < s && step + len > s);
                    const starts = hits.some(([step]) => step == s);
                    if (covered && !starts)
                        hits.push([s, barSteps - s]);
                }
                hits.sort((a, c) => a[0] - c[0]);
                const notes = [];
                for (let i = 0; i < hits.length; i++) {
                    const [step, len] = hits[i];
                    const next = i + 1 < hits.length ? hits[i + 1][0] : barSteps;
                    const voicing = voicingFor(CarrotIdeaGen.chordAt(ctx, b, step), previous);
                    previous = voicing;
                    notes.push({ start: step * stepParts, end: Math.min(barSteps, step + len, next) * stepParts, pitches: voicing.slice(0, Config.maxChordSize), size: step == 0 ? 3 : 2 });
                }
                bars.push(notes);
            }
            const names = CarrotIdeaGen.chordList(ctx).map(c => c.name);
            return { bars, description: "Chords (" + names.slice(0, 8).join(" ") + (names.length > 8 ? " ..." : "") + "), " + style.name };
        }
        // ------------------------------------------------------------- drums
        // Which rows of a drum channel play which sound. Uses the FPC pad names
        // when there are any, otherwise the CarrotBox kit order (or pitch order
        // for BeepBox's own noise drums).
        static kitRoles(song, channel) {
            const roles = { kick: [], snare: [], clap: [], hat: [], open: [], perc: [], crash: [], ride: [], tom: [], shaker: [], rim: [] };
            const channelData = song.channels[channel];
            const instrument = channelData && channelData.instruments[0];
            const pads = instrument && instrument.type == FLConfig.typeFPC && instrument.fl && instrument.fl.fpc ? instrument.fl.fpc.pads : null;
            if (pads && pads.some(p => p.sampleId)) {
                const tests = [
                    ["open", /open/], ["kick", /kick|\bbd\b|bassdrum/], ["clap", /clap/], ["snare", /snare|\bsd\b/], ["rim", /rim|snap|clave|stick/],
                    ["hat", /hat|\bhh\b/], ["crash", /crash|splash|china|cymbal/], ["ride", /ride/], ["tom", /tom/],
                    ["shaker", /shaker|tamb|maraca|cabasa/], ["perc", /perc|cowbell|bongo|conga|wood|block|tabla|djembe|agogo|bell|blip|triangle|guiro|timbale/],
                ];
                pads.forEach((pad, i) => {
                    if (!pad.sampleId)
                        return;
                    const text = (pad.sampleId + " " + (pad.name || "")).toLowerCase();
                    if (/808-bass|808s\/|\b808\b(?!.*(kick|snare|clap|hat|tom|cowbell|rim|clave|cymbal))/.test(text) && !/kick/.test(text))
                        return;
                    for (const [role, re] of tests)
                        if (re.test(text)) {
                            roles[role].push(i);
                            return;
                        }
                });
            }
            else if (instrument && (instrument.type == 2 || instrument.type == 3 || instrument.type == 4) && (!instrument.fl || instrument.type != FLConfig.typeFPC)) {
                // BeepBox noise / spectrum / drumset: low rows are low sounds.
                Object.assign(roles, { kick: [0], snare: [5], clap: [6], hat: [11], open: [9], perc: [3, 7, 8], crash: [10], ride: [], tom: [2, 4], shaker: [8], rim: [7] });
            }
            if (roles.kick.length == 0 && roles.snare.length == 0 && roles.hat.length == 0)
                Object.assign(roles, { kick: [0], snare: [1], clap: [2], hat: [3], open: [4], perc: [5, 6, 7, 8, 9], crash: [10], ride: [], tom: [5, 6, 7], shaker: [8], rim: [9] });
            // Fill in missing roles with close relatives.
            const fallback = { clap: "snare", snare: "clap", open: "hat", ride: "hat", rim: "perc", shaker: "hat", perc: "rim", tom: "perc" };
            for (const role in fallback)
                if (roles[role].length == 0 && roles[fallback[role]].length > 0)
                    roles[role] = [roles[fallback[role]][0]];
            return roles;
        }
        static drums(ctx) {
            const { o, rng, style, barSteps, stepParts } = ctx;
            const roles = CarrotIdeaGen.kitRoles(ctx.song, o.channel != null ? o.channel : ctx.song.pitchChannelCount);
            const row = (role, i = 0) => roles[role].length > 0 ? roles[role][i % roles[role].length] : null;
            const grooves = style.drums;
            const grooveA = grooves[Math.floor(rng() * grooves.length) % grooves.length];
            const grooveB = grooves.length > 1 ? grooves[(grooves.indexOf(grooveA) + 1 + Math.floor(rng() * (grooves.length - 1))) % grooves.length] : grooveA;
            const at = (str, s) => str && str.length > 0 ? str[s % str.length] : ".";
            const bars = [];
            for (let b = 0; b < o.bars; b++) {
                const notes = [];
                const seen = new Set();
                const add = (role, part, len, size = 3, index = 0) => {
                    const r = row(role, index);
                    if (r == null || part < 0 || part >= barSteps * stepParts)
                        return;
                    const key = r + ":" + part;
                    if (seen.has(key))
                        return;
                    seen.add(key);
                    notes.push({ start: part, end: Math.min(barSteps * stepParts, part + Math.max(1, len)), pitches: [r], size: Math.max(1, Math.min(3, size)) });
                };
                const phraseEnd = b % 4 == 3 || b == o.bars - 1;
                const bigFill = b == o.bars - 1 && o.bars > 1 && o.complexity > 0.3;
                const fillSteps = bigFill ? 4 + Math.round(o.complexity * 4) : phraseEnd && o.complexity > 0.45 ? 2 : 0;
                let g = (b % 4 == 3 && o.complexity >= 0.35) || (style.chaos && rng() < 0.3 + o.complexity * 0.4) ? grooveB : grooveA;
                for (let s = 0; s < barSteps; s++) {
                    if (s >= barSteps - fillSteps)
                        break;
                    let gs = g;
                    // Breakcore: chop and swap beats between grooves.
                    if (style.chaos && s % 4 == 0 && rng() < 0.25 + o.complexity * 0.4)
                        gs = grooves[Math.floor(rng() * grooves.length)];
                    const i = s % 16;
                    const part = s * stepParts;
                    const kick = at(gs.k, i);
                    if (kick == "x" || kick == "X")
                        add("kick", part, stepParts * 2, 3);
                    else if (kick == "o")
                        add("kick", part, stepParts, 1);
                    else if (o.complexity > 0.5 && i % 2 == 1 && rng() < o.complexity * 0.1)
                        add("kick", part, stepParts, 2);
                    for (const [key, role] of [["s", "snare"], ["c", "clap"]]) {
                        const v = at(gs[key], i);
                        if (v == "x" || v == "X")
                            add(role, part, stepParts * 2, 3);
                        else if (v == "o" && rng() < 0.55 + o.complexity * 0.4)
                            add("snare", part, stepParts, 1);
                    }
                    if (o.complexity > 0.55 && at(gs.s, i) == "." && at(gs.c, i) == "." && i % 2 == 1 && rng() < (o.complexity - 0.5) * 0.25 && (style.feel == "funky" || style.feel == "laid" || style.feel == "smooth" || style.chaos))
                        add("snare", part, stepParts, 1);
                    const hat = at(gs.h, i);
                    if (hat == "x" || hat == "X") {
                        if (i % 2 == 0 || rng() < 0.45 + o.density * 0.6)
                            add("hat", part, stepParts, i % 4 == 0 ? 3 : i % 2 == 0 ? 2 : 1);
                    }
                    else if (hat == "r" && style.rolls) {
                        // Hat roll over two 16ths: 16th triplets, 32nds, or 32nd triplets when busy.
                        const step = o.density > 0.8 && rng() < 0.4 ? 2 : rng() < 0.5 ? 4 : 3;
                        let k = 0;
                        for (let t = 0; t + step <= stepParts * 2; t += step, k++)
                            add("hat", part + t, step, k == 0 ? 3 : 1 + (k % 2));
                    }
                    else if (hat == "." && i % 2 == 1 && at(gs.h, i - 1) != "." && o.density > 0.6 && rng() < (o.density - 0.55) * (style.rolls ? 1.4 : 0.8))
                        add("hat", part, stepParts, 1);
                    else if (o.density > 0.8 && !gs.h && gs.sh == undefined && i % 2 == 0 && grooves.indexOf(gs) >= 0 && rng() < 0.3)
                        add("hat", part, stepParts, 1);
                    const v = (key) => at(gs[key], i);
                    if (v("o") == "x")
                        add("open", part, stepParts * 2, 2);
                    if (v("rd") == "x")
                        add("ride", part, stepParts * 2, i % 4 == 0 ? 3 : 2);
                    if (v("p") == "x")
                        add("perc", part, stepParts, 2, Math.floor(rng() * 3));
                    if (v("rm") == "x")
                        add("rim", part, stepParts, 2);
                    if (v("sh") == "x" && o.density > 0.25)
                        add("shaker", part, stepParts, i % 4 == 0 ? 2 : 1);
                }
                // Crash at the start of a section (after a fill).
                if ((style.crash || o.complexity > 0.55) && b > 0 && b % 4 == 0 && roles.crash.length > 0)
                    add("crash", 0, stepParts * 4, 3);
                // Hyperpop / webcore stutters.
                if (style.stutter && phraseEnd && rng() < 0.4 + o.complexity * 0.5) {
                    const from = (barSteps - 4) * stepParts;
                    const step = rng() < 0.5 ? stepParts / 2 : stepParts;
                    for (let t = from, k = 0; t < barSteps * stepParts; t += step, k++)
                        add(k % 2 == 0 ? "snare" : "kick", t, step, 1 + Math.min(2, Math.floor(k / 3)));
                }
                // Fills.
                if (fillSteps > 0) {
                    const from = barSteps - fillSteps;
                    const useToms = (style.toms || o.complexity > 0.6) && roles.tom.length > 0;
                    const roll = style.chaos || style.rolls;
                    for (let s = from; s < barSteps; s++) {
                        const k = s - from;
                        if (useToms && k >= fillSteps / 2)
                            add("tom", s * stepParts, stepParts, 2 + (k % 2 == 0 ? 1 : 0), Math.max(0, roles.tom.length - 1 - Math.floor((k - fillSteps / 2) / Math.max(1, fillSteps / 2 / roles.tom.length))));
                        else if (roll && rng() < 0.6) {
                            add("snare", s * stepParts, stepParts / 2, 1 + Math.min(2, Math.floor(k / 2)));
                            add("snare", s * stepParts + stepParts / 2, stepParts / 2, 1 + Math.min(2, Math.floor(k / 2)));
                        }
                        else
                            add("snare", s * stepParts, stepParts, 1 + Math.min(2, Math.floor(k * 3 / fillSteps)));
                        if (k == 0 || (s % 4 == 0))
                            add("kick", s * stepParts, stepParts, 3);
                    }
                }
                notes.sort((a, c) => a.start - c.start);
                bars.push(notes);
            }
            const names = Object.keys(roles).filter(r => roles[r].length > 0 && ["kick", "snare", "hat"].indexOf(r) != -1).map(r => r + " " + (roles[r][0] + 1));
            return { bars, description: "Drum groove, " + style.name + " (rows: " + names.join(", ") + ")" };
        }
        // Euclidean rhythm: k hits spread over n steps.
        static euclid(k, n, rotate = 0) {
            const out = [];
            for (let i = 0; i < n; i++)
                out.push(((i + rotate) * k) % n < k ? 1 : 0);
            return out;
        }
        static percussion(ctx) {
            const { o, rng, style, barSteps, stepParts } = ctx;
            const roles = CarrotIdeaGen.kitRoles(ctx.song, o.channel != null ? o.channel : ctx.song.pitchChannelCount);
            const latin = ["afro", "reggaeton", "house", "funk"].indexOf(o.style) != -1;
            const claves = { son: "x..x..x...x.x...", rumba: "x..x...x..x.x...", bossa: "x..x..x...x..x..", tresillo: "x..x..x.x..x..x." };
            const claveName = latin ? ["son", "rumba", "bossa", "tresillo"][Math.floor(rng() * 4)] : null;
            const k1 = 3 + Math.round(o.density * 4), k2 = 2 + Math.round(o.complexity * 5);
            const e1 = CarrotIdeaGen.euclid(k1, 16, Math.floor(rng() * 4));
            const e2 = CarrotIdeaGen.euclid(k2, 16, 2 + Math.floor(rng() * 6));
            const shakerEvery = o.density > 0.55 ? 1 : 2;
            const bars = [];
            for (let b = 0; b < o.bars; b++) {
                const notes = [];
                const add = (role, step, len, size, index = 0) => {
                    const list = roles[role];
                    if (!list || list.length == 0)
                        return;
                    notes.push({ start: step * stepParts, end: Math.min(barSteps, step + len) * stepParts, pitches: [list[index % list.length]], size });
                };
                for (let s = 0; s < barSteps; s++) {
                    const i = s % 16;
                    if (s % shakerEvery == 0)
                        add("shaker", s, 1, i % 4 == 0 ? 3 : i % 2 == 0 ? 2 : 1);
                    if (claveName && claves[claveName][i] == "x")
                        add("rim", s, 1, 3);
                    else if (!claveName && e1[i])
                        add("rim", s, 1, i % 4 == 0 ? 3 : 2);
                    if (e2[i] && (s % 4 != 0 || o.complexity > 0.5))
                        add("perc", s, 2, 2, (Math.floor(s / 3) + b) % 3);
                }
                if (o.complexity > 0.5 && (b % 4 == 3 || b == o.bars - 1))
                    for (let s = barSteps - 4; s < barSteps; s++)
                        add("perc", s, 1, 2, s % 3);
                bars.push(notes);
            }
            return { bars, description: "Percussion, " + style.name + (claveName ? " (" + claveName + " clave)" : " (euclidean " + k1 + " and " + k2 + " of 16)") };
        }
        // -------------------------------------------------------- variations
        // A close variation of an earlier idea: most notes stay, a few move.
        static vary(ctx, previous, melodic) {
            const { o, rng, barSteps, stepParts } = ctx;
            const amount = 0.16 + o.complexity * 0.24;
            const bars = previous.map(bar => bar.map(n => ({ start: n.start, end: n.end, pitches: n.pitches.slice(), size: n.size, pins: n.pins ? n.pins.map(p => Object.assign({}, p)) : null })));
            if (melodic) {
                let lo = 1e9, hi = -1e9;
                for (const bar of bars)
                    for (const n of bar) {
                        lo = Math.min(lo, n.pitches[0]);
                        hi = Math.max(hi, n.pitches[0]);
                    }
                const list = CarrotIdeaGen.scalePitches(ctx, lo - 5, hi + 5, CarrotIdeaGen.melodyClasses(ctx));
                bars.forEach((bar, b) => {
                    const out = [];
                    for (let i = 0; i < bar.length; i++) {
                        const n = bar[i];
                        const lastOfPhrase = i == bar.length - 1 && (b % 4 == 3 || b == bars.length - 1);
                        if ((b == 0 && i == 0) || lastOfPhrase || rng() > amount) {
                            out.push(n);
                            continue;
                        }
                        const step = Math.round(n.start / stepParts);
                        const len = n.end - n.start;
                        const chord = CarrotIdeaGen.chordClasses(ctx, CarrotIdeaGen.chordAt(ctx, b, step), !!ctx.style.sevenths);
                        const r = rng();
                        const idx = CarrotIdeaGen.nearestIndex(list, n.pitches[0]);
                        if (r < 0.5) {
                            // Neighbour note (a chord tone on strong beats).
                            const options = [idx - 1, idx + 1, idx - 2, idx + 2].filter(j => j >= 0 && j < list.length && (step % 4 != 0 || chord.indexOf(list[j] % 12) != -1));
                            if (options.length > 0)
                                n.pitches = [list[options[Math.floor(rng() * Math.min(2, options.length))]]];
                            n.pins = null;
                            out.push(n);
                        }
                        else if (r < 0.72 && len >= stepParts * 4) {
                            // Split a long note.
                            const half = Math.round(len / 2 / stepParts) * stepParts;
                            const second = { start: n.start + half, end: n.end, pitches: [list[Math.max(0, Math.min(list.length - 1, idx + (rng() < 0.5 ? 1 : -1)))]], size: Math.max(1, n.size - 1) };
                            n.end = n.start + half;
                            n.pins = null;
                            out.push(n, second);
                        }
                        else if (r < 0.86 && i + 1 < bar.length && bar[i + 1].start == n.end && len <= stepParts * 2) {
                            // Merge with the next note.
                            n.end = bar[i + 1].end;
                            n.pins = null;
                            out.push(n);
                            i++;
                        }
                        else if (step % 4 != 0) {
                            // Nudge an off-beat note by a 16th.
                            const dir = rng() < 0.5 ? -1 : 1;
                            const prevEnd = out.length > 0 ? out[out.length - 1].end : 0;
                            const nextStart = i + 1 < bar.length ? bar[i + 1].start : barSteps * stepParts;
                            const start = n.start + dir * stepParts;
                            if (start >= prevEnd && start < nextStart - 1) {
                                n.end = Math.min(nextStart, Math.max(start + 1, n.end + dir * stepParts));
                                n.start = start;
                                n.pins = null;
                            }
                            out.push(n);
                        }
                        else
                            out.push(n);
                    }
                    bars[b] = out;
                });
                return bars;
            }
            // Drums / percussion: keep the backbone, move the decorations.
            bars.forEach((bar, b) => {
                const out = [];
                const rows = new Set();
                for (const n of bar)
                    for (const p of n.pitches)
                        rows.add(p);
                for (const n of bar) {
                    const step = Math.round(n.start / stepParts);
                    const backbone = step % 4 == 0 && n.size >= 3;
                    if (!backbone && rng() < amount * 0.6)
                        continue;
                    out.push(n);
                }
                const rowList = Array.from(rows);
                const adds = Math.round(amount * 6 * rng());
                for (let k = 0; k < adds && rowList.length > 0; k++) {
                    const step = 1 + 2 * Math.floor(rng() * (barSteps / 2));
                    if (step >= barSteps)
                        continue;
                    out.push({ start: step * stepParts, end: (step + 1) * stepParts, pitches: [rowList[Math.floor(rng() * rowList.length)]], size: 1 + Math.floor(rng() * 2) });
                }
                out.sort((a, c) => a.start - c.start);
                bars[b] = out;
                void b;
            });
            return bars;
        }
        // New pitches on an earlier rhythm.
        static keepRhythm(ctx, previous, fresh) {
            const all = [];
            for (const bar of fresh)
                for (const n of bar)
                    all.push(n.pitches[0]);
            const list = CarrotIdeaGen.scalePitches(ctx, Math.min(...all) - 3, Math.max(...all) + 3, CarrotIdeaGen.melodyClasses(ctx));
            return previous.map((bar, b) => bar.map(n => {
                const source = fresh[Math.min(b, fresh.length - 1)] || [];
                let pick = null;
                for (const m of source)
                    if (m.start <= n.start)
                        pick = m;
                if (!pick)
                    pick = source[0];
                let pitch = pick ? pick.pitches[0] : n.pitches[0];
                const step = Math.round(n.start / ctx.stepParts);
                if (step % 4 == 0 && list.length > 0) {
                    const chord = CarrotIdeaGen.chordClasses(ctx, CarrotIdeaGen.chordAt(ctx, b, step), !!ctx.style.sevenths);
                    if (chord.indexOf(pitch % 12) == -1) {
                        const idx = CarrotIdeaGen.nearestIndex(list, pitch);
                        for (const d of [1, -1, 2, -2]) {
                            const j = idx + d;
                            if (j >= 0 && j < list.length && chord.indexOf(list[j] % 12) != -1) {
                                pitch = list[j];
                                break;
                            }
                        }
                    }
                }
                return { start: n.start, end: n.end, pitches: [pitch], size: n.size };
            }));
        }
        // The earlier notes, in order, on a new rhythm.
        static keepNotes(ctx, previous, fresh) {
            return fresh.map((bar, b) => {
                const source = previous[Math.min(b, previous.length - 1)] || [];
                if (source.length == 0)
                    return bar;
                return bar.map((n, i) => ({ start: n.start, end: n.end, pitches: [source[i % source.length].pitches[0]], size: n.size }));
            });
        }
    }
