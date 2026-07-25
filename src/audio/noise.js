/**
 * Noise sources, generated rather than loaded.
 *
 * Every SFX layer in this game is synthesised. That is partly a licensing and
 * bundle-size win, but mostly it is the same argument the visuals make: a
 * procedural source has parameters, so wind can genuinely thicken with speed
 * instead of crossfading between two recordings of wind.
 */

/** Flat spectrum — the basis of wind and rain. */
export function whiteNoiseBuffer(context, seconds = 2.5) {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Brown noise — energy falling at 6dB/octave. Much closer to the low rumble of
 * tyres on tarmac than white noise, which reads as hiss.
 */
export function brownNoiseBuffer(context, seconds = 3) {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

/**
 * Rain: white noise shaped into irregular droplet density, so it has texture
 * rather than sounding like a flat hiss.
 */
export function rainBuffer(context, seconds = 3) {
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate;
    const density = 0.7 + 0.3 * Math.sin(t * 1.7) * Math.sin(t * 0.43);
    data[i] = (Math.random() * 2 - 1) * density;
  }
  return buffer;
}

/** A looping source wired to a gain, ready to be patched into a bus. */
export function loopSource(context, buffer, destination, gain = 0) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const node = context.createGain();
  node.gain.value = gain;

  source.connect(node).connect(destination);
  source.start();
  return { source, gain: node };
}
