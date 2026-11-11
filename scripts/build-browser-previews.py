#!/usr/bin/env python3
"""Build versioned browser derivatives; never replace approved source media.

Three presentation-only derivatives are produced beside each source:

* ``browser-preview-v1.mp4``  one progressive H.264 file. Fallback for browsers
  without adaptive streaming and the source for the standalone Lab.
* ``stream-v1/``              adaptive H.264 ladder (CMAF segments + HLS
  playlists). The player picks a rung from measured throughput, so playback
  starts quickly and keeps running on a marginal connection.
* ``card-preview-v1.mp4``     small progressive file for catalog-card hover.

Every output is written under a temporary name and published atomically.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess

# Two-second closed GOPs at the source frame rate keep every rung switchable
# at every segment boundary.
SEGMENT_SECONDS = 2

# (name, width, height, crf, maxrate). Capped CRF: easy scenes use fewer bits,
# hard scenes never exceed the advertised peak the player budgets for.
HERO_LADDER = [
    ('360p', 640, 360, 26, 450),
    ('540p', 960, 540, 24, 1000),
    ('720p', 1280, 720, 23, 2000),
    ('1080p', 1920, 1080, 21, 4000),
]
# Full 2:1 equirectangular frame; the top rung matches browser-preview-v1.
# Rungs are closest together around 1-2 Mbps, where a marginal connection sits
# and one step makes the most visible difference.
COMPOSITE_LADDER = [
    ('384p', 768, 384, 27, 450),
    ('512p', 1024, 512, 25, 900),
    ('640p', 1280, 640, 25, 1300),
    ('768p', 1536, 768, 24, 1800),
    ('1024p', 2048, 1024, 22, 4000),
]
CARD_PREVIEW = (768, 28, 450)  # width, crf, maxrate kbps


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate:format=duration,size,bit_rate',
        '-of', 'json', str(path)], text=True))


def frame_rate(info):
    numerator, _, denominator = info['streams'][0]['r_frame_rate'].partition('/')
    return float(numerator) / float(denominator or 1)


def check_duration(original, encoded, label):
    if abs(float(encoded['format']['duration']) - float(original['format']['duration'])) > 0.1:
        raise RuntimeError(f'Duration changed: {label}')


def ffmpeg(arguments, threads):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                    '-threads', str(threads), *arguments], check=True)


def encode(source, output, width, rate, options):
    """Single progressive MP4 (unchanged v1 recipe)."""
    original = probe(source)
    if not output.exists():
        temporary = output.with_suffix('.partial.mp4')
        ffmpeg([
            '-i', str(source), '-map', '0:v:0', '-an', '-sn', '-dn',
            '-vf', f'scale=min({width}\\,iw):-2', '-c:v', 'libx264', '-threads', str(options.threads),
            '-preset', 'veryfast', '-crf', '21', '-maxrate', rate, '-bufsize', '8M',
            '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.2',
            '-g', '48', '-keyint_min', '48', '-movflags', '+faststart', str(temporary)
        ], options.threads)
        check_duration(original, probe(temporary), source.name)
        os.replace(temporary, output)
    encoded = probe(output)
    if abs(float(encoded['format']['duration']) - float(original['format']['duration'])) > 0.1:
        raise RuntimeError(f'Invalid existing derivative: {output}')
    print(json.dumps({'file': str(output), 'sourceBytes': int(original['format']['size']),
                      'bytes': int(encoded['format']['size']), 'video': encoded['streams'][0]}), flush=True)


def encode_card(source, output, options):
    """Small hover preview: starts instantly and costs little while browsing."""
    width, crf, rate = CARD_PREVIEW
    original = probe(source)
    if not output.exists():
        gop = round(frame_rate(original) * SEGMENT_SECONDS)
        temporary = output.with_suffix('.partial.mp4')
        ffmpeg([
            '-i', str(source), '-map', '0:v:0', '-an', '-sn', '-dn',
            '-vf', f'scale=min({width}\\,iw):-2:flags=lanczos', '-c:v', 'libx264', '-threads', str(options.threads),
            '-preset', options.preset, '-crf', str(crf), '-maxrate', f'{rate}k', '-bufsize', f'{rate * 2}k',
            '-pix_fmt', 'yuv420p', '-profile:v', 'high',
            '-g', str(gop), '-keyint_min', str(gop), '-sc_threshold', '0',
            '-movflags', '+faststart', str(temporary)
        ], options.threads)
        check_duration(original, probe(temporary), source.name)
        os.replace(temporary, output)
    encoded = probe(output)
    check_duration(original, encoded, str(output))
    print(json.dumps({'file': str(output), 'bytes': int(encoded['format']['size']),
                      'video': encoded['streams'][0]}), flush=True)


def encode_stream(source, output, ladder, options):
    """Adaptive ladder: aligned rungs, fragmented MP4 segments, HLS playlists."""
    original = probe(source)
    master = output / 'master.m3u8'
    if not master.exists():
        source_width = int(original['streams'][0]['width'])
        # Never upscale: drop rungs wider than the source, but always keep one.
        rungs = [rung for rung in ladder if rung[1] <= source_width] or ladder[:1]
        gop = round(frame_rate(original) * SEGMENT_SECONDS)
        temporary = output.with_name(output.name + '.partial')
        shutil.rmtree(temporary, ignore_errors=True)
        temporary.mkdir(parents=True)

        labels = ''.join(f'[s{i}]' for i in range(len(rungs)))
        graph = [f'[0:v:0]split={len(rungs)}{labels}']
        arguments = ['-i', str(source), '-an', '-sn', '-dn']
        for i, (_, width, height, crf, rate) in enumerate(rungs):
            graph.append(f'[s{i}]scale={width}:{height}:flags=lanczos[v{i}]')
        arguments += ['-filter_complex', ';'.join(graph)]
        for i, (_, _, _, crf, rate) in enumerate(rungs):
            arguments += ['-map', f'[v{i}]', f'-crf:v:{i}', str(crf),
                          f'-maxrate:v:{i}', f'{rate}k', f'-bufsize:v:{i}', f'{rate * 2}k']
        arguments += [
            '-c:v', 'libx264', '-threads', str(options.threads), '-preset', options.preset,
            '-pix_fmt', 'yuv420p', '-profile:v', 'high',
            '-g', str(gop), '-keyint_min', str(gop), '-sc_threshold', '0',
            '-f', 'hls', '-hls_time', str(SEGMENT_SECONDS), '-hls_playlist_type', 'vod',
            '-hls_segment_type', 'fmp4', '-hls_flags', 'independent_segments',
            '-hls_fmp4_init_filename', 'init.mp4',
            '-hls_segment_filename', str(temporary / '%v' / 'seg-%03d.m4s'),
            '-master_pl_name', 'master.m3u8',
            '-var_stream_map', ' '.join(f'v:{i},name:{rung[0]}' for i, rung in enumerate(rungs)),
            str(temporary / '%v' / 'index.m3u8'),
        ]
        ffmpeg(arguments, options.threads)
        for name, *_ in rungs:
            check_duration(original, probe(temporary / name / 'index.m3u8'), f'{source.name} {name}')
        if output.exists():
            shutil.rmtree(output)
        os.replace(temporary, output)
    if not master.exists():
        raise RuntimeError(f'Invalid existing stream: {output}')
    total = sum(file.stat().st_size for file in output.rglob('*') if file.is_file())
    print(json.dumps({'stream': str(master), 'bytes': total,
                      'rungs': sorted(p.name for p in output.iterdir() if p.is_dir())}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--composite-root', type=Path, required=True)
    parser.add_argument('--site-root', type=Path, required=True)
    parser.add_argument('--threads', type=int, default=2, help='encoder threads (default 2; shared host)')
    parser.add_argument('--preset', default='medium', help='x264 preset for the ladder and card previews')
    parser.add_argument('--only', action='append', default=[],
                        help='"hero" or a clip identifier; repeatable. Default: everything.')
    args = parser.parse_args()

    def wanted(name):
        return not args.only or name in args.only

    hero = args.site_root / 'mustang-study14-reflections-4k.mp4'
    if wanted('hero'):
        encode(hero, args.site_root / 'mustang-study14-reflections-browser-v1.mp4', 1920, '4M', args)
        encode_stream(hero, args.site_root / 'mustang-study14-reflections-stream-v1', HERO_LADDER, args)
    ids = json.loads(args.manifest.read_text())
    # Smoke-test the two commonly demoed plates first.
    ids.sort(key=lambda clip: (not ('0031-' in clip or '0035-' in clip), clip))
    for clip in ids:
        if not clip or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in clip):
            raise ValueError('Invalid clip identifier')
        if not wanted(clip):
            continue
        directory = args.composite_root / clip
        encode(directory / 'composite.mp4', directory / 'browser-preview-v1.mp4', 2048, '4M', args)
        encode_stream(directory / 'composite.mp4', directory / 'stream-v1', COMPOSITE_LADDER, args)
        encode_card(directory / 'composite.mp4', directory / 'card-preview-v1.mp4', args)
    print('COMPLETE', flush=True)
