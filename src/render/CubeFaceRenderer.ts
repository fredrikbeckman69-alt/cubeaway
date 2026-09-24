import * as THREE from 'three';
import { Arrow, CubeCoord, DIR_DELTA, Direction } from '../puzzle/types';
import { LevelTheme, getLevelTheme } from '../puzzle/theme';

export class CubeFaceRenderer {
  public textures: THREE.CanvasTexture[] = [];
  public canvases: HTMLCanvasElement[] = [];
  private ctxs: CanvasRenderingContext2D[] = [];
  private resolution: number = 2048;
  public gridSize: number = 20;
  private theme: LevelTheme = getLevelTheme(1);

  constructor(resolution = 2048) {
    this.resolution = resolution;

    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = this.resolution;
      canvas.height = this.resolution;
      const ctx = canvas.getContext('2d')!;
      this.canvases.push(canvas);
      this.ctxs.push(ctx);

      const texture = new THREE.CanvasTexture(canvas);
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 16;
      this.textures.push(texture);
    }
  }

  public setGridSize(gridSize: number) {
    this.gridSize = gridSize;
  }

  public setTheme(theme: LevelTheme) {
    this.theme = theme;
  }

  public renderFace(
    faceIdx: number,
    allArrows: Arrow[],
    hoveredArrowId: string | null = null,
    shakingArrowId: string | null = null,
    shakeOffset: { x: number; y: number } = { x: 0, y: 0 },
    hintArrowId: string | null = null
  ) {
    const ctx = this.ctxs[faceIdx];
    const res = this.resolution;
    const gSize = this.gridSize;
    const cellSize = res / gSize;

    // 1. Glödande termisk gradient på kubsidan
    const cx = res / 2;
    const cy = res / 2;
    const grad = ctx.createRadialGradient(cx, cy, res * 0.08, cx, cy, res * 0.74);
    grad.addColorStop(0, this.theme.cubeCore);
    grad.addColorStop(0.55, this.theme.cubeMid);
    grad.addColorStop(1, this.theme.cubeEdge);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, res, res);

    // 2. Subtila glödande rutnätslinjer
    ctx.strokeStyle = this.theme.gridLine;
    ctx.lineWidth = 1.0;
    for (let i = 1; i < gSize; i++) {
      const p = Math.round(i * cellSize);
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, res);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(res, p);
      ctx.stroke();
    }

    // Yttre glödande ram
    ctx.strokeStyle = this.theme.cubeRim;
    ctx.lineWidth = 5;
    ctx.strokeRect(2, 2, res - 4, res - 4);

    // 3. Rita alla pilar som har celler på denna sida
    for (const arrow of allArrows) {
      const hasCellsOnThisFace = arrow.cells.some((c) => c.faceIdx === faceIdx);
      if (!hasCellsOnThisFace) continue;

      const isHovered = arrow.id === hoveredArrowId;
      const isShaking = arrow.id === shakingArrowId;
      const isHint = arrow.id === hintArrowId;

      // Pilarna glöder starkt med vitglödgad inre energikärna
      let baseColor = this.theme.arrowBase;
      let glowColor = this.theme.arrowGlow;
      let coreColor = this.theme.arrowCore;

      if (arrow.type === 'frozen' && arrow.isFrozen) {
        baseColor = '#6be2ff';
        glowColor = '#00e1ff';
        coreColor = '#ffffff';
      } else if (arrow.type === 'linked') {
        glowColor = '#ff2df7';
      }

      if (isShaking) {
        baseColor = '#ff1e27'; // Glödande överhettad röd vid blockering
        glowColor = '#ff0033';
        coreColor = 'rgba(255, 230, 180, 0.95)';
      } else if (isHovered) {
        baseColor = '#ffffff'; // Vitglödgad vid hovring
        glowColor =
          arrow.type === 'frozen' && arrow.isFrozen
            ? '#00e1ff'
            : this.theme.isWhiteTheme
            ? '#38bdf8'
            : this.theme.arrowGlow;
        coreColor = '#ffffff';
      } else if (isHint) {
        baseColor = '#ffe500'; // Guldgul vid tips
        glowColor = '#ffea00';
        coreColor = '#ffffff';
      }

      this.drawArrowOnFace(
        ctx,
        arrow,
        faceIdx,
        cellSize,
        res,
        baseColor,
        glowColor,
        coreColor,
        isShaking ? shakeOffset : { x: 0, y: 0 },
        isHovered || isHint
      );
    }

    this.textures[faceIdx].needsUpdate = true;
  }

  private drawArrowOnFace(
    ctx: CanvasRenderingContext2D,
    arrow: Arrow,
    faceIdx: number,
    cellSize: number,
    res: number,
    baseColor: string,
    glowColor: string,
    coreColor: string,
    offset: { x: number; y: number },
    isHighlighted: boolean
  ) {
    const totalCells = arrow.cells.length;
    if (totalCells < 2) return;

    ctx.save();
    ctx.translate(offset.x, offset.y);

    const getCenter = (coord: { r: number; c: number }) => ({
      x: (coord.c + 0.5) * cellSize,
      y: (coord.r + 0.5) * cellSize,
    });

    const S = cellSize;
    const lineWidth = Math.max(4.5, S * 0.22);

    if (isHighlighted) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = Math.max(12, S * 0.45);
    }

    // Hitta sammanhängande sekvenser av celler som ligger på denna kubsida
    let inRun = false;
    let runStart = -1;

    for (let i = 0; i <= totalCells; i++) {
      const onFace = i < totalCells && arrow.cells[i].faceIdx === faceIdx;

      if (onFace && !inRun) {
        inRun = true;
        runStart = i;
      } else if (!onFace && inRun) {
        inRun = false;
        const runEnd = i - 1;
        this.drawSubRun(
          ctx,
          arrow,
          runStart,
          runEnd,
          faceIdx,
          cellSize,
          res,
          baseColor,
          glowColor,
          coreColor,
          lineWidth,
          isHighlighted,
          getCenter
        );
      }
    }

    ctx.restore();
  }

  private drawSubRun(
    ctx: CanvasRenderingContext2D,
    arrow: Arrow,
    startIdx: number,
    endIdx: number,
    faceIdx: number,
    cellSize: number,
    res: number,
    baseColor: string,
    glowColor: string,
    coreColor: string,
    lineWidth: number,
    isHighlighted: boolean,
    getCenter: (c: { r: number; c: number }) => { x: number; y: number }
  ) {
    const S = cellSize;
    const isTail = startIdx === 0;
    const isHead = endIdx === arrow.cells.length - 1;

    const firstCell = arrow.cells[startIdx];
    const lastCell = arrow.cells[endIdx];

    // Beräkna alla vägpunkter
    const points: Array<{ x: number; y: number }> = [];

    if (isTail) {
      points.push(getCenter(firstCell));
    } else {
      const pt = getCenter(firstCell);
      let edgeX = pt.x;
      let edgeY = pt.y;
      if (firstCell.c === 0) edgeX = 0;
      else if (firstCell.c === this.gridSize - 1) edgeX = res;
      else if (firstCell.r === 0) edgeY = 0;
      else if (firstCell.r === this.gridSize - 1) edgeY = res;
      points.push({ x: edgeX, y: edgeY });
      points.push(pt);
    }

    for (let i = startIdx + 1; i < (isHead ? endIdx : endIdx + 1); i++) {
      points.push(getCenter(arrow.cells[i]));
    }

    let headTip = { x: 0, y: 0 };
    let headWing1 = { x: 0, y: 0 };
    let headWing2 = { x: 0, y: 0 };
    let coreTip = { x: 0, y: 0 };
    let coreWing1 = { x: 0, y: 0 };
    let coreWing2 = { x: 0, y: 0 };
    let headCenter = { x: 0, y: 0 };

    if (isHead) {
      const { dr, dc } = DIR_DELTA[arrow.dir];
      const tipDist = S * 0.44;
      const arrowLen = S * 0.48;
      const wingWidth = S * 0.34;

      headCenter = getCenter(lastCell);
      headTip = {
        x: headCenter.x + dc * tipDist,
        y: headCenter.y + dr * tipDist,
      };

      const baseCenterX = headTip.x - dc * arrowLen;
      const baseCenterY = headTip.y - dr * arrowLen;

      const perpX = -dr;
      const perpY = dc;

      headWing1 = {
        x: baseCenterX + perpX * wingWidth,
        y: baseCenterY + perpY * wingWidth,
      };
      headWing2 = {
        x: baseCenterX - perpX * wingWidth,
        y: baseCenterY - perpY * wingWidth,
      };

      // Avsluta stammen vid basens mitt
      points.push({
        x: baseCenterX + dc * (S * 0.05),
        y: baseCenterY + dr * (S * 0.05),
      });

      // Beräkna inre glödande kärna för pilspetsen
      const coreTipDist = tipDist - S * 0.08;
      const coreLen = arrowLen * 0.65;
      const coreWingW = wingWidth * 0.55;
      coreTip = {
        x: headCenter.x + dc * coreTipDist,
        y: headCenter.y + dr * coreTipDist,
      };
      const coreBaseX = coreTip.x - dc * coreLen;
      const coreBaseY = coreTip.y - dr * coreLen;
      coreWing1 = {
        x: coreBaseX + perpX * coreWingW,
        y: coreBaseY + perpY * coreWingW,
      };
      coreWing2 = {
        x: coreBaseX - perpX * coreWingW,
        y: coreBaseY - perpY * coreWingW,
      };
    } else {
      const pt = getCenter(lastCell);
      let edgeX = pt.x;
      let edgeY = pt.y;
      if (lastCell.c === 0) edgeX = 0;
      else if (lastCell.c === this.gridSize - 1) edgeX = res;
      else if (lastCell.r === 0) edgeY = 0;
      else if (lastCell.r === this.gridSize - 1) edgeY = res;
      points.push({ x: edgeX, y: edgeY });
    }

    if (points.length === 0) return;

    // --- PASS 1: Yttre glödande neon-kropp ---
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = isHighlighted ? Math.max(16, S * 0.45) : 0;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (isHead) {
      ctx.beginPath();
      ctx.moveTo(headTip.x, headTip.y);
      ctx.lineTo(headWing1.x, headWing1.y);
      ctx.lineTo(headWing2.x, headWing2.y);
      ctx.closePath();
      ctx.fillStyle = baseColor;
      ctx.fill();
    }
    ctx.restore();

    // --- PASS 2: Intensiv vitglödgad inre energikärna ---
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = Math.max(2.0, lineWidth * 0.38);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (isHead) {
      ctx.beginPath();
      ctx.moveTo(coreTip.x, coreTip.y);
      ctx.lineTo(coreWing1.x, coreWing1.y);
      ctx.lineTo(coreWing2.x, coreWing2.y);
      ctx.closePath();
      ctx.fillStyle = coreColor;
      ctx.fill();

      // Rita specialindikator på pilhuvudet (❄️ för fryst pil, 🔗 för länkad pil)
      if (arrow.type === 'frozen' && arrow.isFrozen) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(S * 0.42)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        ctx.fillText('❄', headCenter.x, headCenter.y);
        ctx.restore();
      } else if (arrow.type === 'linked') {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(S * 0.36)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff00ea';
        ctx.shadowBlur = 10;
        ctx.fillText('🔗', headCenter.x, headCenter.y);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  public dispose() {
    for (const tex of this.textures) {
      tex.dispose();
    }
  }
}
