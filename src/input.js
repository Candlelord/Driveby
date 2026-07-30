// Full lock at this many pixels of drag. Bounded at both ends: a proportion of
// screen width alone gives a phone a stick too short to be precise and an iPad
// one too long for a thumb that is also holding the thing up.
const DRAG_MIN = 74;
const DRAG_MAX = 155;
const DRAG_FRACTION = 0.2;

// Below this fraction of full lock, the input is a resting thumb rather than a
// steering intention.
const DEADZONE = 0.07;

// How fast the steering value chases the finger, and how fast it returns to
// centre once the finger is gone. Both are exponential rates, so they behave
// the same at 60Hz and 120Hz.
const FOLLOW_RATE = 26;
const RELEASE_RATE = 11;

/**
 * Steering input, normalised to -1..1.
 *
 * Three sources, whichever is pushing hardest wins: keyboard (desktop testing),
 * a drag-anywhere virtual stick (touch), and device tilt (opt-in, because iOS
 * requires a user gesture before it hands over orientation events).
 *
 * The stick is relative and anchored wherever the finger lands, because there
 * is no right place to put a fixed one on a screen that is held differently by
 * everybody. Two details make that workable rather than merely clever: the
 * anchor is dragged along once you pass full lock, so coming back off lock
 * responds on the first pixel instead of after you have retraced the overshoot;
 * and letting go eases the wheel back to centre rather than dropping it, since
 * a car whose steering snaps straight the instant you lift a thumb feels like
 * a bug in the car.
 */
export class Input {
  constructor(target, { tiltButton, stick } = {}) {
    this.keyboard = 0;
    this.touch = 0;
    this.tilt = 0;
    this.tiltEnabled = false;
    this.hasInput = false;

    this._keys = new Set();
    this._pointerId = null;
    this._anchorX = 0;
    this._anchorY = 0;
    this._target = 0; // where the finger says the wheel should be
    this._stick = stick ?? null;

    this._bindKeyboard();
    this._bindPointer(target);
    this._bindTilt(tiltButton);
  }

  /**
   * Advance the touch value toward the finger. Called once a frame rather than
   * from the pointer events, so the rate is tied to time rather than to how
   * often the browser felt like reporting a move — iOS coalesces those, and
   * driving straight off them gives a value that steps rather than sweeps.
   */
  update(dt) {
    const rate = this._pointerId === null ? RELEASE_RATE : FOLLOW_RATE;
    this.touch += (this._target - this.touch) * (1 - Math.exp(-rate * dt));
    if (Math.abs(this.touch) < 0.002) this.touch = 0;
    this._drawStick();
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
    const range = () => clamp(window.innerWidth * DRAG_FRACTION, DRAG_MIN, DRAG_MAX);

    target.addEventListener(
      'pointerdown',
      (event) => {
        if (this._pointerId !== null) return;
        this._pointerId = event.pointerId;
        this._anchorX = event.clientX;
        this._anchorY = event.clientY;
        this._target = 0;
        this.hasInput = true;
        target.setPointerCapture?.(event.pointerId);
        // Belt and braces with the CSS: touch-action should already have told
        // Safari to keep its gestures to itself. Guarded because Safari does not
        // always mark these cancelable, and calling it blind throws.
        if (event.cancelable) event.preventDefault();
      },
      { passive: false }
    );

    target.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerId !== this._pointerId) return;
        const span = range();
        let delta = event.clientX - this._anchorX;

        // Past full lock the anchor comes with you, so the stick never has more
        // travel stored up than it can express. Without this, dragging a long
        // way right and then easing back does nothing until you have undone the
        // whole overshoot.
        if (delta > span) {
          this._anchorX = event.clientX - span;
          delta = span;
        } else if (delta < -span) {
          this._anchorX = event.clientX + span;
          delta = -span;
        }

        const raw = delta / span;
        const size = Math.abs(raw);
        // Rescale past the deadzone rather than subtracting it, so the first
        // degree of real steering is still gentle instead of jumping to 0.07.
        this._target =
          size < DEADZONE ? 0 : Math.sign(raw) * ((size - DEADZONE) / (1 - DEADZONE));
        if (event.cancelable) event.preventDefault();
      },
      { passive: false }
    );

    const release = (event) => {
      if (event.pointerId !== this._pointerId) return;
      this._pointerId = null;
      this._target = 0;
    };
    target.addEventListener('pointerup', release);
    target.addEventListener('pointercancel', release);
    target.addEventListener('lostpointercapture', release);
    // Safari fires this when a system gesture steals the touch — without it the
    // wheel stays where it was left and the car drives off on its own.
    window.addEventListener('blur', () => {
      this._pointerId = null;
      this._target = 0;
    });
  }

  /**
   * The stick you can see.
   *
   * An invisible control is the thing that actually makes touch steering feel
   * unreliable: you cannot tell how much lock you are holding, or where centre
   * is, so you oversteer and correct and oversteer. Two rings and a dot fix
   * that for the cost of a transform.
   */
  _drawStick() {
    if (!this._stick) return;
    const held = this._pointerId !== null;
    const visible = held || Math.abs(this.touch) > 0.01;

    this._stick.classList.toggle('is-live', visible);
    if (!visible) return;

    const span = clamp(window.innerWidth * DRAG_FRACTION, DRAG_MIN, DRAG_MAX);
    this._stick.style.transform = `translate(${this._anchorX}px, ${this._anchorY}px)`;
    this._stick.style.setProperty('--lock', this.touch.toFixed(3));
    this._stick.style.setProperty('--span', `${span}px`);
    this._stick.style.setProperty('--held', held ? '1' : '0.35');
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
      // Only useful on a device that actually reports orientation. Touch points
      // rather than the pointer media query, for the same reason the quality
      // tier uses them: iPadOS Safari reports `(pointer: fine)` by default.
      if ((navigator.maxTouchPoints ?? 0) > 0) listen();
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
