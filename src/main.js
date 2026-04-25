import { World } from './World.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { Airplane } from './Airplane.js';
import { CodeEditor } from './CodeEditor.js';
import * as Obstacle from './obstacle.js';

// --- Initialize Core ---
const world = new World('#bg');
const airplane = new Airplane(world.scene);
const controls = new OrbitControls(world.camera, world.renderer.domElement);


const editorInfo = {
    airplane: {
        pos: {
            x: 0,
            y: 0,
            z: 0
        },
        velocity: {
            x: 0,
            y: 0,
            z: 0
        },
        air_speed: {
            x: 0,
            y: 0,
            z: 0
        },
        controls: airplane.controls
    },
    keys: new Set(),
};

const editorApi = {
    setAileronLeft: (instance, value) => {
        airplane.controls.aileronLeft = value;
    },
    setAileronRight: (instance, value) => {
        airplane.controls.aileronRight = value;
    },
    setElevatorLeft: (instance, value) => {
        airplane.controls.elevatorLeft = value;
    },
    setElevatorRight: (instance, value) => {
        airplane.controls.elevatorRight = value;
    },
    setFlaps: (instance, value) => {
        airplane.controls.flaps = value;
    },
    setSteeringWheel: (instance, value) => {
        airplane.controls.steeringWheel = value;
    },
    setThrottle: (instance, value) => {
        airplane.controls.throttle = value;
    },
};

// const initialCode = 
// `setThrottle(1)
// await sleep(1000)
// setElevatorLeft(-16)
// setElevatorRight(-16)
// `

const initialCode = 
`// Minimalist Editor Demo
startLoop(async () => {
    // 1. Live Data: Reacts to current altitude
    const alt = info.airplane.pos.y;
    
    // 2. Terminal: Dynamic logging
    log('Altitude: ', alt.toFixed(2));

    // 3. API Control: Auto-throttle based on height
    if (alt < 10) {
        setThrottle(1);
        setElevatorLeft(-5);
        setElevatorRight(-5);
        log("System: Low altitude! Applying full thrust.");
    } else {
        setElevatorLeft(0);
        setElevatorRight(0);
        setThrottle(0.5);
    }


    // 4. Async: Wait before next check
    await sleep(500); 
}, 1000);
`;

setInterval(() => {
    editorInfo.airplane.pos.x = parseFloat(airplane.position.x.toFixed(2));
    editorInfo.airplane.pos.y = parseFloat(airplane.position.y.toFixed(2));
    editorInfo.airplane.pos.z = parseFloat(airplane.position.z.toFixed(2));

    editorInfo.airplane.velocity.x = parseFloat(airplane.velocity.x.toFixed(2));
    editorInfo.airplane.velocity.y = parseFloat(airplane.velocity.y.toFixed(2));
    editorInfo.airplane.velocity.z = parseFloat(airplane.velocity.z.toFixed(2));

    
    editorInfo.airplane.air_speed.x = parseFloat(airplane.relativeVelocity.x.toFixed(2));
    editorInfo.airplane.air_speed.y = parseFloat(airplane.relativeVelocity.y.toFixed(2));
    editorInfo.airplane.air_speed.z = parseFloat(airplane.relativeVelocity.z.toFixed(2));

    editorInfo.airplane.controls = airplane.controls;
    
    // editorInfo.airplane.pos.x =;
    // editorInfo.missile.pos.x = parseFloat(editorInfo.missile.pos.x.toFixed(2));
    codeEditor.setInfo(editorInfo);
}, 30);

window.addEventListener('keydown', (e) => {
    if (!codeEditor.isFocused && !editorInfo.keys.has(e.key)) {
        editorInfo.keys.add(e.key);
        codeEditor.setInfo(editorInfo);
    }
});

window.addEventListener('keyup', (e) => {
    if (!codeEditor.isFocused && editorInfo.keys.has(e.key)) {
        editorInfo.keys.delete(e.key);
        codeEditor.setInfo(editorInfo);
    }
});


// --- 2. Instantiate CodeEditor ---
const codeEditor = new CodeEditor(editorInfo, editorApi, initialCode);

const restartBtn = document.getElementById('restartBtn');
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        window.location.reload();
    });
}

const splitter = document.getElementById('splitter');
const rightPanel = document.getElementById('right-panel');
let isResizing = false;
const MIN_RIGHT_PANEL_WIDTH = 280;
const MIN_VIEWPORT_WIDTH = 320;

if (splitter && rightPanel) {
    splitter.addEventListener('mousedown', (event) => {
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        event.preventDefault();
    });

    window.addEventListener('mousemove', (event) => {
        if (!isResizing) return;

        const available = window.innerWidth - MIN_VIEWPORT_WIDTH;
        const newWidth = Math.min(Math.max(MIN_RIGHT_PANEL_WIDTH, window.innerWidth - event.clientX), available);
        rightPanel.style.width = `${newWidth}px`;

        const viewport = document.getElementById('viewport');
        if (viewport) {
            world.resize(viewport.clientWidth, viewport.clientHeight);
        } else {
            world.resize();
        }
    });

    window.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';

        const viewport = document.getElementById('viewport');
        if (viewport) {
            world.resize(viewport.clientWidth, viewport.clientHeight);
        } else {
            world.resize();
        }
    });
}

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

}

const inputController = new InputController();
const thirdPersonCamera = new ThirdPersonCamera(world.camera, airplane);

airplane.setPosition(0, 0, 0);
Obstacle.initObstacles(world.scene);

function animate() {
    requestAnimationFrame(animate);

    // Update Logic
    // airplane.updateKeys(inputController.keys);
    airplane.updateTime();
    Obstacle.updateObstacles();

    // Environment Animation
    world.effectController.elevation += 0.02;
    world.updateSun();

    // Dynamic Shadows linked to airplane
    const altitude = Math.max(airplane.position.y, 0);
    const dynamicSize = 3 + (altitude * 2);
    
    world.directionalLight.shadow.camera.left = -dynamicSize;
    world.directionalLight.shadow.camera.right = dynamicSize;
    world.directionalLight.shadow.camera.top = dynamicSize;
    world.directionalLight.shadow.camera.bottom = -dynamicSize;
    world.directionalLight.shadow.camera.updateProjectionMatrix();

    // Light follows airplane
    world.directionalLight.position.copy(airplane.position).addScaledVector(world.sun, 50);
    world.directionalLight.target.position.copy(airplane.position);

    thirdPersonCamera.update();
    updateSpeedometer(airplane);
    
    // Render
    world.render();
}

function updateSpeedometer(plane) {
    const speed = plane.relativeVelocity.z;
    const altitude = Math.max(plane.position.y, 0);
    
    document.querySelector('.speed-value').textContent = speed.toFixed(2);
    const speedRatio = Math.min(speed / 0.6, 1);
    document.querySelector('.speed-needle').style.transform = `rotate(${-90 + (speedRatio * 90)}deg)`;
    
    document.querySelector('.alt-bar-fill').style.height = (Math.min(altitude / 100, 1) * 100) + '%';
    document.querySelector('.alt-value').textContent = Math.round(altitude);
}

animate();