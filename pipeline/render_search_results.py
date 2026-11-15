"""Rebuild portable, real-data discovery-search figures and measurement records.

Reprojection is for display only; every quoted flux comes from native-pixel photometry.
No generated/simulated sky images are used.
"""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.ndimage import map_coordinates
from spherex_io import load_l2
from search_fields import ROOT,mask,clean_json

WORK=ROOT/'data/work/discovery'
OUT=ROOT/'web/public/data/discovery'
OUT.mkdir(parents=True,exist_ok=True)
plt.rcParams.update({'font.size':10,'figure.dpi':160,'axes.spines.top':False,'axes.spines.right':False})


def savefig(fig,name):
    fig.savefig(OUT/f'{name}.png',bbox_inches='tight',facecolor='white')
    fig.savefig(OUT/f'{name}.pdf',bbox_inches='tight',facecolor='white')
    plt.close(fig)


def assessment(name):
    return json.loads((WORK/'assessments'/name/'photometry.json').read_text())


def stamp(row,ra,dec,half=30):
    im=load_l2(ROOT/row['file']);bad=mask(im,warnings=True)
    target=row['target'];fit=target['epsf']
    east=np.linspace(half,-half,101);north=np.linspace(-half,half,101)
    e,n=np.meshgrid(east,north)
    x,y=im.wcs.world_to_pixel_values(ra+e/3600/np.cos(np.deg2rad(dec)),dec+n/3600)
    z=map_coordinates(im.image,[y,x],order=1,mode='constant',cval=np.nan)
    invalid=map_coordinates(bad.astype(float),[y,x],order=0,mode='constant',cval=1)>0
    z[invalid]=np.nan
    # Background from the independent Gaussian fit; same linear scale across epochs in each row.
    z-=target['gaussian']['bkg']
    return z


def montage(name,title,groups):
    a=assessment(name)
    ncols=max(sum(bool(r['target'] and select(r)) for r in a['measurements']) for _,select in groups)
    fig,axes=plt.subplots(len(groups),ncols,figsize=(3.2*ncols,3.5*len(groups)),squeeze=False)
    for group_index,(label,select) in enumerate(groups):
        rows=[r for r in a['measurements'] if r['target'] and select(r)]
        zs=[stamp(r,a['ra'],a['dec']) for r in rows]
        vmax=max(np.nanmax(z) for z in zs);vmin=-vmax*.07
        for ax in axes[group_index]:ax.set_visible(False)
        for ax,r,z in zip(axes[group_index],rows,zs):
            ax.set_visible(True)
            ax.imshow(z,origin='lower',extent=(30,-30,-30,30),vmin=vmin,vmax=vmax,cmap='gray_r',interpolation='nearest')
            ax.plot(0,0,'+',color='#c43834',markersize=10,markeredgewidth=1)
            ax.set_title(r['date'][:10]+' '+r['date'][11:16]+' UTC\n'+f"{r['target']['wavelength']:.5f} µm",fontsize=10)
            ax.set_xlabel('East offset (arcsec)');ax.set_ylabel('North offset (arcsec)')
        axes[group_index,0].text(-.47,.5,label,transform=axes[group_index,0].transAxes,rotation=90,va='center',fontsize=11,fontweight='bold')
    fig.suptitle(title+'\nSPHEREx DR1 · same linear display scale within each row · red cross = counterpart',fontsize=13,y=1.025)
    fig.tight_layout(w_pad=3.5);savefig(fig,name+'-images')


def gy152():
    a=assessment('gy152');eps=[p for p in a['pairs'] if p['method']=='epsf']
    fig,axes=plt.subplots(1,2,figsize=(11,3.8))
    for ax,centre,anchor,label,color in zip(axes,[3.85,3.92],['2025-08-10','2025-08-13'],['near 3.85 µm','near 3.92 µm'],['#146ba3','#b04b28']):
        rows=[r for r in a['measurements'] if abs(r['target']['wavelength']-centre)<.025]
        base=next(r for r in rows if r['date'].startswith(anchor))
        for i,r in enumerate(rows):
            if r is base:
                ratio=1.;error=base['target']['epsf']['flux_err']/base['target']['epsf']['flux']
            else:
                p=next(p for p in eps if p['file_a']==base['file'] and p['file_b']==r['file'])
                ratio=p['ratio'];error=p['ratio_error']
            ax.errorbar(i,ratio,yerr=error,fmt='o',color=color,capsize=4)
        ax.set_xticks(range(len(rows)),[r['date'][:10] for r in rows],rotation=25,ha='right')
        ax.axhline(1,color='.5',ls='--',lw=1);ax.set_ylim(.63,1.14);ax.set_title(label)
        ax.set_ylabel('Field-calibrated EPSF flux / reference date')
    fig.suptitle('GY 152: an apparent infrared dip on 16 August 2025',fontsize=14)
    fig.text(.5,-.12,'Independent exposures at 08:22 and 14:57 UTC; channel wavelengths differ slightly.\nError bars include comparison-star scatter and a 3% floor. Shared reference dates correlate the ratios.\nDates are categorical; their spacing does not represent elapsed time.',ha='center',fontsize=9)
    fig.tight_layout();savefig(fig,'gy152-lightcurve')
    montage('gy152','GY 152 · known young source, candidate dimming event',[
        ('near 3.85 µm',lambda r:r['target']['wavelength']<3.89),
        ('near 3.92 µm',lambda r:r['target']['wavelength']>=3.89)])


def gpmon():
    a=assessment('gpmon');pairs=[p for p in a['pairs'] if p['method']=='epsf']
    fig,ax=plt.subplots(figsize=(7,4))
    for i,p in enumerate(pairs):
        ax.errorbar(i,p['ratio'],yerr=p['ratio_error'],fmt='o',capsize=5,color='#146ba3',ms=8)
    ax.set_xticks(range(len(pairs)),[f"{p['wave_a']:.4f} → {p['wave_b']:.4f} µm\nD{p['det']}; {p['ensemble_n']} field controls" for p in pairs])
    ax.axhline(1,color='.5',ls='--');ax.set_ylabel('11 November / 29 September 2025 flux ratio')
    ax.set_ylim(.8,2.65);ax.set_title('GP Mon: much stronger brightening at the shorter wavelength')
    fig.tight_layout();savefig(fig,'gpmon-chromatic')
    montage('gpmon','GP Mon · known unresolved young variable system',[
        ('near 1.19 µm',lambda r:r['det']==2),('near 3.94 µm',lambda r:r['det']==5)])


def asr7():
    a=json.loads((WORK/'probes/ngc1333-a/measurements.json').read_text())
    rows=[r for r in a['rows'] if r['det']==5 and r['clean_centroid'] and r['epsf'] and r['epsf'].get('ok') and r['apertures']['3.0']]
    inv=json.loads((ROOT/'data/raw/discovery/ngc1333/frames.json').read_text())
    urls={(r['obs_id'],r['det']):r['url'] for r in inv if 'obs_id' in r}
    for row in rows:row['sourceFits']=urls.get((row['obsid'],row['det']))
    fig,ax=plt.subplots(figsize=(9,4))
    for year,color,marker in [('2025','#b04b28','o'),('2026','#146ba3','s')]:
        q=[r for r in rows if r['date'].startswith(year)]
        ax.errorbar([r['wavelength'] for r in q],[r['epsf']['flux'] for r in q],
                    xerr=[r['bandwidth']/2 for r in q],yerr=[r['epsf']['flux_err'] for r in q],fmt=marker,color=color,
                    label='August 2025' if year=='2025' else 'February 2026',capsize=2)
    ax.axvspan(4.23,4.30,color='#e9c568',alpha=.22,label='CO₂ band region (interpretation)')
    ax.set_xlabel('Local wavelength (µm; horizontal bars = half bandwidth)')
    ax.set_ylabel('Native EPSF flux (MJy/sr × pixel)')
    ax.set_title('ASR 7: spectral structure can imitate a time-domain change')
    ax.legend(loc='lower left',fontsize=9)
    fig.text(.5,-.04,'Clean 3-pixel aperture required. Points sample different dates and detector positions; no spectral interpolation or temporal claim.',ha='center',fontsize=9)
    fig.tight_layout();savefig(fig,'asr7-spectrum')
    (OUT/'asr7-spectrum.json').write_text(json.dumps(clean_json(dict(name='ASR 7',ra=a['ra'],dec=a['dec'],
         status='Spectral feature consistent with CO2 absorption; apparent temporal candidate vetoed. Not a molecular discovery.',
         units='MJy/sr times pixel; EPSF stamp-normalized flux',measurements=rows)),indent=2))


if __name__=='__main__':
    for name in ('gy152','gpmon','serpensa-deblend','oriona'):
        a=assessment(name)
        a['units']='MJy/sr times native pixel; relative EPSF and aperture fluxes, not absolute calibrated catalogue photometry'
        a['interpretation']='Exploratory follow-up of a blind DR1 search. Known counterpart. No claim of a new astronomical object or proven event novelty.'
        field={'gy152':'l1688','gpmon':'ngc2264','serpensa-deblend':'serpens','oriona':'orion_l1641'}[name]
        inv=json.loads((ROOT/'data/raw/discovery'/field/'frames.json').read_text())
        urls={(r['obs_id'],r['det']):r['url'] for r in inv if 'obs_id' in r}
        for row in a['measurements']:
            row['sourceFits']=urls.get((row['obsid'],row['det']))
        (OUT/f'{name}-pairs.csv').write_text('method,date_a,date_b,det,wave_a,wave_b,dlambda_bw,ratio,ratio_error,dmag,ensemble_n,ensemble_scatter\n'+
             ''.join(','.join(str(p[k]) for k in ('method','date_a','date_b','det','wave_a','wave_b','dlambda_bw','ratio','ratio_error','dmag','ensemble_n','ensemble_scatter'))+'\n' for p in a['pairs']))
        (OUT/f'{name}.json').write_text(json.dumps(a,indent=2))
    prior={}
    for name in ('gy152','serpensa','oriona'):
        prior[name]={}
        for p in (WORK/'prior'/name).glob('*.json'):
            prior[name][p.stem]=json.loads(p.read_text())
    (OUT/'prior-catalogues.json').write_text(json.dumps(prior,indent=2))
    gy152();gpmon();asr7()
    print('Portable evidence written to',OUT)
