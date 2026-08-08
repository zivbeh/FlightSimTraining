import * as THREE from 'three';

// Runway checkpoint system. Waypoints are intentionally managed elsewhere.
export function createCheckpointSystems({ world, checkpointConfigs, airplane, showBanner }) {
    const runways = [];
    const checkpoints = checkpointConfigs.map((config) => ({
        config,
        position: new THREE.Vector3(config.position.x, config.position.y, config.position.z),
        reached: false,
        inside: false,
        group: null,
    }));

    function createRunway(checkpoint) {
        const group = new THREE.Group();
        const runwayLength = checkpoint.config.length ?? 156;
        const runwayWidth = checkpoint.config.width ?? 48;
        const platformHeight = 1;

        const platform = new THREE.Mesh(
            new THREE.BoxGeometry(runwayWidth, 0.4, runwayLength),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.05 })
        );
        platform.position.y = platformHeight;
        group.add(platform);

        const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd700 });
        for (let i = 0; i < 6; i++) {
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(runwayWidth * 0.6, 0.05, 4), stripeMaterial);
            stripe.position.set(0, platformHeight + 0.22, -runwayLength / 2 + 8 + i * 8);
            group.add(stripe);
        }

        const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        [-1, 1].forEach((side) => {
            const edge = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, runwayLength * 0.9), edgeMaterial);
            edge.position.set(side * (runwayWidth / 2 - 0.3), platformHeight + 0.22, 0);
            group.add(edge);
        });

        const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 });
        [-1, 1].forEach((side, index) => {
            const light = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.5), lightMaterial);
            light.position.set(side * (runwayWidth / 2 - 3), platformHeight + 1.5, index ? runwayLength / 2 - 5 : -runwayLength / 2 + 5);
            group.add(light);
            const glow = new THREE.PointLight(0xff3300, 1.5, 20);
            glow.position.copy(light.position);
            group.add(glow);
        });

        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(5, 6, 5),
            new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 })
        );
        tower.position.set(18, platformHeight + 3, -runwayLength / 2 + 12);
        group.add(tower);

        group.position.copy(checkpoint.position);
        world.scene.add(group);
        checkpoint.group = group;

        runways.push({
            checkpoint,
            width: runwayWidth,
            length: runwayLength,
            centerX: checkpoint.position.x,
            centerZ: checkpoint.position.z,
            platformTop: checkpoint.position.y + platformHeight + 0.2,
        });
    }

    function createSupportStation(checkpoint) {
        const group = new THREE.Group();
        const tankMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5dff, roughness: 0.4, metalness: 0.3 });
        [-8, 8].forEach((z) => {
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.3, 5, 16), tankMaterial);
            tank.position.set(-19, 7.5, z);
            group.add(tank);
        });
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(12, 6, 12),
            new THREE.MeshStandardMaterial({ color: 0x3d2c1e, roughness: 0.8 })
        );
        building.position.set(19, 8, 15);
        group.add(building);
        group.position.copy(checkpoint.position);
        world.scene.add(group);
    }

    function build() {
        checkpoints.forEach((checkpoint) => {
            createRunway(checkpoint);
            createSupportStation(checkpoint);
        });
    }

    function resetVisuals() {
        checkpoints.forEach((checkpoint) => {
            checkpoint.reached = false;
            checkpoint.inside = false;
        });
    }

    function respawnAtCheckpoint(targetCheckpoint = null) {
        airplane.restart();
        resetVisuals();
        const spawnPosition = targetCheckpoint?.position;
        airplane.setPosition(spawnPosition?.x ?? 0, spawnPosition ? spawnPosition.y + 5 : 5, spawnPosition?.z ?? 0);
        airplane.setVelocity(0, 0, 0);
        airplane.setRotation(0, 0, 0);
        airplane.setAngularVelocity(0, 0, 0);
        airplane.controls.throttle = 0;
        if (typeof airplane.fuelCapacity === 'number') airplane.fuel = airplane.fuelCapacity;
    }

    function update(currentPosition, lastCheckpointRef) {
        checkpoints.forEach((checkpoint) => {
            const radius = checkpoint.config.triggerRadius ?? 24;
            const isInside = currentPosition.distanceTo(checkpoint.position) <= radius;
            if (isInside && !checkpoint.inside && !checkpoint.reached) {
                checkpoint.reached = true;
                lastCheckpointRef.lastCheckpoint = checkpoint;
                const reward = checkpoint.config.reward ?? {};
                if (reward.fuel > 0 && typeof airplane.fuelCapacity === 'number') {
                    airplane.fuel = Math.min(airplane.fuelCapacity, airplane.fuel + reward.fuel);
                }
                if (reward.money > 0 && window.gameState) window.gameState.addMoney(reward.money);
                showBanner?.(`Runway Reached — Respawn Ready`);
            }
            checkpoint.inside = isInside;
        });
    }

    function checkRunwayCollision(planePos, planeSize = 3) {
        for (const runway of runways) {
            const dx = Math.abs(planePos.x - runway.centerX);
            const dz = Math.abs(planePos.z - runway.centerZ);
            const dy = planePos.y - runway.platformTop;
            if (dx < runway.width / 2 + planeSize && dz < runway.length / 2 + planeSize && dy >= -planeSize && dy <= 0.6) {
                return { runway, landingHeight: runway.platformTop, distanceAbove: dy };
            }
        }
        return null;
    }

    return { build, checkpoints, respawnAtCheckpoint, update, resetVisuals, checkRunwayCollision };
}
