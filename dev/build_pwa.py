#!/usr/bin/env python3
"""Builds the home-screen (PWA) version of Bolsinho into ./pwa from bolsinho.html.
Run again after every change to bolsinho.html:  python3 build_pwa.py
"""
import json, os, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
# no repositório este ficheiro está em dev/ e o site é a raiz; na pasta de trabalho o site vai para pwa/
OUT = os.path.dirname(HERE) if os.path.basename(HERE) == "dev" else os.path.join(HERE, "pwa")
VERSION = "v9"
BG = "#EAF4FC"

SITE = "https://not-warhol.github.io/bolsinho/"

HEAD = """<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Bolsinho">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="{bg}">
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Bolsinho">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{site}icon-512.png">
<meta name="twitter:card" content="summary">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" href="icon-192.png">
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
<script>window.SC_STANDALONE=true;window.SC_VERSION="{version}"</script>
</head>
<body>
"""

TAIL = """
<script>if("serviceWorker" in navigator){const had=!!navigator.serviceWorker.controller;let done=false;
navigator.serviceWorker.addEventListener("controllerchange",()=>{if(had&&!done){done=true;location.reload()}});
addEventListener("load",()=>navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>{r.update();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")r.update()})}).catch(()=>{}))}</script>
</body>
</html>
"""

SW = """const CACHE="bolsinho-%s";
const SHELL=["./","index.html","cartao.html","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const same=new URL(r.url).origin===location.origin;
  if(same){ // app files: network first, so updates arrive; cache when offline
    e.respondWith(fetch(r,{cache:"no-store"}).then(res=>{const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c));return res}).catch(()=>caches.match(r).then(m=>m||caches.match("index.html"))));
  }else{ // libraries and fonts: cache first
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c));return res})));
  }
});
""" % VERSION

MANIFEST = {
    "name": "Bolsinho",
    "short_name": "Bolsinho",
    "description": "Cartões de cliente, bilhetes e vales. Sem contas, sem nuvem.",
    "lang": "pt-PT",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": BG,
    "theme_color": BG,
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
    ],
}


# ---------- icon: a pink pastel card buddy on sky blue, drawn without any image library ----------
def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

TOP, BOTTOM = hexrgb("#DCEFFB"), hexrgb("#E9DEFA")
EDGE, BODY = hexrgb("#A3428F"), hexrgb("#E48ACB")
INK, BLUSH = hexrgb("#2E2547"), hexrgb("#F6A9BC")

def in_rrect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def in_ell(x, y, cx, cy, rx, ry):
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

def color_at(x, y):
    c = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * y) for i in range(3))
    if in_rrect(x, y, .16, .28, .84, .80, .13):
        c = EDGE
    if in_rrect(x, y, .16, .22, .84, .74, .13):
        c = BODY
        for cx in (.30, .70):
            if in_ell(x, y, cx, .55, .055, .03):
                c = tuple(int(BODY[i] * .35 + BLUSH[i] * .65) for i in range(3))
        for cx in (.40, .60):
            if in_ell(x, y, cx, .44, .036, .068):
                c = INK
    return c

def png(size, path, ss=4):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    c = color_at((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            n = ss * ss
            row += bytes((acc[0] // n, acc[1] // n, acc[2] // n))
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


def main():
    os.makedirs(OUT, exist_ok=True)
    src = open(os.path.join(HERE, "bolsinho.html"), encoding="utf-8").read()
    pages = {
        "index.html": ("Bolsinho", "Os seus cartões de cliente, bilhetes e vales. Tudo no telemóvel, sem contas e sem nuvem."),
        # shared-card links point here, so message previews say a card was shared instead of showing the app
        "cartao.html": ("Partilharam um cartão consigo", "Toque para ver o cartão e guardá-lo no Bolsinho."),
    }
    for name, (title, desc) in pages.items():
        head = HEAD.replace("{{", "{").replace("}}", "}").replace("{title}", title).replace("{desc}", desc).replace("{site}", SITE).replace("{bg}", BG).replace("{version}", VERSION)
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(head + src + TAIL)
    with open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8") as f:
        f.write(SW)
    with open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8") as f:
        json.dump(MANIFEST, f, ensure_ascii=False, indent=2)
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    for s in (180, 192, 512):
        p = os.path.join(OUT, f"icon-{s}.png")
        if not os.path.exists(p):
            png(s, p, ss=3 if s > 200 else 4)
    print("Built", OUT)


if __name__ == "__main__":
    main()
