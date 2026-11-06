"""Author the Vesper hero asset, rig and baked animation clips with Blender 4.3+.

Run: blender -b --factory-startup -t 4 --python scripts/art/build_vesper.py
All geometry and materials are original. The output is an editable .blend and GLB.
"""
import bpy
import math
import random
from mathutils import Vector, Matrix
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "godot/assets/models/vesper"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(23)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials):
    bpy.data.materials.remove(block)
parts = []


def material(name, color, metal=0, rough=.45, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    if emission:
        p.inputs["Emission Color"].default_value = (*color, 1)
        p.inputs["Emission Strength"].default_value = emission
    return m


obsidian = material("Obsidian | cold forged steel", (.045, .055, .082), .82, .29)
silver = material("Palladium | worn cutting edges", (.44, .47, .53), .82, .28)
recess = material("Recessed midnight steel", (.012, .017, .029), .48, .42)
inlay = material("Antique pale gold | engraved oath", (.35, .27, .17), .78, .38)
leather = material("Oxidised charcoal leather", (.022, .018, .032), .05, .72)
fabric = material("Velvet | deep aubergine", (.052, .017, .095), .03, .83)
lining = material("Silk | violet lining", (.13, .025, .23), .10, .62)
violet = material("Amethyst | cut stone", (.23, .035, .51), .48, .19, .35)
light = material("Soul light | violet", (.39, .065, .95), .18, .27, 1.1)
edge_light = material("Blade edge | ionised lilac", (.66, .29, 1.0), .20, .24, 1.0)


def mesh(name, vertices, faces, mat, bone=None, smooth=True, bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = smooth
    if bevel:
        mod = ob.modifiers.new("Hand dressed edge", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.affect = "EDGES"
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if bone:
        group = ob.vertex_groups.new(name=bone)
        group.add(list(range(len(ob.data.vertices))), 1, "REPLACE")
    parts.append(ob)
    return ob


def curve(name, points, radius, mat, bone=None):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 8
    data.bevel_depth = radius
    data.bevel_resolution = 2
    if len(points) > 12 or "bezel" in name or "silver chased rim" in name:
        spl = data.splines.new("POLY")
        spl.points.add(len(points)-1)
        for bp,pt in zip(spl.points,points): bp.co=(*pt,1)
    else:
        spl = data.splines.new("BEZIER")
        spl.bezier_points.add(len(points) - 1)
        for bp, pt in zip(spl.bezier_points, points):
            bp.co = pt
            bp.handle_left_type = "AUTO"
            bp.handle_right_type = "AUTO"
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob.select_set(False)
    ob.data.materials.append(mat)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    if bone:
        g = ob.vertex_groups.new(name=bone)
        g.add(list(range(len(ob.data.vertices))), 1, "REPLACE")
    parts.append(ob)
    return ob


def ellipsoid(name, at, scale, mat, bone, seg=32, rings=16):
    vs, fs = [], []
    for j in range(rings + 1):
        phi = math.pi * j / rings
        for i in range(seg):
            a = 2 * math.pi * i / seg
            vs.append(tuple(Vector(at) + Vector((math.sin(phi) * math.cos(a) * scale[0],
                math.sin(phi) * math.sin(a) * scale[1], math.cos(phi) * scale[2]))))
    for j in range(rings):
        for i in range(seg):
            q = j * seg + i
            nq = j * seg + (i + 1) % seg
            fs.append((q, nq, nq + seg, q + seg))
    return mesh(name, vs, fs, mat, bone)


def tube(name, points, radii, mat, bone, sides=12):
    vs, fs = [], []
    points = [Vector(p) for p in points]
    for j, p in enumerate(points):
        tangent = (points[min(j + 1, len(points)-1)] - points[max(j - 1, 0)]).normalized()
        n = tangent.cross(Vector((0, 1, 0))).normalized()
        if n.length < .1:
            n = Vector((1, 0, 0))
        b = tangent.cross(n).normalized()
        r = radii[j]
        rx, ry = (r, r) if isinstance(r, (float, int)) else r
        for i in range(sides):
            a = i / sides * math.tau
            vs.append(tuple(p + n * math.cos(a) * rx + b * math.sin(a) * ry))
    for j in range(len(points)-1):
        for i in range(sides):
            a = j * sides + i
            b = j * sides + (i + 1) % sides
            fs.append((a, b, b+sides, a+sides))
    fs += [tuple(range(sides-1, -1, -1)), tuple((len(points)-1)*sides+i for i in range(sides))]
    return mesh(name, vs, fs, mat, bone)


def gem(name, at, width, height, bone, mat=violet):
    x,y,z = at
    vs = [(x, y-.06, z+height), (x+width,y-.055,z), (x,y-.06,z-height),
          (x-width,y-.055,z), (x,y-.15,z), (x,y+.02,z)]
    fs = [(4, i, (i+1)%4) for i in range(4)] + [(5,(i+1)%4,i) for i in range(4)]
    ob = mesh(name, vs, fs, mat, bone, False)
    curve(name+" | bezel", [vs[0],vs[1],vs[2],vs[3],vs[0]], .012, silver, bone)
    return ob


def plate(name, outline, y, bulge, mat, bone, trim=True):
    # Sculpted domed polygon: nested rings provide volume, not a flat cutout.
    cx = sum(p[0] for p in outline)/len(outline)
    cz = sum(p[1] for p in outline)/len(outline)
    vs, fs = [], []
    n = len(outline)
    for r in [.01, .35, .72, 1]:
        for x,z in outline:
            yy = y(x,z) if callable(y) else y
            vs.append((cx+(x-cx)*r, yy-bulge*(1-r*r), cz+(z-cz)*r))
    fs.append(tuple(range(n-1,-1,-1)))
    for j in range(3):
        for i in range(n):
            a=j*n+i; b=j*n+(i+1)%n
            fs.append((a,b,b+n,a+n))
    front = len(vs)
    for x,z in outline:
        yy = y(x,z) if callable(y) else y
        vs.append((x,yy+.035,z))
    for i in range(n):
        fs.append((3*n+i,3*n+(i+1)%n,front+(i+1)%n,front+i))
    fs.append(tuple(front+i for i in range(n)))
    ob = mesh(name,vs,fs,mat,bone,True,.008)
    if trim:
        pts = [(x,(y(x,z) if callable(y) else y)-.008,z) for x,z in outline]
        pts.append(pts[0])
        curve(name+" | silver chased rim",pts,.009,silver,bone)
    return ob


def feather(name, start, control, end, width, mat, bone, trim=False):
    a,b,c = Vector(start),Vector(control),Vector(end)
    pts=[]; radii=[]
    for i in range(19):
        t=i/18
        p=a*(1-t)**2+b*2*t*(1-t)+c*t*t
        pts.append(p)
        w=max(.001,width*(math.sin(math.pi*(t*.94+.03))**.65)*(1-t)**.35)
        radii.append((w,.028*(1-t)+.003))
    ob=tube(name,pts,radii,mat,bone,8)
    if trim:
        curve(name+" | spine",[tuple(p+Vector((0,-.033,0))) for p in pts[::3]],.006,silver,bone)
    return ob


# Rig with anatomically located pivots. Rest pose is a relaxed, planted A pose.
bpy.ops.object.armature_add(enter_editmode=True)
rig=bpy.context.object
rig.name="VesperRig"
edit=rig.data.edit_bones
edit.remove(edit[0])
bones={}
def bone(name, head, tail, parent=None):
    b=edit.new(name); b.head=head; b.tail=tail
    if parent: b.parent=edit[parent]
    bones[name]=(Vector(head),Vector(tail))
    return b

bone("root",(0,0,0),(0,0,.3))
bone("pelvis",(0,0,1.87),(0,0,2.10),"root")
bone("spine",(0,0,2.10),(0,0,2.55),"pelvis")
bone("chest",(0,0,2.55),(0,0,3.14),"spine")
bone("neck",(0,0,3.14),(0,0,3.36),"chest")
bone("head",(0,0,3.36),(0,0,3.90),"neck")
for s,suffix in [(1,"R"),(-1,"L")]:
    bone("clavicle."+suffix,(0,0,3.06),(s*.48,0,3.04),"chest")
    bone("upper_arm."+suffix,(s*.48,0,3.04),(s*.69,-.015,2.40),"clavicle."+suffix)
    bone("forearm."+suffix,(s*.69,-.015,2.40),(s*.77,-.12,1.89),"upper_arm."+suffix)
    bone("hand."+suffix,(s*.77,-.12,1.89),(s*.78,-.15,1.64),"forearm."+suffix)
    bone("thigh."+suffix,(s*.24,0,1.89),(s*.26,-.045,1.04),"pelvis")
    bone("shin."+suffix,(s*.26,-.045,1.04),(s*.29,0,.24),"thigh."+suffix)
    bone("foot."+suffix,(s*.29,0,.24),(s*.29,-.29,.10),"shin."+suffix)
for j,x in enumerate([-.48,-.18,.18,.48]):
    parent="chest"
    for k,z in enumerate([3.0,2.15,1.25]):
        name=f"cape.{j}.{k}"
        bone(name,(x,.20+(3-z)*.18,z),(x,.35+(3-z)*.18,z-.75),parent)
        parent=name
bpy.ops.object.mode_set(mode="OBJECT")
rig.select_set(False)

# Anatomy is hidden under fitted metal and cloth but gives the armour real volume.
ellipsoid("Padded anatomical torso",(0,.015,2.66),(.46,.235,.65),leather,"chest")
ellipsoid("Fitted waist",(0,.01,2.17),(.30,.20,.35),leather,"spine")
ellipsoid("Padded pelvis",(0,0,1.89),(.37,.22,.29),leather,"pelvis")
tube("Gorget",[(0,0,3.08),(0,0,3.35)],[(.22,.19),(.17,.16)],recess,"neck",32)
for i in range(4):
    z=3.14+i*.052
    curve("Gorget silver lamella",[(-.17,-.12,z),(0,-.19,z-.025),(.17,-.12,z)],.008,silver,"neck")

# Breastplate: a pointed split cuirass, interlocking ribs and an amethyst oath seal.
for s in [-1,1]:
    outline=[(s*.025,3.10),(s*.28,3.14),(s*.49,2.99),(s*.43,2.75),(s*.13,2.59),(s*.025,2.69)]
    plate("Split breastplate",outline,lambda x,z:-.19+.08*abs(x),.17,obsidian,"chest")
    curve("Cuirass chased inlay",[(s*.055,-.282,3.035),(s*.22,-.342,2.99),(s*.38,-.25,2.94)],.006,inlay,"chest")
    for i in range(5):
        z=2.67-i*.108
        w=.35-i*.012
        plate("Articulated abdominal lamella",[(s*.012,z+.04),(s*w,z+.10),(s*(w+.025),z-.025),(s*.045,z-.11)],-.205,.04,obsidian,"spine" if i>2 else "chest")
gem("Oath amethyst",(0,-.36,2.96),.105,.16,"chest",light)
for s in [-1,1]:
    curve("Silver heart tracery",[(s*.025,-.36,2.90),(s*.11,-.315,2.77),(s*.19,-.27,2.79),(s*.24,-.265,2.85)],.009,silver,"chest")
    curve("Hanging oath chain",[(s*.16,-.30,3.08),(s*.22,-.34,2.93),(s*.34,-.28,2.93),(s*.44,-.22,3.04)],.009,inlay,"chest")

# Sculptural raven pauldrons; each feather is a tapered, curved solid.
for s,suffix in [(1,"R"),(-1,"L")]:
    bn="upper_arm."+suffix
    ellipsoid("Pauldron undercup",(s*.51,.015,3.07),(.32,.30,.21),recess,bn)
    for row in range(3):
        for j in range(5-row):
            x=s*(.35+j*.10)
            p0=(x,.04+row*.10,3.18-row*.075)
            p1=(s*(.60+j*.115),-.01+row*.15,3.25+(.06 if row==0 else -.18))
            p2=(s*(.78+j*.12),-.04+row*.17,3.38-j*.105-row*.24)
            feather("Raven mantle | forged quill",p0,p1,p2,.105 if row<2 else .13,obsidian,bn,j%2==0)
    gem("Pauldron shard",(s*.60,-.245,3.10),.07,.10,bn)
    for i in range(3):
        x=s*(.43+i*.13)
        feather("Ascending shoulder thorn",(x,.13,3.2),(x+s*.11,.18,3.47),(x+s*.24,.27,3.49-i*.06),.043,silver,bn)

# Arms: fitted anatomy, overlapping bracers, wrist flanges and individual fingers.
for s,suffix in [(1,"R"),(-1,"L")]:
    up="upper_arm."+suffix; lo="forearm."+suffix; hand="hand."+suffix
    tube("Upper arm leather",[(s*.49,0,3.02),(s*.61,0,2.70),(s*.69,-.015,2.4)],[(.15,.15),(.145,.15),(.105,.11)],leather,up,24)
    tube("Forearm fitted vambrace",[(s*.69,-.015,2.4),(s*.74,-.07,2.13),(s*.77,-.12,1.89)],[(.15,.15),(.135,.14),(.08,.09)],obsidian,lo,28)
    ellipsoid("Elbow couter",(s*.69,-.08,2.42),(.17,.17,.12),silver,lo)
    for i in range(4):
        z=2.30-i*.095; x=s*(.72+(2.30-z)*.10)
        plate("Scalloped bracer plate",[(x-.12,z+.035),(x,z+.09),(x+.12,z+.035),(x+.10,z-.035),(x,z-.085),(x-.10,z-.035)],-.15,.07,obsidian,lo)
    gem("Gauntlet seal",(s*.77,-.205,2.10),.045,.065,lo)
    ellipsoid("Palm",(s*.78,-.145,1.78),(.115,.085,.16),leather,hand)
    for finger in range(4):
        x=s*(.70+finger*.055)
        z=1.74-abs(finger-1.5)*.02
        pts=[(x,-.19,z),(x,-.245,z-.09),(x,-.20,z-.18),(x,-.14,z-.19)]
        tube("Gauntlet articulated finger",pts,[.029,.028,.024,.012],obsidian,hand,10)
        for p in pts[1:3]: ellipsoid("Finger knuckle",p,(.034,.031,.026),silver,hand,12,6)
    tube("Opposing thumb",[(s*.68,-.14,1.85),(s*.65,-.23,1.80),(s*.69,-.24,1.73)],[.042,.035,.018],obsidian,hand,12)
    for i in range(3):
        z=1.91-i*.055
        curve("Wrist scallop",[(s*.67,-.15,z),(s*.78,-.22,z-.02),(s*.88,-.15,z)],.009,silver,hand)

# Hip tassets and legs are curved armour shells, with pointed articulated sabatons.
for s,suffix in [(1,"R"),(-1,"L")]:
    th="thigh."+suffix; sh="shin."+suffix; foot="foot."+suffix
    tube("Thigh anatomy",[(s*.24,0,1.91),(s*.25,-.015,1.5),(s*.26,-.045,1.04)],[(.19,.18),(.17,.16),(.12,.13)],leather,th,28)
    for i in range(4):
        z=1.87-i*.125
        plate("Layered hip tasset",[(s*.10,z+.06),(s*.40,z+.09),(s*.46,z-.03),(s*.23,z-.17),(s*.08,z-.10)],-.17,.055,obsidian,th)
    plate("Thigh etched plate",[(s*.12,1.50),(s*.27,1.58),(s*.41,1.45),(s*.37,1.18),(s*.25,1.08),(s*.12,1.20)],-.15,.085,obsidian,th)
    ellipsoid("Patella socket",(s*.26,-.09,1.04),(.15,.16,.145),recess,sh)
    x=s*.26
    plate("Forged pointed poleyn",[(x,1.27),(x+.14,1.12),(x+.105,.99),(x,.89),(x-.105,.99),(x-.14,1.12)],-.16,.095,obsidian,sh)
    tube("Sculpted greave",[(s*.26,-.03,1.0),(s*.27,.0,.65),(s*.29,0,.28)],[(.14,.14),(.155,.135),(.095,.10)],obsidian,sh,32)
    for i in range(4):
        z=.91-i*.125
        x=s*(.27+(0.7-z)*.02)
        plate("Greave chevron",[(x-.12,z),(x,z+.055),(x+.12,z),(x+.09,z-.07),(x,z-.105),(x-.09,z-.07)],-.13,.033,obsidian,sh)
    curve("Greave central silver ridge",[(s*.26,-.205,.95),(s*.27,-.18,.68),(s*.29,-.14,.32)],.012,silver,sh)
    tube("Pointed forged sabaton",[(s*.29,.15,.14),(s*.29,0,.17),(s*.29,-.25,.12),(s*.29,-.46,.07)],[(.11,.12),(.15,.14),(.11,.085),(.012,.015)],obsidian,foot,24)
    for i in range(5):
        y=-.40+i*.105
        curve("Sabatons silver lip",[(s*.29-.10-i*.008,y-.025,.17),(s*.29,y-.055,.235),(s*.29+.10+i*.008,y-.025,.17)],.008,silver,foot)

plate("Oathkeeper front tabard",[(-.20,1.95),(.20,1.95),(.25,1.69),(.18,1.16),(0,.93),(-.18,1.16),(-.25,1.69)],-.245,.023,recess,"pelvis")
gem("Tabard amethyst seal",(0,-.29,1.75),.07,.14,"pelvis")
for s in [-1,1]:
    curve("Tabard silver sigil",[(s*.03,-.28,1.56),(s*.11,-.28,1.40),(s*.06,-.28,1.24),(0,-.28,1.16)],.006,inlay,"pelvis")

# Hood: a sculpted open shell, deeply shadowed mask and a single restrained soul gem.
profiles=[(3.17,.29,.22),(3.34,.31,.25),(3.57,.32,.27),(3.79,.29,.25),(3.96,.16,.18),(4.09,.012,.06)]
vs=[]; fs=[]; seg=40
for j,(z,rx,ry) in enumerate(profiles):
    for i in range(seg+1):
        a=-2.45+i/seg*4.90
        fold=(math.cos(a*9+j*.6)*.006)*(1-j/7)
        vs.append(((rx+fold)*math.sin(a),(ry+fold)*math.cos(a)+.035,z+math.cos(a*5)*.008))
for j in range(len(profiles)-1):
    for i in range(seg):
        q=j*(seg+1)+i
        fs.append((q,q+1,q+seg+2,q+seg+1))
hood=mesh("Sculpted cathedral hood",vs,fs,fabric,"head")
solid=hood.modifiers.new("Woven hood thickness","SOLIDIFY"); solid.thickness=.025
sub=hood.modifiers.new("Tailored hood surface","SUBSURF"); sub.levels=2
bpy.context.view_layer.objects.active=hood
bpy.ops.object.modifier_apply(modifier=solid.name)
bpy.ops.object.modifier_apply(modifier=sub.name)
for s in [-1,1]:
    pts=[]
    for z,rx,ry in profiles:
        a=s*2.45; pts.append((rx*math.sin(a),ry*math.cos(a)+.02,z))
    curve("Hood silver stitched selvedge",pts,.009,silver,"head")
    curve("Hood violet seam",[(x*.94,y-.012,z) for x,y,z in pts],.0035,violet,"head")
ellipsoid("Hollow face | absolute shadow",(0,-.12,3.59),(.20,.09,.30),recess,"head")
plate("Mask of the silent oath",[(-.14,3.79),(0,3.85),(.14,3.79),(.11,3.54),(0,3.35),(-.11,3.54)],-.23,.045,obsidian,"head",False)
gem("Soul face shard",(0,-.30,3.58),.055,.12,"head",light)
for s in [-1,1]:
    curve("Violet gaze slit",[(s*.037,-.276,3.68),(s*.093,-.27,3.70),(s*.14,-.25,3.72)],.008,light,"head")
    curve("Cheek etched blade",[(s*.15,-.245,3.69),(s*.10,-.29,3.53),(s*.035,-.28,3.41)],.01,silver,"head")

# Four weighted silk panels. The irregular hem and sculpted folds are actual mesh.
for panel in range(4):
    center=(-.57+panel*.38)
    cols,rows=18,34
    vs=[]; fs=[]
    for j in range(rows+1):
        t=j/rows
        for i in range(cols+1):
            u=i/cols
            w=.33+t*.24
            x=center*(1+t*.30)+(u-.5)*w
            edge=.08*math.sin(u*math.pi*7+panel*1.7)+.04*math.sin(u*math.pi*17)
            z=3.10-t*(2.83+edge)
            y=.22+t*.48+math.sin(t*2.8+panel*.8)*.1+math.sin(u*math.pi*4+panel)*(.025+.045*t)
            x+=math.sin(t*7+panel)*.035*t
            vs.append((x,y,z))
    for j in range(rows):
        for i in range(cols):
            q=j*(cols+1)+i
            fs.append((q,q+1,q+cols+2,q+cols+1))
    cloak=mesh("Torn silk mantle | panel %d"%panel,vs,fs,fabric)
    cloak.data.materials.append(lining)
    # Two-sided thickness with a violet underside; mesh normals show cloth folds.
    sol=cloak.modifiers.new("Silk underside","SOLIDIFY"); sol.thickness=.008; sol.material_offset=1
    for k in range(3): cloak.vertex_groups.new(name=f"cape.{panel}.{k}")
    for idx,(x,y,z) in enumerate(vs):
        f=max(0,min(2,(3.0-z)/.9)); low=int(f); high=min(2,low+1); blend=f-low
        cloak.vertex_groups[f"cape.{panel}.{low}"].add([idx],1-blend,"REPLACE")
        if high!=low: cloak.vertex_groups[f"cape.{panel}.{high}"].add([idx],blend,"REPLACE")
    bpy.context.view_layer.objects.active=cloak; bpy.ops.object.modifier_apply(modifier=sol.name)
    # Broken luminous stitching follows the hem, leaving the fabric mostly dark.
    for k in range(3):
        i0=int((.12+k*.27)*cols)
        pts=[vs[rows*(cols+1)+i] for i in range(i0,min(cols+1,i0+4))]
        curve("Frayed amethyst silk thread",pts,.0045,violet,f"cape.{panel}.2")

# Cascading forged/torn side feathers break the long coat silhouette.
for s in [-1,1]:
    for j in range(7):
        z=2.9-j*.23
        feather("Raven skirt | layered blade",(s*.33,.08,z),(s*(.63+j*.055),.19,z-.20),(s*(.72+j*.06),.32,z-.64),.105,obsidian,"pelvis" if j>3 else "spine",j%2==0)
    gem("Waist seal",(s*.29,-.23,1.98),.075,.13,"pelvis")

# The crescent polearm: hand-forged spine, luminous inner edge and hanging chain.
hand="hand.R"; sx=.78; sy=-.19
tube("Foice | octagonal black haft",[(sx,sy,.15),(sx,sy,4.72)],[.035,.045],obsidian,hand,16)
for i in range(18):
    z=.45+i*.21
    curve("Haft silver binding",[(sx+.048*math.cos(a),sy+.048*math.sin(a),z+.018*math.sin(a*2)) for a in [j/24*math.tau for j in range(25)]],.006,silver,hand)
for z in [.29,1.38,2.31,3.46,4.58]:
    gem("Haft oathstone",(sx,sy-.04,z),.054,.11,hand,violet)
    for s in [-1,1]:
        feather("Haft thorn",(sx+s*.04,sy,z),(sx+s*.14,sy,z+.10),(sx+s*.15,sy,z+.23),.032,silver,hand)

def bezier(a,b,c,d,t):
    return Vector(a)*(1-t)**3+Vector(b)*3*t*(1-t)**2+Vector(c)*3*t*t*(1-t)+Vector(d)*t**3
arc=[]; widths=[]
for i in range(65):
    t=i/64
    arc.append(bezier((sx,sy,4.65),(-.10,sy,5.28),(-2.11,sy,4.86),(-2.20,sy,3.27),t))
    widths.append(max(.003,.20*(math.sin(t*math.pi*.92+.16)**.8)*(1-t)**.4))
# Lenticular solid blade following an authored cubic spine.
tube("Crescent | folded obsidian blade",arc,[(w,.040*(1-i/65)+.008) for i,w in enumerate(widths)],obsidian,hand,12)
inner=[]; outer=[]
for i,p in enumerate(arc):
    tangent=(arc[min(64,i+1)]-arc[max(0,i-1)]).normalized()
    n=tangent.cross(Vector((0,1,0))).normalized()
    inner.append(tuple(p+n*widths[i]*.96+Vector((0,-.044,0))))
    outer.append(tuple(p-n*widths[i]*.96+Vector((0,-.042,0))))
curve("Crescent | continuous soul edge",inner,.017,edge_light,hand)
curve("Crescent | tempered silver spine",outer,.013,silver,hand)
for i in range(2,52,5):
    p=arc[i]; tangent=(arc[i+1]-arc[i-1]).normalized(); n=tangent.cross(Vector((0,1,0))).normalized()
    feather("Crescent forged vertebra",p-n*widths[i]*.70,p-n*(widths[i]+.13)+Vector((0,0,.09)),p-n*(widths[i]+.20)+Vector((0,0,.13)),.045,silver,hand)
    if i%2==0: gem("Blade inset",tuple(p+Vector((0,-.055,0))),.038,.06,hand,violet)
for i in range(11):
    z=4.53-i*.079
    pts=[]
    for k in range(25):
        a=k/24*math.tau
        if i%2: pts.append((sx+.10,sy+.033*math.cos(a),z+.053*math.sin(a)))
        else: pts.append((sx+.10+.033*math.cos(a),sy,z+.053*math.sin(a)))
    curve("Foice | individually forged chain link",pts,.009,silver,hand)
gem("Chain pendant",(sx+.10,sy-.02,3.64),.071,.15,hand,violet)

# Bind and join by skin to keep runtime draw calls tied to materials, not ornaments.
bpy.ops.object.select_all(action="DESELECT")
for ob in parts: ob.select_set(True)
bpy.context.view_layer.objects.active=parts[0]
bpy.ops.object.join()
body=bpy.context.object
body.name="Vesper | sculpted armour and weighted silk"
mod=body.modifiers.new("Vesper skeletal deformation","ARMATURE"); mod.object=rig
body.parent=rig
# Remove duplicated material slots produced by joining the individually authored parts.
bpy.context.view_layer.objects.active=body
bpy.ops.object.material_slot_remove_unused()

# Weapon tip and grip markers travel with the hand and drive continuous VFX trails.
for name,at in [("ScytheTip",tuple(arc[-1])),("ScytheCrown",tuple(arc[9])),("SoulAnchor",(0,-.40,2.96)),("LeftPalm",(-.78,-.24,1.76))]:
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    obj.parent=rig; obj.parent_type="BONE"; obj.parent_bone="hand.L" if name=="LeftPalm" else "chest" if name=="SoulAnchor" else "hand.R"
    # Bone parenting uses the tail as origin. Preserve the authored world transform.
    bpy.context.view_layer.update()
    obj.matrix_world=Matrix.Translation(at)

scene=bpy.context.scene
scene.render.fps=30
for pb in rig.pose.bones: pb.rotation_mode="XYZ"

def set_pose(frame, rotations=None, locations=None):
    for pb in rig.pose.bones:
        pb.rotation_euler=(0,0,0)
        pb.location=(0,0,0)
    for key,vals in (rotations or {}).items():
        if key in ["root","pelvis","spine","chest","neck","head"]: vals=(vals[0],vals[2],vals[1])
        rig.pose.bones[key].rotation_euler=[math.radians(v) for v in vals]
    for key,val in (locations or {}).items():
        if key=="root": val=(val[0],val[1],-val[2])
        rig.pose.bones[key].location=val
    for panel in range(4):
        for k in range(3):
            pb=rig.pose.bones[f"cape.{panel}.{k}"]
            idle_clip=rig.animation_data.action.name=="Vesper_Idle"
            phase=(frame/144*math.tau if idle_clip else frame*.067)-panel*.64-k*.9
            pb.rotation_euler.x+=math.sin(phase)*(.035+k*.025)
            pb.rotation_euler.y+=math.sin(phase if idle_clip else phase*.8)*.025
    for pb in rig.pose.bones:
        pb.keyframe_insert("rotation_euler",frame=frame,group=pb.name)
        pb.keyframe_insert("location",frame=frame,group=pb.name)

actions=[]
def clip(name,frames,poses):
    action=bpy.data.actions.new(name)
    rig.animation_data_create(); rig.animation_data.action=action
    for frame,rot,loc in poses: set_pose(frame,rot,loc)
    for fc in action.fcurves:
        for key in fc.keyframe_points: key.interpolation="BEZIER"
    action.use_fake_user=True
    actions.append((action,frames))

idle=[]
for f in range(0,145,12):
    s=math.sin(f/144*math.tau)
    idle.append((f,{"chest":(s*.7,0,s*.35),"head":(s*.7,s*.4,0),"hand.L":(0,s*2,0),"upper_arm.L":(0,0,-2+s*.7)}, {"chest":(0,s*.008,0)}))
clip("Vesper_Idle",144,idle)
clip("Vesper_Arrival",114,[
    (0,{"head":(28,0,-5),"chest":(8,0,-4),"upper_arm.R":(-12,0,-14),"forearm.R":(-18,0,0)},{}),
    (27,{"head":(22,0,-2),"chest":(5,0,-2),"upper_arm.R":(-8,0,-12)},{}),
    (62,{"head":(-3,0,8),"chest":(-2,0,5),"upper_arm.R":(-6,0,-5),"hand.L":(-12,15,0)},{}),
    (88,{"head":(0,0,-4),"chest":(0,0,1)},{}),
    (114,{},{}),
])
clip("Vesper_ReapingArc",108,[
    (0,{},{}),
    (16,{"pelvis":(0,0,-12),"chest":(6,0,-24),"upper_arm.R":(-38,12,-30),"forearm.R":(-32,0,-8),"head":(-4,0,20),"thigh.R":(-14,0,0),"shin.R":(18,0,0),"upper_arm.L":(-12,-6,25)}, {"pelvis":(0,-.08,0)}),
    (29,{"pelvis":(0,0,-20),"chest":(3,0,-40),"upper_arm.R":(-65,15,-42),"forearm.R":(-42,0,-10),"head":(0,0,30),"thigh.R":(-18,0,0),"shin.R":(26,0,0)}, {"pelvis":(0,-.13,0)}),
    (37,{"pelvis":(0,0,12),"chest":(-6,0,36),"upper_arm.R":(-70,-20,48),"forearm.R":(-15,-10,10),"head":(3,0,-20),"thigh.L":(-25,0,-5),"shin.L":(20,0,0),"upper_arm.L":(10,10,-35)}, {"root":(0,0,-.60),"pelvis":(0,-.07,0)}),
    (44,{"pelvis":(0,0,20),"chest":(3,0,50),"upper_arm.R":(-20,-28,54),"forearm.R":(-20,-15,12),"head":(0,0,-32),"thigh.L":(-20,0,-4),"shin.L":(24,0,0)}, {"root":(0,0,-.75)}),
    (58,{"pelvis":(0,0,10),"chest":(3,0,22),"upper_arm.R":(-25,10,-12),"forearm.R":(-30,0,0),"head":(0,0,-16)}, {"root":(0,0,-.55)}),
    (78,{"chest":(0,0,-6),"upper_arm.R":(-8,0,-10),"head":(0,0,4)}, {"root":(0,0,-.20)}),
    (108,{},{}),
])
clip("Vesper_Eclipse",162,[
    (0,{},{}),
    (22,{"head":(16,0,0),"chest":(9,0,-10),"upper_arm.L":(-35,-10,-25),"forearm.L":(-30,0,0),"hand.L":(0,-25,15),"upper_arm.R":(-20,0,-15)},{}),
    (48,{"head":(-16,0,0),"chest":(-8,0,-18),"upper_arm.L":(-105,5,-25),"forearm.L":(-25,0,0),"hand.L":(0,10,-18),"upper_arm.R":(-50,0,-15),"forearm.R":(-35,0,0)}, {"root":(0,.16,0)}),
    (72,{"head":(-10,0,4),"chest":(-4,0,-32),"upper_arm.L":(-95,0,-40),"upper_arm.R":(-80,5,-25),"forearm.R":(-45,0,0),"hand.L":(0,20,-15)}, {"root":(0,.32,0)}),
    (83,{"chest":(16,0,45),"pelvis":(3,0,10),"upper_arm.R":(-95,-5,58),"forearm.R":(-8,-15,15),"upper_arm.L":(-12,0,-30),"head":(10,0,-22),"thigh.L":(-22,0,0),"shin.L":(32,0,0)}, {"root":(0,0,-.4),"pelvis":(0,-.20,0)}),
    (96,{"chest":(10,0,32),"upper_arm.R":(-48,0,40),"forearm.R":(-18,0,0),"head":(8,0,-12)}, {"root":(0,0,-.4),"pelvis":(0,-.10,0)}),
    (123,{"upper_arm.R":(-15,0,-12),"head":(3,0,0)}, {"root":(0,0,-.15)}),
    (162,{},{}),
])
clip("Vesper_Ward",108,[
    (0,{},{}),
    (24,{"upper_arm.L":(-85,0,-32),"forearm.L":(-30,0,0),"hand.L":(0,20,0),"chest":(0,0,10),"head":(0,0,-8),"upper_arm.R":(-12,0,-10)},{}),
    (59,{"upper_arm.L":(-90,0,-28),"forearm.L":(-25,0,0),"hand.L":(0,5,15),"chest":(-2,0,12),"head":(-3,0,-10)},{}),
    (108,{},{}),
])
clip("Vesper_Hit",36,[
    (0,{},{}),(7,{"chest":(-13,0,-8),"head":(-18,0,3),"upper_arm.L":(12,0,-12)}, {"root":(0,0,.10)}),
    (16,{"chest":(5,0,4),"head":(8,0,-2)},{}),(36,{},{}),
])

# Extra cape flare and lag follow the body action, with independent segment delays.
for action,length in actions:
    rig.animation_data.action=action
    if action.name=="Vesper_Idle": continue
    for f in range(0,length+1,6):
        scene.frame_set(f)
        for panel in range(4):
            for k in range(3):
                pb=rig.pose.bones[f"cape.{panel}.{k}"]
                t=f/length
                peak=math.exp(-((t-(.43+k*.045))/.15)**2)
                pb.rotation_euler.x+=peak*(.15+k*.13)
                pb.rotation_euler.z+=peak*(panel-1.5)*.15
                pb.rotation_euler.y+=math.sin(t*math.tau*2-panel-k)*(.025+.04*k)
                pb.keyframe_insert("rotation_euler",frame=f,group=pb.name)

# NLA tracks give glTF stable named clips with every animated bone baked.
rig.animation_data.action=None
for action,length in actions:
    track=rig.animation_data.nla_tracks.new(); track.name=action.name
    strip=track.strips.new(action.name,0,action); strip.action_frame_start=0; strip.action_frame_end=length
    strip.mute=False
scene.frame_start=0; scene.frame_end=162; scene.frame_set(0)
for pb in rig.pose.bones:
    pb.rotation_euler=(0,0,0); pb.location=(0,0,0)
for track in rig.animation_data.nla_tracks: track.mute=track.name!="Vesper_Idle"
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"art-source/vesper.blend"),compress=True)
for track in rig.animation_data.nla_tracks: track.mute=False
bpy.ops.export_scene.gltf(filepath=str(OUT/"vesper.glb"),export_format="GLB",use_selection=False,
    export_animations=True,export_animation_mode="NLA_TRACKS",export_nla_strips=True,
    export_force_sampling=True,export_frame_range=False,export_anim_slide_to_zero=True,
    export_apply=False,export_skins=True,export_extras=True,export_yup=True)
print("VESPER_ASSET",len(body.data.vertices),"vertices",len(body.data.polygons),"polygons",len(rig.data.bones),"bones",len(actions),"clips")
