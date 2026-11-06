"""Original stereo combat foley. Python + NumPy + SciPy; no external sound samples.
Run from the repository root: python art-source/audio/generate.py
"""
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io.wavfile import write
RATE=48000
OUT=Path(__file__).resolve().parents[2]/'godot/assets/audio'
DURATIONS={'slash':.46,'heavy':.7,'projectile':.42,'fire':.95,'water':.9,'nature':.65,'arcane':.85,'shadow':.8,'heal':1.1,'shield_gain':.7,'shield_hit':.55,'shield_break':.86,'critical':.6,'dot':.22,'charge':.66,'area':1.12,'ui':.16}
def band(signal,lo,hi):
 return sosfilt(butter(2,[lo,hi],btype='bandpass',fs=RATE,output='sos'),signal)
def render(name,variant):
 rng=np.random.default_rng(1202026+list(DURATIONS).index(name)*137+variant*1031)
 duration=DURATIONS[name];t=np.arange(int(duration*RATE))/RATE;n=t.size
 noise=rng.normal(0,1,n);air=band(noise,1800,14000);grit=band(noise,330,5200);low=band(noise,40,650)
 attack=1-np.exp(-t*1300);end=np.minimum(1,(duration-t)/.045).clip(0,1)
 impulse=np.exp(-t*80);body=np.sin(2*np.pi*(45*t+3*(1-np.exp(-t*35))))*np.exp(-t*19)
 sweep=air*np.exp(-t*14)*attack
 # Inharmonic modes suggest physical material without square-wave/buzzer tones.
 metal=sum(np.sin(2*np.pi*f*t+rng.uniform(-.3,.3))*np.exp(-t*d)*a for f,d,a in [(437,15,.1),(1139,22,.09),(2741,31,.06),(4801,47,.035)])
 snap=grit*impulse*.7
 if name=='slash': signal=sweep*.8+grit*np.exp(-t*23)*.45+metal+body*.16
 elif name=='heavy': signal=body*.9+low*np.exp(-t*12)*1.7+grit*np.exp(-t*30)*.65+snap*.4
 elif name=='projectile': signal=snap+body*.3+air*np.exp(-t*35)*.5+metal*.6
 elif name=='fire':
  billow=band(noise,80,4200)*(np.exp(-t*4.2)-np.exp(-t*48))*1.2
  signal=billow+body*.6+snap*.5
  for _ in range(14):
   at=rng.uniform(.05,.7);signal+=air*np.exp(-np.maximum(0,t-at)*110)*(t>=at)*rng.uniform(.04,.13)
 elif name=='water':
  signal=band(noise,350,9500)*(np.exp(-t*4)-np.exp(-t*90))*.9+low*np.exp(-t*9)*.7
  for _ in range(13):
   at=rng.uniform(0,.65);f=rng.uniform(650,1850);phase=np.maximum(0,t-at)
   signal+=np.sin(2*np.pi*(f*phase+f*.4*phase**2))*np.exp(-phase*42)*(t>=at)*.11
 elif name=='nature': signal=grit*np.exp(-t*12)*.65+low*np.exp(-t*20)*1.2+air*np.exp(-t*8)*.2+body*.3
 elif name=='arcane':
  signal=band(noise,600,12000)*(np.exp(-t*6)-np.exp(-t*140))*.5+body*.35
  for f in [384,613,1061,1793,3247]:signal+=np.sin(2*np.pi*(f*t+.2*f*t*t))*np.exp(-t*(6+f/600))*.09
 elif name=='shadow': signal=low*(np.exp(-t*5)-np.exp(-t*70))*1.8+band(noise,550,3600)*np.exp(-t*9)*.5+body*.6
 elif name=='heal':
  signal=band(noise,950,12000)*(np.exp(-t*3.7)-np.exp(-t*35))*.15
  for f,offset in [(523.25,.0),(659.25,.07),(783.99,.12),(1046.5,.22)]:
   phase=np.maximum(0,t-offset);signal+=np.sin(2*np.pi*f*phase)*(1-np.exp(-phase*70))*np.exp(-phase*5)*(t>=offset)*.08
 elif name=='shield_gain': signal=metal*(1-np.exp(-t*80))*2+band(noise,1700,14000)*np.exp(-t*7)*.3+body*.15
 elif name=='shield_hit': signal=metal*3+snap*.6+body*.5+low*np.exp(-t*20)
 elif name=='shield_break':
  signal=metal*2+grit*np.exp(-t*7)*.5+body*.5
  for _ in range(11):
   at=rng.uniform(.03,.5);phase=np.maximum(0,t-at);signal+=band(noise,2700,15000)*np.exp(-phase*65)*(t>=at)*.15
 elif name=='critical': signal=body*.85+grit*np.exp(-t*24)*.7+metal*1.7+air*np.exp(-t*40)*.3
 elif name=='dot': signal=low*np.exp(-t*26)+grit*np.exp(-t*35)*.18+body*.15
 elif name=='charge':
  rise=(t/duration)**1.4;signal=band(noise,250,9000)*rise*(1-np.exp(-t*20))*.65+low*rise*.25
 elif name=='area': signal=low*(np.exp(-t*3.5)-np.exp(-t*95))*1.7+grit*np.exp(-t*8)*.45+body*.6
 else: signal=snap*.28+metal*.15
 signal=np.tanh(signal*1.2)*attack*end
 # Short, decorrelated early reflections preserve body and width without muddy tails.
 left=signal.copy();right=signal.copy()
 for delay,gain in [(.019,.12),(.043,.09),(.083,.045)]:
  offset=int(delay*RATE);left[offset:]+=signal[:-offset]*gain
  offset+=int(.007*RATE);right[offset:]+=signal[:-offset]*gain
 stereo=np.stack([left,right],axis=1);stereo-=stereo.mean(axis=0)
 peak=np.max(np.abs(stereo));stereo*=.88/max(peak,1e-6)
 stereo*=np.minimum(1,(duration-t)/.025).clip(0,1)[:,None]
 return np.round(stereo*32767).astype(np.int16)
OUT.mkdir(parents=True,exist_ok=True)
for name in DURATIONS:
 for variant in range(2):write(OUT/f'{name}-{variant}.wav',RATE,render(name,variant))
print(f'{len(DURATIONS)*2} stereo sounds generated in {OUT}')
