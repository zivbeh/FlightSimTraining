import { Aircraft } from './Aircraft.js';
import * as THREE from 'three';

export class Rocket extends Aircraft {
    constructor(world) {
        super(world);
        this.groundOffset.y = -3.3
        this.mass = 200 // kg
        this.fuel = 70 // kg

        // Initialize throttle as an array for multi-rotor control
        this.scale = 7
        const startPoint = new THREE.Vector3(0, 0, 0);
        const endPoint = new THREE.Vector3(0, 0, 0);
        this.arrowCombined = this.createArrow(startPoint, endPoint, 0xffff00);
        this.loadModel("../assets/missile1.glb")
        this.restart()
    }

    visualizeArrows() {
        this.arrowCombined.setDirection(this.model.quaternion.clone().normalize());
        this.arrowCombined.setLength(6);
        this.arrowCombined.position.set(this.position.x, this.position.y, this.position.z);
    }
    createArrow(start, end, color = 0xff0000) {
        // 1. Calculate the direction vector
        const direction = new THREE.Vector3().subVectors(end, start);
        
        // 2. Calculate the distance (length)
        const distance = direction.length();
        
        // 3. Normalize the direction (Three.js arrows require length 1 for direction)
        direction.normalize();

        // 4. Create the arrow
        // ArrowHelper(direction, origin, length, color)
        const arrow = new THREE.ArrowHelper(direction, start, distance, color);
        
        this.scene.add(arrow);
        return arrow;
    }

    /**
     * Overrides Aircraft.restart to ensure the throttle control remains an array.
     */
    restart() {
        super.restart();
        this.resetControls()
        // Aircraft.restart sets throttle to 0; we need it to be an array.
    }

    resetControls() {
        this.controls = {throttle: 0, fin1: 0, fin2: 0, fin3: 0, fin4: 0};
    }

    updateTime() {
        super.updateTime()
        // this.visualizeArrows()
    }
    
    updateAerodynamics() {
        const dc = [0.07, 0.004, 0.07]
        const adc = [0.07, 0.02, 0.07]
        const adlc = [[0, 0, -0.5], [0, 0, 0], [0.5, 0, 0]];
        this.applyDrag(dc, adc, adlc)
        this.applyThrust()

        const dir = this.directions
        const vel = this.relativeVelocity
        const zDragCoeff = 0.004; // forward drag
        const zDrag = Math.sign(vel.y) * Math.pow(vel.y, 2) * zDragCoeff;

        // fin number is like a clock order
        // add angular drag from controls
        this.angularVelocity.addScaledVector(dir.x, zDrag * this.controls.fin2 * 0.1);
        this.angularVelocity.addScaledVector(dir.x, zDrag * this.controls.fin4 * -0.1);
        this.angularVelocity.addScaledVector(dir.y, zDrag * this.controls.fin1 * 0.1);
        this.angularVelocity.addScaledVector(dir.y, zDrag * this.controls.fin2 * 0.1);
        this.angularVelocity.addScaledVector(dir.y, zDrag * this.controls.fin3 * 0.1);
        this.angularVelocity.addScaledVector(dir.y, zDrag * this.controls.fin4 * 0.1);
        this.angularVelocity.addScaledVector(dir.z, zDrag * this.controls.fin1 * -0.1);
        this.angularVelocity.addScaledVector(dir.z, zDrag * this.controls.fin3 * 0.1);
    }
    
    applyThrust() {
        if (!this.model) return;
        if (this.isCrashed) return

        const forward = this.directions.y;
        const massDisplacementRate = this.controls.throttle * 0.03
        if (this.fuel < massDisplacementRate) return
        this.fuel -= massDisplacementRate
        this.mass -= massDisplacementRate
        const effectiveExhaustVelocity = 200
        const thrustForce = massDisplacementRate * effectiveExhaustVelocity;
        const thrustAcc = thrustForce / this.mass
        this.velocity.addScaledVector(forward, thrustAcc);
    }

    handleGroundCollision() {
        const floorHeight = -this.groundOffset.y;
        // Only check for crash at the moment of impact (transitioning from air to ground)
        if (this.wasAirborne) {
            // const hardImpact = this.velocity.y < -0.15; // Threshold for hard impact
            const leveled = Math.abs(this.rotation.x) / Math.PI * 180 < 5
                         && Math.abs(this.rotation.z) / Math.PI * 180 < 5;
            const drifting = Math.abs(this.velocity.x) > 0.2 || Math.abs(this.velocity.z) > 0.2;
            const safe = this.velocity.y > -0.3 && (leveled || this.velocity.y > -0.1) && !drifting;
            if (!safe) {
                this.handleCrash();
                this.position.y = floorHeight;
                this.wasAirborne = false;
                return; // leave plane in crashed orientation
            }
        }
        this.wasAirborne = false;

        // Normal ground: settle, correct orientation, apply friction
        this.position.y = floorHeight;
        
        if (this.velocity.y <= this.gravity) {
            this.velocity.y = 0;
        }
        this.setRotationZ(0)
        this.setRotationX(0)
        

        this.applyGroundFriction()
    }
    
    applyGroundFriction() {
        const dir = this.directions
        const vel = this.relativeVelocity
        const avel = this.relativeAngularVelocity
        
        const zMuK = 0.2;
        const xMuK = 0.2;

        this.velocity.addScaledVector(dir.x, -vel.x * xMuK);
        this.velocity.addScaledVector(dir.z, -vel.z * zMuK);

        const yAngularMuK = 0.2;

        this.angularVelocity.addScaledVector(dir.y, -avel.y * yAngularMuK);
    }

    spawnExplosion() {
            const numParticles = 170;
            for (let i = 0; i < numParticles; i++) {
                const size = 0.5 + Math.random() * 1.0;
                const geometry = new THREE.SphereGeometry(size, 8, 8);
                const material = new THREE.MeshStandardMaterial({
                    color: '#994e0c', // Orange-red
                    emissive: 0x441100,
                    roughness: 0.8,
                    transparent: true,
                    opacity: 1.0
                });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(this.position.x, this.position.y, this.position.z);
                this.scene.add(mesh);
    
                // Random velocity for explosion effect
                const vel = new THREE.Vector3(
                    (Math.random() - 0.5) * 3,
                    Math.random() * 1,
                    (Math.random() - 0.5) * 3,
                );
    
                this.particles.push({
                    mesh: mesh,
                    life: 140,
                    maxLife: 180,
                    velocity: vel
                });
            }
        }

    updateKeys(keys) {
        if (this.isCrashed) return; // No control when crashed
        if (this.codeRunner.running) return; // Disable manual controls when code is running

        let throttle = 0.0; // Hover power
        if (keys.has('arrowup') || keys.has(' ')) throttle = 1;

        let yaw = 0;
        if (keys.has('d')) yaw -= 1
        if (keys.has('a')) yaw += 1

        let pitch = 0;
        if (keys.has('w')) pitch += 1
        if (keys.has('s')) pitch -= 1

        let roll = 0;
        if (keys.has('arrowright')) roll -= 0.1
        if (keys.has('arrowleft')) roll += 0.1

        // fin number is like a clock order
        const f1 = (yaw - roll)    * 4
        const f2 = (pitch - roll)  * 4
        const f3 = (-yaw - roll)   * 4
        const f4 = (-pitch - roll) * 4
        this.controls.fin1 = f1
        this.controls.fin2 = f2
        this.controls.fin3 = f3
        this.controls.fin4 = f4
        this.controls.throttle = throttle
    }

    getApi() {
        return {
            setFin1: (instance, value) => {
                this.controls.fin1 = value;
            },
            setFin2: (instance, value) => {
                this.controls.fin2 = value;
            },
            setFin3: (instance, value) => {
                this.controls.fin3 = value;
            },
            setFin4: (instance, value) => {
                this.controls.fin4 = value;
            },
            setThrottle: (instance, value) => {
                this.controls.throttle = value;
            }
        }
    }

    updateInfo() {
        super.updateInfo()
        const q = this.model.quaternion
        this.info.quaternion = {
            x: parseFloat(q.x.toFixed(3)),
            y: parseFloat(q.y.toFixed(3)),
            z: parseFloat(q.z.toFixed(3)),
            w: parseFloat(q.w.toFixed(3))
        }
        this.info.fuel = this.fuel / 70
    }
}

