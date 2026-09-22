import * as THREE from 'three';
import { Arrow, DIR_DELTA } from '../puzzle/types';

interface TrackPoint {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
}

interface SlitheringArrowInstance {
  group: THREE.Group;
  outerMesh: THREE.Mesh;
  coreMesh: THREE.Mesh;
  outerGeo: THREE.BufferGeometry;
  coreGeo: THREE.BufferGeometry;
  waypoints: TrackPoint[];
  totalTrackLength: number;
  arrowLength: number;
  dTailExit: number;
  headLength: number;
  wingWidth: number;
  stemWidth: number;
  stemThickness: number;
  startTime: number;
  duration: number;
}

export class FlyingArrowManager {
  private parentGroup: THREE.Group;
  private slitheringArrows: SlitheringArrowInstance[] = [];

  constructor(parentGroup: THREE.Group) {
    this.parentGroup = parentGroup;
  }

  public getFaceVectors(faceIdx: number): {
    normal: THREE.Vector3;
    tangentU: THREE.Vector3;
    tangentV: THREE.Vector3;
  } {
    switch (faceIdx) {
      case 0: // +X (Right)
        return {
          normal: new THREE.Vector3(1, 0, 0),
          tangentU: new THREE.Vector3(0, 0, -1),
          tangentV: new THREE.Vector3(0, 1, 0),
        };
      case 1: // -X (Left)
        return {
          normal: new THREE.Vector3(-1, 0, 0),
          tangentU: new THREE.Vector3(0, 0, 1),
          tangentV: new THREE.Vector3(0, 1, 0),
        };
      case 2: // +Y (Top)
        return {
          normal: new THREE.Vector3(0, 1, 0),
          tangentU: new THREE.Vector3(1, 0, 0),
          tangentV: new THREE.Vector3(0, 0, -1),
        };
      case 3: // -Y (Bottom)
        return {
          normal: new THREE.Vector3(0, -1, 0),
          tangentU: new THREE.Vector3(1, 0, 0),
          tangentV: new THREE.Vector3(0, 0, 1),
        };
      case 4: // +Z (Front)
        return {
          normal: new THREE.Vector3(0, 0, 1),
          tangentU: new THREE.Vector3(1, 0, 0),
          tangentV: new THREE.Vector3(0, 1, 0),
        };
      case 5: // -Z (Back)
      default:
        return {
          normal: new THREE.Vector3(0, 0, -1),
          tangentU: new THREE.Vector3(-1, 0, 0),
          tangentV: new THREE.Vector3(0, 1, 0),
        };
    }
  }

  public coordToLocal3D(
    faceIdx: number,
    coordOrR: { r: number; c: number } | number,
    cOrGridSize: number,
    gridSizeOrCubeSize?: number,
    maybeCubeSize?: number
  ): THREE.Vector3 {
    let r: number;
    let c: number;
    let gridSize: number;
    let cubeSize: number;

    if (typeof coordOrR === 'object') {
      r = coordOrR.r;
      c = coordOrR.c;
      gridSize = cOrGridSize;
      cubeSize = gridSizeOrCubeSize!;
    } else {
      r = coordOrR;
      c = cOrGridSize;
      gridSize = gridSizeOrCubeSize!;
      cubeSize = maybeCubeSize!;
    }

    const half = cubeSize / 2;
    const u = (c + 0.5) / gridSize;
    const v = 1 - (r + 0.5) / gridSize;
    const nx = (u - 0.5) * cubeSize;
    const ny = (v - 0.5) * cubeSize;

    switch (faceIdx) {
      case 0: // +X
        return new THREE.Vector3(half, ny, -nx);
      case 1: // -X
        return new THREE.Vector3(-half, ny, nx);
      case 2: // +Y
        return new THREE.Vector3(nx, half, -ny);
      case 3: // -Y
        return new THREE.Vector3(nx, -half, ny);
      case 4: // +Z
        return new THREE.Vector3(nx, ny, half);
      case 5: // -Z
      default:
        return new THREE.Vector3(-nx, ny, -half);
    }
  }

  private getFaceFixedAxis(
    faceIdx: number,
    cubeSize: number
  ): { axis: 'x' | 'y' | 'z'; val: number } {
    const half = cubeSize / 2;
    switch (faceIdx) {
      case 0:
        return { axis: 'x', val: half };
      case 1:
        return { axis: 'x', val: -half };
      case 2:
        return { axis: 'y', val: half };
      case 3:
        return { axis: 'y', val: -half };
      case 4:
        return { axis: 'z', val: half };
      case 5:
      default:
        return { axis: 'z', val: -half };
    }
  }

  private getCornerEdgePoint(
    pA: THREE.Vector3,
    faceA: number,
    pB: THREE.Vector3,
    faceB: number,
    cubeSize: number
  ): THREE.Vector3 {
    const fixA = this.getFaceFixedAxis(faceA, cubeSize);
    const fixB = this.getFaceFixedAxis(faceB, cubeSize);
    const pEdge = new THREE.Vector3();
    pEdge[fixA.axis] = fixA.val;
    pEdge[fixB.axis] = fixB.val;

    const allAxes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
    const thirdAxis = allAxes.find((ax) => ax !== fixA.axis && ax !== fixB.axis)!;
    pEdge[thirdAxis] = (pA[thirdAxis] + pB[thirdAxis]) * 0.5;
    return pEdge;
  }

  private sampleTrack(
    waypoints: TrackPoint[],
    d: number
  ): {
    pos: THREE.Vector3;
    normal: THREE.Vector3;
    tangent: THREE.Vector3;
    binormal: THREE.Vector3;
  } {
    const total = waypoints[waypoints.length - 1].dist;
    const clampedD = Math.max(0, Math.min(total, d));

    let low = 0;
    let high = waypoints.length - 1;
    while (low < high - 1) {
      const mid = (low + high) >> 1;
      if (waypoints[mid].dist <= clampedD) low = mid;
      else high = mid;
    }

    const pA = waypoints[low];
    const pB = waypoints[high];
    const segLen = pB.dist - pA.dist;
    const alpha = segLen > 0.00001 ? (clampedD - pA.dist) / segLen : 0;

    const pos = pA.pos.clone().lerp(pB.pos, alpha);
    const normal = pA.normal.clone().lerp(pB.normal, alpha).normalize();

    let tangent = pB.pos.clone().sub(pA.pos);
    if (tangent.lengthSq() < 0.000001) {
      tangent = new THREE.Vector3(1, 0, 0);
    } else {
      tangent.normalize();
    }

    let binormal = normal.clone().cross(tangent);
    if (binormal.lengthSq() < 0.000001) {
      let alt = new THREE.Vector3(0, 1, 0);
      if (Math.abs(normal.dot(alt)) > 0.9) alt = new THREE.Vector3(1, 0, 0);
      binormal = normal.clone().cross(alt).normalize();
    } else {
      binormal.normalize();
    }

    return { pos, normal, tangent, binormal };
  }

  private buildTrackWaypoints(
    arrow: Arrow,
    gridSize: number,
    cubeSize: number
  ): { waypoints: TrackPoint[]; headCenterDist: number; dTailExit: number; flyDir: THREE.Vector3 } {
    const cellSize = cubeSize / gridSize;
    const elevation = 0.024;
    const filletRadius = cellSize * 0.32;

    const rawPoints: Array<{ pos: THREE.Vector3; normal: THREE.Vector3; isExitPt?: boolean }> = [];
    const cells = arrow.cells;

    // 1. Bygg råpunkter för varje cell och kantövergång mellan kubsidor
    interface CellPt {
      pos: THREE.Vector3;
      normal: THREE.Vector3;
      faceIdx: number;
      isCornerTransition?: boolean;
    }

    const cellPath: CellPt[] = [];

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const norm = this.getFaceVectors(c.faceIdx).normal;
      const pos = this.coordToLocal3D(c.faceIdx, c.r, c.c, gridSize, cubeSize).addScaledVector(
        norm,
        elevation
      );

      if (i > 0 && cells[i - 1].faceIdx !== c.faceIdx) {
        // Korsar kant mellan två olika kubsidor
        const prevC = cells[i - 1];
        const prevNorm = this.getFaceVectors(prevC.faceIdx).normal;
        const prevPosRaw = this.coordToLocal3D(prevC.faceIdx, prevC.r, prevC.c, gridSize, cubeSize);
        const curPosRaw = this.coordToLocal3D(c.faceIdx, c.r, c.c, gridSize, cubeSize);

        const pEdge = this.getCornerEdgePoint(prevPosRaw, prevC.faceIdx, curPosRaw, c.faceIdx, cubeSize);
        const pEdgeA = pEdge.clone().addScaledVector(prevNorm, elevation);
        const blendNorm = prevNorm.clone().add(norm).normalize();
        const pCorner = pEdge.clone().addScaledVector(blendNorm, elevation * 1.15);
        const pEdgeB = pEdge.clone().addScaledVector(norm, elevation);

        cellPath.push({ pos: pEdgeA, normal: prevNorm, faceIdx: prevC.faceIdx, isCornerTransition: true });
        cellPath.push({ pos: pCorner, normal: blendNorm, faceIdx: -1, isCornerTransition: true });
        cellPath.push({ pos: pEdgeB, normal: norm, faceIdx: c.faceIdx, isCornerTransition: true });
      }

      cellPath.push({ pos, normal: norm, faceIdx: c.faceIdx });
    }

    // 2. Lägg till punkter från huvudet framåt mot kanten av sidan
    const headCell = cells[cells.length - 1];
    const headFace = headCell.faceIdx;
    const headVecs = this.getFaceVectors(headFace);
    const headNormal = headVecs.normal;
    const { dr, dc } = DIR_DELTA[arrow.dir];

    let du = 0;
    let dv = 0;
    if (arrow.dir === 'UP') dv = 1;
    else if (arrow.dir === 'DOWN') dv = -1;
    else if (arrow.dir === 'LEFT') du = -1;
    else if (arrow.dir === 'RIGHT') du = 1;

    const flyDir = headVecs.tangentU
      .clone()
      .multiplyScalar(du)
      .addScaledVector(headVecs.tangentV, dv)
      .normalize();

    let currR = headCell.r + dr;
    let currC = headCell.c + dc;
    let lastR = headCell.r;
    let lastC = headCell.c;

    while (currR >= 0 && currR < gridSize && currC >= 0 && currC < gridSize) {
      const pRay = this.coordToLocal3D(headFace, currR, currC, gridSize, cubeSize).addScaledVector(
        headNormal,
        elevation
      );
      cellPath.push({ pos: pRay, normal: headNormal, faceIdx: headFace });
      lastR = currR;
      lastC = currC;
      currR += dr;
      currC += dc;
    }

    // Exakt kantpunkt där pilen lämnar kubsidan
    const exitR =
      arrow.dir === 'UP' ? -0.5 : arrow.dir === 'DOWN' ? gridSize - 0.5 : lastR;
    const exitC =
      arrow.dir === 'LEFT' ? -0.5 : arrow.dir === 'RIGHT' ? gridSize - 0.5 : lastC;

    const pExit = this.coordToLocal3D(headFace, exitR, exitC, gridSize, cubeSize).addScaledVector(
      headNormal,
      elevation
    );
    cellPath.push({ pos: pExit, normal: headNormal, faceIdx: headFace });

    // 3. Applicera mjuk filleting (rundade hörn) för alla svängar på samma kubsida
    for (let i = 0; i < cellPath.length; i++) {
      const cur = cellPath[i];
      const isExit = i === cellPath.length - 1;

      if (
        i > 0 &&
        i < cellPath.length - 1 &&
        !cur.isCornerTransition &&
        !cellPath[i - 1].isCornerTransition &&
        !cellPath[i + 1].isCornerTransition &&
        cellPath[i - 1].faceIdx === cur.faceIdx &&
        cellPath[i + 1].faceIdx === cur.faceIdx
      ) {
        const prev = cellPath[i - 1];
        const next = cellPath[i + 1];

        const vIn = cur.pos.clone().sub(prev.pos);
        const vOut = next.pos.clone().sub(cur.pos);
        const lenIn = vIn.length();
        const lenOut = vOut.length();

        if (lenIn > 0.001 && lenOut > 0.001) {
          vIn.normalize();
          vOut.normalize();
          const dot = vIn.dot(vOut);

          // Om riktningen svänger (~90 grader)
          if (dot < 0.7) {
            const r = Math.min(filletRadius, lenIn * 0.45, lenOut * 0.45);
            const pEnter = cur.pos.clone().addScaledVector(vIn, -r);
            const bisect = vIn.clone().negate().add(vOut).normalize();
            const pMid = cur.pos.clone().addScaledVector(bisect, r * 0.414);
            const pExitPt = cur.pos.clone().addScaledVector(vOut, r);

            rawPoints.push({ pos: pEnter, normal: cur.normal });
            rawPoints.push({ pos: pMid, normal: cur.normal });
            rawPoints.push({ pos: pExitPt, normal: cur.normal });
            continue;
          }
        }
      }

      rawPoints.push({ pos: cur.pos, normal: cur.normal, isExitPt: isExit });
    }

    // 4. Lägg till 3D-rymspunkter ut från kuben (rakt ut i flyDir, lagom långt så pilen passerar skärmkanten)
    const spaceSteps = [1.0, 2.5, 5.0, 8.0, 11.5];
    for (const dist of spaceSteps) {
      const pSpace = pExit.clone().addScaledVector(flyDir, dist);
      rawPoints.push({ pos: pSpace, normal: headNormal });
    }

    // 5. Bygg waypoints med ackumulerad distans och hitta exakt dTailExit
    const waypoints: TrackPoint[] = [];
    let cumDist = 0;
    let dTailExit = 0;

    for (let i = 0; i < rawPoints.length; i++) {
      if (i > 0) {
        const d = rawPoints[i].pos.distanceTo(rawPoints[i - 1].pos);
        if (d < 0.0005) continue;
        cumDist += d;
      }
      waypoints.push({
        pos: rawPoints[i].pos,
        normal: rawPoints[i].normal,
        dist: cumDist,
      });

      if (rawPoints[i].isExitPt) {
        dTailExit = cumDist;
      }
    }

    if (dTailExit === 0) {
      // Fallback
      dTailExit = cumDist * 0.35;
    }

    // Hitta avståndet där huvudet var initialt
    const headInitialPos = this.coordToLocal3D(
      headCell.faceIdx,
      headCell.r,
      headCell.c,
      gridSize,
      cubeSize
    ).addScaledVector(headNormal, elevation);

    let headCenterDist = 0;
    let minDist = Infinity;
    for (const wp of waypoints) {
      const d = wp.pos.distanceTo(headInitialPos);
      if (d < minDist) {
        minDist = d;
        headCenterDist = wp.dist;
      }
    }

    return { waypoints, headCenterDist, dTailExit, flyDir };
  }

  public spawnFlyingArrow(
    arrow: Arrow,
    gridSize: number,
    cubeSize: number,
    colorHex: number = 0xff00ea
  ) {
    const cellSize = cubeSize / gridSize;
    const stemWidth = cellSize * 0.28;
    const stemThickness = cellSize * 0.14;
    const headLength = cellSize * 0.48;
    const wingWidth = cellSize * 0.36;

    const { waypoints, headCenterDist, dTailExit } = this.buildTrackWaypoints(
      arrow,
      gridSize,
      cubeSize
    );

    const totalTrackLength = waypoints[waypoints.length - 1].dist;
    const arrowLength = headCenterDist + headLength;

    // Skapa Three.js nät för både glödande yttre skal och vitglödgad energikärna
    const outerGeo = new THREE.BufferGeometry();
    const coreGeo = new THREE.BufferGeometry();

    const outerMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });

    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);

    const group = new THREE.Group();
    group.add(outerMesh);
    group.add(coreMesh);
    this.parentGroup.add(group);

    const instance: SlitheringArrowInstance = {
      group,
      outerMesh,
      coreMesh,
      outerGeo,
      coreGeo,
      waypoints,
      totalTrackLength,
      arrowLength,
      dTailExit,
      headLength,
      wingWidth,
      stemWidth,
      stemThickness,
      startTime: performance.now(),
      // 1.55s till 1.9s för avslappnad, tydlig medelfart så att man hinner se pilen veckla ut sig i detalj
      duration: Math.round(1550 + Math.min(450, arrow.cells.length * 24)),
    };

    // Bygg första framen direkt
    this.buildGeometryForInstance(instance, 0);

    this.slitheringArrows.push(instance);
  }

  private buildGeometryForInstance(instance: SlitheringArrowInstance, t: number) {
    // Tvåfas-hastighetsprofil för tydlig medelfart och synlig utsträckning/veckling:
    // Fas 1: 0.0 -> 0.58 (ca 0.9–1.0s av animationen)
    // Pilens rörelse över kubytan sker i behaglig, mjuk medelfart (~8-10 celler/sekund).
    // Spelaren hinner tydligt se hur pilen rör sig genom kurvorna och vecklar ut sig över kubkanten!
    // Fas 2: 0.58 -> 1.0 (ca 0.7s)
    // När pilen helt har lämnat kubytan och vecklats ut till en rak pil, accelererar den jämnt ut ur bildskärmen.
    let s = 0;
    const T_CUBE = 0.58;

    if (t <= T_CUBE) {
      const u = t / T_CUBE;
      // Mjuk och tydlig medelfart över kubytan
      const easeCube = 0.25 * u + 0.75 * Math.pow(u, 1.2);
      s = easeCube * instance.dTailExit;
    } else {
      const v = (t - T_CUBE) / (1 - T_CUBE);
      // Mjuk acceleration i rymden mot bildens ytterkant
      const easeSpace = 0.3 * v + 0.7 * Math.pow(v, 2.0);
      s = instance.dTailExit + easeSpace * (instance.totalTrackLength - instance.dTailExit);
    }

    const dTail = s;
    const dHead = Math.min(instance.totalTrackLength, s + instance.arrowLength);

    if (dTail >= instance.totalTrackLength) {
      // Pil har helt lämnat skärmen
      instance.outerGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([], 3)
      );
      instance.coreGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([], 3)
      );
      return;
    }

    const dStemEnd = Math.max(dTail, dHead - instance.headLength);

    // Sampla ryggradspunkter längs spåret mellan dTail och dStemEnd
    interface SpinePoint {
      pos: THREE.Vector3;
      normal: THREE.Vector3;
      binormal: THREE.Vector3;
      tangent: THREE.Vector3;
      dist: number;
    }

    const spine: SpinePoint[] = [];

    // 1. Svanspunkt
    const tailSample = this.sampleTrack(instance.waypoints, dTail);
    spine.push({ ...tailSample, dist: dTail });

    // 2. Alla hörn / waypoints mellan svans och spetsbas
    for (const wp of instance.waypoints) {
      if (wp.dist > dTail + 0.01 && wp.dist < dStemEnd - 0.01) {
        const sSample = this.sampleTrack(instance.waypoints, wp.dist);
        spine.push({ ...sSample, dist: wp.dist });
      }
    }

    // 3. Spetsbas-punkt
    if (dStemEnd > dTail + 0.005) {
      const stemEndSample = this.sampleTrack(instance.waypoints, dStemEnd);
      spine.push({ ...stemEndSample, dist: dStemEnd });
    }

    // Subdividera långa raka sträckor för mjuk och sammanhängande geometri
    const refinedSpine: SpinePoint[] = [];
    const maxSeg = 0.35;

    for (let i = 0; i < spine.length; i++) {
      refinedSpine.push(spine[i]);
      if (i < spine.length - 1) {
        const cur = spine[i];
        const nxt = spine[i + 1];
        const segDist = nxt.dist - cur.dist;
        if (segDist > maxSeg) {
          const subCount = Math.floor(segDist / maxSeg);
          for (let k = 1; k <= subCount; k++) {
            const interD = cur.dist + (segDist * k) / (subCount + 1);
            const interSample = this.sampleTrack(instance.waypoints, interD);
            refinedSpine.push({ ...interSample, dist: interD });
          }
        }
      }
    }

    // Konstruera 3D-mesh för yttre skal och vit energikärna
    const outerPos: number[] = [];
    const corePos: number[] = [];

    const addQuad = (
      arr: number[],
      p0: THREE.Vector3,
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      p3: THREE.Vector3
    ) => {
      arr.push(
        p0.x, p0.y, p0.z,
        p1.x, p1.y, p1.z,
        p2.x, p2.y, p2.z,
        p0.x, p0.y, p0.z,
        p2.x, p2.y, p2.z,
        p3.x, p3.y, p3.z
      );
    };

    const addTri = (
      arr: number[],
      p0: THREE.Vector3,
      p1: THREE.Vector3,
      p2: THREE.Vector3
    ) => {
      arr.push(
        p0.x, p0.y, p0.z,
        p1.x, p1.y, p1.z,
        p2.x, p2.y, p2.z
      );
    };

    const hw = instance.stemWidth * 0.5;
    const ht = instance.stemThickness * 0.5;
    const hwCore = instance.stemWidth * 0.22;
    const htCore = instance.stemThickness * 0.52; // Lätt upphöjd för maximal ljusemission

    // 1. Bygg stam-segmenten
    if (refinedSpine.length >= 2) {
      for (let i = 0; i < refinedSpine.length - 1; i++) {
        const sA = refinedSpine[i];
        const sB = refinedSpine[i + 1];

        // Yttre skal cross-sections
        const aTopL = sA.pos.clone().addScaledVector(sA.binormal, -hw).addScaledVector(sA.normal, ht);
        const aTopR = sA.pos.clone().addScaledVector(sA.binormal, hw).addScaledVector(sA.normal, ht);
        const aBotL = sA.pos.clone().addScaledVector(sA.binormal, -hw).addScaledVector(sA.normal, -ht);
        const aBotR = sA.pos.clone().addScaledVector(sA.binormal, hw).addScaledVector(sA.normal, -ht);

        const bTopL = sB.pos.clone().addScaledVector(sB.binormal, -hw).addScaledVector(sB.normal, ht);
        const bTopR = sB.pos.clone().addScaledVector(sB.binormal, hw).addScaledVector(sB.normal, ht);
        const bBotL = sB.pos.clone().addScaledVector(sB.binormal, -hw).addScaledVector(sB.normal, -ht);
        const bBotR = sB.pos.clone().addScaledVector(sB.binormal, hw).addScaledVector(sB.normal, -ht);

        // Yttre sidor
        addQuad(outerPos, aTopL, aTopR, bTopR, bTopL); // Topp
        addQuad(outerPos, aBotR, aBotL, bBotL, bBotR); // Botten
        addQuad(outerPos, aBotL, aTopL, bTopL, bBotL); // Vänster sida
        addQuad(outerPos, aTopR, aBotR, bBotR, bTopR); // Höger sida

        // Svans-avslutning vid första punkten
        if (i === 0) {
          addQuad(outerPos, aBotL, aBotR, aTopR, aTopL);
        }

        // Vitglödgad energikärna längs toppen
        const cA_L = sA.pos.clone().addScaledVector(sA.binormal, -hwCore).addScaledVector(sA.normal, htCore);
        const cA_R = sA.pos.clone().addScaledVector(sA.binormal, hwCore).addScaledVector(sA.normal, htCore);
        const cB_L = sB.pos.clone().addScaledVector(sB.binormal, -hwCore).addScaledVector(sB.normal, htCore);
        const cB_R = sB.pos.clone().addScaledVector(sB.binormal, hwCore).addScaledVector(sB.normal, htCore);

        addQuad(corePos, cA_L, cA_R, cB_R, cB_L);
      }
    }

    // 2. Bygg 3D-pilspetsen (Arrowhead) vid fronten
    if (dHead > dStemEnd) {
      const tipSample = this.sampleTrack(instance.waypoints, dHead);
      const baseSample = this.sampleTrack(instance.waypoints, dStemEnd);

      const tipPos = tipSample.pos;
      const basePos = baseSample.pos;
      const headNorm = tipSample.normal;
      const headBinorm = tipSample.binormal;
      const headTang = tipSample.tangent;

      const wingW = instance.wingWidth;
      const wingBack = instance.headLength * 0.12;

      const wL = basePos.clone().addScaledVector(headBinorm, -wingW).addScaledVector(headTang, -wingBack);
      const wR = basePos.clone().addScaledVector(headBinorm, wingW).addScaledVector(headTang, -wingBack);

      // Yttre pilspets i 3D
      const tipTop = tipPos.clone().addScaledVector(headNorm, ht);
      const tipBot = tipPos.clone().addScaledVector(headNorm, -ht);
      const wLTop = wL.clone().addScaledVector(headNorm, ht);
      const wLBot = wL.clone().addScaledVector(headNorm, -ht);
      const wRTop = wR.clone().addScaledVector(headNorm, ht);
      const wRBot = wR.clone().addScaledVector(headNorm, -ht);
      const baseTop = basePos.clone().addScaledVector(headNorm, ht);
      const baseBot = basePos.clone().addScaledVector(headNorm, -ht);

      addTri(outerPos, tipTop, wRTop, wLTop); // Toppyta
      addTri(outerPos, tipBot, wLBot, wRBot); // Bottenyta
      addQuad(outerPos, tipTop, tipBot, wLBot, wLTop); // Vänster spetskant
      addQuad(outerPos, tipTop, wRTop, wRBot, tipBot); // Höger spetskant
      addQuad(outerPos, wLTop, wLBot, baseBot, baseTop); // Bakvinge vänster
      addQuad(outerPos, baseTop, baseBot, wRBot, wRTop); // Bakvinge höger

      // Vitglödgad kärnspets
      const coreTipTop = tipPos.clone().addScaledVector(headNorm, htCore);
      const coreWL = basePos.clone().addScaledVector(headBinorm, -wingW * 0.45).addScaledVector(headTang, -wingBack * 0.5).addScaledVector(headNorm, htCore);
      const coreWR = basePos.clone().addScaledVector(headBinorm, wingW * 0.45).addScaledVector(headTang, -wingBack * 0.5).addScaledVector(headNorm, htCore);
      addTri(corePos, coreTipTop, coreWR, coreWL);
    }

    // Uppdatera Three.js BufferGeometries
    instance.outerGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(outerPos, 3)
    );

    instance.coreGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(corePos, 3)
    );
  }

  public update(now: number, _deltaMs: number) {
    for (let i = this.slitheringArrows.length - 1; i >= 0; i--) {
      const sa = this.slitheringArrows[i];
      const elapsed = now - sa.startTime;
      const t = Math.min(1.0, elapsed / sa.duration);

      this.buildGeometryForInstance(sa, t);

      if (t >= 1.0) {
        this.parentGroup.remove(sa.group);
        sa.outerGeo.dispose();
        sa.coreGeo.dispose();
        if (Array.isArray(sa.outerMesh.material)) {
          sa.outerMesh.material.forEach((m) => m.dispose());
        } else {
          sa.outerMesh.material.dispose();
        }
        if (Array.isArray(sa.coreMesh.material)) {
          sa.coreMesh.material.forEach((m) => m.dispose());
        } else {
          sa.coreMesh.material.dispose();
        }
        this.slitheringArrows.splice(i, 1);
      }
    }
  }

  public clearAll() {
    for (const sa of this.slitheringArrows) {
      this.parentGroup.remove(sa.group);
      sa.outerGeo.dispose();
      sa.coreGeo.dispose();
      if (Array.isArray(sa.outerMesh.material)) {
        sa.outerMesh.material.forEach((m) => m.dispose());
      } else {
        sa.outerMesh.material.dispose();
      }
      if (Array.isArray(sa.coreMesh.material)) {
        sa.coreMesh.material.forEach((m) => m.dispose());
      } else {
        sa.coreMesh.material.dispose();
      }
    }
    this.slitheringArrows = [];
  }
}
