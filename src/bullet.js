import * as THREE from 'three';

export default class Bullet {
  constructor(scene, opts = {}) {
    this.basePos = opts.pos.clone();
    this.pos = this.basePos.clone();
    this.dir = opts.dir;
    this.speed = 0.1;
    this.active = true;
    
    this.scene = scene;
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1, 4, 2), new THREE.MeshBasicMaterial({ color: 0xdf0d0f }));
    this.mesh.position.copy(this.pos);
    
    scene.add(this.mesh);

  }

  update() {
    if (!this.active) return;
    this.pos.x += this.speed * this.dir.x;
    this.pos.y += this.speed * this.dir.y;
    this.pos.z += this.speed * this.dir.z;
    this.mesh.position.copy(this.pos);
    console.log(this.pos);
    
    // Deactivate if it goes off-screen
    // if (this.pos.y < -this.height) {
    //   this.active = false;
    //   this.scene.remove(this.mesh);
    // }
  }
}