export class InputController {
    constructor(canvas) {
        this.canvas = canvas;
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
        this.canvas.addEventListener('keydown', (e) => this.handleKeyDown(e), false);
        this.canvas.addEventListener('keyup', (e) => this.handleKeyUp(e), false);

        // Mouse Position
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e), false);

        // Mouse Buttons
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseButtons(e, true), false);
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseButtons(e, false), false);

        // Mouse Wheel
        this.canvas.addEventListener('wheel', (e) => {
            this.mouse.wheelDelta = e.deltaY;
        }, { passive: true });

        // Optional: Context Menu (prevents right-click menu from popping up in-game)
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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