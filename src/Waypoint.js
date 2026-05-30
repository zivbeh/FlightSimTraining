import * as THREE from 'three';

export class Waypoint {
    /**
     * Creates a transparent cylinder waypoint and adds it to the world.
     * @param {Object} world - Your custom World instance containing the scene.
     * @param {Object} [config] - Optional configuration settings.
     */
    constructor(world, { radius = 2, height = 5, color = 0x00ff00, opacity = 0.4, startHeight = 0 } = {}) {
        this.world = world;
        this.radius = radius;
        this.height = height;
        this.startHeight = startHeight;
        this.originalColor = new THREE.Color(color);
        this.activeColor = new THREE.Color(0x00ff00);

        // 1. Setup geometry and transparent material
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
        const material = new THREE.MeshBasicMaterial({
            color: this.originalColor,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            depthWrite: false 
        });

        // 2. Create the mesh
        this.mesh = new THREE.Mesh(geometry, material);

        // 3. Automatically integrate into your world's scene
        if (this.world && this.world.scene) {
            this.world.scene.add(this.mesh);
        } else {
            console.error("Waypoint Error: Provided world object does not contain a valid scene.");
        }
    }

    /**
     * Checks if a position is inside the cylinder and updates its color.
     * @param {THREE.Vector3} planePos - The current position of the airplane.
     */
    update(planePos) {
        if (!this.mesh) return;

        // Calculate horizontal distance (XZ plane)
        const dx = planePos.x - this.mesh.position.x;
        const dz = planePos.z - this.mesh.position.z;
        const distanceXZ = Math.sqrt(dx * dx + dz * dz);

        // Calculate vertical bounds
        const minY = this.mesh.position.y - this.height / 2;
        const maxY = this.mesh.position.y + this.height / 2;

        const isInside = distanceXZ <= this.radius && planePos.y >= minY && planePos.y <= maxY;

        if (isInside) {
            this.mesh.material.color.copy(this.activeColor);
        }
    }

    /**
     * Change the position of the waypoint
     */
    setPosition(x, y, z) {
        // Offset by half-height and startHeight so the bottom of the cylinder 
        // sits at the provided Y level + startHeight.
        this.mesh.position.set(x, y + this.startHeight + this.height / 2, z);
    }

    /**
     * Remove the waypoint from the world and clean up memory
     */
    destroy() {
        if (this.world && this.world.scene) {
            this.world.scene.remove(this.mesh);
        }
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}