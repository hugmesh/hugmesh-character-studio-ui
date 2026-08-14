import { SvgRigService } from './svg-rig.service';
import { PartManifest, TintRegion } from '../models/vn-manifest';
import { SlotBlend, VnCharacter } from '../models/vn-character';

/**
 * Regression: the composite `<style>` block interpolates palette hex colours and
 * tint-region `svgClass` names. Attacker-controlled values (a saved character's
 * palette, or a user-drawn part's tintRegions) must NOT be able to break out of
 * the style context — no `}`, `<`, `;`, `url(`, `expression` may leak through.
 * See svg-rig.service.ts SAFE_SVG_CLASS / SAFE_HEX and v2 §0/§2.
 */
describe('SvgRigService CSS-injection hardening', () => {
  let svc: SvgRigService;

  /** Build a one-slot pack whose only part carries the given tint regions. */
  const packWith = (regions: TintRegion[]): PartManifest => ({
    packId: 'p',
    version: '1',
    displayName: 'P',
    canvas: { width: 10, height: 10 },
    slots: [
      {
        slot: 'body',
        zOrder: 0,
        required: true,
        anchor: { x: 0, y: 0 },
        parts: [{ id: 'b0', displayName: 'Body', file: 'b0.svg', tintRegions: regions }],
      },
    ],
  });

  const charWith = (palette: Record<string, string>): VnCharacter => ({
    schemaVersion: 1,
    packId: 'p',
    name: 'c',
    slots: { body: 'b0' },
    palette,
    transform: { scale: 1, offsetX: 0, offsetY: 0 },
    defaultExpression: 'neutral',
  });

  beforeEach(() => {
    svc = new SvgRigService();
    // Stub the part fetch so compose() never hits the network; the returned
    // inner markup is benign and must survive untouched.
    spyOn<any>(svc, 'partFile').and.resolveTo('<path class="region-fur" d="M0 0h1v1z"/>');
  });

  it('rejects a palette value that tries to break out of the <style> block', async () => {
    const regions: TintRegion[] = [
      { region: 'fur', svgClass: 'region-fur', defaultPalette: '#abc' },
    ];
    // Classic CSS-context breakout: close the declaration + the <style>, then inject.
    const malicious = '#fff}</style><script>alert(1)</script><style>x{y:url(evil)';
    const svg = await svc.compose(charWith({ fur: malicious }), packWith(regions));

    // None of the breakout primitives may appear inside the composite. (The
    // composite legitimately closes its OWN style block, so assert the injected
    // close tag is gone by counting: exactly one `</style>` may remain.)
    expect(svg.match(/<\/style>/g)?.length).toBe(1);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('url(');
    expect(svg).not.toContain('alert(1)');
    // The injection literal must be gone; the safe part default is used instead.
    expect(svg).not.toContain(malicious);
    expect(svg).toContain('--region-fur:#abc');
    expect(svg).toContain('.region-fur{fill:var(--region-fur)}');
  });

  it('rejects palette values carrying `;`, `expression(` or other CSS metacharacters', async () => {
    const regions: TintRegion[] = [
      { region: 'fur', svgClass: 'region-fur', defaultPalette: '#123456' },
    ];
    for (const bad of ['red;background:url(x)', 'expression(alert(1))', 'rgb(0,0,0)', '#ggg', '#12']) {
      const svg = await svc.compose(charWith({ fur: bad }), packWith(regions));
      // The bad value must never reach the interpolation site. (Checked as the
      // FULL terminated declaration, not a bare substring — '#12' is a prefix
      // of the legitimate '#123456' fallback.)
      const leaked = svg.includes(`--region-fur:${bad};`) || svg.includes(`--region-fur:${bad}}`);
      expect(leaked).withContext(`palette value "${bad}" leaked`).toBeFalse();
      expect(svg).not.toContain('expression(');
      expect(svg).not.toContain(';background');
      // falls back to the valid part default, never the attacker string
      expect(svg).toContain('--region-fur:#123456');
    }
  });

  it('drops a tint region whose svgClass is not a safe identifier', async () => {
    const regions: TintRegion[] = [
      // svgClass tries to escape the selector / property name.
      { region: 'fur', svgClass: 'x}</style><script>', defaultPalette: '#abc' },
    ];
    const svg = await svc.compose(charWith({ fur: '#abc' }), packWith(regions));

    // Only the composite's own single style block survives (see above).
    expect(svg.match(/<\/style>/g)?.length).toBe(1);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('x}');
    // The whole region is skipped: no rule and no var declaration emitted for it.
    expect(svg).not.toContain('--x');
    // The empty style block remains well-formed.
    expect(svg).toContain('<style>:root{}</style>');
  });

  it('preserves legitimate recolor rules and part markup (benign case survives)', async () => {
    const regions: TintRegion[] = [
      { region: 'fur', svgClass: 'region-fur', defaultPalette: '#aabbcc' },
      { region: 'eye', svgClass: 'region_eye-1', defaultPalette: '#fff' },
    ];
    const svg = await svc.compose(
      charWith({ fur: '#11223344', eye: '#FFF' }),
      packWith(regions),
    );

    // Valid 8- and 3-digit hex both pass; the user palette is honoured.
    expect(svg).toContain('--region-fur:#11223344');
    expect(svg).toContain('--region_eye-1:#FFF');
    expect(svg).toContain('.region-fur{fill:var(--region-fur)}');
    expect(svg).toContain('.region_eye-1{fill:var(--region_eye-1)}');
    // The benign part inner markup is inlined unchanged.
    expect(svg).toContain('<path class="region-fur" d="M0 0h1v1z"/>');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">');
  });
});

/**
 * The body-type spectrum axis (SlotBlend, B0 §3.4): a slot crossfades its
 * chosen part toward a second part in the same slot instead of only ever
 * showing one or the other. Two independent flat-vector bodies, not a shared
 * topology, so the honest interpolation is opacity crossfade — verify the
 * layering, the t=0/t=1 edge collapses, and that an out-of-range or tampered
 * `t` (this is user/persisted data) can never misrender or inject CSS.
 */
describe('SvgRigService slot blend (body-type spectrum axis)', () => {
  let svc: SvgRigService;

  const pack: PartManifest = {
    packId: 'p',
    version: '1',
    displayName: 'P',
    canvas: { width: 10, height: 10 },
    slots: [
      {
        slot: 'body',
        zOrder: 0,
        required: true,
        anchor: { x: 0, y: 0 },
        parts: [
          { id: 'a', displayName: 'A', file: 'a.svg', category: 'base' },
          { id: 'b', displayName: 'B', file: 'b.svg', category: 'base' },
        ],
      },
    ],
  };

  const charWith = (slotBlend?: Record<string, SlotBlend>): VnCharacter => ({
    schemaVersion: 1,
    packId: 'p',
    name: 'c',
    slots: { body: 'a' },
    palette: {},
    transform: { scale: 1, offsetX: 0, offsetY: 0 },
    defaultExpression: 'neutral',
    slotBlend,
  });

  beforeEach(() => {
    svc = new SvgRigService();
    spyOn<any>(svc, 'partFile').and.callFake((url: string) =>
      Promise.resolve(url.endsWith('/a.svg') ? '<path d="A"/>' : '<path d="B"/>'),
    );
  });

  it('renders a single unblended layer when no slotBlend is set for the slot', async () => {
    const svg = await svc.compose(charWith(), pack);
    expect(svg.match(/<g/g)?.length).toBe(1);
    expect(svg).toContain('d="A"');
    expect(svg).not.toContain('opacity');
  });

  it('crossfades both parts as opacity-complementary layers at a fractional t', async () => {
    const svg = await svc.compose(charWith({ body: { toId: 'b', t: 0.25 } }), pack);
    expect(svg).toContain('<g style="opacity:0.7500">');
    expect(svg).toContain('d="A"');
    expect(svg).toContain('<g style="opacity:0.2500">');
    expect(svg).toContain('d="B"');
  });

  it('collapses to the target part alone at t=1 (no residual base layer)', async () => {
    const svg = await svc.compose(charWith({ body: { toId: 'b', t: 1 } }), pack);
    expect(svg.match(/<g/g)?.length).toBe(1);
    expect(svg).toContain('d="B"');
    expect(svg).not.toContain('d="A"');
    expect(svg).not.toContain('opacity');
  });

  it('collapses to the base part alone at t=0 (same shape as no blend)', async () => {
    const svg = await svc.compose(charWith({ body: { toId: 'b', t: 0 } }), pack);
    expect(svg.match(/<g/g)?.length).toBe(1);
    expect(svg).toContain('d="A"');
    expect(svg).not.toContain('opacity');
  });

  it('clamps t above 1 to a full swap instead of an out-of-range opacity', async () => {
    const svg = await svc.compose(charWith({ body: { toId: 'b', t: 1.7 } }), pack);
    expect(svg.match(/<g/g)?.length).toBe(1);
    expect(svg).toContain('d="B"');
    expect(svg).not.toContain('opacity');
  });

  it('clamps a negative or non-finite t to 0 rather than crashing or misrendering', async () => {
    for (const bad of [-1, NaN, Infinity, -Infinity]) {
      const svg = await svc.compose(charWith({ body: { toId: 'b', t: bad } }), pack);
      expect(svg.match(/<g/g)?.length).toBe(1);
      expect(svg).toContain('d="A"');
      expect(svg).not.toContain('opacity');
    }
  });

  it('rejects a non-numeric t — defense in depth against a tampered persisted character', async () => {
    const malicious = '0)}</style><script>alert(1)</script><style>x{y:(' as unknown as number;
    const svg = await svc.compose(charWith({ body: { toId: 'b', t: malicious } }), pack);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain(malicious);
    expect(svg.match(/<g/g)?.length).toBe(1);
    expect(svg).toContain('d="A"');
  });

  it('falls back to the single base-part render when toId is not a part in the slot', async () => {
    const svg = await svc.compose(charWith({ body: { toId: 'not-a-real-part', t: 0.5 } }), pack);
    expect(svg.match(/<g/g)?.length).toBe(1);
    expect(svg).toContain('d="A"');
  });

  it('is ignored for a slot an active expression is currently swapping', async () => {
    const svg = await svc.compose(charWith({ body: { toId: 'b', t: 0.5 } }), pack, { body: 'b' });
    // The expression override wins outright — no crossfade with the base pick.
    expect(svg.match(/<g/g)?.length).toBe(1);
    expect(svg).toContain('d="B"');
    expect(svg).not.toContain('opacity');
  });
});
