export class Upgrades {
  constructor() {
    this.defaults = {
      speed: 0,      // increases thrust/power
      bullets: 0,    // increases bullet damage
      range: 0,      // increases bullet life/range
      fuel: 0        // increases fuel capacity (UI only)
    };
    this.levels = Object.assign({}, this.defaults);
    this.maxLevel = 10;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem('flight_upgrades');
      if (raw) this.levels = JSON.parse(raw);
    } catch (e) {}
  }

  save() {
    try { localStorage.setItem('flight_upgrades', JSON.stringify(this.levels)); } catch(e){}
  }

  upgrade(key) {
    if (!this.levels.hasOwnProperty(key)) return false;
    if (this.levels[key] >= this.maxLevel) return false;
    this.levels[key]++;
    this.save();
    return true;
  }

  getLevel(key) {
    return this.levels[key] || 0;
  }

  // Derived values
  getSpeedMultiplier() { return 1 + 0.08 * this.getLevel('speed'); }
  getBulletDamage() { return 10 + 5 * this.getLevel('bullets'); }
  getBulletSpeed() { return 1.6 + 0.12 * this.getLevel('range'); }
  getBulletLife() { return 180 + 20 * this.getLevel('range'); }
  getFuelCapacity() { return 100 + 25 * this.getLevel('fuel'); }
}

export default Upgrades;
