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

  // Rotation (Arkboll / fri quaternion-rotation) & Multi-touch / Pinch-zoom
  private isPointerDown: boolean = false;
  private hasDragged: boolean = false;
  private pointerStartX: number = 0;
  private pointerStartY: number = 0;
  private lastPointerX: number = 0;
  private lastPointerY: number = 0;

  private activePointers: Map<number, { x: number; y: number; pointerType: string }> = new Map();
  private initialPinchDistance: number = 0;
  private initialTargetDistance: number = 6.0;

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

  public setTargetDistance(distance: number) {
    this.targetDistance = THREE.MathUtils.clamp(
      distance,
      this.minDistance,
      this.maxDistance
    );
  }

  private updatePointerPos(clientX: number, clientY: number) {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.pointerPos.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerPos.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }
  }

  private initEventListeners() {
    // 1. WebKit Native Gestures för iPadOS & iOS Safari (hårdvaruaccelererad nyp-zoom)
    let gestureStartDistance = 6.0;
    const onGestureStart = (e: any) => {
      e.preventDefault();
      this.isAutoRotating = false;
      this.hasDragged = true;
      gestureStartDistance = this.targetDistance;
    };
    const onGestureChange = (e: any) => {
      e.preventDefault();
      this.hasDragged = true;
      if (e.scale && e.scale > 0) {
        this.targetDistance = THREE.MathUtils.clamp(
          gestureStartDistance / e.scale,
          this.minDistance,
          this.maxDistance
        );
      }
    };
    const onGestureEnd = (e: any) => {
      e.preventDefault();
      this.hasDragged = true;
    };

    window.addEventListener('gesturestart', onGestureStart, { passive: false });
    window.addEventListener('gesturechange', onGestureChange, { passive: false });
    window.addEventListener('gestureend', onGestureEnd, { passive: false });

    // 2. W3C Multi-Touch för alla pekskärmar (iPad, iPhone, Android, surfplattor)
    let touchPinchStartDist = 0;
    let touchPinchStartTargetDist = 6.0;

    this.domElement.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length >= 2) {
          e.preventDefault();
          this.isAutoRotating = false;
          this.hasDragged = true;
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          touchPinchStartDist = Math.hypot(dx, dy);
          touchPinchStartTargetDist = this.targetDistance;
        }
      },
      { passive: false }
    );

    this.domElement.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (e.touches.length >= 2) {
          e.preventDefault();
          this.hasDragged = true;
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const currentDist = Math.hypot(dx, dy);
          if (touchPinchStartDist > 10 && currentDist > 10) {
            const factor = touchPinchStartDist / currentDist;
            this.targetDistance = THREE.MathUtils.clamp(
              touchPinchStartTargetDist * factor,
              this.minDistance,
              this.maxDistance
            );
          }
        }
      },
      { passive: false }
    );

    this.domElement.addEventListener(
      'touchend',
      (e: TouchEvent) => {
        if (e.touches.length < 2 && touchPinchStartDist > 0) {
          touchPinchStartDist = 0;
          this.hasDragged = true;
        }
      },
      { passive: false }
    );

    // 3. Pointer Events (Mus, penna samt touch-interaktion)
    this.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('pointermove', this.onPointerMove.bind(this));
    window.addEventListener('pointerup', this.onPointerUp.bind(this));
    window.addEventListener('pointercancel', this.onPointerCancel.bind(this));

    // 4. Scrollhjul för mus
    this.domElement.addEventListener(
      'wheel',
      (e) => {
        this.isAutoRotating = false;
        this.onWheel(e);
      },
      { passive: false }
    );

    // 5. Tangenter (Pil upp / Pil ner för zoom, vänster/höger för rotation)
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
      this.activePointers.clear();
      this.isPointerDown = false;
    });
  }

  public onPointerDownCallback: (() => void) | null = null;

  private onPointerDown(e: PointerEvent) {
    this.isAutoRotating = false;
    this.onPointerDownCallback?.();

    // Endast för muspekare! På iOS Safari saboterar setPointerCapture multi-touch och touchgester
    if (e.pointerType !== 'touch') {
      try {
        this.domElement.setPointerCapture(e.pointerId);
      } catch (_) {}
    }

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });

    // Uppdatera pointerPos omedelbart vid nedtryck!
    // På iPad skickas ofta inget 'pointermove' vid snabba stillastående tryck på skärmen
    this.updatePointerPos(e.clientX, e.clientY);

    if (this.activePointers.size === 1) {
      this.isPointerDown = true;
      this.hasDragged = false;
      this.pointerStartX = e.clientX;
      this.pointerStartY = e.clientY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.angularVelocityX = 0;
      this.angularVelocityY = 0;
    } else if (this.activePointers.size === 2) {
      // Två fingrar via Pointer Events (t.ex. Android Chrome / Pixel 10)
      this.hasDragged = true;
      const pts = Array.from(this.activePointers.values());
      this.initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.initialTargetDistance = this.targetDistance;
    }
  }

  private onPointerMove(e: PointerEvent) {
    this.updatePointerPos(e.clientX, e.clientY);

    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });
    }

    // 2-fingers pinch zoom via pointer events
    if (this.activePointers.size >= 2) {
      const pts = Array.from(this.activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.initialPinchDistance > 10 && currentDist > 10) {
        const factor = this.initialPinchDistance / currentDist;
        this.targetDistance = THREE.MathUtils.clamp(
          this.initialTargetDistance * factor,
          this.minDistance,
          this.maxDistance
        );
      }
      return;
    }

    if (this.isPointerDown && this.activePointers.size === 1) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;

      // 18px tröskel för fingrar (touch slop) för att garantera att naturliga tryck aldrig tolkas som drag
      const threshold = e.pointerType === 'touch' ? 18 : 6;
      const totalDist = Math.hypot(e.clientX - this.pointerStartX, e.clientY - this.pointerStartY);
      if (totalDist > threshold) {
        this.hasDragged = true;
      }

      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;

      if (this.hasDragged) {
        // Rotera kuben baserat på pekarrörelse
        this.angularVelocityY = dx * this.rotationSpeed;
        this.angularVelocityX = dy * this.rotationSpeed;
        this.applyRotation(this.angularVelocityX, this.angularVelocityY);
      }
    } else {
      // Hovring endast för muspekare (inte touch) för att spara prestanda och slippa spökhovring
      if (e.pointerType !== 'touch') {
        this.checkHover();
      }
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (e.pointerType !== 'touch') {
      try {
        this.domElement.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size === 1) {
      // Ett finger kvar efter tvåfingerzoom - uppdatera koordinater för att undvika ryck
      const remaining = Array.from(this.activePointers.values())[0];
      this.lastPointerX = remaining.x;
      this.lastPointerY = remaining.y;
      this.pointerStartX = remaining.x;
      this.pointerStartY = remaining.y;
      this.hasDragged = true;
      return;
    }

    if (this.activePointers.size === 0) {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      this.angularVelocityX = 0;
      this.angularVelocityY = 0;
      this.isAutoRotating = false;

      const clickX = e.clientX || this.pointerStartX;
      const clickY = e.clientY || this.pointerStartY;
      const totalDist = Math.hypot(clickX - this.pointerStartX, clickY - this.pointerStartY);
      const threshold = e.pointerType === 'touch' ? 18 : 6;

      if (!this.hasDragged && totalDist <= threshold) {
        // Rent klick! Utför raycast med exakt position där användaren tryckte
        const hit = this.performRaycast(clickX, clickY);
        if (hit && this.onClickCell) {
          this.onClickCell({
            ...hit,
            clientX: clickX,
            clientY: clickY,
          });
        }
      }
    }
  }

  private onPointerCancel(e: PointerEvent) {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size === 0) {
      this.isPointerDown = false;
      this.hasDragged = false;
      this.angularVelocityX = 0;
      this.angularVelocityY = 0;
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

  public performRaycast(clientX?: number, clientY?: number): HitResult | null {
    if (!this.cubeMesh) return null;

    if (clientX !== undefined && clientY !== undefined) {
      this.updatePointerPos(clientX, clientY);
    }

    this.raycaster.setFromCamera(this.pointerPos, this.camera);
    const intersects = this.raycaster.intersectObject(this.cubeMesh);

    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.faceIndex !== undefined && hit.faceIndex !== null && hit.uv) {
        let faceIdx = 0;
        const geo = this.cubeMesh.geometry as THREE.BufferGeometry;
        if (geo.groups && geo.groups.length > 0) {
          const vertIdx = hit.faceIndex * 3;
          const group = geo.groups.find(
            (g) => vertIdx >= g.start && vertIdx < g.start + g.count
          );
          faceIdx = group?.materialIndex ?? Math.floor(hit.faceIndex / 2);
        } else {
          faceIdx = Math.floor(hit.faceIndex / 2);
        }

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
