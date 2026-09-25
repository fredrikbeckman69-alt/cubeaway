import * as THREE from 'three';
import { CelestialBody } from '../puzzle/celestialBodies';

export class CelestialSphere {
  public group: THREE.Group;
  private sphereMesh: THREE.Mesh;
  private glowMesh: THREE.Mesh;
  private ringMesh: THREE.Mesh | null = null;
  private currentLevel: number = -1;
  private basePosition = new THREE.Vector3(3.3, 1.7, -13.5);
  private focusPosition = new THREE.Vector3(0, 0.2, -9.5);
  private targetScale = 1.0;
  private currentScale = 1.0;
  private isFocusMode = false;
  private hasRingsActive = false;

  constructor() {
    this.group = new THREE.Group();
    this.group.position.copy(this.basePosition);

    // Grundläggande sfärgeometri (ökat mått för ståtligare rymdkänsla)
    const sphereGeo = new THREE.SphereGeometry(5.0, 48, 48);
    const sphereMat = new THREE.MeshStandardMaterial({
      roughness: 0.7,
      metalness: 0.1,
    });
    this.sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    this.sphereMesh.castShadow = false;
    this.sphereMesh.receiveShadow = false;
    // Förhindra att himlakroppen fångar musklick/raycasts
    this.sphereMesh.raycast = () => {};
    this.group.add(this.sphereMesh);

    // Atmosfärisk / korona-glöd runt himlakroppen
    const glowGeo = new THREE.SphereGeometry(5.35, 32, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    });
    this.glowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.glowMesh.raycast = () => {};
    this.group.add(this.glowMesh);
  }

  /**
   * Uppdaterar himlakroppens utseende (textur, färg, glöd, eventuella ringar)
   * baserat på aktuell CelestialBody och dess astronomiska kategori.
   */
  public updateCelestialBody(body: CelestialBody) {
    if (this.currentLevel === body.level) return;
    this.currentLevel = body.level;

    // Skapa en procedurgenererad högupplöst canvas-textur anpassad för himlakroppen
    const { canvas, emissiveColor, glowColor, hasRings, ringColors } = this.generateCelestialTexture(body);
    this.hasRingsActive = hasRings;

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const mat = this.sphereMesh.material as THREE.MeshStandardMaterial;
    if (mat.map) mat.map.dispose();
    mat.map = texture;

    // Om himlakroppen är en stjärna eller kvasar har den hög emissivitet
    const isStar = body.category === 'Stjärna' || body.category === 'Kvasar';
    mat.emissive = new THREE.Color(emissiveColor);
    mat.emissiveIntensity = isStar ? 0.75 : 0.08;
    mat.roughness = isStar ? 0.2 : 0.8;
    mat.metalness = isStar ? 0.0 : 0.15;
    mat.needsUpdate = true;

    // Uppdatera korona / atmosfär
    const glowMat = this.glowMesh.material as THREE.MeshBasicMaterial;
    glowMat.color.set(glowColor);
    glowMat.opacity = isStar ? 0.42 : 0.18;
    glowMat.needsUpdate = true;

    // Hantera eventuella planetringar (t.ex. Saturnus eller gasjättar)
    if (this.ringMesh) {
      this.group.remove(this.ringMesh);
      if (this.ringMesh.geometry) this.ringMesh.geometry.dispose();
      if (Array.isArray(this.ringMesh.material)) {
        this.ringMesh.material.forEach((m) => m.dispose());
      } else {
        this.ringMesh.material.dispose();
      }
      this.ringMesh = null;
    }

    if (hasRings) {
      const ringGeo = new THREE.RingGeometry(6.0, 10.0, 64);
      // Vänd ringens UV för koncentrisk texturering
      const ringCanvas = document.createElement('canvas');
      ringCanvas.width = 256;
      ringCanvas.height = 16;
      const rCtx = ringCanvas.getContext('2d');
      if (rCtx) {
        const rGrad = rCtx.createLinearGradient(0, 0, 256, 0);
        rGrad.addColorStop(0.0, 'rgba(0,0,0,0)');
        rGrad.addColorStop(0.15, ringColors[0] || 'rgba(210,180,140,0.5)');
        rGrad.addColorStop(0.45, 'rgba(0,0,0,0.1)');
        rGrad.addColorStop(0.65, ringColors[1] || 'rgba(240,220,180,0.7)');
        rGrad.addColorStop(0.92, ringColors[0] || 'rgba(180,150,110,0.4)');
        rGrad.addColorStop(1.0, 'rgba(0,0,0,0)');
        rCtx.fillStyle = rGrad;
        rCtx.fillRect(0, 0, 256, 16);
      }
      const ringTex = new THREE.CanvasTexture(ringCanvas);
      const ringMat = new THREE.MeshBasicMaterial({
        map: ringTex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      });

      this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
      this.ringMesh.rotation.x = Math.PI * 0.42;
      this.ringMesh.rotation.y = Math.PI * 0.08;
      this.ringMesh.raycast = () => {};
      this.group.add(this.ringMesh);
    }

    // Mjuk introduktionsskalning vid byte
    this.currentScale = 0.88;
    this.group.scale.setScalar(this.currentScale);
  }

  /**
   * Genererar en 512x256 procedural sfär-textur optimerad för Three.js UV-mapping
   */
  private generateCelestialTexture(body: CelestialBody): {
    canvas: HTMLCanvasElement;
    emissiveColor: string;
    glowColor: string;
    hasRings: boolean;
    ringColors: [string, string];
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const name = body.name.toLowerCase();
    const cat = body.category;

    let baseGradColors: [string, string, string] = ['#222233', '#111122', '#0a0a14'];
    let emissiveColor = '#000000';
    let glowColor = '#3b82f6';
    let hasRings = false;
    let ringColors: [string, string] = ['rgba(200,180,140,0.6)', 'rgba(230,210,170,0.8)'];

    if (cat === 'Stjärna' || name.includes('solen') || name.includes('sun')) {
      baseGradColors = ['#ffcc00', '#ff6600', '#cc1100'];
      emissiveColor = '#ff8800';
      glowColor = '#ffaa22';
    } else if (name.includes('tellus') || name.includes('jorden') || name.includes('earth')) {
      baseGradColors = ['#0d47a1', '#1976d2', '#1b5e20'];
      emissiveColor = '#002244';
      glowColor = '#4fc3f7';
    } else if (name.includes('mars')) {
      baseGradColors = ['#c8411b', '#912a0d', '#571705'];
      emissiveColor = '#441105';
      glowColor = '#ff5722';
    } else if (name.includes('venus')) {
      baseGradColors = ['#e6c280', '#c29b47', '#8a6824'];
      emissiveColor = '#3a2800';
      glowColor = '#ffd54f';
    } else if (name.includes('merkurius') || name.includes('mercury')) {
      baseGradColors = ['#8d8d8d', '#5c5c5c', '#333333'];
      emissiveColor = '#151515';
      glowColor = '#b0bec5';
    } else if (name.includes('jupiter')) {
      baseGradColors = ['#d4a373', '#bc6c25', '#a3501a'];
      emissiveColor = '#2b1405';
      glowColor = '#e0a96d';
    } else if (name.includes('saturnus') || name.includes('saturn')) {
      baseGradColors = ['#e0cda9', '#c4af88', '#998462'];
      emissiveColor = '#282010';
      glowColor = '#ffe082';
      hasRings = true;
      ringColors = ['rgba(215,195,150,0.65)', 'rgba(245,230,190,0.85)'];
    } else if (name.includes('uranus')) {
      baseGradColors = ['#7de2d1', '#47b8a6', '#267b6e'];
      emissiveColor = '#002b25';
      glowColor = '#80deea';
      hasRings = true;
      ringColors = ['rgba(130,220,230,0.4)', 'rgba(180,240,250,0.6)'];
    } else if (name.includes('neptunus') || name.includes('neptune')) {
      baseGradColors = ['#2952a3', '#1e3c78', '#102246'];
      emissiveColor = '#051025';
      glowColor = '#448aff';
    } else if (cat === 'Måne' || name.includes('månen') || name.includes('moon')) {
      baseGradColors = ['#b8b8b8', '#7a7a7a', '#444444'];
      emissiveColor = '#101010';
      glowColor = '#cfd8dc';
    } else if (cat === 'Nebulosa' || cat === 'Galax') {
      baseGradColors = ['#9c27b0', '#e91e63', '#3f51b5'];
      emissiveColor = '#4a148c';
      glowColor = '#e040fb';
    } else {
      // Deterministisk palett baserad på nivånummer
      const hue = (body.level * 47) % 360;
      baseGradColors = [
        `hsl(${hue}, 65%, 45%)`,
        `hsl(${(hue + 25) % 360}, 55%, 30%)`,
        `hsl(${(hue + 50) % 360}, 45%, 15%)`,
      ];
      emissiveColor = `hsl(${hue}, 50%, 15%)`;
      glowColor = `hsl(${hue}, 75%, 60%)`;
      if (body.level % 7 === 0) {
        hasRings = true;
      }
    }

    // Rita basgradient
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, baseGradColors[0]);
    grad.addColorStop(0.5, baseGradColors[1]);
    grad.addColorStop(1.0, baseGradColors[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Lägg till moln-/bandstrimmor och kratrar
    ctx.globalCompositeOperation = 'overlay';
    for (let y = 10; y < 250; y += 18) {
      const alpha = 0.15 + Math.sin(y * 0.1 + body.level) * 0.12;
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.02, alpha)})`;
      ctx.fillRect(0, y, 512, 8 + (body.level % 6));
    }

    // Fläckar / kratrar för variation
    ctx.globalCompositeOperation = 'soft-light';
    const seed = body.level * 9301;
    for (let i = 0; i < 28; i++) {
      const cx = ((seed * (i + 1) * 31) % 512);
      const cy = ((seed * (i + 1) * 17) % 256);
      const cr = 4 + ((seed * (i + 1)) % 22);
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.35)';
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    return {
      canvas,
      emissiveColor,
      glowColor,
      hasRings,
      ringColors,
    };
  }

  /**
   * Aktiverar eller inaktiverar fokusläge för himlakroppen (centrerar och skalar upp vid vinst)
   */
  public setFocusMode(active: boolean) {
    this.isFocusMode = active;
    if (active) {
      this.targetScale = 1.25;
    } else {
      this.targetScale = 1.0;
    }
  }

  public getFocusMode(): boolean {
    return this.isFocusMode;
  }

  /**
   * Kontrollerar om en raycast träffar himlakroppen eller dess ringar
   */
  public checkIntersection(raycaster: THREE.Raycaster): boolean {
    const sphereRadius = (this.hasRingsActive ? 10.5 : 5.4) * this.currentScale;
    const testSphere = new THREE.Sphere(this.group.position, sphereRadius);
    return raycaster.ray.intersectsSphere(testSphere);
  }

  /**
   * Kallas i animationsloopen: roterar himlakroppen, skalar mjukt och interpolerar position
   */
  public update(deltaSeconds: number, cameraRotationY: number = 0, cameraRotationX: number = 0) {
    // Långsam rofylld rotation
    this.sphereMesh.rotation.y += deltaSeconds * 0.08;
    if (this.ringMesh) {
      this.ringMesh.rotation.z += deltaSeconds * 0.02;
    }

    // Mjuk skala-interpolering
    if (Math.abs(this.currentScale - this.targetScale) > 0.001) {
      this.currentScale += (this.targetScale - this.currentScale) * 0.06;
      this.group.scale.setScalar(this.currentScale);
    }

    // Positionsinterpolation beroende på fokusläge
    if (this.isFocusMode) {
      const targetX = this.focusPosition.x - cameraRotationY * 0.15;
      const targetY = this.focusPosition.y + cameraRotationX * 0.15;
      const targetZ = this.focusPosition.z;
      this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, targetX, 0.05);
      this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, targetY, 0.05);
      this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, targetZ, 0.05);
    } else {
      const targetX = this.basePosition.x - cameraRotationY * 0.35;
      const targetY = this.basePosition.y + cameraRotationX * 0.25;
      const targetZ = this.basePosition.z;
      this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, targetX, 0.06);
      this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, targetY, 0.06);
      this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, targetZ, 0.06);
    }
  }

  public dispose() {
    if (this.sphereMesh.geometry) this.sphereMesh.geometry.dispose();
    if (this.sphereMesh.material) {
      const mat = this.sphereMesh.material as THREE.MeshStandardMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
    }
    if (this.glowMesh.geometry) this.glowMesh.geometry.dispose();
    if (this.glowMesh.material) {
      (this.glowMesh.material as THREE.Material).dispose();
    }
    if (this.ringMesh) {
      if (this.ringMesh.geometry) this.ringMesh.geometry.dispose();
      (this.ringMesh.material as THREE.Material).dispose();
    }
  }
}
