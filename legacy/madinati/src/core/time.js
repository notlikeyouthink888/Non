/** إدارة الوقت: وقت اليوم، سرعة المحاكاة، الإيقاف. */
export class TimeController {
  constructor(bus, { hour = 15, dayLengthSec = 300 } = {}) {
    this.bus = bus;
    this.hour = hour;
    this.dayLength = dayLengthSec;     // ثوانٍ حقيقية لليوم الكامل
    this.flowing = false;              // هل يتقدّم الوقت تلقائيًا
    this.simSpeed = 1;                 // 0 = إيقاف، 1/2/4
    this.simTime = 0;
    this._accum = 0;
    this._tickAccum = 0;
    this.tickRate = 0.25;              // ثانية
  }
  setHour(h, { silent = false } = {}) {
    this.hour = ((h % 24) + 24) % 24;
    if (!silent) this.bus.emit('time:changed', { hour: this.hour });
  }
  setFlowing(v) { this.flowing = !!v; this.bus.emit('time:flow', { flowing: this.flowing }); }
  setSimSpeed(s) { this.simSpeed = s; this.bus.emit('sim:speed', { speed: s }); }
  /** يُعيد عدد نبضات المحاكاة الواجب تنفيذها */
  advance(dt) {
    if (this.flowing) {
      this.hour = (this.hour + (24 * dt * this.simSpeed) / this.dayLength) % 24;
      this._accum += dt;
      if (this._accum > 0.1) { this._accum = 0; this.bus.emit('time:changed', { hour: this.hour }); }
    }
    this.simTime += dt * this.simSpeed;
    this._tickAccum += dt * this.simSpeed;
    let ticks = 0;
    while (this._tickAccum >= this.tickRate && ticks < 4) { this._tickAccum -= this.tickRate; ticks++; }
    return ticks;
  }
  get isNight() { return this.hour < 6.1 || this.hour > 18.9; }
  label() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
