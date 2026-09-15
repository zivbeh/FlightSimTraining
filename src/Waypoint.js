import * as THREE from 'three';
import { Body } from './Body.js';
import { createGameEvent } from './GameEvent.js';

export class Waypoint extends Body {
    /**
     * Creates a transparent waypoint (cylinder or box) and adds it to the world.
     * @param {Object} world - Your custom World instance containing the scene.
     * @param {Object} [config] - Optional configuration settings.
     */
    constructor(world, { radius = 2, height = 5, width = null, depth = null, color = 0x00ff00, opacity = 0.4, startHeight = 0, type = 'cylinder', hideOnPass = true } = {}) {
        super(world);
        this.world = world;
        this.radius = radius;
        this.height = height;
        this.width = width;
        this.depth = depth;
        this.startHeight = startHeight;
        this.type = type;
        this.opacity = opacity;
        this.hideOnPass = hideOnPass;
        this.originalColor = new THREE.Color(color);
        this.activeColor = new THREE.Color(0x00ff00);
        this.active = false;
        this.passed = false;
        this.hideTimer = null;
        this.onEvent = null;
        this.lastPosition = new THREE.Vector3();
        this.hasLastPosition = false;

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
        this.model = this.mesh;

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

        const containsPosition = (position) => {
            if (this.type === 'box' && this.width && this.depth) {
                const halfW = this.width / 2;
                const halfD = this.depth / 2;
                const halfH = this.height / 2;
                return Math.abs(position.x - this.mesh.position.x) <= halfW
                    && Math.abs(position.y - this.mesh.position.y) <= halfH
                    && Math.abs(position.z - this.mesh.position.z) <= halfD;
            }

            const dx = position.x - this.mesh.position.x;
            const dz = position.z - this.mesh.position.z;
            const distanceXZ = Math.sqrt(dx * dx + dz * dz);
            const minY = this.mesh.position.y - this.height / 2;
            const maxY = this.mesh.position.y + this.height / 2;
            const verticalTolerance = 3;
            return distanceXZ <= this.radius
                && position.y >= minY - verticalTolerance
                && position.y <= maxY + verticalTolerance;
        };

        const distance = this.hasLastPosition ? this.lastPosition.distanceTo(planePos) : 0;
        const sampleCount = this.hasLastPosition
            ? Math.max(1, Math.ceil(distance / Math.max(this.radius, 1)))
            : 1;
        let isInside = false;
        for (let index = 0; index <= sampleCount; index += 1) {
            const sample = this.hasLastPosition
                ? this.lastPosition.clone().lerp(planePos, index / sampleCount)
                : planePos;
            if (containsPosition(sample)) {
                isInside = true;
                break;
            }
        }
        this.lastPosition.copy(planePos);
        this.hasLastPosition = true;

        if (isInside) {
            this.mesh.material.color.copy(this.activeColor);
            if (!this.active) {
                this.active = true;
                if (!this.passed) {
                    this.passed = true;
                    this.passCheckpoint();  // Turn green and schedule hide
                    this.onEvent?.(createGameEvent('waypoint-reached', {
                        source: this,
                        sourceType: 'waypoint',
                        subject: this,
                        subjectType: 'waypoint',
                        position: this.position,
                        data: { waypoint: this },
                    }));
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

        if (!this.hideOnPass) return;

        // Clear any existing timer
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
        }

        // Schedule removal after 5 seconds
        this.hideTimer = setTimeout(() => {
            if (this.mesh) this.mesh.visible = false;
            this.hideTimer = null;
        }, 5000);
    }

    /**
     * Change the position of the waypoint
     */
    setPosition(x, y, z) {
        // Position so the bottom of the waypoint sits at y + startHeight
        // For both cylinders and boxes, center is at bottom + height/2
        this.position.set(x, y + this.startHeight + this.height / 2, z);
        this.updateModelPosition();
    }

    /**
     * Remove the waypoint from the world and clean up memory
     */
    reset() {
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        this.active = false;
        this.passed = false;
        this.hasLastPosition = false;
        if (this.mesh) {
            this.mesh.visible = true;
            if (this.world && this.world.scene && this.mesh.parent !== this.world.scene) {
                this.world.scene.add(this.mesh);
            }
        }
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
