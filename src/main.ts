import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { generateCubePuzzle, canArrowFly } from './puzzle/generator';
import { Arrow, DIR_DELTA, GameMode, CUBE_FACE_NAMES_SV, PortalDef, ReflectorDef } from './puzzle/types';
import { LevelTheme, getLevelTheme } from './puzzle/theme';
import { ShapeDefinition, getLevelShape, createShapeGeometry } from './puzzle/shapes';
import { CelestialBody, getCelestialBody } from './puzzle/celestialBodies';
import { CubeFaceRenderer } from './render/CubeFaceRenderer';
import { FlyingArrowManager } from './render/FlyingArrowManager';
import { ParticleManager } from './render/ParticleManager';
import { CelestialSphere } from './render/CelestialSphere';
import { CubeController, HitResult } from './controls/CubeController';
import { sound } from './audio';
import { scoreManager } from './puzzle/scoreManager';

class CubeAwayGame {
  // Three.js
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private webglRenderer: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private cubeGroup: THREE.Group;
  private cubeMesh!: THREE.Mesh;
  private celestialSphere: CelestialSphere;

  // Ljus
  private dirLight1!: THREE.DirectionalLight;
  private dirLight2!: THREE.DirectionalLight;

  // Färgtema, Geometrisk form & Himlakropp
  private currentTheme!: LevelTheme;
  private currentShape!: ShapeDefinition;
  private currentCelestialBody!: CelestialBody;

  // Renderers & Managers
  private faceRenderer: CubeFaceRenderer;
  private flyingManager: FlyingArrowManager;
  private particleManager: ParticleManager;
  private controller: CubeController;

  // Speltillstånd
  private currentLevel: number = 1;
  private gridSize: number = 20;
  private allArrows: Arrow[] = [];
  private grids: (string | null)[][][] = [];
  private totalInitialArrows: number = 0;
  private remainingArrows: number = 0;
  private blockedClicksCount: number = 0;
  private isVictoryAnimating: boolean = false;
  private currentPortals: PortalDef[] = [];
  private currentReflectors: ReflectorDef[] = [];

  // Interaktion & Feedback
  private hoveredArrowId: string | null = null;
  private hintArrowId: string | null = null;
  private hintAnimId: number | null = null;
  private shakingArrow: { arrowId: string; startTime: number; faces: number[] } | null = null;
  private backgroundTexture: THREE.Texture | null = null;
  private leaderboardTab: 'level' | 'alltime' = 'alltime';
  private leaderboardViewLevel: number = 1;
  private starMapZone: string = 'inner';
  private starMapSearch: string = '';

  // Konstanter
  private readonly CUBE_SIZE = 3.8;
  private lastAnimateTime: number = performance.now();
  private boundAnimate = (now: number) => this.animate(now);

  constructor() {
    // 1. Three.js-scen med kosmisk rymdbakgrund
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b0213');

    // Ladda den valda rymdbakgrunden (nebulosa med stjärnor och galaxer)
    const textureLoader = new THREE.TextureLoader();
    const getAbsoluteAssetUrl = (fileName: string) => {
      const origin = window.location.origin;
      let pathname = window.location.pathname;
      if (!pathname.endsWith('/')) {
        pathname += '/';
      }
      return `${origin}${pathname}${fileName}`;
    };

    const candidates = [
      getAbsoluteAssetUrl('background_hd.jpg'),
      getAbsoluteAssetUrl('background.png'),
      getAbsoluteAssetUrl('background.jpg'),
      `${import.meta.env.BASE_URL || './'}background_hd.jpg`,
      './background_hd.jpg',
      'background_hd.jpg',
      '/background_hd.jpg',
    ];

    const tryLoadTexture = (index: number) => {
      if (index >= candidates.length) {
        console.warn('Could not load space background from any candidate URL.');
        return;
      }
      const url = candidates[index];
      textureLoader.load(
        url,
        (bgTex) => {
          bgTex.colorSpace = THREE.SRGBColorSpace;
          this.backgroundTexture = bgTex;
          this.scene.background = bgTex;
          this.updateBackgroundCover();
        },
        undefined,
        (err) => {
          console.warn(`Failed loading background from ${url}, trying fallback...`, err);
          tryLoadTexture(index + 1);
        }
      );
    };

    tryLoadTexture(0);

    // 2. Kamera med responsiv synfälts-beräkning för porträtt- och landskapslägen
    const aspect = window.innerWidth / window.innerHeight;
    const baseFov = 42;
    const initialFov = aspect < 1.0
      ? (2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) / aspect) * 180) / Math.PI
      : baseFov;
    this.camera = new THREE.PerspectiveCamera(initialFov, aspect, 0.1, 100);
    this.camera.position.set(0, 0, 6.0);

    // 3. WebGL Renderer
    const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
    this.webglRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.webglRenderer.setPixelRatio(pixelRatio);
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.webglRenderer.toneMappingExposure = 1.0;

    // Post-processing: UnrealBloomPass kalibrerad för distinkt, knivskarp neonglöd utan suddighet
    this.composer = new EffectComposer(this.webglRenderer);
    this.composer.setPixelRatio(pixelRatio);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.35, // Distinkt, kristallklar glödstyrka
      0.20, // Tät, fokuserad glödradie som inte smetar ut linjerna
      0.72  // Hög tröskel: polyederytan och linjerna förblir 100 % knivskarpa
    );
    this.composer.addPass(this.bloomPass);

    // 4. Ljussättning med balanserade nivåer för hög kontrast
    this.currentTheme = getLevelTheme(this.currentLevel);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(ambientLight);

    this.dirLight1 = new THREE.DirectionalLight(this.currentTheme.dirLight1Color, 0.7);
    this.dirLight1.position.set(5, 10, 7);
    this.scene.add(this.dirLight1);

    this.dirLight2 = new THREE.DirectionalLight(0xffffff, 0.15);
    this.dirLight2.position.set(-5, 5, -5);
    this.scene.add(this.dirLight2);

    // 5. Himlakropp i rymdbakgrunden & Kub-grupp
    this.celestialSphere = new CelestialSphere();
    this.scene.add(this.celestialSphere.group);

    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);

    // Sätt startvinkel för kuben (visar topp, fram och vänster sida snyggt likt referensbilden)
    const initialEuler = new THREE.Euler(0.48, -0.62, 0, 'YXZ');
    this.cubeGroup.quaternion.setFromEuler(initialEuler);

    this.faceRenderer = new CubeFaceRenderer(2048);
    this.faceRenderer.setTheme(this.currentTheme);
    this.flyingManager = new FlyingArrowManager(this.cubeGroup);
    this.particleManager = new ParticleManager(this.scene);
    this.createCubeMesh();

    // 7. Kontroller
    this.controller = new CubeController(this.camera, canvas, this.cubeGroup);
    this.controller.setCubeMesh(this.cubeMesh, this.gridSize);

    this.controller.onHoverCell = this.handleHover.bind(this);
    this.controller.onClickCell = this.handleClick.bind(this);
    this.controller.onPointerDownCallback = () => {
      this.cancelRotateAnimation();
    };

    // 8. Event listeners (orientering, visualViewport, WebGL-återhämtning & touch audio unlock)
    window.addEventListener('resize', this.onResize.bind(this));
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.onResize(), 150);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.onResize.bind(this));
    }

    // WebGL-återhämtning för mobila webbläsare vid bakgrundsväxling
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL Context Lost.');
    }, false);

    canvas.addEventListener('webglcontextrestored', () => {
      console.log('WebGL Context Restored.');
      this.onResize();
      for (let f = 0; f < 6; f++) {
        this.renderFaceState(f);
      }
    }, false);

    // Lås upp Web Audio vid första pekskärmsberöring (viktigt för iOS Safari och iPadOS)
    const unlockAudio = () => {
      sound.initCtx();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });

    this.bindUI();

    // 9. Ladda nivå
    const savedLevel = localStorage.getItem('cubeaway_level');
    if (savedLevel) {
      const parsed = parseInt(savedLevel, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 1000) {
        this.currentLevel = parsed;
      }
    }

    this.loadLevel(this.currentLevel);

    this.boundAnimate(performance.now());
  }



  private createCubeMesh() {
    this.currentShape = getLevelShape(this.currentLevel);
    const geo = createShapeGeometry(this.currentShape);
    const materials = this.faceRenderer.textures.map(
      (tex) =>
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.35,
          metalness: 0.05,
        })
    );

    this.cubeMesh = new THREE.Mesh(geo, materials);
    this.cubeGroup.add(this.cubeMesh);
    this.flyingManager.setShapeType(this.currentShape.type);
  }

  public loadLevel(levelNum: number, isRestart: boolean = false) {
    this.currentLevel = Math.max(1, Math.min(1000, Math.floor(levelNum)));
    localStorage.setItem('cubeaway_level', this.currentLevel.toString());

    // 1. Hämta form, himlakropp och tema för den nya nivån
    this.currentShape = getLevelShape(this.currentLevel);
    this.currentCelestialBody = getCelestialBody(this.currentLevel);
    this.currentTheme = getLevelTheme(this.currentLevel);
    this.faceRenderer.setTheme(this.currentTheme);
    document.title = `CubeAway 3D - Bana ${this.currentLevel} • ${this.currentCelestialBody.name}`;

    // Uppdatera 3D-himlakropp i bakgrunden
    if (this.celestialSphere) {
      this.celestialSphere.updateCelestialBody(this.currentCelestialBody);
    }

    // 2. Uppdatera 3D-geometrin för vald form (100 % balanserad polyeder med pilar på alla 6 sidor)
    if (this.cubeMesh) {
      this.cubeMesh.geometry.dispose();
      this.cubeMesh.geometry = createShapeGeometry(this.currentShape);
      this.flyingManager.setShapeType(this.currentShape.type);
      this.controller.setCubeMesh(this.cubeMesh, this.gridSize);
      this.controller.setTargetDistance(this.currentShape.cameraDistance);

      const mats = this.cubeMesh.material as THREE.MeshStandardMaterial[];
      mats.forEach((mat) => {
        mat.needsUpdate = true;
      });
    }

    // 3. Uppdatera ljuskällor och markglöd
    if (this.dirLight1) this.dirLight1.color.setHex(this.currentTheme.dirLight1Color);

    // 4. Rensa tillstånd och avbryt eventuella animationer
    this.cancelRotateAnimation();
    this.flyingManager.clearAll();
    this.particleManager.clearAll();
    this.hoveredArrowId = null;
    this.hintArrowId = null;
    this.shakingArrow = null;
    this.blockedClicksCount = 0;
    this.isVictoryAnimating = false;

    // Återställ oavslutad nivåpoäng om spelaren byter nivå mitt i eller startar om
    if (this.remainingArrows > 0 && this.remainingArrows < this.totalInitialArrows && !isRestart) {
      scoreManager.rollbackUnfinishedLevel();
    }

    const { config, allArrows, initialGrids, portals, reflectors } = generateCubePuzzle(this.currentLevel);
    this.gridSize = config.gridSize;
    this.allArrows = allArrows;
    this.grids = initialGrids;
    this.currentPortals = portals || [];
    this.currentReflectors = reflectors || [];

    this.faceRenderer.setGridSize(this.gridSize);
    this.controller.setGridSize(this.gridSize);

    this.totalInitialArrows = this.allArrows.length;
    this.remainingArrows = this.allArrows.length;

    // Starta nivå och synka poängmätare med banans faktiska antal pilar
    scoreManager.startLevel(isRestart, this.totalInitialArrows);

    // Rita alla 6 kubsidor med det nya temat, portaler och reflektorer
    for (let f = 0; f < 6; f++) {
      this.renderFaceState(f);
    }

    this.updateHUD();
    this.hideWinModal();
  }

  private updateScoreHUD() {
    const scoreVal = document.getElementById('current-score');
    if (scoreVal) {
      const score = scoreManager.getScore();
      scoreVal.textContent = score.toLocaleString('sv-SE');
      if (score < 0) {
        scoreVal.classList.add('negative');
      } else {
        scoreVal.classList.remove('negative');
      }
    }
  }

  private bumpScoreHUD() {
    const scoreVal = document.getElementById('current-score');
    if (scoreVal) {
      scoreVal.classList.remove('bump');
      void scoreVal.offsetWidth;
      scoreVal.classList.add('bump');
      setTimeout(() => scoreVal.classList.remove('bump'), 180);
    }
  }

  private updateComboHUD() {
    const badge = document.getElementById('combo-badge');
    const text = document.getElementById('combo-text');
    const bar = document.getElementById('combo-bar');
    const combo = scoreManager.getComboStreak();

    if (combo > 1) {
      badge?.classList.remove('hidden');
      if (text) text.textContent = `COMBO x${combo} 🔥`;
      if (bar) bar.style.width = `${scoreManager.getComboTimeLeftPct()}%`;
    } else {
      badge?.classList.add('hidden');
    }
  }

  private formatTimer(seconds: number): string {
    const s = Math.max(0, Math.ceil(seconds));
    if (s < 60) {
      return `${s}s`;
    }
    const mins = Math.floor(s / 60);
    const remSec = s % 60;
    return `${mins}:${remSec < 10 ? '0' : ''}${remSec}`;
  }

  private spawnScoreToast(
    text: string,
    x: number,
    y: number,
    type: 'positive' | 'combo-bonus' | 'penalty'
  ) {
    const container = document.getElementById('score-toasts');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `score-toast ${type}`;
    toast.textContent = text;
    const clampedX = Math.max(80, Math.min(window.innerWidth - 80, x));
    const clampedY = Math.max(80, Math.min(window.innerHeight - 80, y));
    toast.style.left = `${clampedX}px`;
    toast.style.top = `${clampedY}px`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 1100);
  }

  private renderLeaderboard() {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;

    const tabLevelBtn = document.getElementById('tab-level-lb');
    const tabAlltimeBtn = document.getElementById('tab-alltime-lb');
    const levelSwitcher = document.getElementById('lb-level-switcher');
    const levelTitle = document.getElementById('lb-level-title');
    const selectedLevelNum = document.getElementById('lb-selected-level-num');
    const thLevel = document.getElementById('lb-th-level');
    const directLevelEl = document.getElementById('lb-direct-current-level');

    if (directLevelEl) directLevelEl.textContent = `${this.currentLevel} • ${this.currentCelestialBody.name}`;

    if (this.leaderboardTab === 'level') {
      tabLevelBtn?.classList.add('active');
      tabAlltimeBtn?.classList.remove('active');
      levelSwitcher?.classList.remove('hidden');
      thLevel?.classList.add('hidden');
      const targetCelestial = getCelestialBody(this.leaderboardViewLevel);
      if (selectedLevelNum) selectedLevelNum.textContent = this.leaderboardViewLevel.toString();
      if (levelTitle) levelTitle.textContent = `Bana ${this.leaderboardViewLevel} • ${targetCelestial.name}`;

      const lbPrev = document.getElementById('lb-prev-level') as HTMLButtonElement | null;
      const lbNext = document.getElementById('lb-next-level') as HTMLButtonElement | null;
      if (lbPrev) lbPrev.disabled = this.leaderboardViewLevel <= 1;
      if (lbNext) lbNext.disabled = this.leaderboardViewLevel >= 1000;
    } else {
      tabLevelBtn?.classList.remove('active');
      tabAlltimeBtn?.classList.add('active');
      levelSwitcher?.classList.add('hidden');
      thLevel?.classList.remove('hidden');
    }

    const tableEl = document.getElementById('leaderboard-table');
    if (this.leaderboardTab === 'level') {
      tableEl?.classList.add('mode-level');
      tableEl?.classList.remove('mode-alltime');
    } else {
      tableEl?.classList.remove('mode-level');
      tableEl?.classList.add('mode-alltime');
    }

    const list = this.leaderboardTab === 'level'
      ? scoreManager.getLevelLeaderboard(this.leaderboardViewLevel)
      : scoreManager.getAllTimeLeaderboard();

    const currentScore = scoreManager.getScore();
    const summaryScore = document.getElementById('lb-summary-score');
    if (summaryScore) summaryScore.textContent = currentScore.toLocaleString('sv-SE');

    tbody.innerHTML = '';
    list.forEach((entry) => {
      const tr = document.createElement('tr');
      if (entry.rank === 1) tr.classList.add('top-1');
      else if (entry.rank === 2) tr.classList.add('top-2');
      else if (entry.rank === 3) tr.classList.add('top-3');

      let rankDisplay = `#${entry.rank}`;
      let rankClass = '';
      if (entry.rank === 1) {
        rankDisplay = '🥇 1';
        rankClass = 'gold';
      } else if (entry.rank === 2) {
        rankDisplay = '🥈 2';
        rankClass = 'silver';
      } else if (entry.rank === 3) {
        rankDisplay = '🥉 3';
        rankClass = 'bronze';
      }

      const celestial = getCelestialBody(entry.level);
      const levelCell = this.leaderboardTab === 'alltime'
        ? `<td class="col-level"><span class="lb-level-badge" title="Bana ${entry.level} • ${celestial.name} (${celestial.category})">${entry.level}. ${celestial.name}</span></td>`
        : '';

      tr.innerHTML = `
        <td class="col-rank"><span class="rank-badge ${rankClass}">${rankDisplay}</span></td>
        <td class="col-player"><span class="initials-badge">${entry.initials}</span></td>
        <td class="col-score score-col">${entry.score.toLocaleString('sv-SE')}</td>
        ${levelCell}
        <td class="col-date date-col">${entry.date}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  private openLeaderboardModal() {
    this.leaderboardTab = 'alltime';
    this.leaderboardViewLevel = this.currentLevel;
    scoreManager.migrateLegacyVaults();
    this.renderLeaderboard();
    const modal = document.getElementById('highscore-modal');
    modal?.classList.remove('hidden');

    scoreManager
      .syncWithCloud()
      .then(() => {
        this.renderLeaderboard();
      })
      .catch(() => {});

    const input = document.getElementById('direct-initials-input') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  private closeLeaderboardModal() {
    const modal = document.getElementById('highscore-modal');
    modal?.classList.add('hidden');
  }

  private renderStarMap(zone?: string, query?: string) {
    if (zone !== undefined) this.starMapZone = zone;
    if (query !== undefined) this.starMapSearch = query.trim().toLowerCase();

    const grid = document.getElementById('starmap-grid');
    if (!grid) return;

    let minLevel = 1;
    let maxLevel = 10;
    if (this.starMapZone === 'gas') {
      minLevel = 11; maxLevel = 35;
    } else if (this.starMapZone === 'kuiper') {
      minLevel = 36; maxLevel = 75;
    } else if (this.starMapZone === 'stars') {
      minLevel = 76; maxLevel = 200;
    } else if (this.starMapZone === 'nebula') {
      minLevel = 201; maxLevel = 500;
    } else if (this.starMapZone === 'galaxies') {
      minLevel = 501; maxLevel = 1000;
    }

    let items: CelestialBody[] = [];
    if (this.starMapSearch) {
      const q = this.starMapSearch;
      const numQuery = parseInt(q, 10);
      if (!isNaN(numQuery) && numQuery >= 1 && numQuery <= 1000) {
        items.push(getCelestialBody(numQuery));
      }
      for (let i = 1; i <= 1000; i++) {
        const body = getCelestialBody(i);
        if (body.name.toLowerCase().includes(q) || body.category.toLowerCase().includes(q)) {
          if (!items.find((x) => x.level === body.level)) {
            items.push(body);
          }
        }
        if (items.length >= 80) break;
      }
    } else {
      for (let i = minLevel; i <= maxLevel; i++) {
        items.push(getCelestialBody(i));
      }
    }

    grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    items.forEach((body) => {
      const stars = scoreManager.getLevelStars(body.level);
      const isCur = body.level === this.currentLevel;
      const itemEl = document.createElement('div');
      itemEl.className = `starmap-item ${isCur ? 'current' : ''}`;
      itemEl.setAttribute('data-level', body.level.toString());

      const starStr = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆';

      itemEl.innerHTML = `
        <div class="starmap-item-header">
          <span class="starmap-item-lvl">BANA ${body.level}</span>
          <span class="starmap-item-cat">${body.category}</span>
        </div>
        <div class="starmap-item-name" title="${body.name}">${body.name}</div>
        <div class="starmap-item-stars" title="${stars} stjärnor">${starStr}</div>
      `;

      itemEl.addEventListener('click', () => {
        document.getElementById('level-modal')?.classList.add('hidden');
        this.loadLevel(body.level);
      });

      frag.appendChild(itemEl);
    });

    grid.appendChild(frag);
  }

  private updateHUD() {
    const levelText = document.getElementById('level-text');
    if (levelText) {
      levelText.textContent = `Bana ${this.currentLevel} • ${this.currentCelestialBody.name}`;
    }

    const celestialBtn = document.getElementById('celestial-explore-btn') as HTMLAnchorElement;
    const celestialName = document.getElementById('celestial-explore-name');
    if (celestialBtn) {
      celestialBtn.href = this.currentCelestialBody.url;
      celestialBtn.title = `Utforska ${this.currentCelestialBody.name} (${this.currentCelestialBody.category}) i universum via ${this.currentCelestialBody.sourceName}`;
    }
    if (celestialName) {
      celestialName.textContent = this.currentCelestialBody.name;
    }

    const levelBadge = document.getElementById('level-display');
    if (levelBadge) {
      levelBadge.title = `Bana ${this.currentLevel}: ${this.currentCelestialBody.name} (${this.currentCelestialBody.category}) • ${this.currentShape.name} • ${this.currentTheme.name}`;
    }

    const levelStars = document.getElementById('level-stars');
    if (levelStars) {
      const stars = scoreManager.getLevelStars(this.currentLevel);
      if (stars > 0) {
        levelStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      } else {
        levelStars.textContent = '☆☆☆';
      }
    }

    const prevLevelBtn = document.getElementById('prev-level-btn') as HTMLButtonElement | null;
    const nextLevelBtn = document.getElementById('next-level-btn') as HTMLButtonElement | null;
    if (prevLevelBtn) prevLevelBtn.disabled = this.currentLevel <= 1;
    if (nextLevelBtn) nextLevelBtn.disabled = this.currentLevel >= 1000;

    const remainingVal = document.getElementById('remaining-arrows');
    if (remainingVal) {
      remainingVal.textContent = `${this.remainingArrows} / ${this.totalInitialArrows}`;
    }

    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      const cleared = this.totalInitialArrows - this.remainingArrows;
      const pct = this.totalInitialArrows > 0 ? (cleared / this.totalInitialArrows) * 100 : 0;
      progressBar.style.width = `${pct}%`;
      progressBar.style.background = this.currentTheme.accentGradient;
      progressBar.style.boxShadow = `0 0 10px ${this.currentTheme.arrowGlow}`;
    }

    const movesVal = document.getElementById('moves-count');
    const parVal = document.getElementById('par-count');
    if (movesVal) movesVal.textContent = scoreManager.getMovesCount().toString();
    if (parVal) parVal.textContent = scoreManager.getParMoves().toString();

    this.updateScoreHUD();
    this.updateComboHUD();
  }

  private handleHover(hit: HitResult | null) {
    if (!hit) {
      if (this.hoveredArrowId) {
        const oldArrow = this.allArrows.find((a) => a.id === this.hoveredArrowId);
        this.hoveredArrowId = null;
        if (oldArrow) {
          const faces = new Set(oldArrow.cells.map((c) => c.faceIdx));
          if (oldArrow.linkedWithId) {
            const oldTwin = this.allArrows.find((a) => a.id === oldArrow.linkedWithId);
            oldTwin?.cells.forEach((c) => faces.add(c.faceIdx));
          }
          faces.forEach((f) => this.renderFaceState(f));
        }
      }
      return;
    }

    const { faceIdx, r, c } = hit;
    const arrowId = this.grids[faceIdx]?.[r]?.[c];

    if (arrowId && arrowId !== this.hoveredArrowId) {
      const oldArrow = this.allArrows.find((a) => a.id === this.hoveredArrowId);
      this.hoveredArrowId = arrowId;
      const newArrow = this.allArrows.find((a) => a.id === arrowId);

      const affectedFaces = new Set<number>();
      if (oldArrow) {
        oldArrow.cells.forEach((cell) => affectedFaces.add(cell.faceIdx));
        if (oldArrow.linkedWithId) {
          const oldTwin = this.allArrows.find((a) => a.id === oldArrow.linkedWithId);
          oldTwin?.cells.forEach((cell) => affectedFaces.add(cell.faceIdx));
        }
      }
      if (newArrow) {
        newArrow.cells.forEach((cell) => affectedFaces.add(cell.faceIdx));
        if (newArrow.linkedWithId) {
          const newTwin = this.allArrows.find((a) => a.id === newArrow.linkedWithId);
          newTwin?.cells.forEach((cell) => affectedFaces.add(cell.faceIdx));
        }
      }

      affectedFaces.forEach((f) => this.renderFaceState(f));
    } else if (!arrowId && this.hoveredArrowId) {
      const oldArrow = this.allArrows.find((a) => a.id === this.hoveredArrowId);
      this.hoveredArrowId = null;
      if (oldArrow) {
        const faces = new Set(oldArrow.cells.map((c) => c.faceIdx));
        if (oldArrow.linkedWithId) {
          const oldTwin = this.allArrows.find((a) => a.id === oldArrow.linkedWithId);
          oldTwin?.cells.forEach((cell) => faces.add(cell.faceIdx));
        }
        faces.forEach((f) => this.renderFaceState(f));
      }
    }
  }

  private renderFaceState(faceIdx: number, shakeOffset = { x: 0, y: 0 }) {
    const shakingId = this.shakingArrow?.arrowId || null;
    this.faceRenderer.renderFace(
      faceIdx,
      this.allArrows,
      this.hoveredArrowId,
      shakingId,
      shakeOffset,
      this.hintArrowId,
      this.currentPortals,
      this.currentReflectors
    );
  }

  private launchArrow(
    arrow: Arrow,
    clientX?: number,
    clientY?: number
  ) {
    const arrowIdx = this.allArrows.findIndex((a) => a.id === arrow.id);
    if (arrowIdx === -1) return;

    scoreManager.recordMove();

    sound.playArrowSuccess(scoreManager.getComboStreak());
    if ('vibrate' in navigator) navigator.vibrate(15);

    // Poäng, Combo & Tidsbonus
    const { pointsAdded, multiplier, timeBonusAdded } = scoreManager.addArrowScore(
      arrow.cells.length,
      arrow.type === 'linked'
    );
    this.updateScoreHUD();
    this.bumpScoreHUD();
    this.updateComboHUD();

    const clickX = clientX ?? window.innerWidth / 2;
    const clickY = clientY ?? window.innerHeight / 2;
    let toastMsg = `+${pointsAdded}${multiplier > 1 ? ` (x${multiplier}!)` : ''}`;
    if (scoreManager.getGameMode() === 'time_attack' && timeBonusAdded > 0) {
      toastMsg += ` +${timeBonusAdded}s ⏱️`;
    }
    this.spawnScoreToast(
      toastMsg,
      clickX,
      clickY,
      multiplier > 1 || timeBonusAdded > 0 ? 'combo-bonus' : 'positive'
    );

    // Rensa eventuella highlights
    if (this.hintArrowId === arrow.id || (arrow.linkedWithId && this.hintArrowId === arrow.linkedWithId)) {
      this.hintArrowId = null;
    }
    if (this.hoveredArrowId === arrow.id || (arrow.linkedWithId && this.hoveredArrowId === arrow.linkedWithId)) {
      this.hoveredArrowId = null;
    }

    // Ta bort från allArrows
    this.allArrows.splice(arrowIdx, 1);

    // Töm celler på alla sidor som pilen täckte
    const affectedFaces = new Set<number>();
    for (const cell of arrow.cells) {
      this.grids[cell.faceIdx][cell.r][cell.c] = null;
      affectedFaces.add(cell.faceIdx);
    }

    // Spawna 3D-flygande pil med den aktiva nivåns glödfärg (eller lila för länkade pilar)!
    const arrowFlyColor = arrow.type === 'linked' ? 0xff00ea : this.currentTheme.flyingArrowColor;
    this.flyingManager.spawnFlyingArrow(
      arrow,
      this.gridSize,
      this.CUBE_SIZE,
      arrowFlyColor
    );

    // Partikel-svärm vid pilutskjutning
    const localHead = this.flyingManager.coordToLocal3D(
      arrow.head.faceIdx,
      arrow.head,
      this.gridSize,
      this.CUBE_SIZE
    );
    const worldHead = this.cubeGroup.localToWorld(localHead.clone());
    const faceVectors = this.flyingManager.getFaceVectors(arrow.head.faceIdx);
    const { dr, dc } = DIR_DELTA[arrow.dir];
    const worldDir = new THREE.Vector3()
      .addScaledVector(faceVectors.tangentU, dc)
      .addScaledVector(faceVectors.tangentV, -dr)
      .applyQuaternion(this.cubeGroup.quaternion)
      .normalize();
    this.particleManager.spawnArrowBurst(worldHead, worldDir, arrowFlyColor, 32);

    // Uppdatera alla påverkade kubsidor
    affectedFaces.forEach((f) => this.renderFaceState(f));

    this.remainingArrows--;
    this.updateHUD();

    // Vinstvillkor
    if (this.remainingArrows === 0) {
      this.handleVictory();
    }
  }

  private handleClick(hit: HitResult) {
    const { faceIdx, r, c } = hit;
    const arrowId = this.grids[faceIdx]?.[r]?.[c];
    if (!arrowId) return;

    const arrowIdx = this.allArrows.findIndex((a) => a.id === arrowId);
    if (arrowIdx === -1) return;

    const arrow = this.allArrows[arrowIdx];
    const canFly = canArrowFly(arrow, this.grids, this.gridSize, this.currentPortals, this.currentReflectors);

    // 1. Fryst pil (innesluten i is – klicka när vägen är fri för att krossa isen!)
    if (arrow.type === 'frozen' && arrow.isFrozen) {
      scoreManager.recordMove();
      this.updateHUD();

      if (!canFly) {
        sound.playArrowBlocked();
        this.blockedClicksCount++;
        if ('vibrate' in navigator) navigator.vibrate([25, 40, 25]);
        const faces = Array.from(new Set(arrow.cells.map((c) => c.faceIdx)));
        this.shakingArrow = { arrowId: arrow.id, startTime: performance.now(), faces };
        faces.forEach((f) => this.renderFaceState(f));
        const clickX = hit.clientX ?? window.innerWidth / 2;
        const clickY = hit.clientY ?? window.innerHeight / 2;
        this.spawnScoreToast('❄️ Fryst pil blockerad framåt!', clickX, clickY, 'penalty');
        return;
      }

      // Isen krossas!
      arrow.isFrozen = false;
      sound.playIceBreak();
      if ('vibrate' in navigator) navigator.vibrate(18);

      const localHead = this.flyingManager.coordToLocal3D(
        arrow.head.faceIdx,
        arrow.head,
        this.gridSize,
        this.CUBE_SIZE
      );
      const worldHead = this.cubeGroup.localToWorld(localHead.clone());
      this.particleManager.spawnArrowBurst(worldHead, new THREE.Vector3(0, 1, 0), 0x00f0ff, 28);

      const clickX = hit.clientX ?? window.innerWidth / 2;
      const clickY = hit.clientY ?? window.innerHeight / 2;
      this.spawnScoreToast('❄️ Isen spräckt! Tryck igen för att skjuta iväg! ⚡', clickX, clickY, 'combo-bonus');

      const affectedFaces = new Set(arrow.cells.map((c) => c.faceIdx));
      affectedFaces.forEach((f) => this.renderFaceState(f));
      return;
    }

    // 2. Länkad pil (par – båda måste ha fri väg för att skjutas iväg som ett duoskott)
    if (arrow.type === 'linked' && arrow.linkedWithId) {
      const twin = this.allArrows.find((a) => a.id === arrow.linkedWithId);
      const twinCanFly = twin ? canArrowFly(twin, this.grids, this.gridSize, this.currentPortals, this.currentReflectors) : false;

      if (!canFly || !twinCanFly) {
        sound.playArrowBlocked();
        this.blockedClicksCount++;
        scoreManager.recordMove();
        this.updateHUD();
        if ('vibrate' in navigator) navigator.vibrate([25, 40, 25]);

        const combinedFaces = new Set<number>();
        arrow.cells.forEach((c) => combinedFaces.add(c.faceIdx));
        if (twin) twin.cells.forEach((c) => combinedFaces.add(c.faceIdx));

        this.shakingArrow = {
          arrowId: arrow.id,
          startTime: performance.now(),
          faces: Array.from(combinedFaces),
        };
        combinedFaces.forEach((f) => this.renderFaceState(f));

        const clickX = hit.clientX ?? window.innerWidth / 2;
        const clickY = hit.clientY ?? window.innerHeight / 2;

        if (!canFly && !twinCanFly) {
          this.spawnScoreToast('🔗 Båda länkade pilarna är blockerade!', clickX, clickY, 'penalty');
        } else if (!canFly) {
          this.spawnScoreToast('🔗 Denna pil är blockerad framåt!', clickX, clickY, 'penalty');
        } else {
          const twinFaceName = twin ? CUBE_FACE_NAMES_SV[twin.head.faceIdx] : 'annan sida';
          this.spawnScoreToast(`🔗 Länkad pil! Dess partner på ${twinFaceName} är blockerad!`, clickX, clickY, 'combo-bonus');
        }
        return;
      }

      // Båda länkade pilarna har fri väg! Skjut iväg båda!
      sound.playLinkWhoosh();
      if ('vibrate' in navigator) navigator.vibrate([15, 30, 15]);
      const clickX = hit.clientX ?? window.innerWidth / 2;
      const clickY = hit.clientY ?? window.innerHeight / 2;
      this.spawnScoreToast('🔗 DUO-SKOTT! Länkade pilar fria! 🚀', clickX, clickY, 'combo-bonus');

      this.launchArrow(arrow, hit.clientX, hit.clientY);
      if (twin) this.launchArrow(twin, hit.clientX, hit.clientY);
      return;
    }

    // 3. Normal pil
    if (canFly) {
      this.launchArrow(arrow, hit.clientX, hit.clientY);
    } else {
      sound.playArrowBlocked();
      this.blockedClicksCount++;
      scoreManager.recordMove();
      this.updateHUD();
      if ('vibrate' in navigator) navigator.vibrate([25, 40, 25]);
      const { penalty } = scoreManager.onBlockedArrow();
      this.updateScoreHUD();
      this.bumpScoreHUD();
      this.updateComboHUD();

      const clickX = hit.clientX ?? window.innerWidth / 2;
      const clickY = hit.clientY ?? window.innerHeight / 2;
      if (penalty > 0) {
        this.spawnScoreToast(`-${penalty}`, clickX, clickY, 'penalty');
      }

      const faces = Array.from(new Set(arrow.cells.map((c) => c.faceIdx)));
      this.shakingArrow = {
        arrowId: arrow.id,
        startTime: performance.now(),
        faces,
      };
      faces.forEach((f) => this.renderFaceState(f));
    }
  }

  private giveHint() {
    const hint = this.allArrows.find((a) => {
      if (a.type === 'linked' && a.linkedWithId) {
        const twin = this.allArrows.find((t) => t.id === a.linkedWithId);
        return (
          canArrowFly(a, this.grids, this.gridSize, this.currentPortals, this.currentReflectors) &&
          (twin ? canArrowFly(twin, this.grids, this.gridSize, this.currentPortals, this.currentReflectors) : false)
        );
      }
      return canArrowFly(a, this.grids, this.gridSize, this.currentPortals, this.currentReflectors);
    });

    if (hint) {
      const prevHintArrow = this.allArrows.find((a) => a.id === this.hintArrowId);
      this.hintArrowId = hint.id;

      const affectedFaces = new Set<number>();
      if (prevHintArrow) prevHintArrow.cells.forEach((c) => affectedFaces.add(c.faceIdx));
      hint.cells.forEach((c) => affectedFaces.add(c.faceIdx));

      affectedFaces.forEach((f) => this.renderFaceState(f));

      // Rotera kuben så att pilens huvud vetter mot kameran!
      this.rotateToFace(hint.head.faceIdx);
    }
  }

  private cancelRotateAnimation() {
    if (this.hintAnimId !== null) {
      cancelAnimationFrame(this.hintAnimId);
      this.hintAnimId = null;
    }
  }

  private rotateToFace(faceIdx: number) {
    this.cancelRotateAnimation();

    const targetQuat = new THREE.Quaternion();

    switch (faceIdx) {
      case 0: // +X (Höger)
        targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        break;
      case 1: // -X (Vänster)
        targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        break;
      case 2: // +Y (Topp)
        targetQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        break;
      case 3: // -Y (Botten)
        targetQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
        break;
      case 4: // +Z (Fram)
        targetQuat.identity();
        break;
      case 5: // -Z (Bak)
        targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        break;
    }

    const startQuat = this.cubeGroup.quaternion.clone();
    const startTime = performance.now();
    const duration = 600;

    const step = () => {
      const now = performance.now();
      const t = Math.min(1, (now - startTime) / duration);
      const easeT = 1 - Math.pow(1 - t, 3);

      this.cubeGroup.quaternion.slerpQuaternions(startQuat, targetQuat, easeT);

      if (t < 1) {
        this.hintAnimId = requestAnimationFrame(step);
      } else {
        this.hintAnimId = null;
      }
    };
    this.hintAnimId = requestAnimationFrame(step);
  }

  private handleVictory() {
    if (this.isVictoryAnimating) return;
    this.isVictoryAnimating = true;

    const stars = scoreManager.calculateStars(this.blockedClicksCount);
    scoreManager.saveLevelStars(this.currentLevel, stars);
    const winBonus = scoreManager.addLevelWinBonus(this.currentLevel);

    this.updateScoreHUD();
    this.bumpScoreHUD();
    this.updateHUD();

    if ('vibrate' in navigator) navigator.vibrate([40, 60, 40, 60, 100]);
    sound.playVictoryFanfare();

    // Storslagen partikel-explosion i 3D
    this.particleManager.spawnVictoryExplosion(this.cubeGroup.position, 160);

    // Filmisk seger-kameraåkning (mjuk slerp och utzoomning under 1.4s)
    const startTime = performance.now();
    const duration = 1400;

    const victoryStep = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const easeT = 1 - Math.pow(1 - t, 3);

      this.cubeGroup.rotation.y += 0.035 * (1 - easeT * 0.4);

      if (t < 1) {
        requestAnimationFrame(victoryStep);
      } else {
        this.isVictoryAnimating = false;
        this.showWinModal(winBonus, stars);
      }
    };
    requestAnimationFrame(victoryStep);
  }

  private showWinModal(
    bonus?: {
      baseBonus: number;
      speedBonus: number;
      parBonus: number;
      isPar: boolean;
      totalBonus: number;
      totalScore: number;
    },
    stars: number = 3
  ) {
    const modal = document.getElementById('win-modal');
    const winTitle = modal?.querySelector('.win-title');
    if (winTitle) {
      winTitle.textContent = `Bana ${this.currentLevel} • ${this.currentCelestialBody.name} klarad!`;
    }
    const desc = document.getElementById('win-desc');
    if (desc) {
      desc.textContent = `Otroligt snyggt! Bana ${this.currentLevel} • ${this.currentCelestialBody.name} (${this.currentShape.name}) är avklarad.`;
    }

    const cCategory = document.getElementById('win-celestial-category');
    const cName = document.getElementById('win-celestial-name');
    const cDesc = document.getElementById('win-celestial-desc');
    const cLink = document.getElementById('win-celestial-link') as HTMLAnchorElement;
    const cSource = document.getElementById('win-celestial-source');

    if (cCategory) cCategory.textContent = this.currentCelestialBody.category;
    if (cName) cName.textContent = this.currentCelestialBody.name;
    if (cDesc) cDesc.textContent = this.currentCelestialBody.description;
    if (cSource) cSource.textContent = this.currentCelestialBody.sourceName;
    if (cLink) {
      cLink.href = this.currentCelestialBody.url;
      cLink.title = `Öppna ${this.currentCelestialBody.name} i ${this.currentCelestialBody.sourceName}`;
    }

    // Animera stjärnor med ljud
    for (let i = 1; i <= 3; i++) {
      const starEl = document.getElementById(`win-star-${i}`);
      if (starEl) {
        starEl.classList.remove('earned');
        if (i <= stars) {
          setTimeout(() => {
            starEl.classList.add('earned');
            sound.playStarPop(i - 1);
          }, 200 + i * 240);
        }
      }
    }

    const parLabel = document.getElementById('win-par-label');
    const parVal = document.getElementById('win-par-val');
    if (bonus && parVal) {
      if (bonus.isPar) {
        if (parLabel) parLabel.textContent = 'Par-resultat:';
        parVal.textContent = `🎯 Perfekt Match på Par (+${bonus.parBonus.toLocaleString('sv-SE')})`;
        parVal.style.color = '#ffd700';
      } else {
        if (parLabel) parLabel.textContent = 'Drag / Par:';
        parVal.textContent = `${scoreManager.getMovesCount()} drag (Par: ${scoreManager.getParMoves()}) +${bonus.parBonus.toLocaleString('sv-SE')}`;
        parVal.style.color = '#ff66cc';
      }
    }

    const bonusEl = document.getElementById('win-level-bonus');
    if (bonusEl) {
      bonusEl.textContent = bonus ? `+${bonus.totalBonus.toLocaleString('sv-SE')}` : '+0';
    }

    const totalEl = document.getElementById('win-total-score');
    if (totalEl) {
      totalEl.textContent = scoreManager.getScore().toLocaleString('sv-SE');
    }

    const currentScore = scoreManager.getScore();
    const isLevelHigh = scoreManager.isLevelHighScore(this.currentLevel, currentScore);
    const isAllTimeHigh = scoreManager.isAllTimeHighScore(currentScore);

    const hsSection = document.getElementById('win-highscore-section');
    const hsBanner = document.getElementById('win-highscore-banner');
    const hsInput = document.getElementById('win-initials-input') as HTMLInputElement;
    const hsSavedMsg = document.getElementById('win-score-saved-msg');
    const hsSaveBtn = document.getElementById('win-save-score-btn') as HTMLButtonElement;

    if (hsBanner) {
      if (isAllTimeHigh) {
        hsBanner.textContent = '👑 NYTT ALL-TIME HIGH! 👑';
      } else if (isLevelHigh) {
        hsBanner.textContent = `🌟 NYTT REKORD PÅ BANA ${this.currentLevel} • ${this.currentCelestialBody.name.toUpperCase()}! 🌟`;
      } else {
        hsBanner.textContent = `🌟 SPARA DITT RESULTAT FÖR BANA ${this.currentLevel}! 🌟`;
      }
    }

    if (hsSection) {
      if (isLevelHigh || isAllTimeHigh || currentScore > 0) {
        hsSection.classList.remove('hidden');
        if (hsInput) {
          hsInput.value = '';
          hsInput.disabled = false;
          setTimeout(() => hsInput.focus(), 250);
        }
        if (hsSaveBtn) hsSaveBtn.disabled = false;
        if (hsSavedMsg) hsSavedMsg.classList.add('hidden');
      } else {
        hsSection.classList.add('hidden');
      }
    }

    const nextBtn = document.getElementById('next-level-win-btn') as HTMLButtonElement | null;
    if (nextBtn) {
      if (this.currentLevel >= 1000) {
        nextBtn.textContent = 'Börja om från Bana 1 🌟';
      } else {
        nextBtn.textContent = 'Nästa Bana ›';
      }
    }

    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  private hideWinModal() {
    const modal = document.getElementById('win-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  private bindUI() {
    document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
      this.controller.zoomIn(0.8);
    });
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
      this.controller.zoomOut(0.8);
    });

    document.getElementById('prev-level-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.currentLevel > 1) {
        this.loadLevel(this.currentLevel - 1);
      }
    });

    document.getElementById('next-level-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.currentLevel < 1000) {
        this.loadLevel(this.currentLevel + 1);
      }
    });

    document.getElementById('restart-btn')?.addEventListener('click', () => {
      this.loadLevel(this.currentLevel, true);
    });

    document.getElementById('hint-btn')?.addEventListener('click', () => {
      this.giveHint();
    });


    const soundBtn = document.getElementById('sound-btn');
    const soundIcon = document.getElementById('sound-icon');
    soundBtn?.addEventListener('click', () => {
      sound.initCtx();
      const muted = sound.toggleMute();
      if (soundIcon) {
        soundIcon.textContent = muted ? '🔇' : '🔊';
      }
    });

    const levelModal = document.getElementById('level-modal');
    const searchInput = document.getElementById('level-search-input') as HTMLInputElement | null;

    const openStarMap = () => {
      levelModal?.classList.remove('hidden');
      if (searchInput) {
        searchInput.value = '';
        this.starMapSearch = '';
      }
      this.renderStarMap();
    };

    const closeStarMap = () => {
      levelModal?.classList.add('hidden');
    };

    document.getElementById('levels-modal-btn')?.addEventListener('click', openStarMap);
    document.getElementById('level-display')?.addEventListener('click', openStarMap);
    document.getElementById('close-level-modal')?.addEventListener('click', closeStarMap);

    // Zon-knappar i stjärnkartan
    document.querySelectorAll('.starmap-zone-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.starmap-zone-btn').forEach((b) => b.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        const zone = target.getAttribute('data-zone') || 'inner';
        if (searchInput) searchInput.value = '';
        this.starMapSearch = '';
        this.renderStarMap(zone, '');
      });
    });

    // Sökfält i stjärnkartan
    searchInput?.addEventListener('input', (e) => {
      const q = (e.target as HTMLInputElement).value;
      this.renderStarMap(undefined, q);
    });

    const executeJump = () => {
      if (!searchInput) return;
      const q = searchInput.value.trim();
      const num = parseInt(q, 10);
      if (!isNaN(num) && num >= 1 && num <= 1000) {
        closeStarMap();
        this.loadLevel(num);
        return;
      }

      if (q.length > 0) {
        const lowerQ = q.toLowerCase();
        for (let i = 1; i <= 1000; i++) {
          const body = getCelestialBody(i);
          if (body.name.toLowerCase().includes(lowerQ) || body.category.toLowerCase().includes(lowerQ)) {
            closeStarMap();
            this.loadLevel(body.level);
            return;
          }
        }
      }
    };

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') executeJump();
    });
    document.getElementById('jump-level-btn')?.addEventListener('click', executeJump);

    document.getElementById('next-level-win-btn')?.addEventListener('click', () => {
      if (this.currentLevel >= 1000) {
        this.loadLevel(1);
      } else {
        this.loadLevel(this.currentLevel + 1);
      }
    });
    document.getElementById('replay-level-win-btn')?.addEventListener('click', () => {
      this.loadLevel(this.currentLevel, true);
    });

    // Klicka bort vinstmodal och time-over modal via hörnkryss
    document.getElementById('close-win-modal-btn')?.addEventListener('click', () => {
      this.hideWinModal();
    });
    document.getElementById('close-time-over-modal-btn')?.addEventListener('click', () => {
      document.getElementById('time-over-modal')?.classList.add('hidden');
    });

    // Klicka bort modaler genom att klicka var som helst utanför kortet (på bakgrundsslöjan)
    const setupBackdropDismiss = (backdropId: string, onDismiss: () => void) => {
      const backdrop = document.getElementById(backdropId);
      backdrop?.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          onDismiss();
        }
      });
    };

    setupBackdropDismiss('win-modal', () => this.hideWinModal());
    setupBackdropDismiss('highscore-modal', () => this.closeLeaderboardModal());
    setupBackdropDismiss('level-modal', () => closeStarMap());
    setupBackdropDismiss('time-over-modal', () => {
      document.getElementById('time-over-modal')?.classList.add('hidden');
    });

    const guideModal = document.getElementById('guide-modal');
    const openGuideModal = () => {
      guideModal?.classList.remove('hidden');
    };
    const closeGuideModal = () => {
      guideModal?.classList.add('hidden');
    };
    document.getElementById('guide-btn')?.addEventListener('click', openGuideModal);
    document.getElementById('close-guide-modal')?.addEventListener('click', closeGuideModal);
    document.getElementById('guide-ok-btn')?.addEventListener('click', closeGuideModal);
    setupBackdropDismiss('guide-modal', closeGuideModal);

    // Klicka bort öppna modaler med Escape-tangenten
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const gModal = document.getElementById('guide-modal');
        if (gModal && !gModal.classList.contains('hidden')) {
          closeGuideModal();
          return;
        }
        const winModal = document.getElementById('win-modal');
        if (winModal && !winModal.classList.contains('hidden')) {
          this.hideWinModal();
          return;
        }
        const hsModal = document.getElementById('highscore-modal');
        if (hsModal && !hsModal.classList.contains('hidden')) {
          this.closeLeaderboardModal();
          return;
        }
        const lvlModal = document.getElementById('level-modal');
        if (lvlModal && !lvlModal.classList.contains('hidden')) {
          closeStarMap();
          return;
        }
        const toModal = document.getElementById('time-over-modal');
        if (toModal && !toModal.classList.contains('hidden')) {
          toModal.classList.add('hidden');
          return;
        }
      }
    });

    // Highscore & Topplista knappar
    document.getElementById('highscore-btn')?.addEventListener('click', () => {
      this.openLeaderboardModal();
    });

    document.getElementById('close-highscore-modal')?.addEventListener('click', () => {
      this.closeLeaderboardModal();
    });
    document.getElementById('close-highscore-btn')?.addEventListener('click', () => {
      this.closeLeaderboardModal();
    });

    document.getElementById('win-leaderboard-btn')?.addEventListener('click', () => {
      this.openLeaderboardModal();
    });

    // Sanitering av initialer: Strikt Max 3 tecken, automatiskt stora bokstäver (versaler)
    const winInitialsInput = document.getElementById('win-initials-input') as HTMLInputElement;
    const directInitialsInput = document.getElementById('direct-initials-input') as HTMLInputElement;

    const sanitizeInput = (input: HTMLInputElement | null) => {
      if (!input) return;
      input.addEventListener('input', () => {
        input.value = scoreManager.sanitizeInitials(input.value);
      });
    };
    sanitizeInput(winInitialsInput);
    sanitizeInput(directInitialsInput);

    // Spara highscore från vinstmodal
    const saveWinHighScore = () => {
      if (!winInitialsInput || winInitialsInput.disabled) return;
      const initials = winInitialsInput.value.trim() || 'AAA';
      const score = scoreManager.getScore();
      const res = scoreManager.saveHighScore(initials, score, this.currentLevel);

      if (res.saved) {
        sound.playHighScore();
        winInitialsInput.disabled = true;
        const saveBtn = document.getElementById('win-save-score-btn') as HTMLButtonElement;
        if (saveBtn) saveBtn.disabled = true;

        const rankEl = document.getElementById('win-saved-rank');
        if (rankEl) {
          if (res.levelRank !== -1 && res.allTimeRank !== -1) {
            rankEl.textContent = `#${res.levelRank} (Bana ${this.currentLevel} • ${this.currentCelestialBody.name}) & #${res.allTimeRank} All-Time High`;
          } else if (res.levelRank !== -1) {
            rankEl.textContent = `#${res.levelRank} på Bana ${this.currentLevel} • ${this.currentCelestialBody.name}`;
          } else if (res.allTimeRank !== -1) {
            rankEl.textContent = `#${res.allTimeRank} All-Time High`;
          } else {
            rankEl.textContent = `#${res.rank}`;
          }
        }

        const savedMsg = document.getElementById('win-score-saved-msg');
        savedMsg?.classList.remove('hidden');
      }
    };

    document.getElementById('win-save-score-btn')?.addEventListener('click', saveWinHighScore);
    winInitialsInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveWinHighScore();
    });

    // Spara direkt från topplistefönstret
    const saveDirectHighScore = () => {
      if (!directInitialsInput) return;
      const initials = directInitialsInput.value.trim() || 'AAA';
      const score = scoreManager.getScore();
      const res = scoreManager.saveHighScore(initials, score, this.currentLevel);

      if (res.saved) {
        sound.playHighScore();
        directInitialsInput.value = '';
        this.renderLeaderboard();
      }
    };

    document.getElementById('direct-save-score-btn')?.addEventListener('click', saveDirectHighScore);
    directInitialsInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveDirectHighScore();
    });

    // Topplista-flikar och nivåbläddrare
    document.getElementById('tab-level-lb')?.addEventListener('click', () => {
      this.leaderboardTab = 'level';
      this.renderLeaderboard();
    });
    document.getElementById('tab-alltime-lb')?.addEventListener('click', () => {
      this.leaderboardTab = 'alltime';
      this.renderLeaderboard();
    });
    document.getElementById('sync-highscores-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('sync-highscores-btn');
      if (btn) btn.textContent = '⏳ Hämtar...';
      scoreManager.migrateLegacyVaults();
      await scoreManager.syncWithCloud();
      this.leaderboardTab = 'alltime';
      this.renderLeaderboard();
      if (btn) {
        btn.textContent = '✓ Uppdaterat!';
        setTimeout(() => {
          btn.textContent = '🔄 Uppdatera topplista';
        }, 1500);
      }
    });
    document.getElementById('lb-prev-level')?.addEventListener('click', () => {
      if (this.leaderboardViewLevel > 1) {
        this.leaderboardViewLevel--;
        this.renderLeaderboard();
      }
    });
    document.getElementById('lb-next-level')?.addEventListener('click', () => {
      if (this.leaderboardViewLevel < 1000) {
        this.leaderboardViewLevel++;
        this.renderLeaderboard();
      }
    });

    // -------------------------------------------------------------
    // Spellägen (Klassisk, Dagens Bana, Tidspress, Zen)
    // -------------------------------------------------------------
    const modeClassicBtn = document.getElementById('mode-btn-classic');
    const modeDailyBtn = document.getElementById('mode-btn-daily');
    const modeTimeBtn = document.getElementById('mode-btn-time');
    const modeZenBtn = document.getElementById('mode-btn-zen');
    const timeAttackContainer = document.getElementById('time-attack-container');

    const setMode = (mode: GameMode) => {
      sound.initCtx();
      scoreManager.setGameMode(mode, this.totalInitialArrows);
      [modeClassicBtn, modeDailyBtn, modeTimeBtn, modeZenBtn].forEach((b) => b?.classList.remove('active'));
      if (mode === 'classic') modeClassicBtn?.classList.add('active');
      else if (mode === 'daily') modeDailyBtn?.classList.add('active');
      else if (mode === 'time_attack') modeTimeBtn?.classList.add('active');
      else if (mode === 'zen') modeZenBtn?.classList.add('active');

      if (mode === 'time_attack') {
        timeAttackContainer?.classList.remove('hidden');
      } else {
        timeAttackContainer?.classList.add('hidden');
      }

      if (mode === 'daily') {
        const dailyLvl = scoreManager.getDailyLevelNumber();
        this.loadLevel(dailyLvl, true);
        const clickX = window.innerWidth / 2;
        const clickY = window.innerHeight / 2;
        this.spawnScoreToast(`🌟 Dagens Bana: ${scoreManager.getTodayDateString()}`, clickX, clickY, 'combo-bonus');
      } else {
        this.loadLevel(this.currentLevel, true);
      }
    };

    modeClassicBtn?.addEventListener('click', () => setMode('classic'));
    modeDailyBtn?.addEventListener('click', () => setMode('daily'));
    modeTimeBtn?.addEventListener('click', () => setMode('time_attack'));
    modeZenBtn?.addEventListener('click', () => setMode('zen'));

    // Tidspress Game Over Modal
    document.getElementById('retry-time-attack-btn')?.addEventListener('click', () => {
      document.getElementById('time-over-modal')?.classList.add('hidden');
      setMode('time_attack');
    });
    document.getElementById('exit-time-attack-btn')?.addEventListener('click', () => {
      document.getElementById('time-over-modal')?.classList.add('hidden');
      setMode('classic');
    });
    document.getElementById('time-over-leaderboard-btn')?.addEventListener('click', () => {
      this.openLeaderboardModal();
    });
  }

  private onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    this.camera.aspect = aspect;

    // Dynamisk FOV-anpassning för mobiler och surfplattor i stående läge:
    // PerspectiveCamera har vertikal FOV (42°). Vid aspect < 1.0 krymper horisontell synvinkel,
    // vilket gör att kuben ser överdrivet inzoomad ut och klipps av i kanterna.
    // Vi kompenserar så att hela kuben alltid ryms med god marginal på alla skärmar:
    const baseFov = 42;
    if (aspect < 1.0) {
      const targetHalfWidth = Math.tan((baseFov * Math.PI) / 360);
      this.camera.fov = (2 * Math.atan(targetHalfWidth / aspect) * 180) / Math.PI;
    } else {
      this.camera.fov = baseFov;
    }

    this.camera.updateProjectionMatrix();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.webglRenderer.setPixelRatio(pixelRatio);
    this.composer.setPixelRatio(pixelRatio);
    this.webglRenderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
    this.updateBackgroundCover();
  }

  private updateBackgroundCover() {
    if (!this.backgroundTexture || !this.backgroundTexture.image) return;
    const img = this.backgroundTexture.image as HTMLImageElement;
    const imgW = img.width || 1024;
    const imgH = img.height || 325;
    const imageAspect = imgW / imgH;
    const screenAspect = window.innerWidth / window.innerHeight;

    this.backgroundTexture.matrixAutoUpdate = false;
    if (screenAspect < imageAspect) {
      // Skärmen är smalare än bilden: behåll full höjd och centrera horisontellt
      const sx = screenAspect / imageAspect;
      const tx = (1 - sx) * 0.5;
      this.backgroundTexture.matrix.set(
        sx, 0, tx,
        0, 1, 0,
        0, 0, 1
      );
    } else {
      // Skärmen är bredare än bilden: behåll full bredd och centrera vertikalt
      const sy = imageAspect / screenAspect;
      const ty = (1 - sy) * 0.5;
      this.backgroundTexture.matrix.set(
        1, 0, 0,
        0, sy, ty,
        0, 0, 1
      );
    }
  }

  private animate(now: number) {
    requestAnimationFrame(this.boundAnimate);

    const deltaSeconds = 0.016;
    const deltaMs = Math.min(now - this.lastAnimateTime, 100);
    this.lastAnimateTime = now;

    // Uppdatera combo-timer, Time Attack och HUD
    const updateRes = scoreManager.update(deltaMs);
    this.updateComboHUD();

    if (scoreManager.getGameMode() === 'time_attack') {
      const timerEl = document.getElementById('time-attack-timer');
      const timerContainer = document.getElementById('time-attack-container');
      if (timerEl) {
        timerEl.textContent = this.formatTimer(updateRes.secondsLeft);
      }
      if (timerContainer) {
        if (updateRes.secondsLeft <= 25) {
          timerContainer.classList.add('danger');
        } else {
          timerContainer.classList.remove('danger');
        }
      }
      if (updateRes.timeAttackOver) {
        const modal = document.getElementById('time-over-modal');
        const scoreEl = document.getElementById('time-over-total-score');
        if (scoreEl) scoreEl.textContent = scoreManager.getScore().toLocaleString('sv-SE');
        modal?.classList.remove('hidden');
      }
    }

    const time = now * 0.001;
    this.controller.update(time, deltaSeconds);

    // Uppdatera 3D-partiklar
    this.particleManager.update(deltaSeconds);

    // Uppdatera 3D-himlakropp i bakgrunden
    if (this.celestialSphere) {
      this.celestialSphere.update(deltaSeconds, this.cubeGroup.rotation.y, this.cubeGroup.rotation.x);
    }



    // Uppdatera skakande blockerade pilar
    if (this.shakingArrow) {
      const elapsed = now - this.shakingArrow.startTime;
      const duration = 280;
      if (elapsed < duration) {
        const progress = elapsed / duration;
        const decay = 1 - progress;
        const shakeAmp = 14 * decay;
        const shakeX = Math.sin(elapsed * 0.09) * shakeAmp;
        const shakeY = Math.cos(elapsed * 0.07) * shakeAmp * 0.5;

        this.shakingArrow.faces.forEach((f) => {
          this.renderFaceState(f, { x: shakeX, y: shakeY });
        });
      } else {
        const faces = this.shakingArrow.faces;
        this.shakingArrow = null;
        faces.forEach((f) => {
          this.renderFaceState(f, { x: 0, y: 0 });
        });
      }
    }

    // Uppdatera 3D-flygande pilar
    this.flyingManager.update(now, deltaMs);

    this.composer.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new CubeAwayGame();
});
