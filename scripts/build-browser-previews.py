#!/usr/bin/env python3
"""Build versioned browser derivatives; never replace approved source media."""
import argparse
import json
import os
from pathlib import Path
import subprocess


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name,width,height,pix_fmt:format=duration,size,bit_rate',
        '-of', 'json', str(path)], text=True))


def encode(source, output, width, rate):
    original = probe(source)
    if not output.exists():
        temporary = output.with_suffix('.partial.mp4')
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
            '-threads', '2', '-i', str(source), '-map', '0:v:0', '-an', '-sn', '-dn',
            '-vf', f'scale=min({width}\\,iw):-2', '-c:v', 'libx264', '-threads', '2',
            '-preset', 'veryfast', '-crf', '21', '-maxrate', rate, '-bufsize', '8M',
            '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.2',
            '-g', '48', '-keyint_min', '48', '-movflags', '+faststart', str(temporary)
        ], check=True)
        encoded = probe(temporary)
        if abs(float(encoded['format']['duration']) - float(original['format']['duration'])) > 0.1:
            raise RuntimeError(f'Duration changed: {source.name}')
        os.replace(temporary, output)
    encoded = probe(output)
    if abs(float(encoded['format']['duration']) - float(original['format']['duration'])) > 0.1:
        raise RuntimeError(f'Invalid existing derivative: {output}')
    print(json.dumps({'file': str(output), 'sourceBytes': int(original['format']['size']),
                      'bytes': int(encoded['format']['size']), 'video': encoded['streams'][0]}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--composite-root', type=Path, required=True)
    parser.add_argument('--site-root', type=Path, required=True)
    args = parser.parse_args()
    encode(args.site_root / 'mustang-study14-reflections-4k.mp4',
           args.site_root / 'mustang-study14-reflections-browser-v1.mp4', 1920, '4M')
    ids = json.loads(args.manifest.read_text())
    # Smoke-test the two commonly demoed plates first.
    ids.sort(key=lambda clip: (not ('0031-' in clip or '0035-' in clip), clip))
    for clip in ids:
        if not clip or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in clip):
            raise ValueError('Invalid clip identifier')
        directory = args.composite_root / clip
        encode(directory / 'composite.mp4', directory / 'browser-preview-v1.mp4', 2048, '4M')
    print('COMPLETE', flush=True)
