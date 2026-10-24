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
        this.canvas.addEventListener('blur', () => this.resetInputState(), false);

        // Mouse Position
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e), false);

        // Mouse Buttons
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseButtons(e, true), false);
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseButtons(e, false), false);

        // Mouse Wheel
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();

            // Normalize wheel units: browsers may report pixels, lines, or pages.
            const unitScale = e.deltaMode === 1
                ? 16
                : e.deltaMode === 2
                    ? this.canvas.clientHeight
                    : 1;
            this.mouse.wheelDelta += e.deltaY * unitScale;
        }, { passive: false, capture: true });

        // Optional: Context Menu (prevents right-click menu from popping up in-game)
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    resetInputState() {
        this.keys.clear();
        this.mouse.left = false;
        this.mouse.right = false;
        this.mouse.middle = false;
        this.mouse.wheelDelta = 0;
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

    consumeWheelDelta() {
        const delta = this.mouse.wheelDelta;
        this.mouse.wheelDelta = 0;
        return delta;
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
