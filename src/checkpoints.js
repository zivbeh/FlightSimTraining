import * as THREE from 'three';

// Runway checkpoint system. Waypoints are intentionally managed elsewhere.
export function createCheckpointSystems({ world, checkpointConfigs, airplane, showBanner }) {
    const runways = [];
    const groups = [];
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
        platform.receiveShadow = true;
        group.add(platform);

        const texture = new THREE.TextureLoader().load(
            new URL('../assets/runway1.png', import.meta.url).href
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(runwayWidth / 13, runwayLength / 13);
        texture.anisotropy = Math.min(8, world.renderer.capabilities.getMaxAnisotropy());

        const runwaySurface = new THREE.Mesh(
            new THREE.PlaneGeometry(runwayWidth, runwayLength),
            new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 })
        );
        runwaySurface.rotation.x = -Math.PI / 2;
        runwaySurface.position.y = platformHeight + 0.205;
        runwaySurface.receiveShadow = true;
        group.add(runwaySurface);

        group.position.copy(checkpoint.position);
        world.scene.add(group);
        checkpoint.group = group;
        groups.push(group);

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
        groups.push(group);
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
        airplane.setPosition(spawnPosition?.x ?? 0, spawnPosition ? spawnPosition.y + 5 : 0, spawnPosition?.z ?? 0);
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

    function destroy() {
        groups.forEach((group) => {
            group.traverse((child) => {
                child.geometry?.dispose?.();
                if (Array.isArray(child.material)) {
                    child.material.forEach((material) => material.dispose?.());
                } else {
                    child.material?.dispose?.();
                }
            });
            world.scene.remove(group);
        });
        groups.length = 0;
        runways.length = 0;
    }

    return { build, checkpoints, respawnAtCheckpoint, update, resetVisuals, checkRunwayCollision, destroy };
}
