import { SvgRigService } from './svg-rig.service';
import { PartManifest } from '../models/vn-manifest';
import { VnCharacter } from '../models/vn-character';

/**
 * The rig/viseme layer of the compositor: a slot's transform wraps its layer in
 * one clamped `<g transform>`; the MOUTH slot alone lip-syncs — by a pack's own
 * drawn frame when it ships one, by a transform about the measured mouth when
 * it does not — and nothing but finite numbers ever reaches an attribute.
 */
describe('SvgRigService rig transforms and visemes', () => {
  let svc: SvgRigService;
  const pack = (mouthVariants: boolean): PartManifest => ({
    packId: 'p', version: '1', displayName: 'P', canvas: { width: 100, height: 200 },
    slots: [
      { slot: 'head', zOrder: 1, required: true, anchor: { x: 0.5, y: 0.5 }, parts: [{ id: 'h', displayName: 'H', file: 'h.svg' }] },
      {
        slot: 'mouth', zOrder: 2, required: false, anchor: { x: 0.5, y: 0.7 },
        parts: [
          { id: 'm', displayName: 'M', file: 'm.svg' },
          ...(mouthVariants ? [
            { id: 'm-half', displayName: 'M half', file: 'm-half.svg', viseme: 'half' as const, visemeOf: 'm' },
            { id: 'm-open', displayName: 'M open', file: 'm-open.svg', viseme: 'open' as const, visemeOf: 'm' },
          ] : []),
        ],
      },
    ],
  });
  const character = (over: Partial<VnCharacter> = {}): VnCharacter => ({
    schemaVersion: 1, packId: 'p', name: 'c', slots: { head: 'h', mouth: 'm' }, palette: {},
    transform: { scale: 1, offsetX: 0, offsetY: 0 }, defaultExpression: 'neutral', ...over,
  });

  beforeEach(() => {
    svc = new SvgRigService();
    spyOn<any>(svc, 'partFile').and.callFake((url: string) => Promise.resolve(`<path data-file="${url.split('/').pop()}" d="M0 0h1v1z"/>`));
  });

  it('renders byte-identically to before when no transform and no viseme are asked for', async () => {
    const plain = await svc.compose(character(), pack(false));
    const explicit = await svc.compose(character(), pack(false), {}, { viseme: 'closed', mouthBox: null });
    expect(explicit).toBe(plain);
    expect(plain).not.toContain('data-rig');
    expect(plain).not.toContain('data-viseme');
  });

  it('wraps a transformed slot in one clamped, anchor-relative <g transform>', async () => {
    const svg = await svc.compose(character({ slotTransforms: { head: { dx: 10, dy: -5, scale: 1.25, rot: 10 } } }), pack(false));
    // anchor (0.5, 0.5) on a 100×200 canvas = (50, 100)
    expect(svg).toContain('<g data-rig="head" transform="translate(10 -5) translate(50 100) rotate(10) scale(1.25) translate(-50 -100)">');
    expect(svg.match(/data-rig=/g)?.length).toBe(1);
  });

  it('clamps an out-of-range or non-finite transform before it reaches the markup', async () => {
    const svg = await svc.compose(character({ slotTransforms: { head: { dx: 99999, dy: Number.NaN, scale: 50, rot: -720 } } }), pack(false));
    expect(svg).toContain('translate(256 0) translate(50 100) rotate(-45) scale(2) translate(-50 -100)');
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('Infinity');
  });

  it('synthesizes an open mouth about the measured box, on the mouth layer only', async () => {
    const svg = await svc.compose(character(), pack(false), {}, { viseme: 'open', mouthBox: { x: 40, y: 130, w: 20, h: 10 } });
    // centre (50, 135); open scale 1.9; jaw drop = 10 * 0.12 * 0.9 = 1.08
    expect(svg).toContain('<g data-viseme="open" transform="translate(0 1.08) translate(50 135) scale(1 1.9) translate(-50 -135)"><g><path data-file="m.svg"');
    expect(svg.match(/data-viseme=/g)?.length).toBe(1);
    expect(svg).toContain('<g><path data-file="h.svg" d="M0 0h1v1z"/></g><g data-viseme');   // the head layer is untouched
  });

  it('falls back to a box at the slot anchor when the mouth was not measured', async () => {
    const svg = await svc.compose(character(), pack(false), {}, { viseme: 'half', mouthBox: null });
    // anchor (0.5, 0.7) on 100×200 → box x=45 y=136 w=10 h=8, centre (50, 140); half scale 1.35; drop = 8*0.12*0.35 = 0.34
    expect(svg).toContain('<g data-viseme="half" transform="translate(0 0.34) translate(50 140) scale(1 1.35) translate(-50 -140)">');
  });

  it('uses a pack-drawn viseme frame of the CHOSEN mouth instead of a transform when one exists', async () => {
    const svg = await svc.compose(character(), pack(true), {}, { viseme: 'open', mouthBox: { x: 0, y: 0, w: 1, h: 1 } });
    expect(svg).toContain('data-file="m-open.svg"');
    expect(svg).not.toContain('data-file="m.svg"');
    expect(svg).not.toContain('data-viseme');
    // closed = the chosen art as authored
    const closed = await svc.compose(character(), pack(true), {}, { viseme: 'closed' });
    expect(closed).toContain('data-file="m.svg"');
    expect(closed).not.toContain('m-open.svg');
  });

  it('applies the viseme inside the rig transform so both compose', async () => {
    const svg = await svc.compose(
      character({ slotTransforms: { mouth: { dx: 3, dy: 0, scale: 1, rot: 0 } } }),
      pack(false), {}, { viseme: 'open', mouthBox: { x: 40, y: 130, w: 20, h: 10 } });
    const rig = svg.indexOf('data-rig="mouth"');
    const vis = svg.indexOf('data-viseme="open"');
    expect(rig).toBeGreaterThan(-1);
    expect(vis).toBeGreaterThan(rig);
  });

  it('measures a user-drawn mouth too: a user part still lip-syncs by transform', async () => {
    const svg = await svc.compose(
      character({ userParts: { mouth: { svgInline: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>', tintRegions: [] } } }),
      pack(true), {}, { viseme: 'open', mouthBox: { x: 40, y: 130, w: 20, h: 10 } });
    expect(svg).toContain('data-viseme="open"');
    expect(svg).toContain('<rect');
  });
});
