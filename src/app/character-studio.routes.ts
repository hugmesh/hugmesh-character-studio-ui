import { Routes } from '@angular/router';
import { CharacterStudioComponent } from './character-studio/character-studio.component';

/**
 * The PUBLIC federation surface of this remote — exposed as `./routes` in
 * federation.config.js and consumed by the hugmesh.systems host via
 * loadRemoteModule({ remoteName: 'character-studio', exposedModule: './routes' })
 * mounted at /character-studio. Keep the export name CHARACTER_STUDIO_ROUTES
 * stable: the host imports it by name.
 */
export const CHARACTER_STUDIO_ROUTES: Routes = [
  { path: '', component: CharacterStudioComponent },
];
