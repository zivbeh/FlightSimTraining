import * as THREE from 'three';

export class Runway {
    constructor(world, options = {}) {
        this.world = world;
        this.tileSize = options.tileSize ?? 13;
        this.tileCount = options.tileCount ?? 6;
        this.position = new THREE.Vector3(
            options.x ?? 0,
            options.y ?? 0.025,
            options.z ?? 27
        );

        this.group = this._create();
        this.group.position.copy(this.position);
        this.world.scene.add(this.group);
    }

    _create() {
        const group = new THREE.Group();
        const texture = new THREE.TextureLoader().load(
            new URL('../assets/runway1.png', import.meta.url).href
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(
            8,
            this.world.renderer.capabilities.getMaxAnisotropy()
        );

        const geometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.95,
            metalness: 0
        });
        const totalLength = this.tileCount * this.tileSize;

        for (let index = 0; index < this.tileCount; index++) {
            const tile = new THREE.Mesh(geometry, material);
            tile.rotation.x = -Math.PI / 2;
            tile.position.z = -totalLength / 2 + this.tileSize / 2 + index * this.tileSize;
            tile.receiveShadow = true;
            group.add(tile);
        }

        return group;
    }
}
