"""Keep the priest mesh, textures, rig, idle, and directional walk clips."""

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source-assets/priest_all_animation.glb'
TARGET = ROOT / 'public/levels/house/models/priest-player.glb'
WALK_DIRECTIONS = {'B', 'BL', 'BR', 'F', 'FL', 'FR', 'L', 'R'}
COMPONENT_SIZES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}

with SOURCE.open('rb') as source:
    header = source.read(20)
    if header[:4] != b'glTF' or struct.unpack_from('<I', header, 4)[0] != 2:
        raise ValueError('Expected a binary glTF 2.0 file')
    json_size = struct.unpack_from('<I', header, 12)[0]
    document = json.loads(source.read(json_size))
    bin_size, bin_type = struct.unpack('<I4s', source.read(8))
    if bin_type != b'BIN\0':
        raise ValueError('Expected a binary GLB chunk')
    binary = source.read(bin_size)

def keep_clip(animation):
    name = animation.get('name', '').split('|')[-1]
    return name == 'HnH_Idle' or (
        name.startswith('HnH_Walk_') and name.removeprefix('HnH_Walk_') in WALK_DIRECTIONS
    )

document['animations'] = [animation for animation in document['animations'] if keep_clip(animation)]
if len(document['animations']) != 9:
    raise ValueError(f'Expected idle and eight walks; found {len(document["animations"])} clips')

used_accessors = set()
for mesh in document['meshes']:
    for primitive in mesh['primitives']:
        used_accessors.update(primitive.get('attributes', {}).values())
        if 'indices' in primitive:
            used_accessors.add(primitive['indices'])
        for target in primitive.get('targets', []):
            used_accessors.update(target.values())
for skin in document.get('skins', []):
    if 'inverseBindMatrices' in skin:
        used_accessors.add(skin['inverseBindMatrices'])
for animation in document['animations']:
    for sampler in animation['samplers']:
        used_accessors.update((sampler['input'], sampler['output']))

old_accessors = document['accessors']
old_views = document['bufferViews']
new_accessors = []
new_views = []
packed = bytearray()
accessor_map = {}

def add_view(data, original):
    packed.extend(b'\0' * (-len(packed) % 4))
    view = {'buffer': 0, 'byteOffset': len(packed), 'byteLength': len(data)}
    for key in ('byteStride', 'target'):
        if key in original:
            view[key] = original[key]
    new_views.append(view)
    packed.extend(data)
    return len(new_views) - 1

for old_index in sorted(used_accessors):
    accessor = old_accessors[old_index].copy()
    old_view = old_views[accessor['bufferView']]
    element_size = COMPONENT_SIZES[accessor['componentType']] * TYPE_COMPONENTS[accessor['type']]
    stride = old_view.get('byteStride', element_size)
    size = stride * (accessor['count'] - 1) + element_size
    start = old_view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    accessor['bufferView'] = add_view(binary[start:start + size], old_view)
    accessor['byteOffset'] = 0
    accessor_map[old_index] = len(new_accessors)
    new_accessors.append(accessor)

for image in document.get('images', []):
    old_view = old_views[image['bufferView']]
    start = old_view.get('byteOffset', 0)
    image['bufferView'] = add_view(binary[start:start + old_view['byteLength']], old_view)

for mesh in document['meshes']:
    for primitive in mesh['primitives']:
        primitive['attributes'] = {name: accessor_map[index] for name, index in primitive.get('attributes', {}).items()}
        if 'indices' in primitive:
            primitive['indices'] = accessor_map[primitive['indices']]
        for target in primitive.get('targets', []):
            for name, index in target.items():
                target[name] = accessor_map[index]
for skin in document.get('skins', []):
    if 'inverseBindMatrices' in skin:
        skin['inverseBindMatrices'] = accessor_map[skin['inverseBindMatrices']]
for animation in document['animations']:
    for sampler in animation['samplers']:
        sampler['input'] = accessor_map[sampler['input']]
        sampler['output'] = accessor_map[sampler['output']]

document['accessors'] = new_accessors
document['bufferViews'] = new_views
document['buffers'] = [{'byteLength': len(packed)}]
json_chunk = json.dumps(document, separators=(',', ':')).encode('utf-8')
json_chunk += b' ' * (-len(json_chunk) % 4)
packed.extend(b'\0' * (-len(packed) % 4))
length = 12 + 8 + len(json_chunk) + 8 + len(packed)
with TARGET.open('wb') as output:
    output.write(struct.pack('<4sII', b'glTF', 2, length))
    output.write(struct.pack('<I4s', len(json_chunk), b'JSON'))
    output.write(json_chunk)
    output.write(struct.pack('<I4s', len(packed), b'BIN\0'))
    output.write(packed)

print(f'{SOURCE.name}: {SOURCE.stat().st_size / 1_000_000:.1f} MB, 99 clips')
print(f'{TARGET.name}: {TARGET.stat().st_size / 1_000_000:.1f} MB, {len(document["animations"])} clips')
