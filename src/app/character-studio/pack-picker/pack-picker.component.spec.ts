import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PackPickerComponent } from './pack-picker.component';
import { PackIndexEntry } from '../models/vn-manifest';

/**
 * PACK-PICKER slice: the labelled `<select>` lists the enabled packs (option
 * label = displayName, falling back to packId), reflects the active pack, and
 * emits the chosen packId — but NOT when the current pack is re-selected.
 */
describe('PackPickerComponent', () => {
  let fixture: ComponentFixture<PackPickerComponent>;

  const entries: PackIndexEntry[] = [
    {
      packId: 'base-anthro-v1',
      displayName: 'Base Anthro v1',
      path: 'packs/base-anthro-v1/pack.json',
      enabled: true,
    },
    // No displayName — the option must fall back to the packId.
    { packId: 'anime-v1', path: 'packs/anime-v1/pack.json', enabled: true },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PackPickerComponent] }).compileComponents();
    fixture = TestBed.createComponent(PackPickerComponent);
    fixture.componentRef.setInput('entries', entries);
    fixture.componentRef.setInput('activePackId', 'base-anthro-v1');
    fixture.detectChanges();
  });

  const select = (): HTMLSelectElement =>
    fixture.nativeElement.querySelector('[data-testid="cs-pack-select"]');

  it('lists one option per enabled pack, labelled displayName-or-packId', () => {
    const labels = Array.from(select().options).map(o => o.textContent?.trim());
    expect(labels).toEqual(['Base Anthro v1', 'anime-v1']);
    const values = Array.from(select().options).map(o => o.value);
    expect(values).toEqual(['base-anthro-v1', 'anime-v1']);
  });

  it('renders the active pack as the selected option and is accessibly labelled', () => {
    expect(select().value).toBe('base-anthro-v1');
    expect(select().getAttribute('aria-label')).toBe('Asset pack');
  });

  it('emits the chosen packId on change', () => {
    const emitted: string[] = [];
    fixture.componentInstance.packChange.subscribe(id => emitted.push(id));
    select().value = 'anime-v1';
    select().dispatchEvent(new Event('change'));
    expect(emitted).toEqual(['anime-v1']);
  });

  it('re-selecting the CURRENT pack is a no-op (nothing emitted)', () => {
    const emitted: string[] = [];
    fixture.componentInstance.packChange.subscribe(id => emitted.push(id));
    select().value = 'base-anthro-v1';
    select().dispatchEvent(new Event('change'));
    expect(emitted).toEqual([]);
  });
});
