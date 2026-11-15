"""Audit portable follow-up evidence against the original native FITS, not rendered plots.

This verifies provenance and reproducibility, not astrophysical novelty or a global false-alarm rate.
"""
import hashlib
import json
import math
import struct
import numpy as np
from spherex_io import load_l2
from search_fields import ROOT,mask,aperture

OUT=ROOT/'web/public/data/discovery'


def close(a,b,tol=1e-7):
    assert math.isclose(a,b,rel_tol=tol,abs_tol=tol),(a,b)


if __name__=='__main__':
    checks=dict(native_frames=0,native_apertures=0,pair_statistics=0,prepared_checksums=0)
    for name in ('gy152','gpmon','serpensa-deblend'):
        a=json.loads((OUT/f'{name}.json').read_text())
        byfile={r['file']:r for r in a['measurements']}
        for r in a['measurements']:
            im=load_l2(ROOT/r['file']);bad=mask(im,warnings=True)
            assert str(im.header['OBSID'])==r['obsid']
            assert int(im.header['DETECTOR'])==r['det']
            assert str(im.header['DATE-AVG'])==r['date']
            assert r['sourceFits'].startswith('https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/')
            t=r['target']
            if t:
                x,y=t['epsf']['x'],t['epsf']['y'];wl,bw=im.wavelength_at(x,y)
                close(wl,t['wavelength']);close(bw,t['bandwidth'])
                yy,xx=np.indices(im.image.shape);assert not bad[(xx-x)**2+(yy-y)**2<=4].any()
                for radius,stored in t['apertures'].items():
                    native=aperture(im,x,y,bad,radius=float(radius))
                    assert (native is None)==(stored is None)
                    if native:
                        close(native['flux'],stored['flux']);close(native['err'],stored['err']);checks['native_apertures']+=1
            checks['native_frames']+=1
        for p in a['pairs']:
            x,y=byfile[p['file_a']],byfile[p['file_b']]
            assert x['det']==y['det']==p['det']
            assert y['mjd']-x['mjd']>=1
            close(p['dlambda_bw'],abs(p['wave_a']-p['wave_b'])/min(x['target']['bandwidth'],y['target']['bandwidth']))
            logs=np.array([c['logratio'] for c in p['controls']]);med=float(np.median(logs))
            scatter=float(1.4826*np.median(abs(logs-med)))
            assert p['ensemble_n']==len(logs)>=6
            close(med,p['ensemble_offset']);close(scatter,p['ensemble_scatter'])
            delta=math.log(p['flux_b']/p['flux_a'])-med
            err=math.sqrt((p['error_a']/p['flux_a'])**2+(p['error_b']/p['flux_b'])**2+max(.03,scatter)**2)
            close(math.exp(delta),p['ratio']);close(math.exp(delta)*err,p['ratio_error'])
            checks['pair_statistics']+=1
    for name in ('gy152','gpmon'):
        folder=ROOT/'web/public/cache'/name;m=json.loads((folder/'manifest.json').read_text());assert m['complete']
        for f in m['frames']:
            b=(folder/f['file']).read_bytes();assert hashlib.sha256(b).hexdigest()==f['sha256']
            n=struct.unpack_from('<I',b)[0];meta=json.loads(b[4:4+n])
            assert meta['sourceFits']==f['source'];assert meta['cutoutUrl']==f['cutout'];assert meta['release']=='dr1'
            close(meta['target']['ra'],m['target']['ra']);close(meta['target']['dec'],m['target']['dec'])
            checks['prepared_checksums']+=1
    ledger=json.loads((OUT/'candidate-ledger.json').read_text())
    assert ledger['frames']==59 and ledger['source_pair_comparisons']==774 and ledger['candidates']==len(ledger['vetting'])==13
    result=dict(status='passed',checks=checks,scope='Original native FITS headers, flags, local wavelengths, aperture measurements; portable pair statistics; binary cache provenance and SHA256; frozen screen totals. Does not validate novelty or remove unflagged systematics.')
    (OUT/'evidence-audit.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
