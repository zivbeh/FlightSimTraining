import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { Sky } from 'https://unpkg.com/three@0.160.0/examples/jsm/objects/Sky.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

import { Airplane } from './Airplane.js';

// --- 1. Scene & Camera Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 10, 20);

const renderer = new THREE.WebGLRenderer({ 
    canvas: document.querySelector('#bg'), 
    antialias: true 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Required for the Sky shader look

// --- 2. The Unity-Style Sky ---
const sky = new Sky();
sky.scale.setScalar(450000);
scene.add(sky);

const sun = new THREE.Vector3();
const effectController = {
    turbidity: 10,
    rayleigh: 3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
    elevation: 2, // Horizon angle
    azimuth: 180,
};

const uniforms = sky.material.uniforms;
uniforms['turbidity'].value = effectController.turbidity;
uniforms['rayleigh'].value = effectController.rayleigh;
uniforms['mieCoefficient'].value = effectController.mieCoefficient;
uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
const theta = THREE.MathUtils.degToRad(effectController.azimuth);
sun.setFromSphericalCoords(1, phi, theta);
uniforms['sunPosition'].value.copy(sun);

// --- 3. The Ground Plane (Grass) ---
const textureLoader = new THREE.TextureLoader();

// You can replace this URL with your own grass texture file
const grassTexture = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');

// These lines are CRITICAL: They tell Three.js to tile the image
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(100, 100); // Repeat the image 100 times across the plane

const planeGeo = new THREE.PlaneGeometry(1000, 1000);
const planeMat = new THREE.MeshStandardMaterial({ 
    map: grassTexture, // Apply the texture here
    roughness: 0.8     // Grass shouldn't be shiny like plastic
});

const ground = new THREE.Mesh(planeGeo, planeMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
ground.position.y = 0;

// --- 4. Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.copy(sun); // Light comes from the "sun"
scene.add(directionalLight);

// --- 5. Controls ---
const controls = new OrbitControls(camera, renderer.domElement);


// 5.5 Add a Realistic Airplane Model
var airplane = new Airplane(scene);

// --- 6. Input Controller ---
class InputController {
    constructor() {
        this.keys = new Map();
        this.rotationSpeed = 0.05;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e), false);
        window.addEventListener('keyup', (e) => this.handleKeyUp(e), false);
    }

    handleKeyDown(event) {
        const key = event.key.toLowerCase();
        if (!this.keys.has(key)) {
            this.keys.set(key, true);
        }
    }

    handleKeyUp(event) {
        const key = event.key.toLowerCase();
        this.keys.delete(key);
    }

    update(airplane) {
        console.log("as")
        if (this.keys.has('w')) airplane.rotateUp(this.rotationSpeed);
        if (this.keys.has('s')) airplane.rotateDown(this.rotationSpeed);
        if (this.keys.has('a')) airplane.rotateLeft(this.rotationSpeed);
        if (this.keys.has('d')) airplane.rotateRight(this.rotationSpeed);

        if (this.keys.has(' ')) {
            const forward = this.airplane.getForwardVector();
            // Update velocity for momentum
            this.airplane.velocity.x += forward.x * this.airplane.accelerationForce;
            this.airplane.velocity.y += forward.y * this.airplane.accelerationForce;
            this.airplane.velocity.z += forward.z * this.airplane.accelerationForce;
            
            // Also update position directly in the aiming direction
            this.airplane.position.x += forward.x * this.airplane.accelerationForce;
            this.airplane.position.y += forward.y * this.airplane.accelerationForce;
            this.airplane.position.z += forward.z * this.airplane.accelerationForce;
        }
    }

    isKeyPressed(key) {
        return this.keys.has(key.toLowerCase());
    }
}

const inputController = new InputController();

// --- 7. Third Person Camera Controller ---
class ThirdPersonCamera {
    constructor(camera, airplane) {
        this.camera = camera;
        this.airplane = airplane;
        this.distance = 20;      // Distance behind the airplane
        this.height = 8;         // Height above the airplane
        this.smoothness = 0.1;   // Smoothing factor for camera movement
    }

    update() {
        // Get the forward vector of the airplane
        const forward = this.airplane.getForwardVector();
        
        // Calculate desired camera position (behind and above the airplane)
        const desiredX = this.airplane.position.x - forward.x * this.distance;
        const desiredY = this.airplane.position.y + this.height;
        const desiredZ = this.airplane.position.z - forward.z * this.distance;
        
        // Smoothly move camera to desired position
        this.camera.position.x += (desiredX - this.camera.position.x) * this.smoothness;
        this.camera.position.y += (desiredY - this.camera.position.y) * this.smoothness;
        this.camera.position.z += (desiredZ - this.camera.position.z) * this.smoothness;
        
        // Look at a point slightly ahead of the airplane
        const lookAheadDistance = 5;
        const lookAtX = this.airplane.position.x + forward.x * lookAheadDistance;
        const lookAtY = this.airplane.position.y;
        const lookAtZ = this.airplane.position.z + forward.z * lookAheadDistance;
        
        this.camera.lookAt(lookAtX, lookAtY, lookAtZ);
    }
}

const thirdPersonCamera = new ThirdPersonCamera(camera, airplane);

// --- 8. Handle Window Resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

airplane.setPosition(0, 4, 0)

// --- 9. Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    
    // Update airplane input
    inputController.update(airplane);
     
    // Update airplane physics
    airplane.updateTime();
    
    // Update third person camera
    // thirdPersonCamera.update();
    
    // Render scene
    renderer.render(scene, camera);
}

animate();