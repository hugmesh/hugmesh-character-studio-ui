import { Component, computed, inject, input } from '@angular/core';
import { CharacterStateService } from '../services/character-state.service';
import { PartGeometryService } from '../services/part-geometry.service';
import { SvgRigService } from '../services/svg-rig.service';
import { PartManifest, SlotDef } from '../models/vn-manifest';
import { IDENTITY_TRANSFORM, SLOT_TRANSFORM_LIMITS, SlotTransform, isIdentityTransform } from '../models/vn-character';
import { Box, FEATURE_TARGETS, autoFitTransforms } from './rig-fit';

/**
 * The "Rig" controls: nudge, scale and rotate each chosen layer about its slot
 * anchor, live on the canvas, and "Fit the face" — measure the head and the
 * facial features and propose the offsets that land each feature where it
 * belongs. Every edit is a sparse, clamped {@link SlotTransform} on the
 * character (see {@link CharacterStateService.setSlotTransform}), so what the
 * user sees is exactly what exports.
 */
@Component({
  selector: 'hug-rig-panel',
  standalone: true,
  imports: [],
  templateUrl: './rig-panel.component.html',
  styleUrl: './rig-panel.component.scss',
})
export class RigPanelComponent {
  readonly pack = input.required<PartManifest>();
  protected readonly state = inject(CharacterStateService);
  private readonly rig = inject(SvgRigService);
  private readonly geometry = inject(PartGeometryService);
  readonly limits = SLOT_TRANSFORM_LIMITS;

  /** Slots that currently draw something — a rig for an empty slot is noise. */
  readonly slots = computed<SlotDef[]>(() => {
    const c = this.state.character();
    if (!c) {
      return [];
    }
    return [...this.pack().slots]
      .sort((a, b) => a.zOrder - b.zOrder)
      .filter(s => !!c.slots[s.slot] || !!c.userParts?.[s.slot]);
  });

  /** True when any slot carries a transform (enables "Reset all"). */
  readonly anyTransform = computed<boolean>(() => {
    const t = this.state.character()?.slotTransforms;
    return !!t && Object.keys(t).length > 0;
  });

  transformOf(slot: string): SlotTransform {
    return this.state.character()?.slotTransforms?.[slot] ?? IDENTITY_TRANSFORM;
  }

  isAdjusted(slot: string): boolean {
    return !isIdentityTransform(this.state.character()?.slotTransforms?.[slot]);
  }

  onChange(slot: string, key: keyof SlotTransform, ev: Event): void {
    const value = Number((ev.target as HTMLInputElement).value);
    this.state.setSlotTransform(slot, { ...this.transformOf(slot), [key]: value });
  }

  reset(slot: string): void {
    this.state.setSlotTransform(slot, null);
  }

  resetAll(): void {
    this.state.clearTransforms();
  }

  /** Where each feature is drawn with NO transform (its natural bounds). */
  private async naturalBox(slotId: string): Promise<Box | null> {
    const pack = this.pack();
    const c = this.state.character();
    const slot = pack.slots.find(s => s.slot === slotId);
    if (!c || !slot) {
      return null;
    }
    const user = c.userParts?.[slotId];
    if (user) {
      return this.geometry.bboxOf(`user:${pack.packId}:${slotId}:${user.svgInline.length}`, user.svgInline, pack.canvas);
    }
    const partId = this.state.activeExpressionSlots()[slotId] ?? c.slots[slotId];
    const part = partId ? slot.parts.find(p => p.id === partId) : undefined;
    if (!part) {
      return null;
    }
    const markup = await this.rig.partMarkup(pack, part);
    return this.geometry.bboxOf(`${pack.packId}:${part.id}`, markup, pack.canvas);
  }

  /**
   * Measure the head and every placeable feature, then apply the proposed
   * nudges (keeping any scale/rotation the user set). Returns the number of
   * slots adjusted so the status line can say what happened.
   */
  async fitFace(): Promise<number> {
    const head = await this.naturalBox('head');
    if (!head) {
      return 0;
    }
    const features: Record<string, Box> = {};
    for (const slot of Object.keys(FEATURE_TARGETS)) {
      const box = await this.naturalBox(slot);
      if (box) {
        features[slot] = box;
      }
    }
    const proposed = autoFitTransforms(head, features, this.state.character()?.slotTransforms ?? {});
    this.state.applyTransforms(proposed);
    return Object.keys(proposed).length;
  }
}
