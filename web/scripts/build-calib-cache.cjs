// Compatibility entry point. Preparation now uses AWS directly, without a running app or IRSA.
// Keep accepting the former server URL argument; remaining arguments select quick-pick slugs.
// For the original validation Gaia fields, run pipeline/prepare_motion_catalogues.py first.
if (/^https?:\/\//.test(process.argv[2] ?? '')) process.argv.splice(2, 1);
require('./prepare-motion-cache.cjs');
