import * as THREE from 'three';

export interface HitResult {
  faceIdx: number;
  r: number;
  c: number;
  clientX?: number;
  clientY?: number;
}

export class CubeController {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private cubeGroup: THREE.Group;

  // Zoom
  private targetDistance: number = 6.0;
  private currentDistance: number = 6.0;
  private minDistance: number = 3.5;
  private maxDistance: number = 14.0;
  public isAutoRotating: boolean = true;

  // Rotation (Arkboll / fri quaternion-rotation)
  private isPointerDown: boolean = false;
  private hasDragged: boolean = false;
  private pointerStartX: number = 0;
  private pointerStartY: number = 0;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;

  private angularVelocityX: number = 0;
  private angularVelocityY: number = 0;
  private readonly damping: number = 0.94;
  private readonly rotationSpeed: number = 0.006;

  // Piltangent-zoom
  private keysDown: Set<string> = new Set();

  // Raycasting för klick & hovring
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private pointerPos: THREE.Vector2 = new THREE.Vector2(-999, -999);
  private cubeMesh: THREE.Mesh | null = null;
  private gridSize: number = 10;

  // Callbacks
  public onHoverCell: ((hit: HitResult | null) => void) | null = null;
  public onClickCell: ((hit: HitResult) => void) | null = null;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    cubeGroup: THREE.Group
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.cubeGroup = cubeGroup;

    this.initEventListeners();
  }

  public setCubeMesh(mesh: THREE.Mesh, gridSize: number) {
    this.cubeMesh = mesh;
    this.gridSize = gridSize;
  }

  public setGridSize(gridSize: number) {
    this.gridSize = gridSize;
  }

  private initEventListeners() {
    // 1. Pekdon / Mus
    this.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
    window.addEventListener('pointercancel', this.onPointerUp.bind(this));

    // 2. Scrollhjul för zoom
    this.domElement.addEventListener('wheel', (e) => {
      this.isAutoRotating = false;
      this.onWheel(e);
    }, { passive: false });

    // 3. Tangenter (Pil upp / Pil ner för zoom, vänster/höger för rotation)
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      this.isAutoRotating = false;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        this.keysDown.add(e.key);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.key);
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
    });
  }

  public onPointerDownCallback: (() => void) | null = null;

  private onPointerDown(e: PointerEvent) {
    this.isAutoRotating = false;
    this.onPointerDownCallback?.();
    this.isPointerDown = true;
    this.hasDragged = false;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    this.angularVelocityX = 0;
    this.angularVelocityY = 0;
  }

  private onPointerMove(e: PointerEvent) {
    const rect = this.domElement.getBoundingClientRect();
    this.pointerPos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerPos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (this.isPointerDown) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;

      const totalDist = Math.hypot(e.clientX - this.pointerStartX, e.clientY - this.pointerStartY);
      if (totalDist > 6) {
        this.hasDragged = true;
      }

      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      if (this.hasDragged) {
        // Rotera kuben baserat på musrörelse
        this.angularVelocityY = dx * this.rotationSpeed;
        this.angularVelocityX = dy * this.rotationSpeed;
        this.applyRotation(this.angularVelocityX, this.angularVelocityY);
      }
    } else {
      // Hovring
      this.checkHover();
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;
    this.angularVelocityX = 0;
    this.angularVelocityY = 0;
    this.isAutoRotating = false;

    if (!this.hasDragged) {
      // Rent klick! Utför raycast
      const hit = this.performRaycast();
      if (hit && this.onClickCell) {
        this.onClickCell({
          ...hit,
          clientX: e.clientX,
          clientY: e.clientY,
        });
      }
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.005;
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + zoomDelta,
      this.minDistance,
      this.maxDistance
    );
  }

  public zoomIn(amount = 0.5) {
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance - amount,
      this.minDistance,
      this.maxDistance
    );
  }

  public zoomOut(amount = 0.5) {
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + amount,
      this.minDistance,
      this.maxDistance
    );
  }

  private applyRotation(deltaX: number, deltaY: number) {
    // Rotera runt kamerans synvinkel-axlar så rotationen alltid känns intuitiv oavsett hur kuben står
    const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaY);
    const rotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaX);

    // Applicera rotation på kubgruppen
    this.cubeGroup.quaternion.premultiply(rotY);
    this.cubeGroup.quaternion.premultiply(rotX);
  }

  private checkHover() {
    const hit = this.performRaycast();
    if (this.onHoverCell) {
      this.onHoverCell(hit);
    }
  }

  private performRaycast(): HitResult | null {
    if (!this.cubeMesh) return null;

    this.raycaster.setFromCamera(this.pointerPos, this.camera);
    const intersects = this.raycaster.intersectObject(this.cubeMesh);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.faceIndex !== undefined && hit.faceIndex !== null && hit.uv) {
        const faceIdx = Math.floor(hit.faceIndex / 2);
        const u = THREE.MathUtils.clamp(hit.uv.x, 0, 0.9999);
        const v = THREE.MathUtils.clamp(hit.uv.y, 0, 0.9999);

        const c = Math.floor(u * this.gridSize);
        const r = Math.floor((1 - v) * this.gridSize);

        return { faceIdx, r, c };
      }
    }
    return null;
  }

  public update(time: number, deltaSeconds: number) {
    // 1. Hantera piltangenter för zoom och mjuk rotation
    if (this.keysDown.has('ArrowUp')) {
      this.zoomIn(3.0 * deltaSeconds);
    }
    if (this.keysDown.has('ArrowDown')) {
      this.zoomOut(3.0 * deltaSeconds);
    }
    if (this.keysDown.has('ArrowLeft')) {
      this.applyRotation(0, -1.8 * deltaSeconds);
    }
    if (this.keysDown.has('ArrowRight')) {
      this.applyRotation(0, 1.8 * deltaSeconds);
    }

    // 2. Mjuk zoom-interpolation
    this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, this.targetDistance, 0.12);
    this.camera.position.setLength(this.currentDistance);

    // 3. Långsam automatisk presentation-rotation innan första klick/drag
    if (this.isAutoRotating) {
      this.applyRotation(0, 0.22 * deltaSeconds);
    }

    // 4. Kuben är helt stabil i luften (ingen gungning)
    this.cubeGroup.position.y = 0;
  }
}
