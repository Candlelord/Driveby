import { CONFIG } from '../config.js';

// Game units per leg. Real distance would make Lagos → Amsterdam a sixty-hour
// drive; a straight scale would make the 128 km to Ibadan a blink beside the
// 940 km Saharan crossing. Square-root compression keeps long legs feeling
// long without any one of them outstaying its welcome: about two and a half
// minutes for the shortest at cruise, a little over four for the Sahara, and
// close to an hour for the whole trip.
const LEG_BASE = 2600;
const LEG_PER_ROOT_KM = 200;

const FERRY_FADE_OUT = 0.9;
const FERRY_HOLD = 2.8;
const FERRY_FADE_IN = 1.3;
const START_FADE_IN = 1.6;

/**
 * Drives a route: decides which terrain set the road is in from how far along
 * the trip you are, rather than from the playlist.
 *
 * The music keeps the light — the mood still sets the sky, the grade and the
 * time of day — but the place is pinned with the environment's region hold, so
 * Kano follows Kaduna whatever comes on next. Sets are requested a scenery-swap
 * distance ahead, so each boundary lands where the route says it does.
 *
 * A ferry leg has no road: arriving at its port fades the screen out, swaps
 * the country behind the black, and fades back in on the far shore.
 */
export class RouteDirector {
  constructor(route, { environment, landmarks, ui }) {
    this.route = route;
    this.environment = environment;
    this.landmarks = landmarks;
    this.ui = ui;
    this.active = false;

    // Precompute where each leg starts, in game units from the trip origin.
    this.legStarts = [];
    this.legLengths = [];
    let units = 0;
    for (const leg of route.legs) {
      this.legStarts.push(units);
      const length = leg.ferry ? 0 : LEG_BASE + Math.sqrt(leg.km) * LEG_PER_ROOT_KM;
      this.legLengths.push(length);
      units += length;
    }
    this.totalUnits = units;
    this.roadKm = route.legs.reduce((sum, leg) => sum + (leg.ferry ? 0 : leg.km), 0);
  }

  start(travelled) {
    this.active = true;
    this.finished = false;
    this.origin = travelled;
    this.legIndex = 0;
    this.country = this.route.stops[0].country;
    this.ferriesDone = new Set();
    this.fade = null;

    // Arrive in Lagos behind a title card rather than watching it grow out of
    // whatever field the intro was driving through.
    this.environment.jumpToRegion(this.route.legs[0].regions[0][0]);
    this.fade = { kind: 'start', time: 0 };
    const first = this.route.stops[0];
    const last = this.route.stops[this.route.stops.length - 1];
    this.ui.setFade(1, {
      title: `${first.name}, ${first.country}`,
      sub: `${this.route.title} · ${formatKm(this.roadKm)} by road to ${last.name}`,
    });

    this.landmarks.useSchedule(this._landmarkSchedule());
    this.ui.setRouteVisible(true);
  }

  /** Every landmark on the route, as absolute game distances. */
  _landmarkSchedule() {
    const schedule = [];
    this.route.legs.forEach((leg, i) => {
      for (const [name, fraction] of leg.landmarks ?? []) {
        schedule.push({ name, at: this.origin + this.legStarts[i] + this.legLengths[i] * fraction });
      }
    });
    return schedule.sort((a, b) => a.at - b.at);
  }

  update(state) {
    if (!this.active) return;
    const progress = state.travelled - this.origin;

    this._updateFade(state);
    if (this.finished) return;

    // Which leg are we on? Ferry legs have no length, so the loop naturally
    // steps over them once their crossing is done.
    let leg = this._legAt(progress);
    const ferry = this._pendingFerryAt(progress);
    if (ferry !== null) {
      leg = ferry; // in port: arrived, waiting on the boat
      if (!this.fade) this._sail(ferry);
    }

    if (leg !== this.legIndex) {
      // Arrived at a stop.
      for (let i = this.legIndex + 1; i <= leg; i++) this._arrive(i);
      this.legIndex = leg;
    }

    // Region: look ahead by the scenery swap distance, but never across a
    // ferry that has not sailed yet.
    const lookahead = this._clampToFerry(progress + CONFIG.propSwapDistance);
    const regionSet = this._regionAt(lookahead);
    if (!this.fade || this.fade.kind !== 'ferry') this.environment.enterRegion(regionSet, state.travelled);

    // The country follows from where you are, rather than from counting
    // border events, so it cannot drift out of step. A ferry's far shore is
    // announced when it lands; see _updateFade.
    const country = this._countryAt(progress);
    if (country !== this.country) {
      const byFerry = this.route.legs[this.legIndex - 1]?.ferry || this.route.legs[this.legIndex]?.ferry;
      this.country = country;
      if (!byFerry) this.ui.toast(country, 'border crossing');
    }

    if (progress >= this.totalUnits) {
      this._finish(state.travelled);
      return;
    }

    this._updateHud(progress);
  }

  _countryAt(progress) {
    const index = this.legIndex;
    const leg = this.route.legs[index];
    const here = this.route.stops[index].country;
    if (leg.ferry || leg.border === undefined) return here;
    return this._fractionAlong(progress, index) >= leg.border ? this.route.stops[index + 1].country : here;
  }

  _legAt(progress) {
    let index = 0;
    for (let i = 0; i < this.legStarts.length; i++) {
      if (progress >= this.legStarts[i]) index = i;
    }
    return index;
  }

  /** Index of a ferry leg whose port we have reached but not yet sailed from. */
  _pendingFerryAt(progress) {
    for (let i = 0; i < this.route.legs.length; i++) {
      if (this.route.legs[i].ferry && !this.ferriesDone.has(i) && progress >= this.legStarts[i]) return i;
    }
    return null;
  }

  _clampToFerry(distance) {
    for (let i = 0; i < this.route.legs.length; i++) {
      if (this.route.legs[i].ferry && !this.ferriesDone.has(i)) {
        return Math.min(distance, this.legStarts[i] - 1);
      }
    }
    return distance;
  }

  _regionAt(progress) {
    const index = Math.min(this._legAt(Math.max(0, progress)), this.route.legs.length - 1);
    const leg = this.route.legs[index];
    const fraction = this._fractionAlong(progress, index);
    let setId = leg.regions[0][0];
    for (const [id, from] of leg.regions) if (fraction >= from) setId = id;
    return setId;
  }

  _fractionAlong(progress, index) {
    const length = this.legLengths[index];
    return length > 0 ? Math.min(1, Math.max(0, (progress - this.legStarts[index]) / length)) : 1;
  }

  _arrive(index) {
    const stop = this.route.stops[index];
    if (!stop) return;
    // The ferry's far port is announced when the boat lands, not here.
    if (this.route.legs[index - 1]?.ferry) return;
    this.ui.toast(stop.name, `${stop.area} · ${stop.country}`);
  }

  _sail(ferryIndex) {
    const from = this.route.stops[ferryIndex];
    const to = this.route.stops[ferryIndex + 1];
    this.fade = { kind: 'ferry', time: 0, ferryIndex, swapped: false };
    this.ui.setFadeCard({
      title: `Ferry · ${from.name} → ${to.name}`,
      sub: `${formatKm(this.route.legs[ferryIndex].km)} across the Mediterranean, overnight`,
    });
  }

  _updateFade(state) {
    const fade = this.fade;
    if (!fade) return;
    fade.time += state.dt;

    if (fade.kind === 'start') {
      this.ui.setFade(1 - smooth(fade.time / START_FADE_IN));
      if (fade.time >= START_FADE_IN + 1.2) {
        this.ui.setFade(0, null);
        this.fade = null;
      }
      return;
    }

    // Ferry: out, hold on the card, swap the country in the dark, back in.
    const t = fade.time;
    if (t < FERRY_FADE_OUT) {
      this.ui.setFade(smooth(t / FERRY_FADE_OUT));
    } else if (t < FERRY_FADE_OUT + FERRY_HOLD) {
      this.ui.setFade(1);
      if (!fade.swapped) {
        fade.swapped = true;
        this.ferriesDone.add(fade.ferryIndex);
        const leg = this.route.legs[fade.ferryIndex];
        this.environment.jumpToRegion(leg.regions[0][0]);
      }
    } else {
      const k = (t - FERRY_FADE_OUT - FERRY_HOLD) / FERRY_FADE_IN;
      this.ui.setFade(1 - smooth(k));
      if (k >= 1) {
        this.ui.setFade(0, null);
        const port = this.route.stops[fade.ferryIndex + 1];
        this.ui.toast(port.name, `${port.area} · ${port.country}`);
        this.fade = null;
      }
    }
  }

  _updateHud(progress) {
    const index = this.legIndex;
    const leg = this.route.legs[index];
    const from = this.route.stops[index];
    const to = this.route.stops[index + 1];
    const fraction = this._fractionAlong(progress, index);
    const legLeft = Math.max(0, Math.round(leg.km * (1 - fraction)));

    let driven = 0;
    for (let i = 0; i < index; i++) if (!this.route.legs[i].ferry) driven += this.route.legs[i].km;
    if (!leg.ferry) driven += leg.km * fraction;

    this.ui.setRoute({
      from: from.name,
      to: to?.name ?? from.name,
      left: leg.ferry ? 'by sea' : `${formatKm(legLeft)} to go`,
      country: this.country,
      total: `${formatKm(Math.round(driven))} of ${formatKm(this.roadKm)}`,
      progress: Math.min(1, driven / this.roadKm),
    });
  }

  _finish(travelled) {
    this.finished = true;
    this.active = false;
    const last = this.route.stops[this.route.stops.length - 1];
    this.ui.toast(last.name, `journey complete · ${formatKm(this.roadKm)} from ${this.route.stops[0].name}`, 9);
    this.ui.setRouteVisible(false);
    // Hand the road back to the playlist.
    this.environment.leaveRegion(travelled);
    this.landmarks.useSchedule(null);
  }
}

export function formatKm(km) {
  return `${Math.round(km).toLocaleString('en-GB')} km`;
}

function smooth(x) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
