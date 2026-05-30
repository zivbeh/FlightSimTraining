import * as THREE from 'three';
import { obstacles } from './obstacle.js';

export default class Bullet {
  constructor(scene, opts = {}) {
    this.basePos = opts.pos.clone();
    this.pos = this.basePos.clone();
    this.dir = opts.dir.clone().normalize();
    this.speed = typeof opts.speed === 'number' ? opts.speed : 1.6;
    this.damage = typeof opts.damage === 'number' ? opts.damage : 25;
    this.life = typeof opts.life === 'number' ? opts.life : 180; // frames
    this.active = true;

    this.scene = scene;

    // Create a small metallic projectile (elongated cylinder) with an emissive tip
    const length = 0.4;
    const radius = 0.05;
    const cylGeo = new THREE.CylinderGeometry(radius, radius, length, 8, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, metalness: 0.9, roughness: 0.25 });
    const cyl = new THREE.Mesh(cylGeo, mat);
    // Cylinder geometry in Three is along the Y axis; we'll align it to direction later

    // Emissive tip for visual brightness
    const tipGeo = new THREE.SphereGeometry(radius * 0.9, 8, 6);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xffd88a });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(0, length / 2, 0);

    // Group them so we can orient the projectile as one object
    const group = new THREE.Group();
    group.add(cyl);
    group.add(tip);

    // Orient group so cylinder points along this.dir (from Y axis to dir)
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, this.dir.clone().normalize());
    group.quaternion.copy(q);

    group.position.copy(this.pos);
    this.mesh = group; // keep property name for compatibility
    this._parts = { cyl, tip };

    scene.add(group);
  }

  update() {
    if (!this.active) {
      if (this.mesh && this.mesh.parent) {
        try { this.mesh.parent.remove(this.mesh); } catch (e) {}
      }
      return;
    }

    // Move along direction
    this.pos.x += this.speed * this.dir.x;
    this.pos.y += this.speed * this.dir.y;
    this.pos.z += this.speed * this.dir.z;
    this.mesh.position.copy(this.pos);

    // lifetime
    this.life -= 1;
    if (this.life <= 0) {
      this.active = false;
      if (this.mesh && this.mesh.parent) try { this.mesh.parent.remove(this.mesh); } catch (e) {}
      return;
    }

    // simple collision vs obstacles
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o || o._destroyed) continue;
      const op = o.mesh.position || o.pos;
      const dx = this.pos.x - op.x;
      const dy = this.pos.y - op.y;
      const dz = this.pos.z - op.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let radius = 1.0;
      if (o.size && typeof o.size.r === 'number') radius = o.size.r;
      else {
        const bbox = new THREE.Box3().setFromObject(o.mesh);
        radius = bbox.getSize(new THREE.Vector3()).length() / 2;
      }
      if (dist < Math.max(0.5, radius + 0.05)) {
        // hit
        try {
          const price = (typeof o.price === 'number') ? o.price : (o.health ? Math.floor(o.health/3) : 0);
          if (typeof window !== 'undefined' && window.gameState) {
            if (typeof window.gameState.addMoney === 'function') window.gameState.addMoney(price);
            else if (typeof window.gameState.money === 'number') window.gameState.money += price;
          }
        } catch(e){}
        if (typeof o.applyDamage === 'function') o.applyDamage(this.damage);
        this.active = false;
        if (this.mesh && this.mesh.parent) {
          try { this.mesh.parent.remove(this.mesh); } catch (e) {}
        }
        break;
      }
    }
  }
}