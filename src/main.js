import * as THREE from 'three';
import { World } from './World.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { Airplane } from './Airplane.js';
import { CodeEditor } from './CodeEditor.js';
import * as Obstacle from './obstacle.js';
import { soundManager } from './sound.js';
import Upgrades from './upgrades.js';
import { UPGRADE_DEFINITIONS } from './upgradesData.js';
import { Rocket } from './Rocket.js';
import { Drone } from './Drone.js';
import { InputController } from './InputController.js';
import { Camera } from './Camera.js';

import { Levels } from './Levels.js';


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
const rocket = new Rocket(world);
const drone = new Drone(world);
let myAircraft = airplane;
let activeGameMode = 'plane';
const aircraftByMode = { plane: airplane, quadcopter: drone, rocket };

const controls = new OrbitControls(world.camera, world.renderer.domElement);
// ThirdPersonCamera owns wheel zoom so its configured follow distance persists.
controls.enableZoom = false;

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

const levelsModal = document.getElementById('levels-modal');
const levelsGrid = document.getElementById('levels-grid');
const levelsBackdrop = document.getElementById('levels-backdrop');
const levelsClose = document.getElementById('levels-close');
const openLevelsButton = document.getElementById('open-levels-btn');
const levelCompleteModal = document.getElementById('level-complete-modal');
const levelCompleteMessage = document.getElementById('level-complete-message');
const nextLevelButton = document.getElementById('next-level-btn');
let levelCompleteTimer = null;

function suspendFlightControls() {
    inputController.keys.clear();
    myAircraft.resetControls?.();
}

function isPopupOpen() {
    return Boolean(document.querySelector('.modal[aria-hidden="false"]'));
}

function showLevelComplete({ level, nextLevel }) {
    if (levelCompleteTimer) clearTimeout(levelCompleteTimer);
    levelCompleteTimer = window.setTimeout(() => {
        levelCompleteTimer = null;
        levelCompleteMessage.textContent = nextLevel
            ? `Congratulations! You completed ${level.name}. You can now choose your next level.`
            : `Congratulations! You completed ${level.name} and every available level.`;
        nextLevelButton.textContent = nextLevel ? 'Choose Next Level' : 'View Levels';
        levelCompleteModal.setAttribute('aria-hidden', 'false');
        suspendFlightControls();
        nextLevelButton.focus();
    }, 1500);
}

function renderLevelsGrid() {
    levelsGrid.replaceChildren();
    levels.getLevelSummaries().forEach((level) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'level-card';
        card.classList.toggle('completed', level.completed);
        card.classList.toggle('current', level.current);
        card.disabled = !level.unlocked;

        const status = !level.unlocked ? 'Locked' : level.completed ? 'Completed ✓' : level.current ? 'Current Level' : 'Unlocked';
        card.innerHTML = `
            <span class="level-card-number">Level ${level.id}</span>
            <span class="level-card-name"></span>
            <span class="level-card-objective"></span>
            <span class="level-card-status">${status}</span>`;
        card.querySelector('.level-card-name').textContent = level.name;
        card.querySelector('.level-card-objective').textContent = level.objective;
        card.addEventListener('click', () => {
            selectLevel(level.id);
            levelsModal.setAttribute('aria-hidden', 'true');
        });
        levelsGrid.appendChild(card);
    });
}

function openLevelsModal() {
    renderLevelsGrid();
    levelsModal.setAttribute('aria-hidden', 'false');
    suspendFlightControls();
}

function closeLevelsModal() {
    levelsModal.setAttribute('aria-hidden', 'true');
}

const levels = new Levels({
    world,
    airplane,
    onLevelComplete: showLevelComplete,
    showBanner: (message) => {
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
    },
});
levels.loadLevel(1);

nextLevelButton?.addEventListener('click', () => {
    levelCompleteModal.setAttribute('aria-hidden', 'true');
    openLevelsModal();
});
openLevelsButton?.addEventListener('click', openLevelsModal);
levelsBackdrop?.addEventListener('click', closeLevelsModal);
levelsClose?.addEventListener('click', closeLevelsModal);
window.levels = levels;

function respawnAtCheckpoint(targetCheckpoint = null) {
    levels.checkpointSystems?.respawnAtCheckpoint(targetCheckpoint);
}

// Game state: money, score, flight time
window.gameState = {
    level: levels.currentLevelNumber,
    objective: levels.getObjective(),
    money: 500,
    score: 0,
    flightTime: 0,
    addMoney(amount) { this.money = Math.max(0, Math.floor(this.money + (amount||0))); },
    addScore(v) { this.score = Math.max(0, Math.floor(this.score + (v||0))); }
};

// --- 2. Instantiate CodeEditor ---
const codeEditor = new CodeEditor(myAircraft, initialCode);

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
        levels.resetCurrentLevel();
        if (window.gameState) {
            window.gameState.flightTime = 0;
            window.gameState.score = 0;
        }
    });
}

const mainMenuBtn = document.getElementById('main-menu-btn');
const mainMenu = document.getElementById('main-menu');
const gameModeOptions = mainMenu ? [...mainMenu.querySelectorAll('[data-game-mode]')] : [];
const demoCodesBtn = document.getElementById('demo-codes-btn');
const demoCodesMenu = document.getElementById('demo-codes-menu');
const demoCodesBack = document.getElementById('demo-codes-back');
const demoCodesList = document.getElementById('demo-codes-list');

function closeGameMenus() {
    if (mainMenu) mainMenu.hidden = true;
    if (demoCodesMenu) demoCodesMenu.hidden = true;
    if (mainMenuBtn) mainMenuBtn.setAttribute('aria-expanded', 'false');
    if (demoCodesBtn) demoCodesBtn.setAttribute('aria-expanded', 'false');
}

async function loadDemoCode(filename) {
    if (!filename.endsWith('.txt') || filename.includes('/') || filename.includes('\\')) return;
    const response = await fetch(`./scripts/${encodeURIComponent(filename)}`);
    if (!response.ok) throw new Error(`Could not load ${filename}`);
    codeEditor.editor.value = await response.text();
    codeEditor.editor.dispatchEvent(new Event('input', { bubbles: true }));
    codeEditor.editor.focus();
}

async function buildDemoCodesMenu() {
    if (!demoCodesList) return;
    try {
        const response = await fetch('./scripts/manifest.json');
        if (!response.ok) throw new Error('Demo code list could not be loaded');
        const filenames = await response.json();
        filenames.filter((name) => typeof name === 'string' && name.endsWith('.txt')).forEach((filename) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.role = 'menuitem';
            option.textContent = filename.replace(/\.txt$/i, '');
            option.title = filename;
            option.addEventListener('click', async () => {
                try {
                    await loadDemoCode(filename);
                    closeGameMenus();
                } catch (error) {
                    console.error(error);
                }
            });
            demoCodesList.appendChild(option);
        });
    } catch (error) {
        const message = document.createElement('div');
        message.className = 'menu-load-error';
        message.textContent = 'Demo codes unavailable';
        demoCodesList.appendChild(message);
        console.error(error);
    }
}

buildDemoCodesMenu();

function syncAircraftVisibility() {
    Object.entries(aircraftByMode).forEach(([mode, aircraft]) => {
        if (aircraft.model) aircraft.model.visible = mode === activeGameMode;
    });
}

function selectGameMode(mode) {
    const nextAircraft = aircraftByMode[mode];
    if (!nextAircraft) return;

    myAircraft = nextAircraft;
    activeGameMode = mode;
    myAircraft.restart();
    camera.body = myAircraft;
    if (codeEditor.runner !== myAircraft.codeRunner) {
        codeEditor.runner.stop();
        const editorCallbacks = codeEditor.runner.callbacks;
        codeEditor.actor = myAircraft;
        codeEditor.runner = myAircraft.codeRunner;
        codeEditor.runner.callbacks = editorCallbacks;
    }

    gameModeOptions.forEach((option) => {
        const selected = option.dataset.gameMode === mode;
        option.classList.toggle('active', selected);
        option.setAttribute('aria-checked', String(selected));
    });
    if (mainMenuBtn) mainMenuBtn.setAttribute('aria-expanded', 'false');
    if (mainMenu) mainMenu.hidden = true;
    syncAircraftVisibility();

    if (window.gameState) {
        window.gameState.flightTime = 0;
        window.gameState.score = 0;
    }
}

function selectLevel(levelNumber) {
    try {
        if (!levels.isLevelUnlocked(levelNumber)) return;
        if (levelCompleteTimer) {
            clearTimeout(levelCompleteTimer);
            levelCompleteTimer = null;
        }
        levelCompleteModal.setAttribute('aria-hidden', 'true');
        levels.loadLevel(Number(levelNumber));
        closeGameMenus();
        closeLevelsModal();
        if (window.gameState) {
            window.gameState.flightTime = 0;
            window.gameState.score = 0;
        }
    } catch (error) {
        console.error(error);
    }
}

if (mainMenuBtn && mainMenu) {
    mainMenuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const opening = mainMenu.hidden;
        closeGameMenus();
        mainMenu.hidden = !opening;
        mainMenuBtn.setAttribute('aria-expanded', String(opening));
    });
    demoCodesBtn?.addEventListener('click', () => {
        mainMenu.hidden = true;
        demoCodesMenu.hidden = false;
        demoCodesBtn.setAttribute('aria-expanded', 'true');
    });
    demoCodesBack?.addEventListener('click', () => {
        demoCodesMenu.hidden = true;
        mainMenu.hidden = false;
        demoCodesBtn.setAttribute('aria-expanded', 'false');
    });
    gameModeOptions.forEach((option) => {
        option.addEventListener('click', () => selectGameMode(option.dataset.gameMode));
    });
    [openLevelsButton, openUpgradesBtnViewport, helpBtnViewport].forEach((option) => {
        option?.addEventListener('click', () => {
            mainMenu.hidden = true;
            mainMenuBtn.setAttribute('aria-expanded', 'false');
        });
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.main-menu-control')) {
            closeGameMenus();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeGameMenus();
    });
}

const splitter = document.getElementById('splitter');
const rightPanel = document.getElementById('right-panel');
let isResizing = false;
const MIN_RIGHT_PANEL_WIDTH = 0;
const MIN_VIEWPORT_WIDTH = 0;

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

        world.resize();
    });

    window.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';

        world.resize();
    });
}





const inputController = new InputController(world.canvas);
const camera = new Camera(world.camera, myAircraft, inputController, controls);
world.canvas.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'c' && !event.repeat) {
        camera.toggleMode();
    }
});
selectGameMode('plane');


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


const domHUD = {
    levelNumber: document.getElementById('hud-level-number'),
    levelName: document.getElementById('hud-level-name'),
    objectiveText: document.getElementById('hud-objective-text'),
    objectiveProgress: document.getElementById('hud-objective-progress'),
    nextStripInfo: document.getElementById('hud-next-strip-info'),
    bulletsCount: document.getElementById('hud-bullets-count'),
    ammoCount: document.getElementById('hud-ammo-count'),
    targetsCount: document.getElementById('hud-targets-count'),
    moneyCount: document.getElementById('hud-money-count'),
    scoreCount: document.getElementById('hud-score-count'),
    fuelFill: document.getElementById('fuel-fill'),
    fuelNum: document.getElementById('fuel-count-num'),
    fuelCapNum: document.getElementById('fuel-capacity-num')
};

let hudFrameCounter = 0;
let lastShadowAltitudeRange = -1;

function getNextLandingStrip() {
    const stations = levels.checkpointSystems?.checkpoints ?? [];
    if (stations.length === 0) return null;

    const lastId = levels.checkpointState.lastCheckpoint?.config?.id;
    const currentIndex = stations.findIndex(cp => cp.config.id === lastId);
    if (currentIndex >= 0 && currentIndex < stations.length - 1) {
        return stations[currentIndex + 1];
    }

    return stations.reduce((closest, cp) => {
        const dist = cp.position.distanceTo(airplane.position);
        const bestDist = closest ? closest.position.distanceTo(airplane.position) : Infinity;
        return dist < bestDist ? cp : closest;
    }, null);
}

function updateLandingStripHUD() {
    if (!domHUD.nextStripInfo) return;

    const nextStrip = getNextLandingStrip();
    if (!nextStrip) {
        domHUD.nextStripInfo.textContent = 'No landing strip';
        return;
    }

    const dx = nextStrip.position.x - airplane.position.x;
    const dz = nextStrip.position.z - airplane.position.z;
    const dy = nextStrip.position.y - airplane.position.y;
    const distance = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));

    domHUD.nextStripInfo.textContent = `${distance}m`;
}

const attitudeCanvas = document.getElementById('attitude-canvas');
const attitudeAltitudeValue = document.getElementById('attitude-altitude');
const attitudeAirspeedValue = document.getElementById('attitude-airspeed');
const attitudeContext = attitudeCanvas?.getContext('2d');

function drawAttitudeIndicator(aircraft) {
    if (!attitudeCanvas || !attitudeContext || !aircraft?.model) return;

    const rect = attitudeCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(rect.width * dpr);
    const pixelHeight = Math.round(rect.height * dpr);
    if (attitudeCanvas.width !== pixelWidth || attitudeCanvas.height !== pixelHeight) {
        attitudeCanvas.width = pixelWidth;
        attitudeCanvas.height = pixelHeight;
    }

    const ctx = attitudeContext;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2 + 4;
    const radius = Math.min(width * 0.43, height * 0.47);
    const pitch = THREE.MathUtils.clamp(-aircraft.rotation.x, -Math.PI / 2, Math.PI / 2);
    const roll = THREE.MathUtils.euclideanModulo(aircraft.rotation.z + Math.PI, Math.PI * 2) - Math.PI;
    const pitchPixels = pitch * 68;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(centerX, centerY);
    ctx.rotate(-roll);

    ctx.fillStyle = '#3b94d1';
    ctx.fillRect(-radius * 3, -radius * 3, radius * 6, radius * 3 + pitchPixels);
    const groundGradient = ctx.createLinearGradient(0, pitchPixels, 0, radius * 2);
    groundGradient.addColorStop(0, '#9a6335');
    groundGradient.addColorStop(1, '#4f321f');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(-radius * 3, pitchPixels, radius * 6, radius * 3);

    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.2;
    ctx.font = '600 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let degrees = -30; degrees <= 30; degrees += 5) {
        const y = pitchPixels - degrees * 2.15;
        const major = degrees % 10 === 0;
        const halfWidth = major ? 23 : 12;
        ctx.beginPath();
        ctx.moveTo(-halfWidth, y);
        ctx.lineTo(halfWidth, y);
        ctx.stroke();
        if (major && degrees !== 0) {
            ctx.fillText(String(Math.abs(degrees)), -halfWidth - 10, y);
            ctx.fillText(String(Math.abs(degrees)), halfWidth + 10, y);
        }
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius * 1.5, pitchPixels);
    ctx.lineTo(radius * 1.5, pitchPixels);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.strokeStyle = 'rgba(231,242,250,0.72)';
    ctx.lineWidth = 1.2;
    [-60, -30, 0, 30, 60].forEach((degrees) => {
        const angle = THREE.MathUtils.degToRad(degrees - 90);
        const inner = radius + (degrees === 0 ? 3 : 6);
        const outer = radius + 11;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
    });

    // Fixed aircraft reference symbol.
    ctx.strokeStyle = '#ffd95a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-38, 0);
    ctx.lineTo(-12, 0);
    ctx.lineTo(-6, 6);
    ctx.moveTo(38, 0);
    ctx.lineTo(12, 0);
    ctx.lineTo(6, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd95a';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(210,230,244,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    if (attitudeAltitudeValue) attitudeAltitudeValue.textContent = `${Math.floor(Math.max(aircraft.position.y, 0))} m`;
    if (attitudeAirspeedValue) attitudeAirspeedValue.textContent = `${Math.ceil(aircraft.velocity.length() * 60)} m/s`;
}

// Physics was originally tuned around 60 updates per second. Keep that exact
// simulation rate, while allowing rendering to run at any rate, by consuming
// real elapsed time in fixed-size steps. This also makes the nonlinear drag
// and collision calculations deterministic across machines.
const SIMULATION_STEP = 1 / 60;
const MAX_FRAME_DELTA = 0.25;
const SCORE_PER_AIRBORNE_SECOND = 1;
let hudElapsed = 0;

function animate(now = performance.now()) {
    syncAircraftVisibility();
    requestAnimationFrame(animate);
    if (animate._last === undefined) animate._last = now;
    let dt = Math.min(MAX_FRAME_DELTA, Math.max(0, (now - animate._last) / 1000));
    animate._last = now;
    hudElapsed += dt;

    // Read input once per rendered frame, then advance as many deterministic
    // physics steps as the elapsed wall-clock time requires.
    if (isPopupOpen()) {
        suspendFlightControls();
    } else {
        myAircraft.updateKeys(inputController.keys);
    }
    myAircraft.updateTime(dt);
    if (activeGameMode === 'plane') {
        levels.updateLevelActors(dt);
        levels.updateEventSources(airplane.position, dt);
    }
    Obstacle.updateObstacles(now, dt);

    if (window.gameState) {
        const isAirborne = myAircraft.isAirborne();
        if (isAirborne) window.gameState.flightTime += dt;
        // Score measures sustained flight and grows predictably: one point for
        // each completed second in the air.
        window.gameState.score = Math.floor(
            window.gameState.flightTime * SCORE_PER_AIRBORNE_SECOND
        );
    }

    // Update the HUD by elapsed time, not by an assumed number of frames.
    if (hudElapsed >= 0.1) {
        hudElapsed %= 0.1;
        try {
            const bulletsActive = myAircraft.bullets ? myAircraft.bullets.filter(b => b && b.active).length : 0;
            if (domHUD.bulletsCount) domHUD.bulletsCount.textContent = String(bulletsActive);

            if (domHUD.ammoCount) {
                domHUD.ammoCount.textContent = typeof myAircraft.ammo === 'number' ? String(myAircraft.ammo) : '0';
            }

            const targets = Object.values(Obstacle.obstacles || {}).filter(o => o && o.health != null && !o._destroyed).length;
            if (domHUD.targetsCount) domHUD.targetsCount.textContent = String(targets);
            
            if (domHUD.moneyCount && window.gameState) {
                domHUD.moneyCount.textContent = String(window.gameState.money);
            }
            
            if (window.gameState) {
                if (domHUD.scoreCount) domHUD.scoreCount.textContent = String(window.gameState.score);
            }

            const activeLevel = levels.currentLevel;
            const objective = levels.getObjective();
            if (domHUD.levelNumber) domHUD.levelNumber.textContent = String(levels.currentLevelNumber ?? '-');
            if (domHUD.levelName) domHUD.levelName.textContent = activeLevel?.name ?? 'Unavailable';
            if (domHUD.objectiveText) domHUD.objectiveText.textContent = objective?.description ?? 'None';
            if (domHUD.objectiveProgress) {
                domHUD.objectiveProgress.textContent = objective
                    ? `${objective.progress}/${objective.required}`
                    : '0/0';
            }
            
            if (typeof myAircraft.fuel === 'number' && typeof myAircraft.fuelCapacity === 'number') {
                const pct = Math.max(0, Math.min(1, myAircraft.fuel / myAircraft.fuelCapacity));
                if (domHUD.fuelFill) domHUD.fuelFill.style.width = (pct * 100) + '%';
                if (domHUD.fuelNum) domHUD.fuelNum.textContent = String(Math.floor(myAircraft.fuel));
                if (domHUD.fuelCapNum) domHUD.fuelCapNum.textContent = String(Math.floor(myAircraft.fuelCapacity));
            }

            updateLandingStripHUD();
        } catch (e) {}
    }

    // Handle Crash & Respawn
    if (myAircraft.isCrashed && !myAircraft._respawnQueued) {
        const crashedAircraft = myAircraft;
        crashedAircraft._respawnQueued = true;
        window.setTimeout(() => {
            if (crashedAircraft.isCrashed) {
                if (crashedAircraft === airplane) respawnAtCheckpoint(levels.checkpointState.lastCheckpoint);
                else crashedAircraft.restart();
            }
            crashedAircraft._respawnQueued = false;
        }, 1200);
    }

    // Environment Animation
    world.effectController.elevation += 1.2 * dt;
    world.updateSun();

    // Keep this map tight around the aircraft for a crisp plane shadow.
    const altitude = Math.max(myAircraft.position.y, 0);
    const currentAltitudeRange = altitude

    if (currentAltitudeRange !== lastShadowAltitudeRange) {
        const dynamicSize = 2 + (currentAltitudeRange * 4);
        world.directionalLight.shadow.camera.left = -dynamicSize;
        world.directionalLight.shadow.camera.right = dynamicSize;
        world.directionalLight.shadow.camera.top = dynamicSize;
        world.directionalLight.shadow.camera.bottom = -dynamicSize;
        world.directionalLight.shadow.camera.updateProjectionMatrix();
        lastShadowAltitudeRange = currentAltitudeRange;
    }

    // Light follows airplane
    world.directionalLight.position.copy(myAircraft.position).addScaledVector(world.sun, 50);
    world.directionalLight.target.position.copy(myAircraft.position);

    camera.update(dt);
    drawAttitudeIndicator(myAircraft);
    // Render
    world.render();
}

animate();
