"""Create a smaller runtime GLB from Blender's original house export.

Large environment textures are downsampled. The original export and all
authored readable clue textures stay untouched.
"""

import json
import struct
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/levels/house/models/house.glb'
TARGET = ROOT / 'public/levels/house/models/house-runtime.glb'
TEMP = ROOT / 'public/levels/house/models/.house-texture-work'

with SOURCE.open('rb') as source:
    header = source.read(20)
    if header[:4] != b'glTF':
        raise ValueError('Not a GLB file')
    json_size = struct.unpack_from('<I', header, 12)[0]
    metadata = json.loads(source.read(json_size))
    chunk_size, chunk_type = struct.unpack('<I4s', source.read(8))
    if chunk_type != b'BIN\0':
        raise ValueError('Expected a binary GLB chunk')
    binary = source.read(chunk_size)

images = metadata['images']
views = metadata['bufferViews']
replacements = {}
TEMP.mkdir(exist_ok=False)
try:
    for index, image in enumerate(images):
        if image.get('name') in {'Newspaper_front', 'Frame1', 'Daniels Letter', 'Aged Vale Estate Service Record', 'Diary Entry', 'Bloody Scratched Horror Message'}:
            continue
        view = views[image['bufferView']]
        raw = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        mime = image.get('mimeType')
        if mime == 'image/png' and raw[:8] == b'\x89PNG\r\n\x1a\n':
            width, height = struct.unpack_from('>II', raw, 16)
            if min(width, height) < 1024 or len(raw) < 500_000:
                continue
            output_format = '.jpg' if raw[25] == 2 else '.png'
        elif mime == 'image/jpeg' and len(raw) > 500_000:
            output_format = '.jpg'
        else:
            continue
        (TEMP / f'{index}.src').write_bytes(raw)
        (TEMP / f'{index}.format').write_text(output_format)
        replacements[image['bufferView']] = (index, output_format)

    if replacements:
        subprocess.run([
            'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
            str(ROOT / 'scripts/convert-house-textures.ps1'), str(TEMP),
        ], check=True)

    packed = bytearray()
    for index, view in enumerate(views):
        packed.extend(b'\0' * (-len(packed) % 4))
        old_offset = view.get('byteOffset', 0)
        chunk = binary[old_offset:old_offset + view['byteLength']]
        if index in replacements:
            image_index, output_format = replacements[index]
            replacement = TEMP / f'{image_index}{output_format}'
            chunk = replacement.read_bytes()
            images[image_index]['mimeType'] = 'image/jpeg' if output_format == '.jpg' else 'image/png'
        view['byteOffset'] = len(packed)
        view['byteLength'] = len(chunk)
        packed.extend(chunk)
    metadata['buffers'][0]['byteLength'] = len(packed)
    json_bytes = json.dumps(metadata, separators=(',', ':')).encode('utf-8')
    json_bytes += b' ' * (-len(json_bytes) % 4)
    packed.extend(b'\0' * (-len(packed) % 4))
    length = 12 + 8 + len(json_bytes) + 8 + len(packed)
    with TARGET.open('wb') as target:
        target.write(struct.pack('<4sII', b'glTF', 2, length))
        target.write(struct.pack('<I4s', len(json_bytes), b'JSON'))
        target.write(json_bytes)
        target.write(struct.pack('<I4s', len(packed), b'BIN\0'))
        target.write(packed)
    print(f'Compressed {len(replacements)} textures: {SOURCE.stat().st_size / 1e6:.1f} MB -> {TARGET.stat().st_size / 1e6:.1f} MB')
finally:
    for path in TEMP.iterdir():
        path.unlink()
    TEMP.rmdir()
