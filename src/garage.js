import { CAR_MODELS, DEFAULT_CAR } from './world/carModels.js';

const KEY = 'driveby.garage.v1';

/**
 * What you own and how you have set the car up: money, the cars you have
 * bought, the one you drive, its paint, and the look of the game.
 *
 * Kept apart from the trip's save (save.js) on purpose — money, cars and
 * collectibles belong to the player, not to one drive, so starting the trip
 * again does not wipe the garage.
 */
export class Garage {
  constructor() {
    this.cash = 0;
    this.owned = new Set([DEFAULT_CAR]);
    this.selected = DEFAULT_CAR;
    this.paints = {}; // car id -> hex
    this.liveries = {}; // car id -> livery id
    this.look = 'coast'; // 'real', 'drive' or 'coast'
    this.postcards = []; // ids of collected postcards
    this._listeners = new Set();
    this._load();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  paintOf(id = this.selected) {
    return this.paints[id] ?? CAR_MODELS[id]?.paints[0] ?? 0xc8221b;
  }

  liveryOf(id = this.selected) {
    return this.liveries[id] ?? 'plain';
  }

  setLivery(livery, id = this.selected) {
    this.liveries[id] = livery;
    this._commit();
  }

  add(amount) {
    this.cash = Math.max(0, Math.round(this.cash + amount));
    this._commit();
  }

  canBuy(id) {
    const car = CAR_MODELS[id];
    return Boolean(car) && !this.owned.has(id) && this.cash >= car.price;
  }

  buy(id) {
    if (!this.canBuy(id)) return false;
    this.cash -= CAR_MODELS[id].price;
    this.owned.add(id);
    this._commit();
    return true;
  }

  select(id) {
    if (!this.owned.has(id)) return false;
    this.selected = id;
    this._commit();
    return true;
  }

  setPaint(hex, id = this.selected) {
    this.paints[id] = hex;
    this._commit();
  }

  setLook(look) {
    this.look = ['drive', 'coast', 'real'].includes(look) ? look : 'real';
    this._commit();
  }

  collect(postcardId) {
    if (this.postcards.includes(postcardId)) return false;
    this.postcards.push(postcardId);
    this._commit();
    return true;
  }

  _commit() {
    try {
      window.localStorage.setItem(
        KEY,
        JSON.stringify({
          cash: this.cash,
          owned: [...this.owned],
          selected: this.selected,
          paints: this.paints,
          liveries: this.liveries,
          look: this.look,
          postcards: this.postcards,
        })
      );
    } catch {
      // Private window or blocked storage: the garage lasts for this visit.
    }
    for (const fn of this._listeners) fn(this);
  }

  _load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.cash = Number(data.cash) || 0;
      this.owned = new Set([DEFAULT_CAR, ...(data.owned ?? []).filter((id) => CAR_MODELS[id])]);
      this.selected = this.owned.has(data.selected) ? data.selected : DEFAULT_CAR;
      this.paints = data.paints ?? {};
      this.liveries = data.liveries ?? {};
      this.look = ['drive', 'coast', 'real'].includes(data.look) ? data.look : 'coast';
      this.postcards = Array.isArray(data.postcards) ? data.postcards : [];
    } catch {
      // Unreadable: start fresh.
    }
  }
}
