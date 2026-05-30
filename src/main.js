import { World } from './World.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { Airplane } from './Airplane.js';
import { CodeEditor } from './CodeEditor.js';
import * as Obstacle from './obstacle.js';
import { soundManager } from './sound.js';
import Upgrades from './upgrades.js';
import { UPGRADE_DEFINITIONS } from './upgradesData.js';
import { Waypoint } from './Waypoint.js';
import { Rocket } from './Rocket.js';


const initialCode = await loadTextFile('./scripts/demoCode1.txt')

async function loadTextFile(path) {
    try {
        const response = await fetch(path);
        
        // Check if the file actually exists and was loaded successfully
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const textString = await response.text();
        return textString;
    } catch (error) {
        console.error("Error loading text file:", error);
        throw error; // Re-throw so the calling code knows it failed
    }
}


// --- Initialize Core ---
const world = new World('#bg');
const airplane = new Airplane(world.scene);
// const rocket = new Rocket(world.scene);



const controls = new OrbitControls(world.camera, world.renderer.domElement);
const checkpoint1 = new Waypoint(world, {
    radius: 4,
    height: 100,
    startHeight: 50,
    color: 'rgb(255, 0, 0)',
    opacity: 0.25
});
checkpoint1.setPosition(0, 30, 200);
const checkpoint2 = new Waypoint(world, {
    radius: 4,
    height: 15,
    startHeight: 0,
    color: 'rgb(255, 0, 0)',
    opacity: 0.25
});
checkpoint2.setPosition(0, 0, 40);

const checkpoint3 = new Waypoint(world, {
    radius: 4,
    height: 15,
    startHeight: 0,
    color: 'rgb(255, 0, 0)',
    opacity: 0.25
});
checkpoint3.setPosition(20, 0, 80);
const checkpoint4 = new Waypoint(world, {
    radius: 4,
    height: 10,
    startHeight: 40,
    color: 'rgb(255, 0, 0)',
    opacity: 0.25
});
checkpoint4.setPosition(-40, 0, 300);
const checkpoints = [checkpoint1, checkpoint2, checkpoint3, checkpoint4];

// Game state: money, score, flight time
window.gameState = {
    money: 500,
    score: 0,
    flightTime: 0,
    addMoney(amount) { this.money = Math.max(0, Math.floor(this.money + (amount||0))); },
    addScore(v) { this.score = Math.max(0, Math.floor(this.score + (v||0))); }
};

Obstacle.initObstacles(world.scene);

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

// --- Upgrades ---
const upgrades = new Upgrades();
function applyUpgradesToPlane() {
    airplane.bulletSpeed = upgrades.getBulletSpeed();
    airplane.bulletDamage = upgrades.getBulletDamage();
    airplane.bulletLife = upgrades.getBulletLife();
    airplane.speedMultiplier = upgrades.getSpeedMultiplier();
    airplane.fuelCapacity = upgrades.getFuelCapacity();
    // ensure current fuel doesn't exceed new capacity
    if (typeof airplane.fuel === 'number') airplane.fuel = Math.min(airplane.fuel, airplane.fuelCapacity);
}
applyUpgradesToPlane();

function refreshUpgradesUI() {
    document.getElementById('up-speed-level').textContent = upgrades.getLevel('speed');
    document.getElementById('up-bullets-level').textContent = upgrades.getLevel('bullets');
    document.getElementById('up-range-level').textContent = upgrades.getLevel('range');
    document.getElementById('up-fuel-level').textContent = upgrades.getLevel('fuel');
}

refreshUpgradesUI();

// Inline upgrade buttons removed — purchases must be made via the upgrades modal to consume money.

// --- Upgrades Modal Wiring ---
const upgradesModal = document.getElementById('upgrades-modal');
const upgradesBackdrop = document.getElementById('upgrades-backdrop');
const upgradesListPanel = document.getElementById('upgrades-list-panel');
const detailName = document.getElementById('detail-name');
const detailDesc = document.getElementById('detail-desc');
const detailMeta = document.getElementById('detail-meta');
const detailUpgradeBtn = document.getElementById('detail-upgrade-btn');
let selectedUpgradeKey = null;

function openUpgradesModal() {
    renderUpgradesList();
    upgradesModal.setAttribute('aria-hidden', 'false');
}

function closeUpgradesModal() {
    upgradesModal.setAttribute('aria-hidden', 'true');
}

function renderUpgradesList() {
    upgradesListPanel.innerHTML = '';
    UPGRADE_DEFINITIONS.forEach(def => {
        const level = upgrades.getLevel(def.key);
        const item = document.createElement('div');
        item.className = 'upgrade-item';
        item.tabIndex = 0;
        item.dataset.key = def.key;
        item.innerHTML = `<strong>${def.name}</strong><div style="font-size:12px;color:#bbb">${def.short}</div><div style="font-size:12px;color:#ffd24d">Level: ${level}/${def.maxLevel}</div>`;
        item.addEventListener('click', () => selectUpgrade(def.key));
        upgradesListPanel.appendChild(item);
    });
    // Auto-select the first upgrade so users immediately see details
    if (UPGRADE_DEFINITIONS.length > 0) {
        selectUpgrade(UPGRADE_DEFINITIONS[0].key);
    }
}

function selectUpgrade(key) {
    const def = UPGRADE_DEFINITIONS.find(d => d.key === key);
    if (!def) return;
    selectedUpgradeKey = key;
    detailName.textContent = def.name;
    detailDesc.textContent = def.description;
    const level = upgrades.getLevel(key);
    detailMeta.innerHTML = `Level: ${level} / ${def.maxLevel} <br> Base Cost: ${def.baseCost}`;
    detailUpgradeBtn.disabled = level >= def.maxLevel ? true : false;
    detailUpgradeBtn.textContent = level >= def.maxLevel ? 'Maxed' : `Upgrade (Level ${level} → ${level+1})`;
}

detailUpgradeBtn.addEventListener('click', () => {
    if (!selectedUpgradeKey) return;
    const def = UPGRADE_DEFINITIONS.find(d => d.key === selectedUpgradeKey);
    if (!def) return;
    const level = upgrades.getLevel(selectedUpgradeKey);
    const cost = def.baseCost * (level + 1);
    if (window.gameState.money < cost) {
        alert('Not enough money for this upgrade. Cost: ' + cost);
        return;
    }
    // Deduct and apply
    window.gameState.addMoney(-cost);
    if (upgrades.upgrade(selectedUpgradeKey)) {
        applyUpgradesToPlane();
        refreshUpgradesUI();
        renderUpgradesList();
        selectUpgrade(selectedUpgradeKey);
    }
});

// if (openUpgradesBtn) openUpgradesBtn.addEventListener('click', openUpgradesModal);
const openUpgradesBtnViewport = document.getElementById('open-upgrades-btn-viewport');
if (openUpgradesBtnViewport) openUpgradesBtnViewport.addEventListener('click', openUpgradesModal);
if (upgradesBackdrop) upgradesBackdrop.addEventListener('click', closeUpgradesModal);
const upgradesClose = document.getElementById('upgrades-close');
if (upgradesClose) upgradesClose.addEventListener('click', closeUpgradesModal);

const restartBtn = document.getElementById('restartBtn');
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        airplane.restart();
        for (const cp of checkpoints) {
            cp.mesh.material.color.copy(cp.originalColor);
        }
        // Refresh editor info so UI and input state update immediately
        codeEditor.setInfo(editorInfo);
                // reset flight time and score for new run
                if (window.gameState) {
                    window.gameState.flightTime = 0;
                    window.gameState.score = 0;
                }
                // reset fuel to capacity
                if (typeof airplane.fuelCapacity === 'number') airplane.fuel = airplane.fuelCapacity;
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
// const thirdPersonCamera = new ThirdPersonCamera(world.camera, rocket);
const thirdPersonCamera = new ThirdPersonCamera(world.camera, airplane);

// Resume audio on first user interaction (required by some browsers)
function resumeAudioOnGesture() {
    try {
        if (soundManager && soundManager.ctx && soundManager.ctx.state === 'suspended') {
            soundManager.ctx.resume();
        }
    } catch (e) {}
    window.removeEventListener('mousedown', resumeAudioOnGesture);
    window.removeEventListener('keydown', resumeAudioOnGesture);
}
window.addEventListener('mousedown', resumeAudioOnGesture);
window.addEventListener('keydown', resumeAudioOnGesture);


function animate() {
    const now = performance.now();
    requestAnimationFrame(animate);
    if (!animate._last) animate._last = now;
    const dt = (now - animate._last) / 1000; // seconds
    animate._last = now;

    // Update Logic
    // airplane.updateKeys(inputController.keys);
    airplane.updateTime();
    // rocket.updateKeys(inputController.keys);
    // rocket.updateTime();
    Obstacle.updateObstacles();

    // Update Waypoint collision status
    for (const cp of checkpoints) {
        cp.update(airplane.position);
    }

    // update HUD: bullets and targets
    try {
        const bulletsActive = airplane.bullets ? airplane.bullets.filter(b => b && b.active).length : 0;
        const hudBul = document.getElementById('hud-bullets-count');
        if (hudBul) hudBul.textContent = String(bulletsActive);

        const hudAmmo = document.getElementById('hud-ammo-count');
        if (hudAmmo && typeof airplane.ammo === 'number') hudAmmo.textContent = String(airplane.ammo);

        const targets = Object.values(Obstacle.obstacles || {}).filter(o => o && o.health != null && !o._destroyed).length;
        const hudT = document.getElementById('hud-targets-count');
        if (hudT) hudT.textContent = String(targets);
                // money and score HUD
                const hudMoney = document.getElementById('hud-money-count');
                if (hudMoney && window.gameState) hudMoney.textContent = String(window.gameState.money);
                // flight time based score: 1.01^time (time in seconds)
                if (window.gameState) {
                    const isAirborne = airplane.position.y > 1;
                    if (isAirborne) window.gameState.flightTime += dt;
                    window.gameState.score = Math.floor(Math.pow(1.2, window.gameState.flightTime));
                    const hudScore = document.getElementById('hud-score-count');
                    if (hudScore) hudScore.textContent = String(window.gameState.score);
                }
                // fuel HUD: update bar and numbers
                const fuelFill = document.getElementById('fuel-fill');
                const fuelNum = document.getElementById('fuel-count-num');
                const fuelCapNum = document.getElementById('fuel-capacity-num');
                if (fuelFill && typeof airplane.fuel === 'number' && typeof airplane.fuelCapacity === 'number') {
                    const pct = Math.max(0, Math.min(1, airplane.fuel / airplane.fuelCapacity));
                    fuelFill.style.width = (pct * 100) + '%';
                    if (fuelNum) fuelNum.textContent = String(Math.floor(airplane.fuel));
                    if (fuelCapNum) fuelCapNum.textContent = String(Math.floor(airplane.fuelCapacity));
                }
    } catch (e) {}

    // Environment Animation
    world.effectController.elevation += 0.02;
    world.updateSun();

        // Fuel consumption: consume fuel while throttle is applied
        try {
            if (typeof airplane.fuel === 'number' && typeof airplane.fuelCapacity === 'number') {
                const throttle = airplane.controls && airplane.controls.throttle ? airplane.controls.throttle : 0;
                const consumptionPerSecond = 6.0; // units per second at full throttle
                airplane.fuel = Math.max(0, airplane.fuel - consumptionPerSecond * throttle * dt);
            }
        } catch(e) {}

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