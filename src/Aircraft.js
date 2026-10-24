import * as THREE from 'three';
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
        this._surfaceTouchdown = false
        this.api = this.getApi();
        this.codeRunner = new CodeRunner(this.api)
    }

    restart() {
        super.restart();
        this.clearParticles();
        this.isCrashed = false;
        this.wasAirborne = false;
        this._surfaceTouchdown = false;
        if (!this.codeRunner) return
        this.codeRunner.stop()
    }

    isAirborne() {
        const floorHeight = -this.groundOffset.y;
        return this.position.y > floorHeight + 0.01
    }
    
    updateTime(dt = 1 / 60, landingContact = null) {
        if (!this.model) return
        this.calculateObservedInfo()
        this.updateGravityAndGround(dt, landingContact)
        this.updateMovement(dt)
        this.updateRotation(dt)

        this.updateAerodynamics(dt)
        this.updateAnimations(dt)
        this.updateCodeRunner()
    }   

    /**
     * Tests a world-space point against each mesh's local bounding box.
     * This follows model transforms but approximates the aircraft's surface.
     */
    collidesWithPoint(point) {
        if (!this.model) return false;
        this.model.updateWorldMatrix(true, true);
        const localPoint = new THREE.Vector3();
        let collides = false;
        this.model.traverse((mesh) => {
            if (collides || !mesh.isMesh || !mesh.geometry) return;
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            localPoint.copy(point);
            mesh.worldToLocal(localPoint);
            collides = mesh.geometry.boundingBox.containsPoint(localPoint);
        });
        return collides;
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
    }

    updateGravityAndGround(dt = 1 / 60, landingContact = null) {
        const floorHeight = -this.groundOffset.y;

        if (landingContact && this.velocity.y <= 0.05) {
            const impactSpeed = Math.abs(this.velocity.y);
            const rollAngle   = Math.abs(this.rotation.z);
            const runway = landingContact.runway;
            const onRunwayCenter = runway
                ? Math.abs(this.position.x - runway.centerX) <= runway.width * 0.45
                && Math.abs(this.position.z - runway.centerZ) <= runway.length * 0.45
                : true;

            const hardImpact = impactSpeed > 0.22;
            const badRoll    = rollAngle > 35 * Math.PI / 180;
            const validLanding = !hardImpact && !badRoll && onRunwayCenter;

            if (validLanding) {
                this.position.y = landingContact.landingHeight;
                this.velocity.y = 0;
                this.wasAirborne = false;
                if (!this._surfaceTouchdown) {
                    landingContact.onTouchdown?.();
                }
                this._surfaceTouchdown = true;
                if (typeof this.applyRunwayFriction === 'function') {
                    this.applyRunwayFriction(dt, landingContact);
                }
                return;
            }

            if (this.position.y <= landingContact.landingHeight + 0.1) {
                this.handleCrash();
                this.position.y = landingContact.landingHeight;
                this.wasAirborne = false;
                return;
            }
        }

        if (this.position.y > floorHeight) {
            const gravityAccel = this.gravity;
            this.velocity.y -= gravityAccel * dt * 60;
            this.wasAirborne = true;
            this._surfaceTouchdown = false;

        } else {
            this.handleGroundCollision(dt, landingContact);
        }
    }


    updateAnimations(dt = 1 / 60) {
        // Spawn smoke trail
        this.updateTrail(dt);
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

    updateAerodynamics(dt = 1 / 60) {
        this.applyDrag(undefined, undefined, undefined, dt)
    }

    // dc = drag coefficient
    // adc = angular drag coefficient
    // adlc = angular drag from linear velocity coefficient
    applyDrag(dc = [0.1,0.1,0.1], adc = [0.1,0.1,0.1], adlc = [[0,0,0],[0,0,0],[0,0,0]], dt = 1 / 60) {
        const dir = this.directions
        const vel = this.relativeVelocity
        const avel = this.relativeAngularVelocity
        const frameScale = dt * 60
        
        const xDrag = -Math.sign(vel.x) * Math.pow(vel.x, 2) * dc[0];
        const yDrag = -Math.sign(vel.y) * Math.pow(vel.y, 2) * dc[1];
        const zDrag = -Math.sign(vel.z) * Math.pow(vel.z, 2) * dc[2];

        // add linear drag
        this.velocity.addScaledVector(dir.x, xDrag * frameScale);
        this.velocity.addScaledVector(dir.y, yDrag * frameScale);
        this.velocity.addScaledVector(dir.z, zDrag * frameScale);


        // add angular drag from angular velocity
        this.angularVelocity.addScaledVector(dir.x, -avel.x * adc[0] * frameScale);
        this.angularVelocity.addScaledVector(dir.y, -avel.y * adc[1] * frameScale);
        this.angularVelocity.addScaledVector(dir.z, -avel.z * adc[2] * frameScale);

        // add angular drag from linear velocity
        this.angularVelocity.addScaledVector(dir.x, xDrag * adlc[0][0] * frameScale);
        this.angularVelocity.addScaledVector(dir.x, yDrag * adlc[0][1] * frameScale);
        this.angularVelocity.addScaledVector(dir.x, zDrag * adlc[0][2] * frameScale);

        this.angularVelocity.addScaledVector(dir.y, xDrag * adlc[1][0] * frameScale);
        this.angularVelocity.addScaledVector(dir.y, yDrag * adlc[1][1] * frameScale);
        this.angularVelocity.addScaledVector(dir.y, zDrag * adlc[1][2] * frameScale);

        this.angularVelocity.addScaledVector(dir.z, xDrag * adlc[2][0] * frameScale);
        this.angularVelocity.addScaledVector(dir.z, yDrag * adlc[2][1] * frameScale);
        this.angularVelocity.addScaledVector(dir.z, zDrag * adlc[2][2] * frameScale);
    }
    
    disposeParticle(particle) {
        particle.mesh.parent?.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        particle.mesh.material.dispose();
    }

    clearParticles() {
        for (const particle of this.particles ?? []) this.disposeParticle(particle);
        if (this.particles) this.particles.length = 0;
        this.trailCounter = 0;
    }

    updateTrail(dt = 1 / 60) {
        const frameScale = dt * 60;
        // Spawn new particles
        this.trailCounter += frameScale;
        if (this.trailCounter > this.trailSpawnRate) {
            this.trailCounter = 0;
            this.spawnTrailParticle();
        }
        
        // Update existing particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= frameScale;
            p.mesh.material.opacity = p.life / p.maxLife;
            p.mesh.position.y += 0.01 * frameScale; // float upward (for trail)
            if (p.velocity) {
                p.mesh.position.addScaledVector(p.velocity, frameScale); // for explosion
                p.velocity.y -= 0.005 * frameScale; // gravity on explosion particles
            }
            
            if (p.life <= 0) {
                this.disposeParticle(p);
                this.particles.splice(i, 1);
            }
        }
    }
    
    // World-space point where trail particles spawn; subclasses can override
    getTrailOrigin() {
        return this.position.clone();
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
        mesh.position.copy(this.getTrailOrigin());
        this.scene.add(mesh);

        this.particles.push({
            mesh: mesh,
            life: 60,
            maxLife: 60
        });
    }

    updateInfo() {
        // Internal velocities retain the legacy metres-per-60-Hz-tick units so
        // the tuned physics remains unchanged. Public telemetry is SI (m/s).
        const METERS_PER_SECOND = 60;
        const DEGREES_PER_SECOND = 60 * (180 / Math.PI);
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
                x: parseFloat((this.velocity.x * METERS_PER_SECOND).toFixed(2)),
                y: parseFloat((this.velocity.y * METERS_PER_SECOND).toFixed(2)),
                z: parseFloat((this.velocity.z * METERS_PER_SECOND).toFixed(2))
            },
            angular_velocity: {
                x: parseFloat((this.relativeAngularVelocity.x * DEGREES_PER_SECOND).toFixed(2)),
                y: parseFloat((this.relativeAngularVelocity.y * DEGREES_PER_SECOND).toFixed(2)),
                z: parseFloat((this.relativeAngularVelocity.z * DEGREES_PER_SECOND).toFixed(2))
            },
            air_speed: {
                x: parseFloat((this.relativeVelocity.x * METERS_PER_SECOND).toFixed(2)),
                y: parseFloat((this.relativeVelocity.y * METERS_PER_SECOND).toFixed(2)),
                z: parseFloat((this.relativeVelocity.z * METERS_PER_SECOND).toFixed(2))
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
