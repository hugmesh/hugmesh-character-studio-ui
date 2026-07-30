import { Component, inject, input, signal } from '@angular/core';
import { CharacterStateService } from '../services/character-state.service';
import { CharacterAiService } from '../services/character-ai.service';
import { PartManifest } from '../models/vn-manifest';

/**
 * "Describe your character" AI assist (B0 §8a). Shown only when {@link enabled}
 * (the admin/mod feature gate). Sends the prompt to the on-prem edge-AI seam when
 * the admin has enabled it, else uses a local heuristic — either way it just
 * proposes parts + colours which the user then adjusts with the picker/palette/draw.
 */
@Component({
  selector: 'hug-ai-assist',
  standalone: true,
  imports: [],
  templateUrl: './ai-assist.component.html',
  styleUrl: './ai-assist.component.scss',
})
export class AiAssistComponent {
  readonly pack = input.required<PartManifest>();
  /** Admin/mod gate — the whole AI-assist panel is hidden unless enabled. */
  readonly enabled = input<boolean>(true);

  private readonly state = inject(CharacterStateService);
  private readonly ai = inject(CharacterAiService);

  readonly prompt = signal('');
  readonly status = signal('');
  readonly busy = signal(false);

  onPrompt(ev: Event): void {
    this.prompt.set((ev.target as HTMLInputElement).value);
  }

  async generate(): Promise<void> {
    const text = this.prompt().trim();
    if (!text) {
      this.status.set('Describe your character first.');
      return;
    }
    this.busy.set(true);
    this.status.set('Generating…');
    try {
      const suggestion = await this.ai.suggest(text, this.pack());
      this.state.applySuggestion(suggestion);
      this.status.set('Applied a starting point — adjust it below.');
    } catch {
      this.status.set('Generation unavailable — build it by hand below.');
    } finally {
      this.busy.set(false);
    }
  }
}
