import Bullet from './bullet.js';
import { soundManager } from './sound.js';
import { obstacles } from './obstacle.js';
import { Aircraft } from './Aircraft.js';
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
        this.propSpeed = 0

        const startPoint = new THREE.Vector3(0, 0, 0);
        const endPoint = new THREE.Vector3(0, 0, 0);
        this.arrowCombined = this.createArrow(startPoint, endPoint, 0xffff00);
        this.loadModel();
        this.restart();
    }

    restart() {
        super.restart();
        this.resetControls();
        this.heightHistory = [];
        this.ammo = this.ammoCapacity;
        this.propSpeed = 0;
        this.fuel = this.fuelCapacity;
    }

    resetControls() {
        this.controls = { aileronLeft: 0, aileronRight: 0, elevatorLeft: 0, elevatorRight: 0, flaps: 0, steeringWheel: 0, throttle: 0 };
    }

    updateTime() {
        super.updateTime();
        this.updateBullets();
        // this.visualizeArrows()
    }

    shoot() {
        // Check ammo
        if (typeof this.ammo === 'number' && this.ammo <= 0) {
            try { soundManager.playEmpty(); } catch(e) {}
            return;
        }
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
    }

    // Override updateAnimations to include bullet updates
    updateAnimations() {
        super.updateAnimations();
        this.updatePropeller()
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

    updateBullets() {
        this.bullets.forEach(b => b.update());
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

    handleGroundCollision() {
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
        this.applyGroundFriction()
        if (this.checkRunwayLanding()) {
            this.applyRunwayFriction();
        }
    }

    updateAerodynamics() {
        const dc = [0.07, 0.25, 0.004]
        const adc = [0.07, 0.02, 0.09]
        const adlc = [[0, 0.5, 0], [-1.6, 0, 0], [-0.5, 0, 0]];
        this.applyDrag(dc, adc, adlc)
        this.applyThrust()

        const dir = this.directions
        const vel = this.relativeVelocity
        const zDragCoeff = 0.004; // forward drag
        const zDrag = -Math.sign(vel.z) * Math.pow(vel.z, 2) * zDragCoeff;
        
        // add angular drag from controls
        this.angularVelocity.addScaledVector(dir.x, -zDrag * this.controls.elevatorLeft * 0.105);
        this.angularVelocity.addScaledVector(dir.x, -zDrag * this.controls.elevatorRight * 0.105);
        this.angularVelocity.addScaledVector(dir.y, -zDrag * this.controls.elevatorLeft * -0.035);
        this.angularVelocity.addScaledVector(dir.y, -zDrag * this.controls.elevatorRight * 0.035);
        this.angularVelocity.addScaledVector(dir.z, -zDrag * this.controls.aileronLeft * 0.06);
        this.angularVelocity.addScaledVector(dir.z, -zDrag * this.controls.aileronRight * -0.06);
    }


    // Override applyThrust with fuel management
    applyThrust() {
        if (!this.model) return;
        if (this.isCrashed) return
        const throttle = this.controls.throttle
        this.fuel -= this.fuelConsumptionRate * Math.pow(throttle, 3)
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

        this.velocity.addScaledVector(forward, thrustMagnitude);
    }

    applyGroundFriction() {
        const dir = this.directions
        const vel = this.relativeVelocity
        const avel = this.relativeAngularVelocity
        
        const zMuK = 0.007;
        const xMuK = 0.2;

        this.velocity.addScaledVector(dir.x, -vel.x * xMuK);
        this.velocity.addScaledVector(dir.z, -vel.z * zMuK);

        const yAngularMuK = 0.02;

        this.angularVelocity.addScaledVector(dir.y, -avel.y * yAngularMuK);
        this.angularVelocity.addScaledVector(dir.y, vel.z * this.controls.steeringWheel * -0.0001);
    }

    applyRunwayFriction() {
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

        const brakeFactor = 0.975;
        this.velocity.x *= brakeFactor;
        this.velocity.z *= brakeFactor;

        if (Math.abs(this.velocity.x) < 0.01) this.velocity.x = 0;
        if (Math.abs(this.velocity.z) < 0.01) this.velocity.z = 0;
    }

    updatePropeller() {
        if (!this.model) return;
        if (!this.propeller) return
        this.propeller.rotateZ(-this.propSpeed)
        this.propSpeed -= this.propSpeed * 0.025
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
        this.controls.flaps = 0;
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
            const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            if (!this._lastShotAt) this._lastShotAt = 0;
            const cooldownMs = 150;
            if (now - this._lastShotAt >= cooldownMs) {
                this.shoot();
                this._lastShotAt = now;
            }
        }
        this.controls.elevatorLeft = Math.max(-angle, Math.min(angle, this.controls.elevatorLeft));
        this.controls.elevatorRight = Math.max(-angle, Math.min(angle, this.controls.elevatorRight));
        this.controls.aileronLeft = Math.max(-angle, Math.min(angle, this.controls.aileronLeft));
        this.controls.aileronRight = Math.max(-angle, Math.min(angle, this.controls.aileronRight));
    }

    // controls

    getApi() {
        return {
            setAileronLeft: (instance, value) => {
                this.controls.aileronLeft = value;
            },
            setAileronRight: (instance, value) => {
                this.controls.aileronRight = value;
            },
            setElevatorLeft: (instance, value) => {
                this.controls.elevatorLeft = value;
            },
            setElevatorRight: (instance, value) => {
                this.controls.elevatorRight = value;
            },
            setFlaps: (instance, value) => {
                this.controls.flaps = value;
            },
            setSteeringWheel: (instance, value) => {
                this.controls.steeringWheel = value;
            },
            setThrottle: (instance, value) => {
                this.controls.throttle = value;
            },
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
        super.loadModel('./assets/SIERRA_ARC_GND_0824.glb');
        
        // After parent loads, identify and setup propeller parts
        setTimeout(() => {
            if (!this.model) return;
            
            this.propeller = new THREE.Group();
            let propellerParts = [];

            this.model.traverse((child) => {
                if (child.isMesh) {
                    const isPropPart = child.name === 'SIERRA_ARC_GND_0824002_1' || child.name === 'SIERRA_ARC_GND_0824002';
                    if (isPropPart) {
                        propellerParts.push(child);
                    }
                }
            });

            if (propellerParts.length > 0) {
                const worldPos = new THREE.Vector3();
                propellerParts[0].getWorldPosition(worldPos);
                
                this.model.worldToLocal(worldPos);
                this.propeller.position.copy(worldPos);
                this.model.add(this.propeller);

                propellerParts.forEach(part => {
                    this.propeller.add(part);
                    part.position.set(0, 0, 0);
                    part.scale.set(1, 1, 1); 
                });

                const globalPropScale = 0.01;
                this.propeller.scale.set(globalPropScale, globalPropScale, globalPropScale);
            }
        }, 500);
    }

}
