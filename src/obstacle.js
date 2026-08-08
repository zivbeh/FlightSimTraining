// src/obstacles.js
// Three.js obstacle system: spheres, cylinders (any orientation), rectangular donuts (frame).
import * as THREE from 'three';
import { soundManager } from './sound.js';

function vec(x=0,y=0,z=0){ return new THREE.Vector3(x,y,z); }

// Global scene scaling for obstacle layout (tuned for very sparse, much higher obstacles)
// These values push obstacles far from the origin and raise them up to high altitudes (~100)
const POSITION_SCALE = 3.5;   // multiply base X/Z positions to space objects further apart
const POSITION_Y_SCALE = 7.0; // amplify vertical placement so obstacles are higher off the ground
const MIN_HEIGHT = 100.0;     // minimum height above ground (around start height + 100)
const SIZE_SCALE = 3.5;       // multiply obstacle sizes to make them bigger
const MOTION_SCALE = 2.0;     // amplify motion amplitudes so movement matches new scale

class Motion {
  // axis: 'x'|'y'|'z' or THREE.Vector3 direction
  constructor(axis, amplitude=1, period=2, phase=0){
    this.axis = axis;
    this.amp = amplitude;
    this.period = Math.max(0.0001, period);
    this.phase = phase || 0;
  }
  value(t){ return this.amp * Math.sin((2*Math.PI / this.period) * t + this.phase); }
  apply(pos, t){
    const v = this.value(t);
    if (typeof this.axis === 'string') {
      pos[this.axis] += v;
    } else if (this.axis instanceof THREE.Vector3) {
      pos.addScaledVector(this.axis, v);
    }
  }
}

class Obstacle {
  constructor(type, opts = {}) {
    this.type = type; // 'sphere'|'cylinder'|'rectdonut'
    const origPos = opts.pos ? opts.pos.clone() : vec();
    const optId = opts.id || null;
    // If this is the checkpoint ('r2'), don't scale positions/sizes so it remains pass-through
    if (optId === 'r2') {
      this.basePos = origPos.clone();
    } else {
      // Apply global position scaling: X/Z use POSITION_SCALE, Y gets extra vertical scaling
      this.basePos = new THREE.Vector3(
        origPos.x * POSITION_SCALE,
        Math.max((origPos.y || 0) * POSITION_SCALE * POSITION_Y_SCALE, MIN_HEIGHT),
        origPos.z * POSITION_SCALE
      );
    }
    this.pos = this.basePos.clone();
    // Deep copy and scale sizes
    const origSize = opts.size || {};
    this.size = Object.assign({}, origSize);
    if (optId !== 'r2') {
      if (this.size.r) this.size.r = this.size.r * SIZE_SCALE;
      if (this.size.h) this.size.h = this.size.h * SIZE_SCALE;
      if (this.size.w) this.size.w = this.size.w * SIZE_SCALE;
      if (this.size.thickness) this.size.thickness = this.size.thickness * SIZE_SCALE;
    }
    this.orientation = opts.orientation || new THREE.Euler(0,0,0); // radians
    this.motion = opts.motion || null;
    // Scale motion amplitude(s) so movement matches larger scene (skip for checkpoint)
    if (this.motion && optId !== 'r2') {
      if (Array.isArray(this.motion)) {
        this.motion.forEach(m => { if (m && typeof m.amp === 'number') m.amp *= MOTION_SCALE; });
      } else if (typeof this.motion.amp === 'number') {
        this.motion.amp *= MOTION_SCALE;
      }
    }
    this.color = opts.color || 0xff6666;
    this.id = opts.id || null;
    this.mesh = this._createMesh();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.copy(this.orientation);

    // Ensure obstacle lies within ground bounds on X/Z
    try {
      this.basePos.x = Math.max(-GROUND_HALF + GROUND_MARGIN, Math.min(GROUND_HALF - GROUND_MARGIN, this.basePos.x));
      this.basePos.z = Math.max(-GROUND_HALF + GROUND_MARGIN, Math.min(GROUND_HALF - GROUND_MARGIN, this.basePos.z));
      this.pos.copy(this.basePos);
      if (this.mesh && this.mesh.position) this.mesh.position.copy(this.pos);
    } catch(e) {}

    // optional health for shootable obstacles
    this.maxHealth = typeof opts.health === 'number' ? opts.health : null;
    this.health = this.maxHealth;
    // optional price for rewards
    this.price = typeof opts.price === 'number' ? opts.price : (this.maxHealth ? Math.max(5, Math.floor(this.maxHealth/3)) : 0);
    this.healthBarMesh = null;
    this._boundsSize = new THREE.Vector3();
    this._barPosition = new THREE.Vector3();
    if (this.maxHealth) {
      const barGeo = new THREE.BoxGeometry(1, 0.12, 0.12);
      const barMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      this.healthBarMesh = new THREE.Mesh(barGeo, barMat);
      this.healthBarMesh.visible = true;
    }

    // Price sprite only (no yellow ring marker)
    this._priceSprite = null;
    if (this.maxHealth) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0,0,256,64);
        ctx.fillStyle = '#ffd24d'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const priceText = '$' + (this.price || Math.max(5, Math.floor((this.maxHealth||0)/3)));
        ctx.fillText(priceText, 128, 32);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        const spriteMat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(6, 1.5, 1);
        sprite.userData._isPrice = true;
        this._priceSprite = sprite;
      } catch(e){}
    }

    if (opts.scene) opts.scene.add(this.mesh);
    this._refreshBoundsSize();
  }

  _refreshBoundsSize() {
    if (!this.mesh) return;
    try {
      this.mesh.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(this.mesh);
      bbox.getSize(this._boundsSize);
    } catch (e) {
      this._boundsSize.set(1, 1, 1);
    }
  }

  _createMesh(){
    const mat = new THREE.MeshStandardMaterial({ color: this.color, metalness:0.2, roughness:0.6 });
    if (this.type === 'sphere') {
      const r = this.size.r || 1;
      return new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat);
    } else if (this.type === 'cylinder') {
      const r = this.size.r || 1;
      const h = this.size.h || 2;
      // Cylinder axis along Y by default; orientation handles rotating it.
      return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1), mat);
    } else if (this.type === 'box') {
      const w = this.size.w || 2;
      const h = this.size.h || 2;
      const t = this.size.thickness || 2;
      return new THREE.Mesh(new THREE.BoxGeometry(w, h, t), mat);
    } else if (this.type === 'cone') {
      const r = this.size.r || 1;
      const h = this.size.h || 2;
      return new THREE.Mesh(new THREE.ConeGeometry(r, h, 24), mat);
    } else if (this.type === 'torus') {
      const r = this.size.r || 2;
      const tube = this.size.thickness || 0.8;
      return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 16, 64), mat);
    } else if (this.type === 'rectdonut') {
      // Build a rectangular ring (frame) from 4 boxes
      const w = this.size.w || 6;
      const h = this.size.h || 4;
      const thickness = this.size.thickness || 0.4;
      const group = new THREE.Group();
      const boxGeo = new THREE.BoxGeometry(1,1,thickness);
      const boxMat = mat;
      // top
      const top = new THREE.Mesh(boxGeo.clone(), boxMat);
      top.scale.set(w, thickness, thickness);
      top.position.set(0, h/2 - thickness/2, 0);
      group.add(top);
      // bottom
      const bot = new THREE.Mesh(boxGeo.clone(), boxMat);
      bot.scale.set(w, thickness, thickness);
      bot.position.set(0, -h/2 + thickness/2, 0);
      group.add(bot);
      // left
      const left = new THREE.Mesh(boxGeo.clone(), boxMat);
      left.scale.set(thickness, h - 2*thickness, thickness);
      left.position.set(-w/2 + thickness/2, 0, 0);
      group.add(left);
      // right
      const right = new THREE.Mesh(boxGeo.clone(), boxMat);
      right.scale.set(thickness, h - 2*thickness, thickness);
      right.position.set(w/2 - thickness/2, 0, 0);
      group.add(right);
      return group;
    }
    return new THREE.Mesh(new THREE.BoxGeometry(1,1,1), mat);
  }

  update(t){
    // reset to base and apply motion(s)
    this.pos.copy(this.basePos);
    if (this.motion) {
      if (Array.isArray(this.motion)) {
        this.motion.forEach(m => m.apply(this.pos, t));
      } else {
        this.motion.apply(this.pos, t);
      }
    }
    this.mesh.position.copy(this.pos);

    if (this.healthBarMesh) {
      // position health bar slightly above the obstacle
      this._barPosition.copy(this.mesh.position);
      this._barPosition.y += (this._boundsSize.y || 1) / 2 + 0.6;
      this.healthBarMesh.position.copy(this._barPosition);
      const ratio = this.maxHealth ? Math.max(0, this.health) / this.maxHealth : 0;
      this.healthBarMesh.scale.x = Math.max(0.001, ratio);
      if (this.healthBarMesh.material) {
        const col = new THREE.Color().setHSL(ratio * 0.35, 1, 0.5);
        this.healthBarMesh.material.color.copy(col);
      }
    }
    // update price sprite position
    if (this._priceSprite) {
      const base = this.mesh.position.clone();
      this._priceSprite.position.set(base.x, Math.max(1, base.y + 1.0), base.z);
    }
  }

  applyDamage(dmg = 1) {
    if (this.health == null) return false;
    this.health -= dmg;
    try { soundManager.playHit(); } catch (e) {}
    // visual hit flash on material(s)
    if (this.mesh) {
      this.mesh.traverse(c => {
        if (c.material) {
          c.userData = c.userData || {};
          c.userData._origEmissive = c.material.emissive ? c.material.emissive.clone() : new THREE.Color(0x000000);
          if (c.material.emissive) c.material.emissive.setHex(0xffaaaa);
        }
      });
      setTimeout(() => {
        this.mesh.traverse(c => {
          if (c.material && c.userData && c.userData._origEmissive) {
            try { c.material.emissive.copy(c.userData._origEmissive); } catch(e){}
          }
        });
      }, 120);
    }
    if (this.health <= 0) {
      this.destroy();
      return true;
    }
    return false;
  }

  destroy() {
    const scene = this.scene;
    if (scene) {
      for (let i=0;i<12;i++){
        const size = 0.1 + Math.random()*0.4;
        const geo = new THREE.SphereGeometry(size, 6, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive:0x441100 });
        const m = new THREE.Mesh(geo, mat);
        m.position.copy(this.mesh.position);
        m.userData = m.userData || {};
        m.userData.life = 60 + Math.floor(Math.random()*60);
        m.userData.vel = new THREE.Vector3((Math.random()-0.5)*0.6, Math.random()*0.6, (Math.random()-0.5)*0.6);
        scene.add(m);
        if (!scene._explosions) scene._explosions = [];
        scene._explosions.push(m);
      }
    }
    try { soundManager.playExplosion(); } catch (e) {}
    // Award money to the player for destroying this obstacle (3x its base price)
    try {
      const price = (typeof this.price === 'number') ? this.price : (this.health ? Math.floor(this.health/3) : 0);
      if (typeof window !== 'undefined' && window.gameState) {
        if (typeof window.gameState.addMoney === 'function') {
          window.gameState.addMoney((price || 0) * 3);
        } else if (typeof window.gameState.money === 'number') {
          window.gameState.money += (price || 0) * 3;
        }
      }
    } catch(e){}
    try { if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh); } catch(e){}
    try { if (this.healthBarMesh && this.healthBarMesh.parent) this.healthBarMesh.parent.remove(this.healthBarMesh); } catch(e){}
    try { if (this._priceSprite && this._priceSprite.parent) this._priceSprite.parent.remove(this._priceSprite); } catch(e){}
    this._destroyed = true;
  }

  dispose(scene){
    if (!this.mesh) return;
    if (scene) scene.remove(this.mesh);
    this.mesh.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }
}

// Editable obstacles array (populate/change here)
// const obstacles = [
// We'll generate many large, varied targets randomly within a radius around the origin.
const obstacles = [];

// Keep the checkpoint `r2` explicit and unscaled so it's always pass-through
obstacles.push(new Obstacle('rectdonut', { id:'r2', pos: vec(0,40,80), size:{w:50,h:50,thickness:1.7}, color:0xa0c8ff }));

// helper
function rand(min, max) { return min + Math.random() * (max - min); }

// Parameters
const TARGET_COUNT = 45;
const RADIUS = 300; // meters (reduced so targets are slightly closer)
const GROUND_HALF = 500; // ground plane half-size from World
const GROUND_MARGIN = 40; // keep targets inside this margin from edges
const MAX_HEIGHT = 200; // meters
const SHAPES = ['sphere','cylinder','rectdonut','box','cone','torus'];

for (let i = 0; i < TARGET_COUNT; i++) {
  const angle = Math.random() * Math.PI * 2;
  const maxR = Math.min(RADIUS, GROUND_HALF - GROUND_MARGIN);
  const r = Math.sqrt(Math.random()) * maxR; // uniform disc inside safe radius
  let x = Math.cos(angle) * r;
  let z = Math.sin(angle) * r;
  // clamp to ground bounds just in case
  x = Math.max(-GROUND_HALF + GROUND_MARGIN, Math.min(GROUND_HALF - GROUND_MARGIN, x));
  z = Math.max(-GROUND_HALF + GROUND_MARGIN, Math.min(GROUND_HALF - GROUND_MARGIN, z));
  const y = Math.max(1, Math.floor(rand(0, MAX_HEIGHT)));
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const id = `target_${i}`;
  // base sizes intentionally large so after SIZE_SCALE they are very big
  const baseSize = {
    sphere: { r: rand(8, 18) },
    cylinder: { r: rand(6, 14), h: rand(8, 36) },
    rectdonut: { w: rand(20, 60), h: rand(20, 60), thickness: rand(2, 6) },
    box: { w: rand(12, 36), h: rand(12, 36), thickness: rand(4, 12) },
    cone: { r: rand(6, 18), h: rand(10, 40) },
    torus: { r: rand(8, 20), tube: rand(2, 6) }
  };
  const healthVal = Math.floor(rand(80, 300));
  const opts = { id, pos: vec(x, y, z), color: 0x66ccff, health: healthVal };
  // attach shape-specific size props
  if (shape === 'sphere') opts.size = baseSize.sphere;
  else if (shape === 'cylinder') opts.size = baseSize.cylinder;
  else if (shape === 'rectdonut') opts.size = baseSize.rectdonut;
  else if (shape === 'box') opts.size = { w: baseSize.box.w, h: baseSize.box.h, thickness: baseSize.box.thickness };
  else if (shape === 'cone') opts.size = { r: baseSize.cone.r, h: baseSize.cone.h };
  else if (shape === 'torus') opts.size = { r: baseSize.torus.r, thickness: baseSize.torus.tube };

  // derive a base price from health/size so shooting/destroying yields money
  opts.price = Math.max(10, Math.floor(healthVal / 3));
  obstacles.push(new Obstacle(shape, opts));
}

let _start = null;
function initObstacles(scene, now = performance.now()){
  _start = now;
  // attach meshes to scene
  obstacles.forEach(o => {
    if (!o.mesh.parent) scene.add(o.mesh);
    o.scene = scene;
    if (o.healthBarMesh && !o.healthBarMesh.parent) scene.add(o.healthBarMesh);
    if (o._priceSprite && !o._priceSprite.parent) scene.add(o._priceSprite);
  });
}

function updateObstacles(now = performance.now()){
  if (_start === null) _start = now;
  const t = (now - _start) / 1000; // seconds
  // Update obstacles
  obstacles.forEach(o => o.update(t));

  // Update any explosion particles stored on the scene (created by destroyed obstacles)
  const scene = obstacles.length && obstacles[0].scene ? obstacles[0].scene : null;
  if (scene && scene._explosions && scene._explosions.length) {
    for (let i = scene._explosions.length - 1; i >= 0; i--) {
      const m = scene._explosions[i];
      if (!m.userData) { scene._explosions.splice(i,1); continue; }
      m.userData.life -= 1;
      m.position.add(m.userData.vel);
      m.material.opacity = Math.max(0, m.userData.life / 120);
      if (m.userData.life <= 0) {
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
        scene._explosions.splice(i,1);
      }
    }
  }
}

function disposeAll(scene){
  obstacles.forEach(o => o.dispose(scene));
}

export { obstacles, Motion, Obstacle, initObstacles, updateObstacles, disposeAll };