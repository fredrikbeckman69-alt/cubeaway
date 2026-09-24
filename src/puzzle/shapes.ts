import * as THREE from 'three';

export type ShapeType =
  | 'cube'
  | 'crystal'
  | 'podium'
  | 'pyramid'
  | 'prism'
  | 'obelisk'
  | 'monolith';

export interface ShapeDefinition {
  type: ShapeType;
  name: string;
  description: string;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  topScale?: number;
  bottomScale?: number;
  cameraDistance: number;
}

export const SHAPE_DEFINITIONS: Record<ShapeType, ShapeDefinition> = {
  cube: {
    type: 'cube',
    name: 'Klassisk Kub',
    description: 'Den ikoniska balanserade kuben',
    sizeX: 3.8,
    sizeY: 3.8,
    sizeZ: 3.8,
    cameraDistance: 5.8,
  },
  crystal: {
    type: 'crystal',
    name: 'Diamant-Kristall',
    description: 'En dubbel-avfasad skimrande rymdjuvel',
    sizeX: 3.8,
    sizeY: 3.8,
    sizeZ: 3.8,
    topScale: 0.82,
    bottomScale: 0.82,
    cameraDistance: 5.8,
  },
  podium: {
    type: 'podium',
    name: 'Kosmisk Plattform',
    description: 'En vidsträckt svävande kommandobrygga',
    sizeX: 4.1,
    sizeY: 3.5,
    sizeZ: 4.1,
    topScale: 0.88,
    cameraDistance: 5.8,
  },
  pyramid: {
    type: 'pyramid',
    name: 'Trunkerad Pyramid',
    description: 'Ett forntida-futuristiskt tempel med avfasad topp',
    sizeX: 3.9,
    sizeY: 3.6,
    sizeZ: 3.9,
    topScale: 0.80,
    cameraDistance: 5.8,
  },
  prism: {
    type: 'prism',
    name: 'Rymdkapsel',
    description: 'En horisontellt facetterad rymdkapsel',
    sizeX: 4.2,
    sizeY: 3.5,
    sizeZ: 3.5,
    topScale: 0.88,
    bottomScale: 0.88,
    cameraDistance: 5.9,
  },
  obelisk: {
    type: 'obelisk',
    name: 'Kosmisk Obelisk',
    description: 'Ett elegant avsmalnande cyber-monument',
    sizeX: 3.5,
    sizeY: 4.2,
    sizeZ: 3.5,
    topScale: 0.82,
    cameraDistance: 6.0,
  },
  monolith: {
    type: 'monolith',
    name: 'Cyber-Monolit',
    description: 'Ett resligt och ståtligt rymdtorn',
    sizeX: 3.4,
    sizeY: 4.3,
    sizeZ: 3.4,
    cameraDistance: 6.0,
  },
};

export const SHAPE_ROTATION: ShapeType[] = [
  'cube',
  'crystal',
  'podium',
  'pyramid',
  'prism',
  'obelisk',
  'monolith',
];

export function getLevelShape(level: number): ShapeDefinition {
  const safeLevel = Math.max(1, Math.floor(level));
  const index = (safeLevel - 1) % SHAPE_ROTATION.length;
  const type = SHAPE_ROTATION[index];
  return SHAPE_DEFINITIONS[type];
}

export function createShapeGeometry(shape: ShapeDefinition): THREE.BufferGeometry {
  const { sizeX, sizeY, sizeZ, topScale = 1.0, bottomScale = 1.0 } = shape;
  const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ, 1, 1, 1);
  const pos = geo.attributes.position;
  const halfY = sizeY / 2;

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let scale = 1.0;
    if (y > halfY - 0.001) {
      scale = topScale;
    } else if (y < -halfY + 0.001) {
      scale = bottomScale;
    }

    pos.setX(i, pos.getX(i) * scale);
    pos.setZ(i, pos.getZ(i) * scale);
  }

  geo.computeVertexNormals();
  pos.needsUpdate = true;
  return geo;
}
