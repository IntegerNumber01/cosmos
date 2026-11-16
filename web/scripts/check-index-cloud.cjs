// Optional public-network integration: a new coordinate, outside all prepared cutouts.
require('./register-ts.cjs');
const assert=require('node:assert/strict');
const {indexObservations}=require('../src/lib/engine/exposureIndex.ts');
const {cloudCutout}=require('../src/lib/engine/cloudCutout.ts');
const {sky2pix,wcsFromHeader}=require('../src/lib/engine/wcs.ts');
async function main(){
 const ra=331.8,dec=-56.7;
 const frames=indexObservations(ra,dec).filter(f=>f.detector===2&&f.estX>100&&f.estX<1900&&f.estY>100&&f.estY<1900);
 assert(frames.length>1);
 const f=frames[0],c=await cloudCutout(f.url,ra,dec,.1);
 const xy=sky2pix(wcsFromHeader(c.header),ra,dec);
 assert(xy[0]>=0&&xy[0]<c.nx&&xy[1]>=0&&xy[1]<c.ny);
 assert(c.data.some(Number.isFinite));assert(c.variance.some(v=>Number.isFinite(v)&&v>0));
 const native=[xy[0]+c.crop.x,xy[1]+c.crop.y];
 const error=Math.hypot(native[0]-f.estX,native[1]-f.estY);assert(error<10);
 console.log(JSON.stringify({result:'PASS',coordinate:{ra,dec},indexedD2Frames:frames.length,source:f.url,nativeDimensions:[c.nx,c.ny],targetPixel:xy,footprintPositionErrorPixels:error,delivery:c.source},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
