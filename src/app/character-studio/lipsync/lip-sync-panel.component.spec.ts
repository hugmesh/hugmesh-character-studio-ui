import { TestBed } from '@angular/core/testing';
import { LipSyncPanelComponent } from './lip-sync-panel.component';
import { LipSyncService } from './lip-sync.service';

describe('LipSyncPanelComponent', () => {
  it('offers the three frames and drives the shared lip-sync state', () => {
    const fixture = TestBed.createComponent(LipSyncPanelComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const ids = Array.from(el.querySelectorAll('[data-testid^="cs-viseme-"]')).map(b => b.getAttribute('data-testid'));
    expect(ids).toEqual(['cs-viseme-closed', 'cs-viseme-half', 'cs-viseme-open']);
    (el.querySelector('[data-testid="cs-viseme-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(TestBed.inject(LipSyncService).viseme()).toBe('open');
    expect(el.querySelector('[data-testid="cs-viseme-open"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-testid="cs-mic-toggle"]')?.textContent).toContain('Use my microphone');
    expect(el.querySelector('[data-testid="cs-mic-level"]')).not.toBeNull();
  });
});
