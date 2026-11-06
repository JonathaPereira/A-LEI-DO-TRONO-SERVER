"""Build the original pt-BR cast locally; models/dependencies never enter the game.

PYTHONPATH=/path/to/python-dependencies python scripts/art/build-voices.py /path/to/models
Use --only hero-id ... to extend the cast without regenerating existing recordings.
Models: kokoro-v1.0.onnx + voices-v1.0.bin from thewh1teagle/kokoro-onnx model-files-v1.0.
Python: kokoro-onnx==0.6.1, onnxruntime, soundfile, espeakng-loader. ffmpeg on PATH.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

import espeakng_loader
from kokoro_onnx import Kokoro
from kokoro_onnx.config import EspeakConfig
import onnxruntime as rt
import soundfile as sf

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('models', type=Path)
parser.add_argument('--only', nargs='+', help='Generate selected heroes, preserving the other clips and manifest entries.')
args = parser.parse_args()
models = args.models
output = root / 'godot/assets/voices'
output.mkdir(parents=True, exist_ok=True)
script = json.loads((root / 'godot/data/voice-lines.json').read_text())
selected = script['heroes'] if not args.only else {hero: script['heroes'][hero] for hero in args.only}
metadata = {'engine': 'Kokoro-82M v1.0 / kokoro-onnx 0.6.1', 'language': 'pt-BR', 'synthetic': True, 'clips': {}}
if args.only:
    metadata = json.loads((output/'manifest.json').read_text())
    for name, entry in metadata['clips'].items():
        if hashlib.sha256((output/name).read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError(f'Existing clip failed integrity: {name}')
generated = 0
options = rt.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
session = rt.InferenceSession(str(models/'kokoro-v1.0.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
engine = Kokoro.from_session(session, str(models/'voices-v1.0.bin'), EspeakConfig(lib_path=espeakng_loader.get_library_path(), data_path=espeakng_loader.get_data_path()))
with tempfile.TemporaryDirectory(prefix='nexus-voice-') as scratch:
    for hero, record in selected.items():
        for event, text in record['lines'].items():
            path = output / f'{hero}-{event}.ogg'
            samples, rate = engine.create(text, voice=record['voice'], lang='pt-br', speed=record['speed'])
            wav = Path(scratch) / 'line.wav'
            sf.write(str(wav), samples, rate)
            pitch = record['pitch']
            filters = f'asetrate={rate}*{pitch},aresample=24000,atempo={1/pitch},highpass=f=85,lowpass=f=10000'
            if hero in {'astra','saira','vesper','maura','ivo','elun'}:
                filters += ',aecho=0.8:0.88:42:0.10'
            filters += ',loudnorm=I=-18:TP=-2.5:LRA=8,afade=t=in:d=0.018'
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-af',filters,'-ar','24000','-ac','1','-c:a','libvorbis','-q:a','3',str(path)], check=True)
            clip = sf.info(str(path))
            metadata['clips'][path.name] = {'hero':hero,'event':event,'text':text,'seconds':round(clip.duration,3),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
            generated += 1
            print(f'{hero}/{event}: {clip.duration:.2f}s', flush=True)
(output/'manifest.json.tmp').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')
(output/'manifest.json.tmp').replace(output/'manifest.json')
print(f"Generated {generated} original voice lines; {len(metadata['clips'])} total.", flush=True)
