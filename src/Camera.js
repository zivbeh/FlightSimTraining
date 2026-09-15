export class Camera {
    constructor(camera, body, inputController, orbitControls = null) {
        this.camera = camera;
        this.body = body;
        this.inputController = inputController;
        this.orbitControls = orbitControls;
        this.distance = 20;      // Distance behind the body
        this.minDistance = 6;
        this.maxDistance = 80;
        this.zoomSensitivity = 0.0015;
        this.height = 8;         // Height above the body
        this.smoothness = 0.1;   // Smoothing factor for camera movement
        this.lastBodyPosition = body.position.clone();
        this.mode = 'thirdPerson';
        this.startPosition = camera.position.clone();
    }

    setMode(mode) {
        if (mode !== 'thirdPerson' && mode !== 'groundWatch') {
            throw new Error(`Unknown camera mode: ${mode}`);
        }

        this.mode = mode;

        if (mode === 'groundWatch') {
            this.camera.position.copy(this.startPosition);
        } else {
            this.lastBodyPosition.copy(this.body.position);
        }

        if (this.orbitControls) {
            this.orbitControls.enabled = mode === 'thirdPerson';
        }
    }

    toggleMode() {
        this.setMode(this.mode === 'thirdPerson' ? 'groundWatch' : 'thirdPerson');
    }

    update(deltaTime = 1 / 60) {
        if (!this.body.model) return;

        const bodyPosition = this.body.position;

        if (this.mode === 'groundWatch') {
            // Stay where the simulation began and track only the aircraft's position.
            this.inputController.consumeWheelDelta();
            this.camera.position.copy(this.startPosition);
            this.camera.lookAt(bodyPosition);
            return;
        }

        const wheelDelta = this.inputController.consumeWheelDelta();
        let zoomScale = 1;
        if (wheelDelta !== 0) {
            // Exponential scaling feels consistent for both near and far views.
            const previousDistance = this.distance;
            this.distance = Math.max(
                this.minDistance,
                Math.min(this.maxDistance, this.distance * Math.exp(wheelDelta * this.zoomSensitivity))
            );
            zoomScale = this.distance / previousDistance;
        }

        // OrbitControls otherwise rotates around its default target: world origin.
        // Keep both the target and camera moving with the aircraft while the user
        // is looking around, so the chosen view stays aircraft-relative.
        if (this.orbitControls) {
            this.orbitControls.target.copy(bodyPosition);
        }

        if (this.inputController.mouse.left) {
            this.camera.position.add(
                bodyPosition.clone().sub(this.lastBodyPosition)
            );
            if (zoomScale !== 1) {
                this.camera.position.sub(bodyPosition).multiplyScalar(zoomScale).add(bodyPosition);
            }
            this.lastBodyPosition.copy(bodyPosition);
            if (this.orbitControls) this.orbitControls.update();
            return;
        }

        this.lastBodyPosition.copy(bodyPosition);
        // Get the forward vector of the body
        const forward = this.body.directions.z;
        
        // Calculate desired camera position (behind and above the body)
        const desiredX = this.body.position.x - forward.x * this.distance;
        const desiredY = this.body.position.y + this.height;
        const desiredZ = this.body.position.z - forward.z * this.distance;
        
        // Smoothly move camera to desired position
        const smoothing = 1 - Math.pow(1 - this.smoothness, Math.max(0, deltaTime) * 60);
        this.camera.position.x += (desiredX - this.camera.position.x) * smoothing;
        this.camera.position.y += (desiredY - this.camera.position.y) * smoothing;
        this.camera.position.z += (desiredZ - this.camera.position.z) * smoothing;
        
        // Look at a point slightly ahead of the body
        const lookAheadDistance = 5;
        const lookAtX = this.body.position.x + forward.x * lookAheadDistance;
        const lookAtY = this.body.position.y;
        const lookAtZ = this.body.position.z + forward.z * lookAheadDistance;
        
        this.camera.lookAt(lookAtX, lookAtY, lookAtZ);
    }
}
