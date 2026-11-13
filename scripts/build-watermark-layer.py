#!/usr/bin/env python3
"""Build the Plate Lab watermark layer: logos that pop in and out at random.

The layer is a looping, transparent 4096-wide video laid over the upper part of
a 2:1 composite before any browser derivative is encoded. The marks are small
(about the size of the Mistika crosshairs they replace) and numerous: the frame
is divided into a grid and each cell shows one mark at a time, at a random
position for a random few seconds. The schedule is seeded: the same seed
always produces the same layer.

    python3 scripts/build-watermark-layer.py --out watermark-layer-v1.mov
    python3 scripts/build-watermark-layer.py --still 12.5 --out sample.png

Clean source footage is never modified; apply the layer to a copy:

    ffmpeg -i clean.mov -stream_loop -1 -ss <offset> -i watermark-layer-v1.mov \
      -filter_complex '[0:v][1:v]overlay=0:0:shortest=1' ...
"""
import argparse
import random
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

WIDTH, HEIGHT, FPS = 4096, 1216, 24
COLUMNS, ROWS = 8, 5        # one mark per cell at a time: about as dense as the Mistika crosshairs
LOGO_WIDTH = 46             # pixels of the 4096-wide frame; the Mistika crosshair is about 36
MARK_ROWS = 192             # rows of the stacked lockup that hold the mark
PEAK_OPACITY = 0.62
TOP, BOTTOM = 24, 1176      # the 32:9 crop (rows 0-1152) and a little of the Lab margin below it
POP_IN, POP_OUT = 8, 10     # frames
REPO = Path(__file__).resolve().parent.parent
LOGO = REPO / 'web/public/branding/plate-lab-logo.jpeg'


def sprite():
    """The Plate Lab mark alone (no wordmark), on transparency, with a soft dark halo."""
    art = np.asarray(Image.open(LOGO).convert('RGB')).astype(np.float32) / 255
    art = art[:MARK_ROWS]                      # the stacked lockup: mark above, wordmark below
    alpha = np.clip(art.max(axis=2) * 1.2, 0, 1)
    rows, cols = np.where(alpha > 0.12)
    box = (cols.min() - 6, rows.min() - 6, cols.max() + 7, rows.max() + 7)
    colour = np.clip(art / np.maximum(alpha[..., None], 1e-3), 0, 1)
    logo = Image.fromarray((np.dstack([colour, alpha]) * 255).astype(np.uint8)).crop(box)
    logo = logo.resize((LOGO_WIDTH, round(logo.height * LOGO_WIDTH / logo.width)), Image.LANCZOS)
    logo.putalpha(logo.getchannel('A').point(lambda v: min(255, round(v * 1.7))))   # thin lines survive the reduction
    pad = 8
    canvas = Image.new('RGBA', (logo.width + pad * 2, logo.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(logo, (pad, pad))
    mark = np.asarray(canvas).astype(np.float32) / 255
    halo = np.asarray(canvas.getchannel('A').filter(ImageFilter.GaussianBlur(2.2))).astype(np.float32) / 255
    halo = np.clip(halo * 1.6, 0, 1) * 0.5
    # Mark over a black halo, as straight (unpremultiplied) RGBA.
    a = mark[..., 3] + halo * (1 - mark[..., 3])
    rgb = mark[..., :3] * mark[..., 3:4] / np.maximum(a[..., None], 1e-4)
    return Image.fromarray((np.dstack([rgb, a]) * 255).astype(np.uint8))


def schedule(seconds, seed):
    """Per cell: (start, end, column, row, x, y) in frames and unit offsets. Nothing straddles the loop point."""
    rng = random.Random(seed)
    total = round(seconds * FPS)
    events = []
    for column in range(COLUMNS):
        for row in range(ROWS):
            t = rng.randint(0, 3 * FPS)
            while True:
                hold = rng.randint(round(2.6 * FPS), round(5.5 * FPS))
                if t + hold > total - 6:
                    break
                events.append((t, t + hold, column, row, rng.random(), rng.random()))
                t += hold + rng.randint(round(0.4 * FPS), round(2.2 * FPS))
    return events


def render(frame, events, mark, cache):
    canvas = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    cell_width, cell_height = WIDTH / COLUMNS, (BOTTOM - TOP) / ROWS
    for start, end, column, row, rx, ry in events:
        if not start <= frame < end:
            continue
        into, left = frame - start, end - frame
        if into < POP_IN:
            k = (into + 1) / POP_IN
            opacity, size = k, 0.7 + 0.3 * (1 - (1 - k) ** 3)
        elif left <= POP_OUT:
            k = left / POP_OUT
            opacity, size = k, 0.85 + 0.15 * k
        else:
            opacity, size = 1.0, 1.0
        key = (round(size, 3), round(opacity, 3))
        if key not in cache:
            w, h = round(mark.width * size), round(mark.height * size)
            scaled = mark if size == 1 else mark.resize((w, h), Image.LANCZOS)
            r, g, b, a = scaled.split()
            a = a.point(lambda v, o=opacity * PEAK_OPACITY: round(v * o))
            cache[key] = Image.merge('RGBA', (r, g, b, a))
        stamp = cache[key]
        cx = column * cell_width + mark.width / 2 + rx * (cell_width - mark.width)
        cy = TOP + row * cell_height + mark.height / 2 + ry * (cell_height - mark.height)
        canvas.alpha_composite(stamp, (round(cx - stamp.width / 2), round(cy - stamp.height / 2)))
    return canvas


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--seconds', type=float, default=60)
    parser.add_argument('--seed', type=int, default=20261113)
    parser.add_argument('--still', type=float, help='write one PNG frame at this time instead of the video')
    args = parser.parse_args()

    mark, cache = sprite(), {}
    events = schedule(args.seconds, args.seed)
    if args.still is not None:
        render(round(args.still * FPS), events, mark, cache).save(args.out)
        raise SystemExit
    total = round(args.seconds * FPS)
    temporary = args.out.with_suffix('.partial.mov')
    encoder = subprocess.Popen([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{WIDTH}x{HEIGHT}', '-r', str(FPS), '-i', 'pipe:0',
        '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', str(temporary)],
        stdin=subprocess.PIPE)
    for frame in range(total):
        encoder.stdin.write(render(frame, events, mark, cache).tobytes())
    encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError('Layer encode failed')
    temporary.replace(args.out)
    print(f'{args.out}: {total} frames, {len(events)} logo appearances, seed {args.seed}')
