import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { Sky } from 'https://unpkg.com/three@0.160.0/examples/jsm/objects/Sky.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

import { Airplane } from './src/Airplane.js';
import * as Obstacle from './src/obstacle.js';

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

function updateSun() {
    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = effectController.turbidity;
    uniforms['rayleigh'].value = effectController.rayleigh;
    uniforms['mieCoefficient'].value = effectController.mieCoefficient;
    uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
    const theta = THREE.MathUtils.degToRad(effectController.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(sun);
}
updateSun();

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
    roughness: 1.8,
    color: '#c4c4c4'
});

const ground = new THREE.Mesh(planeGeo, planeMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
ground.position.y = 0;

// --- 4. Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: Makes shadows look smooth
ground.receiveShadow = true;
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
directionalLight.position.copy(sun); 
directionalLight.castShadow = true;

// Increase the shadow "capture area" to cover your plane and the nearby ground
const d = 5; 
directionalLight.shadow.camera.left = -d;
directionalLight.shadow.camera.right = d;
directionalLight.shadow.camera.top = d;
directionalLight.shadow.camera.bottom = -d;

// Increase resolution so the airplane shadow isn't a blocky mess
const shadowBlur = 5;
directionalLight.shadow.mapSize.width = 2048 / shadowBlur;
directionalLight.shadow.mapSize.height = 2048 / shadowBlur;

scene.add(directionalLight);
scene.add(directionalLight.target);


// --- 5. Controls ---
const controls = new OrbitControls(camera, renderer.domElement);



// --- 6. Input Controller ---
class InputController {
    constructor() {
        this.keys = new Map();
        this.mouse = {
            x: 0,
            y: 0,
            left: false,
            right: false,
            middle: false,
            wheelDelta: 0
        };
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Keyboard
        window.addEventListener('keydown', (e) => this.handleKeyDown(e), false);
        window.addEventListener('keyup', (e) => this.handleKeyUp(e), false);

        // Mouse Position
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e), false);

        // Mouse Buttons
        window.addEventListener('mousedown', (e) => this.handleMouseButtons(e, true), false);
        window.addEventListener('mouseup', (e) => this.handleMouseButtons(e, false), false);

        // Mouse Wheel
        window.addEventListener('wheel', (e) => {
            this.mouse.wheelDelta = e.deltaY;
        }, { passive: true });

        // Optional: Context Menu (prevents right-click menu from popping up in-game)
        window.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    handleMouseMove(event) {
        this.mouse.x = event.clientX
        this.mouse.y = event.clientY
    }

    handleMouseButtons(event, isDown) {
        if (event.button === 0) this.mouse.left = isDown;
        if (event.button === 1) this.mouse.middle = isDown;
        if (event.button === 2) this.mouse.right = isDown;
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

    isKeyPressed(key) {
        return this.keys.has(key.toLowerCase());
    }

    update(airplane) {
        airplane.updateKeys(this.keys);

        if (this.keys.has('r')) {
            airplane.shoot();
        }
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
        if (!this.airplane.model) return;
        if (inputController.mouse.left) return
        // Get the forward vector of the airplane
        const forward = this.airplane.directions.z;
        
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

// 5.5 Add a Realistic Airplane Model
var airplane = new Airplane(scene);

const thirdPersonCamera = new ThirdPersonCamera(camera, airplane);

// --- 8. Handle Window Resize ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

airplane.setPosition(0, 0, 0)
// Initialize obstacles (add their meshes to the scene)
Obstacle.initObstacles(scene);

// --- 9. Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    inputController.update(airplane);
    airplane.updateTime();
    Obstacle.updateObstacles();

    effectController.elevation += 0.02
    updateSun()

    // Inside animate()
    const altitude = Math.max(airplane.position.y, 0);

    // As you fly higher, we "zoom out" the shadow camera.
    // This spreads the shadow pixels thinner, making it look blurry.
    const dynamicSize = 3 + (altitude * 2); // Starts at 25, grows with height

    directionalLight.shadow.camera.left = -dynamicSize;
    directionalLight.shadow.camera.right = dynamicSize;
    directionalLight.shadow.camera.top = dynamicSize;
    directionalLight.shadow.camera.bottom = -dynamicSize;

    // We MUST call this for the camera change to take effect
    directionalLight.shadow.camera.updateProjectionMatrix();

    // Move light as usual
    directionalLight.position.copy(airplane.position).addScaledVector(sun, 50);
    directionalLight.target.position.copy(airplane.position);

    thirdPersonCamera.update();
    updateSpeedometer();
    
    // Render scene
    renderer.render(scene, camera);
}

function updateSpeedometer() {
    const speed = airplane.relativeVelocity.z
    
    const speedDisplay = document.querySelector('.speed-value');
    if (speedDisplay) {
        speedDisplay.textContent = speed.toFixed(2);
    }
    
    // Update needle rotation
    const maxSpeed = 0.6; // max speed for speedometer
    const speedRatio = Math.min(speed / maxSpeed, 1); // clamp between 0-1
    const needleRotation = -90 + (speedRatio * 90); // rotate from -45° (bottom left) to +45° (bottom right)
    
    const needle = document.querySelector('.speed-needle');
    if (needle) {
        needle.style.transform = `rotate(${needleRotation}deg)`;
    }
    
    // Update altimeter
    const altitude = Math.max(airplane.position.y, 0); // height above ground
    const maxAltitude = 100; // max altitude for bar
    const altitudeRatio = Math.min(altitude / maxAltitude, 1);
    
    const altBar = document.querySelector('.alt-bar-fill');
    if (altBar) {
        altBar.style.height = (altitudeRatio * 100) + '%';
    }
    
    const altDisplay = document.querySelector('.alt-value');
    if (altDisplay) {
        altDisplay.textContent = Math.round(altitude);
    }
}

animate();