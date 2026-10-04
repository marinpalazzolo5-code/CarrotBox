    // ======================================================================
    // CarrotBox: Sound Library 3 - 42 more genre packs with 72 original,
    // synthesized sounds each (3,000+ in all): breakcore, underground, UK and
    // NY drill, rock, indie, webcore, digicore, rage, plugg, metal, jazz and
    // many more. Every genre also gets two drum kits (and so do the Sound
    // Library 2 genres that had none), plus FPC presets for all of them.
    // Like the other libraries, nothing here is recorded audio: every sound
    // is generated on demand from the recipes shared with Sound Library 2.
    // ======================================================================
    {
        const K = FLPackKit;
        const { PK, hz, pad2, merge, jitter, applyCharacter, PERC, BASS, MELODIC, FXR, VOX } = K;
        // ---------------------------------------------- more characters
        const KICK = Object.assign({}, K.KICK, {
            Deep: { body: { start: 0.85, end: 0.88, decay: 1.5 } },
            Room: { room: 0.35 },
            Rumble: { body: { decay: 2.4, end: 0.85 }, room: 0.3, lp: 1200, len: 2.2 },
            Vinyl: { dust: 0.05, lp: 2400, crush: 10 },
            Crunchy: { crush: 9, drive: 4 },
            Glitch: { crush: 6, downsample: 3, drive: 2 },
            Bit: { crush: 5, downsample: 4 },
            Blown: { drive: 12, lp: 5000 },
            Gabber: { drive: 14, body: { decay: 1.4 }, len: 1.4, click: 0.9 },
            Snap: { click: 0.9, body: { decay: 0.35 } },
        });
        const SNARE = Object.assign({}, K.SNARE, {
            Gated: { room: 0.6, roomDecay: 0.35 },
            Glitch: { crush: 6, downsample: 3 },
            Trash: { drive: 6, crush: 9 },
            Ghost: { noise: { amp: 0.6 }, body: { amp: 0.6 } },
            Metal: { ring: { amp: 1.1, ratio: 2.7, decay: 0.08 } },
            Piccolo: { body: { start: 1.5, end: 1.5 }, noise: { hp: 1.3 } },
            Blown: { drive: 10, lp: 7000 },
            Bit: { crush: 5, downsample: 4 },
        });
        const CLAP = Object.assign({}, K.CLAP, {
            Glitch: { crush: 6, downsample: 3 },
            Big: { bursts: 7, spacing: 1.4, room: 0.3, tail: 1.6 },
        });
        const HAT = Object.assign({}, K.HAT, {
            Glitch: { crush: 6, downsample: 3 },
            Digital: { crush: 8, downsample: 2, ringMod: true },
            Trashy: { noise: 0.75, ringMod: true, bp: 0.8 },
            Bright: { bp: 1.3, hp: 1.25, sizzle: 0.35 },
        });
        const OHAT = Object.assign({}, K.OHAT, {
            Glitch: { crush: 6, downsample: 2 },
            Washy: { decay: 2.2, len: 2, sizzle: 0.4 },
        });
        // ---------------------------------------------- drum families
        const FAM = {
            trap: {
                kick: { body: { start: 230, end: 50, sweep: 0.022, decay: 0.42 }, click: 0.35, drive: 1.4, len: 1 },
                snare: { body: { start: 260, end: 190, sweep: 0.01, decay: 0.06 }, noise: { amp: 1, hp: 2200, lp: 13000, decay: 0.14 }, click: 0.2, len: 0.6 },
                clap: { freq: 1250, q: 1.9, tail: 0.15, bursts: 4 },
                hat: { f: 220, decay: 0.035, bp: 10500, hp: 8000, noise: 0.45, len: 0.18 },
                ohat: { f: 220, decay: 0.28, bp: 10000, hp: 7200, noise: 0.5, len: 0.9 },
                tom: { body: { start: 200, end: 120, sweep: 0.04, decay: 0.3 }, noise: { amp: 0.1, hp: 300, lp: 4000, decay: 0.03 }, len: 0.7 },
                kicks: ["Punch", "Sub", "Knock", "Hard", "Tight", "Boom", "Long", "Clicky", "Distorted", "Deep"],
                snares: ["Tight", "Crack", "Snappy", "Bright", "Room", "Verb", "Rim", "Fat", "Dark"],
                claps: ["Room", "Tight", "Layered", "Wide", "Snappy"],
                hats: ["Crisp", "Tight", "Sizzle", "Metal", "Soft", "Dark", "Bright", "Shuffle"],
                ohats: ["Short", "Long", "Bright", "Trashy"],
            },
            acoustic: {
                kick: { body: { start: 120, end: 55, sweep: 0.025, decay: 0.22 }, noise: { amp: 0.35, bp: 3000, hp: 900, lp: 8000, decay: 0.01 }, click: 0.5, room: 0.18, len: 0.8 },
                snare: { body: { start: 210, end: 180, sweep: 0.01, decay: 0.12, amp: 1.1 }, ring: { ratio: 1.62, amp: 0.4, decay: 0.06 }, noise: { amp: 0.9, hp: 1500, lp: 11000, decay: 0.18 }, click: 0.3, room: 0.25, len: 0.8 },
                clap: { freq: 1100, q: 1.5, tail: 0.18, bursts: 4, room: 0.25 },
                hat: { f: 320, decay: 0.05, bp: 8000, hp: 6000, noise: 0.35, len: 0.3, sizzle: 0.2 },
                ohat: { f: 320, decay: 0.45, bp: 7500, hp: 5500, noise: 0.4, len: 1.4, sizzle: 0.3 },
                tom: { body: { start: 160, end: 100, sweep: 0.06, decay: 0.4 }, noise: { amp: 0.2, hp: 200, lp: 5000, decay: 0.04 }, room: 0.2, len: 1 },
                kicks: ["Round", "Punch", "Boom", "Tight", "Thump", "Room", "Dusty", "Deep", "Clicky", "Hard"],
                snares: ["Body", "Fat", "Crack", "Room", "Verb", "Rim", "Ghost", "Piccolo", "Bright"],
                claps: ["Room", "Wide", "Layered", "Big", "Tight"],
                hats: ["Crisp", "Soft", "Dark", "Sizzle", "Tight", "Shuffle", "Bright", "Dusty"],
                ohats: ["Long", "Washy", "Bright", "Short"],
            },
            machine: {
                kick: { body: { start: 300, end: 52, sweep: 0.012, decay: 0.32 }, click: 0.6, drive: 2, len: 0.7 },
                snare: { body: { start: 230, end: 180, sweep: 0.008, decay: 0.08 }, noise: { amp: 1, hp: 1800, lp: 12000, decay: 0.12 }, click: 0.3, len: 0.5 },
                clap: { freq: 1200, q: 1.8, tail: 0.14, bursts: 4 },
                hat: { f: 260, decay: 0.03, bp: 11000, hp: 8500, noise: 0.55, len: 0.15 },
                ohat: { f: 260, decay: 0.25, bp: 10500, hp: 7500, noise: 0.55, len: 0.8 },
                tom: { body: { start: 220, end: 140, sweep: 0.03, decay: 0.25 }, click: 0.2, len: 0.6 },
                kicks: ["Punch", "Hard", "Tight", "Clicky", "Boom", "Thump", "Distorted", "Round", "Rumble", "Snap"],
                snares: ["Tight", "Crack", "Snappy", "Bright", "Gated", "Body", "Room", "Metal", "Dark"],
                claps: ["Tight", "Snappy", "Wide", "Big", "Room"],
                hats: ["Crisp", "Tight", "Metal", "Bright", "Sizzle", "Digital", "Dark", "Soft"],
                ohats: ["Short", "Bright", "Long", "Trashy"],
            },
            breaks: {
                kick: { body: { start: 150, end: 58, sweep: 0.02, decay: 0.2 }, noise: { amp: 0.4, bp: 2500, hp: 700, lp: 7000, decay: 0.012 }, click: 0.5, room: 0.1, crush: 11, len: 0.6 },
                snare: { body: { start: 230, end: 200, sweep: 0.01, decay: 0.1 }, ring: { ratio: 1.7, amp: 0.35, decay: 0.05 }, noise: { amp: 1.1, hp: 1600, lp: 10000, decay: 0.15 }, click: 0.4, room: 0.2, crush: 11, len: 0.6 },
                clap: { freq: 1300, q: 1.6, tail: 0.12, bursts: 4, crush: 10 },
                hat: { f: 300, decay: 0.045, bp: 8500, hp: 6500, noise: 0.4, len: 0.25, crush: 10 },
                ohat: { f: 300, decay: 0.35, bp: 8000, hp: 6000, noise: 0.45, len: 1, crush: 10 },
                tom: { body: { start: 170, end: 110, sweep: 0.05, decay: 0.3 }, noise: { amp: 0.2, hp: 250, lp: 4500, decay: 0.03 }, crush: 11, len: 0.8 },
                kicks: ["Dusty", "Punch", "Knock", "Thump", "Round", "Vinyl", "Crunchy", "Tight", "Hard", "Room"],
                snares: ["Crack", "Room", "Dusty", "Snappy", "Fat", "Rim", "Trash", "Ghost", "Verb"],
                claps: ["Dusty", "Room", "Layered", "Tight", "Wide"],
                hats: ["Dusty", "Crisp", "Shuffle", "Tight", "Sizzle", "Soft", "Trashy", "Dark"],
                ohats: ["Trashy", "Short", "Long", "Washy"],
            },
            digital: {
                kick: { body: { start: 260, end: 48, sweep: 0.018, decay: 0.38 }, click: 0.5, drive: 3, crush: 7, downsample: 2, len: 0.9 },
                snare: { body: { start: 280, end: 200, sweep: 0.01, decay: 0.07 }, noise: { amp: 1, hp: 2500, lp: 12000, decay: 0.12 }, click: 0.3, crush: 6, downsample: 2, len: 0.5 },
                clap: { freq: 1400, q: 2, tail: 0.12, bursts: 3, crush: 6 },
                hat: { f: 240, decay: 0.03, bp: 11000, hp: 8000, noise: 0.5, len: 0.15, crush: 6, downsample: 2 },
                ohat: { f: 240, decay: 0.25, bp: 10000, hp: 7000, noise: 0.5, len: 0.8, crush: 6 },
                tom: { body: { start: 300, end: 150, sweep: 0.03, decay: 0.2 }, crush: 6, downsample: 2, len: 0.5 },
                kicks: ["Bit", "Glitch", "Crunchy", "Punch", "Distorted", "Blown", "Sub", "Clicky", "Hard", "Snap"],
                snares: ["Bit", "Glitch", "Trash", "Snappy", "Crack", "Bright", "Blown", "Tight", "Gated"],
                claps: ["Glitch", "Tight", "Snappy", "Layered", "Big"],
                hats: ["Digital", "Glitch", "Crisp", "Metal", "Tight", "Bright", "Trashy", "Sizzle"],
                ohats: ["Glitch", "Short", "Bright", "Trashy"],
            },
            soft: {
                kick: { body: { start: 110, end: 45, sweep: 0.04, decay: 0.6 }, click: 0.15, room: 0.35, roomDecay: 1.2, len: 1.6 },
                snare: { body: { start: 190, end: 170, decay: 0.12 }, noise: { amp: 0.7, hp: 1200, lp: 8000, decay: 0.25 }, room: 0.5, roomDecay: 1.2, len: 1.2 },
                clap: { freq: 1000, q: 1.3, tail: 0.3, bursts: 5, room: 0.5 },
                hat: { f: 300, decay: 0.06, bp: 7500, hp: 5500, noise: 0.35, len: 0.35, attack: 0.002 },
                ohat: { f: 300, decay: 0.6, bp: 7000, hp: 5000, noise: 0.35, len: 1.6, sizzle: 0.3 },
                tom: { body: { start: 110, end: 70, sweep: 0.08, decay: 0.7 }, noise: { amp: 0.25, hp: 150, lp: 3000, decay: 0.08 }, room: 0.5, len: 2 },
                kicks: ["Sub", "Round", "Deep", "Boom", "Rumble", "Room", "Long", "Thump", "Vinyl", "Dusty"],
                snares: ["Verb", "Room", "Dark", "Body", "Gated", "Ghost", "Fat", "Dusty", "Rim"],
                claps: ["Room", "Long", "Wide", "Big", "Layered"],
                hats: ["Soft", "Dark", "Shuffle", "Crisp", "Dusty", "Sizzle", "Tight", "Metal"],
                ohats: ["Washy", "Long", "Short", "Bright"],
            },
        };
        // ---------------------------------------------- the genres
        // percs: 8 PERC recipes; bass / melodic: recipe names or [shown name, recipe, changes]
        const FX5 = ["Riser", "Impact", "Downlifter", "Reverse Swell", "Sweep"];
        const GENRES = [
            { name: "Breakcore", fam: "breaks", key: 62, mods: { kick: { drive: 2 } },
                percs: ["Rim", "Snap", "Zap Perc", "Laser Perc", "Metal Hit", "Shaker", "Woodblock", "Vinyl Tick"],
                bass: ["Reese", ["Reese Distorted", "Reese", { drive: 5 }], "808 Distorted", "Wobble", "Hoover", "Sub Bass"],
                melodic: ["Strings", "Choir", "Piano", ["Glitch Bell", "Bell", { crush: 6, downsample: 2 }], "Supersaw", "Hoover Lead", "Dark Pad", "Square Lead"],
                fx: ["Stutter Riser", "Zap", "Impact", "Reverse Swell", "Noise Riser"], vox: ["Ah", "Eee", "Hey"] },
            { name: "Underground UG", fam: "trap", key: 56, post: { dust: 0.02, lp: 9000 }, mods: { kick: { drive: 2.5 } },
                percs: ["Rim", "Snap", "Cowbell", "Vinyl Tick", "Knock", "Shaker", "Laser Perc", "Metal Hit"],
                bass: ["808 Long", "808 Distorted", ["808 Blown", "808 Distorted", { drive: 14, lp: 2200, hold: 0.05, decay: 1.0 }], "808 Slide", "808 Punch", "Sub Bass"],
                melodic: ["Dark Pad", ["Tape Piano", "Piano", { crush: 9 }], "Bell", "Choir", "Tape Keys", "Flute", "Strings", ["Echo Bell", "Bell", { echo: 0.5 }]],
                fx: ["Riser", "Impact", "Sub Drop", "Reverse Swell", "Texture"], vox: ["Uh", "Ay", "Yeah"] },
            { name: "UK Drill", fam: "trap", key: 56, mods: { kick: { body: { decay: 0.8 } } },
                percs: ["Rim", "Snap", "Shaker", "Woodblock", "Clave", "Metal Hit", "Vinyl Tick", "Knock"],
                bass: ["808 Slide", ["808 Drill", "808 Punch", { drive: 4 }], "808 Long", "808 Distorted", "Sub Bass", ["808 Glide", "808 Slide", { drop: 2.5, sweep: 0.4, hold: 0.2 }]],
                melodic: ["Strings", "Dark Pad", "Piano", "Choir", "Bell", ["Drill Pluck", "Pluck", { verb: 0.3 }], "Flute", "Glass Keys"],
                fx: ["Riser", "Impact", "Sub Drop", "Reverse Swell", "Downlifter"], vox: ["Uh", "Ay", "Hey"] },
            { name: "NY Drill", fam: "trap", key: 55, mods: { kick: { drive: 3, click: 0.5 } },
                percs: ["Rim", "Snap", "Cowbell", "Shaker", "Clave", "Knock", "Woodblock", "Metal Hit"],
                bass: ["808 Slide", "808 Distorted", ["808 Bronx", "808 Punch", { drive: 6 }], "808 Long", "Sub Bass", "Reese"],
                melodic: ["Choir", "Strings", "Piano", "Dark Pad", "Bell", "Vocal Pad", "Brass Stab", "Flute"],
                fx: ["Riser", "Impact", "Sub Drop", "Downlifter", "Zap"], vox: ["Woah", "Uh", "Hey"] },
            { name: "Rock", fam: "acoustic", key: 57,
                percs: ["Tambourine", "Cowbell", "Shaker", "Rim", "Woodblock", "Clave", "Triangle", "Agogo"],
                bass: ["Finger Bass", ["Pick Bass", "Finger Bass", { drive: 2 }], ["Overdrive Bass", "Finger Bass", { drive: 6 }], "Synth Bass", "Pluck Bass", "Sub Bass"],
                melodic: [["Power Chord", "Guitar Pluck", { chord: [0, 7, 12], drive: 8 }], ["Clean Guitar", "Guitar Pluck", { verb: 0.2 }], ["Crunch Guitar", "Guitar Pluck", { drive: 4 }], "Organ Stab", "Piano", "Strings", ["Lead Guitar", "Saw Lead", { drive: 5 }], "Brass Stab"],
                fx: ["Impact", "Riser", "Reverse Swell", "Downlifter", "Noise Riser"], vox: ["Hey", "Yeah", "Woah"] },
            { name: "Indie", fam: "acoustic", key: 60, post: { room: 0.28 },
                percs: ["Tambourine", "Shaker", "Cabasa", "Clave", "Woodblock", "Triangle", "Snap", "Glass Tink"],
                bass: ["Finger Bass", "Pluck Bass", "Synth Bass", "Sub Bass", ["Chorus Bass", "Finger Bass", { chorus: 0.6 }], "Organ Bass"],
                melodic: [["Jangle Guitar", "Guitar Pluck", { chorus: 0.6, verb: 0.2 }], "Rhodes", "Tape Keys", "Glass Keys", "Bright Pad", "Kalimba", ["Fuzz Guitar", "Guitar Pluck", { drive: 7 }], "Arp Pluck"],
                fx: ["Reverse Swell", "Sweep", "Texture", "Riser", "Impact"], vox: ["Ooh", "Ah", "Oh"] },
            { name: "Webcore", fam: "digital", key: 64, post: { room: 0.2 },
                percs: ["Blip", "Glass Tink", "Laser Perc", "Zap Perc", "Triangle", "Vinyl Tick", "Snap", "Metal Hit"],
                bass: ["808 Long", "Sub Bass", ["Bit 808", "808 Punch", { crush: 6 }], "FM Bass", "Wobble", "Synth Bass"],
                melodic: [["Web Bell", "Bell", { echo: 0.5, verb: 0.3 }], "Glass Keys", "Kalimba", "Vocal Pad", "Bright Pad", ["Bit Lead", "Chip Lead", { echo: 0.4 }], "Marimba", ["Dream Keys", "Tape Keys", { verb: 0.4 }]],
                fx: ["Stutter Riser", "Zap", "Texture", "Reverse Swell", "Sweep"], vox: ["Eee", "Ooh", "Ah"] },
            { name: "Digicore", fam: "digital", key: 63, mods: { kick: { drive: 5 } },
                percs: ["Laser Perc", "Zap Perc", "Blip", "Snap", "Rim", "Metal Hit", "Shaker", "Glass Tink"],
                bass: ["808 Distorted", ["808 Blown", "808 Distorted", { drive: 14, lp: 2200, hold: 0.05, decay: 1.0 }], "808 Slide", "Sub Bass", "Reese", "FM Bass"],
                melodic: ["Supersaw", ["Hyper Pluck", "Pluck", { drive: 3 }], "Bell", "Saw Lead", "Glass Keys", "Bright Pad", "Chip Lead", ["Detuned Lead", "Saw Lead", { detune: 0.4, voices: 5 }]],
                fx: ["Stutter Riser", "Zap", "Impact", "Riser", "Noise Riser"], vox: ["Eee", "Hey", "Yeah"] },
            { name: "Rage", fam: "trap", key: 58, mods: { kick: { drive: 3 } },
                percs: ["Rim", "Snap", "Laser Perc", "Zap Perc", "Metal Hit", "Shaker", "Cowbell", "Vinyl Tick"],
                bass: ["808 Distorted", "808 Long", ["808 Rage", "808 Distorted", { drive: 12, decay: 0.9, hold: 0.1, lp: 3000 }], "808 Slide", "Sub Bass", "Reese"],
                melodic: [["Rage Synth", "Supersaw", { drive: 3 }], "Saw Lead", "Bright Pad", "Hoover Lead", "Bell", "Square Lead", "Chord Stab", "Dark Pad"],
                fx: ["Riser", "Impact", "Zap", "Stutter Riser", "Sub Drop"], vox: ["Yeah", "Woah", "Hey"] },
            { name: "Plugg", fam: "trap", key: 61, mods: { hat: { decay: 0.03 } },
                percs: ["Rim", "Snap", "Shaker", "Vinyl Tick", "Glass Tink", "Triangle", "Woodblock", "Blip"],
                bass: ["808 Long", "808 Slide", "Sub Bass", "808 Punch", ["808 Soft", "808 Long", { drive: 0.5 }], "FM Bass"],
                melodic: [["Plugg Bell", "Bell", { verb: 0.25 }], "Glass Keys", "Kalimba", "Flute", "Bright Pad", "Marimba", "Rhodes", "Square Lead"],
                fx: ["Riser", "Reverse Swell", "Sweep", "Impact", "Downlifter"], vox: ["Ooh", "Yeah", "Ay"] },
            { name: "Pluggnb", fam: "trap", key: 60,
                percs: ["Rim", "Snap", "Shaker", "Triangle", "Glass Tink", "Vinyl Tick", "Cabasa", "Woodblock"],
                bass: ["808 Long", "Sub Bass", "808 Slide", "808 Punch", "FM Bass", "Finger Bass"],
                melodic: ["Rhodes", "Bright Pad", "Bell", "Glass Keys", "Strings", ["RnB Keys", "Tape Keys", { chorus: 0.5 }], "Guitar Pluck", "Vocal Pad"],
                fx: FX5, vox: ["Ooh", "Oh", "Yeah"] },
            { name: "Emo Rap", fam: "trap", key: 57,
                percs: ["Rim", "Snap", "Shaker", "Tambourine", "Vinyl Tick", "Glass Tink", "Triangle", "Knock"],
                bass: ["808 Long", "808 Distorted", "808 Slide", "Sub Bass", "808 Punch", "Finger Bass"],
                melodic: [["Sad Guitar", "Guitar Pluck", { verb: 0.3 }], "Piano", "Strings", "Dark Pad", ["Lo Guitar", "Guitar Pluck", { crush: 9 }], "Bell", "Choir", "Tape Keys"],
                fx: FX5, vox: ["Oh", "Ooh", "Yeah"] },
            { name: "Glitchcore", fam: "digital", key: 65, post: { crush: 5 },
                percs: ["Zap Perc", "Laser Perc", "Blip", "Metal Hit", "Snap", "Vinyl Tick", "Glass Tink", "Rim"],
                bass: ["808 Distorted", ["Glitch 808", "808 Punch", { crush: 5 }], "Wobble", "Reese", "FM Bass", "Sub Bass"],
                melodic: [["Glitch Bell", "Bell", { crush: 6, downsample: 3 }], ["Glitch Lead", "Chip Lead", { echo: 0.5 }], "Supersaw", "Saw Lead", "Glass Keys", "Arp Pluck", "Bright Pad", "Hoover Lead"],
                fx: ["Stutter Riser", "Zap", "Impact", "Noise Riser", "Reverse Swell"], vox: ["Eee", "Ay", "Hey"] },
            { name: "Nightcore", fam: "machine", key: 66, mods: { kick: { drive: 2.5 } },
                percs: ["Shaker", "Tambourine", "Snap", "Cowbell", "Blip", "Laser Perc", "Rim", "Cabasa"],
                bass: ["Synth Bass", "FM Bass", "Sub Bass", "Reese", "Pluck Bass", "808 Punch"],
                melodic: ["Supersaw", "Piano", "Bright Pad", "Pluck", "Saw Lead", "Bell", "Strings", "Arp Pluck"],
                fx: ["Riser", "Noise Riser", "Impact", "Sweep", "Downlifter"], vox: ["Eee", "Hey", "Ah"] },
            { name: "Metal", fam: "acoustic", key: 52, mods: { kick: { click: 0.9, body: { decay: 0.6 } }, snare: { drive: 2 } },
                kicks: ["Clicky", "Punch", "Tight", "Hard", "Snap", "Thump", "Round", "Room", "Knock", "Boom"],
                percs: ["Cowbell", "Metal Hit", "Rim", "Woodblock", "Tambourine", "Clave", "Triangle", "Agogo"],
                bass: [["Metal Bass", "Finger Bass", { drive: 8 }], "Finger Bass", "Synth Bass", ["Drop Bass", "Finger Bass", { drive: 10 }], "Sub Bass", "Pluck Bass"],
                melodic: [["Chug Guitar", "Guitar Pluck", { chord: [0, 7], drive: 12 }], ["Power Chord", "Guitar Pluck", { chord: [0, 7, 12], drive: 12 }], ["Lead Guitar", "Saw Lead", { drive: 8 }], "Strings", "Choir", "Organ Stab", "Dark Pad", "Piano"],
                fx: ["Impact", "Riser", "Downlifter", "Reverse Swell", "Sub Drop"], vox: ["Hey", "Ho", "Uh"] },
            { name: "Punk", fam: "acoustic", key: 57, post: { drive: 1.5 },
                percs: ["Tambourine", "Cowbell", "Shaker", "Rim", "Woodblock", "Clave", "Snap", "Agogo"],
                bass: [["Punk Bass", "Finger Bass", { drive: 4 }], "Finger Bass", "Pluck Bass", "Synth Bass", "Sub Bass", "Organ Bass"],
                melodic: [["Power Chord", "Guitar Pluck", { chord: [0, 7, 12], drive: 9 }], ["Fast Guitar", "Guitar Pluck", { drive: 5 }], "Organ Stab", "Piano", ["Lead Guitar", "Saw Lead", { drive: 5 }], "Chord Stab", "Brass Stab", "Bright Pad"],
                fx: ["Impact", "Riser", "Downlifter", "Noise Riser", "Reverse Swell"], vox: ["Hey", "Ho", "Oh"] },
            { name: "Grunge", fam: "acoustic", key: 52, post: { room: 0.3 },
                percs: ["Tambourine", "Cowbell", "Shaker", "Rim", "Woodblock", "Metal Hit", "Snap", "Knock"],
                bass: [["Grunge Bass", "Finger Bass", { drive: 6 }], "Finger Bass", "Pluck Bass", "Synth Bass", "Sub Bass", "Organ Bass"],
                melodic: [["Sludge Guitar", "Guitar Pluck", { chord: [0, 7, 12], drive: 10 }], ["Clean Guitar", "Guitar Pluck", { chorus: 0.5 }], "Organ Stab", "Dark Pad", "Piano", "Strings", ["Fuzz Lead", "Saw Lead", { drive: 7 }], "Tape Keys"],
                fx: ["Impact", "Reverse Swell", "Downlifter", "Noise Riser", "Texture"], vox: ["Oh", "Yeah", "Uh"] },
            { name: "Shoegaze", fam: "soft", key: 60, post: { room: 0.6 },
                percs: ["Tambourine", "Shaker", "Triangle", "Cabasa", "Glass Tink", "Woodblock", "Snap", "Clave"],
                bass: ["Finger Bass", "Synth Bass", "Sub Bass", ["Fuzz Bass", "Finger Bass", { drive: 5 }], "Pluck Bass", "Organ Bass"],
                melodic: [["Wall Guitar", "Guitar Pluck", { chord: [0, 7, 12], drive: 6, verb: 0.5, chorus: 0.6 }], "Bright Pad", "Vocal Pad", "Strings", ["Dream Guitar", "Guitar Pluck", { verb: 0.5, chorus: 0.5 }], "Glass Keys", "Choir", "Tape Keys"],
                fx: ["Reverse Swell", "Texture", "Noise Riser", "Sweep", "Riser"], vox: ["Ooh", "Ah", "Oh"] },
            { name: "Bedroom Pop", fam: "acoustic", key: 62, post: { dust: 0.015, lp: 8000 },
                percs: ["Shaker", "Tambourine", "Snap", "Cabasa", "Triangle", "Glass Tink", "Woodblock", "Vinyl Tick"],
                bass: ["Finger Bass", "Sub Bass", "Synth Bass", "FM Bass", "Pluck Bass", "Organ Bass"],
                melodic: [["Bedroom Guitar", "Guitar Pluck", { chorus: 0.5 }], "Tape Keys", "Rhodes", "Kalimba", "Glass Keys", "Bright Pad", "Flute", "Marimba"],
                fx: ["Reverse Swell", "Sweep", "Texture", "Riser", "Downlifter"], vox: ["Ooh", "Ah", "Oh"] },
            { name: "Jazz", fam: "acoustic", key: 58,
                kicks: ["Round", "Thump", "Room", "Boom", "Tight", "Deep", "Punch", "Dusty", "Clicky", "Sub"],
                snares: ["Body", "Room", "Ghost", "Rim", "Verb", "Dark", "Fat", "Piccolo", "Dusty"],
                hats: ["Soft", "Shuffle", "Dark", "Crisp", "Sizzle", "Dusty", "Tight", "Metal"],
                percs: ["Rim", "Shaker", "Triangle", "Woodblock", "Clave", "Conga", "Bongo", "Cabasa"],
                bass: [["Upright Bass", "Finger Bass", { verb: 0.1 }], "Finger Bass", "Organ Bass", "Sub Bass", "FM Bass", "Pluck Bass"],
                melodic: ["Piano", "Rhodes", ["Muted Trumpet", "Trumpet", { cutoff: 900 }], "Trumpet", "Organ Stab", ["Vibes", "Marimba", { verb: 0.2 }], "Brass Stab", "Flute"],
                fx: ["Reverse Swell", "Sweep", "Texture", "Impact", "Downlifter"], vox: ["Oh", "Ah", "Ooh"] },
            { name: "Neo Soul", fam: "acoustic", key: 58, post: { dust: 0.01 },
                kicks: ["Round", "Dusty", "Thump", "Punch", "Room", "Deep", "Boom", "Tight", "Vinyl", "Sub"],
                percs: ["Rim", "Shaker", "Snap", "Tambourine", "Conga", "Triangle", "Cabasa", "Vinyl Tick"],
                bass: ["Finger Bass", "Sub Bass", "FM Bass", "Synth Bass", "Organ Bass", "Pluck Bass"],
                melodic: ["Rhodes", "Tape Keys", "Piano", "Glass Keys", "Organ Stab", "Strings", "Guitar Pluck", "Bright Pad"],
                fx: FX5, vox: ["Ooh", "Yeah", "Oh"] },
            { name: "Gospel", fam: "acoustic", key: 60, post: { room: 0.3 },
                claps: ["Room", "Big", "Wide", "Layered", "Long"],
                percs: ["Tambourine", "Shaker", "Rim", "Snap", "Cowbell", "Triangle", "Woodblock", "Clave"],
                bass: ["Organ Bass", "Finger Bass", "Sub Bass", "Synth Bass", "FM Bass", "Pluck Bass"],
                melodic: [["Gospel Organ", "Organ Stab", { chorus: 0.4 }], "Piano", "Choir", "Rhodes", "Strings", "Brass Stab", "Bright Pad", "Vocal Pad"],
                fx: ["Impact", "Riser", "Reverse Swell", "Sweep", "Downlifter"], vox: ["Oh", "Woah", "Hey"] },
            { name: "City Pop", fam: "acoustic", key: 61,
                snares: ["Gated", "Body", "Crack", "Room", "Bright", "Snappy", "Fat", "Rim", "Verb"],
                percs: ["Shaker", "Tambourine", "Cowbell", "Conga", "Bongo", "Clave", "Triangle", "Cabasa"],
                bass: [["Slap Bass", "Finger Bass", { drive: 1.5 }], "Synth Bass", "FM Bass", "Finger Bass", "Sub Bass", "Pluck Bass"],
                melodic: ["Rhodes", ["Funk Guitar", "Guitar Pluck", { chorus: 0.4 }], "Brass Stab", "Bright Pad", "Glass Keys", "Strings", "Saw Lead", "Piano"],
                fx: ["Sweep", "Riser", "Reverse Swell", "Impact", "Downlifter"], vox: ["Woah", "Oh", "Ah"] },
            { name: "K-Pop", fam: "machine", key: 63, mods: { kick: { drive: 2.2 } },
                percs: ["Shaker", "Snap", "Rim", "Tambourine", "Cowbell", "Laser Perc", "Blip", "Clave"],
                bass: ["808 Punch", "Synth Bass", "Sub Bass", "Reese", "FM Bass", "808 Long"],
                melodic: ["Supersaw", "Pluck", "Piano", "Bright Pad", "Brass Stab", "Saw Lead", "Bell", "Strings"],
                fx: ["Riser", "Impact", "Noise Riser", "Downlifter", "Stutter Riser"], vox: ["Hey", "Yeah", "Eee"] },
            { name: "Vaporwave", fam: "machine", key: 59, post: { lp: 6000, room: 0.35 },
                percs: ["Shaker", "Cowbell", "Clave", "Conga", "Snap", "Glass Tink", "Triangle", "Vinyl Tick"],
                bass: ["FM Bass", "Synth Bass", "Finger Bass", "Sub Bass", "Organ Bass", "Pluck Bass"],
                melodic: [["Mall Keys", "Rhodes", { chorus: 0.6, verb: 0.4 }], "Tape Keys", "Bright Pad", "Glass Keys", "Strings", ["Vapor Sax", "Trumpet", { verb: 0.4 }], "Marimba", "Vocal Pad"],
                fx: ["Reverse Swell", "Texture", "Sweep", "Downlifter", "Riser"], vox: ["Ooh", "Ah", "Oh"] },
            { name: "Chiptune", fam: "digital", key: 64, post: { crush: 4 },
                percs: ["Blip", "Laser Perc", "Zap Perc", "Snap", "Rim", "Metal Hit", "Vinyl Tick", "Clave"],
                bass: [["Chip Bass", "Chip Lead", { f: hz(36) }], ["Triangle Bass", "Chip Lead", { f: hz(36), osc: "tri" }], "Synth Bass", "Sub Bass", "FM Bass", ["Pulse Bass", "Square Lead", { f: hz(36) }]],
                melodic: ["Chip Lead", ["Chip Lead 50%", "Chip Lead", { width: 0.5, attack: 0.03, release: 0.2 }], ["Chip Lead 12%", "Chip Lead", { width: 0.125, vib: 0.2, echo: 0.35 }], "Square Lead", "Arp Pluck", ["Chip Bell", "Bell", { crush: 5 }], ["Chip Pad", "Bright Pad", { crush: 6 }], "Saw Lead"],
                fx: ["Zap", "Stutter Riser", "Riser", "Impact", "Sweep"], vox: ["Hey", "Yeah", "Eee"] },
            { name: "Gabber", fam: "machine", key: 57, mods: { kick: { drive: 10, body: { decay: 0.45 } } },
                kicks: ["Gabber", "Distorted", "Blown", "Hard", "Punch", "Crunchy", "Long", "Boom", "Clicky", "Thump"],
                percs: ["Metal Hit", "Rim", "Clave", "Zap Perc", "Laser Perc", "Shaker", "Cowbell", "Snap"],
                bass: ["Hoover", "Reese", "Acid", "808 Distorted", "Synth Bass", "Sub Bass"],
                melodic: ["Hoover Lead", "Supersaw", "Saw Lead", "Chord Stab", "Strings", "Choir", "Bright Pad", "Square Lead"],
                fx: ["Riser", "Impact", "Noise Riser", "Stutter Riser", "Zap"], vox: ["Hey", "Ho", "Yeah"] },
            { name: "Footwork", fam: "machine", key: 59,
                percs: ["Rim", "Snap", "Cowbell", "Shaker", "Clave", "Woodblock", "Vinyl Tick", "Knock"],
                bass: ["808 Long", "808 Punch", "Sub Bass", "808 Slide", "FM Bass", "Synth Bass"],
                melodic: ["Vocal Pad", "Rhodes", "Piano", "Strings", "Chord Stab", "Bell", "Flute", "Brass Stab"],
                fx: ["Riser", "Impact", "Zap", "Sub Drop", "Reverse Swell"], vox: ["Hey", "Uh", "Woah"] },
            { name: "Baile Funk", fam: "machine", key: 58, mods: { kick: { drive: 3 } },
                percs: ["Cowbell", "Conga", "Agogo", "Tambourine", "Shaker", "Woodblock", "Clave", "Snap"],
                bass: ["808 Punch", "808 Distorted", "Sub Bass", "808 Long", "Synth Bass", "Donk"],
                melodic: ["Brass Stab", "Chord Stab", "Organ Stab", "Strings", "Pluck", "Saw Lead", "Steel Pan", "Flute"],
                fx: ["Impact", "Riser", "Zap", "Sub Drop", "Downlifter"], vox: ["Hey", "Ay", "Ho"] },
            { name: "Dancehall", fam: "machine", key: 60,
                percs: ["Rim", "Shaker", "Cowbell", "Bongo", "Conga", "Woodblock", "Clave", "Snap"],
                bass: ["Sub Bass", "808 Long", "Synth Bass", "FM Bass", "808 Punch", "Pluck Bass"],
                melodic: ["Steel Pan", "Pluck", "Organ Stab", "Brass Stab", "Marimba", "Chord Stab", "Flute", "Bell"],
                fx: FX5, vox: ["Hey", "Ay", "Woah"] },
            { name: "Moombahton", fam: "machine", key: 57,
                percs: ["Conga", "Bongo", "Timbale", "Shaker", "Cowbell", "Guiro", "Clave", "Rim"],
                bass: ["Reese", "Synth Bass", "Sub Bass", "Wobble", "808 Punch", "FM Bass"],
                melodic: ["Pluck", "Brass Stab", "Chord Stab", "Saw Lead", "Flute", "Bright Pad", "Marimba", "Steel Pan"],
                fx: ["Riser", "Impact", "Noise Riser", "Downlifter", "Sweep"], vox: ["Hey", "Ay", "Woah"] },
            { name: "Brazilian Phonk", fam: "trap", key: 55, post: { crush: 9 }, mods: { kick: { drive: 6 } },
                percs: ["Cowbell", "Agogo", "Snap", "Rim", "Shaker", "Metal Hit", "Woodblock", "Tambourine"],
                bass: ["808 Distorted", ["808 Blown", "808 Distorted", { drive: 14, lp: 2200, hold: 0.05, decay: 1.0 }], "808 Punch", "808 Slide", "Sub Bass", "Reese"],
                melodic: [["Phonk Bell", "Bell", { drive: 4 }], "Brass Stab", "Choir", "Dark Pad", "Square Lead", "Chord Stab", "Strings", "Saw Lead"],
                fx: ["Impact", "Riser", "Sub Drop", "Zap", "Downlifter"], vox: ["Hey", "Ay", "Uh"] },
            { name: "Hard Techno", fam: "machine", key: 55, mods: { kick: { drive: 6, body: { decay: 0.4 } } },
                kicks: ["Distorted", "Rumble", "Hard", "Blown", "Punch", "Gabber", "Thump", "Boom", "Tight", "Crunchy"],
                percs: ["Rim", "Metal Hit", "Clave", "Cowbell", "Shaker", "Woodblock", "Zap Perc", "Laser Perc"],
                bass: ["Acid", "Reese", "Synth Bass", "Sub Bass", "Hoover", "FM Bass"],
                melodic: ["Chord Stab", "Dark Pad", "Hoover Lead", "Saw Lead", "Supersaw", "Strings", "Bright Pad", "Arp Pluck"],
                fx: ["Riser", "Impact", "Noise Riser", "Zap", "Texture"], vox: ["Hey", "Ho", "Uh"] },
            { name: "Trance", fam: "machine", key: 62, post: { room: 0.15 },
                percs: ["Shaker", "Tambourine", "Rim", "Clave", "Cabasa", "Triangle", "Snap", "Woodblock"],
                bass: ["Synth Bass", "Sub Bass", "Pluck Bass", "Reese", "FM Bass", "Acid"],
                melodic: ["Supersaw", "Pluck", "Bright Pad", "Arp Pluck", "Saw Lead", "Strings", "Choir", "Piano"],
                fx: ["Riser", "Noise Riser", "Downlifter", "Impact", "Sweep"], vox: ["Ah", "Ooh", "Eee"] },
            { name: "Big Room", fam: "machine", key: 60, mods: { kick: { drive: 4, body: { decay: 0.36 } } },
                percs: ["Shaker", "Snap", "Rim", "Tambourine", "Clave", "Laser Perc", "Metal Hit", "Cowbell"],
                bass: ["Reese", "Synth Bass", "Sub Bass", "808 Punch", "Wobble", "FM Bass"],
                melodic: [["Big Room Lead", "Supersaw", { drive: 2 }], "Saw Lead", "Brass Stab", "Chord Stab", "Pluck", "Bright Pad", "Hoover Lead", "Piano"],
                fx: ["Riser", "Impact", "Noise Riser", "Stutter Riser", "Downlifter"], vox: ["Hey", "Ho", "Yeah"] },
            { name: "Cinematic", fam: "soft", key: 57, mods: { kick: { body: { decay: 1.2 } } },
                kicks: ["Boom", "Rumble", "Deep", "Sub", "Room", "Long", "Thump", "Round", "Hard", "Distorted"],
                percs: ["Low Tom", "High Tom", "Metal Hit", "Triangle", "Timbale", "Talking Drum", "Udu", "Steel Hit"],
                bass: ["Sub Bass", "Reese", "Hoover", "Synth Bass", "808 Long", "Organ Bass"],
                melodic: ["Strings", "Choir", "Brass Stab", "Dark Pad", "Harp", "Piano", "Bright Pad", "Flute"],
                fx: ["Impact", "Riser", "Downlifter", "Reverse Swell", "Sub Drop"], vox: ["Ah", "Oh", "Ooh"] },
            { name: "Ambient", fam: "soft", key: 62,
                percs: ["Glass Tink", "Triangle", "Shaker", "Woodblock", "Steel Hit", "Udu", "Cabasa", "Vinyl Tick"],
                bass: ["Sub Bass", "Synth Bass", "FM Bass", "Organ Bass", "Reese", "Pluck Bass"],
                melodic: ["Bright Pad", "Dark Pad", "Vocal Pad", "Glass Keys", "Kalimba", "Harp", "Strings", "Flute"],
                fx: ["Texture", "Reverse Swell", "Sweep", "Downlifter", "Noise Riser"], vox: ["Ooh", "Ah", "Oh"] },
            { name: "Witch House", fam: "trap", key: 55, post: { room: 0.4, lp: 7000 },
                percs: ["Metal Hit", "Snap", "Rim", "Shaker", "Vinyl Tick", "Triangle", "Woodblock", "Knock"],
                bass: ["808 Long", "808 Distorted", "Sub Bass", "Reese", "808 Slide", "Hoover"],
                melodic: ["Choir", "Dark Pad", "Vocal Pad", "Strings", ["Haunted Bell", "Bell", { verb: 0.6 }], "Organ Stab", "Hoover Lead", "Glass Keys"],
                fx: ["Texture", "Reverse Swell", "Downlifter", "Sub Drop", "Impact"], vox: ["Oh", "Ooh", "Ah"] },
            { name: "Grime", fam: "machine", key: 58,
                percs: ["Rim", "Snap", "Clave", "Woodblock", "Metal Hit", "Shaker", "Laser Perc", "Zap Perc"],
                bass: ["Reese", "Wobble", "Synth Bass", "Sub Bass", ["Eski Bass", "Square Lead", { f: hz(36) }], "FM Bass"],
                melodic: [["Eski Synth", "Square Lead", {}], "Strings", "Chord Stab", "Bell", "Saw Lead", "Brass Stab", "Pluck", "Dark Pad"],
                fx: ["Zap", "Impact", "Riser", "Sub Drop", "Downlifter"], vox: ["Hey", "Uh", "Ay"] },
            { name: "Breakbeat", fam: "breaks", key: 60, post: { crush: 12 },
                percs: ["Shaker", "Tambourine", "Rim", "Conga", "Bongo", "Cowbell", "Snap", "Woodblock"],
                bass: ["Reese", "Synth Bass", "Sub Bass", "Acid", "Wobble", "FM Bass"],
                melodic: ["Strings", "Piano", "Organ Stab", "Brass Stab", "Chord Stab", "Rhodes", "Bright Pad", "Flute"],
                fx: ["Riser", "Impact", "Reverse Swell", "Downlifter", "Noise Riser"], vox: ["Hey", "Yeah", "Ho"] },
            { name: "Electro", fam: "machine", key: 58,
                percs: ["Cowbell", "Clave", "Rim", "Laser Perc", "Zap Perc", "Blip", "Shaker", "Metal Hit"],
                bass: ["Synth Bass", "FM Bass", "808 Punch", "Acid", "Sub Bass", "808 Long"],
                melodic: ["Saw Lead", "Square Lead", "Chord Stab", "Arp Pluck", "Bright Pad", "Hoover Lead", "Glass Keys", "Chip Lead"],
                fx: ["Zap", "Riser", "Sweep", "Impact", "Downlifter"], vox: ["Hey", "Uh", "Yeah"] },
            { name: "Memphis Rap", fam: "trap", key: 55, post: { dust: 0.035, crush: 10, lp: 7500 },
                kicks: ["Dusty", "Boom", "Punch", "Knock", "Long", "Vinyl", "Sub", "Hard", "Round", "Tight"],
                percs: ["Cowbell", "Rim", "Snap", "Shaker", "Vinyl Tick", "Knock", "Clave", "Woodblock"],
                bass: ["808 Long", "808 Punch", "808 Distorted", "Sub Bass", "808 Slide", "FM Bass"],
                melodic: [["Tape Piano", "Piano", { crush: 9 }], "Dark Pad", "Choir", "Bell", "Organ Stab", "Strings", "Flute", "Tape Keys"],
                fx: ["Impact", "Reverse Swell", "Downlifter", "Sub Drop", "Texture"], vox: ["Uh", "Ay", "Ho"] },
        ];
        // ---------------------------------------------- build
        const kits = [];
        const added = (path, gen, params, extra) => {
            flAdd(path, gen, params, extra);
            return flCatalog[flCatalog.length - 1].key;
        };
        const recipe = (entry, fallbackF) => {
            const [shown, name, mods] = Array.isArray(entry) ? entry : [entry, entry, {}];
            const fn = BASS[name] || MELODIC[name];
            if (!fn)
                throw new Error("Sound Library 3: no recipe " + name);
            return { shown, made: fn(Object.assign({ f: fallbackF }, mods || {})) };
        };
        for (const g of GENRES) {
            const fam = FAM[g.fam];
            const base = PK + "/" + g.name;
            const prefix = g.name.replace(/ & /g, " ").replace(/[^A-Za-z0-9 ]/g, "");
            const post = g.post || {};
            const mods = g.mods || {};
            const designed = (part) => merge(merge(fam[part], post), mods[part] || {});
            let index = 0;
            const seed = (kind) => "lib3/" + g.name + "/" + kind + "/" + (index++);
            const made = { kicks: [], snares: [], claps: [], hats: [], ohats: [], toms: [], percs: [], cymbals: [], bass: [] };
            (g.kicks || fam.kicks).forEach((ch, i) => made.kicks.push(added(base + "/Kicks/" + prefix + " Kick " + ch + " " + pad2(i + 1), "drum2", jitter(applyCharacter(designed("kick"), KICK[ch] || {}), seed("k"), 0.06))));
            (g.snares || fam.snares).forEach((ch, i) => made.snares.push(added(base + "/Snares/" + prefix + " Snare " + ch + " " + pad2(i + 1), "drum2", jitter(applyCharacter(designed("snare"), SNARE[ch] || {}), seed("s"), 0.06))));
            (g.claps || fam.claps).forEach((ch, i) => made.claps.push(added(base + "/Claps/" + prefix + " Clap " + ch + " " + pad2(i + 1), "clap2", jitter(applyCharacter(Object.assign({ spacing: 0.011, tail: 0.13, len: 0.6 }, designed("clap")), CLAP[ch] || {}), seed("c"), 0.05))));
            (g.hats || fam.hats).forEach((ch, i) => made.hats.push(added(base + "/Hats/" + prefix + " Hat " + ch + " " + pad2(i + 1), "hat2", jitter(applyCharacter(designed("hat"), HAT[ch] || {}), seed("h"), 0.05))));
            (g.ohats || fam.ohats).forEach((ch, i) => made.ohats.push(added(base + "/Open Hats/" + prefix + " Open Hat " + ch + " " + pad2(i + 1), "hat2", jitter(applyCharacter(designed("ohat"), OHAT[ch] || {}), seed("o"), 0.05))));
            ["Low", "Mid", "High"].forEach((name, i) => {
                const t = designed("tom");
                const k = [0.72, 1, 1.38][i];
                t.body.start *= k;
                t.body.end *= k;
                made.toms.push(added(base + "/Toms/" + prefix + " Tom " + name, "drum2", jitter(t, seed("t"), 0.03)));
            });
            g.percs.forEach((name, i) => {
                const [gen, params] = PERC[name](1 + (i % 3 - 1) * 0.06);
                // very short clicks keep their own sound (crushing would erase them)
                const short = (params.len || 1) < 0.1;
                const p = (gen == "drum2" || gen == "hat2") && !short ? merge(params, { crush: post.crush, dust: post.dust, lp: post.lp }) : params;
                for (const key of ["crush", "dust", "lp"])
                    if (p[key] == undefined)
                        delete p[key];
                made.percs.push(added(base + "/Percussion/" + prefix + " " + name + " " + pad2(i + 1), gen, jitter(p, seed("p"), 0.03)));
            });
            const cymbalPost = {};
            for (const key of ["crush", "lp", "room"])
                if (post[key] != undefined || fam[key] != undefined)
                    cymbalPost[key] = post[key];
            const longer = g.fam == "acoustic" || g.fam == "soft" ? 1.3 : 1;
            made.cymbals.push(added(base + "/Cymbals/" + prefix + " Crash", "hat2", Object.assign({ f: 180 + (g.key - 55) * 6, ratios: [1, 1.48, 1.8, 2.54, 2.63, 3.9], decay: 1.2 * longer, fastDecay: 0.04, bp: 6500, q: 0.5, hp: 3800, noise: 0.6, len: 2.6 * longer, sizzle: 0.2, ringMod: true, crush: g.fam == "digital" ? 7 : undefined }, cymbalPost)));
            made.cymbals.push(added(base + "/Cymbals/" + prefix + " Ride", "tones", { partials: [[3000 + (g.key - 50) * 40, 0.6, 1.3 * longer], [4850 + (g.key - 50) * 60, 0.5, 0.9 * longer], [7100, 0.35, 0.6], [9500, 0.25, 0.4]], click: 0.2, len: 2.0 * longer }));
            made.cymbals.push(added(base + "/Cymbals/" + prefix + " " + (g.fam == "acoustic" ? "China" : "Splash"), "hat2", Object.assign({ f: 420 + (g.key - 55) * 8, ratios: [1, 1.59, 2.14, 2.3, 2.65, 2.92], decay: g.fam == "acoustic" ? 0.9 : 0.55, bp: 5000, q: 0.6, hp: 2500, noise: 0.5, len: 1.4, ringMod: true, sizzle: 0.3, crush: g.fam == "digital" ? 7 : undefined }, cymbalPost)));
            for (const c of made.cymbals) {
                const item = flCatalog.find(x => x.key == c);
                if (item && item.params)
                    for (const key of Object.keys(item.params))
                        if (item.params[key] === undefined)
                            delete item.params[key];
            }
            g.bass.forEach((entry, i) => {
                const { shown, made: [gen, params, extra] } = recipe(entry, hz(36));
                made.bass.push(added(base + "/Bass/" + prefix + " " + shown + " " + pad2(i + 1), gen, jitter(params, seed("b"), 0.04), Object.assign({ rootKey: 36 }, extra || {})));
            });
            g.melodic.forEach((entry, i) => {
                const { shown, made: [gen, params, extra] } = recipe(entry, hz(60));
                added(base + "/Melodic/" + prefix + " " + shown + " " + pad2(i + 1), gen, jitter(params, seed("m"), 0.03), Object.assign({ rootKey: 60 }, extra || {}));
            });
            g.fx.forEach((name, i) => {
                const [gen, params] = FXR[name]({});
                added(base + "/FX/" + prefix + " " + name + " " + pad2(i + 1), gen, jitter(params, seed("f"), 0.08));
            });
            g.vox.forEach((name, i) => {
                const [gen, params] = VOX[name]({ f: hz(g.key + 7) });
                added(base + "/Vocal Chops/" + prefix + " Vox " + name + " " + pad2(i + 1), gen, params, { rootKey: g.key + 7 });
            });
            // Two kits in the FPC pad order (kick, snare, clap, hat, open hat, then toms, percs and a cymbal).
            const low = made.bass.find(k => /808/.test(k)) || made.kicks[1];
            kits.push({ name: g.name + " Kit", genre: g.name, pads: [[made.kicks[0], 0], [made.snares[0], 0], [made.claps[0], 0], [made.hats[0], 1], [made.ohats[0], 1], [made.toms[0], 0], [made.toms[2], 0], [made.percs[0], 0], [made.percs[1], 0], [made.percs[2], 0], [made.cymbals[0], 0], [low, 0]] });
            kits.push({ name: g.name + " Kit 2", genre: g.name, pads: [[made.kicks[3], 0], [made.snares[4], 0], [made.claps[2], 0], [made.hats[3], 1], [made.ohats[2], 1], [made.toms[1], 0], [made.percs[3], 0], [made.percs[4], 0], [made.percs[5], 0], [made.hats[5], 1], [made.cymbals[1], 0], [made.kicks[6], 0]] });
        }
        // Kits for the Sound Library 2 genres that had none.
        const existing = new Set(FLSoundFactory.getKits().map(k => k.name));
        const folders = new Map();
        for (const item of flCatalog) {
            const m = /^Packs\/([^/]+)\/(Kicks|Snares|Claps|Hats|Open Hats|Percussion|Cymbals|Bass)\//.exec(item.path);
            if (!m)
                continue;
            if (!folders.has(m[1]))
                folders.set(m[1], {});
            const f = folders.get(m[1]);
            (f[m[2]] = f[m[2]] || []).push(item.key);
        }
        const lib3 = new Set(GENRES.map(g => g.name));
        for (const [genre, f] of folders) {
            if (lib3.has(genre) || !f.Kicks || !f.Snares || !f.Hats)
                continue;
            const name = genre + " Kit";
            if (existing.has(name))
                continue;
            const perc = f.Percussion || [];
            const claps = f.Claps || f.Snares;
            const open = f["Open Hats"] || f.Hats;
            const low = (f.Bass || []).find(k => /808/.test(k)) || f.Kicks[1] || f.Kicks[0];
            kits.push({ name, genre, pads: [[f.Kicks[0], 0], [f.Snares[0], 0], [claps[0], 0], [f.Hats[0], 1], [open[0], 1], [perc[0] || f.Kicks[2], 0], [perc[1] || f.Snares[1], 0], [perc[2] || f.Hats[1], 0], [perc[3] || f.Kicks[3], 0], [perc[4] || f.Snares[2], 0], [(f.Cymbals || f.Hats)[0], 0], [low, 0]] });
        }
        for (const kit of kits)
            if (!existing.has(kit.name)) {
                FLSoundFactory.getKits().push({ name: kit.name, pads: kit.pads, genre: kit.genre });
                existing.add(kit.name);
            }
        // FPC presets for the new kits, in two menu groups of at most 64.
        const names = kits.map(k => k.name).sort((a, b) => a.localeCompare(b));
        const half = Math.ceil(names.length / 2);
        const groups = [["Genre Drum Kits " + names[0][0] + "-" + names[half - 1][0], names.slice(0, half)], ["Genre Drum Kits " + names[half][0] + "-" + names[names.length - 1][0], names.slice(half)]];
        for (const [title, list] of groups) {
            const category = { name: title, presets: toNameMap(list.slice(0, 64).map(kit => ({ name: "FPC: " + kit, isNoise: true, settings: { "type": "FPC", "eqFilter": [], "effects": [], "transition": "normal", "fadeInSeconds": 0, "fadeOutTicks": 6, "chord": "simultaneous", "envelopes": [], "fl": { "fpc": { "kit": kit } } } }))) };
            category.index = EditorConfig.presetCategories.length;
            EditorConfig.presetCategories.push(category);
            EditorConfig.presetCategories.dictionary[category.name] = category;
        }
        FLPackKit.lib3 = { genres: GENRES.map(g => g.name), kits: names };
    }
