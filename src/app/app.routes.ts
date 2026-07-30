import { Routes } from '@angular/router';
import { CHARACTER_STUDIO_ROUTES } from './character-studio.routes';

/** Dev-shell routes: mount the exposed character-studio routes at the root so
 *  the remote is browsable standalone. The host ignores this and loads
 *  `./routes` (CHARACTER_STUDIO_ROUTES) directly. */
export const routes: Routes = [{ path: '', children: CHARACTER_STUDIO_ROUTES }];
