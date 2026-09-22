import * as THREE from 'three';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  baseSize: number;
  life: number;
  maxLife: number;
  active: boolean;
}

export class ParticleManager {
  private maxParticles = 1200;
  private particles: Particle[] = [];
  private pointsMesh: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        r: 1,
        g: 1,
        b: 1,
        baseSize: 0,
        life: 0,
        maxLife: 1,
        active: false,
      });
      this.sizes[i] = 0;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const pointTexture = this.createParticleTexture();

    const material = new THREE.PointsMaterial({
      size: 0.35,
      map: pointTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });

    this.pointsMesh = new THREE.Points(this.geometry, material);
    this.pointsMesh.frustumCulled = false;
    this.scene.add(this.pointsMesh);
  }

  private createParticleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.4)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Skapar en explosion av lysande stjärnstoft när en pil susar ut från kubkanten
   */
  public spawnArrowBurst(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    color: string | number,
    count = 32
  ) {
    const col = new THREE.Color(color);

    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = origin.x;
        p.y = origin.y;
        p.z = origin.z;

        // Spridning längs pilens riktning med slumpmässig tangential hastighet
        const spreadSpeed = 1.2 + Math.random() * 2.8;
        const randX = (Math.random() - 0.5) * 1.6;
        const randY = (Math.random() - 0.5) * 1.6;
        const randZ = (Math.random() - 0.5) * 1.6;

        p.vx = direction.x * spreadSpeed + randX;
        p.vy = direction.y * spreadSpeed + randY;
        p.vz = direction.z * spreadSpeed + randZ;

        p.r = col.r;
        p.g = col.g;
        p.b = col.b;

        p.baseSize = 0.25 + Math.random() * 0.25;
        p.maxLife = 0.6 + Math.random() * 0.6; // 0.6 till 1.2 sekunder
        p.life = p.maxLife;

        spawned++;
      }
    }
  }

  /**
   * Skapar en storslagen seger-svärm av guld- och neonpartiklar runt kuben
   */
  public spawnVictoryExplosion(center: THREE.Vector3, count = 160) {
    const gold = new THREE.Color('#ffe600');
    const pink = new THREE.Color('#ff00aa');
    const cyan = new THREE.Color('#00ffff');
    const colors = [gold, pink, cyan];

    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = center.x + (Math.random() - 0.5) * 1.5;
        p.y = center.y + (Math.random() - 0.5) * 1.5;
        p.z = center.z + (Math.random() - 0.5) * 1.5;

        // Radiell sfärisk explosion
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const speed = 2.0 + Math.random() * 4.0;

        p.vx = Math.sin(phi) * Math.cos(theta) * speed;
        p.vy = Math.sin(phi) * Math.sin(theta) * speed;
        p.vz = Math.cos(phi) * speed;

        const c = colors[Math.floor(Math.random() * colors.length)];
        p.r = c.r;
        p.g = c.g;
        p.b = c.b;

        p.baseSize = 0.35 + Math.random() * 0.35;
        p.maxLife = 1.2 + Math.random() * 1.0;
        p.life = p.maxLife;

        spawned++;
      }
    }
  }

  public update(deltaSeconds: number) {
    let hasActive = false;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      const i3 = i * 3;

      if (p.active) {
        hasActive = true;
        p.life -= deltaSeconds;

        if (p.life <= 0) {
          p.active = false;
          this.sizes[i] = 0;
          this.positions[i3] = 0;
          this.positions[i3 + 1] = 0;
          this.positions[i3 + 2] = 0;
          continue;
        }

        // Fysik: Mjuk luftdämpning
        const drag = Math.pow(0.88, deltaSeconds * 60);
        p.vx *= drag;
        p.vy *= drag;
        p.vz *= drag;

        p.x += p.vx * deltaSeconds;
        p.y += p.vy * deltaSeconds;
        p.z += p.vz * deltaSeconds;

        const lifeRatio = p.life / p.maxLife;
        // Skala och intensitet tonar ut
        this.sizes[i] = p.baseSize * Math.sin(lifeRatio * Math.PI);

        this.positions[i3] = p.x;
        this.positions[i3 + 1] = p.y;
        this.positions[i3 + 2] = p.z;

        this.colors[i3] = p.r * lifeRatio;
        this.colors[i3 + 1] = p.g * lifeRatio;
        this.colors[i3 + 2] = p.b * lifeRatio;
      } else {
        this.sizes[i] = 0;
      }
    }

    if (hasActive) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
    }
  }

  public clearAll() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles[i].active = false;
      this.sizes[i] = 0;
    }
    this.geometry.attributes.size.needsUpdate = true;
  }

  public dispose() {
    this.scene.remove(this.pointsMesh);
    this.geometry.dispose();
    if (Array.isArray(this.pointsMesh.material)) {
      this.pointsMesh.material.forEach((m) => m.dispose());
    } else {
      this.pointsMesh.material.dispose();
    }
  }
}
