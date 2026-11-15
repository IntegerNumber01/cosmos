"""Publish the frozen initial screen, all 13 native vetting records, and explicit dispositions."""
import json
from search_fields import ROOT

WORK=ROOT/'data/work/discovery';OUT=ROOT/'web/public/data/discovery'
FIELDS=['ngc1333','ic348','l1688','serpens','ngc2264','orion_l1641']
NOTES={
 'ngc1333-a':('spectral_ambiguity','ASR 7 / SVS 14','Deep structure near 4.27 microns explains why different local wavelengths can mimic variability. Temporal interpretation rejected; no new molecular claim.'),
 'ngc1333-b':('crowding_and_spectral_ambiguity','2MASS J03285461+3116512','Source is blended with nearby ASR 42, which is the VSX-listed Gaia variable; that VSX match must not be assigned to this target. Continuum fading is also possible, but low-precision EPSF fits and blending prevent a clean attribution.'),
 'l1688-a':('promising_candidate_event','GY 152 / ISO-Oph 77','Two independent Aug16 exposures are fainter in nearby bands; earlier and March measurements agree. Survives multiple aperture radii and reference-star calibration. Known source; event novelty and cause unproven.'),
 'serpens-a':('known_variable_recovered','EC 129 / WVSC 298','About 29.5% brightening at closely matched 4.255-micron wavelengths survives neighbour fitting and field calibration. Original WFCAM catalogue establishes prior variability despite absent VSX/Gaia matches.'),
 'serpens-b':('known_variable_recovered','2MASS J18300341+0116191 / Gaia DR3 4273721849431352960','Known YSO variable in Gaia and VSX. Infrared brightening is interesting, but not a new variable. Nearby source complicates precise deblending.'),
 'serpens-c':('known_variable_recovered','2MASS J18295360+0117017 / Gaia DR3 4273733531743911936','Fading near 1.571 microns. Gaia and VSX already identify variability. Not a new object or variable.'),
 'serpens-d':('known_variable_recovered','V371 Ser / EC 53','Known variable recovered; native apertures and EPSF fits show fading. Not a discovery.'),
 'serpens-e':('crowding_and_spectral_ambiguity','Serpens SVS 4 cluster','Many infrared counterparts inside the aperture and strong wavelength dependence near 4.27 microns. Matched Mar-May EPSF flux is nearly unchanged. No isolated temporal discovery claim.'),
 'serpens-f':('known_variable_with_spectral_caveat','ATO J277.4228+01.1271 / ASASSN-V J182941.47+010737.9','Known variable. The initial D5 wavelengths differ by nearly half a channel near 4.27 microns; the blind-screen amplitude is not a verified temporal amplitude.'),
 'ngc2264-a':('known_variable_chromatic_change','GP Mon','Unresolved known young variable: native differential ratios 2.299 +/- 0.161 at 1.193 microns and 1.111 +/- 0.069 at 3.936 microns over the same two dates.'),
 'ngc2264-b':('known_variable_recovered','GR Mon','Known variable; native fits reproduce approximately 50% short-wavelength brightening. No novelty claim.'),
 'ngc2264-c':('known_variable_recovered','MM Mon','Known variable counterpart; nearby V820 Mon is a different star. Modest near-1.58-micron fading is not a new variable discovery.'),
 'orion-a':('known_variable_and_low_precision','HOPS 193 / 2MASS J05363028-0601173','Park2021 classifies this counterpart as irregular. EPSF errors are about 13% with reduced chi-square >100; the stricter photometry gate rejects the nominal initial significance.'),
}

if __name__=='__main__':
    screens=[json.loads((WORK/f'{f}_screen.json').read_text()) for f in FIELDS]
    records=[]
    for key,(status,identity,note) in NOTES.items():
        p=WORK/'probes'/key
        records.append(dict(label=key,status=status,identity=identity,note=note,
                            native_probe=json.loads((p/'measurements.json').read_text()),catalogues=json.loads((p/'catalogues.json').read_text())))
    assert sum(len(s['candidates']) for s in screens)==len(records)==13
    result=dict(scope='Frozen initial blind screen of six fields; additional follow-up exposures do not change these counts.',
                frames=sum(s['frames'] for s in screens),detections=sum(s['source_detections'] for s in screens),
                source_pair_comparisons=sum(s['source_pair_measurements'] for s in screens),candidates=len(records),
                initial_screens=screens,vetting=records,
                conclusion='Interesting variability and a promising candidate event in known sources; no established new object or proven novelty.')
    (OUT/'candidate-ledger.json').write_text(json.dumps(result,indent=2));print({k:v for k,v in result.items() if k not in ('initial_screens','vetting')})
