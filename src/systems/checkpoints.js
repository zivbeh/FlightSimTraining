import * as THREE from 'three';

// Checkpoint system: manages stations, reward points, and respawn logic
export function createCheckpointSystems({ world, checkpoints, airplane, showBanner }) {
    
    // Track active runways for collision detection
    const runways = [];

    // Build runway stations only for checkpoints marked with hasStation: true
    function createRunway(checkpoint) {
        const group = new THREE.Group();
        const runwayLength = 156;  // 1.3x longer for actual takeoff/landing
        const runwayWidth = 48;    // 1.2x wider for real planes
        const platformHeight = 5;  // Elevated platform

        // Main platform surface
        const platformMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9,
            metalness: 0.05
        });
        const platform = new THREE.Mesh(
            new THREE.BoxGeometry(runwayWidth, 0.4, runwayLength),
            platformMaterial
        );
        platform.position.set(0, platformHeight, 0);
        group.add(platform);
        
        // Store collision data for this runway
        // Track the base checkpoint altitude, not the waypoint mesh altitude
        runways.push({
            baseAltitude: checkpoint.config.position.y,  // Original checkpoint altitude
            width: runwayWidth,
            length: runwayLength,
            centerX: checkpoint.mesh.position.x,
            centerZ: checkpoint.mesh.position.z,
            checkpoint: checkpoint
        });

        // Center runway stripe (dashed markers)
        const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xffd700 });
        for (let i = 0; i < 6; i++) {
            const stripe = new THREE.Mesh(
                new THREE.BoxGeometry(runwayWidth * 0.6, 0.05, 4),
                stripeMaterial
            );
            stripe.position.set(0, platformHeight + 0.22, -runwayLength / 2 + 8 + i * 8);
            group.add(stripe);
        }

        // Edge markings (white lines)
        const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const edgeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, runwayLength * 0.9), edgeMaterial);
        const edgeRight = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, runwayLength * 0.9), edgeMaterial);
        edgeLeft.position.set(-runwayWidth / 2 + 0.3, platformHeight + 0.22, 0);
        edgeRight.position.set(runwayWidth / 2 - 0.3, platformHeight + 0.22, 0);
        group.add(edgeLeft);
        group.add(edgeRight);

        // Landing lights (runway ends - fewer and smaller)
        const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600, emissive: 0xff3300 });
        for (let i = 0; i < 2; i++) {
            const light = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 1.5), lightMaterial);
            const xPos = (i % 2 === 0 ? -1 : 1) * (runwayWidth / 2 - 3);
            const zPos = -runwayLength / 2 + 5 + (i < 1 ? 0 : runwayLength - 10);
            light.position.set(xPos, platformHeight + 1.5, zPos);
            group.add(light);

            const glow = new THREE.PointLight(0xff3300, 1.5, 20);
            glow.position.copy(light.position);
            group.add(glow);
        }

        // Support structure (fewer, smaller pillars)
        const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 });
        const pillarPositions = [[-15, 0, -25], [15, 0, -25]];
        pillarPositions.forEach(([x, y, z]) => {
            const pillar = new THREE.Mesh(
                new THREE.CylinderGeometry(1.8, 2.2, platformHeight * 2.2, 8),
                pillarMaterial
            );
            pillar.position.set(x, platformHeight / 2, z);
            group.add(pillar);
        });

        // Control tower at end (smaller, inside)
        const tower = new THREE.Mesh(
            new THREE.BoxGeometry(5, 6, 5),
            new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 })
        );
        tower.position.set(18, platformHeight + 3, -runwayLength / 2 + 12);
        group.add(tower);

        group.position.set(checkpoint.mesh.position.x, checkpoint.mesh.position.y, checkpoint.mesh.position.z);
        world.scene.add(group);
    }

    // Create support station beside runway (fuel, repairs, etc)
    function createSupportStation(checkpoint) {
        const group = new THREE.Group();
        const platHeight = 5;

        // Fuel tanks (smaller) - positioned inside on the side
        const tankMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5dff, roughness: 0.4, metalness: 0.3 });
        const tank1 = new THREE.Mesh(
            new THREE.CylinderGeometry(3, 3.3, 5, 16),
            tankMaterial
        );
        tank1.position.set(-19, platHeight + 2.5, 8);
        group.add(tank1);

        const tank2 = new THREE.Mesh(
            new THREE.CylinderGeometry(3, 3.3, 5, 16),
            tankMaterial
        );
        tank2.position.set(-19, platHeight + 2.5, -8);
        group.add(tank2);

        // Service building (smaller) - positioned inside on the side
        const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x3d2c1e, roughness: 0.8 });
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(12, 6, 12),
            buildingMaterial
        );
        building.position.set(19, platHeight + 3, 15);
        group.add(building);

        // Roof
        const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 });
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(9, 2, 4),
            roofMaterial
        );
        roof.position.set(19, platHeight + 6, 15);
        group.add(roof);

        // Flag pole (smaller) - positioned inside on the side
        const poleMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.6 });
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.3, 10, 8),
            poleMaterial
        );
        pole.position.set(19, platHeight + 5, -20);
        group.add(pole);

        group.position.set(checkpoint.mesh.position.x, checkpoint.mesh.position.y, checkpoint.mesh.position.z);
        world.scene.add(group);
    }

    function build() {
        checkpoints.forEach((checkpoint) => {
            if (checkpoint.config?.hasStation) {
                createRunway(checkpoint);
                createSupportStation(checkpoint);
            }
        });
    }

    function resetVisuals() {
        checkpoints.forEach((checkpoint) => {
            if (checkpoint.mesh?.material) {
                checkpoint.mesh.material.color.copy(checkpoint.originalColor);
            }
        });
    }

    function respawnAtCheckpoint(targetCheckpoint = null) {
        airplane.restart();
        resetVisuals();

        if (targetCheckpoint?.mesh) {
            const spawnPos = targetCheckpoint.mesh.position;
            // Spawn above the checkpoint for flying out
            const spawnAltitude = spawnPos.y + 20;
            airplane.setPosition(spawnPos.x, spawnAltitude, spawnPos.z);
            airplane.setVelocity(0, 0, 0);
            airplane.setRotation(0, 0, 0);
            airplane.setAngularVelocity(0, 0, 0);
            airplane.controls.throttle = 0;
            airplane.fuel = airplane.fuelCapacity;
            return;
        }

        // Fallback to start position
        airplane.setPosition(0, 5, 0);
        airplane.setVelocity(0, 0, 0);
        airplane.setRotation(0, 0, 0);
        airplane.setAngularVelocity(0, 0, 0);
        airplane.controls.throttle = 0;
        airplane.fuel = airplane.fuelCapacity;
    }

    function update(currentPosition, lastCheckpointRef) {
        checkpoints.forEach((checkpoint) => {
            if (checkpoint.update(currentPosition)) {
                lastCheckpointRef.lastCheckpoint = checkpoint;
                
                // Award fuel/money rewards from checkpoint config
                if (checkpoint.config?.reward) {
                    const reward = checkpoint.config.reward;
                    if (reward.fuel > 0) {
                        airplane.fuel = Math.min(airplane.fuelCapacity, airplane.fuel + reward.fuel);
                    }
                    if (reward.money > 0 && window.gameState) {
                        window.gameState.addMoney(reward.money);
                    }
                }

                // Show appropriate banner message
                const msg = checkpoint.config?.hasStation 
                    ? 'Station Reached — Respawn Ready' 
                    : `Checkpoint! +${checkpoint.config?.reward?.fuel || 0} Fuel, +$${checkpoint.config?.reward?.money || 0}`;
                showBanner?.(msg);
            }
        });
    }

    // Check if plane is colliding with any runway platform
    function checkRunwayCollision(planePos, planeSize = 3) {
        for (const runway of runways) {
            const dx = Math.abs(planePos.x - runway.centerX);
            const dz = Math.abs(planePos.z - runway.centerZ);
            
            // Calculate actual world-space landing height
            // Runway group is positioned at waypoint.mesh.position, which for stations is at:
            // baseAltitude + 5 (runway base offset) + 8 (waypoint height/2 from setPosition)
            // Platform is offset by 5 from group origin, so platform top is at:
            const groupAltitude = runway.baseAltitude + 5 + 8;
            const platformTop = groupAltitude + 5 + 0.2;
            const dy = planePos.y - platformTop;

            // Plane is within runway bounds horizontally
            const onRunwayX = dx < (runway.width / 2 + planeSize);
            const onRunwayZ = dz < (runway.length / 2 + planeSize);

            // Plane is just above or at runway surface (approaching/landing)
            const nearRunway = dy >= -planeSize && dy < planeSize;

            if (onRunwayX && onRunwayZ && nearRunway) {
                return {
                    runway: runway,
                    landingHeight: platformTop,
                    distanceAbove: dy
                };
            }
        }
        return null;
    }

    return {
        build,
        respawnAtCheckpoint,
        update,
        resetVisuals,
        checkRunwayCollision,
    };
}
