import * as THREE from 'three';

export class Waypoint {
    /**
     * Creates a transparent waypoint (cylinder or box) and adds it to the world.
     * @param {Object} world - Your custom World instance containing the scene.
     * @param {Object} [config] - Optional configuration settings.
     */
    constructor(world, { radius = 2, height = 5, width = null, depth = null, color = 0x00ff00, opacity = 0.4, startHeight = 0, type = 'cylinder' } = {}) {
        this.world = world;
        this.radius = radius;
        this.height = height;
        this.width = width;
        this.depth = depth;
        this.startHeight = startHeight;
        this.type = type;
        this.opacity = opacity;
        this.originalColor = new THREE.Color(color);
        this.activeColor = new THREE.Color(0x00ff00);
        this.active = false;
        this.passed = false;
        this.hideTimer = null;

        // 1. Setup geometry based on type
        let geometry;
        if (type === 'box' && width && depth) {
            // Box geometry for landing checkpoints
            geometry = new THREE.BoxGeometry(width, height, depth);
        } else {
            // Default cylinder geometry
            geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
        }

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
     * Checks if a position is inside the waypoint and updates its color.
     * @param {THREE.Vector3} planePos - The current position of the airplane.
     */
    update(planePos) {
        if (!this.mesh) return false;

        let isInside = false;

        if (this.type === 'box' && this.width && this.depth) {
            // Box collision detection
            const halfW = this.width / 2;
            const halfD = this.depth / 2;
            const halfH = this.height / 2;
            
            const dx = Math.abs(planePos.x - this.mesh.position.x);
            const dy = Math.abs(planePos.y - this.mesh.position.y);
            const dz = Math.abs(planePos.z - this.mesh.position.z);
            
            isInside = dx <= halfW && dy <= halfH && dz <= halfD;
        } else {
            // Cylinder collision detection
            const dx = planePos.x - this.mesh.position.x;
            const dz = planePos.z - this.mesh.position.z;
            const distanceXZ = Math.sqrt(dx * dx + dz * dz);

            const minY = this.mesh.position.y - this.height / 2;
            const maxY = this.mesh.position.y + this.height / 2;

            isInside = distanceXZ <= this.radius && planePos.y >= minY && planePos.y <= maxY;
        }

        if (isInside) {
            this.mesh.material.color.copy(this.activeColor);
            if (!this.active) {
                this.active = true;
                if (!this.passed) {
                    this.passed = true;
                    this.passCheckpoint();  // Turn green and schedule hide
                    return true;
                }
            }
        } else {
            this.active = false;
        }

        return false;
    }

    /**
     * Called when checkpoint is passed - turn green and hide after 5 seconds
     */
    passCheckpoint() {
        if (!this.mesh) return;

        // Turn green
        this.mesh.material.color.set(0x00ff00);

        // Clear any existing timer
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
        }

        // Schedule removal after 5 seconds
        this.hideTimer = setTimeout(() => {
            if (this.mesh && this.world && this.world.scene) {
                this.world.scene.remove(this.mesh);
                this.mesh = null;
            }
        }, 5000);
    }

    /**
     * Change the position of the waypoint
     */
    setPosition(x, y, z) {
        // Position so the bottom of the waypoint sits at y + startHeight
        // For both cylinders and boxes, center is at bottom + height/2
        this.mesh.position.set(x, y + this.startHeight + this.height / 2, z);
    }

    /**
     * Remove the waypoint from the world and clean up memory
     */
    reset() {
        this.active = false;
        this.passed = false;
        if (this.mesh && this.mesh.material) {
            this.mesh.material.color.copy(this.originalColor);
        }
    }

    destroy() {
        if (this.world && this.world.scene) {
            this.world.scene.remove(this.mesh);
        }
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}