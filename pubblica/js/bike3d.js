// Bici 3D: in home quando sei ferma, nella scheda della bici (il "garage") e nella dashboard desktop.
// Disegnata con forme semplici di three.js (caricato solo quando serve, 650 kB).
//
// Si gira trascinando, si avvicina con due dita o la rotellina, toccando il campanello suona.
// Telaio (classico, città, MTB, corsa) e colore si cambiano dalla scheda della bici; per la manutenzione
// la telecamera va sul pezzo (freni, copertoni, catena, batteria…) e lo fa lampeggiare.

(() => {
  let THREE = null;
  let loading = null;
  let audio = null;

  function loadThree() {
    if (globalThis.THREE) return Promise.resolve(globalThis.THREE);
    loading ??= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/three/three.min.js';
      s.onload = () => resolve(globalThis.THREE);
      s.onerror = reject;
      document.head.append(s);
    });
    return loading;
  }

  // ---------- Telai ----------

  const STYLES = {
    classic: {
      seat: [-0.18, 0.84], head: [0.38, 0.86], headLow: [0.42, 0.7], tube: 0.024, tire: 0.027,
      bar: 'flat', fork: 'rigid', top: 'straight', saddleY: 0.99,
    },
    city: {
      seat: [-0.17, 0.8], head: [0.36, 0.9], headLow: [0.41, 0.72], tube: 0.024, tire: 0.03,
      bar: 'riser', fork: 'rigid', top: 'low', saddleY: 0.97, fenders: true, rack: true, lamp: true,
    },
    mtb: {
      seat: [-0.15, 0.76], head: [0.4, 0.86], headLow: [0.45, 0.66], tube: 0.03, tire: 0.042,
      bar: 'wide', fork: 'suspension', top: 'sloped', saddleY: 0.97, knobby: true,
    },
    road: {
      seat: [-0.17, 0.86], head: [0.4, 0.85], headLow: [0.43, 0.72], tube: 0.02, tire: 0.018,
      bar: 'drop', fork: 'rigid', top: 'straight', saddleY: 1.01,
    },
  };
  const WHEEL_R = 0.34;
  const REAR = [-0.52, WHEEL_R];
  const FRONT = [0.54, WHEEL_R];
  const BB = [-0.04, 0.3];
  const LIFT = -0.5; // la bici è abbassata perché il centro della scena sia a metà altezza

  // Dove guardare per ogni pezzo: punto (coordinate della bici), distanza e lato da cui guardarlo.
  const FOCUS = {
    all: { target: [0, -0.02, 0], dist: 3.3 },
    tyres: { target: [FRONT[0], WHEEL_R + LIFT, 0], dist: 1.35, yaw: 0.3 },
    brakes: { target: [FRONT[0] - 0.02, WHEEL_R + LIFT + 0.03, -0.06], dist: 0.85, yaw: Math.PI - 0.4 },
    chain: { target: [-0.28, BB[1] + LIFT + 0.03, 0.06], dist: 1.15, yaw: -0.15 },
    battery: { target: [0.2, 0.52 + LIFT, 0], dist: 1.0, yaw: 0.35 },
    saddle: { target: [-0.22, 0.99 + LIFT, 0], dist: 0.85, yaw: 0.55 },
    handlebar: { target: [0.42, 0.98 + LIFT, 0], dist: 1.0, yaw: -0.7 },
  };

  const v3 = (p, z = 0) => new THREE.Vector3(p[0], p[1], p.length > 2 ? p[2] : z);

  function tube(a, b, r, mat) {
    const from = a.isVector3 ? a : v3(a);
    const to = b.isVector3 ? b : v3(b);
    const dir = to.clone().sub(from);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 14), mat);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  }

  function curve(points, r, mat, segments = 40) {
    const path = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : v3(p))));
    return new THREE.Mesh(new THREE.TubeGeometry(path, segments, r, 12, false), mat);
  }

  // ---------- Costruzione ----------

  function makeMaterials(color) {
    const std = (c, metalness, roughness) => new THREE.MeshStandardMaterial({ color: c, metalness, roughness });
    return {
      frame: std(color, 0.45, 0.32),
      metal: std(0xc8d0d8, 0.9, 0.25),
      spoke: std(0xaab4bf, 0.8, 0.35),
      dark: std(0x23282f, 0.2, 0.6),
      // Pezzi con materiale proprio: si possono far lampeggiare da soli.
      tire: std(0x1b1f24, 0, 0.85),
      brake: std(0xd5dbe2, 0.9, 0.2),
      caliper: std(0x2a2f36, 0.5, 0.4),
      chain: std(0x8d969f, 0.85, 0.35),
      battery: std(0x2a2f36, 0.3, 0.5),
      saddle: std(0x23282f, 0.1, 0.7),
      bar: std(0xc8d0d8, 0.9, 0.25),
      bell: std(0xe8ecf0, 1, 0.15),
      lamp: new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe08a, emissiveIntensity: 0.8 }),
    };
  }

  function wheel(style, mat, parts, side) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R, style.tire, 14, 72), mat.tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - style.tire - 0.008, 0.011, 8, 64), mat.metal);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.11, 16), mat.metal);
    hub.rotation.x = Math.PI / 2;
    g.add(tire, rim, hub);
    parts.tyres.push(tire);
    if (style.knobby) {
      const knob = new THREE.BoxGeometry(0.022, 0.016, style.tire * 1.6);
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const k = new THREE.Mesh(knob, mat.tire);
        k.position.set(Math.cos(a) * (WHEEL_R + style.tire * 0.75), Math.sin(a) * (WHEEL_R + style.tire * 0.75), 0);
        k.rotation.z = a;
        g.add(k);
        parts.tyres.push(k);
      }
    }
    const spokeR = WHEEL_R - style.tire - 0.012;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const z = i % 2 ? 0.04 : -0.04;
      g.add(tube([0, 0, z], [Math.cos(a) * spokeR, Math.sin(a) * spokeR, 0], 0.0032, mat.spoke));
    }
    // Disco del freno (lato sinistro) e, dietro, pacco pignoni (lato destro)
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.004, 40), mat.brake);
    rotor.rotation.x = Math.PI / 2;
    rotor.position.z = -0.058;
    const rotorHub = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 24), mat.caliper);
    rotorHub.position.z = -0.058;
    g.add(rotor, rotorHub);
    parts.brakes.push(rotor);
    if (side === 'rear') {
      for (let i = 0; i < 4; i++) {
        const cog = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.008, 0.005, 6, 28), mat.chain);
        cog.position.z = 0.045 + i * 0.006;
        g.add(cog);
        parts.chain.push(cog);
      }
    }
    return g;
  }

  function buildBike(styleName, mat) {
    const S = STYLES[styleName] || STYLES.classic;
    const parts = { tyres: [], brakes: [], chain: [], battery: [], saddle: [], handlebar: [], bell: [], wheels: [] };
    const bike = new THREE.Group();
    const seat = v3(S.seat);
    const head = v3(S.head);
    const headLow = v3(S.headLow);
    const bb = v3(BB);
    const rear = v3(REAR);
    const front = v3(FRONT);

    const rearWheel = wheel(S, mat, parts, 'rear');
    rearWheel.position.copy(rear);
    const frontWheel = wheel(S, mat, parts, 'front');
    frontWheel.position.copy(front);
    bike.add(rearWheel, frontWheel);
    parts.wheels.push(rearWheel, frontWheel);

    // Telaio
    const T = S.tube;
    bike.add(tube(bb, seat, T, mat.frame), tube(headLow, head, T * 1.2, mat.frame));
    if (S.top === 'low') {
      // Telaio aperto da città: due tubi curvi bassi, si sale senza alzare la gamba.
      bike.add(curve([headLow, [0.2, 0.42], [0.04, 0.33], bb], T * 1.15, mat.frame));
      bike.add(curve([[head.x - 0.01, head.y - 0.06], [0.22, 0.56], [0.02, 0.46], [-0.08, 0.48]], T * 0.85, mat.frame));
    } else {
      bike.add(tube(bb, headLow, T * 1.15, mat.frame));
      const topEnd = S.top === 'sloped' ? v3([seat.x + 0.03, seat.y - 0.09]) : seat;
      bike.add(tube(topEnd, v3([head.x - 0.01, head.y - 0.03]), T * 0.9, mat.frame));
    }
    for (const z of [-0.045, 0.045]) {
      bike.add(
        tube(v3(REAR, z), v3(BB, z * 0.6), T * 0.5, mat.frame),
        tube(v3(REAR, z), v3([seat.x + 0.03, seat.y - 0.06], z * 0.4), T * 0.46, mat.frame),
      );
    }

    // Forcella
    for (const z of [-0.05, 0.05]) {
      if (S.fork === 'suspension') {
        const mid = headLow.clone().lerp(front, 0.45);
        bike.add(tube(v3([headLow.x, headLow.y], z * 0.7), v3([mid.x, mid.y], z), 0.019, mat.metal));
        bike.add(tube(v3([mid.x, mid.y], z), v3(FRONT, z), 0.024, mat.dark));
      } else {
        bike.add(tube(v3([headLow.x, headLow.y], z * 0.5), v3(FRONT, z), 0.013, mat.frame));
      }
    }
    if (S.fork === 'suspension') {
      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.14), mat.dark);
      crown.position.set(headLow.x, headLow.y - 0.01, 0);
      bike.add(crown);
    }

    // Pinze dei freni sul lato sinistro
    const caliperF = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.03), mat.caliper);
    caliperF.position.set(front.x - 0.055, front.y + 0.055, -0.066);
    caliperF.rotation.z = -0.5;
    const caliperR = caliperF.clone();
    caliperR.position.set(rear.x + 0.06, rear.y + 0.05, -0.066);
    caliperR.rotation.z = 0.6;
    bike.add(caliperF, caliperR);
    parts.brakes.push(caliperF, caliperR);

    // Reggisella e sella
    const saddleX = seat.x - 0.04;
    bike.add(tube(seat, v3([saddleX, S.saddleY - 0.03]), 0.014, mat.metal));
    const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, S.top === 'low' ? 0.12 : 0.16, 6, 12), mat.saddle);
    saddle.rotation.z = Math.PI / 2;
    saddle.scale.set(1, 1, S.top === 'low' ? 0.85 : 0.55);
    saddle.position.set(saddleX - 0.01, S.saddleY, 0);
    bike.add(saddle);
    parts.saddle.push(saddle);

    // Attacco e manubrio
    const stemTop = v3([head.x + 0.03, head.y + 0.1]);
    bike.add(tube(head, stemTop, 0.016, mat.metal));
    const barParts = [];
    if (S.bar === 'drop') {
      for (const s of [-1, 1]) {
        barParts.push(curve([[stemTop.x, stemTop.y, 0], [stemTop.x, stemTop.y, s * 0.16], [stemTop.x + 0.08, stemTop.y - 0.01, s * 0.2],
          [stemTop.x + 0.1, stemTop.y - 0.08, s * 0.2], [stemTop.x + 0.03, stemTop.y - 0.13, s * 0.2]], 0.013, mat.bar));
      }
    } else if (S.bar === 'riser') {
      for (const s of [-1, 1]) {
        barParts.push(curve([[stemTop.x, stemTop.y, 0], [stemTop.x - 0.01, stemTop.y + 0.03, s * 0.14], [stemTop.x - 0.08, stemTop.y + 0.04, s * 0.27]], 0.013, mat.bar));
        const grip = tube(v3([stemTop.x - 0.08, stemTop.y + 0.04], s * 0.24), v3([stemTop.x - 0.1, stemTop.y + 0.04], s * 0.33), 0.02, mat.dark);
        barParts.push(grip);
      }
    } else {
      const w = S.bar === 'wide' ? 0.36 : 0.27;
      barParts.push(tube(v3([stemTop.x, stemTop.y], -w), v3([stemTop.x, stemTop.y], w), 0.013, mat.bar));
      for (const s of [-1, 1]) barParts.push(tube(v3([stemTop.x, stemTop.y], s * (w - 0.07)), v3([stemTop.x, stemTop.y], s * (w + 0.005)), 0.02, mat.dark));
    }
    for (const p of barParts) bike.add(p);
    parts.handlebar.push(...barParts);

    // Campanello: toccalo e suona
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.026, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.bell);
    bell.position.set(stemTop.x, stemTop.y + 0.012, S.bar === 'drop' ? -0.1 : -0.14);
    bike.add(bell);
    parts.bell.push(bell);

    // Corona, pedivelle e catena (lato destro)
    const crank = new THREE.Group();
    crank.position.copy(bb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.011, 8, 44), mat.chain);
    ring.position.z = 0.06;
    crank.add(ring);
    parts.chain.push(ring);
    for (const [z, a] of [[0.08, 0], [-0.08, Math.PI]]) {
      crank.add(tube([0, 0, z], [Math.cos(a) * 0.17, Math.sin(a) * 0.17, z], 0.012, mat.metal));
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.06), mat.dark);
      pedal.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, z + Math.sign(z) * 0.04);
      crank.add(pedal);
    }
    bike.add(crank);
    const chainTop = tube(v3([bb.x, bb.y + 0.1], 0.06), v3([rear.x, rear.y + 0.042], 0.06), 0.006, mat.chain);
    const chainLow = tube(v3([bb.x, bb.y - 0.1], 0.06), v3([rear.x, rear.y - 0.042], 0.06), 0.006, mat.chain);
    bike.add(chainTop, chainLow);
    parts.chain.push(chainTop, chainLow);

    // Batteria sul tubo obliquo (solo elettriche)
    const battery = new THREE.Group();
    const dir = headLow.clone().sub(bb);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.075, 0.075), mat.battery);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.078), new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x34d399, emissiveIntensity: 1 }));
    led.position.y = 0.035;
    battery.add(pack, led);
    battery.position.copy(bb.clone().addScaledVector(dir, 0.5)).add(new THREE.Vector3(0, 0.05, 0));
    battery.rotation.z = Math.atan2(dir.y, dir.x);
    battery.visible = false;
    bike.add(battery);
    parts.battery.push(pack);

    // Accessori da città: parafanghi, portapacchi, fanale
    if (S.fenders) {
      // Angoli in radianti: 0 = davanti, PI/2 = in alto, PI = dietro.
      for (const [c, start, arcLen] of [[rear, 0.9, 2.0], [front, 0.15, 1.7]]) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R + 0.05, 0.03, 4, 40, arcLen), mat.frame);
        arc.scale.z = 0.5;
        arc.position.copy(c);
        arc.rotation.z = start;
        bike.add(arc);
      }
    }
    if (S.rack) {
      const y = 0.74;
      for (const z of [-0.07, 0.07]) {
        bike.add(tube(v3([-0.66, y], z), v3([-0.26, y], z), 0.008, mat.metal), tube(v3([-0.6, y], z), v3(REAR, z), 0.008, mat.metal));
      }
      for (const x of [-0.6, -0.45, -0.3]) bike.add(tube(v3([x, y], -0.07), v3([x, y], 0.07), 0.007, mat.metal));
      bike.add(tube(v3([-0.26, y]), v3([seat.x + 0.02, seat.y - 0.08]), 0.008, mat.metal));
    }
    if (S.lamp) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.05, 18), mat.lamp);
      lamp.rotation.z = Math.PI / 2;
      lamp.position.set(headLow.x + 0.06, headLow.y + 0.02, 0);
      bike.add(lamp);
    }

    bike.position.y = LIFT;
    bike.traverse((o) => { o.castShadow = true; });
    return { bike, parts, crank, battery };
  }

  function shadowMesh() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 0.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = LIFT - 0.005;
    return mesh;
  }

  /** Drin drin: due rintocchi metallici sintetizzati, niente file audio. */
  function ring() {
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime;
      for (const start of [0, 0.16]) {
        for (const [freq, gain] of [[2350, 0.22], [3520, 0.1], [5900, 0.04]]) {
          const osc = audio.createOscillator();
          const amp = audio.createGain();
          osc.frequency.value = freq;
          amp.gain.setValueAtTime(gain, t0 + start);
          amp.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 0.55);
          osc.connect(amp).connect(audio.destination);
          osc.start(t0 + start);
          osc.stop(t0 + start + 0.6);
        }
      }
    } catch { /* senza audio si fa a meno */ }
  }

  const shortest = (from, to) => from + ((((to - from) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  /**
   * Monta una bici 3D dentro container. Restituisce i comandi per cambiarla.
   * options: { style, color, electric, zoomable (zoom con dita/rotellina), closer (<1 avvicina la vista intera), onTap }
   */
  async function mount(container, options = {}) {
    THREE = await loadThree();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.domElement.style.touchAction = 'none';
    container.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 3, 2.5);
    const rimLight = new THREE.DirectionalLight(0x88ccff, 1.2);
    rimLight.position.set(-3, 1.5, -2);
    scene.add(sun, rimLight);

    const mat = makeMaterials(options.color || '#38bdf8');
    const turntable = new THREE.Group();
    turntable.add(shadowMesh());
    scene.add(turntable);

    let style = options.style || 'classic';
    let electric = Boolean(options.electric);
    let built = null;
    function rebuild() {
      if (built) {
        turntable.remove(built.bike);
        built.bike.traverse((o) => o.geometry?.dispose());
      }
      built = buildBike(style, mat);
      built.battery.visible = electric;
      turntable.add(built.bike);
    }
    rebuild();

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Stato della telecamera: dove guarda, da quanto lontano e da che lato. "goal" è dove sta andando.
    const cam = { yaw: -0.5, dist: 3.3, target: new THREE.Vector3(0, -0.02, 0) };
    const goal = { yaw: -0.5, dist: 3.3, target: new THREE.Vector3(0, -0.02, 0) };
    let focusPart = 'all';
    let autoSpin = !reduced;
    let speedMs = 0;
    let spinBoost = 0;
    let hop = 0;
    let highlight = null;
    let visible = true;
    let last = performance.now();
    let aspect = 1;

    function resize() {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      aspect = width / height;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(container);
    resize();
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(container);

    function setGoal(part) {
      const f = FOCUS[part] || FOCUS.all;
      focusPart = FOCUS[part] ? part : 'all';
      goal.target.set(...f.target);
      goal.dist = f.dist;
      if (f.yaw != null) goal.yaw = shortest(cam.yaw, f.yaw);
      autoSpin = focusPart === 'all' && !reduced;
    }

    function flash(part) {
      const list = part === 'all' ? [] : built.parts[part] || [];
      const mats = [...new Set(list.map((m) => m.material))];
      highlight = mats.length ? { mats, start: performance.now() } : null;
    }

    // ---------- Tocchi: trascina per girare, due dita per lo zoom, tocco breve per giocare ----------
    const pointers = new Map();
    let pinch = null;
    let tap = null;
    const el = renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: goal.dist };
      }
      autoSpin = false;
    });
    el.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2 && pinch && options.zoomable !== false) {
        const [a, b] = [...pointers.values()];
        goal.dist = Math.min(5, Math.max(0.6, pinch.dist * (pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)))));
      } else if (pointers.size === 1) {
        cam.yaw += dx * 0.01;
        goal.yaw = cam.yaw;
      }
    });
    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (tap && performance.now() - tap.t < 350 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8) onTap(e);
      tap = null;
      if (!pointers.size && focusPart === 'all') setTimeout(() => { if (!pointers.size && focusPart === 'all') autoSpin = !reduced; }, 2500);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('click', (e) => e.stopPropagation());
    if (options.zoomable !== false) {
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        goal.dist = Math.min(5, Math.max(0.6, goal.dist * (1 + Math.sign(e.deltaY) * 0.12)));
      }, { passive: false });
    }
    el.addEventListener('dblclick', () => setGoal('all'));

    const raycaster = new THREE.Raycaster();
    function onTap(e) {
      const box = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(built.bike, true)[0];
      if (!hit) return;
      const isBell = built.parts.bell.includes(hit.object)
        || (built.parts.handlebar.includes(hit.object) && hit.point.distanceTo(built.parts.bell[0].getWorldPosition(new THREE.Vector3())) < 0.15);
      if (isBell) {
        ring();
        flash('bell');
      } else {
        spinBoost = 14;
        hop = 1;
      }
      options.onTap?.(isBell ? 'bell' : 'bike');
    }

    // ---------- Disegno ----------
    const tmp = new THREE.Vector3();
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;

      if (autoSpin) goal.yaw = cam.yaw + dt * 0.25;
      const k = 1 - Math.exp(-dt * 4.5);
      cam.yaw += (goal.yaw - cam.yaw) * (autoSpin ? 1 : k);
      cam.dist += (goal.dist - cam.dist) * k;
      cam.target.lerp(goal.target, k);
      turntable.rotation.y = cam.yaw;

      // Camera: davanti, poco sopra, sempre puntata sul pezzo (che gira con la bici).
      tmp.copy(cam.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), cam.yaw);
      const fit = focusPart === 'all' ? Math.max(1, 1.6 / aspect) * (options.closer || 1) : 1;
      const d = cam.dist * fit;
      camera.position.set(tmp.x, tmp.y + d * 0.11, tmp.z + d);
      camera.lookAt(tmp);

      // Ruote e pedali: velocità vera, altrimenti un rotolare tranquillo; il tocco dà una spinta.
      spinBoost *= Math.exp(-dt * 1.6);
      const v = (speedMs > 0.3 ? speedMs : reduced ? 0 : 1.1) + spinBoost;
      for (const w of built.parts.wheels) w.rotation.z -= (v / WHEEL_R) * dt;
      built.crank.rotation.z -= (v / WHEEL_R) * 0.55 * dt;
      hop = Math.max(0, hop - dt * 3);
      built.bike.position.y = LIFT + Math.sin(hop * Math.PI) * 0.04 + (reduced ? 0 : Math.sin(now / 900) * 0.006);

      if (highlight) {
        const t = (now - highlight.start) / 1000;
        const on = t < 3.2;
        const glow = on ? 0.35 + 0.35 * Math.sin(t * 7) : 0;
        for (const m of highlight.mats) {
          m.emissive.set(on ? 0xfff2b0 : 0x000000); // luce calda, si vede su qualsiasi colore di telaio
          m.emissiveIntensity = glow;
        }
        if (!on) highlight = null;
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);

    return {
      setSpeed(ms) {
        speedMs = ms;
      },
      setColor(css) {
        mat.frame.color.set((css || '').trim() || '#38bdf8');
      },
      setStyle(name) {
        if (!STYLES[name] || name === style) return;
        style = name;
        rebuild();
        hop = 1;
      },
      setElectric(on) {
        electric = Boolean(on);
        if (built) built.battery.visible = electric;
      },
      /** Zoom su un pezzo: 'tyres', 'brakes', 'chain', 'battery', 'saddle', 'handlebar' o 'all'. */
      focus(part) {
        const p = part === 'battery' && !electric ? 'all' : part;
        setGoal(p);
        flash(p);
      },
      reset() {
        setGoal('all');
      },
      celebrate() {
        hop = 1;
        spinBoost = 10;
      },
    };
  }

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.bike3d = { mount, ring };
})();
