import { GameMode } from './types';

export interface HighScoreEntry {
  rank: number;
  initials: string;
  score: number;
  level: number;
  date: string;
  isPlayer?: boolean;
}

// Permanenta lagringsnycklar (Skyddade valv)
const LEVEL_VAULT_KEY = 'cubeaway_level_vault';
const ALLTIME_VAULT_KEY = 'cubeaway_alltime_vault';
const LEGACY_PLAYER_VAULT_KEY = 'cubeaway_player_vault';
const LEGACY_STORAGE_KEY = 'cubeaway_highscores';
const STARS_STORAGE_KEY = 'cubeaway_stars';

// Globala Cloudflare-backade HTTPS REST-endpoints för delad global highscore (CORS-godkända)
const CLOUD_ENDPOINTS = [
  'https://api.restful-api.dev/objects/ff808181a09d98f701a0d250ae200525',
  'https://api.restful-api.dev/objects/ff808181a09d98f701a0d2516e890526',
];

// 30 förvalda All-Time High arkadlegendarer fördelade över olika nivåer
const DEFAULT_ALLTIME_HIGHSCORES: Omit<HighScoreEntry, 'rank'>[] = [
  { initials: 'FB', score: 1106450, level: 24, date: '2026-09-21', isPlayer: true },
  { initials: 'ACE', score: 62450, level: 25, date: '2026-09-20' },
  { initials: 'NEO', score: 58900, level: 22, date: '2026-09-19' },
  { initials: 'CYB', score: 54200, level: 20, date: '2026-09-18' },
  { initials: 'TRX', score: 49800, level: 18, date: '2026-09-17' },
  { initials: 'FOX', score: 46150, level: 16, date: '2026-09-16' },
  { initials: 'ZAP', score: 42300, level: 15, date: '2026-09-15' },
  { initials: 'VAL', score: 39500, level: 14, date: '2026-09-14' },
  { initials: 'MAX', score: 36800, level: 13, date: '2026-09-13' },
  { initials: 'ARC', score: 35000, level: 12, date: '2026-09-12' },
  { initials: 'LIL', score: 31500, level: 11, date: '2026-09-11' },
  { initials: 'BEN', score: 29200, level: 10, date: '2026-09-10' },
  { initials: 'SKY', score: 26800, level: 9, date: '2026-09-09' },
  { initials: 'REX', score: 24500, level: 8, date: '2026-09-08' },
  { initials: 'KOR', score: 22400, level: 7, date: '2026-09-07' },
  { initials: 'VEX', score: 20500, level: 7, date: '2026-09-06' },
  { initials: 'RED', score: 18700, level: 6, date: '2026-09-05' },
  { initials: 'NEX', score: 17100, level: 6, date: '2026-09-04' },
  { initials: 'SAM', score: 15600, level: 5, date: '2026-09-03' },
  { initials: 'JAX', score: 14200, level: 5, date: '2026-09-02' },
  { initials: 'LUM', score: 12900, level: 4, date: '2026-09-01' },
  { initials: 'EON', score: 11700, level: 4, date: '2026-08-31' },
  { initials: 'ORB', score: 10600, level: 3, date: '2026-08-30' },
  { initials: 'ZEN', score: 9500, level: 3, date: '2026-08-29' },
  { initials: 'PIX', score: 8400, level: 2, date: '2026-08-28' },
  { initials: 'GLW', score: 7500, level: 2, date: '2026-08-27' },
  { initials: 'RAY', score: 6600, level: 2, date: '2026-08-26' },
  { initials: 'DOT', score: 5800, level: 1, date: '2026-08-25' },
  { initials: 'BLU', score: 5100, level: 1, date: '2026-08-24' },
  { initials: 'ION', score: 4400, level: 1, date: '2026-08-23' },
  { initials: 'BIT', score: 3800, level: 1, date: '2026-08-22' },
];

const BENCHMARK_NAMES = ['ACE', 'NEO', 'FOX', 'ZAP', 'MAX', 'LIL', 'BEN', 'SKY', 'RED', 'SAM'];

export class ScoreManager {
  // Poängen hålls strikt per nivå och nollas vid start av ny nivå
  private currentScore: number = 0;
  private comboStreak: number = 0;
  private comboTimerMs: number = 0;
  private readonly COMBO_WINDOW_MS: number = 2800; // 2.8 sekunder för att behålla combon
  private levelStartTime: number = performance.now();

  // Spellägen & Tidspress
  private gameMode: GameMode = 'classic';
  private timeAttackSecondsLeft: number = 60;
  private timeAttackActive: boolean = false;
  private maxComboInCurrentLevel: number = 0;

  private isSyncing: boolean = false;

  constructor() {
    this.migrateLegacyVaults();
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      setTimeout(() => {
        this.syncWithCloud().catch(() => {});
      }, 500);
    }
  }

  /**
   * Skyddar och återställer ALLA historiska användarrekord från samtliga lagringsnycklar på localhost.
   */
  public migrateLegacyVaults() {
    try {
      const keysToCheck = [
        LEGACY_STORAGE_KEY,           // 'cubeaway_highscores'
        'cubeaway_highscores_backup', // backup
        LEGACY_PLAYER_VAULT_KEY,      // 'cubeaway_player_vault'
        ALLTIME_VAULT_KEY,            // 'cubeaway_alltime_vault'
      ];

      const foundEntries: Omit<HighScoreEntry, 'rank'>[] = [];

      for (const key of keysToCheck) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((e) => {
              if (e && typeof e.score === 'number' && e.score > 0) {
                foundEntries.push({
                  initials: this.sanitizeInitials(e.initials) || 'FB',
                  score: Number(e.score),
                  level: Number(e.level) || 1,
                  date: e.date || new Date().toISOString().slice(0, 10),
                  isPlayer: true,
                });
              }
            });
          }
        } catch {}
      }

      // Kolla även om det fanns sparade poäng i cubeaway_current_score
      const currentScoreRaw = localStorage.getItem('cubeaway_current_score');
      if (currentScoreRaw) {
        const cScore = parseInt(currentScoreRaw, 10);
        if (!isNaN(cScore) && cScore > 1000) {
          const currentLvl = parseInt(localStorage.getItem('cubeaway_level') || '1', 10);
          foundEntries.push({
            initials: 'FB',
            score: cScore,
            level: currentLvl,
            date: new Date().toISOString().slice(0, 10),
            isPlayer: true,
          });
        }
      }

      // Säkerställ alltid spelarens rekord på 1 106 450 på nivå 24 från localhost-körningen
      foundEntries.push({
        initials: 'FB',
        score: 1106450,
        level: 24,
        date: '2026-09-21',
        isPlayer: true,
      });

      // Spara alla unika funna poster till valven
      foundEntries.forEach((entry) => {
        this.saveToAllTimeVault(entry);
        this.saveToLevelVault(entry.level, entry);
      });
    } catch {
      // Ignorera fel vid migrering
    }
  }

  public getGameMode(): GameMode {
    return this.gameMode;
  }

  /**
   * Beräknar en mänskligt anpassad, rättvis och generös starttid för Tidspress:
   * Grundtid (90 sekunder) + 2.5 sekunder per pil på banan!
   * T.ex. 247 pilar = 90 + (247 * 2.5) = 708 sekunder (~11.8 minuter).
   */
  public calculateInitialTimeAttackSeconds(totalArrows: number): number {
    const safeArrows = Math.max(10, totalArrows || 50);
    return Math.max(120, Math.round(90 + safeArrows * 2.5));
  }

  public setGameMode(mode: GameMode, totalArrows?: number) {
    this.gameMode = mode;
    if (mode === 'time_attack') {
      this.timeAttackSecondsLeft = this.calculateInitialTimeAttackSeconds(totalArrows || 50);
      this.timeAttackActive = true;
    } else {
      this.timeAttackActive = false;
    }
    this.resetCombo();
  }

  public getTimeAttackSecondsLeft(): number {
    return Math.max(0, Math.ceil(this.timeAttackSecondsLeft));
  }

  public isTimeAttackActive(): boolean {
    return this.timeAttackActive;
  }

  /**
   * Hämtar aktuell nivåpoäng (börjar alltid på 0 per nivå).
   */
  public getScore(): number {
    return this.currentScore;
  }

  public getLevelScore(): number {
    return this.currentScore;
  }

  public getComboStreak(): number {
    return this.comboStreak;
  }

  public getComboTimeLeftPct(): number {
    if (this.gameMode === 'zen') return 100;
    if (this.comboStreak <= 1 || this.comboTimerMs <= 0) return 0;
    return Math.max(0, Math.min(100, (this.comboTimerMs / this.COMBO_WINDOW_MS) * 100));
  }

  /**
   * Startar en nivå. Poängen nollställs ALLTID vid varje ny nivå eller omstart.
   */
  public startLevel(_isRestart: boolean = false, totalArrows?: number) {
    this.currentScore = 0;
    this.levelStartTime = performance.now();
    this.resetCombo();
    this.maxComboInCurrentLevel = 0;

    if (this.gameMode === 'time_attack') {
      this.timeAttackSecondsLeft = this.calculateInitialTimeAttackSeconds(totalArrows || 50);
      this.timeAttackActive = true;
    }
  }

  /**
   * Återställer poängen om spelaren hoppar bort eller startar om.
   */
  public rollbackUnfinishedLevel() {
    this.currentScore = 0;
    this.resetCombo();
  }

  /**
   * Uppdaterar combo-klockan och eventuell Time Attack-räknare.
   */
  public update(deltaMs: number): {
    comboExpired: boolean;
    currentCombo: number;
    timeAttackOver: boolean;
    secondsLeft: number;
  } {
    let comboExpired = false;
    let timeAttackOver = false;

    // Zen-läge har ingen tickande combotimer
    if (this.gameMode !== 'zen' && this.comboTimerMs > 0) {
      this.comboTimerMs -= deltaMs;
      if (this.comboTimerMs <= 0) {
        this.comboTimerMs = 0;
        if (this.comboStreak > 1) {
          comboExpired = true;
        }
        this.comboStreak = 0;
      }
    }

    if (this.gameMode === 'time_attack' && this.timeAttackActive) {
      this.timeAttackSecondsLeft -= deltaMs * 0.001;
      if (this.timeAttackSecondsLeft <= 0) {
        this.timeAttackSecondsLeft = 0;
        this.timeAttackActive = false;
        timeAttackOver = true;
      }
    }

    return {
      comboExpired,
      currentCombo: this.comboStreak,
      timeAttackOver,
      secondsLeft: Math.max(0, Math.ceil(this.timeAttackSecondsLeft)),
    };
  }

  /**
   * Lägger till poäng när en pil skickas iväg framgångsrikt.
   */
  public addArrowScore(cellCount: number, isLinked: boolean = false): {
    pointsAdded: number;
    multiplier: number;
    totalScore: number;
    timeBonusAdded: number;
  } {
    this.comboStreak++;
    this.maxComboInCurrentLevel = Math.max(this.maxComboInCurrentLevel, this.comboStreak);
    this.comboTimerMs = this.COMBO_WINDOW_MS;

    let timeBonusAdded = 0;
    if (this.gameMode === 'time_attack' && this.timeAttackActive) {
      // Generös tidsbonus per löst pil:
      // Bas: +3.0 sekunder. Långa pilar: +4.0 sekunder. Länkade par: +6.0 sekunder!
      let bonusSec = isLinked ? 6.0 : (cellCount >= 4 ? 4.0 : 3.0);

      // Extra bonus vid snabba combo-streaks
      if (this.comboStreak >= 8) bonusSec += 3.0;
      else if (this.comboStreak >= 5) bonusSec += 2.0;
      else if (this.comboStreak >= 3) bonusSec += 1.0;

      timeBonusAdded = bonusSec;
      // Inget artificiellt 120s-tak! Tillåt spelaren att bygga upp sin tidsbuffert
      this.timeAttackSecondsLeft = Math.min(3600, this.timeAttackSecondsLeft + bonusSec);
    }

    const multiplier = this.gameMode === 'zen' ? 1 : Math.min(this.comboStreak, 10);
    const basePoints = 100 + cellCount * 25;
    const pointsAdded = basePoints * multiplier;

    this.currentScore += pointsAdded;

    return {
      pointsAdded,
      multiplier,
      totalScore: this.currentScore,
      timeBonusAdded,
    };
  }

  /**
   * Blockerad pil klickades.
   */
  public onBlockedArrow(): { penalty: number; totalScore: number } {
    this.comboStreak = 0;
    this.comboTimerMs = 0;

    // Zen-läge: Inget poängavdrag
    const penalty = this.gameMode === 'zen' ? 0 : 50;

    // I Tidspress rinner tiden redan iväg medan man letar och combon nollställs.
    // Inget extra tidsavdrag dras från klockan så att spelaren inte drabbas av panik.

    this.currentScore = Math.max(0, this.currentScore - penalty);

    return {
      penalty,
      totalScore: this.currentScore,
    };
  }

  // ==========================================
  // STJÄRNSYSTEM (1-3 Stjärnor)
  // ==========================================

  public getLevelStars(level: number): number {
    try {
      const raw = localStorage.getItem(STARS_STORAGE_KEY);
      if (raw) {
        const map = JSON.parse(raw);
        return Number(map[level]) || 0;
      }
    } catch {}
    return 0;
  }

  public saveLevelStars(level: number, stars: number): { isNewRecord: boolean; stars: number } {
    const current = this.getLevelStars(level);
    const newBest = Math.max(current, Math.min(3, Math.max(1, stars)));
    try {
      const raw = localStorage.getItem(STARS_STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[level] = newBest;
      localStorage.setItem(STARS_STORAGE_KEY, JSON.stringify(map));
    } catch {}
    return { isNewRecord: newBest > current, stars: newBest };
  }

  public calculateStars(blockedClicks: number): number {
    if (blockedClicks === 0 || this.maxComboInCurrentLevel >= 5) {
      return 3;
    }
    if (blockedClicks <= 2) {
      return 2;
    }
    return 1;
  }

  /**
   * Beräknar och lägger till vinstbonus när en hel kub är rensad.
   */
  public addLevelWinBonus(level: number): {
    baseBonus: number;
    speedBonus: number;
    totalBonus: number;
    totalScore: number;
  } {
    const elapsedSeconds = Math.max(1, (performance.now() - this.levelStartTime) / 1000);
    const baseBonus = 1500 + level * 250;

    // Snabbhetsbonus: max 3000 poäng, avtar ju längre tid det tar
    const targetSeconds = Math.max(30, 120 - level * 2);
    const speedRatio = Math.max(0, (targetSeconds - elapsedSeconds) / targetSeconds);
    const speedBonus = Math.floor(speedRatio * 2500);

    const totalBonus = baseBonus + speedBonus;
    this.currentScore += totalBonus;

    return {
      baseBonus,
      speedBonus,
      totalBonus,
      totalScore: this.currentScore,
    };
  }

  public resetCombo() {
    this.comboStreak = 0;
    this.comboTimerMs = 0;
  }

  public resetScore() {
    this.currentScore = 0;
    this.resetCombo();
  }

  // =========================================================================
  // 1. NIVÅBASERADE TOPPLISTOR (TOPP 10 PER NIVÅ)
  // =========================================================================

  private getPlayerLevelVault(): Record<number, Omit<HighScoreEntry, 'rank'>[]> {
    try {
      const raw = localStorage.getItem(LEVEL_VAULT_KEY);
      if (raw) {
        return JSON.parse(raw) || {};
      }
    } catch {}
    return {};
  }

  private saveToLevelVault(level: number, entry: Omit<HighScoreEntry, 'rank'>) {
    try {
      const vault = this.getPlayerLevelVault();
      if (!vault[level]) vault[level] = [];
      const exists = vault[level].some(
        (v) => v.initials === entry.initials && v.score === entry.score
      );
      if (!exists) {
        vault[level].push(entry);
        localStorage.setItem(LEVEL_VAULT_KEY, JSON.stringify(vault));
      }
    } catch {}
  }

  /**
   * Genererar standard-benchmarks för en specifik nivå om det finns färre än 10 spelarrekord.
   */
  private generateDefaultLevelEntries(level: number): Omit<HighScoreEntry, 'rank'>[] {
    const baseScore = 3200 + level * 1400;
    return BENCHMARK_NAMES.map((initials, index) => {
      const score = Math.round(baseScore * (1 - index * 0.075));
      return {
        initials,
        score,
        level,
        date: '2026-09-15',
        isPlayer: false,
      };
    });
  }

  /**
   * Hämtar Topp 10 för en specifik nivå.
   * Spelarens poster i valvet har ALLTID företräde.
   */
  public getLevelLeaderboard(level: number): HighScoreEntry[] {
    const vault = this.getPlayerLevelVault();
    const playerEntries = vault[level] || [];

    const map = new Map<string, Omit<HighScoreEntry, 'rank'>>();
    playerEntries.forEach((e) => {
      const key = `${e.initials}_${e.score}_${e.date}`;
      map.set(key, { ...e, isPlayer: true });
    });

    // Fyll på med förvalsrekord för nivån om färre än 10
    const defaults = this.generateDefaultLevelEntries(level);
    defaults.forEach((e) => {
      const key = `${e.initials}_${e.score}`;
      if (!map.has(key)) {
        map.set(key, e);
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => b.score - a.score);

    return list.slice(0, 10).map((entry, idx) => ({
      rank: idx + 1,
      ...entry,
    }));
  }

  public isLevelHighScore(level: number, score: number): boolean {
    if (score <= 0) return false;
    const top10 = this.getLevelLeaderboard(level);
    if (top10.length < 10) return true;
    return score > top10[top10.length - 1].score;
  }

  // =========================================================================
  // 2. ALL-TIME HIGH (TOPP 30 FÖR SPELET SOM HELHET MED NIVÅANGIVELSE)
  // =========================================================================

  private getPlayerAllTimeVault(): Omit<HighScoreEntry, 'rank'>[] {
    try {
      const raw = localStorage.getItem(ALLTIME_VAULT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((e) => ({
            initials: this.sanitizeInitials(e.initials),
            score: Number(e.score) || 0,
            level: Number(e.level) || 1,
            date: e.date || new Date().toISOString().slice(0, 10),
            isPlayer: true,
          }));
        }
      }
    } catch {}
    return [];
  }

  private saveToAllTimeVault(entry: Omit<HighScoreEntry, 'rank'>) {
    try {
      const vault = this.getPlayerAllTimeVault();
      const exists = vault.some(
        (v) => v.initials === entry.initials && v.score === entry.score && v.level === entry.level
      );
      if (!exists) {
        vault.push(entry);
        localStorage.setItem(ALLTIME_VAULT_KEY, JSON.stringify(vault));
      }
      // Synkronisera även till de klassiska nycklarna så att inget försvinner
      try {
        localStorage.setItem(LEGACY_PLAYER_VAULT_KEY, JSON.stringify(vault));
        localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(vault));
      } catch {}
    } catch {}
  }

  /**
   * Hämtar den globala All-Time High Topp 30-listan.
   * Spelarens poster har företräde och kan ALDRIG skrivas över.
   */
  public getAllTimeLeaderboard(): HighScoreEntry[] {
    const playerEntries = this.getPlayerAllTimeVault();

    const map = new Map<string, Omit<HighScoreEntry, 'rank'>>();
    playerEntries.forEach((e) => {
      const key = `${e.initials}_${e.score}_${e.level}_${e.date}`;
      map.set(key, { ...e, isPlayer: true });
    });

    // Fyll på med förvalsrekord upp till 30
    DEFAULT_ALLTIME_HIGHSCORES.forEach((e) => {
      const key = `${e.initials}_${e.score}_${e.level}`;
      if (!map.has(key)) {
        map.set(key, { ...e, isPlayer: e.isPlayer ?? false });
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => b.score - a.score);

    return list.slice(0, 30).map((entry, idx) => ({
      rank: idx + 1,
      ...entry,
    }));
  }

  public isAllTimeHighScore(score: number): boolean {
    if (score <= 0) return false;
    const top30 = this.getAllTimeLeaderboard();
    if (top30.length < 30) return true;
    return score > top30[top30.length - 1].score;
  }

  /**
   * Bakåtkompatibel metod: kollar antingen specifik nivå eller global All-Time High.
   */
  public isHighScore(score: number, level?: number): boolean {
    if (level !== undefined) {
      return this.isLevelHighScore(level, score);
    }
    return this.isAllTimeHighScore(score);
  }

  /**
   * Bakåtkompatibel getLeaderboard - returnerar All-Time High Topp 30 som standard.
   */
  public getLeaderboard(): HighScoreEntry[] {
    return this.getAllTimeLeaderboard();
  }

  // =========================================================================
  // 3. GLOBAL MOLNSYNRONISERING (DELAS MELLAN ALLA SPELARE ÖVER HTTPS)
  // =========================================================================

  /**
   * Synkroniserar lokala valv med den globala molndatabasen (Cloudflare CORS REST).
   * Hämtar nya resultat från andra spelare och sparar lokala framsteg globalt.
   */
  public async syncWithCloud(): Promise<boolean> {
    if (this.isSyncing) return false;
    this.isSyncing = true;

    try {
      for (const url of CLOUD_ENDPOINTS) {
        try {
          const resp = await fetch(url, {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          });
          if (!resp.ok) continue;

          const json = await resp.json();
          const cloudData = json && json.data ? json.data : null;

          if (cloudData) {
            // 1. Merga globala All-Time High till lokalt valv
            if (Array.isArray(cloudData.alltime)) {
              cloudData.alltime.forEach((e: any) => {
                if (e && e.initials && typeof e.score === 'number' && e.score > 0) {
                  this.saveToAllTimeVault({
                    initials: this.sanitizeInitials(e.initials),
                    score: Number(e.score),
                    level: Number(e.level) || 1,
                    date: e.date || new Date().toISOString().slice(0, 10),
                    isPlayer: true,
                  });
                }
              });
            }

            // 2. Merga globala nivårekord till lokalt nivåvalv
            if (cloudData.levels && typeof cloudData.levels === 'object') {
              for (const [lvlKey, entries] of Object.entries(cloudData.levels)) {
                const lvl = parseInt(lvlKey, 10);
                if (!isNaN(lvl) && Array.isArray(entries)) {
                  entries.forEach((e: any) => {
                    if (e && e.initials && typeof e.score === 'number' && e.score > 0) {
                      this.saveToLevelVault(lvl, {
                        initials: this.sanitizeInitials(e.initials),
                        score: Number(e.score),
                        level: lvl,
                        date: e.date || new Date().toISOString().slice(0, 10),
                        isPlayer: true,
                      });
                    }
                  });
                }
              }
            }
          }

          // Hämta hela det kombinerade lokala valvet och pusha uppdateringen till molnet
          const localAllTime = this.getPlayerAllTimeVault();
          const localLevels = this.getPlayerLevelVault();

          await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'CubeAway_Global_Leaderboard',
              data: {
                alltime: localAllTime,
                levels: localLevels,
              },
            }),
          });

          this.isSyncing = false;
          return true;
        } catch (err) {
          console.warn('Varning: Kunde inte ansluta till moln-endpoint', url, err);
        }
      }
    } finally {
      this.isSyncing = false;
    }
    return false;
  }

  // =========================================================================
  // 4. REGISTRERING OCH SPARANDE AV RESULTAT
  // =========================================================================

  /**
   * Sparar spelarens resultat i både nivåns Topp 10 och All-Time High Topp 30 om det kvalificerar sig.
   * GARANTI: Spelas alltid permanent in i säkra valv och skickas till det globala molnet.
   */
  public saveHighScore(
    initials: string,
    score: number,
    level: number
  ): {
    saved: boolean;
    rank: number;
    levelRank: number;
    allTimeRank: number;
  } {
    const cleanInitials = this.sanitizeInitials(initials) || 'AAA';
    const today = new Date().toISOString().slice(0, 10);

    const entry: Omit<HighScoreEntry, 'rank'> = {
      initials: cleanInitials,
      score,
      level,
      date: today,
      isPlayer: true,
    };

    // 1. Spara i Nivå-valvet
    this.saveToLevelVault(level, entry);

    // 2. Spara i All-Time High-valvet
    this.saveToAllTimeVault(entry);

    // 3. Synkronisera omedelbart med globala molnet i bakgrunden
    if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      this.syncWithCloud().catch(() => {});
    }

    // 4. Beräkna rangordning
    const levelList = this.getLevelLeaderboard(level);
    const levelIdx = levelList.findIndex(
      (e) => e.initials === cleanInitials && e.score === score && e.isPlayer
    );
    const levelRank = levelIdx !== -1 ? levelIdx + 1 : -1;

    const allTimeList = this.getAllTimeLeaderboard();
    const allTimeIdx = allTimeList.findIndex(
      (e) => e.initials === cleanInitials && e.score === score && e.level === level && e.isPlayer
    );
    const allTimeRank = allTimeIdx !== -1 ? allTimeIdx + 1 : -1;

    return {
      saved: levelRank !== -1 || allTimeRank !== -1,
      rank: levelRank !== -1 ? levelRank : allTimeRank,
      levelRank,
      allTimeRank,
    };
  }

  /**
   * Strikt sanitering: Max 3 tecken, automatiskt stora bokstäver (versaler).
   */
  public sanitizeInitials(raw: string): string {
    if (!raw) return 'AAA';
    return raw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9ÅÄÖ]/g, '')
      .slice(0, 3);
  }
}

export const scoreManager = new ScoreManager();
