// src/obstacles.js
// Three.js obstacle system: spheres, cylinders (any orientation), rectangular donuts (frame).
import * as THREE from 'three';

function vec(x=0,y=0,z=0){ return new THREE.Vector3(x,y,z); }

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
    this.basePos = opts.pos ? opts.pos.clone() : vec();
    this.pos = this.basePos.clone();
    this.size = opts.size || {};
    this.orientation = opts.orientation || new THREE.Euler(0,0,0); // radians
    this.motion = opts.motion || null;
    this.color = opts.color || 0xff6666;
    this.id = opts.id || null;
    this.mesh = this._createMesh();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.copy(this.orientation);
    if (opts.scene) opts.scene.add(this.mesh);
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
    if (!this.motion) return;
    if (Array.isArray(this.motion)) {
      this.motion.forEach(m => m.apply(this.pos, t));
    } else {
      this.motion.apply(this.pos, t);
    }
    this.mesh.position.copy(this.pos);
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
const obstacles = [
  new Obstacle('sphere', { id:'s1', pos: vec(10,3,-20), size:{r:1.2}, motion: new Motion('y',2,3,0), color:0xff7a50 }),
  new Obstacle('sphere', { id:'s2', pos: vec(20,5,-50), size:{r:1.6}, motion: new Motion('x',5,6,0.5), color:0x50b4ff }),
  new Obstacle('cylinder', { id:'c1', pos: vec(-10,2,-30), size:{r:0.9,h:6}, orientation: new THREE.Euler(Math.PI/2,0,0), motion: new Motion('z',6,4,Math.PI/2), color:0xb4ff78 }),
  new Obstacle('cylinder', { id:'c2', pos: vec(0,1,-40), size:{r:1.0,h:4}, motion: new Motion('y',1.2,2.5,1.2), color:0xdfb4ff }),
  new Obstacle('rectdonut', { id:'r1', pos: vec(-25,3,-60), size:{w:8,h:6,thickness:0.6}, motion: new Motion('y',1.5,3.5,0.2), color:0xffdc50 }),
  new Obstacle('rectdonut', { id:'r2', pos: vec(0,40,80), size:{w:50,h:50,thickness:1.7}, color:0xa0c8ff }),
  new Obstacle('sphere', { id:'s3', pos: vec(-40,6,-100), size:{r:2.4}, motion: new Motion(new THREE.Vector3(1,0.2,0),1,4,0.4), color:0xff8cb8 })
];

let _start = null;
function initObstacles(scene, now = performance.now()){
  _start = now;
  // attach meshes to scene
  obstacles.forEach(o => {
    if (!o.mesh.parent) scene.add(o.mesh);
  });
}

function updateObstacles(now = performance.now()){
  if (_start === null) _start = now;
  const t = (now - _start) / 1000; // seconds
  obstacles.forEach(o => o.update(t));
}

function disposeAll(scene){
  obstacles.forEach(o => o.dispose(scene));
}

export { obstacles, Motion, Obstacle, initObstacles, updateObstacles, disposeAll };