import sys
from astropy.io import fits
for p in sys.argv[1:]:
    print("=====", p)
    with fits.open(p) as h:
        h.info()
        for ext in h:
            if ext.name in ("IMAGE",):
                hdr = ext.header
                for k in list(hdr.keys()):
                    if k in ("COMMENT","HISTORY",""): continue
                    print(f"  {k:10s} = {hdr[k]!r}  / {hdr.comments[k]}")
