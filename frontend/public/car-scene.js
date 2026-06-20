// <ev-car-scene mode="budget|use|daily|charge|priority|results" step="0..5">
// A shaded (grayscale) low-poly EV that spins/poses to reflect the current
// matcher question. Loads three.js from CDN if not already present.
(function () {
  function boot(THREE) {
    if (customElements.get('ev-car-scene')) return;

    var MODES = {
      budget:   { cam: [5.0, 1.7, 5.6],  look: [0, 0.55, 0],   props: ['platform', 'dollar'],            drive: false, orbit: false, yaw: 0.55 },
      use:      { cam: [6.2, 2.3, 5.2],  look: [0, 0.55, -0.4], props: ['road', 'suburb', 'city'],        drive: true,  orbit: false, yaw: 0.0 },
      daily:    { cam: [3.4, 2.2, -6.8], look: [0, 0.5, 1.8],  props: ['road', 'suburb', 'city'],        drive: true,  orbit: false, yaw: 0.0 },
      charge:   { cam: [5.2, 1.7, 5.0],  look: [0.3, 0.6, 0],  props: ['platform', 'charger', 'bolt'],   drive: false, orbit: false, yaw: -0.5 },
      priority: { cam: [0, 2.3, 6.6],    look: [0, 0.6, 0],    props: ['platform', 'sparkle'],           drive: false, orbit: true,  yaw: 0.0 },
      results:  { cam: [4.4, 1.6, 5.4],  look: [0, 0.55, 0],   props: ['platform', 'sparkle'],           drive: false, orbit: false, yaw: 0.45 },
    };

    function canvasTexture(draw, w, h) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
    }

    function dollarTex() {
      return canvasTexture(function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.font = 'bold 168px "Space Grotesk", Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(70,74,82,0.95)';
        ctx.fillText('$', w / 2, h / 2 + 6);
      }, 200, 200);
    }
    function boltTex() {
      return canvasTexture(function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(70,74,82,0.95)';
        ctx.beginPath();
        ctx.moveTo(118, 18); ctx.lineTo(70, 112); ctx.lineTo(104, 112);
        ctx.lineTo(82, 186); ctx.lineTo(140, 88); ctx.lineTo(104, 88);
        ctx.closePath(); ctx.fill();
      }, 200, 200);
    }
    function roadTex() {
      return canvasTexture(function (ctx, w, h) {
        ctx.fillStyle = '#777c84'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#eef0f3';
        for (var y = 10; y < h; y += 90) ctx.fillRect(w / 2 - 7, y, 14, 46);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(20, 0, 8, h); ctx.fillRect(w - 28, 0, 8, h);
      }, 128, 512);
    }
    function ringTex() {
      return canvasTexture(function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        var cx = w / 2, cy = h / 2;
        for (var i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, 120 - i * 34, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(120,125,133,' + (0.5 - i * 0.13) + ')';
          ctx.lineWidth = 4; ctx.stroke();
        }
      }, 320, 320);
    }

    var bodyMat = new THREE.MeshStandardMaterial({ color: 0xc4c8ce, metalness: 0.18, roughness: 0.5 });
    var roofMat = new THREE.MeshStandardMaterial({ color: 0xb2b7bf, metalness: 0.15, roughness: 0.55 });
    var glassMat = new THREE.MeshStandardMaterial({ color: 0x868d97, metalness: 0.35, roughness: 0.2 });
    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x34373c, metalness: 0.2, roughness: 0.7 });
    var trimMat = new THREE.MeshStandardMaterial({ color: 0xd7dbe1, metalness: 0.1, roughness: 0.5 });

    function box(w, h, d, mat, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x || 0, y || 0, z || 0); return m;
    }

    function buildCar() {
      var g = new THREE.Group();
      g.add(box(1.7, 0.55, 3.7, bodyMat, 0, 0.5, 0));      // lower body
      g.add(box(1.62, 0.42, 2.9, bodyMat, 0, 0.92, -0.05)); // shoulder
      var cabin = box(1.46, 0.62, 1.85, roofMat, 0, 1.32, -0.15);
      g.add(cabin);
      g.add(box(1.5, 0.5, 1.5, glassMat, 0, 1.3, -0.12));   // greenhouse glass
      // wheels
      var wpos = [[0.86, 1.18], [-0.86, 1.18], [0.86, -1.18], [-0.86, -1.18]];
      var wheels = [];
      wpos.forEach(function (p) {
        var grp = new THREE.Group(); grp.position.set(p[0], 0.44, p[1]);
        var cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 22), wheelMat);
        cyl.rotation.z = Math.PI / 2;
        var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 12), trimMat);
        hub.rotation.z = Math.PI / 2;
        grp.add(cyl); grp.add(hub); g.add(grp); wheels.push(grp);
      });
      g.userData.wheels = wheels;
      // lights
      g.add(box(0.5, 0.18, 0.08, trimMat, 0.5, 0.72, 1.86));
      g.add(box(0.5, 0.18, 0.08, trimMat, -0.5, 0.72, 1.86));
      return g;
    }

    function buildHouse(shade, rshade, s) {
      var g = new THREE.Group();
      var bm = new THREE.MeshStandardMaterial({ color: shade, roughness: 0.85 });
      var rm = new THREE.MeshStandardMaterial({ color: rshade, roughness: 0.85 });
      g.add(box(1.6 * s, 1.2 * s, 1.6 * s, bm, 0, 0.6 * s, 0));
      var roof = new THREE.Mesh(new THREE.ConeGeometry(1.25 * s, 0.8 * s, 4), rm);
      roof.rotation.y = Math.PI / 4; roof.position.y = 1.6 * s; g.add(roof);
      return g;
    }

    var EVCarScene = function () {};
    EVCarScene = class extends HTMLElement {
      static get observedAttributes() { return ['mode', 'step']; }

      connectedCallback() {
        if (this._init) return; this._init = true;
        this.style.display = 'block'; this.style.position = 'relative';
        this._mode = this.getAttribute('mode') || 'budget';
        this._step = parseInt(this.getAttribute('step') || '0', 10);
        this._spins = 0;
        this.initThree();
        this.applyMode(this._mode, true);
        this.start();
      }
      disconnectedCallback() { this.stop(); if (this.ro) this.ro.disconnect(); if (this.renderer) this.renderer.dispose(); }

      attributeChangedCallback(name, oldV, newV) {
        if (!this._init || oldV === newV) return;
        if (name === 'step') {
          var ns = parseInt(newV || '0', 10);
          if (ns > this._step) this._spins += 1; // a full extra spin on advancing
          this._step = ns;
          this.targetYaw = (MODES[this._mode] ? MODES[this._mode].yaw : 0) + this._spins * Math.PI * 2;
        }
        if (name === 'mode') { this._mode = newV; this.applyMode(newV, false); }
      }

      initThree() {
        var w = this.clientWidth || 480, h = this.clientHeight || 420;
        var scene = new THREE.Scene(); this.scene = scene;
        var camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100); this.camera = camera;
        var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h); this.renderer = renderer;
        this.appendChild(renderer.domElement);
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';

        scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 0.85));
        var key = new THREE.DirectionalLight(0xffffff, 1.05); key.position.set(5, 8, 6); scene.add(key);
        var fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-6, 3, -4); scene.add(fill);

        this.camPos = new THREE.Vector3(3, 2.4, 5.8);
        this.camLook = new THREE.Vector3(0, 0.7, 0);
        this.tCamPos = this.camPos.clone(); this.tCamLook = this.camLook.clone();

        // soft contact shadow
        var shadow = new THREE.Mesh(
          new THREE.CircleGeometry(2.2, 36),
          new THREE.MeshBasicMaterial({
            map: canvasTexture(function (ctx, ww, hh) {
              var g = ctx.createRadialGradient(ww / 2, hh / 2, 10, ww / 2, hh / 2, ww / 2);
              g.addColorStop(0, 'rgba(40,44,52,0.34)'); g.addColorStop(1, 'rgba(40,44,52,0)');
              ctx.fillStyle = g; ctx.fillRect(0, 0, ww, hh);
            }, 256, 256), transparent: true, depthWrite: false,
          })
        );
        shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; scene.add(shadow);

        this.car = buildCar(); scene.add(this.car);
        this.targetYaw = MODES[this._mode] ? MODES[this._mode].yaw : 0.5;
        this.car.rotation.y = this.targetYaw;

        this.props = {};
        // platform
        var plat = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.6, 0.16, 48),
          new THREE.MeshStandardMaterial({ color: 0xdfe3e9, roughness: 0.85 }));
        plat.position.y = -0.06;
        var ring = new THREE.Mesh(new THREE.CircleGeometry(2.45, 48),
          new THREE.MeshBasicMaterial({ map: ringTex(), transparent: true, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
        var platG = new THREE.Group(); platG.add(plat); platG.add(ring); this.props.platform = platG; scene.add(platG);

        // dollar sprite
        var dol = new THREE.Sprite(new THREE.SpriteMaterial({ map: dollarTex(), transparent: true }));
        dol.scale.set(1.15, 1.15, 1); dol.position.set(0, 2.25, 0); this.props.dollar = dol; scene.add(dol);

        // bolt sprite
        var bolt = new THREE.Sprite(new THREE.SpriteMaterial({ map: boltTex(), transparent: true }));
        bolt.scale.set(1.0, 1.0, 1); bolt.position.set(1.9, 2.4, 0); this.props.bolt = bolt; scene.add(bolt);

        // road + scrolling world (houses + city live in scroll for motion)
        var road = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 44),
          new THREE.MeshStandardMaterial({ map: (function () { var t = roadTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 9); return t; })(), roughness: 0.9 }));
        road.rotation.x = -Math.PI / 2; road.position.y = 0.015; this.props.road = road; scene.add(road);

        var suburb = new THREE.Group(); var city = new THREE.Group();
        var shades = [0xc8ccd2, 0xbec3ca, 0xd0d4da];
        for (var z = -18; z <= 18; z += 4.5) {
          var hl = buildHouse(shades[(z + 36) % 3 | 0] || 0xc8ccd2, 0x969ca4, 0.78 + ((z % 3) === 0 ? 0.12 : 0));
          hl.position.set(-5.4, 0, z); suburb.add(hl);
          var hr = buildHouse(shades[(z + 18) % 3 | 0] || 0xc8ccd2, 0x969ca4, 0.74 + ((z % 2) === 0 ? 0.14 : 0));
          hr.position.set(5.4, 0, z + 2.2); suburb.add(hr);
        }
        for (var cz = -16; cz <= 16; cz += 6.5) {
          var th = 2.6 + (Math.abs(cz) % 5);
          var tw = new THREE.Mesh(new THREE.BoxGeometry(1.6, th, 1.6),
            new THREE.MeshStandardMaterial({ color: 0xb7bcc3, roughness: 0.8 }));
          tw.position.set(-9.6 - (cz % 3), th / 2, cz); city.add(tw);
          var tw2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, th + 1.5, 1.5),
            new THREE.MeshStandardMaterial({ color: 0xacb2ba, roughness: 0.8 }));
          tw2.position.set(10 + (cz % 4), (th + 1.5) / 2, cz + 3); city.add(tw2);
        }
        this.props.suburb = suburb; this.props.city = city; scene.add(suburb); scene.add(city);
        this._scrollA = suburb; // scroll group

        // charger
        var charger = new THREE.Group();
        charger.add(box(0.5, 2.0, 0.5, new THREE.MeshStandardMaterial({ color: 0xc0c4cb, roughness: 0.7 }), 0, 1.0, 0));
        charger.add(box(0.62, 0.7, 0.16, glassMat, 0, 1.55, 0.28));
        charger.position.set(2.1, 0, -0.2); this.props.charger = charger; scene.add(charger);

        // sparkle ring
        var sparkle = new THREE.Group();
        var torus = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.04, 10, 70),
          new THREE.MeshStandardMaterial({ color: 0xc4c8ce, metalness: 0.4, roughness: 0.3 }));
        torus.rotation.x = Math.PI / 2; torus.position.y = 0.9; sparkle.add(torus);
        for (var i = 0; i < 7; i++) {
          var s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10),
            new THREE.MeshStandardMaterial({ color: 0xdfe3e9, roughness: 0.4 }));
          var a = (i / 7) * Math.PI * 2;
          s.position.set(Math.cos(a) * 2.5, 0.9 + Math.sin(a * 2) * 0.4, Math.sin(a) * 2.5);
          sparkle.add(s);
        }
        this.props.sparkle = sparkle; scene.add(sparkle);

        this.ro = new ResizeObserver(this.resize.bind(this)); this.ro.observe(this);
      }

      applyMode(mode, instant) {
        var cfg = MODES[mode] || MODES.budget;
        this.tCamPos.set(cfg.cam[0], cfg.cam[1], cfg.cam[2]);
        this.tCamLook.set(cfg.look[0], cfg.look[1], cfg.look[2]);
        this.drive = cfg.drive; this.orbit = cfg.orbit;
        this.targetYaw = cfg.yaw + this._spins * Math.PI * 2;
        var on = cfg.props;
        for (var k in this.props) {
          var vis = on.indexOf(k) >= 0;
          this.props[k].visible = vis;
          this.props[k].userData.t = vis ? (instant ? 1 : 0) : 1;
          this.props[k].userData.target = vis ? 1 : 0;
        }
        // city visibility piggybacks suburb list
        if (instant) { this.camPos.copy(this.tCamPos); this.camLook.copy(this.tCamLook); }
        this._orbitA = Math.atan2(this.tCamPos.x, this.tCamPos.z);
      }

      resize() {
        if (!this.renderer) return;
        var w = this.clientWidth || 480, h = this.clientHeight || 420;
        this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      }

      start() { var self = this; (function loop() { self._raf = requestAnimationFrame(loop); self.tick(); })(); }
      stop() { if (this._raf) cancelAnimationFrame(this._raf); }

      tick() {
        var t = performance.now() * 0.001;
        // camera approach
        if (this.orbit) {
          this._orbitA += 0.006;
          var R = 6.4;
          this.tCamPos.set(Math.sin(this._orbitA) * R, 2.7, Math.cos(this._orbitA) * R);
        }
        this.camPos.lerp(this.tCamPos, 0.06);
        this.camLook.lerp(this.tCamLook, 0.06);
        this.camera.position.copy(this.camPos);
        this.camera.lookAt(this.camLook);

        // car yaw spin toward target
        if (this.car) {
          this.car.rotation.y += (this.targetYaw - this.car.rotation.y) * 0.07;
          if (!this.drive && !this.orbit) this.targetYaw += 0.0016; // gentle idle drift
          if (this.orbit) this.car.rotation.y += 0.004;
          // tiny bob
          this.car.position.y = Math.sin(t * 1.6) * 0.02;
          if (this.drive) {
            this.car.userData.wheels.forEach(function (wg) { wg.rotation.x -= 0.32; });
          }
        }
        // scrolling world
        if (this.drive && this._scrollA) {
          this._scrollA.position.z -= 0.16;
          if (this._scrollA.position.z <= -4.5) this._scrollA.position.z += 4.5;
        }
        // prop intros + idle motion
        for (var k in this.props) {
          var p = this.props[k];
          if (p.userData.target !== undefined) {
            p.userData.t += ((p.userData.target) - p.userData.t) * 0.12;
          }
        }
        if (this.props.dollar && this.props.dollar.visible) {
          this.props.dollar.position.y = 2.15 + Math.sin(t * 2) * 0.12;
        }
        if (this.props.bolt && this.props.bolt.visible) {
          this.props.bolt.position.y = 2.3 + Math.sin(t * 2.4) * 0.1;
        }
        if (this.props.sparkle && this.props.sparkle.visible) {
          this.props.sparkle.rotation.y += 0.01;
        }
        this.renderer.render(this.scene, this.camera);
      }
    };

    customElements.define('ev-car-scene', EVCarScene);
  }

  function ready() {
    if (window.THREE) { boot(window.THREE); return; }
    setTimeout(ready, 50);
  }
  ready();
})();
