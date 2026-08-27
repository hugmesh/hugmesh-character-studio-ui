import { TestBed } from '@angular/core/testing';
import { PartGeometryService } from './part-geometry.service';

/** Real rasterisation in the test browser: a rect at a known place measures as that place. */
describe('PartGeometryService', () => {
  it('measures the alpha bounding box of a part on the pack canvas', async () => {
    const svc = TestBed.inject(PartGeometryService);
    const box = await svc.bboxOf('k1', '<rect x="100" y="200" width="300" height="100" fill="#000"/>', { width: 1000, height: 1000 });
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x - 100)).toBeLessThan(8);
    expect(Math.abs(box!.y - 200)).toBeLessThan(8);
    expect(Math.abs(box!.w - 300)).toBeLessThan(8);
    expect(Math.abs(box!.h - 100)).toBeLessThan(8);
  });

  it('returns null for empty art or an empty canvas, and caches per key', async () => {
    const svc = TestBed.inject(PartGeometryService);
    expect(await svc.bboxOf('empty', '', { width: 100, height: 100 })).toBeNull();
    expect(await svc.bboxOf('nocanvas', '<rect width="1" height="1"/>', { width: 0, height: 0 })).toBeNull();
    const a = svc.bboxOf('same', '<rect width="10" height="10"/>', { width: 100, height: 100 });
    const b = svc.bboxOf('same', '<rect width="90" height="90"/>', { width: 100, height: 100 });
    expect(a).toBe(b);
  });
});
