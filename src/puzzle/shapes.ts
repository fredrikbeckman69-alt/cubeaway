import * as THREE from 'three';

export type ShapeType =
  | 'cube'
  | 'monolith'
  | 'platform'
  | 'pyramid'
  | 'beam'
  | 'crystal'
  | 'pylon';

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
    cameraDistance: 6.0,
  },
  monolith: {
    type: 'monolith',
    name: 'Kosmisk Monolit',
    description: 'Ett ståtligt resande torn med vertikal elegans',
    sizeX: 2.6,
    sizeY: 5.4,
    sizeZ: 2.6,
    cameraDistance: 7.2,
  },
  platform: {
    type: 'platform',
    name: 'Rymdplattform',
    description: 'En vidsträckt svävande högteknologisk platta',
    sizeX: 5.2,
    sizeY: 1.8,
    sizeZ: 5.2,
    cameraDistance: 6.8,
  },
  pyramid: {
    type: 'pyramid',
    name: 'Trunkerad Pyramid',
    description: 'Ett forntida-futuristiskt tempel med avfasad topp',
    sizeX: 4.4,
    sizeY: 3.6,
    sizeZ: 4.4,
    topScale: 0.55,
    cameraDistance: 6.5,
  },
  beam: {
    type: 'beam',
    name: 'Transportbalk',
    description: 'En långsträckt industriell fraktcontainer',
    sizeX: 5.4,
    sizeY: 2.8,
    sizeZ: 2.8,
    cameraDistance: 7.0,
  },
  crystal: {
    type: 'crystal',
    name: 'Diamant-Kristall',
    description: 'En dubbel-avfasad skimrande rymdjuvel',
    sizeX: 4.2,
    sizeY: 4.2,
    sizeZ: 4.2,
    topScale: 0.65,
    bottomScale: 0.65,
    cameraDistance: 6.4,
  },
  pylon: {
    type: 'pylon',
    name: 'Kosmisk Pylon',
    description: 'En hög avsmalnande cyber-spira',
    sizeX: 2.6,
    sizeY: 5.6,
    sizeZ: 2.6,
    topScale: 0.6,
    cameraDistance: 7.4,
  },
};

export const SHAPE_ROTATION: ShapeType[] = [
  'cube',
  'monolith',
  'platform',
  'pyramid',
  'beam',
  'crystal',
  'pylon',
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
