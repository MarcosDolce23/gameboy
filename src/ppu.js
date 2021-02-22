const Ppu = function (nes) {

    var ppu = this;

    var cpu = nes.cpu;
    var mem = cpu.mem;

    // =============== //   Basic Elements //

    this.lcdc = {
        bg_enabled: false,
        sprites_enabled: false,
        tall_sprites: false,
        bg_tilemap_alt: false,
        signed_addressing: false,
        window_enabled: false,
        window_tilemap_alt: false,
        lcd_enabled: false
    };

    // LCDC status
    this.stat = {
        // Interrupt enables
        coin_irq_on: false,    // Bit 6
        mode2_irq_on: false,   // Bit 5
        mode1_irq_on: false,   // Bit 4
        mode0_irq_on: false,   // Bit 3

        // Flags
        coincidence: false, // Bit 2
        mode: 0            // Bits 1 - 0
    };

    // Flag setting methods
    this.SetCoincidence = function () {
        this.stat.coincidence = true;
        mem.ioreg [0x41] |= 0b00000100; // Set bit 6
    },
    this.ClearCoincidence = function () {
        this.stat.coincidence = false;
        mem.ioreg [0x41] &= ~0b00000100; // Clear bit 6
    },

    this.WriteMode = function (mode) {
        this.stat.mode = mode;
        this.UpdateStatSignal ();

        // Write mode to bits 1 - 0
        mem.ioreg [0x41] &= 0b11111100; // Clear last 2 bits, ready for setting
        mem.ioreg [0x41] |= mode; // Write mode to last 2 bits
    }

    // Palletes
    this.palshades = {
        0: 0,
        1: 0,
        2: 0,
        3: 0
    };

    this.objshades = {
        0: {
            0: 0,
            1: 0,
            2: 0,
            3: 0
        },
        1: {
            0: 0,
            1: 0,
            2: 0,
            3: 0
        },
    };

    // =============== //   Screen Elements //

    var gbwidth = 160; // 160
    var gbheight = 144; // 144

    this.pallete = {
        0: {
            r: 0xde, g: 0xc6, b: 0x9c // WHITE
        },
        1: {
            r: 0xa5, g: 0x5a, b: 0xff // LITE GRAY
        },
        2: {
            r: 0x94, g: 0x29, b: 0x94 // DARK GRAY
        },
        3: {
            r: 0x00, g: 0x39, b: 0x73 // BLACK
        }
    };

    // =============== //   Canvas Drawing //

    this.ctx = null;
    this.img = null;
    this.timeout = null;

    this.interval = 1000 / 59.7; // GB refresh rate

    this.ResetCtx = function (c) {
        this.ctx = nes.canvas.getContext ('2d');
        this.img = this.ctx.createImageData (gbwidth, gbheight);

        this.ClearImg ();
    };

    this.PutPixel = function (x, y, color) {
        var ind = (y * gbwidth + x) * 4;

        var img = this.img.data;
        var pal = this.pallete [color];

        img [ind] = pal.r;
        img [ind + 1] = pal.g;
        img [ind + 2] = pal.b;
        img [ind + 3] = 0xff; // Full opacity
    };

    this.RenderImg = function () {
        this.ctx.putImageData (this.img, 0, 0);
    };

    this.RenderLoop = function () {
        this.RenderImg ();

        // Handle callback
        setTimeout (() => {
            this.timeout = requestAnimationFrame (() => {
                ppu.RenderLoop ();
            });
        }, this.interval);
    };

    this.StopRendering = function () {
        cancelAnimationFrame (this.timeout);
    };

    this.ClearImg = function () {
        for (var x = 0; x < gbwidth; x ++)
            for (var y = 0; y < gbheight; y ++)
                this.PutPixel (x, y, 0);
    };

    // =============== //   Basic Functions //

    this.Reset = function () {
        this.ppuclocks = 0;
        this.statsignal = false;

        // Reset scanline positions
        this.lx =
        this.ly =
        this.subty =

        this.scrollx =
        this.scrolly = 0;

        // Reset lcdc stat flags
        this.ClearCoincidence ();
        this.WriteMode (0);
    };

    // LCD enable methods
    this.TurnLcdOff = function () {
        this.ppuclocks = 0;
        this.statsignal = false;

        this.WriteMode (0); // When LCD disabled, stat mode is 0
        this.ClearImg (); // Clear screen on frontend
    };

    this.TurnLcdOn = function () {
        // Reset LY to 0
        this.ly = 0;
        // Don't forget to check for dos concedenes =)
        this.CheckCoincidence ();
        
        this.WriteMode (2); // When LCD enabled again, mode 2
    };

    // =============== //   Scanlines //

    this.ppuclocks = 0;

    this.statsignal = false;

    // Mode lengths in t-cycles
    this.oamlength = 80;
    this.drawlength = 172;
    this.hblanklength = 204;
    this.scanlinelength = 456;

    // =============== //   Sprites //

    class BlankSprite {
        constructor () {
            this [0] =      // X
            this [1] =      // Y
            this [2] =      // Tile index
            this [3] = 0;   // Flags

            this.row = 0;
        };

        GetFlag (bit) {
            return (this [3] & (1 << bit)) ? true : false;
        }
    }

    this.spritePool = new Array (40); // An object pool with 40 blank sprites
    for (var i = 0; i < this.spritePool.length; i ++)
        this.spritePool [i] = new BlankSprite ();

    this.acceptedSprites = []; // The good boys which fit draw conditions go here :)
    this.maxSpritesScan = 10;

    this.SearchOam = function () {
        this.acceptedSprites.length = 0; // Clear buffer

        // Search sprite pool
        for (var i = 0; i < this.spritePool.length; i ++) {

            var sprite = this.spritePool [i];

            var ly = this.ly + 16;
            var spriteHeight = this.lcdc.tall_sprites ? 16 : 8;

            if (
                sprite [1] > 0                      // X > 0
                && ly >= sprite [0]                 // LY + 16 >= Y
                && ly < sprite [0] + spriteHeight   // LY + 16 < Y + height
            )
            {
                var accepted = this.acceptedSprites.push (sprite);

                if (accepted === this.maxSpritesScan)
                    break;
            }

        }
    };

    this.ResetSpriteRows = function () {
        for (var i = 0; i < this.spritePool.length; i ++)
            this.spritePool [i].row = 0; 
    };

    // The almighty scanline handler ...

    this.HandleScan = function (cycled) {
        // Do nothing if LCD is off
        if (!this.lcdc.lcd_enabled)
            return;

        this.ppuclocks += cycled;

        var prestat = this.statsignal; // Pre-statsignal
        var curr_mode = this.stat.mode;

        // ---- OAM MODE 2 ---- //
        if (curr_mode === 2) {

            if (this.ppuclocks >= this.oamlength) {
                // Mode 2 is over ...
                this.WriteMode (3);
                this.SearchOam ();

                this.ppuclocks -= this.oamlength;
            }

        }
        // ---- DRAW MODE 3 ---- //
        else if (curr_mode === 3) {

            // ... we're just imaginary plotting pixels dodododooo

            if (this.ppuclocks >= this.drawlength) {
                // Mode 3 is over ...
                this.WriteMode (0);
                this.RenderScan (); // Finally render on hblank :D

                this.ppuclocks -= this.drawlength;
            }

        }
        // ---- H-BLANK MODE 0 ---- //
        else if (curr_mode === 0) {

            // We're relaxin here ...

            if (this.ppuclocks >= this.hblanklength) {
                // Advance LY
                this.ly ++;

                this.CheckCoincidence ();
                mem.ioreg [0x44] = this.ly;

                // When entering vblank period ...
                if (this.ly === gbheight) {
                    cpu.iflag.SetVblank (); // Request vblank irq !
                    this.WriteMode (1);

                    this.RenderImg (); // Draw picture ! (in v-sync uwu)
                    this.ResetSpriteRows ();
                }
                else
                    this.WriteMode (2); // Reset

                this.ppuclocks -= this.hblanklength;
            }

        }
        // ---- V-BLANK MODE 1 ---- //
        else if (curr_mode === 1) {

            if (this.ppuclocks >= this.scanlinelength) {
                // Advance LY
                this.ly ++;

                // Check if out of vblank period ..
                if (this.ly === 154) {
                    this.ly = 0;
                    this.CheckCoincidence ();

                    this.WriteMode (2); // Reset
                }
                else {
                    this.CheckCoincidence ();
                    this.UpdateStatSignal ();
                }

                mem.ioreg [0x44] = this.ly;

                this.ppuclocks -= this.scanlinelength;
            }

        }
    };

    // Coincidence check function
    this.lyc = 0;
    this.CheckCoincidence = function () {
        // Yes !
        if (this.ly === this.lyc)
            this.SetCoincidence ();
        // No !
        else
            this.ClearCoincidence ();
    }

    // Update signal state
    this.UpdateStatSignal = function () {
        var presignal = this.statsignal;

        this.statsignal = 
            (this.stat.coin_irq_on && this.stat.coincidence)
            || (this.stat.mode2_irq_on && this.stat.mode === 2)
            || (this.stat.mode0_irq_on && this.stat.mode === 0)
            || (this.stat.mode1_irq_on && this.stat.mode === 1)

        if (!presignal && this.statsignal)
            cpu.iflag.SetLcdStat ();
    };

    // =============== //   Background Drawing //

    // Scanline positions
    this.lx = 
    this.ly = 0;

    // BG scroll positions
    this.scrollx =
    this.scrolly = 0;

    this.subty = 0; // Used to decide which row of tile to draw

    this.RenderScan = function () {
        // Ready up some stuff
        this.lx = 0;
        this.spritesThisScan = 0;

        var x = (this.lx + this.scrollx) & 0xff;
        var y = (this.ly + this.scrolly) & 0xff;

        this.subty = y & 7;

        // Calculate tile data and map bases
        var tiledatabase = 0x9000 - (this.lcdc.signed_addressing * 0x1000);
        var bgmapbase = 0x9800 + (this.lcdc.bg_tilemap_alt * 0x400);

        var mapindy = bgmapbase + (y >> 3) * 32; // (y / 8 * 32) Beginning of background tile map

        while (this.lx < gbwidth) {
            if (this.lcdc.bg_enabled) {

                // ----- BACKGROUND ----- //

                var mapind = mapindy + (x >> 3);    // (x / 8) Background tile map
                var patind = cpu.readByte (mapind); // Get tile index at map

                // Calculate tile data address

                if (!this.lcdc.signed_addressing)
                    patind = patind << 24 >> 24; // Complement tile index in 0x8800 mode

                var addr =
                    tiledatabase + (patind << 4)    // (tile index * 16) Each tile is 16 bytes
                    + (this.subty << 1);            // (subty * 2) Each line of a tile is 2 bytes

                // Get tile line data
                var lobyte = cpu.readByte (addr ++);
                var hibyte = cpu.readByte (addr);

                // Mix and draw current tile line pixel
                var bitmask = 1 << ((x ^ 7) & 7);
                var px = this.palshades [
                    ((hibyte & bitmask) ? 2 : 0)
                    | ((lobyte & bitmask) ? 1 : 0)
                ];
                this.PutPixel (this.lx, this.ly, px);

                // ----- WINDOW ----- //

            }
            else
                this.PutPixel (this.lx, this.ly, 0);

            // Next !
            this.lx ++;
            x ++;
            x &= 0xff;
        }

        // ----- SPRITES ----- //
        if (this.lcdc.sprites_enabled) {

            for (var i = 0; i < this.acceptedSprites.length; i ++) {
                var sprite = this.acceptedSprites [i];

                var realY = sprite [0] - 16;
                var realX = sprite [1] - 8;

                var subty = (realY + this.ly) & 7; // Used to decide which row of sprite to draw

                // Don't draw offscreen sprites
                if (realY + sprite.row >= gbheight)
                    continue;

                // Calculate address
                var addr =
                    0x8000 + (sprite [2] << 4)  // (0x8000 + [sprite index * 16])
                    + (sprite.row << 1);        // + (sub-tile-y * 2)

                // Get tile data
                var lobyte = cpu.readByte (addr ++);
                var hibyte = cpu.readByte (addr);

                // Get sprite flags
                var pallete = sprite.GetFlag (4) ? 1 : 0;   // Bit 4
                var xflip = sprite.GetFlag (5);             // Bit 5

                // Mix and draw all 8 pixels
                for (var ii = 0; ii < 8; ii ++) {
                    // Check for horizontal flip
                    var bitmask = xflip
                        ? 1 << (ii & 7)
                        : 1 << ((ii ^ 7) & 7);

                    // Get pixel data
                    var nib =
                        ((hibyte & bitmask) ? 2 : 0)
                        | ((lobyte & bitmask) ? 1 : 0);

                    if (
                        !nib                        // 0 pixels are transparent
                        || realX + ii >= gbwidth    // Don't draw offscreen pixels
                    )
                        continue;

                    // Mix and draw !
                    var px = this.objshades [pallete] [nib];
                    this.PutPixel (realX + ii, realY + sprite.row, px);
                }
                sprite.row ++;
                // Next sprite pls !
            }

        }

        // Fin !
    };

};