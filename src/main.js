import * as THREE from 'three';
import { World } from './World.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { Airplane } from './Airplane.js';
import Bullet from './bullet.js';
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
const levelCompleteStars = document.getElementById('level-complete-stars');
const levelCompleteHint = document.getElementById('level-complete-hint');
const retryLevelButton = document.getElementById('retry-level-btn');
let levelCompleteTimer = null;

function suspendFlightControls() {
    inputController.keys.clear();
    myAircraft.resetControls?.();
}

function isPopupOpen() {
    return Boolean(document.querySelector('.modal[aria-hidden="false"]'));
}

function focusFlightCanvas() {
    if (isPopupOpen()) return;
    world.canvas.focus({ preventScroll: true });
}

function focusFlightCanvasAfterUIUpdate() {
    window.requestAnimationFrame(focusFlightCanvas);
}

// Manual levels have a single star, all others two (see Levels.js)
function starsMarkup(count, maxStars) {
    return Array.from({ length: maxStars }, (_, i) =>
        `<span class="star${i < count ? ' earned' : ''}">★</span>`).join('');
}

function showLevelComplete({ level, nextLevel, stars }) {
    if (levelCompleteTimer) clearTimeout(levelCompleteTimer);
    levelCompleteTimer = window.setTimeout(() => {
        levelCompleteTimer = null;
        levelCompleteStars.innerHTML = starsMarkup(stars, level.maxStars);
        levelCompleteHint.textContent = level.manual
            ? 'Manual level: flying it yourself earns the star.'
            : stars < level.maxStars
                ? 'Second star: finish the level with a single code run and no keyboard input.'
                : 'Perfect! You finished it with code alone.';
        levelCompleteMessage.textContent = nextLevel
            ? `Congratulations! You completed ${level.name}. You can now choose your next level.`
            : `Congratulations! You completed ${level.name} and every available level.`;
        nextLevelButton.textContent = nextLevel ? 'Choose Next Level' : 'View Levels';
        levelCompleteModal.setAttribute('aria-hidden', 'false');
        suspendFlightControls();
        nextLevelButton.focus();
    }, 1000);
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

        // Only locked and current levels get a label; stars show completion
        const status = !level.unlocked ? '🔒 Locked' : level.current ? '● Current' : '';
        card.innerHTML = `
            <span class="level-card-top">
                <span class="level-card-number">${level.id}</span>
                ${status ? `<span class="level-card-status">${status}</span>` : ''}
            </span>
            <span class="level-card-name"></span>
            <span class="level-card-objective"></span>
            <span class="level-card-bottom">
                <span class="level-card-stars" title="${level.stars}/${level.maxStars} stars">${starsMarkup(level.stars, level.maxStars)}</span>
                ${level.manual ? '<span class="level-card-tag" title="Fly it yourself, no code needed">Manual</span>' : ''}
            </span>`;
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
    focusFlightCanvasAfterUIUpdate();
}

const levels = new Levels({
    world,
    airplane,
    onLevelComplete: showLevelComplete,
    onObjectiveProgress: () => {
        try { soundManager.playObjective(); } catch (e) {}
    },
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
levels.loadLevel(levels.getStartLevelNumber());

nextLevelButton?.addEventListener('click', () => {
    levelCompleteModal.setAttribute('aria-hidden', 'true');
    openLevelsModal();
});
retryLevelButton?.addEventListener('click', () => {
    levelCompleteModal.setAttribute('aria-hidden', 'true');
    restartCurrentLevel();
    // Now that a star is earned, this opens the code panel for the code attempt
    applyCodePanelDefault();
});
openLevelsButton?.addEventListener('click', openLevelsModal);
levelsBackdrop?.addEventListener('click', closeLevelsModal);
levelsClose?.addEventListener('click', closeLevelsModal);
window.levels = levels;

function restartCurrentLevel() {
    levels.resetCurrentLevel();
    // Once a level has a star, every retry is a chance at the code star
    if (shouldOpenCodePanel()) setCodePanelOpen(true);
    // The level only resets the plane; reset the rocket/quadcopter too
    if (myAircraft !== airplane) myAircraft.restart();
    if (window.gameState) {
        window.gameState.flightTime = 0;
        window.gameState.score = 0;
    }
    focusFlightCanvasAfterUIUpdate();
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
airplane.codeRunner.getWorldInfo = () => levels.getInfo();
const codeEditor = new CodeEditor(myAircraft);
// Each level remembers its own code
const levelCodeSlot = (levelNumber) => `level-${levelNumber}`;
codeEditor.useCodeSlot(levelCodeSlot(levels.currentLevelNumber));

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
    restartBtn.addEventListener('click', restartCurrentLevel);
}

// TEMP debug: step to the previous/next level (wraps around at both ends).
// Remove together with the .debug-level-btn buttons in index.html.
function debugStepLevel(step) {
    const ids = levels.levels.map((level) => level.id);
    const index = ids.indexOf(levels.currentLevelNumber);
    selectLevel(ids[(index + step + ids.length) % ids.length]);
}
document.getElementById('debug-back-btn')?.addEventListener('click', (event) => {
    event.currentTarget.blur();
    debugStepLevel(-1);
});
document.getElementById('debug-skip-btn')?.addEventListener('click', (event) => {
    event.currentTarget.blur();
    debugStepLevel(1);
});

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
        // Keep an open API panel in sync with the new aircraft
        if (!codeEditor.apiPanel.hidden) codeEditor.renderApiPanel();
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
        codeEditor.useCodeSlot(levelCodeSlot(levels.currentLevelNumber));
        applyCodePanelDefault();
        closeGameMenus();
        closeLevelsModal();
        if (window.gameState) {
            window.gameState.flightTime = 0;
            window.gameState.score = 0;
        }
        focusFlightCanvasAfterUIUpdate();
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
        syncCodePanelState();

        world.resize();
    });
}

// --- Code panel open/close ---
// Levels start with the code panel closed until their first star is earned,
// so new players focus on flying first. The splitter can still drag it open.
const DEFAULT_RIGHT_PANEL_WIDTH = 500;
let lastRightPanelWidth = DEFAULT_RIGHT_PANEL_WIDTH;

function isCodePanelOpen() {
    // clientWidth excludes the border, so a collapsed panel reads 0
    return rightPanel.clientWidth > 0;
}

function syncCodePanelState() {
    const open = isCodePanelOpen();
    rightPanel.classList.toggle('collapsed', !open);
}

function setCodePanelOpen(open) {
    if (open === isCodePanelOpen()) return syncCodePanelState();
    if (!open) lastRightPanelWidth = rightPanel.clientWidth || lastRightPanelWidth;
    rightPanel.style.width = open ? `${lastRightPanelWidth}px` : '0px';
    syncCodePanelState();
    world.resize();
}

// Open once the level has a star (time for the code star). Manual levels
// never need code, so they keep it closed.
function shouldOpenCodePanel() {
    if (levels.currentLevel?.manual) return false;
    return (levels.levelStars.get(levels.currentLevelNumber) ?? 0) > 0;
}

function applyCodePanelDefault() {
    setCodePanelOpen(shouldOpenCodePanel());
}

applyCodePanelDefault();





const inputController = new InputController(world.canvas);
const camera = new Camera(world.camera, myAircraft, inputController, controls);

// Any flight key breaks the "code only" run needed for the second star.
// Camera toggle (c) and bare modifier keys don't count.
const NON_FLIGHT_KEYS = new Set(['c', 'shift', 'control', 'alt', 'meta']);
world.canvas.addEventListener('keydown', (event) => {
    if (!NON_FLIGHT_KEYS.has(event.key.toLowerCase())) levels.recordKeyboardInput();
});
// Runs after CodeEditor's own handler, so `running` reflects the new state
codeEditor.runBtn.addEventListener('click', () => {
    if (codeEditor.runner.running) levels.recordCodeRun();
});
world.canvas.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'c' && !event.repeat) {
        camera.toggleMode();
    }
});
selectGameMode('plane');
focusFlightCanvasAfterUIUpdate();


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
    levelProgressFill: document.getElementById('level-progress-fill'),
    ammo: document.getElementById('hud-ammo'),
    ammoCount: document.getElementById('hud-ammo-count'),
    timeCount: document.getElementById('hud-time-count'),
    fuelFill: document.getElementById('fuel-fill'),
    fuelNum: document.getElementById('fuel-count-num'),
    fuelCapNum: document.getElementById('fuel-capacity-num')
};

// --- Interactive level tutorials ---
// Levels that introduce a new concept get a lesson. Before the first star it
// teaches the keyboard; after that it teaches the same move with code (second
// star). The card reacts to what the player does.
const tutorialCard = document.getElementById('tutorial-card');
let tutorialKey = null;

// Per-level lessons: 'keys-start', 'keys-flying' and 'code-start' (with the
// code that "Insert code" puts in the editor)
const LEVEL_LESSONS = {
    1: {
        'keys-start': {
            title: 'Your first flight',
            body: `Hold <kbd>Space</kbd> to give the engine power and roll forward.<br>
                   Fly through the <span class="tut-blue">blue ring</span> ahead to pass the level.`,
        },
        'keys-flying': {
            title: 'Nice, keep going!',
            body: `Keep holding <kbd>Space</kbd> until you pass through the <span class="tut-blue">blue ring</span>.`,
        },
        'code-start': {
            title: 'Second star: fly with code',
            code: 'setThrottle(1)',
            body: (code) => `This time, let your code fly the plane, with no keyboard at all.<br>
                   <code>setThrottle(value)</code> sets the engine power.
                   The value ranges from <code>0</code> (engine off) to <code>1</code> (full power):
                   <pre>${code}</pre>
                   Write this in the code editor (or insert it), then press <kbd>▶</kbd> Run <b>once</b>.`,
        },
    },
    3: {
        'keys-start': {
            title: 'New: turning',
            body: `The <span class="tut-blue">blue ring</span> is off to the <b>left</b> this time,
                   so flying straight will miss it.<br>
                   Hold <kbd>Space</kbd> to roll, and hold <kbd>A</kbd> to steer left
                   (<kbd>D</kbd> steers right). Let go once you're lined up with the ring.`,
        },
        'keys-flying': {
            title: 'Steer into the ring',
            body: `Hold <kbd>A</kbd> to turn left toward the <span class="tut-blue">blue ring</span>,
                   then let go and roll straight through it.`,
        },
        'code-start': {
            title: 'Second star: turn with code',
            // Deliberately turns the wrong way (right) so the player has to fix the sign
            code: 'setThrottle(1)\nsetSteeringWheel(16)',
            body: (code) => `<code>setSteeringWheel(degrees)</code> turns the nose wheel, from
                   <code>-16</code> to <code>16</code>. <b>Negative turns left</b>, positive turns right:
                   <pre>${code}</pre>
                   Run it <b>once</b>. If you miss, press <b>Restart</b> and change the angle
                   until you hit the ring.`,
        },
    },
    // Keyboard flying needs no help here; only the code star is a new idea
    5: {
        'code-start': {
            title: 'Second star: wait, then turn',
            code: 'setThrottle(1)\nawait sleep(1000)\nsetSteeringWheel(-16)',
            body: (code) => `Go straight through the first ring, then turn left all the way
                   around to come back through the second. If your code steers right away,
                   it misses the first ring, so it has to <b>wait</b> before turning.<br>
                   <code>await sleep(ms)</code> pauses your code before the next line runs.
                   <code>ms</code> is in milliseconds, so <code>1000</code> is one second:
                   <pre>${code}</pre>
                   Run it <b>once</b>. Too early or too late? Press <b>Restart</b> and change the
                   sleep time until you pass both rings.`,
        },
    },
};

// Steps that read the same on every level
const SHARED_TUTORIAL_STEPS = {
    'code-running': {
        title: 'Your code is flying!',
        body: `Hands off the keyboard and watch it reach the <span class="tut-blue">blue ring</span>.`,
    },
    'code-stopped': {
        title: 'The code stopped too early',
        body: `It stopped before reaching the ring. Check your code, press
               <b>Restart</b>, then Run it once.`,
    },
    'code-keyboard': {
        title: 'Keyboard used',
        body: `Pressing keys means this try only earns ★. Press <b>Restart</b> and
               let the code do all the flying.`,
    },
};

function getTutorialStep() {
    if (!LEVEL_LESSONS[levels.currentLevelNumber] || activeGameMode !== 'plane' || isPopupOpen()) return null;
    if (levels.currentLevel?.completed) return null;
    const bestStars = levels.levelStars.get(levels.currentLevelNumber) ?? 0;
    // Manual levels have no code star to teach
    if (levels.currentLevel?.manual && bestStars > 0) return null;
    const { usedKeyboard, codeRuns } = levels.attempt;
    if (bestStars === 0) return usedKeyboard ? 'keys-flying' : 'keys-start';
    if (bestStars === 1) {
        if (usedKeyboard) return 'code-keyboard';
        if (codeEditor.runner.running) return 'code-running';
        return codeRuns > 0 ? 'code-stopped' : 'code-start';
    }
    return null;
}

function updateTutorial() {
    if (!tutorialCard) return;
    const step = getTutorialStep();
    // A level may skip steps (e.g. no keyboard lesson); then show nothing
    const lesson = step && (LEVEL_LESSONS[levels.currentLevelNumber][step] ?? SHARED_TUTORIAL_STEPS[step]);
    // Include the level so switching levels re-renders the same step name
    const key = lesson ? `${levels.currentLevelNumber}:${step}` : null;
    if (key === tutorialKey) return;
    tutorialKey = key;
    tutorialCard.hidden = !lesson;
    if (!lesson) return;

    const { title, body, code } = lesson;
    tutorialCard.innerHTML = `
        <div class="tut-title">${title}</div>
        <div class="tut-body">${typeof body === 'function' ? body(code) : body}</div>
        ${code ? '<button type="button" class="tut-action">Insert code</button>' : ''}`;
    tutorialCard.querySelector('.tut-action')?.addEventListener('click', () => {
        codeEditor.setCode(code);
        codeEditor.editor.focus();
    });
}

let hudFrameCounter = 0;
let lastShadowAltitudeRange = -1;

function formatFlightTime(seconds) {
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, '0')}`;
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
    levels.updateAircraft(myAircraft, dt);
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
            // Ammo only matters when there is something left to shoot
            const targets = Object.values(Obstacle.obstacles || {}).filter(o => o && o.health != null && !o._destroyed).length;
            const showAmmo = targets > 0 && typeof myAircraft.ammo === 'number';
            if (domHUD.ammo) domHUD.ammo.hidden = !showAmmo;
            if (showAmmo && domHUD.ammoCount) domHUD.ammoCount.textContent = String(myAircraft.ammo);

            if (window.gameState) {
                if (domHUD.timeCount) domHUD.timeCount.textContent = formatFlightTime(window.gameState.flightTime);
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
            if (domHUD.levelProgressFill) {
                const ratio = objective?.required ? objective.progress / objective.required : 0;
                domHUD.levelProgressFill.style.width = `${Math.min(1, Math.max(0, ratio)) * 100}%`;
            }

            if (typeof myAircraft.fuel === 'number' && typeof myAircraft.fuelCapacity === 'number') {
                const pct = Math.max(0, Math.min(1, myAircraft.fuel / myAircraft.fuelCapacity));
                if (domHUD.fuelFill) domHUD.fuelFill.style.width = (pct * 100) + '%';
                if (domHUD.fuelNum) domHUD.fuelNum.textContent = String(Math.floor(myAircraft.fuel));
                if (domHUD.fuelCapNum) domHUD.fuelCapNum.textContent = String(Math.floor(myAircraft.fuelCapacity));
            }

            updateTutorial();
        } catch (e) {}
    }

    // Handle Crash & Respawn
    if (myAircraft.isCrashed && !myAircraft._respawnQueued) {
        const crashedAircraft = myAircraft;
        crashedAircraft._respawnQueued = true;
        window.setTimeout(() => {
            if (crashedAircraft.isCrashed) {
                if (crashedAircraft === airplane) restartCurrentLevel();
                else crashedAircraft.restart();
            }
            crashedAircraft._respawnQueued = false;
        }, 1000);
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

try {
    await Bullet.warmUp(world.renderer, world.scene, world.camera);
} catch (error) {
    console.warn('Projectile rendering warm-up failed:', error);
}
animate();
