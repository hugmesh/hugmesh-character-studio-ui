// REMOTE bundle config for the VN character-studio micro-frontend (native-
// federation remote name "character-studio"). The hugmesh.systems host
// consumes the single exposed `./routes` module via
// loadRemoteModule({ remoteName: 'character-studio', exposedModule: './routes' })
// and mounts CHARACTER_STUDIO_ROUTES at /character-studio — so the remote name
// and the exposed module key MUST stay unchanged or the host mount breaks.
//
// The shared-deps surface + RxJS skip list live in ./federation-base.js so the
// federation contract lands in one file, consistent with the host and every
// other HugMesh remote (admin/games convention).
const { hugmeshRemote } = require('./federation-base');

module.exports = hugmeshRemote({
  name: 'character-studio',
  exposes: {
    './routes': './src/app/character-studio.routes.ts',
  },
  // pixi.js is a leaf WebGL render lib (not part of the cross-remote contract)
  // — bundle it into this remote rather than share it as a federation singleton.
  extraSkip: ['pixi.js'],
});
