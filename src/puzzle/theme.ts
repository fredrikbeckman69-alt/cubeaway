export interface LevelTheme {
  name: string;
  // Kubens mörka stilrena obsidianyta (ger maximal kontrast mot pilarna)
  cubeCore: string;
  cubeMid: string;
  cubeEdge: string;
  gridLine: string;
  cubeRim: string;

  // Pilarnas starka, lysande neonglöd
  arrowBase: string;
  arrowGlow: string;
  arrowCore: string;
  flyingArrowColor: number;

  // Ljussättning & markglöd
  pointLightColor: number;
  dirLight1Color: number;
  dirLight2Color: number;
  shadowGlowR: number;
  shadowGlowG: number;
  shadowGlowB: number;

  // UI-accenter
  accentGradient: string;
  isWhiteTheme?: boolean;
}

interface BaseThemeDef {
  name: string;
  cubeCore: string;
  cubeMid: string;
  cubeEdge: string;
  cubeRim: string;
  arrowBase: string;
  arrowGlow: string;
  arrowCore: string;
  flyingArrowHex: string;
  pointLightHex: string;
  dirLight1Hex: string;
  dirLight2Hex: string;
  shadowRGB: [number, number, number];
  accentGradient: string;
  isWhiteTheme?: boolean;
}

/**
 * 12 kuraterade teman med mörk, elegant obsidiankropp och intensiva neon-pilar
 * för absolut maximal kontrast och kristallklar läsbarhet utan bländning!
 */
const BASE_THEMES: BaseThemeDef[] = [
  // 1. Nivå 1: Termisk Rosa & Magenta (Mörk obsidian med bländande magentapilar)
  {
    name: 'Termisk Rosa & Magenta',
    cubeCore: '#220417',
    cubeMid: '#15020e',
    cubeEdge: '#090106',
    cubeRim: '#ff00aa',
    arrowBase: '#ff00d4',
    arrowGlow: '#ff00aa',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ff00d4',
    pointLightHex: '#ff00aa',
    dirLight1Hex: '#ff33aa',
    dirLight2Hex: '#660033',
    shadowRGB: [255, 0, 170],
    accentGradient: 'linear-gradient(90deg, #ff00aa, #ff00d4)',
  },
  // 2. Nivå 2: Cyberpunk Indigo & Neon Cyan (Mörk kosmisk indigo med cyan-laser)
  {
    name: 'Cyberpunk Indigo & Neon Cyan',
    cubeCore: '#080d22',
    cubeMid: '#050716',
    cubeEdge: '#02030b',
    cubeRim: '#00f5ff',
    arrowBase: '#00f5ff',
    arrowGlow: '#00ccff',
    arrowCore: '#ffffff',
    flyingArrowHex: '#00f5ff',
    pointLightHex: '#3b82f6',
    dirLight1Hex: '#60a5fa',
    dirLight2Hex: '#1e1b4b',
    shadowRGB: [0, 245, 255],
    accentGradient: 'linear-gradient(90deg, #3b82f6, #00f5ff)',
  },
  // 3. Nivå 3: Solstorm Amber & Solguld (Mörk kol-amber med brinnande guldpilar)
  {
    name: 'Solstorm Amber & Solguld',
    cubeCore: '#241002',
    cubeMid: '#160901',
    cubeEdge: '#090300',
    cubeRim: '#ff9900',
    arrowBase: '#ffd000',
    arrowGlow: '#ff9900',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ffd000',
    pointLightHex: '#f97316',
    dirLight1Hex: '#fb923c',
    dirLight2Hex: '#7c2d12',
    shadowRGB: [255, 170, 0],
    accentGradient: 'linear-gradient(90deg, #ea580c, #ffd000)',
  },
  // 4. Nivå 4: Stjärnglans & Diamantvit (Vita Pilar ⚪) - Mörk obsidian med kristallvita pilar
  {
    name: 'Stjärnglans & Diamantvit (Vita Pilar ⚪)',
    cubeCore: '#0c0d18',
    cubeMid: '#070810',
    cubeEdge: '#020306',
    cubeRim: '#ffffff',
    arrowBase: '#ffffff',
    arrowGlow: '#e0f2fe',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ffffff',
    pointLightHex: '#ffffff',
    dirLight1Hex: '#f8fafc',
    dirLight2Hex: '#1e293b',
    shadowRGB: [255, 255, 255],
    accentGradient: 'linear-gradient(90deg, #94a3b8, #ffffff)',
    isWhiteTheme: true,
  },
  // 5. Nivå 5: Smaragdenergi & Neon Mint (Mörk skogs-obsidian med elektrisk mint)
  {
    name: 'Smaragdenergi & Neon Mint',
    cubeCore: '#021e13',
    cubeMid: '#01130c',
    cubeEdge: '#000805',
    cubeRim: '#00ff88',
    arrowBase: '#00ff88',
    arrowGlow: '#00cc66',
    arrowCore: '#ffffff',
    flyingArrowHex: '#00ff88',
    pointLightHex: '#10b981',
    dirLight1Hex: '#34d399',
    dirLight2Hex: '#064e3b',
    shadowRGB: [0, 255, 136],
    accentGradient: 'linear-gradient(90deg, #059669, #00ff88)',
  },
  // 6. Nivå 6: Kryo Safir & Neon Korall (Mörk djupblå med het korallorange)
  {
    name: 'Kryo Safir & Neon Korall',
    cubeCore: '#031726',
    cubeMid: '#010e19',
    cubeEdge: '#00060d',
    cubeRim: '#ff4d00',
    arrowBase: '#ff4d00',
    arrowGlow: '#ff3300',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ff4d00',
    pointLightHex: '#0284c7',
    dirLight1Hex: '#38bdf8',
    dirLight2Hex: '#082f49',
    shadowRGB: [255, 77, 0],
    accentGradient: 'linear-gradient(90deg, #0284c7, #ff4d00)',
  },
  // 7. Nivå 7: Plasma Nebula & Neon Pink (Mörk nebula-lila med laserrosa)
  {
    name: 'Plasma Nebula & Neon Pink',
    cubeCore: '#1b0529',
    cubeMid: '#11031a',
    cubeEdge: '#08010d',
    cubeRim: '#ff00aa',
    arrowBase: '#ff00bb',
    arrowGlow: '#ff0088',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ff00bb',
    pointLightHex: '#9333ea',
    dirLight1Hex: '#c084fc',
    dirLight2Hex: '#3b0764',
    shadowRGB: [255, 0, 187],
    accentGradient: 'linear-gradient(90deg, #9333ea, #ff00bb)',
  },
  // 8. Nivå 8: Kosmisk Frost & Vit Laser (Vita Pilar ⚪) - Midnattsblå obsidian med strålande vita laserpilar
  {
    name: 'Kosmisk Frost & Vit Laser (Vita Pilar ⚪)',
    cubeCore: '#050d1c',
    cubeMid: '#020610',
    cubeEdge: '#010206',
    cubeRim: '#ffffff',
    arrowBase: '#ffffff',
    arrowGlow: '#bae6fd',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ffffff',
    pointLightHex: '#ffffff',
    dirLight1Hex: '#e0f2fe',
    dirLight2Hex: '#0c4a6e',
    shadowRGB: [255, 255, 255],
    accentGradient: 'linear-gradient(90deg, #38bdf8, #ffffff)',
    isWhiteTheme: true,
  },
  // 9. Nivå 9: Vulkan Rubin & Elektrisk Turkos (Mörk rubin-obsidian med is-turkos)
  {
    name: 'Vulkan Rubin & Elektrisk Turkos',
    cubeCore: '#28040b',
    cubeMid: '#180206',
    cubeEdge: '#0c0103',
    cubeRim: '#00ffee',
    arrowBase: '#00ffee',
    arrowGlow: '#00cccc',
    arrowCore: '#ffffff',
    flyingArrowHex: '#00ffee',
    pointLightHex: '#e11d48',
    dirLight1Hex: '#fb7185',
    dirLight2Hex: '#4c0519',
    shadowRGB: [0, 255, 238],
    accentGradient: 'linear-gradient(90deg, #e11d48, #00ffee)',
  },
  // 10. Nivå 10: Radioaktiv Lime & Ultra Violet (Mörk giftbasalt med neonlila)
  {
    name: 'Radioaktiv Lime & Ultra Violet',
    cubeCore: '#131f03',
    cubeMid: '#0c1402',
    cubeEdge: '#050800',
    cubeRim: '#d000ff',
    arrowBase: '#d000ff',
    arrowGlow: '#aa00ff',
    arrowCore: '#ffffff',
    flyingArrowHex: '#d000ff',
    pointLightHex: '#84cc16',
    dirLight1Hex: '#a3e635',
    dirLight2Hex: '#365314',
    shadowRGB: [208, 0, 255],
    accentGradient: 'linear-gradient(90deg, #65a30d, #d000ff)',
  },
  // 11. Nivå 11: Aqua Lagoon & Neon Orange (Mörk djuphavsnatt med solnedgångs-orange)
  {
    name: 'Aqua Lagoon & Neon Orange',
    cubeCore: '#021e1c',
    cubeMid: '#011312',
    cubeEdge: '#000807',
    cubeRim: '#ff6600',
    arrowBase: '#ff6600',
    arrowGlow: '#ff5500',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ff6600',
    pointLightHex: '#0d9488',
    dirLight1Hex: '#2dd4bf',
    dirLight2Hex: '#134e4a',
    shadowRGB: [255, 102, 0],
    accentGradient: 'linear-gradient(90deg, #0d9488, #ff6600)',
  },
  // 12. Nivå 12: Obsidian & Vit Kristall (Vita Pilar ⚪) - Sotsvart obsidian med rent snövita pilar
  {
    name: 'Obsidian & Vit Kristall (Vita Pilar ⚪)',
    cubeCore: '#101014',
    cubeMid: '#08080a',
    cubeEdge: '#020203',
    cubeRim: '#ffffff',
    arrowBase: '#ffffff',
    arrowGlow: '#f1f5f9',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ffffff',
    pointLightHex: '#ffffff',
    dirLight1Hex: '#ffffff',
    dirLight2Hex: '#334155',
    shadowRGB: [255, 255, 255],
    accentGradient: 'linear-gradient(90deg, #cbd5e1, #ffffff)',
    isWhiteTheme: true,
  },
  // 13. Nivå 13: Obsidian Guld & Bärnstenslåga (Kolsvart obsidian med gnistrande guld)
  {
    name: 'Obsidian Guld & Bärnstenslåga',
    cubeCore: '#171406',
    cubeMid: '#0f0c03',
    cubeEdge: '#060501',
    cubeRim: '#ffcc00',
    arrowBase: '#ffcc00',
    arrowGlow: '#ffaa00',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ffcc00',
    pointLightHex: '#d97706',
    dirLight1Hex: '#fbbf24',
    dirLight2Hex: '#451a03',
    shadowRGB: [255, 204, 0],
    accentGradient: 'linear-gradient(90deg, #b45309, #ffcc00)',
  },
  // 14. Nivå 14: Elektro-Blå & Neon Lime (Mörk rymdkobolt med chockgrön lime)
  {
    name: 'Elektro-Blå & Neon Lime',
    cubeCore: '#04122b',
    cubeMid: '#020a1a',
    cubeEdge: '#01040d',
    cubeRim: '#00ff44',
    arrowBase: '#00ff44',
    arrowGlow: '#00cc33',
    arrowCore: '#ffffff',
    flyingArrowHex: '#00ff44',
    pointLightHex: '#2563eb',
    dirLight1Hex: '#60a5fa',
    dirLight2Hex: '#1e3a8a',
    shadowRGB: [0, 255, 68],
    accentGradient: 'linear-gradient(90deg, #2563eb, #00ff44)',
  },
  // 15. Nivå 15: Magma Basalt & Molten Lava (Kolsotad lavabasalt med flytande orange eld)
  {
    name: 'Magma Basalt & Molten Lava',
    cubeCore: '#240502',
    cubeMid: '#160301',
    cubeEdge: '#080100',
    cubeRim: '#ff3700',
    arrowBase: '#ff4400',
    arrowGlow: '#ff2200',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ff4400',
    pointLightHex: '#dc2626',
    dirLight1Hex: '#ef4444',
    dirLight2Hex: '#450a0a',
    shadowRGB: [255, 68, 0],
    accentGradient: 'linear-gradient(90deg, #dc2626, #ff4400)',
  },
  // 16. Nivå 16: Supernova & Snövit (Vita Pilar ⚪) - Kosmisk nebulosa med lysande supernova-vita pilar
  {
    name: 'Supernova & Snövit (Vita Pilar ⚪)',
    cubeCore: '#16081c',
    cubeMid: '#0e0412',
    cubeEdge: '#050107',
    cubeRim: '#ffffff',
    arrowBase: '#ffffff',
    arrowGlow: '#fae8ff',
    arrowCore: '#ffffff',
    flyingArrowHex: '#ffffff',
    pointLightHex: '#ffffff',
    dirLight1Hex: '#faf5ff',
    dirLight2Hex: '#4a044e',
    shadowRGB: [255, 255, 255],
    accentGradient: 'linear-gradient(90deg, #e879f9, #ffffff)',
    isWhiteTheme: true,
  },
];

function shiftHexHue(hex: string, deltaHue: number): string {
  if (deltaHue === 0) return hex;
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) / 255;
  let g = ((num >> 8) & 255) / 255;
  let b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  h = (((h * 360 + deltaHue) % 360) + 360) % 360 / 360;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  r = hue2rgb(p, q, h + 1 / 3);
  g = hue2rgb(p, q, h);
  b = hue2rgb(p, q, h - 1 / 3);

  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const num = parseInt(hex.replace('#', ''), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

/**
 * Returnerar ett komplett färgtema med mörk, stilren obsidianyta och knivskarpa neonpilar.
 * Garanterar optimal kontrast och noll bländning över alla 1000 nivåer.
 */
export function getLevelTheme(levelNumber: number): LevelTheme {
  const lvl = Math.max(1, Math.min(1000, Math.floor(levelNumber)));
  const totalBase = BASE_THEMES.length;
  const baseIdx = (lvl - 1) % totalBase;
  const cycle = Math.floor((lvl - 1) / totalBase);
  const deltaHue = (cycle * 29) % 360;

  const base = BASE_THEMES[baseIdx];

  // Om detta är ett tema med vita pilar bevarar vi ren kristallvit färg för pilar och ljus
  if (base.isWhiteTheme) {
    const cubeCore = shiftHexHue(base.cubeCore, deltaHue);
    const cubeMid = shiftHexHue(base.cubeMid, deltaHue);
    const cubeEdge = shiftHexHue(base.cubeEdge, deltaHue);
    const cubeRim = '#ffffff';

    const themeName =
      cycle === 0 ? base.name : `${base.name} (Fas ${cycle + 1})`;

    return {
      name: themeName,
      cubeCore,
      cubeMid,
      cubeEdge,
      gridLine: 'rgba(255, 255, 255, 0.18)',
      cubeRim,
      arrowBase: '#ffffff',
      arrowGlow: base.arrowGlow,
      arrowCore: '#ffffff',
      flyingArrowColor: 0xffffff,
      pointLightColor: 0xffffff,
      dirLight1Color: hexToNumber(base.dirLight1Hex),
      dirLight2Color: hexToNumber(shiftHexHue(base.dirLight2Hex, deltaHue)),
      shadowGlowR: 255,
      shadowGlowG: 255,
      shadowGlowB: 255,
      accentGradient: base.accentGradient,
      isWhiteTheme: true,
    };
  }

  const cubeCore = shiftHexHue(base.cubeCore, deltaHue);
  const cubeMid = shiftHexHue(base.cubeMid, deltaHue);
  const cubeEdge = shiftHexHue(base.cubeEdge, deltaHue);
  const cubeRim = shiftHexHue(base.cubeRim, deltaHue);

  const arrowBase = shiftHexHue(base.arrowBase, deltaHue);
  const arrowGlow = shiftHexHue(base.arrowGlow, deltaHue);
  const flyingArrowHex = shiftHexHue(base.flyingArrowHex, deltaHue);

  const pointLightHex = shiftHexHue(base.pointLightHex, deltaHue);
  const dirLight1Hex = shiftHexHue(base.dirLight1Hex, deltaHue);
  const dirLight2Hex = shiftHexHue(base.dirLight2Hex, deltaHue);

  const [cr, cg, cb] = hexToRgb(cubeRim);
  const shadowRGB = hexToRgb(arrowBase);

  const themeName =
    cycle === 0 ? base.name : `${base.name} (Fas ${cycle + 1})`;

  return {
    name: themeName,
    cubeCore,
    cubeMid,
    cubeEdge,
    gridLine: `rgba(${cr}, ${cg}, ${cb}, 0.12)`,
    cubeRim,
    arrowBase,
    arrowGlow,
    arrowCore: base.arrowCore,
    flyingArrowColor: hexToNumber(flyingArrowHex),
    pointLightColor: hexToNumber(pointLightHex),
    dirLight1Color: hexToNumber(dirLight1Hex),
    dirLight2Color: hexToNumber(dirLight2Hex),
    shadowGlowR: shadowRGB[0],
    shadowGlowG: shadowRGB[1],
    shadowGlowB: shadowRGB[2],
    accentGradient: `linear-gradient(90deg, ${pointLightHex}, ${arrowBase})`,
  };
}
