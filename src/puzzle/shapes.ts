import * as THREE from 'three';

export type ShapeType =
  | 'cube'
  | 'pyramid'
  | 'platform'
  | 'crystal'
  | 'pylon'
  | 'capsule'
  | 'monolith';

export interface ShapeDefinition {
  type: ShapeType;
  name: string;
  description: string;
  cameraDistance: number;
}

export const CUBE_BASE_SIZE = 3.8;

export const SHAPE_DEFINITIONS: Record<ShapeType, ShapeDefinition> = {
  cube: {
    type: 'cube',
    name: 'Klassisk Kub',
    description: 'Den ikoniska balanserade kuben',
    cameraDistance: 6.0,
  },
  pyramid: {
    type: 'pyramid',
    name: 'Trunkerad Maya-Pyramid',
    description: 'Ett forntida-futuristiskt tempel med avfasade steg',
    cameraDistance: 6.2,
  },
  platform: {
    type: 'platform',
    name: 'Kosmisk Rymdplattform',
    description: 'En vidsträckt svävande kommandoplattform',
    cameraDistance: 6.2,
  },
  crystal: {
    type: 'crystal',
    name: 'Diamant-Kristall',
    description: 'En dubbel-avfasad skimrande rymdjuvel',
    cameraDistance: 6.3,
  },
  pylon: {
    type: 'pylon',
    name: 'Kosmisk Pylon-Array',
    description: 'En array av fyra resliga cyber-spiror',
    cameraDistance: 6.3,
  },
  capsule: {
    type: 'capsule',
    name: 'Orbital Kapsel',
    description: 'En futuristisk satellit med roterande gyroringar',
    cameraDistance: 6.2,
  },
  monolith: {
    type: 'monolith',
    name: 'Cyber-Monolit',
    description: 'Ett massivt högteknologiskt kraftmonument',
    cameraDistance: 6.2,
  },
};

export const SHAPE_ROTATION: ShapeType[] = [
  'cube',
  'pyramid',
  'platform',
  'crystal',
  'pylon',
  'capsule',
  'monolith',
];

export function getLevelShape(level: number): ShapeDefinition {
  const safeLevel = Math.max(1, Math.floor(level));
  const index = (safeLevel - 1) % SHAPE_ROTATION.length;
  const type = SHAPE_ROTATION[index];
  return SHAPE_DEFINITIONS[type];
}

/**
 * Skapar kubens spelyta. Alltid en perfekt 1:1:1 kub så att alla pilbanor och
 * rutnätsceller förblir exakt kvadratiska och aldrig blir hoptryckta eller förvrängda!
 */
export function createShapeGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(CUBE_BASE_SIZE, CUBE_BASE_SIZE, CUBE_BASE_SIZE, 1, 1, 1);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Skapar distinkta 3D-arkitektoniska tillbehör och geometriska strukturer som
 * omger kuben för varje specifik nivåform utan att skymma eller trycka ihop pilarna.
 */
export function createShapeAccessories(shape: ShapeDefinition, themeHex: number): THREE.Group {
  const group = new THREE.Group();
  const half = CUBE_BASE_SIZE / 2; // 1.9

  // Mörkt obsidian-material för strukturen
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c14,
    roughness: 0.35,
    metalness: 0.8,
  });

  // Neonglödande material som matchar nivåns färgtema
  const glowMat = new THREE.MeshBasicMaterial({
    color: themeHex,
  });

  // Hjälpfunktion för att inaktivera raycasting på dekorativa element
  const disableRaycast = (obj: THREE.Object3D) => {
    obj.raycast = () => {};
    obj.traverse((child) => {
      child.raycast = () => {};
    });
  };

  switch (shape.type) {
    case 'pyramid': {
      // Maya-stegpyramid / Ziggurat som sockel under kuben
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.36, 4.7), darkMat);
      t1.position.y = -half - 0.22;
      const t1Rim = new THREE.Mesh(new THREE.BoxGeometry(4.76, 0.06, 4.76), glowMat);
      t1Rim.position.y = -half - 0.05;

      const t2 = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.40, 5.6), darkMat);
      t2.position.y = -half - 0.58;
      const t2Rim = new THREE.Mesh(new THREE.BoxGeometry(5.66, 0.06, 5.66), glowMat);
      t2Rim.position.y = -half - 0.39;

      group.add(t1, t1Rim, t2, t2Rim);
      break;
    }

    case 'platform': {
      // Svävande åttakantig rymdplattform med neonlyktor och stödben
      const platformGeo = new THREE.CylinderGeometry(3.6, 3.8, 0.4, 8);
      const plat = new THREE.Mesh(platformGeo, darkMat);
      plat.position.y = -half - 0.24;

      const ringGeo = new THREE.TorusGeometry(3.65, 0.05, 8, 32);
      const ring = new THREE.Mesh(ringGeo, glowMat);
      ring.position.y = -half - 0.05;
      ring.rotation.x = Math.PI / 2;

      // 4 hörnlyktor/pyloner
      const d = 2.45;
      const corners = [[-d, -d], [d, -d], [-d, d], [d, d]];
      for (const [cx, cz] of corners) {
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.6, 0.24), glowMat);
        beacon.position.set(cx, -half - 0.15, cz);
        group.add(beacon);
      }

      group.add(plat, ring);
      break;
    }

    case 'crystal': {
      // Diamant-apex i topp och botten som ger hela silhuetten en magnifik oktaedrisk juvelform
      const apexGeo = new THREE.ConeGeometry(2.5, 1.3, 4);
      const topApex = new THREE.Mesh(apexGeo, darkMat);
      topApex.position.y = half + 0.65;
      topApex.rotation.y = Math.PI / 4;

      const botApex = new THREE.Mesh(apexGeo, darkMat);
      botApex.position.y = -half - 0.65;
      botApex.rotation.y = Math.PI / 4;
      botApex.rotation.x = Math.PI;

      // Neonglödande spetsar
      const tipGeo = new THREE.OctahedronGeometry(0.35);
      const topTip = new THREE.Mesh(tipGeo, glowMat);
      topTip.position.y = half + 1.35;
      const botTip = new THREE.Mesh(tipGeo, glowMat);
      botTip.position.y = -half - 1.35;

      group.add(topApex, botApex, topTip, botTip);
      break;
    }

    case 'pylon': {
      // 4 resliga cyber-spiror vid kubens hörn med glödande linjer
      const pylonDist = 2.15;
      const pylonPositions = [
        [-pylonDist, -pylonDist],
        [pylonDist, -pylonDist],
        [-pylonDist, pylonDist],
        [pylonDist, pylonDist],
      ];

      for (const [px, pz] of pylonPositions) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.34, 5.2, 0.34), darkMat);
        pylon.position.set(px, 0, pz);

        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 4), glowMat);
        tip.position.set(px, 2.95, pz);
        tip.rotation.y = Math.PI / 4;

        const bottomTip = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 4), glowMat);
        bottomTip.position.set(px, -2.95, pz);
        bottomTip.rotation.y = Math.PI / 4;
        bottomTip.rotation.x = Math.PI;

        group.add(pylon, tip, bottomTip);
      }
      break;
    }

    case 'capsule': {
      // Två glödande gyroskopiska tech-ringar som cirklar runt kuben
      const ringGeo1 = new THREE.TorusGeometry(3.05, 0.07, 8, 48);
      const ring1 = new THREE.Mesh(ringGeo1, glowMat);
      ring1.rotation.x = Math.PI / 2;

      const ringGeo2 = new THREE.TorusGeometry(3.18, 0.07, 8, 48);
      const ring2 = new THREE.Mesh(ringGeo2, darkMat);
      ring2.rotation.x = Math.PI / 4;
      ring2.rotation.y = Math.PI / 4;

      const ring2Glow = new THREE.Mesh(new THREE.TorusGeometry(3.22, 0.03, 8, 48), glowMat);
      ring2Glow.rotation.x = Math.PI / 4;
      ring2Glow.rotation.y = Math.PI / 4;

      group.add(ring1, ring2, ring2Glow);
      break;
    }

    case 'monolith': {
      // Industriella fästen och kraftskenor i topp och botten
      const capGeo = new THREE.BoxGeometry(4.15, 0.32, 4.15);
      const capTop = new THREE.Mesh(capGeo, darkMat);
      capTop.position.y = half + 0.16;

      const capBot = new THREE.Mesh(capGeo, darkMat);
      capBot.position.y = -half - 0.16;

      const railGeo = new THREE.BoxGeometry(0.12, 4.1, 0.12);
      const edge = half + 0.08;
      const railCoords = [
        [-edge, -edge],
        [edge, -edge],
        [-edge, edge],
        [edge, edge],
      ];

      for (const [rx, rz] of railCoords) {
        const rail = new THREE.Mesh(railGeo, glowMat);
        rail.position.set(rx, 0, rz);
        group.add(rail);
      }

      group.add(capTop, capBot);
      break;
    }

    case 'cube':
    default:
      // Klassisk ren kub utan tillbehör
      break;
  }

  disableRaycast(group);
  return group;
}
