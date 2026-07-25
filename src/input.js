/**
 * Steering input, normalised to -1..1.
 *
 * Three sources, whichever is pushing hardest wins: keyboard (desktop testing),
 * a drag-anywhere virtual stick (touch), and device tilt (opt-in, because iOS
 * requires a user gesture before it hands over orientation events).
 */
export class Input {
  constructor(target, { tiltButton } = {}) {
    this.keyboard = 0;
    this.touch = 0;
    this.tilt = 0;
    this.tiltEnabled = false;
    this.hasInput = false;

    this._keys = new Set();
    this._pointerId = null;
    this._pointerStartX = 0;

    this._bindKeyboard();
    this._bindPointer(target);
    this._bindTilt(tiltButton);
  }

  /** Combined steering value; the strongest source wins. */
  get value() {
    let best = 0;
    for (const source of [this.keyboard, this.touch, this.tilt]) {
      if (Math.abs(source) > Math.abs(best)) best = source;
    }
    return clamp(best, -1, 1);
  }

  _bindKeyboard() {
    const isLeft = (key) => key === 'ArrowLeft' || key === 'a' || key === 'A';
    const isRight = (key) => key === 'ArrowRight' || key === 'd' || key === 'D';

    const recompute = () => {
      let value = 0;
      for (const key of this._keys) {
        if (isLeft(key)) value -= 1;
        if (isRight(key)) value += 1;
      }
      this.keyboard = clamp(value, -1, 1);
    };

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      if (!isLeft(event.key) && !isRight(event.key)) return;
      event.preventDefault();
      this._keys.add(event.key);
      this.hasInput = true;
      recompute();
    });

    window.addEventListener('keyup', (event) => {
      this._keys.delete(event.key);
      recompute();
    });

    window.addEventListener('blur', () => {
      this._keys.clear();
      this.keyboard = 0;
    });
  }

  _bindPointer(target) {
    // Drag distance across a quarter of the screen equals full lock.
    const range = () => Math.max(80, window.innerWidth * 0.22);

    target.addEventListener('pointerdown', (event) => {
      if (this._pointerId !== null) return;
      this._pointerId = event.pointerId;
      this._pointerStartX = event.clientX;
      this.hasInput = true;
      target.setPointerCapture?.(event.pointerId);
    });

    target.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this._pointerId) return;
      this.touch = clamp((event.clientX - this._pointerStartX) / range(), -1, 1);
    });

    const release = (event) => {
      if (event.pointerId !== this._pointerId) return;
      this._pointerId = null;
      this.touch = 0;
    };
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', release);
    target.addEventListener('lostpointercapture', release);
  }

  _bindTilt(tiltButton) {
    if (typeof window.DeviceOrientationEvent === 'undefined') return;

    const needsPermission =
      typeof window.DeviceOrientationEvent.requestPermission === 'function';

    const listen = () => {
      this.tiltEnabled = true;
      window.addEventListener('deviceorientation', (event) => {
        if (event.gamma === null) return;
        // gamma is roll in degrees; ~25 degrees of lean is full lock.
        this.tilt = clamp(event.gamma / 25, -1, 1);
        this.hasInput = true;
      });
    };

    if (!needsPermission) {
      // Only useful on a device that actually reports orientation.
      if (matchMedia('(pointer: coarse)').matches) listen();
      return;
    }

    if (!tiltButton) return;
    tiltButton.hidden = false;
    tiltButton.addEventListener('click', async () => {
      try {
        const result = await window.DeviceOrientationEvent.requestPermission();
        if (result === 'granted') listen();
      } catch {
        // Permission denied or unavailable — drag steering still works.
      }
      tiltButton.hidden = true;
    });
  }
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
