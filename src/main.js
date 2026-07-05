import * as THREE from 'three';
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
import { createCheckpointSystems } from './systems/checkpoints.js';
import { Item } from './Item.js';

// This creates a robust absolute URL pointing to your text asset

const initialCode = await loadTextFile('../scripts/4waypoints.txt');

async function loadTextFile(path) {
    const fileUrl = new URL(path, import.meta.url).href;
    try {
        const response = await fetch(fileUrl);
        
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
const airplane = new Airplane(world);

const item = new Item({
    position: new THREE.Vector3(20, 4, 30),
    radius: 12,
    color: 0x8a2be2,
    activeColor: 0xffd54f,
    onEnter: () => {
        if (airplane && typeof airplane.fuel === 'number' && typeof airplane.fuelCapacity === 'number') {
            airplane.fuel = airplane.fuelCapacity;
        }
    }
});
item.addToScene(world.scene);

const controls = new OrbitControls(world.camera, world.renderer.domElement);

// Checkpoint configuration: mixed reward points and flying stations
// Progressive altitude (200m spacing), sparse stations
const checkpointConfig = [
    {
        id: 'cp1',
        position: { x: 0, y: 100, z: 100 },
        hasStation: false,  // Pure reward checkpoint
        reward: { fuel: 25, money: 150 },
        radius: 6
    },
    {
        id: 'cp2',
        position: { x: 80, y: 300, z: 150 },
        hasStation: true,   // Full landing station
        reward: { fuel: 100, money: 50 },  // Refuel on safe landing + small bonus
        radius: 8
    },
    {
        id: 'cp3',
        position: { x: -60, y: 500, z: 220 },
        hasStation: false,  // Pure reward checkpoint
        reward: { fuel: 40, money: 100 },
        radius: 6
    },
    {
        id: 'cp4',
        position: { x: 100, y: 700, z: 300 },
        hasStation: true,   // Full landing station
        reward: { fuel: 100, money: 50 },  // Refuel on safe landing + small bonus
        radius: 8
    }
];

// Create waypoint objects from config
const checkpoints = checkpointConfig.map((config) => {
    const isStation = config.hasStation;
    
    const waypoint = new Waypoint(world, {
        ...(isStation ? {
            width: 48,        // Same as runway width (40 * 1.2)
            depth: 52,        // Middle third of runway length (40 * 1.3)
            height: 16,       // 1/3 of original height (~50/3)
            type: 'box'       // Use box geometry for landing areas
        } : {
            radius: config.radius,
            height: 50
        }),
        color: 'rgb(255, 0, 0)',
        opacity: 0.25,
        startHeight: 0
    });
    
    // For stations, position checkpoint at runway surface level (platformHeight = 5)
    // For regular checkpoints, position at the configured altitude
    if (isStation) {
        const runwayBaseHeight = config.position.y + 5; // checkpoint altitude + runway platform height
        waypoint.setPosition(config.position.x, runwayBaseHeight, config.position.z);
    } else {
        waypoint.setPosition(config.position.x, config.position.y, config.position.z);
    }
    
    waypoint.config = config;  // Store metadata
    return waypoint;
});
const checkpointState = { lastCheckpoint: null };

const checkpointSystems = createCheckpointSystems({
    world,
    checkpoints,
    airplane,
    showBanner: (message) => {
        if (checkpointBanner) {
            checkpointBanner.textContent = message;
            checkpointBanner.style.display = 'block';
            checkpointBanner.style.opacity = '1';
            if (checkpointBannerTimer) clearTimeout(checkpointBannerTimer);
            checkpointBannerTimer = window.setTimeout(() => {
                checkpointBanner.style.opacity = '0';
                window.setTimeout(() => {
                    checkpointBanner.style.display = 'none';
                }, 260);
            }, 2400);
        }
    }
});
checkpointSystems.build();

// Give airplane access to runway collision system
airplane.checkpointSystems = checkpointSystems;

const checkpointBanner = document.createElement('div');
checkpointBanner.id = 'checkpoint-banner';
checkpointBanner.textContent = 'Checkpoint Reached — Respawn Ready';
checkpointBanner.style.position = 'fixed';
checkpointBanner.style.top = '22px';
checkpointBanner.style.left = '50%';
checkpointBanner.style.transform = 'translateX(-50%)';
checkpointBanner.style.padding = '10px 16px';
checkpointBanner.style.borderRadius = '999px';
checkpointBanner.style.background = 'rgba(10, 20, 35, 0.9)';
checkpointBanner.style.color = '#fff';
checkpointBanner.style.border = '1px solid rgba(255, 255, 255, 0.2)';
checkpointBanner.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.35)';
checkpointBanner.style.fontSize = '14px';
checkpointBanner.style.fontWeight = '600';
checkpointBanner.style.zIndex = '1000';
checkpointBanner.style.pointerEvents = 'none';
checkpointBanner.style.opacity = '0';
checkpointBanner.style.transition = 'opacity 0.25s ease';
checkpointBanner.style.display = 'none';
document.body.appendChild(checkpointBanner);
let checkpointBannerTimer = null;

function respawnAtCheckpoint(targetCheckpoint = null) {
    checkpointSystems.respawnAtCheckpoint(targetCheckpoint);
}

// Game state: money, score, flight time
window.gameState = {
    money: 500,
    score: 0,
    flightTime: 0,
    addMoney(amount) { this.money = Math.max(0, Math.floor(this.money + (amount||0))); },
    addScore(v) { this.score = Math.max(0, Math.floor(this.score + (v||0))); }
};

Obstacle.initObstacles(world.scene);

// --- 2. Instantiate CodeEditor ---
const codeEditor = new CodeEditor(airplane, initialCode);

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

const helpBtnViewport = document.getElementById('help-btn-viewport');
const helpModal = document.getElementById('help-modal');
const helpBackdrop = document.getElementById('help-backdrop');
const helpClose = document.getElementById('help-close');
const helpContent = document.getElementById('help-content');

function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function parseMarkdownToHtml(markdown) {
    const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
    const htmlParts = [];
    let paragraphLines = [];
    let listItems = [];

    const flushParagraph = () => {
        if (paragraphLines.length) {
            htmlParts.push(`<p>${paragraphLines.join(' ')}</p>`);
            paragraphLines = [];
        }
    };

    const flushList = () => {
        if (listItems.length) {
            htmlParts.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`);
            listItems = [];
        }
    };

    lines.forEach((line) => {
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph();
            flushList();
            return;
        }

        const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
        if (headingMatch) {
            flushParagraph();
            flushList();
            const level = Math.min(headingMatch[1].length, 3);
            htmlParts.push(`<h${level}>${escapeHtml(headingMatch[2].trim())}</h${level}>`);
            return;
        }

        if (trimmed.startsWith('- ')) {
            flushParagraph();
            listItems.push(escapeHtml(trimmed.slice(2).trim()));
            return;
        }

        flushList();
        paragraphLines.push(escapeHtml(trimmed));
    });

    flushParagraph();
    flushList();
    return htmlParts.join('');
}

function openHelpModal() {
    if (!helpModal || !helpContent) return;
    helpModal.setAttribute('aria-hidden', 'false');
    fetch('./help.md')
        .then((response) => {
            if (!response.ok) throw new Error('Help file not found');
            return response.text();
        })
        .then((text) => {
            if (!helpContent) return;
            helpContent.innerHTML = parseMarkdownToHtml(text);
        })
        .catch(() => {
            if (helpContent) helpContent.textContent = 'Help content could not be loaded.';
        });
}

function closeHelpModal() {
    if (helpModal) helpModal.setAttribute('aria-hidden', 'true');
}

if (helpBtnViewport) helpBtnViewport.addEventListener('click', openHelpModal);
if (helpBackdrop) helpBackdrop.addEventListener('click', closeHelpModal);
if (helpClose) helpClose.addEventListener('click', closeHelpModal);

const restartBtn = document.getElementById('restartBtn');
if (restartBtn) {
    restartBtn.addEventListener('click', () => {
        respawnAtCheckpoint(checkpointState.lastCheckpoint);
        // reset flight time and score for new run
        if (window.gameState) {
            window.gameState.flightTime = 0;
            window.gameState.score = 0;
        }
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

// const airplane2 = new Airplane(world);
// airplane2.setPosition(10, 0, 10);
// const code2 = await loadTextFile('../scripts/figure8.txt');
// // run code2 on airplane2
// setTimeout(() => {
//     airplane2.codeRunner.run(code2);
// }, 1000); // Delay to ensure airplane2 is initialized before running code

function animate() {
    item.update(airplane.position);
    const now = performance.now();
    requestAnimationFrame(animate);
    if (!animate._last) animate._last = now;
    const dt = (now - animate._last) / 1000; // seconds
    animate._last = now;

    // Update Logic
    airplane.updateKeys(inputController.keys);
    airplane.updateTime();
    // airplane2.updateTime();
    // rocket.updateKeys(inputController.keys);
    // rocket.updateTime();
    Obstacle.updateObstacles();

    // Update waypoint collision status and remember the latest checkpoint reached.
    checkpointSystems.update(airplane.position, checkpointState);

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

    if (airplane.isCrashed && !airplane._respawnQueued) {
        airplane._respawnQueued = true;
        window.setTimeout(() => {
            if (airplane && airplane.isCrashed) {
                respawnAtCheckpoint(checkpointState.lastCheckpoint);
            }
            airplane._respawnQueued = false;
        }, 1200);
    }

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