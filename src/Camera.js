export class ThirdPersonCamera {
    constructor(camera, body, inputController) {
        this.camera = camera;
        this.body = body;
        this.inputController = inputController;
        this.distance = 20;      // Distance behind the body
        this.height = 8;         // Height above the body
        this.smoothness = 0.1;   // Smoothing factor for camera movement
    }

    update() {
        if (!this.body.model) return;
        if (this.inputController.mouse.left) return
        // Get the forward vector of the body
        const forward = this.body.directions.z;
        
        // Calculate desired camera position (behind and above the body)
        const desiredX = this.body.position.x - forward.x * this.distance;
        const desiredY = this.body.position.y + this.height;
        const desiredZ = this.body.position.z - forward.z * this.distance;
        
        // Smoothly move camera to desired position
        this.camera.position.x += (desiredX - this.camera.position.x) * this.smoothness;
        this.camera.position.y += (desiredY - this.camera.position.y) * this.smoothness;
        this.camera.position.z += (desiredZ - this.camera.position.z) * this.smoothness;
        
        // Look at a point slightly ahead of the body
        const lookAheadDistance = 5;
        const lookAtX = this.body.position.x + forward.x * lookAheadDistance;
        const lookAtY = this.body.position.y;
        const lookAtZ = this.body.position.z + forward.z * lookAheadDistance;
        
        this.camera.lookAt(lookAtX, lookAtY, lookAtZ);
    }
}