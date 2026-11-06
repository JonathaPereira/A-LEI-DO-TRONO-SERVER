"""Original stereo sound palette. Offline DSP; no square waves or 8-bit samples.
Requires numpy/scipy and ffmpeg only to regenerate. Game has no such dependency.
"""
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io.wavfile import write
import subprocess

RATE = 48000
OUT = Path(__file__).resolve().parents[1] / 'assets/audio'
rng = np.random.default_rng(1847)

def low(x, hz):
    return sosfilt(butter(2, hz, fs=RATE, output='sos'), x)

def high(x, hz):
    return x-low(x,hz)

def noise(t, hz=7000):
    return low(rng.normal(0,1,len(t)),hz)

def tone(t, hz, decay=8):
    return np.sin(2*np.pi*hz*t)*np.exp(-decay*t)

def save(name, x, peak=.78, loop=False):
    x=np.asarray(x)
    if x.ndim==1:
        stereo=np.column_stack([x, .94*x])
        for delay,gain in [(0.021,.1),(0.057,.07),(0.113,.04)]:
            shift=int(delay*RATE)
            stereo[shift:,1]+=x[:-shift]*gain
        x=stereo
    # Equal-power fade at boundaries; loops are continuous and free of clicks.
    fade=min(int(.025*RATE),len(x)//8)
    x[:fade]*=np.linspace(0,1,fade)[:,None]
    x[-fade:]*=np.linspace(1,0,fade)[:,None]
    x=np.tanh(x*1.1)
    x=x/max(np.max(np.abs(x)),.001)*peak
    wav=OUT/(name+'.wav')
    write(wav,RATE,np.int16(np.clip(x,-1,1)*32760))
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-c:a','libvorbis','-q:a','6',str(OUT/(name+'.ogg'))],check=True)
    wav.unlink()

def t(seconds): return np.arange(int(RATE*seconds))/RATE

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    a=t(.7)
    snap=high(noise(a),700)*np.exp(-a*70)*.6
    bow=noise(a,1100)*np.exp(-a*18)*.9
    save('ballista',snap+bow+tone(a,124,15)*.4)
    a=t(1.9)
    boom=np.sin(2*np.pi*(62*a+1.8*(1-np.exp(-a*18))))*np.exp(-a*4)*.85
    gravel=noise(a,2800)*np.exp(-a*8)*.6
    save('mortar',boom+gravel)
    a=t(.65)
    save('launch',noise(a,900)*np.exp(-a*13)+tone(a,85,14)*.5)
    a=t(2.0)
    flutter=(.6+.25*np.sin(a*2*np.pi*19)+.15*np.sin(a*2*np.pi*47))
    save('flame_loop',noise(a,2200)*flutter*.8+noise(a,250)*.5,loop=True)
    a=t(.75)
    zap=np.sin(2*np.pi*(950*a-340*a*a)+np.sin(a*2*np.pi*137)*5)
    crack=high(noise(a),1800)*(np.sin(a*2*np.pi*71)>.83)
    save('tesla',(zap*.25+crack*.8)*np.exp(-a*12)+tone(a,210,15)*.3)
    a=t(1.4)
    ice=sum(tone(a,f,4+i*.3)/(i+2) for i,f in enumerate([1436,1903,2783,3521,4723]))
    save('ice',ice+high(noise(a),3200)*np.exp(-a*35)*.17)
    a=t(.95)
    water=np.sin(2*np.pi*(290*a-80*a*a)+np.sin(a*2*np.pi*8)*1.2)*np.exp(-a*7)*.35
    save('poison',water+noise(a,2300)*np.exp(-a*18)*.35)
    a=t(.5)
    save('impact',noise(a,3300)*np.exp(-a*28)*.7+tone(a,135,17)*.4,peak=.5)
    a=t(.12)
    save('hover',tone(a,1270,40)*.3+high(noise(a),3000)*np.exp(-a*90)*.18,peak=.18)
    a=t(.35)
    save('click',tone(a,720,23)*.3+tone(a,1080,25)*.2+noise(a,2800)*np.exp(-a*80)*.2,peak=.3)
    a=t(1.7)
    sweep=noise(a,2600)*np.sin(np.minimum(a/.7,1)*np.pi)**2*np.exp(-a*2)*.28
    for name,notes in [('reveal',[392,587.33,783.99]),('upgrade',[523.25,659.25,783.99,1046.5]),('card',[440,659.25,880]),('wave',[196,293.66,392])]:
        x=sweep.copy()
        for j,f in enumerate(notes):
            start=int(j*.065*RATE)
            x[start:]+=tone(a[:len(a)-start],f,4.5)*.18
            x[start:]+=tone(a[:len(a)-start],f*2.01,6)*.035
        save(name,x)
    a=t(1.5)
    save('leak',tone(a,83,5)*.5+tone(a,121,6)*.3+noise(a,2100)*np.exp(-a*17)*.25)
    a=t(3.8)
    for name,chord in [('victory',[261.63,329.63,392,523.25]),('defeat',[146.83,174.61,220])]:
        x=sum(tone(a,f,1.5)*.22 for f in chord)+noise(a,500)*np.exp(-a*2)*.08
        save(name,x)
    # Cinematic ambient bed: soft layered sine partials, slow envelopes and stereo space.
    a=t(48.0)
    music=np.zeros((len(a),2))
    chords=[[146.83,220,293.66,349.23],[130.81,196,261.63,329.63],[116.54,174.61,233.08,293.66],[130.81,196,261.63,349.23]]
    for bar,chord in enumerate(chords):
        local=a-bar*12.0
        env=np.clip(local/2,0,1)*np.clip((14-local)/3,0,1)
        for i,f in enumerate(chord):
            pad=(np.sin(2*np.pi*f*a+np.sin(a*.14+i)*.08)+np.sin(2*np.pi*f*1.0017*a)*.35+np.sin(2*np.pi*f*2*a)*.08)*env*.085
            music[:,0]+=pad*(.8+i*.06)
            music[:,1]+=pad*(1.0-i*.05)
        for beat in range(8):
            start=int((bar*12+beat*1.5)*RATE)
            note_t=t(min(3.0,48-start/RATE))
            f=chord[beat%4]*2
            pluck=tone(note_t,f,2.1)*.085+tone(note_t,f*2.003,4)*.015
            music[start:start+len(pluck),beat%2]+=pluck
            delay=int(.375*RATE)
            size=min(len(pluck),len(a)-start-delay)
            if size>0: music[start+delay:start+delay+size,1-beat%2]+=pluck[:size]*.35
    save('music',music,peak=.55,loop=True)
    # Wet forest ambience. No harsh white noise; low wind, filtered water, distant soft calls.
    a=t(24.0)
    wind=noise(a,380)*(.65+.2*np.sin(a*.37))*.5
    water=noise(a,3700)*(.1+.04*np.sin(a*1.13))
    ambience=np.column_stack([wind+water,wind*.9+np.roll(water,3300)])
    for j in range(8):
        start=int((1+j*2.75)*RATE)
        bird=t(.4)
        chirp=np.sin(2*np.pi*(1800*bird+250*bird*bird))*np.sin(np.pi*bird/.4)**2*.024
        ambience[start:start+len(chirp),j%2]+=chirp
    save('ambience',ambience,peak=.35,loop=True)
    print('19 sons originais; estéreo 48 kHz, Vorbis qualidade 6.')

if __name__=='__main__': main()
