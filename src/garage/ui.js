import '../ui/menus.css';
import { CAR_MODELS } from '../world/carModels.js';
import { LIVERIES } from '../world/livery.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const escapeHtml = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * The garage: browse the cars on the turntable, buy and pick one, choose its
 * paint and livery, and switch the look of the game.
 */
export class GarageUi {
  constructor({ garage, stage }) {
    this.garage = garage;
    this.stage = stage;
    this.root = document.createElement('div');
    this.root.className = 'gr';
    this.root.hidden = true;
    document.body.appendChild(this.root);
    this.ids = Object.keys(CAR_MODELS);
    this.index = 0;
    this.tab = 'cars';
    this.preview = { paint: 0, livery: 'plain' };
    this.onClose = () => {};
  }

  open(onClose) {
    this.onClose = onClose ?? (() => {});
    this.root.hidden = false;
    this.tab = 'cars';
    this.index = Math.max(0, this.ids.indexOf(this.garage.selected));
    this._loadCar();
    this.render();
  }

  close() {
    this.root.hidden = true;
    this.root.innerHTML = '';
    const done = this.onClose;
    this.onClose = () => {};
    done();
  }

  get id() {
    return this.ids[this.index];
  }

  _loadCar() {
    const id = this.id;
    const owned = this.garage.owned.has(id);
    this.preview = {
      paint: owned ? this.garage.paintOf(id) : CAR_MODELS[id].paints[0],
      livery: owned ? this.garage.liveryOf(id) : 'plain',
    };
    this.stage.show(id, this.preview.paint, this.preview.livery);
  }

  render() {
    const g = this.garage;
    const car = CAR_MODELS[this.id];
    const owned = g.owned.has(car.id);
    const selected = g.selected === car.id;

    const carsTab = `
      <h2 class="gr-name gfx">${escapeHtml(car.name)}</h2>
      <p class="gr-blurb">${escapeHtml(car.blurb)}</p>
      <ul class="gr-specs">${car.spec.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
      <div><div class="gr-label">Paint</div><div class="gr-swatches">
        ${car.paints.map((p) => `<button class="gr-swatch${p === this.preview.paint ? ' is-on' : ''}" data-paint="${p}" style="background:${hex(p)}" aria-label="Paint ${hex(p)}"></button>`).join('')}
      </div></div>
      <div><div class="gr-label">Livery</div><div class="gr-chips">
        ${LIVERIES.map((l) => `<button class="gr-chip${l.id === this.preview.livery ? ' is-on' : ''}" data-livery="${l.id}">${escapeHtml(l.name)}</button>`).join('')}
      </div></div>
      <div class="gr-buy">
        ${
          owned
            ? selected
              ? '<button class="brush" disabled>In the car</button>'
              : '<button class="brush" data-action="select">Drive this</button>'
            : `<button class="brush${g.canBuy(car.id) ? '' : ' pink'}" data-action="buy" ${g.canBuy(car.id) ? '' : 'disabled'}>Buy</button>
               <div class="price"><small>${g.cash >= car.price ? 'price' : `need $${(car.price - g.cash).toLocaleString('en-GB')} more`}</small>$${car.price.toLocaleString('en-GB')}</div>`
        }
      </div>`;

    this.root.innerHTML = `
      <div class="gr-panel">
        ${carsTab}
      </div>
      <div class="gr-nav"><button class="brush alt" data-action="prev" aria-label="Previous car">‹</button><button class="brush alt" data-action="next" aria-label="Next car">›</button></div>
      <div class="gr-cash">
        <div class="money gfx lime">$${g.cash.toLocaleString('en-GB')}</div>
        <div class="gr-looks"><button class="gr-chip${g.look === 'real' ? ' is-on' : ''}" data-look="real">Clean</button><button class="gr-chip${g.look === 'drive' ? ' is-on' : ''}" data-look="drive">Gritty</button></div>
      </div>
      <div class="gr-back"><button class="brush" data-action="back">Back</button></div>`;

    this._wire();
  }

  _wire() {
    const g = this.garage;
    const car = CAR_MODELS[this.id];
    const on = (selector, fn) => this.root.querySelectorAll(selector).forEach((el) => el.addEventListener('click', () => fn(el)));

    on('[data-paint]', (el) => {
      this.preview.paint = Number(el.dataset.paint);
      if (g.owned.has(car.id)) g.setPaint(this.preview.paint, car.id);
      this.stage.setLook(this.preview.paint, this.preview.livery);
      this.render();
    });
    on('[data-livery]', (el) => {
      this.preview.livery = el.dataset.livery;
      if (g.owned.has(car.id)) g.setLivery(this.preview.livery, car.id);
      this.stage.setLook(this.preview.paint, this.preview.livery);
      this.render();
    });
    on('[data-look]', (el) => {
      g.setLook(el.dataset.look);
      this.render();
    });
    on('[data-action]', (el) => {
      const action = el.dataset.action;
      if (action === 'prev' || action === 'next') {
        this.index = (this.index + (action === 'next' ? 1 : this.ids.length - 1)) % this.ids.length;
        this._loadCar();
        this.render();
      } else if (action === 'buy' && g.buy(car.id)) {
        g.setPaint(this.preview.paint, car.id);
        g.setLivery(this.preview.livery, car.id);
        this.render();
      } else if (action === 'select' && g.select(car.id)) {
        this.render();
      } else if (action === 'back') {
        this.close();
      }
    });
  }
}
