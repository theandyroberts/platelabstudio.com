"""Convert an OSM API bounded-area XML download to geometry-only map features."""
import json
import sys
import xml.etree.ElementTree as ET

root = ET.parse(sys.argv[1]).getroot()
nodes = {n.attrib['id']: {'lat': float(n.attrib['lat']), 'lon': float(n.attrib['lon'])} for n in root.findall('node')}
elements = []
for way in root.findall('way'):
    tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
    if not any(k in tags for k in ['highway', 'building', 'waterway', 'railway', 'leisure']) and tags.get('natural') != 'water':
        continue
    geometry = [nodes[n.attrib['ref']] for n in way.findall('nd') if n.attrib['ref'] in nodes]
    if len(geometry) >= 2:
        elements.append({'type': 'way', 'id': int(way.attrib['id']), 'tags': tags, 'geometry': geometry})
print(json.dumps({'elements': elements}))
