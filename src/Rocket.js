import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import Bullet from './bullet.js';
import { soundManager } from './sound.js';
import { obstacles } from './obstacle.js';

export class Rocket {

    constructor(scene) {
        this.scene = scene;
        this.position = new THREE.Vector3(0, 0, 0); // controlled
        this.velocity = new THREE.Vector3(0, 0, 0); // controlled
        this.relativeVelocity = new THREE.Vector3(0, 0, 0); // observed
        this.rotation = new THREE.Vector3(0, 0, 0); // observed
        this.angularVelocity = new THREE.Vector3(0, 0, 0); // controlled
        this.relativeAngularVelocity = new THREE.Vector3(0, 0, 0); // observed
        this.directions = { x: null, y: null, z: null }; // observed
        this.controls = { aileronLeft: 0, aileronRight: 0, elevatorLeft: 0, elevatorRight: 0, flaps: 0, steeringWheel: 0, throttle: 0 }; // controlled
        this.isCrashed = false;
        this.mass = 70 // kg
        this.gravity = 0.003
        this.model = null;
        this.particles = []; // trail particles
        this.trailSpawnRate = 0.3; // spawn particle every N frames
        this.trailCounter = 0;
        this.scale = 10
        this.centerOffset = {x: 0, y: 0, z: 0}
        // this.centerOffset = {x: 0, y: -0.4, z: 0}
        this.propeller = null
        this.propSpeed = 0
        this.loadModel();
        
        this.historyFrames = 120; // ~2 seconds at 60fps
        
        // Fuel
        this.fuelCapacity = 100;
        this.fuel = this.fuelCapacity;
        this.reset()
    }

    reset() {
        this.setPosition(0, 0, 0);
        this.setVelocity(0, 0, 0);
        this.setRotation(0, 0, 0);
        this.setAngularVelocity(0, 0, 0);
        this.isCrashed = false;
        this.particles = [];
        this.trailCounter = 0;
        this.propSpeed = 0;
        this.controls = { aileronLeft: 0, aileronRight: 0, elevatorLeft: 0, elevatorRight: 0, flaps: 0, steeringWheel: 0, throttle: 0 };
        this._noFuelWarned = false;
    }

    updateTime() {
        if (!this.model) return
        this.calculateObservedInfo()

        this.updateGravityAndGround()
        this.updateMovement()
        this.updateRotation()
        this.updateAerodynamics()
        this.updateEffects()
        this.updateChecks()
        this.updateScene()
    }   

    collisionCheck() {
        const checkpointID = 'r2';
        const obstacle = obstacles.find(o => o.id === checkpointID);
        if (!obstacle) return false;

        const obsPos = obstacle.pos;
        const { w, h, thickness } = obstacle.size;

        const halfW = w / 2;
        const halfH = h / 2;
        const halfT = thickness / 2;

        const innerHalfW = halfW - thickness;
        const innerHalfH = halfH - thickness;

        const planeRadius = this.boundingRadius || 2.5;

        // Check if within full bounding box (considering plane size)
        const fullInX = Math.abs(this.position.x - obsPos.x) <= (halfW + planeRadius);
        const fullInY = Math.abs(this.position.y - obsPos.y) <= (halfH + planeRadius);
        const fullInZ = Math.abs(this.position.z - obsPos.z) <= (halfT + planeRadius);

        // Check if within inner area (no collision) - use full inner bounds
        const innerInX = Math.abs(this.position.x - obsPos.x) <= innerHalfW;
        const innerInY = Math.abs(this.position.y - obsPos.y) <= innerHalfH;

        const inFull = fullInX && fullInY && fullInZ;
        const inInner = innerInX && innerInY; // Ignore z for inner area check

        // Collision if in full but not in inner (i.e., hitting the frame)
        return inFull && !inInner;
    }

    updateGravityAndGround() {
        const floorHeight = -this.centerOffset.y

        if (this.position.y > floorHeight) {
            const gravityAccel = this.isCrashed ? this.gravity * 4 : this.gravity;
            this.velocity.y -= gravityAccel;
            this.wasAirborne = true;

        } else {
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
        }
    }


    updateMovement() {
        // move from velocity
        this.position.x += this.velocity.x; 
        this.position.y += this.velocity.y;
        this.position.z += this.velocity.z;
    }

    updateRotation() {
        // rotate from angular velocity
        const angle = this.angularVelocity.length();
        if (angle > 0) {
            const axis = this.angularVelocity.clone().normalize();
            const rotationStep = new THREE.Quaternion().setFromAxisAngle(axis, angle);

            // 3. Apply as World POV
            this.model.quaternion.premultiply(rotationStep);
            this.model.quaternion.normalize();
        }
    }

    updateAerodynamics() {
        if (this.isCrashed) {
            // After a crash, stop generating lift or thrust and let the plane fall under gravity and drag.
            this.applyDrag()
            return
        }

        

        this.applyDrag()
        this.applyThrust()
    }

    updateEffects() {
        // Spawn smoke trail
        this.updateTrail();
    }

    updateChecks() {
        // find if passed thru checkpoint
        let passed = this.checkpointCheck();
        if (passed) {
            console.log("rocket passed thru checkpoint")
        }

        // check for collision with obstacles
        if (this.collisionCheck()) {
            this.handleCrash();
        }

        if (this.isCrashed) {
            // Stop thrust and damp forward momentum while letting the plane fall.
            this.propSpeed = 0;
            this.controls.throttle = 0;

            const crashHorizonDamp = 0.80;
            this.velocity.x *= crashHorizonDamp;
            this.velocity.z *= crashHorizonDamp;

            this.angularVelocity.multiplyScalar(0.95);
        }

        // Stall/dive detection disabled - landing crash detection handles hard impacts
    }

    updateScene() {
        this.model.position.copy(this.position);
        this.model.position.y += this.centerOffset.y;
    }

    checkpointCheck() {
        const checkpointID = 'r2';
        const checkpoint = obstacles.find(o => o.id === checkpointID);
        if (!checkpoint) {
            console.warn(`Checkpoint with ID '${checkpointID}' not found.`);
            return false;
        }

        // Get the current position and size of the checkpoint
        const checkpointPos = checkpoint.pos;
        const { w, h, thickness } = checkpoint.size;

        // Calculate inner bounds (inside the frame, excluding the border thickness)
        const innerHalfW = w / 2 - thickness;
        const innerHalfH = h / 2 - thickness;
        const halfT = thickness / 2;

        // Account for airplane size (from mesh bounding box)
        const planeRadius = this.boundingRadius || 2.5; // Fallback if not loaded yet

        // Effective inner bounds considering plane size
        const effectiveInnerHalfW = innerHalfW; // Use full inner bounds for easier passing
        const effectiveInnerHalfH = innerHalfH;
        const effectiveHalfT = halfT;

        // Check if airplane is within the effective inner rectangular bounds
        const inX = Math.abs(this.position.x - checkpointPos.x) <= effectiveInnerHalfW;
        const inY = Math.abs(this.position.y - checkpointPos.y) <= effectiveInnerHalfH;
        const inZ = Math.abs(this.position.z - checkpointPos.z) <= effectiveHalfT;
                const passed = inX && inY && inZ;

                // Award money once per pass (edge-trigger)
                if (!this._wasInCheckpoint && passed) {
                    this._wasInCheckpoint = true;
                    const checkpointReward = 200; // flat reward for passing checkpoint
                    try {
                        if (typeof window !== 'undefined' && window.gameState) {
                            if (typeof window.gameState.addMoney === 'function') window.gameState.addMoney(checkpointReward);
                            else if (typeof window.gameState.money === 'number') window.gameState.money += checkpointReward;
                        }
                    } catch(e){}
                    console.log(`Passed checkpoint '${checkpointID}' — awarded ${checkpointReward}`);
                }
                if (!passed) this._wasInCheckpoint = false;

                return passed;
    }

    handleCrash() {
        if (this.isCrashed) return; // Already crashed
        this.isCrashed = true;
        console.log("Airplane crashed!");
        this.spawnExplosion();
    }

    spawnExplosion() {
        const numParticles = 20;
        for (let i = 0; i < numParticles; i++) {
            const size = 0.5 + Math.random() * 1.0;
            const geometry = new THREE.SphereGeometry(size, 8, 8);
            const material = new THREE.MeshStandardMaterial({
                color: 0xff4500, // Orange-red
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
                (Math.random() - 0.5) * 0.5,
                Math.random() * 0.3,
                (Math.random() - 0.5) * 0.5
            );

            this.particles.push({
                mesh: mesh,
                life: 120,
                maxLife: 120,
                velocity: vel
            });
        }
    }

    calculateObservedInfo() {
        if (!this.model) return;
        const zDir = new THREE.Vector3(0, 0, 1);
        const yDir = new THREE.Vector3(0, 1, 0);
        const xDir = new THREE.Vector3(1, 0, 0);

        zDir.applyQuaternion(this.model.quaternion);
        yDir.applyQuaternion(this.model.quaternion);
        xDir.applyQuaternion(this.model.quaternion);
        zDir.normalize();
        yDir.normalize();
        xDir.normalize();

        this.directions = { x: xDir, y: yDir, z: zDir };

        this.relativeVelocity.copy(this.velocity)
            .applyQuaternion(this.model.quaternion.clone().invert());

        this.relativeAngularVelocity.copy(this.angularVelocity)
            .applyQuaternion(this.model.quaternion.clone().invert());
        
        const euler = new THREE.Euler();
        euler.setFromQuaternion(this.model.quaternion, 'YXZ');
        this.rotation.set(euler.x, euler.y, euler.z)
    }


    applyThrust() {
        if (!this.model) return;
                const throttle = this.controls.throttle

                // If out of fuel, throttle produces no thrust
                let throttleEff = throttle;
                if (typeof this.fuel === 'number' && this.fuel <= 0) {
                    throttleEff = 0;
                    if (!this._noFuelWarned) {
                        try { soundManager.playEmpty(); } catch(e) {}
                        this._noFuelWarned = true;
                    }
                } else {
                    this._noFuelWarned = false;
                }

                const throttleToPropSpeed = 2.5
                if (this.propSpeed < throttleEff * throttleToPropSpeed) {
                        this.propSpeed = throttleEff * throttleToPropSpeed
                }

                // 1. Get Forward Direction
                const forward = this.directions.z;

                // 2. Propeller Efficiency (Linear drop-off model)
                const airSpeed = Math.max(0, this.velocity.dot(forward))*3;
        
                const pitchSpeed = 2; // The speed at which the propeller can no longer push air
                const thrustEfficiency = Math.max(0, 1.0 - (airSpeed / pitchSpeed));

                // 3. Air Density Effect (Exponential decay with altitude)
                const altitude = Math.max(0, this.position.y);
                const densityFactor = 1
                // const densityFactor = Math.exp(-altitude / 1200); // Scaling factor for density drop-off


                // 4. Calculate final magnitude
                const thrustMagnitude = throttleEff * thrustEfficiency * densityFactor * 0.03 * (this.speedMultiplier || 1);

                this.velocity.addScaledVector(forward, thrustMagnitude);
    }

    applyDrag() {
        const dir = this.directions
        const vel = this.relativeVelocity
        const avel = this.relativeAngularVelocity
        
        const crashDragFactor = this.isCrashed ? 10 : 1
        const zDragCoeff = 0.004 * crashDragFactor; // forward drag
        const xDragCoeff = 0.07 * crashDragFactor; // side drag
        const yDragCoeff = this.isCrashed && vel.y < 0 ? 0.01 : 0.25; // let crash fall stay fast
        const xDrag = -Math.sign(vel.x) * Math.pow(vel.x, 2) * xDragCoeff;
        const yDrag = -Math.sign(vel.y) * Math.pow(vel.y, 2) * yDragCoeff;
        const zDrag = -Math.sign(vel.z) * Math.pow(vel.z, 2) * zDragCoeff;

        // add linear drag
        this.velocity.addScaledVector(dir.x, xDrag);
        this.velocity.addScaledVector(dir.y, yDrag);
        this.velocity.addScaledVector(dir.z, zDrag);

        const zAngularDragCoeff = 0.05 * crashDragFactor; 
        const yAngularDragCoeff = 0.02 * crashDragFactor;
        const xAngularDragCoeff = 0.04 * crashDragFactor;

        // add angular drag from angular velocity
        this.angularVelocity.addScaledVector(dir.x, -avel.x * xAngularDragCoeff);
        this.angularVelocity.addScaledVector(dir.y, -avel.y * yAngularDragCoeff);
        this.angularVelocity.addScaledVector(dir.z, -avel.z * zAngularDragCoeff);

        // add angular drag from linear velocity
        this.angularVelocity.addScaledVector(dir.x, yDrag * 0.5);
        this.angularVelocity.addScaledVector(dir.y, -xDrag * 1.6);
        this.angularVelocity.addScaledVector(dir.z, -xDrag * 0.5);
        
        // add angular drag from controls
        this.angularVelocity.addScaledVector(dir.x, -zDrag * this.controls.elevatorLeft * 0.105);
        this.angularVelocity.addScaledVector(dir.x, -zDrag * this.controls.elevatorRight * 0.105);
        this.angularVelocity.addScaledVector(dir.y, -zDrag * this.controls.elevatorLeft * -0.035);
        this.angularVelocity.addScaledVector(dir.y, -zDrag * this.controls.elevatorRight * 0.035);
        this.angularVelocity.addScaledVector(dir.z, -zDrag * this.controls.aileronLeft * 0.06);
        this.angularVelocity.addScaledVector(dir.z, -zDrag * this.controls.aileronRight * -0.06);
        
        
    }

    applyGroundFriction() {
        const dir = this.directions
        const vel = this.relativeVelocity
        const avel = this.relativeAngularVelocity
        
        const zMuK = 0.007; // forward friction
        const xMuK = 0.2; // side friction

        // add linear friction
        this.velocity.addScaledVector(dir.x, -vel.x * xMuK);
        this.velocity.addScaledVector(dir.z, -vel.z * zMuK);

        const yAngularMuK = 0.02;

        // add angular friction from angular velocity
        this.angularVelocity.addScaledVector(dir.y, -avel.y * yAngularMuK);
        
        // add angular friction from controls
        this.angularVelocity.addScaledVector(dir.y, vel.z * this.controls.steeringWheel * -0.0001);
    }
    
    updateTrail() {
        // Spawn new particles
        this.trailCounter++;
        if (this.trailCounter > this.trailSpawnRate) {
            this.trailCounter = 0;
            this.spawnTrailParticle();
        }
        
        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= 1;
            p.mesh.material.opacity = p.life / p.maxLife;
            p.mesh.position.y += 0.01; // float upward (for trail)
            if (p.velocity) {
                p.mesh.position.add(p.velocity); // for explosion
                p.velocity.y -= 0.005; // gravity on explosion particles
            }
            
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }
    }
    
    spawnTrailParticle() {
        const size = 0.1 + Math.random() * 0.3;
        const geometry = new THREE.SphereGeometry(size, 8, 8);
        const material = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            emissive: 0x555555,
            roughness: 0.8,
            transparent: true,
            opacity: 1.0
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.position.x, this.position.y, this.position.z);
        this.scene.add(mesh);
        
        this.particles.push({
            mesh: mesh,
            life: 60,
            maxLife: 60
        });
    }

    setPosition(x, y, z) {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
    }

    reset() {
        this.isCrashed = false;
        this.velocity.set(0, 0, 0);
        this.relativeVelocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.relativeAngularVelocity.set(0, 0, 0);
        this.propSpeed = 0;
        this.fireCounter = 0;
        this.fireAuto = false;
        this.wasAirborne = false;

        // Clear particles (explosion/trail)
        if (this.particles && this.particles.length) {
            this.particles.forEach(p => {
                try { this.scene.remove(p.mesh); } catch (e) {}
            });
            this.particles = [];
        }

        // Reset controls to neutral
        this.controls = { aileronLeft: 0, aileronRight: 0, elevatorLeft: 0, elevatorRight: 0, flaps: 0, steeringWheel: 0, throttle: 0 };

        this._noFuelWarned = false;

        // Reset orientation if model loaded
        if (this.model) {
            this.setRotation(0, 0, 0);
        }
    }

    setVelocity(x, y, z) {
        this.velocity.x = x;
        this.velocity.y = y;
        this.velocity.z = z;
    }

    setRotation(x, y, z) {
        if (!this.model) return;
        this.rotation.x = x;
        this.rotation.y = y;
        this.rotation.z = z;
        // Use the same 'YXZ' order here to remain consistent with calculateObservedInfo
        const euler = new THREE.Euler(x, y, z, 'YXZ');
        this.model.quaternion.setFromEuler(euler);
    }

    setRotationX(angle) {
        this.rotation.x = angle;
        const euler = new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z, 'YXZ');
        this.model.quaternion.setFromEuler(euler);
    }

    setRotationY(angle) {
        this.rotation.y = angle;
        const euler = new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z, 'YXZ');
        this.model.quaternion.setFromEuler(euler);
    }

    setRotationZ(angle) {
        this.rotation.z = angle;
        const euler = new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z, 'YXZ');
        this.model.quaternion.setFromEuler(euler);
    }
    
    // Rotation methods
    applyPitch(angle) {
        this.setElevatorLeft(angle)
        this.setElevatorRight(angle)
    }
    
    applyRoll(angle) {
        this.setAileronLeft(angle)
        this.setAileronRight(-angle)
    }
    
    applyYaw(angle) {
        this.setElevatorLeft(angle)
        this.setElevatorRight(-angle)
    }

    updateKeys(keys) {
        if (this.isCrashed) return; // No control when crashed

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
        // Fire with a cooldown so holding the key doesn't spawn bullets every frame
        if (keys.has('k')) {
            const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            if (!this._lastShotAt) this._lastShotAt = 0;
            const cooldownMs = 150; // ~6 shots per second, tuneable
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
    setAileronLeft(angle) {
        this.controls.aileronLeft = angle;
    }
    
    setAileronRight(angle) {
        this.controls.aileronRight = angle;
    }

    setElevatorLeft(angle) {
        this.controls.elevatorLeft = angle;
    }

    setElevatorRight(angle) {
        this.controls.elevatorRight = angle;
    }

    setFlaps(angle) {
        this.controls.flaps = angle;
    }

    loadModel() {
        const loader = new GLTFLoader();
        loader.load(
            './assets/missile1.glb',
            (gltf) => {
                const model = gltf.scene;
                
                // 1. Setup Scaling FIRST
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = this.scale / maxDim;
                model.scale.set(scale, scale, scale);
                model.position.set(0, 0, 0);

                // 2. Identify Propeller Parts and Shift ONLY the airframe
                this.propeller = new THREE.Group();
                let propellerParts = [];

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        
                    }
                });

                
                
                this.model = model;
                this.scene.add(model);

                // Compute bounding box for size calculations
                const boundingBox = new THREE.Box3().setFromObject(model);
                this.boundingSize = boundingBox.getSize(new THREE.Vector3());
                this.boundingRadius = this.boundingSize.length() / 2; // Approximate radius as half the diagonal
            },
            (progress) => {
                // console.log('Loading model:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading model:', error);
                console.log('Using fallback airplane model');
            }
        );
    }



}
