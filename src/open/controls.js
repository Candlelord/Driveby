/**
 * Driving input: keyboard, on-screen buttons, and a gamepad if one is plugged in.
 *
 *   W / ↑        accelerate          S / ↓     brake, then reverse
 *   A D / ← →    steer               Space     handbrake
 *   M            map                 Esc / P   pause menu
 *   R            back on the road    V         your friend's voice on/off
 *
 * Everything reads out as plain numbers each frame: throttle, brake and steer
 * in 0..1 / -1..1, handbrake as a boolean. One-shot keys (map, pause, reset)
 * are delivered through `on(name, fn)`.
 */
export class Controls {
  constructor() {
    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;
    this.handbrake = false;
    this.enabled = true;
    this.touched = false;
    this._keys = new Set();
    this._buttons = { left: false, right: false, gas: false, brake: false, hand: false };
    this._listeners = new Map();
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => {
      this._keys.clear();
      for (const k of Object.keys(this._buttons)) this._buttons[k] = false;
    });
  }

  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(fn);
  }

  emit(name) {
    for (const fn of this._listeners.get(name) ?? []) fn();
  }

  _key(event, down) {
    const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const driving = ['w', 's', 'a', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
    if (driving.includes(k)) {
      // Do not steal keys from text inputs.
      if (event.target?.tagName === 'INPUT') return;
      event.preventDefault();
      if (down) this._keys.add(k);
      else this._keys.delete(k);
      return;
    }
    if (!down || event.repeat) return;
    if (k === 'Escape' || k === 'p') this.emit('pause');
    else if (k === 'm') this.emit('map');
    else if (k === 'r') this.emit('reset');
    else if (k === 'v') this.emit('voice');
    else if (k === 'j') this.emit('journal');
    else if (k === 'Tab') {
      event.preventDefault();
      this.emit('map');
    }
  }

  /**
   * Hold-to-press on-screen buttons. Each is its own element, so a thumb on
   * each side works at once.
   */
  bindButtons(elements) {
    for (const [name, element] of Object.entries(elements)) {
      if (!element) continue;
      const set = (v) => {
        this._buttons[name] = v;
        element.classList.toggle('is-down', v);
        if (v) this.touched = true;
      };
      element.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        element.setPointerCapture?.(e.pointerId);
        set(true);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(ev, () => set(false));
      element.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  update() {
    const k = this._keys;
    const b = this._buttons;
    let throttle = k.has('w') || k.has('ArrowUp') || b.gas ? 1 : 0;
    let brake = k.has('s') || k.has('ArrowDown') || b.brake ? 1 : 0;
    let steer = (k.has('d') || k.has('ArrowRight') || b.right ? 1 : 0) - (k.has('a') || k.has('ArrowLeft') || b.left ? 1 : 0);
    let hand = k.has(' ') || b.hand;

    // A gamepad, if there is one: triggers, left stick, A for the handbrake.
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      const sx = Math.abs(pad.axes[0]) > 0.12 ? pad.axes[0] : 0;
      throttle = Math.max(throttle, rt);
      brake = Math.max(brake, lt);
      if (Math.abs(sx) > Math.abs(steer)) steer = sx;
      hand = hand || Boolean(pad.buttons[0]?.pressed);
      if (pad.buttons[9]?.pressed && !this._padStart) this.emit('pause');
      this._padStart = Boolean(pad.buttons[9]?.pressed);
      break;
    }

    if (!this.enabled) {
      throttle = 0;
      brake = 0;
      steer = 0;
      hand = false;
    }
    this.throttle = throttle;
    this.brake = brake;
    this.steer = Math.max(-1, Math.min(1, steer));
    this.handbrake = hand;
  }
}
