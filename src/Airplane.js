import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

export class Airplane {
    // Earth constants
    static EARTH_RADIUS = 6371000; // meters
    static GRAVITY_PARAM = 3.986e14; // GM in m³/s² (gravitational parameter)
    static EARTH_CENTER_Z = -Airplane.EARTH_RADIUS; // Earth's center z-position

    constructor(scene) {
        this.scene = scene;
        this.position = { x: 0, y: 0, z: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.orientation = { x: 0, y: 0, z: 0 };
        this.angularVelocity = { x: 0, y: 0, z: 0 };
        this.isCrashed = false;
        this.weatherConditions = [0.9, 0.9, 0.9];
        this.accelerationForce = 0.01;
        this.model = null;
        this.loadModel();
    }

    updateTime() {
        // every frame we update the plane's position based on its velocity
        // we also modify the velocity since the plane slows down naturally
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;
        this.position.z += this.velocity.z;

        if (this.position.z < 0) {
            console.log("Plane crashed!")
            this.isCrashed = true;
            this.position.z = 0;
        }

        // // Apply gravity acceleration
        const gravity = this.calculateGravity();
        this.velocity.y -= gravity;

        // //update velocity to simulate drag
        this.velocity.x *= this.weatherConditions[0];
        this.velocity.y *= this.weatherConditions[1];
        this.velocity.z *= this.weatherConditions[2];
        
        this.updateScene()
    }

    updateScene() { 
        if (!this.model) return;
        this.model.position.x = this.position.x;
        this.model.position.y = this.position.y;
        this.model.position.z = this.position.z;
        this.model.rotation.x = this.orientation.x;
        this.model.rotation.y = this.orientation.y;
        this.model.rotation.z = this.orientation.z;
    }

    setPosition(x, y, z) {
        this.position.x = x;
        this.position.y = y;
        this.position.z = z;
    }

    setVelocity(x, y, z) {
        this.velocity.x = x;
        this.velocity.y = y;
        this.velocity.z = z;
    }
    
    calculateGravity() {
        // Calculate distance from Earth's center
        const distanceFromCenter = Math.sqrt(
            this.position.x ** 2 + 
            this.position.y ** 2 + 
            (this.position.z - Airplane.EARTH_CENTER_Z) ** 2
        );
        
        // Calculate gravitational acceleration: g = GM/r²
        const gravityMagnitude = Airplane.GRAVITY_PARAM / (distanceFromCenter ** 2);
        
        // Direction: toward Earth's center (normalize vector from plane to center)
        const dy = -this.position.y;
        const dz = Airplane.EARTH_CENTER_Z - this.position.z;
        const norm = Math.sqrt(this.position.x ** 2 + dy ** 2 + dz ** 2);
        
        return (dy / norm) * gravityMagnitude;
    }

    loadModel() {
        var model;
        const loader = new GLTFLoader();
        loader.load(
            '/assets/SIERRA_ARC_GND_0824.glb',
            (gltf) => {
                model = gltf.scene;
                
                // Log the model bounds to help with sizing
                const box = new THREE.Box3().setFromObject(model);
                const size = box.getSize(new THREE.Vector3());
                console.log('Model size:', size);
                
                // Auto-scale based on model size
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 5 / maxDim;
                model.scale.set(scale, scale, scale);
                
                model.position.set(0, 0, 0);
                
                // Enable shadows on all meshes
                model.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                console.log('Model loaded successfully');
                this.model = model;
                this.scene.add(model);
            },
            (progress) => {
                console.log('Loading model:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading model:', error);
                console.log('Using fallback airplane model');
            }
        );
    }

    // Rotation methods
    rotateUp(angle) {
        this.orientation.x += angle;
    }

    rotateDown(angle) {
        this.orientation.x -= angle;
    }

    rotateLeft(angle) {
        this.orientation.y += angle;
    }

    rotateRight(angle) {
        this.orientation.y -= angle;
    }

    rotateYaw(angle) {
        this.orientation.z += angle;
    }

    getForwardVector() {
        // Calculate forward direction based on pitch and yaw
        const cosPitch = Math.cos(this.orientation.x);
        const sinPitch = Math.sin(this.orientation.x);
        const cosYaw = Math.cos(this.orientation.z);
        const sinYaw = Math.sin(this.orientation.z);

        return {
            x: sinYaw * cosPitch,
            y: -sinPitch,
            z: cosYaw * cosPitch
        };
    }

}
