import { createCheckpointSystems } from './checkpoints.js';
import { Waypoint } from './Waypoint.js';
import { Airplane } from './Airplane.js';
import * as Obstacle from './obstacle.js';

class LevelDefinition {
    constructor({ id, name, objective }) {
        this.id = id;
        this.name = name;
        this.objective = objective;
        this.resources = null;
        this.completed = false;
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
    constructor({ id, name, points }) {
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
        this.nextWaypointIndex = 0;
    }

    setup({ world, emitEvent }) {
        this.nextWaypointIndex = 0;
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

        if (this.nextWaypointIndex >= this.points.length) {
            this.completed = true;
            event.context.showBanner?.(`Level ${this.id} Complete - Course Cleared`);
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
                required: 1,
            },
        });
        this.platform = platform;
        this.approach = approach;
    }

    setup({ world, airplane, showBanner }) {
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
        waypoint.setPosition(this.approach.x, this.approach.y, this.approach.z);
        this.resources = { checkpointSystems, eventSources: [waypoint] };
        return this.resources;
    }

    handleEvent(event) {
        if (event.type !== 'aircraft-landed' || this.completed) return;
        if (event.subjectId !== `landing-platform-${this.id}`) return;
        this.objective.progress = 1;
        this.completed = true;
        event.context.showBanner?.(`Level ${this.id} Complete - Platform Landed`);
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
        event.context.showBanner?.(`Level ${this.id} Complete - Targets Destroyed`);
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
            bot.setPosition(0, 0, 10);
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
        event.context.showBanner?.('Level 31 Complete - Bot Intercepted');
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
            new WaypointCourseLevel({ id: 3, name: 'Small Adjustment', points: [
                { x: 0, y: 0, z: 40, radius: 10 },
                { x: 7, y: 1, z: 76, radius: 10 },
            ] }),
            new WaypointCourseLevel({ id: 4, name: 'Three in a Row', points: [
                { x: 0, y: 0, z: 40, radius: 9 },
                { x: 7, y: 2, z: 74, radius: 9 },
                { x: 0, y: 3, z: 108, radius: 9 },
            ] }),
            new WaypointCourseLevel({ id: 5, name: 'Gentle Turn', points: [
                { x: 0, y: 0, z: 40, radius: 9 },
                { x: 10, y: 2, z: 74, radius: 9 },
                { x: 16, y: 4, z: 108, radius: 9 },
            ] }),
            new WaypointCourseLevel({ id: 6, name: 'Gentle S-Bend', points: [
                { x: 0, y: 0, z: 38, radius: 9 },
                { x: 10, y: 2, z: 70, radius: 9 },
                { x: -7, y: 4, z: 102, radius: 9 },
                { x: 0, y: 5, z: 134, radius: 9 },
            ] }),
            new WaypointCourseLevel({ id: 7, name: 'Easy Climb', points: [
                { x: 0, y: 0, z: 38, radius: 9 },
                { x: -8, y: 4, z: 70, radius: 9 },
                { x: 8, y: 8, z: 102, radius: 8 },
                { x: 0, y: 12, z: 134, radius: 8 },
            ] }),
            new WaypointCourseLevel({ id: 8, name: 'Wide Slalom', points: [
                { x: 0, y: 0, z: 38, radius: 9 },
                { x: 12, y: 3, z: 68, radius: 8 },
                { x: -12, y: 6, z: 98, radius: 8 },
                { x: 12, y: 9, z: 128, radius: 8 },
                { x: 0, y: 12, z: 158, radius: 8 },
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
        ];
        this.currentLevel = null;
        this.currentLevelNumber = null;
        this.checkpointState = { lastCheckpoint: null };
        this.checkpointSystems = null;
        this.wasTouchdown = false;
        this.completedLevelIds = new Set();
        this.context.airplane.onGameEvent = (event) => this.emitEvent(event);
    }

    loadLevel(levelNumber = 1) {
        const level = this.levels.find((candidate) => candidate.id === levelNumber);
        if (!level) throw new Error(`Level '${levelNumber}' is not available`);

        this.currentLevel?.teardown();
        this.checkpointState.lastCheckpoint = null;
        this.wasTouchdown = false;
        this.currentLevel = level;
        this.currentLevelNumber = levelNumber;
        level.reset();
        this.currentLevel.setup({ ...this.context, emitEvent: (event) => this.emitEvent(event) });
        this.checkpointSystems = this.currentLevel.resources?.checkpointSystems ?? null;
        this.context.airplane.restart();
        this.context.airplane.checkpointSystems = this.checkpointSystems;
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

    updateLevelActors(dt = 1 / 60) {
        this.currentLevel?.resources?.bot?.updateTime(dt);
    }

    emitEvent(event) {
        if (!event?.type) return;
        if (event.type === 'aircraft-landed' && event.data.runway) {
            this.checkpointState.lastCheckpoint = event.data.runway.checkpoint;
            this.checkpointSystems?.recordReached?.(event.data.runway.checkpoint);
        }
        const level = this.currentLevel;
        const wasCompleted = level?.completed ?? false;
        level?.handleEvent({
            ...event,
            context: { showBanner: this.context.showBanner },
        });
        if (level && !wasCompleted && level.completed) {
            this.completedLevelIds.add(level.id);
            const nextLevel = this.levels.find((candidate) => candidate.id === level.id + 1) ?? null;
            this.onLevelComplete?.({ level, nextLevel });
        }
    }

    handleEvent(event) {
        this.emitEvent(event);
    }

    getObjective() {
        return this.currentLevel?.objective ?? null;
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
            unlocked: this.isLevelUnlocked(level.id),
            current: level === this.currentLevel,
        }));
    }
}
