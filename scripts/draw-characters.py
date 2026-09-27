"""Generate original 32px-grid pixel pets at the existing 64x64 sprite size.
Run with python3 scripts/draw-characters.py (Pillow required)."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / 'src/assets/characters'
PETS = {
    'miso': {'name': 'Cat', 'coat': '#d49162', 'shadow': '#975c3f', 'light': '#efb780', 'ear': '#d78592', 'belly': '#ffe9c5'},
    'puddle': {'name': 'Frog', 'coat': '#82bd75', 'shadow': '#4d8258', 'light': '#b0d38a', 'ear': '#dca4a9', 'belly': '#d8e8ad'},
    'pip': {'name': 'Fox', 'coat': '#d88953', 'shadow': '#9c5039', 'light': '#eea968', 'ear': '#a85259', 'belly': '#fff0d2'},
}
INK = '#29242e'

def sprite(pet, state, tier=1, frame=0):
    p = PETS[pet]
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ox = frame % 2 if state in ('idle', 'computer') else 0
    oy = 1 if state == 'sleep' else (frame % 2 if state == 'nudge' else 0)
    def box(x0,y0,x1,y1,c): d.rectangle((x0+ox,y0+oy,x1+ox,y1+oy), fill=c)
    def ell(x0,y0,x1,y1,c): d.ellipse((x0+ox,y0+oy,x1+ox,y1+oy), fill=c)
    def line(points,c,w=1): d.line([(x+ox,y+oy) for x,y in points],fill=c,width=w)
    # feet, tail, body; contour weight and scale echo the original sprite.
    box(11,26,14,29,INK);box(20,26,23,29,INK)
    if pet=='pip':
        d.polygon([(24+ox,24+oy),(30+ox,20+oy),(28+ox,16+oy),(31+ox,15+oy),(31+ox,24+oy),(27+ox,27+oy)],fill=INK)
        d.polygon([(25+ox,23+oy),(29+ox,20+oy),(28+ox,18+oy),(30+ox,17+oy),(30+ox,23+oy),(27+ox,25+oy)],fill=p['light'])
        box(29,17,30,19,p['belly'])
    elif pet=='miso':
        box(25,20,27,23,INK);box(26,19,28,21,p['coat'])
    else:
        box(25,20,26,22,INK)
    ell(8,14,26,28,INK);ell(9,14,25,27,p['coat'])
    ell(12,19,22,27,p['belly'])
    if pet=='puddle':
        ell(7,13,11,21,INK);ell(23,13,27,21,INK)
    else:
        box(7,15,10,22,INK);box(8,15,11,22,p['shadow'])
        box(24,15,27,22,INK);box(23,15,26,22,p['shadow'])
    # head, ears/eye bumps, muzzle. Three distinct silhouettes.
    if pet=='miso':
        d.polygon([(8+ox,11+oy),(8+ox,3+oy),(13+ox,7+oy)],fill=INK)
        d.polygon([(23+ox,7+oy),(28+ox,3+oy),(28+ox,12+oy)],fill=INK)
        d.polygon([(10+ox,9+oy),(10+ox,5+oy),(14+ox,8+oy)],fill=p['ear'])
        d.polygon([(22+ox,8+oy),(26+ox,5+oy),(26+ox,10+oy)],fill=p['ear'])
    elif pet=='pip':
        d.polygon([(7+ox,11+oy),(11+ox,2+oy),(16+ox,9+oy)],fill=INK)
        d.polygon([(20+ox,9+oy),(26+ox,2+oy),(28+ox,12+oy)],fill=INK)
        d.polygon([(10+ox,9+oy),(12+ox,5+oy),(15+ox,9+oy)],fill=p['ear'])
        d.polygon([(22+ox,9+oy),(25+ox,5+oy),(26+ox,10+oy)],fill=p['ear'])
    else:
        ell(8,5,14,11,INK);ell(21,5,27,11,INK)
        ell(9,6,13,10,p['coat']);ell(22,6,26,10,p['coat'])
    ell(7,7,28,20,INK);ell(8,8,27,19,p['coat'])
    ell(10,9,25,14,p['light'])
    if pet=='pip':
        d.polygon([(8+ox,14+oy),(18+ox,17+oy),(27+ox,14+oy),(23+ox,21+oy),(13+ox,21+oy)],fill=p['belly'])
        d.polygon([(13+ox,16+oy),(18+ox,19+oy),(23+ox,16+oy)],fill=p['belly'])
    elif pet=='miso':
        line([(9,17),(6,16)],INK);line([(9,18),(6,19)],INK)
        line([(26,17),(29,16)],INK);line([(26,18),(29,19)],INK)
    if tier >= 4 and state=='idle':
        box(12,12,14,12,INK);box(21,12,23,12,INK)
        line([(17,16),(19,16)],INK)
        box(27,15,28,17,'#9fc6d6')
    elif tier == 3 and state=='idle':
        box(12,12,14,13,INK);box(21,12,23,13,INK)
        box(17,17,19,17,INK)
    elif tier == 2 and state=='idle':
        box(12,12,14,14,INK);box(21,12,23,14,INK)
        box(17,17,18,17,INK)
    elif state=='sleep':
        line([(12,13),(15,14)],INK);line([(20,14),(23,13)],INK)
        box(17,16,19,16,INK)
        # Pixel blanket and pillow turn the same pet into a clear nap pose.
        box(6,26,29,29,INK);box(7,27,28,28,'#9d6570')
        box(10,22,25,27,'#7697ae');box(11,22,24,25,'#b2c8d1')
        box(7,20,10,23,'#f2ddc1')
    elif state=='nudge':
        box(12,12,14,14,INK);box(21,12,23,14,INK)
        box(17,16,20,18,INK);box(18,17,19,18,p['ear'])
        # alert bell in raised paw
        box(26,9,28,14,INK);box(24,11,25,13,'#f1d26b')
        box(27,8,29,12,'#f1d26b')
        if frame: line([(29,6),(30,5)],'#f1d26b');line([(30,14),(31,15)],'#f1d26b')
    else:
        if tier >= 4:
            box(12,12,14,12,INK);box(21,12,23,12,INK)
            box(17,17,19,17,INK)
        elif tier == 3:
            box(12,12,14,13,INK);box(21,12,23,13,INK)
            box(17,16,19,16,INK)
        else:
            box(12,12,14,14,INK);box(21,12,23,14,INK)
            box(17,16,19,16,INK)
        if state=='computer':
            # laptop keyboard below chin, avoiding loss of the face.
            box(19,22,29,27,INK);box(20,23,28,25,'#7ea4af');box(19,27,30,28,'#c5c4be')
            box(23,24,25,24,'#c4edb3')
    if tier>=3 and state not in ('sleep','idle'):
        box(9,17,10,18,'#d18891');box(25,17,26,18,'#d18891')
    if state=='idle' and frame: box(15,16,16,16,p['shadow'])
    return im.resize((64,64),Image.Resampling.NEAREST)

for pet in PETS:
    for tier in range(1,5):
        for state in ('idle','computer'):
            folder=ROOT/pet/str(tier)/state;folder.mkdir(parents=True,exist_ok=True)
            for frame in range(2): sprite(pet,state,tier,frame).save(folder/f'{frame+1}.png')
    for state in ('sleep','nudge'):
        folder=ROOT/pet/state;folder.mkdir(parents=True,exist_ok=True)
        for frame in range(2): sprite(pet,state,1,frame).save(folder/f'{frame+1}.png')
