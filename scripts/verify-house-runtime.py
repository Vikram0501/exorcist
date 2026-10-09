"""Check that the runtime GLB retains the authored diary page unchanged."""

import hashlib
import json
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[1]
digests = []
for name in ('source-assets/house.glb', 'public/levels/house/models/house-runtime.glb'):
    path = root / name
    with path.open('rb') as source:
        header = source.read(20)
        json_size = struct.unpack_from('<I', header, 12)[0]
        data = json.loads(source.read(json_size))
        assert any(node.get('name') == 'Diary Entry' for node in data['nodes'])
        image = next(image for image in data['images'] if image.get('name') == 'Diary Entry')
        view = data['bufferViews'][image['bufferView']]
        source.seek(20 + json_size + 8 + view.get('byteOffset', 0))
        digest = hashlib.sha256(source.read(view['byteLength'])).hexdigest()
        digests.append(digest)
        print(name, path.stat().st_size, 'bytes', 'Diary Entry SHA256', digest)
assert digests[0] == digests[1], 'Diary Entry texture changed during optimization'
