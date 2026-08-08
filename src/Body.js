import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

export class Body {
    constructor(world) {
        this.scene = world.scene;
        this.position = new THREE.Vector3(0, 0, 0); // controlled
        this.rotation = new THREE.Vector3(0, 0, 0); // observed
        this.model = null;
        this.scale = 5
    }

    updateModelPosition() {
        if (!this.model) return;
        this.model.position.copy(this.position);
    }

    updateModelRotation() {
        if (!this.model) return;
        const euler = new THREE.Euler(this.rotation.x, this.rotation.y, this.rotation.z, 'YXZ');
        this.model.quaternion.setFromEuler(euler);
    }

    setPosition(x, y, z) {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
        this.updateModelPosition();
    }

    setRotation(x, y, z) {
        if (!this.model) return;
        this.rotation.x = x;
        this.rotation.y = y;
        this.rotation.z = z;
        this.updateModelRotation();
    }

    setRotationX(angle) {
        this.rotation.x = angle;
        this.updateModelRotation();
    }

    setRotationY(angle) {
        this.rotation.y = angle;
        this.updateModelRotation();
    }

    setRotationZ(angle) {
        this.rotation.z = angle;
        this.updateModelRotation();
    }

    setQuaternion(quaternion) {
        if (!this.model) return;
        
        // 1. Apply the quaternion directly to the 3D asset
        this.model.quaternion.copy(quaternion);
        
        // 2. Synchronize your internal Euler tracking state using the 'YXZ' order
        const euler = new THREE.Euler().setFromQuaternion(this.model.quaternion, 'YXZ');
        this.rotation.x = euler.x;
        this.rotation.y = euler.y;
        this.rotation.z = euler.z;
    }

    loadModel(modelPath = '') {
        const loader = new GLTFLoader();
        loader.load(
            modelPath,
            (gltf) => {
                const model = gltf.scene;
                
                // 1. Setup Scaling FIRST
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = this.scale / maxDim;
                model.scale.set(scale, scale, scale);
                model.position.set(0, 0, 0);

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                // 3. Assign directly to scene (Uses asset's native 0,0,0)
                this.model = model;
                this.scene.add(model);
                this.updateModelPosition();
                this.updateModelRotation();
                

                // Compute bounding box for size calculations
                const boundingBox = new THREE.Box3().setFromObject(model);
                this.boundingSize = boundingBox.getSize(new THREE.Vector3());
                this.boundingRadius = this.boundingSize.length() / 2;
            },
            (progress) => {},
            (error) => {
                console.error('Error loading model:', error);
                // wait for a second, if stil this.model isnt defined then render a rectangle instead of a model
                setTimeout(() => {
                    if (!this.model) {

                    // render a rectangle instead of a model
                    const geometry = new THREE.BoxGeometry(0.5 * this.scale, 0.1 * this.scale, 0.8 * this.scale);
                    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
                    const fallbackModel = new THREE.Mesh(geometry, material);
                    this.model = fallbackModel;
                    this.scene.add(fallbackModel);
                    }
                }, 10);
            }
        );
    }

}

export class DynamicBody extends Body {
    constructor(world) {
        super(world);
        this.velocity = new THREE.Vector3(0, 0, 0); // controlled
        this.relativeVelocity = new THREE.Vector3(0, 0, 0); // observed
        this.angularVelocity = new THREE.Vector3(0, 0, 0); // controlled
        this.relativeAngularVelocity = new THREE.Vector3(0, 0, 0); // observed

        const zDir = new THREE.Vector3(0, 0, 1);
        const yDir = new THREE.Vector3(0, 1, 0);
        const xDir = new THREE.Vector3(1, 0, 0);
        this.directions = { x: xDir, y: yDir, z: zDir };// observed
    }

    restart() {
        this.setPosition(0, 0, 0);
        this.setVelocity(0, 0, 0);
        this.setRotation(0, 0, 0);
        this.setAngularVelocity(0, 0, 0);
    }

    updateTime() {
        if (!this.model) return
        this.calculateObservedInfo()
        this.updateMovement()
        this.updateRotation()
    }

    updateMovement() {
        // move from velocity
        this.position.x += this.velocity.x; 
        this.position.y += this.velocity.y;
        this.position.z += this.velocity.z;
        this.model.position.copy(this.position);
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

    setVelocity(x, y, z) {
        this.velocity.x = x;
        this.velocity.y = y;
        this.velocity.z = z;
    }

    setAngularVelocity(x, y, z) {
        this.angularVelocity.x = x;
        this.angularVelocity.y = y;
        this.angularVelocity.z = z;
    }
}
