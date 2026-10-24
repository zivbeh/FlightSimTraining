import * as THREE from 'three';
import { Sky } from 'https://unpkg.com/three@0.160.0/examples/jsm/objects/Sky.js';
import { Runway } from './Runway.js';

export class World {
    constructor(canvasId) {
        this.canvas = document.querySelector(canvasId);
        this.canvas.setAttribute('tabindex', '0');
        
        this.viewport = this.canvas ? this.canvas.parentElement : null;
        this.scene = new THREE.Scene();

        const size = this._getCanvasSize();
        this.width = size.width;
        this.height = size.height;

        // Setup Camera using instance properties
        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 2000);
        this.camera.position.set(0, 10, 20);

        // Setup Renderer
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas, 
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.setSize(this.width, this.height);
        
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;

        // Environment properties
        this.sun = new THREE.Vector3();
        this.sky = null;
        this.directionalLight = null;
        this.effectController = {
            turbidity: 10,
            rayleigh: 3,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.7,
            elevation: 2,
            azimuth: 180,
        };

        this._initSky();
        this._initLights();
        // Keep the light count constant so firing never changes shader variants.
        this.muzzleFlash = new THREE.PointLight(0xffddaa, 0, 6, 2);
        this.scene.add(this.muzzleFlash);
        this.muzzleFlashUntil = 0;
        this._initGround();
        this.runway = new Runway(this);
        this._setupResize();
    }



    _initSky() {
        this.sky = new Sky();
        this.sky.scale.setScalar(450000);
        this.scene.add(this.sky);
        this.updateSun();
    }

    updateSun() {
        const uniforms = this.sky.material.uniforms;
        uniforms['turbidity'].value = this.effectController.turbidity;
        uniforms['rayleigh'].value = this.effectController.rayleigh;
        uniforms['mieCoefficient'].value = this.effectController.mieCoefficient;
        uniforms['mieDirectionalG'].value = this.effectController.mieDirectionalG;

        const phi = THREE.MathUtils.degToRad(90 - this.effectController.elevation);
        const theta = THREE.MathUtils.degToRad(this.effectController.azimuth);
        this.sun.setFromSphericalCoords(1, phi, theta);
        uniforms['sunPosition'].value.copy(this.sun);

        // if (this.directionalLight) {
        //     this.directionalLight.position.copy(this.sun);
        // }
    }

    _initLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.1);
        this.directionalLight.castShadow = true;
        
        const d = 5; 
        this.directionalLight.shadow.camera.left = -d;
        this.directionalLight.shadow.camera.right = d;
        this.directionalLight.shadow.camera.top = d;
        this.directionalLight.shadow.camera.bottom = -d;
        this.directionalLight.shadow.mapSize.set(512, 512);

        this.scene.add(this.directionalLight);
        this.scene.add(this.directionalLight.target);
    }

    _initGround() {
        const textureLoader = new THREE.TextureLoader();
        const grassTexture = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
        grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
        grassTexture.repeat.set(100, 100);

        const planeGeo = new THREE.PlaneGeometry(1000, 1000);
        const planeMat = new THREE.MeshStandardMaterial({ map: grassTexture, roughness: 1.8, color: '#c4c4c4' });
        const ground = new THREE.Mesh(planeGeo, planeMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.position.y = 0;
        this.scene.add(ground);
    }

    _setupResize() {
        window.addEventListener('resize', () => {
            this.resize();
        }, false);
    }

    _getCanvasSize() {
        if (this.viewport) {
            const rect = this.viewport.getBoundingClientRect();
            return {
                width: Math.max(1, Math.round(rect.width)),
                height: Math.max(1, Math.round(rect.height))
            };
        }

        if (this.canvas) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                width: Math.max(1, Math.round(rect.width)),
                height: Math.max(1, Math.round(rect.height))
            };
        }

        return { width: window.innerWidth, height: window.innerHeight };
    }

    resize(width, height) {
        if (typeof width === 'number' && typeof height === 'number') {
            this.width = width;
            this.height = height;
        } else {
            const size = this._getCanvasSize();
            this.width = size.width;
            this.height = size.height;
        }

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }

    /**
     * Removes every object added to the world scene and releases its GPU resources.
     *
     * @returns {number} The number of top-level objects removed from the scene.
     */
    removeAllObjects() {
        const objects = [...this.scene.children];
        const disposedTextures = new Set();

        objects.forEach((object) => {
            object.traverse((child) => {
                child.geometry?.dispose?.();

                const materials = Array.isArray(child.material)
                    ? child.material
                    : child.material
                        ? [child.material]
                        : [];

                materials.forEach((material) => {
                    Object.values(material).forEach((value) => {
                        if (value?.isTexture && !disposedTextures.has(value)) {
                            value.dispose();
                            disposedTextures.add(value);
                        }
                    });
                    material.dispose?.();
                });
            });

            this.scene.remove(object);
        });

        return objects.length;
    }

    flashMuzzle(position) {
        this.muzzleFlash.position.copy(position);
        this.muzzleFlash.intensity = 1.2;
        this.muzzleFlashUntil = performance.now() + 80;
    }

    render() {
        if (performance.now() >= this.muzzleFlashUntil) this.muzzleFlash.intensity = 0;
        this.renderer.render(this.scene, this.camera);
    }
}
