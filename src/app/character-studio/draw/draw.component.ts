import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { getStroke } from 'perfect-freehand';
import { CharacterStateService } from '../services/character-state.service';
import { sanitizeSvgClient } from '../util/svg-sanitize.client';
import { PartManifest } from '../models/vn-manifest';

/** perfect-freehand outline points → an SVG path `d` using quadratic Bézier segments. */
function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) {
    return '';
  }
  const d = stroke.reduce(
    (acc: (string | number)[], [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q'],
  );
  d.push('Z');
  return d.join(' ');
}

/**
 * Lets a user DRAW a part with the pointer (perfect-freehand), pick a recolor
 * region + target slot, and apply it live to the character (B0 drawable, v2 §2).
 * The drawn SVG is CLIENT-sanitized ({@link sanitizeSvgClient}) before it renders —
 * but that is preview-only; saving it as a reusable, shareable part requires the
 * server-side sanitizer (SANITIZE→MODERATE→STORE), which is the next backend step.
 */
@Component({
  selector: 'hug-draw',
  standalone: true,
  imports: [],
  templateUrl: './draw.component.html',
  styleUrl: './draw.component.scss',
})
export class DrawComponent {
  readonly pack = input.required<PartManifest>();
  private readonly state = inject(CharacterStateService);

  readonly slots = computed(() =>
    [...this.pack().slots].sort((a, b) => a.zOrder - b.zOrder).map(s => s.slot),
  );
  readonly targetSlot = signal<string>('');
  readonly region = signal<string>('fur');
  readonly paths = signal<string[]>([]);
  readonly current = signal<string>('');
  readonly status = signal<string>('');

  private points: number[][] = [];
  private drawing = false;

  constructor() {
    effect(() => {
      if (!this.targetSlot() && this.slots().length) {
        this.targetSlot.set(this.slots()[0]);
      }
    });
  }

  private toViewBox(ev: PointerEvent, svg: SVGSVGElement): [number, number] {
    const r = svg.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * 1024, ((ev.clientY - r.top) / r.height) * 1024];
  }

  onRegionChange(ev: Event): void {
    this.region.set((ev.target as HTMLSelectElement).value);
  }

  onTargetSlotChange(ev: Event): void {
    this.targetSlot.set((ev.target as HTMLSelectElement).value);
  }

  onDown(ev: PointerEvent): void {
    this.drawing = true;
    const svg = ev.currentTarget as SVGSVGElement;
    svg.setPointerCapture(ev.pointerId);
    this.points = [[...this.toViewBox(ev, svg), ev.pressure || 0.5]];
    this.current.set('');
  }

  onMove(ev: PointerEvent): void {
    if (!this.drawing) {
      return;
    }
    const svg = ev.currentTarget as SVGSVGElement;
    this.points.push([...this.toViewBox(ev, svg), ev.pressure || 0.5]);
    this.current.set(this.strokeToPath(this.points));
  }

  onUp(): void {
    if (!this.drawing) {
      return;
    }
    this.drawing = false;
    if (this.current()) {
      this.paths.update(p => [...p, this.current()]);
    }
    this.current.set('');
    this.points = [];
  }

  private strokeToPath(pts: number[][]): string {
    const stroke = getStroke(pts, { size: 18, thinning: 0.6, smoothing: 0.5, streamline: 0.5 });
    return getSvgPathFromStroke(stroke as number[][]);
  }

  undo(): void {
    this.paths.update(p => p.slice(0, -1));
  }

  clearDrawing(): void {
    this.paths.set([]);
    this.current.set('');
  }

  apply(): void {
    const ds = this.paths();
    if (!ds.length) {
      this.status.set('Draw something first.');
      return;
    }
    const region = this.region();
    const svgClass = `region-${region}`;
    const inner = ds.map(d => `<path class="${svgClass}" d="${d}"/>`).join('');
    const partSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${inner}</svg>`;
    const clean = sanitizeSvgClient(partSvg);
    this.state.addUserPart(this.targetSlot(), clean, [
      { region, svgClass, defaultPalette: '#cccccc' },
    ]);
    this.status.set(
      `Applied your drawing to “${this.targetSlot()}”. Saving it as a reusable part runs server-side sanitization + moderation (next backend step).`,
    );
  }

  removeFromSlot(): void {
    this.state.clearUserPart(this.targetSlot());
    this.status.set(`Removed your drawing from “${this.targetSlot()}”.`);
  }
}
