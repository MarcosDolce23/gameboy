const Cpu = function (nes) {

	var cpu = this;

	// =============== // CPU Timing //

	this.cyclespersec = 60; // 4194304

	this.fps = 
	this.cyclesperframe = 
	this.interval = 0;

	this.SetFPS = function (fps) {
		this.fps = fps;
		this.cyclesperframe = this.cyclespersec / fps;
		this.interval = 1000 / fps;

		return fps;
	};

	this.defaultfps = 60; // Preferably 360 or higher ???
	this.SetFPS (this.defaultfps);

	// =============== //	Basic Elements //

	// Basic flags
	this.bootromAtm = true;
	this.lowpower = false;
	this.ime = false;

	// Rom properties
	this.hasrom = false;

	this.rombank = 1;
	this.rambank = 1;

	this.mbc = 0;
	this.ramenabled = false;

	// =============== //	Registers and Flags //

	// Program
	this.pc = 0x0000; // A placeholder for the bootfirm
	this.cycles = 0;

	// Stack
	this.sp = 0xfffe; // Stack pointer (0xfffe is placeholder)

	this.writeSP = function (addr) {
		this.sp = addr & 0xffff; // Mask to 16bit int
	};
	this.pushSP = function (val) {
		this.writeSP (this.sp - 1);
		cpu.writeByte (this.sp, (val & 0xff00) >> 8); // Hi byte
		this.writeSP (this.sp - 1);
		cpu.writeByte (this.sp, val & 0xff); // Lo byte

		return val & 0xffff; // Mask to 16bit int
	};
	this.popSP = function () {
		this.writeSP (this.sp + 1);
		var lo = cpu.readByte (this.sp); // Lo byte
		this.writeSP (this.sp + 1);
		var hi = cpu.readByte (this.sp); // Hi byte

		return (hi << 8) | lo; // Combine lo and hi together
	};

	// Registers A-L
	this.reg = {
		a: 0,
		b: 0,
		c: 0,
		d: 0,
		e: 0,
		f: 0,
		h: 0,
		l: 0
	};

	this.getReg16 = {
		af: function () {this.get ('a', 'f')},
		bc: function () {this.get ('b', 'c')},
		de: function () {this.get ('d', 'e')},
		hl: function () {this.get ('h', 'l')},

		get (rx, ry) {
			var hi = cpu.reg [rx];
			var lo = cpu.reg [rx];
			return (hi << 8) | lo;
		}
	};
	this.writeReg16 = {
		af: function (val) {this.write ('a', 'f', val)},
		bc: function (val) {this.write ('b', 'c', val)},
		de: function (val) {this.write ('d', 'e', val)},
		hl: function (val) {this.write ('h', 'l', val)},

		write (rx, ry, val) {
			val = val & 0xffff;
			cpu.writeReg (rx, val >> 8); //  Get high byte
			cpu.writeReg (ry, val & 0xff); // Get low byte
			return val;
		}
	};

	this.writeReg = function (r8, val) {
		return this.reg [r8] = val & 0xff; // Mask to 8bit int
	};

	this.write = function (rx, ry, val) {
		val = val & 0xffff;
		this.writeReg (r16 [0], val >> 8); //  Get high byte
		this.writeReg (r16 [1], val & 0xff); // Get low byte
		return this.reg16 [r16] = val; // Return 16bit int of val
	};

	// Flags
	this.flag = {
		zero: false,
		sub: false,
		hcar: false,
		car: false
	};

	// =============== // 	Memory //

	this.mem = new Mem (nes);

	/* uint8 read_byte(uint16 addr) {
		  if (addr < 0x100 && bootrom_enabled)
		    return bootrom[addr];
		  if (addr < 0x4000)
		    return cart_rom[addr];
		  if (addr < 0x8000)
		    return cart_rom[cart_bank*0x4000 + (addr & 0x3FFF)];
		// etc for ram etc
	} */

	this.readByte = function (addr) {
		var mem = this.mem;

		addr = addr & 0xffff; // Mask to 16bit int

		// ROM //
		if (this.bootromAtm && addr < 0x100) {
			return mem.bootrom [addr];
		}
		if (addr < 0x4000) {
			if (!this.hasrom)
				return 0xff;
			return mem.cartrom [addr];
		}
		if (addr < 0x8000) {
			if (!this.hasrom)
				return 0xff;
			return mem.cartrom [this.rombank * 0x4000 + (addr & 0x3fff)];
		}
		// VIDEO //
		if (addr < 0xa000) {
			return mem.vram [addr - 0x8000];
		}
		// WORK //
		if (addr < 0xc000) {
			if (!this.ramenabled)
				return 0xff;
			return mem.cartram [addr - 0xa000]; // Extra ram - WIP
		}
		if (addr < 0xe000) {
			return mem.wram [addr - 0xc000];
		}
		if (addr < 0xff00) {
			return mem.wram [addr - 0xe000]; // Echo ram
		}
		// VIDEO (oam) //
		if (addr < 0xfea0) {
			return mem.oam [addr - 0xfe00];
		} else
		// UNUSED //
		if (addr < 0xff00) {
			return 0; // Reading from unused yields 0
		}
		// IO REG
		if (addr < 0xff80) {
			var ioaddr = addr - 0xff00;

			if (!mem.ioonwrite [ioaddr]) // Unmapped mmio
				return 0xff;
			return mem.ioreg [addr - 0xff00];
		}
		// HIGH
		if (addr < 0xffff) {
			return mem.hram [addr - 0xff80];
		}
		// INTERRUPT
		return mem.iereg;
	};
	this.writeByte = function (addr, val) {
		var mem = this.mem;

		addr = addr & 0xffff; // Mask to 16bit int
		val = val & 0xff; // Mask to 8bit int

		// MBC CONTROL //
		if (addr < 0x8000) {
			var mbcControl = mem.mbcControl [this.mbc];
			if (mbcControl)
				mbcControl ();
			return val;
		}
		// VIDEO //
		if (addr < 0xa000) {
			return mem.vram [addr - 0x8000] = val;
		}
		// WORK //
		if (addr < 0xc000) {
			if (this.ramenabled)
				mem.cartram [addr - 0xa000] = val;
			return val;
		}
		if (addr < 0xe000) {
			return mem.wram [addr - 0xc000] = val;
		}
		if (addr < 0xff00) {
			return mem.wram [addr - 0xe000] = val; // Echo ram
		}
		// VIDEO (oam) //
		if (addr < 0xfea0) {
			return mem.oam [addr - 0xfe00] = val;
		}
		// UNUSED //
		if (addr < 0xff00) {
			return val;
		}
		// IO REG
		if (addr < 0xff80) {
			var ioaddr = addr - 0xff00;

			if (mem.ioonwrite [ioaddr])
				mem.ioonwrite [ioaddr] (val); // WIP
			return val;
		}
		// HIGH
		if (addr < 0xffff) {
			return mem.hram [addr - 0xff80] = val;
		}
		// INTERRUPT
		return mem.iereg = val;
	};

	this.read16 = function (addr) {
		var hi = this.readByte (addr); //  Get high byte
		var lo = this.readByte (addr + 1); //  Get low byte

		return (lo << 8) | hi; // Mask to 16bit int
	};
	/*this.write16 = function (addr, val) {
		cpu.writeByte (addr, ((val & 0xff00) >> 8)); //  Get high byte
		cpu.writeByte (addr + 1, (val & 0xff)); // Get low byte

		return val & 0xffff;
	};*/
	this.write16 = function (addr, val) {
		cpu.writeByte (addr, (val & 0xff)); // Get low byte
		cpu.writeByte (addr + 1, ((val & 0xff00) >> 8)); //  Get high byte

		return val & 0xffff;
	};

	// =============== //	Instructions //

	this.ops = new Ops (this);

	// =============== //	Loop Functions //

	this.currentTimeout = null;

	this.Step = function () {
		for (var i = 0; i < this.cyclesperframe; i ++) {
			this.ops.ExeIns ();
		}
	};

	this.LoopExe = function () {
		// WIP
		for (var i = 0; i < this.cyclesperframe; i ++) {
			this.Step ();
		}

		this.currentTimeout = setTimeout (() => {
			cpu.LoopExe (); // Continue program loop
		}, this.interval);
	};

	this.StopExe = function () {
		clearTimeout (this.currentTimeout);
	};

	// Reset
	this.Reset = function () {
		// Reset registers
		this.reg.a = 
		this.reg.b =
		this.reg.c =
		this.reg.d =
		this.reg.e =
		this.reg.f =
		this.reg.h =
		this.reg.l = 0;

		// Reset flags
		this.flag.zero =
		this.flag.sub =
		this.flag.hcar =
		this.flag.car = false;

		// Reset program
		this.pc = 0x0000;
		this.cycles = 0;
		this.sp = 0xfffe; // PH

		this.bootromAtm = true;
		this.lowpower = false;
		this.ime = false;

		// Reset rom 
		this.rombank = 1;
		this.rambank = 1;

		this.mbc = 0;
		this.ramenabled = false;

	};

	// =============== //	Debugging //

	this.Memdump = function () {
		console.log (this.mem);
	};

	this.Panic = function (err) {
		nes.Stop ();

		alert (err);
		throw err;
	};

};