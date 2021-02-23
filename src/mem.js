const Mem = function (nes, cpu) {

    var mem = this;

    // =============== //   Basic Functions //

    this.Reset = function () {
        // Reset all memory pies to 0
        this.vram.fill (0);
        this.wram.fill (0); // Turn this off for random ram emulation ig ?!?!
        this.cartram.fill (0);
        this.oam.fill (0);
        this.ioreg.fill (0);
        this.hram.fill (0);
        cpu.ienable.Write (0);
        
        // Initialize unused bits in all io registers
        for (var i = 0; i < this.ioreg.length; i ++) {
            var ioonwrite = this.ioonwrite [i];
            if (ioonwrite && i !== 0x46) // Don't do a dma pls TwT
                ioonwrite (0);
        }

        // this.ioreg [0x44] = 144; // (Stub)

        // Reset mbc properties
        this.rombank = 1;
        this.rambank = 1;

        this.extrarombits = 0;

        this.maxrombanks = 0;
        this.maxrambanks = 0;
    };

    this.Error = function (msg) {
        alert (msg);
        throw msg;
    };

    // =============== //   Memory Elements //

    // Bootrom - 0x0000 - 0x00ff
    this.bootrom = new Uint8Array ([49,254,255,175,33,255,159,50,203,124,32,251,33,38,255,14,17,62,128,50,226,12,62,243,226,50,62,119,119,62,252,224,71,17,4,1,33,16,128,26,205,149,0,205,150,0,19,123,254,52,32,243,17,216,0,6,8,26,19,34,35,5,32,249,62,25,234,16,153,33,47,153,14,12,61,40,8,50,13,32,249,46,15,24,243,103,62,100,87,224,66,62,145,224,64,4,30,2,14,12,240,68,254,144,32,250,13,32,247,29,32,242,14,19,36,124,30,131,254,98,40,6,30,193,254,100,32,6,123,226,12,62,135,226,240,66,144,224,66,21,32,210,5,32,79,22,32,24,203,79,6,4,197,203,17,23,193,203,17,23,5,32,245,34,35,34,35,201,206,237,102,102,204,13,0,11,3,115,0,131,0,12,0,13,0,8,17,31,136,137,0,14,220,204,110,230,221,221,217,153,187,187,103,99,110,14,236,204,221,220,153,159,187,185,51,62,60,66,185,165,185,165,66,60,33,4,1,17,168,0,26,19,190,32,254,35,125,254,52,32,245,6,25,120,134,35,5,32,251,134,32,254,62,1,224,80]);

    // Cartrom - 0x0000 - 0x8000 (last 0x4000 switchable)
    this.cartrom = new Uint8Array (0x8000);
    this.romname = '';

    // Video - 0x8000 - 0x9fff
    this.vram = new Uint8Array (0x2000); // 8KB of video ram

    // Cartram - 0xa000 - 0xbfff
    this.cartram = new Uint8Array (0x2000); // 8kb switchable ram found in cart
    // Work ram - 0xc000 - 0xdfff
    this.wram = new Uint8Array (0x2000); // 8KB of ram to work with

    // (mirror memory of 0xc000) - 0xe000 - 0xfdff

    // OAM - 0xfe00 - 0xfe9f
    this.oam = new Uint8Array (0xa0);

    // (unusable memory) - 0xfea0 - 0xfeff

    // IO registers - 0xff00 - 0xff7f
    this.ioreg = new Uint8Array (0x80);

    // high ram - 0xff80 - 0xffff
    this.hram = new Uint8Array (0x80);

    // interrupt enable register - 0xffff
    this.iereg = 0;

    // =============== //   IO Registers //
    /* TODO
     * rework this so theres an object containing all mapped registers ?
     * make a function that does stuff on write, but its a switch statement 
     */

    this.ioonwrite = {
        // Joypad
        [0x00]: function (val) {
            nes.joypad.selectbutt = !(val & 0b00100000);
            nes.joypad.selectdpad = !(val & 0b00010000);
            
            nes.joypad.PollJoypad ();

            mem.ioreg [0x00] &= 0x0f; // Pressed bits are RO
            mem.ioreg [0x00] |= (val & 0xf0) | 0b00000000; // Top bits dont exist
        },

        // Serial Ports - used by test roms for output
        [0x01]: function (val) {
            mem.ioreg [0x01] = val;
            // console.log ('01: ' + val.toString (16));
        },
        [0x02]: function (val) {
            mem.ioreg [0x02] = val;
            // console.log ('02: ' + val.toString (16));
        },

        // Div timer - incs every 256 cycles (TODO)
        [0x04]: function (val) {
            cpu.div = mem.ioreg [0x04] = 0; // Div is reset on write
        },
        // Tima timer - incs at a variable rate
        [0x05]: function (val) {
            cpu.tima = mem.ioreg [0x05] = val;
        },

        // Tima module
        [0x06]: function (val) {
            cpu.timamod = mem.ioreg [0x06] = val;
        },
        // TAC
        [0x07]: function (val) {
            // Input clock select
            var ii = val & 3;

            if (ii === 0) {
                cpu.timarate = cpu.cyclespersec / 1024;
            }
            else {
                // 01   - 16 cycles
                // 10   - 64 cycles
                // 11   - 256 cycles
                cpu.timarate = (4 << (ii * 2));
            }

            cpu.timaenable = (val & 0b00000100) ? true : false; // Bit 2

            mem.ioreg [0x07] // Set tac ioreg
                = val | 0b11111000; // Mask out unused bits
        },

        // IF
        [0x0f]: function (val) {
            // Set interrupt flags
            cpu.iflag.vblank      = (val & 0b00000001) ? true : false; // Bit 0
            cpu.iflag.lcd_stat    = (val & 0b00000010) ? true : false; // Bit 1
            cpu.iflag.timer       = (val & 0b00000100) ? true : false; // Bit 2
            cpu.iflag.serial      = (val & 0b00001000) ? true : false; // Bit 3
            cpu.iflag.joypad      = (val & 0b00010000) ? true : false; // Bit 4

            // Write to 0xff0f
            mem.ioreg [0x0f] = val | 0b11100000; // Unused bits always read 1
        },

        // LCDC
        [0x40]: function (val) {
            var bits = [];
            var lcdc = nes.ppu.lcdc;

            for (var i = 0; i < 8; i ++) {
                bits [i] = (val & (1 << i)) ? true : false;
            }

            var lcdWasOn = lcdc.lcd_enabled;

            lcdc.bg_enabled             = bits [0];
            lcdc.sprites_enabled        = bits [1];
            lcdc.tall_sprites           = bits [2];
            lcdc.bg_tilemap_alt         = bits [3];
            lcdc.signed_addressing      = bits [4];
            lcdc.window_enabled         = bits [5];
            lcdc.window_tilemap_alt     = bits [6];
            lcdc.lcd_enabled            = bits [7];

            // Handle lcd enable changes
            if (lcdWasOn !== lcdc.lcd_enabled) {
                if (lcdc.lcd_enabled)
                    nes.ppu.TurnLcdOn ();
                else
                    nes.ppu.TurnLcdOff ();
            }

            mem.ioreg [0x40] = val;
        },

        // LCDC status
        [0x41]: function (val) {
            var ppu = nes.ppu;

            var preStat = mem.ioreg [0x41] & 0b01111000;

            ppu.stat.coin_irq_on   = (val & 0b01000000) ? true : false; // Bit 6
            ppu.stat.mode2_irq_on  = (val & 0b00100000) ? true : false; // Bit 5
            ppu.stat.mode1_irq_on  = (val & 0b00010000) ? true : false; // Bit 4
            ppu.stat.mode0_irq_on  = (val & 0b00001000) ? true : false; // Bit 3

            // Update stat signal on a change
            if (val & 0b01111000 !== preStat)
                ppu.UpdateStatSignal ();

            // write to 0xff41
            mem.ioreg [0x41] &= 0b00000111; // Last 3 bits are RO
            mem.ioreg [0x41] |= (val & 0b11111000) | 0b10000000; // Top bit dont exist
        },

        // BG scroll y
        [0x42]: function (val) {
            nes.ppu.scrolly = mem.ioreg [0x42] = val;
        },
        // BG scroll x
        [0x43]: function (val) {
            nes.ppu.scrollx = mem.ioreg [0x43] = val;
        },

        // LY
        [0x44]: function (val) {
            // Read only ...
        },

        // LYC
        [0x45]: function (val) {
            nes.ppu.lyc = mem.ioreg [0x45] = val;
            nes.ppu.CheckCoincidence ();
        },

        // DMA transfer - TODO: add the propert
        [0x46]: function (val) {
            var dest = val << 8; // 0xXX00 - 0xXX9F

            for (var i = 0; i < 0xa0; i ++) {
                // Transfer data to vram
                var data = cpu.readByte (dest | i);
                cpu.writeByte (0xfe00 | i, data);
            }

            mem.ioreg [0x46] = val;

            cpu.cycles += 160; // DMA takes 160 t cycles
        },

        // Pallete shades
        [0x47]: function (val) {
            var palshades = nes.ppu.palshades;

            for (var i = 0; i < 4; i ++) {
                // Get specific crumbs from val
                // A 'crumb' is a 2 bit number, i coined that :D
                palshades [i] = (val >> (i << 1)) & 3;
            }

            mem.ioreg [0x47] = val;
        },

        // Obj 0 - 1 shades
        [0x48]: function (val) {
            var objshades = nes.ppu.objshades [0];

            for (var i = 0; i < 4; i ++) {
                // Get specific crumbs from val
                // A 'crumb' is a 2 bit number, i coined that :D
                objshades [i] = (val >> (i << 1)) & 3;
            }

            mem.ioreg [0x48] = val;
        },
        [0x49]: function (val) {
            var objshades = nes.ppu.objshades [1];

            for (var i = 0; i < 4; i ++) {
                // Get specific crumbs from val
                // A 'crumb' is a 2 bit number, i coined that :D
                objshades [i] = (val >> (i << 1)) & 3;
            }

            mem.ioreg [0x49] = val;
        },

        // Disable bootrom
        [0x50]: function (val) {
            // If unmounted, set to read only !
            if (!cpu.bootromAtm)
                return;

            if (val & 1) {
                cpu.bootromAtm = false;
                console.log ('bootrom disabled.');
            }

            mem.ioreg [0x50] = val | 0b11111110; // Only 1 bit
        },
    };

    // =============== //   Loading and Resetting //

    this.LoadRom = function (rom) {
        if (typeof rom !== 'object')
            return this.Error ('this is not a rom !');

        rom = new Uint8Array (rom);

        this.GetRomProps (rom);
        this.cartrom = rom;

        cpu.hasrom = true;
    };

    this.GetRomProps = function (rom) {
        // Rom name //
        this.romname = '';
        for (var i = 0x134; i < 0x13f; i ++) {
            this.romname += String.fromCharCode (rom [i]);
        }
        document.title = 'Pollen Boy: ' + this.romname;

        // GBC only mode //
        if (rom [0x143] === 0xc0)
            this.Error ('rom works only on gameboy color !');

        // Check MBC //
        switch (rom [0x147]) {
            // No MBC + ram
            case 0x8:
            case 0x9: {
                this.ramenabled = true;
            }
            // No MBC
            case 0x0: {
                this.mbc = 0;
                break;
            }

            // MBC 1 + ram
            case 0x3:
            case 0x2: {
                this.ramenabled = true;
            }
            // MBC 1
            case 0x1: {
                this.mbc = 1;
                break;
            }

            // MBC 2
            case 0x6:
            case 0x5: {
                this.mbc = 2;
                break;
            }

            // MBC 3 + ram
            case 0x13:
            case 0x12:
            case 0x10: {
                this.ramenabled = true;
            }
            // MBC 3
            case 0x11:
            case 0xf: {
                this.mbc = 3;
                break;
            }

            // MBC 5 + ram
            case 0x1e:
            case 0x1d:
            case 0x1b:
            case 0x1a: {
                this.ramenabled = true;
            }
            // MBC 5
            case 0x1c:
            case 0x19: {
                this.mbc = 5;
                break;
            }

            default: {
                this.Error ('unknown rom type !');
            }
        }

        // Max rom banks
        var romsize = rom [0x148];

        if (romsize > 8) {
            if (romsize === 0x54)
                this.maxrombanks = 96;
            else if (this.romsize === 0x53)
                this.maxrombanks = 80;
            else if (this.romsize === 0x52)
                this.maxrombanks = 72;
            else
                this.Error ('invalid rom size !');
        }
        else {
            this.rombanks = 2 << romsize;
        }

        // Max ram banks
        var ramsize = rom [0x149];

        if (ramsize > 0 && ramsize < 5) {
            this.maxrambanks = Math.floor ((1 << (ramsize * 2 - 1)) / 8); // ba3ref hal formula araf skot
        }
        else {
            if (ramsize === 0x5)
                this.maxrambanks = 8;
            else if (ramsize === 0x0)
                this.maxrambanks = 0;
            else
                this.Error ('invalid ram size !');
        }
    };

    // =============== //   MBC Controllers //

    // MBC properties
    this.mbc = 0;

    this.rombank = 1;
    this.rambank = 1;

    this.extrarombits = 0;

    this.ramenabled = false;

    this.maxrombanks = 0;
    this.maxrambanks = 0;

    this.mbcRead = {
        // No MBC
        0: function (addr) {
            return mem.cartrom [addr];
        },
        // MBC 1
        1: function (addr) {
            return mem.cartrom [
                (mem.rombank * 0x4000)
                + (addr & 0x3fff)
            ];
        }
    };

    this.mbcWrite = {
        // No MBC
        0: function (addr, val) {
            // u are a stinky poof
        },
        // MBC 1
        1: function (addr, val) {
            // EXTRA RAM ENABLE //
            if (addr < 0x2000) {
                mem.ramenabled = (val & 0xf) === 0x0a; // Value with 0xa enables
                return val;
            }
            // ROM BANK NUMBER //
            if (addr < 0x4000) {
                mem.rombank = val & 0b00011111; // Discard first 3 bits

                if (mem.maxrambanks < 4)
                    mem.rombank |= mem.extrarombits << 5;

                mem.rombank += (
                    mem.rombank === 0
                    || mem.rombank === 0x20
                    || mem.rombank === 0x40 
                    || mem.rombank === 0x60
                );

                return val;
            }
            // RAM BANK NUMBER or EXTRA ROM BANK BITS //
            if (addr < 0x6000) {
                var crumb = val & 3;

                if (mem.maxrombanks >= 64)
                    mem.extrarombits = crumb;
                else
                    mem.rambank = crumb;

                return val;
            }
        }
    };

};