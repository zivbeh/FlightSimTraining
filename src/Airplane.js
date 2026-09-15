import Bullet from './bullet.js';
import { soundManager } from './sound.js';
import { obstacles } from './obstacle.js';
import { Aircraft } from './Aircraft.js';
import { createGameEvent } from './GameEvent.js';
import * as THREE from 'three';

export class Airplane extends Aircraft {

    constructor(world) {
        super(world);

        // History for height trend (position.y over time)
        this.heightHistory = [];
        this.historyFrames = 120; // ~2 seconds at 60fps
        
        // bullets / shooting
        this.bullets = [];
        this.fireInterval = 8; // frames between automatic shots (if auto enabled)
        this.fireCounter = 0; // frame counter for auto fire
        this.fireCooldownMs = 150;
        this._lastShotAt = -Infinity;
        this.bulletSpeed = 1.6; // tunable bullet travel speed
        this.bulletLife = 180; // frames until bullet expires
        this.fireAuto = false; // set true to auto-fire at `fireInterval`
        this.wingOffsets = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)];
        this.ammoCapacity = 200;
        this.ammo = this.ammoCapacity;

        // Fuel
        this.fuelCapacity = 100;
        this.fuelConsumptionRate = 0.05
        
        // Propeller
        this.propeller = null
        this.leftAileron = null;
        this.rightAileron = null;
        this.leftElevator = null;
        this.rightElevator = null;
        this.propSpeed = 0

        const startPoint = new THREE.Vector3(0, 0, 0);
        const endPoint = new THREE.Vector3(0, 0, 0);
        this.arrowCombined = this.createArrow(startPoint, endPoint, 0xffff00);
        this.loadModel();
        this.restart();
    }

    restart() {
        if (this.bullets) {
            this.bullets.forEach(bullet => bullet.dispose());
            this.bullets.length = 0;
        }
        super.restart();
        this.resetControls();
        this.heightHistory = [];
        this.ammo = this.ammoCapacity;
        this._lastShotAt = -Infinity;
        this.propSpeed = 0;
        this.fuel = this.fuelCapacity;
    }

    resetControls() {
        this.controls = { aileronLeft: 0, aileronRight: 0, elevatorLeft: 0, elevatorRight: 0, steeringWheel: 0, throttle: 0 };
    }

    updateTime(dt = 1 / 60) {
        super.updateTime(dt);
        this.updateBullets(dt);
        // this.visualizeArrows()
    }

    shoot() {
        // The public scripting API can call shoot() many times in one tick.
        // Enforce the fire rate here so every caller is protected from bursts.
        const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        if (now - this._lastShotAt < this.fireCooldownMs) return false;

        // Check ammo
        if (typeof this.ammo === 'number' && this.ammo <= 0) {
            if (now - this._lastShotAt >= 250) {
                this._lastShotAt = now;
                try { soundManager.playEmpty(); } catch(e) {}
            }
            return false;
        }
        this._lastShotAt = now;
        // Determine forward direction (fallback if not available)
        let forward = new THREE.Vector3(0, 0, 1);
        if (this.directions && this.directions.z && this.directions.z.length()) {
            forward = this.directions.z.clone().normalize();
        }
        const spawnPos = new THREE.Vector3(this.position.x, this.position.y + 0.2, this.position.z).addScaledVector(forward, 4);
        const b = new Bullet(this.scene, { pos: spawnPos, dir: forward, speed: this.bulletSpeed, damage: this.bulletDamage, life: this.bulletLife });
        this.bullets.push(b);
        if (typeof this.ammo === 'number') this.ammo = Math.max(0, this.ammo - 1);
        // small muzzle flash (a quickly-fading point light)
        try {
            const flash = new THREE.PointLight(0xffddaa, 1.2, 6, 2);
            flash.position.copy(spawnPos);
            this.scene.add(flash);
            setTimeout(() => { try { this.scene.remove(flash); } catch(e){} }, 80);
        } catch (e) {}
        // play sound
        try { soundManager.playShoot(); } catch (e) {}
        this.onGameEvent?.(createGameEvent('aircraft-shot', {
            source: this,
            sourceType: 'aircraft',
            subject: b,
            subjectType: 'bullet',
            position: spawnPos,
            data: { aircraft: this, bullet: b },
        }));
        return true;
    }

    // Override updateAnimations to include bullet updates
    updateAnimations(dt = 1 / 60) {
        super.updateAnimations(dt);
        this.updatePropeller(dt)
        this.updateControlSurfaces()
    }

    updateControlSurfaces() {
        // if (this.leftAileron) {
        //     this.leftAileron.rotation.x = THREE.MathUtils.degToRad(this.controls.aileronLeft);
        // }
        // if (this.rightAileron) {
        //     this.rightAileron.rotation.x = THREE.MathUtils.degToRad(this.controls.aileronRight);
        // }
        // if (this.leftElevator) {
        //     this.leftElevator.rotation.x = THREE.MathUtils.degToRad(this.controls.elevatorLeft);
        // }
        // if (this.rightElevator) {
        //     this.rightElevator.rotation.x = THREE.MathUtils.degToRad(this.controls.elevatorRight);
        // }
    }

    // Override updateChecks to track height history
    updateChecks() {
        super.updateChecks();
        
        // Update height-history for trend analysis
        this.heightHistory.push(this.position.y);
        if (this.heightHistory.length > this.historyFrames) {
            this.heightHistory.shift();
        }
    }

    updateBullets(dt = 1 / 60) {
        this.bullets.forEach(b => b.update(dt));
        this.bullets = this.bullets.filter(b => b.active);
    }

    drawBullets(ctx) {
        this.bullets.forEach(b => b.draw(ctx));
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

    visualizeArrows() {
        this.arrowCombined.setDirection(this.velocity.clone().normalize());
        this.arrowCombined.setLength(this.velocity.length() * 30);
        this.arrowCombined.position.set(this.position.x, this.position.y, this.position.z);
    }

    handleGroundCollision(dt = 1 / 60) {
        const floorHeight = -this.groundOffset.y;
        // Only check for crash at the moment of impact (transitioning from air to ground)
        if (this.wasAirborne) {
            const impactSpeed = Math.abs(this.velocity.y);      // how fast it fell
            const rollAngle   = Math.abs(this.rotation.z);      // actual roll
            const pitchDown   = this.rotation.x < -15 * Math.PI / 180; // nose-down
            const speed       = this.velocity.length();

            const hardImpact = impactSpeed > 0.15;               // fell too fast
            const badRoll    = rollAngle > 25 * Math.PI / 180;   // hit while banked
            const noseDive   = pitchDown && speed > 0.2;         // flew into ground

            if (hardImpact || badRoll || noseDive) {
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
        if (this.rotation.x > 0) {
            this.setRotationX(0)
        }

        const newRotationX = Math.max(this.rotation.x, this.rotation.x * this.relativeVelocity.z * 2)
        this.setRotationX(newRotationX)
        this.applyGroundFriction(dt)
        if (this.checkRunwayLanding()) {
            this.applyRunwayFriction(dt);
        }
    }

    updateAerodynamics(dt = 1 / 60) {
        const frameScale = dt * 60;
        const dc = [0.07, 0.25, 0.004]
        const adc = [0.07, 0.02, 0.09]
        const adlc = [[0, 0.5, 0], [-1.6, 0, 0], [-0.5, 0, 0]];
        this.applyDrag(dc, adc, adlc, dt)
        this.applyThrust(dt)

        const dir = this.directions
        const vel = this.relativeVelocity
        const zDragCoeff = 0.004; // forward drag
        const zDrag = -Math.sign(vel.z) * Math.pow(vel.z, 2) * zDragCoeff;
        
        // add angular drag from controls
        this.angularVelocity.addScaledVector(dir.x, -zDrag * this.controls.elevatorLeft * 0.105 * frameScale);
        this.angularVelocity.addScaledVector(dir.x, -zDrag * this.controls.elevatorRight * 0.105 * frameScale);
        this.angularVelocity.addScaledVector(dir.y, -zDrag * this.controls.elevatorLeft * -0.035 * frameScale);
        this.angularVelocity.addScaledVector(dir.y, -zDrag * this.controls.elevatorRight * 0.035 * frameScale);
        this.angularVelocity.addScaledVector(dir.z, -zDrag * this.controls.aileronLeft * 0.06 * frameScale);
        this.angularVelocity.addScaledVector(dir.z, -zDrag * this.controls.aileronRight * -0.06 * frameScale);
    }


    // Override applyThrust with fuel management
    applyThrust(dt = 1 / 60) {
        if (!this.model) return;
        if (this.isCrashed) return
        const throttle = this.controls.throttle
        const frameScale = dt * 60;
        this.fuel -= this.fuelConsumptionRate * Math.pow(throttle, 1.5) * frameScale
        if (this.fuel < 0) {
            this.fuel = 0
            return
        }

        const throttleToPropSpeed = 2.5
        if (this.propSpeed < throttle * throttleToPropSpeed) {
            this.propSpeed = throttle * throttleToPropSpeed
        }

        // 1. Get Forward Direction
        const forward = this.directions.z;

        // 2. Propeller Efficiency (Linear drop-off model)
        const airSpeed = Math.max(0, this.velocity.dot(forward))*3;

        const pitchSpeed = 2;
        const thrustEfficiency = Math.max(0, 1.0 - (airSpeed / pitchSpeed));

        // 3. Air Density Effect
        const altitude = Math.max(0, this.position.y);
        const densityFactor = 1

        // 4. Calculate final magnitude
        const thrustMagnitude = throttle * thrustEfficiency * densityFactor * 0.03 * (this.speedMultiplier || 1);

        this.velocity.addScaledVector(forward, thrustMagnitude * frameScale);
    }

    applyGroundFriction(dt = 1 / 60) {
        const dir = this.directions
        const vel = this.relativeVelocity
        const avel = this.relativeAngularVelocity
        
        const zMuK = 0.007;
        const xMuK = 0.2;

        const frameScale = dt * 60;
        this.velocity.addScaledVector(dir.x, -vel.x * xMuK * frameScale);
        this.velocity.addScaledVector(dir.z, -vel.z * zMuK * frameScale);

        const yAngularMuK = 0.02;

        this.angularVelocity.addScaledVector(dir.y, -avel.y * yAngularMuK * frameScale);
        this.angularVelocity.addScaledVector(dir.y, vel.z * this.controls.steeringWheel * -0.0001 * frameScale);
    }

    applyRunwayFriction(dt = 1 / 60) {
        const runwayCollision = this.checkRunwayLanding();
        if (!runwayCollision) return;

        const verticalOffset = this.position.y - runwayCollision.landingHeight;
        if (verticalOffset > 0.1 || this.velocity.y > 0.05) return;

        const speed = Math.hypot(this.velocity.x, this.velocity.z);
        if (speed <= 0.02) {
            this.velocity.x = 0;
            this.velocity.z = 0;
            return;
        }

        const brakeFactor = Math.pow(0.975, dt * 60);
        this.velocity.x *= brakeFactor;
        this.velocity.z *= brakeFactor;

        if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
        if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;
    }

    updatePropeller(dt = 1 / 60) {
        if (!this.model) return;
        if (!this.propeller) return
        const frameScale = dt * 60;
        this.propeller.rotateZ(-this.propSpeed * frameScale)
        this.propSpeed *= Math.pow(1 - 0.025, frameScale)
    }

    // Airplane controls
    updateKeys(keys) {
        if (this.isCrashed) return;
        if (this.codeRunner.running) return;
        
        const angle = 16;
        this.controls.aileronLeft = 0;
        this.controls.aileronRight = 0;
        this.controls.elevatorLeft = 0;
        this.controls.elevatorRight = 0;
        this.controls.steeringWheel = 0;
        this.controls.throttle = 0;

        if (keys.has('w')) {
            this.controls.elevatorLeft += angle;
            this.controls.elevatorRight += angle;
        }
        if (keys.has('s')) {
            this.controls.elevatorLeft -= angle;
            this.controls.elevatorRight -= angle;
        }
        if (keys.has('d')) {
            this.controls.aileronLeft += angle;
            this.controls.aileronRight -= angle;
        }
        if (keys.has('a')) {
            this.controls.aileronLeft -= angle;
            this.controls.aileronRight += angle;
        }
        if (keys.has('e')) {
            this.controls.elevatorLeft += angle;
            this.controls.elevatorRight -= angle;
            this.controls.steeringWheel += 20;
        }
        if (keys.has('q')) {
            this.controls.elevatorLeft -= angle;
            this.controls.elevatorRight += angle;
            this.controls.steeringWheel -= 20;
        }
        if (keys.has(' ')) {
            this.controls.throttle = 0.8;
        }
        if (keys.has('r')) {
            this.shoot();
        }
        this.controls.elevatorLeft = Math.max(-angle, Math.min(angle, this.controls.elevatorLeft));
        this.controls.elevatorRight = Math.max(-angle, Math.min(angle, this.controls.elevatorRight));
        this.controls.aileronLeft = Math.max(-angle, Math.min(angle, this.controls.aileronLeft));
        this.controls.aileronRight = Math.max(-angle, Math.min(angle, this.controls.aileronRight));
    }

    // controls

    getApi() {
        const maxAngle = 16;
        const rangeWarning = (value) => {
            if (Math.abs(value) > maxAngle) {
                this.codeRunner.log("System: Actuator max deflection is " + maxAngle + " degrees. Input value will be clamped to this range.");
            }
        }
        return {
            setAileronLeft: (instance, value) => {
                this.controls.aileronLeft = Math.min(maxAngle, Math.max(-maxAngle, value));
            },
            setAileronRight: (instance, value) => {
                rangeWarning(value);
                this.controls.aileronRight = Math.min(maxAngle, Math.max(-maxAngle, value));
            },
            setElevatorLeft: (instance, value) => {
                rangeWarning(value);
                this.controls.elevatorLeft = Math.min(maxAngle, Math.max(-maxAngle, value));
            },
            setElevatorRight: (instance, value) => {
                rangeWarning(value);
                this.controls.elevatorRight = Math.min(maxAngle, Math.max(-maxAngle, value));
            },
            setSteeringWheel: (instance, value) => {
                rangeWarning(value);
                this.controls.steeringWheel = Math.min(maxAngle, Math.max(-maxAngle, value));
            },
            setThrottle: (instance, value) => {
                if (value < 0 || value > 1) {
                    this.codeRunner.log("System: Throttle range is 0-1. Input value will be clamped to this range.");
                }
                this.controls.throttle = Math.min(1, Math.max(0, value));
            },
            shoot: (instance) => {
                this.shoot();
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
        this.info.fuel = +(this.fuel / this.fuelCapacity).toFixed(2)
    }
    

    loadModel() {
        this.onModelLoaded = (model) => {
            // The individual propeller meshes are descendants of the PROP node.
            // Rotate their existing parent so the GLB's pivot and transforms stay intact.
            this.propeller = model.getObjectByName('PROP')
            if (!this.propeller) {
                console.warn('Could not find the PROP node in the airplane model.');
            }

            this.leftAileron = model.getObjectByName('Left_Aileron');
            this.rightAileron = model.getObjectByName('Right_Aileron');
            this.leftElevator = model.getObjectByName('Left_Elevator');
            this.rightElevator = model.getObjectByName('Right_Elevator');
        };

        super.loadModel('./assets/SIERRA_ARC_GND_0824.glb');
    }

}
