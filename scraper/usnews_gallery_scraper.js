/* ===========================================================================
 * usnews_gallery_scraper.js — MANUAL Chrome scraper for US News car photos.
 *
 * US News photo pages are JavaScript-rendered and lazy-load their images, so
 * this is run BY HAND in the browser. It reads the gallery images already on the
 * page, normalizes them to the full-res "responsiveGallery / webp" URL form, and
 * builds a YAML block for scraper/overrides/vehicle_images.yaml.
 *
 * ───────────────────────────── HOW TO USE ─────────────────────────────
 * 1. Open a vehicle's EXTERIOR photos page, e.g.
 *       https://cars.usnews.com/cars-trucks/hyundai/ioniq-5/photos-exterior
 *    Scroll down a couple of times so the first ~7 thumbnails load.
 * 2. Open DevTools (F12) → Console. Paste this ENTIRE file, press Enter.
 * 3. Run:   shots.grab()        // captures this page (auto-detects ext/int)
 * 4. Open the matching .../photos-interior page, scroll, run  shots.grab()  again.
 * 5. Run:   shots.dump()        // prints + copies a merged YAML block
 *    Paste it under the matching vehicle id in vehicle_images.yaml, then run:
 *       python scraper/processors/fetch_vehicle_images.py --only <vehicle-id>
 *
 * shots.clear()  — reset the saved buffer (start a new vehicle).
 * A one-line bookmarklet that grabs + copies the current page is at the bottom.
 * =========================================================================== */
(function () {
  const PER_PAGE = 7;              // first ~7 photos per page
  const STORE = 'evsense_usnews_shots';

  // Force the high-res gallery variant, matching the URLs already in the YAML.
  function normalize(u) {
    try {
      const url = new URL(u, location.href);
      if (!/\/object\/image\//.test(url.pathname)) return null;
      const t = url.searchParams.get('update-time');
      url.search = '';
      if (t) url.searchParams.set('update-time', t);
      url.searchParams.set('size', 'responsiveGallery');
      url.searchParams.set('format', 'webp');
      return url.href;
    } catch { return null; }
  }

  // Largest candidate from a srcset string ("url 320w, url 640w, ...").
  function fromSrcset(ss) {
    if (!ss) return null;
    let best = null, bestW = -1;
    ss.split(',').forEach((part) => {
      const [u, w] = part.trim().split(/\s+/);
      const width = w ? parseInt(w) : 0;
      if (u && width >= bestW) { best = u; bestW = width; }
    });
    return best;
  }

  // Collect ordered, de-duped, normalized object/image URLs on the page.
  function collect() {
    const out = [];
    const seen = new Set();
    const push = (raw) => {
      const n = normalize(raw);
      if (!n) return;
      const id = n.split('/object/image/')[1].split('/')[0]; // dedupe by object id
      if (seen.has(id)) return;
      seen.add(id);
      out.push(n);
    };
    document.querySelectorAll('img, source').forEach((el) => {
      push(el.currentSrc);
      push(el.getAttribute('src'));
      push(el.getAttribute('data-src'));
      push(fromSrcset(el.getAttribute('srcset')));
      push(fromSrcset(el.getAttribute('data-srcset')));
    });
    return out.slice(0, PER_PAGE);
  }

  const kind = () => (/interior/i.test(location.pathname) ? 'interior' : 'exterior');
  const slug = () => {
    const m = location.pathname.match(/cars-trucks\/([^/]+)\/([^/]+)/);
    return m ? `${m[1]}/${m[2]}` : 'unknown';
  };
  const read = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
  const write = (d) => localStorage.setItem(STORE, JSON.stringify(d));
  const copy = (text) => { try { navigator.clipboard.writeText(text); } catch {} };

  const yamlList = (urls, indent = '      ') => urls.map((u) => `${indent}- "${u}"`).join('\n');

  window.shots = {
    grab() {
      const urls = collect();
      if (!urls.length) {
        console.warn('No US News gallery images found. Scroll the page so thumbnails load, then run shots.grab() again.');
        return [];
      }
      const db = read();
      const s = slug();
      db[s] = db[s] || { exterior: [], interior: [] };
      db[s][kind()] = urls;
      write(db);
      console.log(`✓ ${s} — ${kind()}: captured ${urls.length} photos. ` +
        `Now do the other tab (interior/exterior), then run shots.dump().`);
      copy(yamlList(urls));
      console.log('(this page\'s list is on your clipboard too)');
      return urls;
    },

    dump() {
      const db = read();
      const s = slug();
      const rec = db[s];
      if (!rec) { console.warn('Nothing captured for', s, '— run shots.grab() first.'); return; }
      const ext = rec.exterior || [];
      const int = rec.interior || [];
      const def = ext[0] || int[0] || '';
      const gallery = [...ext.slice(1), ...int];
      const yaml =
        `  # ${s}  (US News — ${ext.length} exterior + ${int.length} interior)\n` +
        `  <PUT-VEHICLE-ID-HERE>:\n` +
        `    default: "${def}"\n` +
        (gallery.length ? `    gallery:\n${yamlList(gallery)}\n` : `    gallery: []\n`) +
        `    trims: {}\n`;
      console.log(yaml);
      copy(yaml);
      console.log('↑ copied to clipboard. Replace <PUT-VEHICLE-ID-HERE> with the id from vehicle_images.yaml.');
      return yaml;
    },

    clear() { const d = read(); delete d[slug()]; write(d); console.log('cleared', slug()); },
  };

  console.log('%cEVsense US News scraper ready.', 'color:#2F5BFF;font-weight:bold');
  console.log('Run  shots.grab()  on the exterior page, again on the interior page, then  shots.dump().');
})();

/* ── BOOKMARKLET (grabs + copies the CURRENT page only) ──────────────────────
   Save this whole string as a bookmark URL, click it on a US News photos page:

javascript:(function(){const N=7,seen=new Set(),out=[];const norm=u=>{try{const x=new URL(u,location.href);if(!/\/object\/image\//.test(x.pathname))return null;const t=x.searchParams.get('update-time');x.search='';if(t)x.searchParams.set('update-time',t);x.searchParams.set('size','responsiveGallery');x.searchParams.set('format','webp');return x.href}catch(e){return null}};const ss=s=>{if(!s)return null;let b=null,bw=-1;s.split(',').forEach(p=>{const[u,w]=p.trim().split(/\s+/);const ww=w?parseInt(w):0;if(u&&ww>=bw){b=u;bw=ww}});return b};document.querySelectorAll('img,source').forEach(e=>{[e.currentSrc,e.getAttribute('src'),e.getAttribute('data-src'),ss(e.getAttribute('srcset')),ss(e.getAttribute('data-srcset'))].forEach(r=>{const n=norm(r);if(!n)return;const id=n.split('/object/image/')[1].split('/')[0];if(seen.has(id))return;seen.add(id);out.push(n)})});const y=out.slice(0,N).map(u=>'      - "'+u+'"').join('\n');navigator.clipboard.writeText(y);alert('Copied '+Math.min(out.length,N)+' US News image URLs to clipboard.')})();
*/
