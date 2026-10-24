import * as THREE from 'three';
import { createCheckpointSystems, checkpointCheck, resetCheckpointChecks } from './checkpoints.js';
import { Waypoint } from './Waypoint.js';
import { Airplane } from './Airplane.js';
import * as Obstacle from './obstacle.js';

// Points the aircraft's guide arrow at a world position ({x, y, z}), or
// hides it when the point is null
function setGuideTarget(aircraft, point) {
    if (!aircraft) return;
    aircraft.guideTarget = point ?? null;
    if (aircraft.arrowCombined) aircraft.arrowCombined.visible = !!aircraft.guideTarget;
}

// Fuel-climb platforms are aimed at a little above their deck
function platformGuidePoint(platform) {
    return platform ? { x: platform.x, y: platform.y + 6, z: platform.z } : null;
}

function createWindTube(world, { x, y, z, radius, height, direction, strength = 0.75, color = 0x7dd7ff, opacity = 0.22 }) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 24, 1, true);
    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    const axis = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    mesh.quaternion.setFromUnitVectors(axis, dir);
    world.scene.add(mesh);
    return { mesh, radius, height, direction: dir.clone(), strength, position: new THREE.Vector3(x, y, z) };
}

class LevelDefinition {
    // manual: a flying-only level. No code needed, so passing it is worth a
    // single star and there is no second (code) star.
    constructor({ id, name, objective, manual = false }) {
        this.id = id;
        this.name = name;
        this.objective = objective;
        this.manual = manual;
        this.resources = null;
        this.completed = false;
    }

    get maxStars() {
        return this.manual ? 1 : 2;
    }

    setup() {
        throw new Error(`Level '${this.id}' must implement setup()`);
    }

    handleEvent() {}

    reset() {
        this.completed = false;
        if (this.objective && typeof this.objective.progress === 'number') {
            this.objective.progress = 0;
        }
        this.resources?.checkpointSystems?.resetVisuals();
        this.resources?.reset?.();
    }

    teardown() {
        this.resources?.checkpointSystems?.destroy?.();
        this.resources?.eventSources?.forEach((source) => source.destroy?.());
        this.resources?.teardown?.();
        this.resources = null;
    }
}

class WaypointCourseLevel extends LevelDefinition {
    // guideArrow: show the plane's guide arrow pointing at the next waypoint
    constructor({ id, name, points, guideArrow = false }) {
        super({
            id,
            name,
            objective: {
                id: `complete-waypoint-course-${id}`,
                description: `Fly through ${points.length} waypoint${points.length === 1 ? '' : 's'}`,
                progress: 0,
                required: points.length,
            },
        });
        this.points = points;
        this.guideArrow = guideArrow;
        this.nextWaypointIndex = 0;
        this.airplane = null;
    }

    updateGuideArrow() {
        if (!this.guideArrow) return;
        setGuideTarget(this.airplane, this.points[this.nextWaypointIndex] ?? null);
    }

    setup({ world, airplane, emitEvent }) {
        this.nextWaypointIndex = 0;
        this.airplane = airplane;
        this.updateGuideArrow();
        const waypoints = this.points.map((point, index) => {
            const waypoint = new Waypoint(world, {
                radius: point.radius ?? 8,
                height: point.height ?? 14,
                color: 0x20aaff,
                opacity: 0.3,
                hideOnPass: false,
            });
            waypoint.id = `level-${this.id}-waypoint-${index + 1}`;
            waypoint.setPosition(point.x, point.y, point.z);
            waypoint.onEvent = emitEvent;
            return waypoint;
        });

        const course = {
            update: (position) => waypoints[this.nextWaypointIndex]?.update(position),
            destroy: () => waypoints.forEach((waypoint) => waypoint.destroy()),
        };
        this.resources = {
            eventSources: [course],
            waypoints,
            reset: () => {
                this.nextWaypointIndex = 0;
                waypoints.forEach((waypoint) => {
                    waypoint.reset();
                    waypoint.mesh.visible = true;
                });
                this.updateGuideArrow();
            },
        };
        return this.resources;
    }

    handleEvent(event) {
        if (event.type !== 'waypoint-reached' || this.completed) return;
        const expectedId = `level-${this.id}-waypoint-${this.nextWaypointIndex + 1}`;
        if (event.subjectId !== expectedId) return;

        this.nextWaypointIndex += 1;
        this.objective.progress = this.nextWaypointIndex;
        this.updateGuideArrow();

        if (this.nextWaypointIndex >= this.points.length) {
            this.completed = true;
            return;
        }

    }
}

class LandingLessonLevel extends LevelDefinition {
    constructor({ id, name, platform, approach }) {
        super({
            id,
            name,
            objective: {
                id: `land-on-platform-${id}`,
                description: 'Follow the approach waypoint and land on the platform',
                progress: 0,
                required: 2,
            },
        });
        this.platform = platform;
        this.approach = approach;
        this.approachReached = false;
        this.platformLanded = false;
    }

    setup({ world, airplane, showBanner, emitEvent }) {
        this.approachReached = false;
        this.platformLanded = false;
        const platformId = `landing-platform-${this.id}`;
        const checkpointSystems = createCheckpointSystems({
            world,
            airplane,
            showBanner,
            checkpointConfigs: [{
                id: platformId,
                position: this.platform,
                length: this.platform.length,
                width: this.platform.width,
                triggerRadius: 28,
                reward: { fuel: 30, money: 25 },
            }],
        });
        checkpointSystems.build();

        const waypoint = new Waypoint(world, {
            radius: 10,
            height: 16,
            color: 0xffd34d,
            opacity: 0.28,
            hideOnPass: false,
        });
        waypoint.id = `landing-approach-${this.id}`;
        waypoint.onEvent = emitEvent;
        waypoint.setPosition(this.approach.x, this.approach.y, this.approach.z);
        this.resources = { checkpointSystems, waypoints: [waypoint], eventSources: [waypoint] };
        return this.resources;
    }

    handleEvent(event) {
        if (this.completed) return;

        if (event.type === 'waypoint-reached' && event.subjectId === `landing-approach-${this.id}`) {
            this.approachReached = true;
        } else if (event.type === 'aircraft-landed' && event.subjectId === `landing-platform-${this.id}`) {
            this.platformLanded = true;
        } else {
            return;
        }

        this.objective.progress = Number(this.approachReached) + Number(this.platformLanded);
        if (!this.approachReached || !this.platformLanded) return;

        this.completed = true;
    }
}

class FuelClimbLevel extends LevelDefinition {
    constructor({ id, name, platforms, manual = false }) {
        super({
            id,
            name,
            manual,
            objective: {
                id: `climb-fuel-run-${id}`,
                description: `Land on ${platforms.length} platform${platforms.length === 1 ? '' : 's'} and climb as high as you can`,
                progress: 0,
                required: platforms.length,
            },
        });
        this.platforms = platforms.map((platform, index) => ({
            x: platform.x,
            y: platform.y,
            z: platform.z,
            width: platform.width ?? 42,
            length: platform.length ?? 90,
            fuelReward: platform.fuelReward ?? 40,
            moneyReward: platform.moneyReward ?? 20,
            triggerRadius: platform.triggerRadius ?? 26,
            index,
        }));
        this.targetConfigs = [
            { id: `fuel-climb-${id}-target-1`, type: 'sphere', size: { r: 17 }, color: 0xff9d1a, health: 9, price: 18, unscaled: true, position: { x: 40, y: 130, z: 300 } },
            { id: `fuel-climb-${id}-target-2`, type: 'sphere', size: { r: 17 }, color: 0xff9d1a, health: 9, price: 18, unscaled: true, position: { x: -10, y: 180, z: 430 } },
            { id: `fuel-climb-${id}-target-3`, type: 'sphere', size: { r: 17 }, color: 0xff9d1a, health: 10, price: 22, unscaled: true, position: { x: 110, y: 300, z: -120 } },
            { id: `fuel-climb-${id}-target-4`, type: 'sphere', size: { r: 16 }, color: 0xff9d1a, health: 10, price: 22, unscaled: true, position: { x: -180, y: 470, z: 100 } },
            { id: `fuel-climb-${id}-target-5`, type: 'sphere', size: { r: 16 }, color: 0xff9d1a, health: 12, price: 26, unscaled: true, position: { x: -420, y: 720, z: 230 } },
        ];
        this.reachedPlatformIds = new Set();
        this.destroyedTargetIds = new Set();
        this.lastSafePlatform = null;
        this.pendingLanding = null;
        this.gustPhase = 0;
        this.windZones = [];
    }

    reset() {
        this.completed = false;
        this.objective.progress = this.reachedPlatformIds.size;
        this.resources?.checkpointSystems?.resetVisuals();
        this.resources?.reset?.();
    }

    setup({ world, airplane, showBanner, emitEvent }) {
        this.objective.progress = this.reachedPlatformIds.size;
        setGuideTarget(airplane, platformGuidePoint(this.platforms[this.reachedPlatformIds.size]));

        const checkpointConfigs = this.platforms.map((platform, index) => ({
            id: `fuel-climb-${this.id}-platform-${index + 1}`,
            position: { x: platform.x, y: platform.y, z: platform.z },
            length: platform.length ?? 100,
            width: platform.width ?? 52,
            triggerRadius: platform.triggerRadius ?? 26,
            reward: { fuel: platform.fuelReward ?? 35, money: platform.moneyReward ?? 15 },
        }));

        const checkpointSystems = createCheckpointSystems({
            world,
            airplane,
            showBanner,
            checkpointConfigs,
        });
        checkpointSystems.build();

        this.windZones = [
            createWindTube(world, {
                x: 120,
                y: 160,
                z: 260,
                radius: 28,
                height: 160,
                direction: { x: -0.7, y: 0.15, z: -0.7 },
                strength: 0.22,
            }),
            createWindTube(world, {
                x: -120,
                y: 360,
                z: 220,
                radius: 24,
                height: 150,
                direction: { x: 0.8, y: 0.2, z: -0.5 },
                strength: 0.28,
            }),
            createWindTube(world, {
                x: -40,
                y: 600,
                z: -120,
                radius: 22,
                height: 140,
                direction: { x: 0.4, y: 0.1, z: 0.9 },
                strength: 0.26,
            }),
        ];

        Obstacle.setEventHandler(emitEvent);
        const targets = this.targetConfigs.map((config) => Obstacle.createObstacle(world.scene, config));

        this.resources = {
            checkpointSystems,
            targets,
            windZones: this.windZones,
            eventSources: [],
            reset: () => {
                this.reachedPlatformIds.clear();
                this.destroyedTargetIds.clear();
                this.objective.progress = 0;
                setGuideTarget(airplane, platformGuidePoint(this.platforms[0]));
                checkpointSystems.resetVisuals();
                this.windZones.forEach((zone) => {
                    zone.mesh.visible = true;
                });
                targets.forEach((target) => {
                    target._destroyed = false;
                    target.health = target.maxHealth ?? target.health;
                    target.mesh.visible = true;
                });
            },
            teardown: () => {
                Obstacle.setEventHandler(null);
                this.windZones.forEach((zone) => {
                    zone.mesh.parent?.remove(zone.mesh);
                    zone.mesh.geometry?.dispose?.();
                    zone.mesh.material?.dispose?.();
                });
                this.windZones.length = 0;
                targets.forEach((target) => {
                    target.dispose(world.scene);
                    const index = Obstacle.obstacles.indexOf(target);
                    if (index >= 0) Obstacle.obstacles.splice(index, 1);
                });
            },
        };
        return this.resources;
    }

    startPendingLanding(subjectId, event) {
        if (!subjectId || !subjectId.startsWith(`fuel-climb-${this.id}-platform-`)) return;
        if (this.reachedPlatformIds.has(subjectId)) return;
        this.pendingLanding = {
            subjectId,
            at: (typeof performance !== 'undefined') ? performance.now() : Date.now(),
            context: event?.context,
            aircraft: event?.data?.aircraft,
        };
        this.objective.progress = this.reachedPlatformIds.size;
    }

    commitPendingLanding() {
        if (!this.pendingLanding) return false;
        const { subjectId, context, aircraft } = this.pendingLanding;
        const platformIndex = Number(subjectId.match(/platform-(\d+)$/)?.[1]) - 1;
        if (!this.reachedPlatformIds.has(subjectId) && Number.isInteger(platformIndex) && platformIndex >= 0 && platformIndex < this.platforms.length) {
            this.lastSafePlatform = this.platforms[platformIndex];
            this.reachedPlatformIds.add(subjectId);
        }

        this.objective.progress = this.reachedPlatformIds.size;
        context?.showBanner?.(`Climb Platform ${this.objective.progress}/${this.platforms.length} Reached`);

        if (this.objective.progress >= this.platforms.length) {
            this.completed = true;
            this.pendingLanding = null;
            return true;
        }

        if (aircraft) {
            setGuideTarget(aircraft, platformGuidePoint(this.platforms[this.reachedPlatformIds.size]));
        }
        this.pendingLanding = null;
        return true;
    }

    invalidatePendingLanding() {
        if (!this.pendingLanding) return false;
        const { aircraft } = this.pendingLanding;
        if (aircraft) {
            setGuideTarget(aircraft, platformGuidePoint(this.platforms[this.reachedPlatformIds.size]));
        }
        this.pendingLanding = null;
        return true;
    }

    updatePendingLanding(aircraft) {
        if (!this.pendingLanding) return false;
        const ageSeconds = (((typeof performance !== 'undefined') ? performance.now() : Date.now()) - this.pendingLanding.at) / 1000;
        if (aircraft?.isCrashed && ageSeconds <= 3) {
            this.invalidatePendingLanding();
            return true;
        }
        if (ageSeconds >= 3) {
            this.commitPendingLanding();
            return true;
        }
        return false;
    }

    updateGust(aircraft, dt = 1 / 60) {
        if (!aircraft || aircraft.isCrashed) {
            if (aircraft) aircraft.gustVector?.set(0, 0, 0);
            return;
        }

        aircraft.gustVector.set(0, 0, 0);
        const now = (typeof performance !== 'undefined') ? performance.now() * 0.001 : 0;
        this.gustPhase = now * 1.6 + this.id;

        for (const zone of this.windZones) {
            const local = aircraft.position.clone().sub(zone.position);
            const axis = zone.direction.clone().normalize();
            const along = local.dot(axis);
            const radial = local.clone().sub(axis.clone().multiplyScalar(along));
            const insideTube = Math.abs(along) <= zone.height * 0.5 && radial.lengthSq() <= zone.radius * zone.radius;
            if (!insideTube) continue;

            const pulse = 0.5 + Math.sin(this.gustPhase * 1.5 + along * 0.04) * 0.5;
            const directionalPush = axis.clone().multiplyScalar(zone.strength * (0.3 + pulse * 0.7));
            aircraft.gustVector.add(directionalPush);
        }
    }

    handleEvent(event) {
        if (event.type === 'object-destroyed' && event.subjectId && event.subjectId.startsWith(`fuel-climb-${this.id}-target-`)) {
            this.destroyedTargetIds.add(event.subjectId);
            event.context.showBanner?.('Target Down — Keep Climbing');
            return;
        }

        if (event.type !== 'aircraft-landed' || this.completed) return;
        const subjectId = event.subjectId;
        if (!subjectId || !subjectId.startsWith(`fuel-climb-${this.id}-platform-`)) return;
        if (this.reachedPlatformIds.has(subjectId)) return;

        this.startPendingLanding(subjectId, event);
    }
}

class TargetLessonLevel extends LevelDefinition {
    constructor({ id, name, targets }) {
        super({
            id,
            name,
            objective: {
                id: `destroy-targets-${id}`,
                description: `Destroy ${targets.length} target${targets.length === 1 ? '' : 's'}`,
                progress: 0,
                required: targets.length,
            },
        });
        this.targetConfigs = targets.map((target, index) => ({
            id: `level-${id}-target-${index + 1}`,
            type: 'sphere',
            size: { r: target.radius ?? 6 },
            color: 0x258cff,
            health: target.health ?? 10,
            price: 25,
            unscaled: true,
            position: target.position,
        }));
        this.destroyedTargetIds = new Set();
    }

    setup({ world, emitEvent }) {
        this.destroyedTargetIds.clear();
        const targets = this.targetConfigs.map((config) => Obstacle.createObstacle(world.scene, config));
        Obstacle.setEventHandler(emitEvent);
        this.resources = {
            targets,
            teardown: () => {
                Obstacle.setEventHandler(null);
                targets.forEach((target) => {
                    target.dispose(world.scene);
                    const index = Obstacle.obstacles.indexOf(target);
                    if (index >= 0) Obstacle.obstacles.splice(index, 1);
                });
            },
        };
        return this.resources;
    }

    handleEvent(event) {
        if (event.type !== 'object-destroyed' || this.completed) return;
        if (!this.targetConfigs.some((target) => target.id === event.subjectId)) return;
        this.destroyedTargetIds.add(event.subjectId);
        this.objective.progress = this.destroyedTargetIds.size;
        if (this.destroyedTargetIds.size < this.targetConfigs.length) return;
        this.completed = true;
    }
}

class BotCollisionLevel extends LevelDefinition {
    constructor() {
        super({
            id: 31,
            name: 'Figure Eight Intercept',
            objective: {
                id: 'collide-with-figure-eight-bot',
                description: 'Crash into the figure-eight bot plane',
                progress: 0,
                required: 1,
            },
        });
    }

    setup({ world, airplane, emitEvent }) {
        const bot = new Airplane(world);
        bot.arrowCombined.visible = false;
        let active = true;
        let botModelReady = false;
        let botScript = null;
        const startBotScript = () => {
            if (active && botModelReady && botScript && !bot.codeRunner.running) {
                bot.codeRunner.run(botScript);
            }
        };
        const onBotModelLoaded = bot.onModelLoaded;
        bot.onModelLoaded = (model) => {
            onBotModelLoaded?.(model);
            bot.setPosition(0, 0, 30);
            botModelReady = true;
            startBotScript();
        };

        fetch(new URL('../scripts/figure8.txt', import.meta.url).href)
            .then((response) => {
                if (!response.ok) throw new Error(`Could not load figure8.txt (${response.status})`);
                return response.text();
            })
            .then((code) => {
                botScript = code;
                startBotScript();
            })
            .catch((error) => console.error('Bot script could not start:', error));

        const botController = {
            update: (_position, dt) => {
                if (this.completed || !botModelReady || !bot.codeRunner.running) return;
                const collisionDistance = (airplane.boundingRadius || 3) + (bot.boundingRadius || 3);
                if (airplane.position.distanceTo(bot.position) > collisionDistance) return;

                airplane.handleCrash();
                bot.handleCrash();
                emitEvent({
                    type: 'aircraft-collided-with-bot',
                    subjectId: 'figure8-bot',
                    data: { bot },
                });
            },
            destroy: () => {
                active = false;
                bot.clearParticles();
                bot.codeRunner.stop();
                bot.arrowCombined?.parent?.remove(bot.arrowCombined);
                bot.model?.parent?.remove(bot.model);
            },
        };
        this.resources = { eventSources: [botController], bot };
        return this.resources;
    }

    handleEvent(event) {
        if (event.type !== 'aircraft-collided-with-bot' || this.completed) return;
        this.objective.progress = 1;
        this.completed = true;
    }
}

export class Levels {
    constructor(context) {
        this.context = context;
        this.onLevelComplete = context.onLevelComplete;
        this.levels = [
            new WaypointCourseLevel({ id: 1, name: 'First Flight', points: [
                { x: 0, y: 0, z: 40, radius: 10 },
            ] }),
            new WaypointCourseLevel({ id: 2, name: 'One More Gate', points: [
                { x: 0, y: 0, z: 40, radius: 10 },
                { x: 0, y: 0, z: 75, radius: 10 },
            ] }),
            // Turning lesson: the ring sits to the left (+x is screen-left when
            // facing +z), far enough that flying straight misses it
            new WaypointCourseLevel({ id: 3, name: 'First Turn', points: [
                { x: 20, y: 0, z: 50, radius: 9 },
            ] }),
            // Practice: same idea as level 3, but the ring is to the right (-x)
            new WaypointCourseLevel({ id: 4, name: 'Turn Right', points: [
                { x: -22, y: 0, z: 55, radius: 9 },
            ] }),
            // Waiting lesson: go straight through the first ring, then U-turn
            // left back through the second, which sits beside the first.
            // Turning from the start misses the first one.
            new WaypointCourseLevel({ id: 5, name: 'Straight, Then Turn', points: [
                { x: 0, y: 0, z: 40, radius: 9 },
                { x: 28, y: 0, z: 40, radius: 9 },
            ] }),
            // Levels 6-8 practise "wait, then steer" on the ground. They assume
            // the full-lock U-turn is ~28 wide (turning circle radius ~14),
            // as tuned on level 5.
            // Mirror of level 5: U-turn right, further down the runway
            new WaypointCourseLevel({ id: 6, name: 'Turn Back Right', points: [
                { x: 0, y: 0, z: 55, radius: 9 },
                { x: -28, y: 0, z: 55, radius: 9 },
            ] }),
            // One ring ahead, one behind the start: U-turn left, straighten
            // and roll back past the start. The guide arrow helps find the
            // ring that's out of view behind the plane.
            new WaypointCourseLevel({ id: 7, name: 'Behind You', guideArrow: true, points: [
                { x: 0, y: 0, z: 40, radius: 9 },
                { x: 28, y: 0, z: -30, radius: 9 },
            ] }),
            // U-turn left, then straighten out and roll back toward the start
            new WaypointCourseLevel({ id: 8, name: 'There and Back', points: [
                { x: 0, y: 0, z: 40, radius: 9 },
                { x: 28, y: 0, z: 40, radius: 9 },
                { x: 28, y: 0, z: 0, radius: 9 },
            ] }),
            new WaypointCourseLevel({ id: 9, name: 'Steady Climb', points: [
                { x: 0, y: 0, z: 38, radius: 9 },
                { x: -12, y: 5, z: 68, radius: 8 },
                { x: 10, y: 10, z: 98, radius: 8 },
                { x: -10, y: 15, z: 128, radius: 8 },
                { x: 0, y: 20, z: 158, radius: 8 },
            ] }),
            new WaypointCourseLevel({ id: 10, name: 'Training Circuit', points: [
                { x: 0, y: 0, z: 36, radius: 9 },
                { x: 14, y: 4, z: 65, radius: 8 },
                { x: -14, y: 8, z: 94, radius: 8 },
                { x: 14, y: 12, z: 123, radius: 8 },
                { x: -8, y: 16, z: 152, radius: 8 },
                { x: 0, y: 20, z: 181, radius: 8 },
            ] }),
            new LandingLessonLevel({ id: 11, name: 'Platform Basics', platform: { x: 0, y: 0, z: 80, width: 64, length: 140 }, approach: { x: 0, y: 4, z: 42 } }),
            new LandingLessonLevel({ id: 12, name: 'Short Approach', platform: { x: 0, y: 2, z: 95, width: 62, length: 132 }, approach: { x: 0, y: 6, z: 55 } }),
            new LandingLessonLevel({ id: 13, name: 'Low Platform', platform: { x: 8, y: 4, z: 110, width: 58, length: 124 }, approach: { x: 4, y: 9, z: 68 } }),
            new LandingLessonLevel({ id: 14, name: 'Easy Offset', platform: { x: -10, y: 6, z: 125, width: 56, length: 118 }, approach: { x: -5, y: 12, z: 78 } }),
            new LandingLessonLevel({ id: 15, name: 'First Climb Landing', platform: { x: 12, y: 8, z: 140, width: 54, length: 112 }, approach: { x: 6, y: 16, z: 88 } }),
            new LandingLessonLevel({ id: 16, name: 'Narrower Deck', platform: { x: -14, y: 10, z: 155, width: 50, length: 108 }, approach: { x: -7, y: 20, z: 98 } }),
            new LandingLessonLevel({ id: 17, name: 'High Platform', platform: { x: 14, y: 12, z: 170, width: 48, length: 104 }, approach: { x: 7, y: 24, z: 108 } }),
            new LandingLessonLevel({ id: 18, name: 'Turning Approach', platform: { x: -16, y: 14, z: 185, width: 46, length: 100 }, approach: { x: -8, y: 28, z: 118 } }),
            new LandingLessonLevel({ id: 19, name: 'Precision Deck', platform: { x: 16, y: 16, z: 200, width: 44, length: 96 }, approach: { x: 8, y: 32, z: 128 } }),
            new LandingLessonLevel({ id: 20, name: 'Landing Circuit', platform: { x: 0, y: 18, z: 215, width: 42, length: 92 }, approach: { x: 0, y: 36, z: 142 } }),
            new TargetLessonLevel({ id: 21, name: 'First Target', targets: [
                { position: { x: 0, y: 5, z: 55 }, radius: 9, health: 5 },
            ] }),
            new TargetLessonLevel({ id: 22, name: 'Target Ahead', targets: [
                { position: { x: 6, y: 8, z: 70 }, radius: 8, health: 5 },
            ] }),
            new TargetLessonLevel({ id: 23, name: 'Two Targets', targets: [
                { position: { x: -8, y: 8, z: 65 }, radius: 8, health: 5 },
                { position: { x: 8, y: 10, z: 90 }, radius: 8, health: 5 },
            ] }),
            new TargetLessonLevel({ id: 24, name: 'Easy Sweep', targets: [
                { position: { x: -14, y: 9, z: 72 }, radius: 8, health: 6 },
                { position: { x: 0, y: 12, z: 100 }, radius: 8, health: 6 },
            ] }),
            new TargetLessonLevel({ id: 25, name: 'Three Targets', targets: [
                { position: { x: -14, y: 8, z: 70 }, radius: 7, health: 6 },
                { position: { x: 0, y: 12, z: 98 }, radius: 7, health: 6 },
                { position: { x: 14, y: 15, z: 126 }, radius: 7, health: 6 },
            ] }),
            new TargetLessonLevel({ id: 26, name: 'Gentle Climb Shots', targets: [
                { position: { x: 10, y: 12, z: 75 }, radius: 7, health: 7 },
                { position: { x: -10, y: 18, z: 108 }, radius: 7, health: 7 },
                { position: { x: 0, y: 24, z: 140 }, radius: 7, health: 7 },
            ] }),
            new TargetLessonLevel({ id: 27, name: 'Target Slalom', targets: [
                { position: { x: -16, y: 10, z: 70 }, radius: 7, health: 7 },
                { position: { x: 16, y: 15, z: 100 }, radius: 7, health: 7 },
                { position: { x: -12, y: 20, z: 130 }, radius: 7, health: 7 },
                { position: { x: 0, y: 25, z: 160 }, radius: 7, health: 7 },
            ] }),
            new TargetLessonLevel({ id: 28, name: 'Long Range', targets: [
                { position: { x: -12, y: 15, z: 105 }, radius: 6, health: 8 },
                { position: { x: 12, y: 22, z: 145 }, radius: 6, health: 8 },
                { position: { x: 0, y: 28, z: 185 }, radius: 6, health: 8 },
            ] }),
            new TargetLessonLevel({ id: 29, name: 'Target Circuit', targets: [
                { position: { x: -18, y: 12, z: 80 }, radius: 6, health: 8 },
                { position: { x: 18, y: 18, z: 112 }, radius: 6, health: 8 },
                { position: { x: -18, y: 24, z: 144 }, radius: 6, health: 8 },
                { position: { x: 0, y: 30, z: 176 }, radius: 6, health: 8 },
            ] }),
            new TargetLessonLevel({ id: 30, name: 'Final Target Run', targets: [
                { position: { x: -18, y: 14, z: 85 }, radius: 6, health: 10 },
                { position: { x: 18, y: 20, z: 118 }, radius: 6, health: 10 },
                { position: { x: -14, y: 26, z: 151 }, radius: 6, health: 10 },
                { position: { x: 14, y: 32, z: 184 }, radius: 6, health: 10 },
                { position: { x: 0, y: 38, z: 217 }, radius: 6, health: 10 },
            ] }),
            new BotCollisionLevel(),
            new FuelClimbLevel({
                id: 32,
                name: 'Skyline Fuel Run',
                manual: true,
                platforms: [
                    { x: 100, y: 100, z: 240, width: 54, length: 120, fuelReward: 38, moneyReward: 20 },
                    { x: -20, y: 220, z: 500, width: 44, length: 105, fuelReward: 40, moneyReward: 22 },
                    { x: -40, y: 330, z: -60, width: 42, length: 100, fuelReward: 48, moneyReward: 24 },
                    { x: 260, y: 400, z: -340, width: 38, length: 92, fuelReward: 58, moneyReward: 26 },
                    { x: -100, y: 550, z: 120, width: 36, length: 88, fuelReward: 66, moneyReward: 28 },
                    { x: -300, y: 700, z: -200, width: 32, length: 82, fuelReward: 78, moneyReward: 30 },
                    { x: -550, y: 860, z: 400, width: 30, length: 76, fuelReward: 100, moneyReward: 34 },
                ],
            }),
        ];
        this.currentLevel = null;
        this.currentLevelNumber = null;
        this.checkpointState = { lastCheckpoint: null };
        this.checkpointSystems = null;
        resetCheckpointChecks();
        this.wasTouchdown = false;
        this.completedLevelIds = new Set();
        // Best stars per level: 1 = completed, 2 = completed by a single
        // code run with no keyboard input
        this.levelStars = new Map();
        this.resetAttempt();
        this.context.airplane.onGameEvent = (event) => this.emitEvent(event);
    }

    resetAttempt() {
        this.attempt = { usedKeyboard: false, codeRuns: 0 };
    }

    recordKeyboardInput() {
        this.attempt.usedKeyboard = true;
    }

    recordCodeRun() {
        this.attempt.codeRuns += 1;
    }

    getAttemptStars() {
        if (this.currentLevel?.manual) return 1;
        return !this.attempt.usedKeyboard && this.attempt.codeRuns === 1 ? 2 : 1;
    }

    loadLevel(levelNumber = 1) {
        const level = this.levels.find((candidate) => candidate.id === levelNumber);
        if (!level) throw new Error(`Level '${levelNumber}' is not available`);

        const isSameLevel = this.currentLevel?.id === levelNumber;
        this.currentLevel?.teardown();
        Obstacle.clearExplosionParticles(this.context.world.scene);
        this.checkpointState.lastCheckpoint = null;
        this.wasTouchdown = false;
        this.resetAttempt();
        this.currentLevel = level;
        this.currentLevelNumber = levelNumber;
        // The guide arrow belongs to the fuel-climb level only; its setup()
        // below sets a new target, every other level leaves it cleared
        if (this.context.airplane) setGuideTarget(this.context.airplane, null);
        if (this.context.airplane?.arrowCombined) {
            this.context.airplane.arrowCombined.visible = false;
        }
        if (level instanceof FuelClimbLevel && !isSameLevel) {
            level.reachedPlatformIds.clear();
            level.lastSafePlatform = null;
        }
        level.reset();
        this.currentLevel.setup({ ...this.context, emitEvent: (event) => this.emitEvent(event) });
        this.checkpointSystems = this.currentLevel.resources?.checkpointSystems ?? null;
        this.context.airplane.restart();
        if (this.currentLevel instanceof FuelClimbLevel) {
            const respawnPlatform = this.currentLevel.lastSafePlatform;
            if (respawnPlatform) {
                this.context.airplane.setPosition(respawnPlatform.x, respawnPlatform.y + 6, respawnPlatform.z);
                this.context.airplane.setVelocity(0, 0, 0);
                this.context.airplane.setAngularVelocity(0, 0, 0);
                this.context.airplane.setRotation(0, 0, 0);
                this.context.airplane.controls.throttle = 0;
                this.context.airplane.fuel = Math.min(this.context.airplane.fuelCapacity, 60);
            } else {
                this.context.airplane.fuel = Math.min(this.context.airplane.fuelCapacity, 32);
            }
        }
        resetCheckpointChecks();
        if (typeof window !== 'undefined' && window.gameState) {
            window.gameState.level = levelNumber;
            window.gameState.objective = level.objective;
        }
        return this.currentLevel;
    }

    resetCurrentLevel() {
        if (!this.currentLevel) return;
        this.loadLevel(this.currentLevel.id);
    }

    updateEventSources(position, dt = 1 / 60) {
        this.currentLevel?.resources?.eventSources?.forEach((source) => source.update(position, dt));
    }

    updateAircraft(aircraft, dt = 1 / 60) {
        const runways = aircraft === this.context.airplane ? this.checkpointSystems : null;
        if (!aircraft.model) return;
        if (this.currentLevel instanceof FuelClimbLevel) {
            this.currentLevel.updateGust(aircraft, dt);
        }
        const contact = runways?.checkRunwayLanding(aircraft) ?? null;
        aircraft.updateTime(dt, contact);
        const wasCrashed = aircraft.isCrashed;
        this.updateChecks(aircraft);
        if (this.currentLevel instanceof FuelClimbLevel) {
            const level = this.currentLevel;
            const wasCompleted = level.completed;
            level.updatePendingLanding(aircraft);
            if (level && !wasCompleted && level.completed) {
                this.completedLevelIds.add(level.id);
                const stars = this.getAttemptStars();
                const bestStars = Math.max(stars, this.levelStars.get(level.id) ?? 0);
                this.levelStars.set(level.id, bestStars);
                const nextLevel = this.levels.find((candidate) => candidate.id === level.id + 1) ?? null;
                this.onLevelComplete?.({ level, nextLevel, stars, bestStars });
            }
        }
        if (!wasCrashed && aircraft.isCrashed) aircraft.updateCodeRunner();
    }

    updateChecks(aircraft) {
        checkpointCheck(aircraft);
        const checkpoint = Obstacle.obstacles.find(obstacle => obstacle.id === 'r2');
        if (checkpoint?.collisionCheck(aircraft)) aircraft.handleCrash();
    }

    updateLevelActors(dt = 1 / 60) {
        const bot = this.currentLevel?.resources?.bot;
        if (bot) this.updateAircraft(bot, dt);
    }

    emitEvent(event) {
        if (!event?.type) return;
        if (event.type === 'aircraft-landed' && event.data.runway) {
            this.checkpointState.lastCheckpoint = event.data.runway.checkpoint;
            this.checkpointSystems?.recordReached?.(event.data.runway.checkpoint);
        }
        const level = this.currentLevel;
        const wasCompleted = level?.completed ?? false;
        const progressBefore = level?.objective?.progress ?? 0;
        level?.handleEvent({
            ...event,
            context: { showBanner: this.context.showBanner },
        });
        if ((level?.objective?.progress ?? 0) > progressBefore) {
            this.context.onObjectiveProgress?.(level.objective);
        }
        if (level && !wasCompleted && level.completed) {
            this.completedLevelIds.add(level.id);
            const stars = this.getAttemptStars();
            const bestStars = Math.max(stars, this.levelStars.get(level.id) ?? 0);
            this.levelStars.set(level.id, bestStars);
            const nextLevel = this.levels.find((candidate) => candidate.id === level.id + 1) ?? null;
            this.onLevelComplete?.({ level, nextLevel, stars, bestStars });
        }
    }

    handleEvent(event) {
        this.emitEvent(event);
    }

    getObjective() {
        return this.currentLevel?.objective ?? null;
    }

    getInfo() {
        const level = this.currentLevel;
        if (!level) return null;
        const resources = level.resources ?? {};
        const position = ({ x, y, z }) => ({
            x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2),
        });
        const info = {
            waypoints: (resources.waypoints ?? []).map((waypoint) => ({
                position: position({
                    x: waypoint.position.x,
                    y: waypoint.position.y - waypoint.height / 2,
                    z: waypoint.position.z,
                }),
                radius: waypoint.radius,
                height: waypoint.height,
            })),
            landing_platforms: (resources.checkpointSystems?.checkpoints ?? []).map((checkpoint) => ({
                position: position(checkpoint.position),
                width: checkpoint.config.width ?? 48,
                length: checkpoint.config.length ?? 156,
                landing_height: +(checkpoint.position.y + 1.3).toFixed(2),
            })),
            targets: (resources.targets ?? []).map((target) => ({
                position: position(target.pos),
                radius: target.size.r,
                health: target.health,
                destroyed: level.destroyedTargetIds.has(target.id),
            })),
        };
        for (const key of ['waypoints', 'landing_platforms', 'targets']) {
            if (info[key].length === 0) delete info[key];
        }
        if (resources.bot) info.bot_position = position(resources.bot.position);
        return info;
    }

    loadNextLevel() {
        if (!this.currentLevel) return null;
        const nextLevel = this.levels.find((candidate) => candidate.id === this.currentLevel.id + 1);
        return nextLevel ? this.loadLevel(nextLevel.id) : null;
    }

    isLevelUnlocked(levelNumber) {
        return this.levels.some((level) => level.id === Number(levelNumber));
    }

    getLevelSummaries() {
        return this.levels.map((level) => ({
            id: level.id,
            name: level.name,
            objective: level.objective?.description ?? '',
            completed: this.completedLevelIds.has(level.id),
            stars: this.levelStars.get(level.id) ?? 0,
            maxStars: level.maxStars,
            manual: level.manual,
            unlocked: this.isLevelUnlocked(level.id),
            current: level === this.currentLevel,
        }));
    }
}
