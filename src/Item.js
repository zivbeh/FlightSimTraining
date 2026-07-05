import * as THREE from 'three';

export class Item {
    constructor(options = {}) {
        this.position = (options.position || options.pos || new THREE.Vector3()).clone();
        this.radius = typeof options.radius === 'number' ? options.radius : 8;
        this.onEnter = typeof options.onEnter === 'function' ? options.onEnter : null;
        this.triggered = false;
        this.defaultColor = options.color ?? 0x8a2be2;
        this.activeColor = options.activeColor ?? 0xffd54f;
        this.mesh = this.createMesh(this.defaultColor);
        this.mesh.position.copy(this.position);
        this.scene = null;
    }

    createMesh(color) {
        const material = new THREE.MeshStandardMaterial({
            color,
            emissive: 0x220033,
            emissiveIntensity: 0.5,
            roughness: 0.4,
            metalness: 0.2
        });
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        return new THREE.Mesh(geometry, material);
    }

    addToScene(scene) {
        if (!scene || !this.mesh) return;
        this.scene = scene;
        if (!this.mesh.parent) scene.add(this.mesh);
    }

    setPosition(x, y, z) {
        this.position.set(x, y, z);
        if (this.mesh) this.mesh.position.copy(this.position);
    }

    activate() {
        if (this.triggered) return;
        this.triggered = true;
        if (this.mesh?.material) {
            this.mesh.material.color.setHex(this.activeColor);
            this.mesh.material.emissive.setHex(0x332200);
            this.mesh.material.emissiveIntensity = 1.2;
        }
        if (typeof this.onEnter === 'function') {
            this.onEnter(this);
        }
    }

    update(targetPosition) {
        if (!targetPosition || this.triggered || !this.onEnter) return;

        const distance = targetPosition.distanceTo(this.position);
        if (distance <= this.radius) {
            this.activate();
        }
    }
}
