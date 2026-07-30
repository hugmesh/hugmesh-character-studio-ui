import { Component, computed, inject } from '@angular/core';
import { CharacterStateService } from '../services/character-state.service';

/**
 * Expression preview controls (B0 EXPRESSION-PREVIEW slice). Renders one toggle
 * button per expression preset the active pack ships (neutral/happy/sad/angry);
 * clicking calls {@link CharacterStateService.setExpression}, which swaps the
 * eyes/brows/mouth layers at compose — PREVIEW ONLY (the base character and
 * palette are never mutated, so switching back to neutral restores the look).
 *
 * Renders nothing when the pack ships no expressions, so packs without an
 * `expressions` index are unaffected. `aria-pressed` reflects the active
 * expression; the live preview honors `prefers-reduced-motion` (no transition).
 */
@Component({
  selector: 'hug-expression-preview',
  standalone: true,
  imports: [],
  templateUrl: './expression-preview.component.html',
  styleUrl: './expression-preview.component.scss',
})
export class ExpressionPreviewComponent {
  private readonly state = inject(CharacterStateService);

  /** Expression ids available for the active pack (empty ⇒ component renders nothing). */
  readonly ids = this.state.expressionIds;
  /** The currently-previewed expression id. */
  readonly active = this.state.activeExpression;

  /** Human label for a preset (its displayName, else the capitalised id). */
  readonly labelOf = computed(() => {
    const presets = this.state.expressions();
    return (id: string): string => {
      const name = presets.get(id)?.displayName;
      return name ?? id.charAt(0).toUpperCase() + id.slice(1);
    };
  });

  preview(id: string): void {
    this.state.setExpression(id);
  }
}
