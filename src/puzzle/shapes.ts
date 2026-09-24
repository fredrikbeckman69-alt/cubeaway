import * as THREE from 'three';

export type ShapeType =
  | 'cube'
  | 'sphere'
  | 'star'
  | 'gem'
  | 'pillow'
  | 'truncated';

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
  sphere: {
    type: 'sphere',
    name: 'Cyber-Sfäroid',
    description: 'Ett organiskt rundat högteknologiskt klot',
    cameraDistance: 6.0,
  },
  star: {
    type: 'star',
    name: 'Stjärnkristall',
    description: 'En konkav hyperkub med inåtbuktande fasetter',
    cameraDistance: 6.0,
  },
  gem: {
    type: 'gem',
    name: 'Facetterad Juvel',
    description: 'En diamantslipad polyeder med avfasade hörn',
    cameraDistance: 6.0,
  },
  pillow: {
    type: 'pillow',
    name: 'Konvex Lins-Kub',
    description: 'En mjukt välvd aerodynamisk kuddeform',
    cameraDistance: 6.0,
  },
  truncated: {
    type: 'truncated',
    name: 'Trunkerad Polyeder',
    description: 'En mångfacetterad 3D-kristall med avfasade kanter',
    cameraDistance: 6.0,
  },
};

export const SHAPE_ROTATION: ShapeType[] = [
  'cube',
  'sphere',
  'star',
  'gem',
  'pillow',
  'truncated',
];

export function getLevelShape(level: number): ShapeDefinition {
  const safeLevel = Math.max(1, Math.floor(level));
  const index = (safeLevel - 1) % SHAPE_ROTATION.length;
  const type = SHAPE_ROTATION[index];
  return SHAPE_DEFINITIONS[type];
}

export function deformVertex(v: THREE.Vector3, shapeType: ShapeType): THREE.Vector3 {
  const p = v.clone();
  const half = CUBE_BASE_SIZE / 2;

  if (shapeType === 'sphere') {
    // Spherified cube: smooth radial expansion (orb / sphere)
    const r = half * 1.15;
    const sphereP = p.clone().normalize().multiplyScalar(r);
    p.lerp(sphereP, 0.42);
  } else if (shapeType === 'star') {
    // Concave star cube: face centers curve inward
    const dCenter = 1.0 - (Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z)) / (half * 3);
    const factor = 1.0 - 0.16 * Math.pow(Math.max(0, dCenter), 1.5);
    p.multiplyScalar(factor);
  } else if (shapeType === 'gem') {
    // Chamfered diamond: corners sliced off
    const cx = Math.abs(p.x) / half;
    const cy = Math.abs(p.y) / half;
    const cz = Math.abs(p.z) / half;
    if (cx > 0.72 && cy > 0.72 && cz > 0.72) {
      p.multiplyScalar(0.92);
    }
  } else if (shapeType === 'pillow') {
    // Convex pillow cube: smooth barrel curvature
    const dEdgeX = 1 - Math.pow(Math.abs(p.x) / half, 2);
    const dEdgeY = 1 - Math.pow(Math.abs(p.y) / half, 2);
    const dEdgeZ = 1 - Math.pow(Math.abs(p.z) / half, 2);
    p.x += Math.sign(p.x) * dEdgeY * dEdgeZ * 0.18;
    p.y += Math.sign(p.y) * dEdgeX * dEdgeZ * 0.18;
    p.z += Math.sign(p.z) * dEdgeX * dEdgeY * 0.18;
  } else if (shapeType === 'truncated') {
    // Multi-faceted beveled edges and corners
    const dist = Math.hypot(p.x, p.y, p.z);
    if (dist > half * 1.25) {
      p.multiplyScalar((half * 1.25) / dist);
    }
  }

  return p;
}

export function createShapeGeometry(shape: ShapeDefinition): THREE.BufferGeometry {
  const segments = shape.type === 'cube' ? 1 : 8;
  const geo = new THREE.BoxGeometry(
    CUBE_BASE_SIZE,
    CUBE_BASE_SIZE,
    CUBE_BASE_SIZE,
    segments,
    segments,
    segments
  );

  if (shape.type !== 'cube') {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const def = deformVertex(v, shape.type);
      pos.setXYZ(i, def.x, def.y, def.z);
    }
    pos.needsUpdate = true;
  }

  geo.computeVertexNormals();
  return geo;
}
