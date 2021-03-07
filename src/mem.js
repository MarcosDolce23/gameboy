const Mem = function (nes, cpu) {

    var mem = this;

    // =============== //   Basic Functions //

    // =============== //   Memory Elements //

    // Bootrom - 0x0000 - 0x00ff
    // Credits to Optix ! https://github.com/Hacktix/Bootix
    this.bootrom = new Uint8Array ([49,254,255,33,0,128,175,34,124,254,160,32,249,14,17,33,38,255,62,128,50,226,12,62,243,50,226,12,62,119,50,226,14,17,62,128,226,12,62,243,226,17,4,1,33,16,128,14,48,26,205,194,0,26,203,55,205,194,0,19,13,32,242,17,227,0,6,8,26,19,34,35,5,32,249,33,4,153,1,12,1,205,187,0,62,25,119,33,36,153,14,12,205,187,0,62,145,224,64,6,16,17,235,0,120,224,67,5,123,254,239,40,4,26,224,71,19,14,30,205,177,0,175,144,224,67,5,14,30,205,177,0,175,176,32,224,224,67,62,131,205,169,0,14,30,205,177,0,62,193,205,169,0,17,244,1,240,68,254,144,32,250,27,122,179,32,245,24,80,14,19,226,12,62,135,226,201,240,68,254,144,32,250,13,32,247,201,120,34,4,13,32,250,201,230,240,71,175,203,120,40,2,246,192,203,112,40,2,246,48,203,104,40,2,246,12,203,96,40,2,246,3,34,35,34,35,201,60,66,185,165,185,165,66,60,0,84,168,252,66,79,79,84,73,88,46,68,77,71,0,0,0,62,1,224,80]);

    // Cartrom - 0x0000 - 0x8000 (last 0x4000 switchable)
    this.cartrom = new Uint8Array (0x8000);
    this.romName = '';

    // Video - 0x8000 - 0x9fff
    this.vram = new Uint8Array (0x2000); // 8KB of video ram

    // Cartram - 0xa000 - 0xbfff
    this.cartram = new Uint8Array (0x2000); // variable amt of (maybe bankable) ram found in cart
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
            mem.ioreg [0x00] |= (val & 0xf0) | 0b11000000; // Top bits dont exist
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

        // NR 50 - i need this so pokemon blue dont freeze
        [0x24]: function (val) {
            mem.ioreg [0x24] = val;
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

        // DMA transfer - TODO: add the proper timings ?? nah
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

        // Window Y - Window X
        [0x4a]: function (val) {
            nes.ppu.wy = mem.ioreg [0x4a] = val;
        },
        [0x4b]: function (val) {
            nes.ppu.wx = val - 7; // 7px offset
            mem.ioreg [0x4b] = val;
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

    // =============== //   Basic Functions //

    this.Reset = function () {
        // Reset all memory pies to 0
        this.vram.fill (0);
        this.wram.fill (0); // Turn this off for random ram emulation ig ?!?!
        //this.cartram.fill (0);
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
        this.rombank = this.defaultRombank;
        this.rambank = this.defaultRambank;

        this.extrarombits = 0;
        this.rtcreg = 0;
    };

    // =============== //   Loading and Resetting //

    this.LoadRom = function (rom) {
        if (typeof rom !== 'object')
            throw 'this is not a rom !';

        rom = new Uint8Array (rom);

        this.GetRomProps (rom);

        // If no bads should have occured, we've loaded a rom !
        this.cartrom = rom;
        cpu.hasRom = true;
    };

    this.GetRomProps = function (rom) {
        // ---- ROM NAME ---- //
        this.romName = '';
        // Convert bytes to characters
        for (var i = 0x134; i < 0x13f; i ++) {
            this.romName += String.fromCharCode (rom [i]);
        }

        document.title = 'Pollen Boy: ' + this.romName;

        // ---- CGB MODE ---- //
        if (rom [0x143] === 0xc0)
            throw 'rom is gb color only :(';

        // ---- ROM SIZE ---- //
        var romSize = rom [0x148];

        // Dunno if these sizes are real ??
        if (romSize > 8) {
            if (romSize === 0x52) {
                this.maxrombanks = 72;
            }
            else if (romSize === 0x53) {
                this.maxrombanks = 80;
            }
            else if (romSize === 0x54) {
                this.maxrombanks = 96;
            }
            else
                throw 'invalid rom !';
        }
        // Official sizes B)
        else {
            this.maxrombanks = 2 << romSize;
        }

        // ---- RAM SIZE ---- //
        var ramSize = rom [0x149];

        if (ramSize > 0 && ramSize < 5) {
            this.maxrambanks = Math.floor ((1 << (ramSize * 2 - 1)) / 8); // idk how i even came up with dis
        }
        else {
            if (ramSize === 0x5)
                this.maxrambanks = 8;
            else if (ramSize === 0x0)
                this.maxrambanks = 0;
            else
                throw 'invalid rom !';
        }

        this.cartram = new Uint8Array (this.maxrambanks * 0x2000);

        // ---- MBC TYPE ---- //
        this.defaultRombank =
        this.defaultRambank = 0;

        this.ramenabled = false;

        this.evenhasram = false;
        this.hastimer = false;
        this.hasbatterysave = false;

        this.hasrombanks =
        this.hasrambanks = false;

        switch (rom [0x147]) {
            // NO MBC
            case 0x9:
                this.hasbatterysave = true;
            case 0x8:
                this.evenhasram = true;
                this.ramenabled = true;
            case 0x0:
                this.mbc = 0;
                break;

            // MBC 1
            case 0x3:
                this.hasbatterysave = true;
            case 0x2:
                this.evenhasram = true;
            case 0x1:
                this.mbc = 1;
                this.defaultRombank = 1;
                this.defaultRambank = 0;
                break;

            // MBC 3 (with timer)
            case 0x10:
                this.evenhasram = true;
            case 0xf:
                this.hastimer = true;

                this.mbc = 3;
                this.defaultRombank = 1;
                this.defaultRambank = 0;
                break;

            // MBC 3 (no timer)
            case 0x13:
                this.hasbatterysave = true;
            case 0x12:
                this.evenhasram = true;
            case 0x11:
                this.mbc = 3;
                this.defaultRombank = 1;
                this.defaultRambank = 0;
                break;

            default:
                throw 'unsupported rom mbc !';
        }
    };

    // Loading save data
    this.GetSramArray = function () {
        if (!this.evenhasram)
            throw 'no ram available !';
        if (!this.hasbatterysave)
            throw 'ram is not save data !';

        // Export save data
        var data = [];
        for (var i = 0; i < this.cartram.length; i ++)
            data [i] = this.cartram [i];

        return data;
    };
 
    // =============== //   MBC Controllers //

    // MBC properties
    this.mbc = 0;

    // Rom banks
    this.defaultRombank = 0
    this.defaultRambank = 0;

    this.rombank = 0;
    this.rambank = 0;
    this.rtcreg = 0;
    this.extrarombits = 0;

    // Other properties
    this.ramenabled = false;

    this.maxrombanks = 0; 
    this.maxrambanks = 0;

    this.hasrombanks = false;
    this.hasrambanks = false;

    // Stuff that comes with the cartridge
    this.evenhasram = false;
    this.hasbatterysave = false;
    this.hastimer = false;

    this.mbcRead = {
        // No MBC
        0: function (addr) {
            return mem.cartrom [addr];
        }
    };

    this.mbcRamRead = {
        // No MBC
        0: function (addr) {
            return mem.cartram [addr];
        }
    };

    this.mbcWrite = {
        // No MBC
        0: function (addr, val) {
            // u are a stinky poof
        }
    };

    this.mbcRamWrite = {
        // No MBC
        0: function (addr, val) {
            return mem.cartram [addr] = val;
        }
    };

    // =============== //   MBC 1 //

    // Reads
    this.mbcRead [1] = function (addr) {
        return mem.cartrom [
            (mem.rombank * 0x4000)
            + (addr & 0x3fff)
        ];
    };

    this.mbcRamRead [1] = function (addr) {
        if (mem.maxrambanks >= 4)
            return mem.cartram [
                (mem.rambank * 0x2000)
                + (addr & 0x1fff)
            ];
        else
            return mem.cartram [addr];
    };

    // Writes
    this.mbcWrite [1] = function (addr, val) {
        // EXTRA RAM ENABLE //
        if (addr < 0x2000) {
            var bank = val & 0xf;
            
            if (bank === 0xa)
                mem.ramenabled = true;
            else if (bank === 0x0)
                mem.ramenabled = false;

            return val;
        }
        // ROM BANK NUMBER //
        if (addr < 0x4000) {
            mem.rombank = val & 0b00011111; // Discard last 3 bits

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

            mem.rambank = crumb;

            return val;
        }
    };

    this.mbcRamWrite [1] = function (addr, val) {
        if (mem.maxrambanks >= 4)
            mem.cartram [
                (mem.rambank * 0x2000)
                + (addr & 0x1fff)
            ] = val;
        else
            mem.cartram [addr] = val;

        return val;
    };

    // =============== //   MBC 3 //

    // Reads
    this.mbcRead [3] = function (addr) {
        return mem.cartrom [
            (mem.rombank * 0x4000)
            + (addr & 0x3fff)
        ];
    };

    this.mbcRamRead [3] = function (addr) {
        if (mem.maxrambanks >= 4)
            return mem.cartram [
                (mem.rambank * 0x2000)
                + (addr & 0x1fff)
            ];
        else
            return mem.cartram [addr];
    };

    // Writes
    this.mbcWrite [3] = function (addr, val) {
        // EXTRA RAM ENABLE //
        if (addr < 0x2000) {
            var bank = val & 0x0f;

            if (val === 0xa)
                mem.ramenabled = true;
            else if (val === 0)
                mem.ramenabled = false;

            return val;
        }

        // ROM BANK NUMBER //
        if (addr < 0x4000) {
            if (val > 0) {
                mem.rombank = val & 0b01111111; // Last bit is discarded
            }
            // We can't go to bank 0 bro !
            else
                mem.rombank = 1;

            return val;
        }

        // RAM BANK NUMBER or RTC REG SELECT //
        if (addr < 0x6000) {
            if (val < 0x4)
                mem.rambank = val;
            else if (val > 0x7 && val < 0xd)
                mem.rtcreg = val;

            return val;
        }

        // LATCH DATA CLOCK //
        if (addr < 0x8000) {


            return val;
        }

    };

    this.mbcRamWrite [3] = function (addr, val) {
        if (mem.maxrambanks >= 4)
            mem.cartram [
                (mem.rambank * 0x2000)
                + (addr & 0x1fff)
            ] = val;
        else
            mem.cartram [addr] = val;

        return val;
    };

};