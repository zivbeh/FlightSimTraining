import { Aircraft } from './Aircraft.js';
import * as THREE from 'three';

export class Drone extends Aircraft {
    constructor(world) {
        super(world);
        this.groundOffset.y = 0
        // A drone is defined by a collection of propellers.
        // Each propeller has a local position relative to the center and a local thrust direction vector.
        // torqueFactor: 1 for CCW motor (CW body torque), -1 for CW motor (CCW body torque)
        this.propellers = [
            { position: new THREE.Vector3(1, 0, 1), direction: new THREE.Vector3(0, 1, 0), torqueFactor: -1 },  // FR: CW
            { position: new THREE.Vector3(-1, 0, 1), direction: new THREE.Vector3(0, 1, 0), torqueFactor: 1 },  // FL: CCW
            { position: new THREE.Vector3(1, 0, -1), direction: new THREE.Vector3(0, 1, 0), torqueFactor: 1 },  // RR: CCW
            { position: new THREE.Vector3(-1, 0, -1), direction: new THREE.Vector3(0, 1, 0), torqueFactor: -1 } // RL: CW
        ];
        // Initialize throttle as an array for multi-rotor control
        this.scale = 4
        this.loadModel('../assets/quadcopter.glb')
        this.restart()
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
        this.controls.throttle = new Array(this.propellers.length).fill(0);
    }
    
    updateAerodynamics() {
        const dc = [0.004, 0.008, 0.004]
        const adc = [0.015, 0.01, 0.015]
        this.applyDrag(dc, adc)
        this.applyThrust()
    }
    
    applyThrust() {
        if (!this.model) return;

        // If out of fuel, motors produce no thrust
        let hasFuel = true;
        if (typeof this.fuel === 'number' && this.fuel <= 0) {
            hasFuel = false;
            if (!this._noFuelWarned) {
                try { soundManager.playEmpty(); } catch(e) {}
                this._noFuelWarned = true;
            }
        } else {
            this._noFuelWarned = false;
        }

        const pitchSpeed = 5; // Speed limit for propeller air movement
        const baseThrustMagnitude = 0.02;
        const reactionTorqueFactor = 0.4; // How much the motor rotation affects drone yaw
        let maxThrottle = 0;

        this.propellers.forEach((prop, index) => {
            const throttleValue = Math.min(Math.max(this.controls.throttle[index], -1), 1);
            const throttleEff = hasFuel ? throttleValue : 0;
            maxThrottle = Math.max(maxThrottle, throttleEff);

            // 1. Calculate world-space thrust direction
            const worldThrustDir = prop.direction.clone().applyQuaternion(this.model.quaternion).normalize();

            // 2. Propeller Efficiency (Linear drop-off based on airspeed in thrust direction)
            const airSpeed = Math.max(0, this.velocity.dot(worldThrustDir)) * 3;
            const thrustEfficiency = Math.max(0, 1.0 - (airSpeed / pitchSpeed));

            // 3. Calculate final magnitude (Aerodynamically influenced)
            const magnitude = throttleEff * thrustEfficiency * baseThrustMagnitude;
            
            // 4. Apply Linear Force
            this.velocity.addScaledVector(worldThrustDir, magnitude);

            // 5. Apply Torque (r x F - Leverage torque for Pitch/Roll)
            const localForce = prop.direction.clone().multiplyScalar(magnitude);
            const localTorque = new THREE.Vector3().crossVectors(prop.position, localForce);
            const worldTorque = localTorque.applyQuaternion(this.model.quaternion);
            this.angularVelocity.add(worldTorque);

            // 6. Apply Reaction Torque (Counter-torque for Yaw)
            const reactionTorque = worldThrustDir.clone().multiplyScalar(magnitude * prop.torqueFactor * reactionTorqueFactor);
            this.angularVelocity.add(reactionTorque);
        });

    }

    handleGroundCollision() {
        const floorHeight = -this.groundOffset.y;
        // Only check for crash at the moment of impact (transitioning from air to ground)
        if (this.wasAirborne) {
            // const hardImpact = this.velocity.y < -0.15; // Threshold for hard impact
            const leveled = Math.abs(this.rotation.x) / Math.PI * 180 < 15
                         && Math.abs(this.rotation.z) / Math.PI * 180 < 15;
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

    updateKeys(keys) {
        if (this.isCrashed) return; // No control when crashed
        if (this.codeRunner.running) return; // Disable manual controls when code is running

        // 1. Calculate flight axes from 8 keys
        let throttleBase = 0.0; // Hover power
        if (keys.has('arrowup') || keys.has(' ')) throttleBase += 0.35;
        if (keys.has('arrowdown')) throttleBase -= 0.45;

        let yaw = 0;
        if (keys.has('arrowright')) yaw -= 0.1;
        if (keys.has('arrowleft')) yaw += 0.1;

        let pitch = 0;
        if (keys.has('w')) pitch += 0.1;
        if (keys.has('s')) pitch -= 0.1;

        let roll = 0;
        if (keys.has('d')) roll -= 0.1;
        if (keys.has('a')) roll += 0.1;

        // 2. Mix axes for X-Configuration Quadcopter
        // Indices: 0:FrontRight, 1:FrontLeft, 2:RearRight, 3:RearLeft
        const t0 = Math.min(Math.max(-1, throttleBase - pitch - roll - yaw), 1);
        const t1 = Math.min(Math.max(-1, throttleBase - pitch + roll + yaw), 1);
        const t2 = Math.min(Math.max(-1, throttleBase + pitch - roll + yaw), 1);
        const t3 = Math.min(Math.max(-1, throttleBase + pitch + roll - yaw), 1);
        this.controls.throttle[0] = t0;
        this.controls.throttle[1] = t1;
        this.controls.throttle[2] = t2;
        this.controls.throttle[3] = t3;
    }

    getApi() {
        return {
            setThrottle: (instance, index, value) => {
                this.controls.throttle[index] = value;
            }
        }
    }
}

