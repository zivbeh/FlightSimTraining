import * as THREE from 'three';
import { soundManager } from './sound.js';
import { obstacles } from './obstacle.js';
import { CodeRunner } from './CodeRunner.js';
import { DynamicBody } from './Body.js';

export class Aircraft extends DynamicBody {
    // Earth constants
    static EARTH_RADIUS = 6371000; // meters
    static GRAVITY_PARAM = 3.986e14; // GM in m³/s² (gravitational parameter)
    static EARTH_CENTER_Zs = -Aircraft.EARTH_RADIUS; // Earth's center z-position

    constructor(world) {
        super(world);
        this.scene = world.scene;
        this.controls = {}; // controlled
        this.isCrashed = false;
        this.gravity = 0.003
        this.model = null;
        this.particles = []; // trail particles
        this.trailSpawnRate = 0.3; // spawn particle every N frames
        this.trailCounter = 0;
        this.scale = 5
        this.groundOffset = {x: 0, y: -0.55, z: 0}
        this.info = {}
        this._runwayTouchdown = false
        this.api = this.getApi();
        this.codeRunner = new CodeRunner(this.api)
    }

    restart() {
        super.restart();
        this.isCrashed = false;
        if (!this.codeRunner) return
        this.codeRunner.stop()
    }
    
    updateTime() {
        if (!this.model) return
        this.calculateObservedInfo()
        this.updateGravityAndGround()
        this.updateMovement()
        this.updateRotation()

        this.updateAerodynamics()
        this.updateAnimations()
        this.updateChecks()
        this.updateCodeRunner()
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
    }

    checkRunwayLanding() {
        if (!this.checkpointSystems || typeof this.checkpointSystems.checkRunwayCollision !== 'function') return null;
        const planeRadius = this.boundingRadius || 2.5;
        return this.checkpointSystems.checkRunwayCollision(this.position, planeRadius);
    }

    updateGravityAndGround() {
        const floorHeight = -this.groundOffset.y;

        const runwayCollision = this.checkRunwayLanding();
        if (runwayCollision && this.velocity.y <= 0.05) {
            const impactSpeed = Math.abs(this.velocity.y);
            const rollAngle   = Math.abs(this.rotation.z);

            const hardImpact = impactSpeed > 0.15;
            const badRoll    = rollAngle > 25 * Math.PI / 180;

            if (!hardImpact && !badRoll) {
                this.position.y = runwayCollision.landingHeight;
                this.velocity.y = 0;
                this.wasAirborne = false;
                this._runwayTouchdown = true;
                if (typeof this.applyRunwayFriction === 'function') {
                    this.applyRunwayFriction();
                }
                return;
            }

            if (this.position.y <= runwayCollision.landingHeight + 0.1) {
                this.handleCrash();
                this.position.y = runwayCollision.landingHeight;
                this.wasAirborne = false;
                return;
            }
        }

        if (this.position.y > floorHeight) {
            const gravityAccel = this.gravity;
            this.velocity.y -= gravityAccel;
            this.wasAirborne = true;
            this._runwayTouchdown = false;

        } else {
            this.handleGroundCollision();
        }
    }


    updateAnimations() {
        // Spawn smoke trail
        this.updateTrail();
    }

    updateChecks() {
        // find if passed thru checkpoint
        let passed = this.checkpointCheck();
        if (passed) {
            console.log("airplane passed thru checkpoint")
        }

        // check for collision with obstacles
        if (this.collisionCheck()) {
            this.handleCrash();
        }
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
        console.log("Aircraft crashed!");
        this.resetControls();
        this.spawnExplosion();
        if (!this.codeRunner) return
        this.codeRunner.stop()
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

    updateAerodynamics() {
        this.applyDrag()
    }

    // dc = drag coefficient
    // adc = angular drag coefficient
    // adlc = angular drag from linear velocity coefficient
    applyDrag(dc = [0.1,0.1,0.1], adc = [0.1,0.1,0.1], adlc = [[0,0,0],[0,0,0],[0,0,0]]) {
        const dir = this.directions
        const vel = this.relativeVelocity
        const avel = this.relativeAngularVelocity
        
        const xDrag = -Math.sign(vel.x) * Math.pow(vel.x, 2) * dc[0];
        const yDrag = -Math.sign(vel.y) * Math.pow(vel.y, 2) * dc[1];
        const zDrag = -Math.sign(vel.z) * Math.pow(vel.z, 2) * dc[2];

        // add linear drag
        this.velocity.addScaledVector(dir.x, xDrag);
        this.velocity.addScaledVector(dir.y, yDrag);
        this.velocity.addScaledVector(dir.z, zDrag);


        // add angular drag from angular velocity
        this.angularVelocity.addScaledVector(dir.x, -avel.x * adc[0]);
        this.angularVelocity.addScaledVector(dir.y, -avel.y * adc[1]);
        this.angularVelocity.addScaledVector(dir.z, -avel.z * adc[2]);

        // add angular drag from linear velocity
        this.angularVelocity.addScaledVector(dir.x, xDrag * adlc[0][0]);
        this.angularVelocity.addScaledVector(dir.x, yDrag * adlc[0][1]);
        this.angularVelocity.addScaledVector(dir.x, zDrag * adlc[0][2]);

        this.angularVelocity.addScaledVector(dir.y, xDrag * adlc[1][0]);
        this.angularVelocity.addScaledVector(dir.y, yDrag * adlc[1][1]);
        this.angularVelocity.addScaledVector(dir.y, zDrag * adlc[1][2]);

        this.angularVelocity.addScaledVector(dir.z, xDrag * adlc[2][0]);
        this.angularVelocity.addScaledVector(dir.z, yDrag * adlc[2][1]);
        this.angularVelocity.addScaledVector(dir.z, zDrag * adlc[2][2]);
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

    updateInfo() {
        const info = {
            position: {
                x: parseFloat(this.position.x.toFixed(2)),
                y: parseFloat(this.position.y.toFixed(2)),
                z: parseFloat(this.position.z.toFixed(2))
            },
            rotation: {
                x: parseFloat((this.rotation.x * (180 / Math.PI)).toFixed(2)),
                y: parseFloat((this.rotation.y * (180 / Math.PI)).toFixed(2)),
                z: parseFloat((this.rotation.z * (180 / Math.PI)).toFixed(2))
            },
            velocity: {
                x: parseFloat(this.velocity.x.toFixed(2)),
                y: parseFloat(this.velocity.y.toFixed(2)),
                z: parseFloat(this.velocity.z.toFixed(2))
            },
            angular_velocity: {
                x: parseFloat(this.relativeAngularVelocity.x.toFixed(2)),
                y: parseFloat(this.relativeAngularVelocity.y.toFixed(2)),
                z: parseFloat(this.relativeAngularVelocity.z.toFixed(2))
            },
            air_speed: {
                x: parseFloat(this.relativeVelocity.x.toFixed(2)),
                y: parseFloat(this.relativeVelocity.y.toFixed(2)),
                z: parseFloat(this.relativeVelocity.z.toFixed(2))
            },
            controls: this.controls
        };
        this.info = info;
    }

    // controls
    updateCodeRunner() {
        this.updateInfo()
        this.codeRunner.setInfo(this.info);
    }

    calculateGravity() {
        const distanceFromCenter = Math.sqrt(
            this.position.x ** 2 + 
            this.position.y ** 2 + 
            (this.position.z - Airplane.EARTH_CENTER_Zs) ** 2
        );
        
        const gravityMagnitude = Airplane.GRAVITY_PARAM / (distanceFromCenter ** 2);
        
        const dy = -this.position.y;
        const dz = Airplane.EARTH_CENTER_Z - this.position.z;
        const norm = Math.sqrt(this.position.x ** 2 + dy ** 2 + dz ** 2);
        const result = (dy / norm) * gravityMagnitude
        
        return 10
    }

    



}
