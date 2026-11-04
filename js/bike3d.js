// Bici 3D: in home (da ferma gira su se stessa, in uscita pedala su una strada che scorre),
// nella scheda della bici (il "garage") e nella dashboard desktop.
// Disegnata con forme semplici di three.js, caricato solo quando serve (650 kB).
//
// Modelli: classica, città, MTB, corsa e sette elettriche di oggi (city, trekking, e-MTB biammortizzata,
// gravel, cargo a coda lunga, pieghevole, fat). Si gira trascinando, zoom con due dita o rotellina,
// il campanello suona. Per la manutenzione la telecamera va sul pezzo e lo fa lampeggiare.

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

  // ---------- Modelli ----------
  // Coordinate in metri, x avanti, y in alto, z verso destra (lato catena). Gli assi delle ruote sono a y = raggio.
  // R raggio del cerchio (0,34 ≈ 28"), tire spessore della gomma, rearR se la ruota dietro è diversa.

  const BASE = {
    R: 0.34, tire: 0.027, rear: -0.52, front: 0.54, bb: [-0.04, 0.3], forkZ: 0.05,
    seat: [-0.18, 0.84], head: [0.38, 0.86], headLow: [0.42, 0.7], saddleY: 0.99, tube: 0.024,
    bar: 'flat', fork: 'rigid', top: 'straight',
  };
  const STYLES = {
    classic: { ...BASE, kickstand: true, bottle: true, reflectors: true, double: true },
    city: { ...BASE, seat: [-0.17, 0.8], head: [0.36, 0.9], headLow: [0.41, 0.72], tire: 0.03, bar: 'riser', top: 'low', low: [[0.15, 0.43], [0.0, 0.34], [0.19, 0.57]], saddleY: 0.97, fenders: true, rack: true, lamp: true, chainguard: true, tanwall: true, kickstand: true, comfort: true, reflectors: true },
    mtb: { ...BASE, seat: [-0.15, 0.76], head: [0.4, 0.86], headLow: [0.45, 0.66], tube: 0.03, tire: 0.042, bar: 'wide', fork: 'suspension', top: 'sloped', saddleY: 0.97, knobby: true, bottle: true },
    road: { ...BASE, seat: [-0.17, 0.86], head: [0.4, 0.85], headLow: [0.43, 0.72], tube: 0.02, tire: 0.018, bar: 'drop', saddleY: 1.01, bottle: true, double: true },

    'e-city': { ...BASE, seat: [-0.17, 0.8], head: [0.36, 0.9], headLow: [0.41, 0.72], tire: 0.032, bar: 'riser', top: 'low', low: [[0.15, 0.43], [0.0, 0.34], [0.19, 0.57]], saddleY: 0.97, fenders: true, rack: true, lamp: true, chainguard: true, battery: 'rack', motor: 'mid', display: true, tailLight: true, tanwall: true, kickstand: true, comfort: true },
    'e-trekking': { ...BASE, seat: [-0.16, 0.8], head: [0.39, 0.88], headLow: [0.43, 0.7], tube: 0.027, tire: 0.031, fork: 'suspension', top: 'sloped', saddleY: 0.98, fenders: true, rack: true, lamp: true, battery: 'integrated', motor: 'mid', display: true, tailLight: true, kickstand: true },
    'e-mtb': { ...BASE, seat: [-0.15, 0.8], head: [0.41, 0.99], headLow: [0.46, 0.79], tube: 0.034, tire: 0.047, bar: 'wide', fork: 'suspension', top: 'sloped', saddleY: 1.02, knobby: true, battery: 'integrated', motor: 'mid', display: true, rearShock: true },
    'e-gravel': { ...BASE, seat: [-0.17, 0.85], head: [0.4, 0.84], headLow: [0.43, 0.71], tube: 0.026, tire: 0.024, bar: 'drop', saddleY: 1.0, battery: 'integrated', motor: 'mid', motorSize: 0.8, tanwall: true, bottle: true },
    'e-cargo': { ...BASE, rear: -0.95, rearR: 0.26, tire: 0.032, seat: [-0.2, 0.8], head: [0.38, 0.88], headLow: [0.42, 0.7], tube: 0.03, top: 'sloped', saddleY: 0.97, longtail: true, fenders: true, lamp: true, battery: 'integrated', motor: 'mid', display: true, tailLight: true, bar: 'riser', kickstand: true, comfort: true },
    'e-folding': { ...BASE, R: 0.25, tire: 0.034, rear: -0.42, front: 0.44, bb: [-0.03, 0.26], seat: [-0.12, 0.5], head: [0.33, 0.66], headLow: [0.31, 0.5], tube: 0.032, top: 'fold', saddleY: 0.95, battery: 'integrated', motor: 'hub', fenders: true, lamp: true, tailLight: true, kickstand: true },
    'e-fat': { ...BASE, R: 0.32, tire: 0.075, rear: -0.57, front: 0.6, bb: [-0.04, 0.33], seat: [-0.16, 0.82], head: [0.41, 0.9], headLow: [0.46, 0.72], forkZ: 0.095, tube: 0.032, bar: 'wide', top: 'sloped', saddleY: 0.99, knobby: true, battery: 'integrated', motor: 'hub', display: true, lamp: true },
  };
  /** Distanza di un punto da un segmento, nel piano della bici. */
  function segDist(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }

  /** Raggio esterno di una ruota: gomma, tasselli e parafango compresi. */
  const wheelOuter = (S, R) => R + S.tire * (S.tire > 0.06 ? 1.15 : 1) + (S.knobby ? S.tire * 0.8 : 0) + (S.fenders ? 0.05 : 0);

  /** Tubi del telaio vicini alla ruota anteriore, con il loro spessore (batteria integrata compresa). */
  function frontTubes(S) {
    const T = S.tube;
    const integrated = S.battery === 'integrated';
    if (S.top === 'low') {
      const [l1, l2, u1] = S.low;
      return [[S.headLow, l1, T * 1.15], [l1, l2, T * 1.15], [[S.head[0] - 0.01, S.head[1] - 0.06], u1, T * 0.85]];
    }
    if (S.top === 'fold') return [[[S.seat[0] + 0.02, S.seat[1] - 0.08], S.headLow, T * (integrated ? 2 : 1.5)]];
    // Con la batteria integrata il pacco sporge sotto il tubo fino a 2,1 volte lo spessore: conta il più grosso dei due.
    return [[S.bb, S.headLow, T * (integrated ? 2.1 : 1.15)]];
  }

  const CLEARANCE = 0.02; // almeno 2 cm tra gomma (o parafango) e telaio

  /**
   * Sistema le misure perché le ruote non entrino mai nel telaio, come in una bici vera:
   * prima la ruota anteriore va un po' avanti (forcella più inclinata, al massimo 12 cm),
   * poi, se non basta, tubo sterzo e manubrio salgono (forcella più lunga, come le ammortizzate).
   * Dietro, se serve, i foderi si allungano.
   */
  function settle(base) {
    const S = { ...base, head: [...base.head], headLow: [...base.headLow] };
    const rearR = S.rearR || S.R;
    const frontGap = () => Math.min(...frontTubes(S).map(([a, b, r]) => segDist([S.front, S.R], a, b) - r)) - wheelOuter(S, S.R);
    const rearGap = () => segDist([S.rear, rearR], S.bb, S.seat) - S.tube - wheelOuter(S, rearR);
    for (let i = 0; i < 120 && frontGap() < CLEARANCE; i++) {
      if (S.front - base.front < 0.12) {
        S.front += 0.005;
      } else {
        S.head[1] += 0.005;
        S.headLow[1] += 0.005;
      }
    }
    for (let i = 0; i < 80 && rearGap() < CLEARANCE; i++) S.rear -= 0.005;
    S.gaps = { front: frontGap(), rear: rearGap() };
    return S;
  }

  const LIFT = -0.5; // la scena ha il centro a metà altezza: il suolo è a y = -0,5

  const v3 = (p, z = 0) => new THREE.Vector3(p[0], p[1], p.length > 2 ? p[2] : z);

  function tube(a, b, r, mat, seg = 14) {
    const from = a.isVector3 ? a : v3(a);
    const to = b.isVector3 ? b : v3(b);
    const dir = to.clone().sub(from);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), seg), mat);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  }

  function curve(points, r, mat, segments = 40) {
    const path = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : v3(p))));
    return new THREE.Mesh(new THREE.TubeGeometry(path, segments, r, 12, false), mat);
  }

  function box(w, h, d, mat, at, rotZ = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(...at);
    m.rotation.z = rotZ;
    return m;
  }

  // ---------- Materiali ----------

  /** Battistrada: righe oblique sottili lungo la gomma, usate come rilievo. */
  function treadTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const x = c.getContext('2d');
    x.fillStyle = '#808080';
    x.fillRect(0, 0, 64, 32);
    x.strokeStyle = '#3a3a3a';
    x.lineWidth = 3;
    for (let i = -32; i < 96; i += 10) {
      x.beginPath();
      x.moveTo(i, 4);
      x.lineTo(i + 8, 16);
      x.lineTo(i, 28);
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(90, 1);
    return t;
  }

  /** Scritta "ContaKM" per il tubo obliquo, come il marchio sui telai veri. */
  function logoTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    let size = 72;
    const font = () => `italic 800 ${size}px Inter, "Helvetica Neue", Arial, sans-serif`;
    x.font = font();
    while (x.measureText('ContaKM').width > 470 && size > 30) {
      size -= 2;
      x.font = font();
    }
    x.textBaseline = 'middle';
    x.fillText('ContaKM', 20, 52);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Schermo del telefono sul manubrio con ContaKM aperto: velocità grande e km, letti dal ciclista. */
  function phoneTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 240;
    const x = c.getContext('2d');
    // Il telefono è in verticale davanti al ciclista: si disegna ruotato di 90°.
    x.translate(512, 0);
    x.rotate(Math.PI / 2);
    const W = 240;
    const H = 512;
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#13233a');
    bg.addColorStop(1, '#0b1422');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    x.strokeStyle = '#38bdf8';
    x.lineWidth = 14;
    x.lineCap = 'round';
    x.globalAlpha = 0.25;
    x.beginPath();
    x.arc(W / 2, 200, 86, Math.PI * 0.8, Math.PI * 2.2);
    x.stroke();
    x.globalAlpha = 1;
    x.beginPath();
    x.arc(W / 2, 200, 86, Math.PI * 0.8, Math.PI * 1.75);
    x.stroke();
    x.textAlign = 'center';
    x.fillStyle = '#ffffff';
    x.font = '800 70px Inter, Arial, sans-serif';
    x.fillText('24', W / 2, 218);
    x.fillStyle = '#8fa3ba';
    x.font = '700 22px Inter, Arial, sans-serif';
    x.fillText('km/h', W / 2, 250);
    x.fillStyle = '#ffffff';
    x.font = '800 34px Inter, Arial, sans-serif';
    x.fillText('12,8 km', W / 2, 360);
    x.fillStyle = '#38bdf8';
    x.fillRect(30, 420, W - 60, 46);
    x.fillStyle = '#062033';
    x.font = '800 22px Inter, Arial, sans-serif';
    x.fillText('PAUSA', W / 2, 451);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeMaterials(color) {
    const std = (c, metalness, roughness) => new THREE.MeshStandardMaterial({ color: c, metalness, roughness });
    const glow = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
    return {
      // Vernice con trasparente lucido sopra, come un telaio vero
      frame: new THREE.MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
      metal: std(0xc8d0d8, 0.9, 0.25),
      spoke: std(0xaab4bf, 0.8, 0.35),
      dark: std(0x23282f, 0.2, 0.6),
      // Pezzi con materiale proprio: lampeggiano da soli quando si fa manutenzione.
      tire: Object.assign(std(0x1b1f24, 0, 0.85), { bumpMap: treadTexture(), bumpScale: 0.6 }),
      brake: std(0xd5dbe2, 0.9, 0.2),
      caliper: std(0x2a2f36, 0.5, 0.4),
      chain: std(0x8d969f, 0.85, 0.35),
      battery: std(0x1f242b, 0.35, 0.45),
      motor: std(0x30363e, 0.6, 0.35),
      saddle: std(0x23282f, 0.1, 0.7),
      bar: std(0xc8d0d8, 0.9, 0.25),
      bell: std(0xe8ecf0, 1, 0.15),
      spring: std(0xff7a1a, 0.6, 0.3),
      tan: std(0xb98a5a, 0, 0.8),
      reflector: new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0xff6a00, emissiveIntensity: 0.35, roughness: 0.3 }),
      lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0xfff1c4, emissiveIntensity: 1.4, roughness: 0.05, clearcoat: 1 }),
      cable: std(0x15181c, 0.1, 0.5),
      decal: new THREE.MeshStandardMaterial({ map: logoTexture(), transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      blueKnob: std(0x2f7fd0, 0.4, 0.35),
      rubber: std(0x2b3036, 0, 0.9),
      bottle: new THREE.MeshPhysicalMaterial({ color: 0xe9eef3, roughness: 0.35, transmission: 0.25, thickness: 0.02 }),
      lamp: glow(0xfff3c4, 0.9),
      tail: glow(0xff3b3b, 0.9),
      screen: glow(0x38bdf8, 0.7),
      led: glow(0x34d399, 1),
      phone: new THREE.MeshBasicMaterial({ map: phoneTexture(), toneMapped: false }),
      mirror: std(0xdfe8f2, 1, 0.04),
      bag: std(0x2d3a2f, 0, 0.85),
      wicker: std(0x9a7a52, 0.1, 0.75),
    };
  }

  // ---------- Pezzi ----------

  function wheel(S, R, mat, parts, side) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R, S.tire, 14, 72), mat.tire);
    tire.scale.z = S.tire > 0.06 ? 1.15 : 1;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - S.tire - 0.008, S.tire > 0.06 ? 0.03 : 0.011, 8, 64), mat.metal);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, S.forkZ * 2.2, 16), mat.metal);
    hub.rotation.x = Math.PI / 2;
    g.add(tire, rim, hub);
    parts.tyres.push(tire);
    if (S.knobby) {
      const knob = new THREE.BoxGeometry(0.022, 0.016, S.tire * 1.7);
      const n = Math.round(R * 140);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const k = new THREE.Mesh(knob, mat.tire);
        k.position.set(Math.cos(a) * (R + S.tire * 0.78), Math.sin(a) * (R + S.tire * 0.78), 0);
        k.rotation.z = a;
        g.add(k);
        parts.tyres.push(k);
      }
    }
    if (S.tanwall) {
      // Fianco color cuoio, tipico delle gomme da città e gravel
      const wall = new THREE.Mesh(new THREE.TorusGeometry(R - S.tire * 0.55, S.tire * 0.5, 10, 72), mat.tan);
      g.add(wall);
      parts.tyres.push(wall);
    }
    // Raggi incrociati come nelle ruote vere: partono dalle flange del mozzo e arrivano al cerchio di sbieco.
    const spokeR = R - S.tire - 0.012;
    const spokes = R < 0.3 ? 28 : 32;
    const flangeZ = S.forkZ * 0.75;
    for (const z of [-flangeZ, flangeZ]) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.004, 20), mat.metal);
      flange.rotation.x = Math.PI / 2;
      flange.position.z = z;
      g.add(flange);
    }
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const z = i % 2 ? flangeZ : -flangeZ;
      const cross = (i % 4 < 2 ? 1 : -1) * 0.38;
      g.add(tube([Math.cos(a) * 0.028, Math.sin(a) * 0.028, z], [Math.cos(a + cross) * spokeR, Math.sin(a + cross) * spokeR, 0], 0.0022, mat.spoke, 4));
    }
    // Cerchio a doppia parete: bordo esterno e canale più scuro dove entrano i nippli dei raggi
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R - S.tire + 0.002, 0.0045, 6, 72), mat.metal);
    for (const z of [-0.011, 0.011]) {
      const l = lip.clone();
      l.position.z = z * (S.tire > 0.06 ? 2.2 : 1);
      g.add(l);
    }
    const nipples = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.012, 6), mat.metal, spokes);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + (i % 4 < 2 ? 1 : -1) * 0.38;
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
      nipples.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.cos(a) * (spokeR + 0.004), Math.sin(a) * (spokeR + 0.004), 0), q, new THREE.Vector3(1, 1, 1)));
    }
    g.add(nipples);
    const valve = tube([0, -(R - S.tire - 0.02), 0], [0, -(R - S.tire - 0.055), 0], 0.004, mat.metal, 6);
    const valveCap = tube([0, -(R - S.tire - 0.055), 0], [0, -(R - S.tire - 0.068), 0], 0.005, mat.dark, 8);
    g.add(valve, valveCap);
    // Freno a disco a sinistra: pista frenante forata e ragno a sei bracci fissato al mozzo
    const rotorR = R < 0.3 ? 0.07 : S.knobby ? 0.09 : 0.08;
    const rotorZ = -S.forkZ - 0.008;
    const disc = new THREE.Shape();
    disc.absarc(0, 0, rotorR, 0, Math.PI * 2, false);
    const inner = new THREE.Path();
    inner.absarc(0, 0, rotorR * 0.7, 0, Math.PI * 2, true);
    disc.holes.push(inner);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const hole = new THREE.Path();
      hole.absarc(Math.cos(a) * rotorR * 0.85, Math.sin(a) * rotorR * 0.85, rotorR * 0.045, 0, Math.PI * 2, true);
      disc.holes.push(hole);
    }
    const rotor = new THREE.Mesh(new THREE.ExtrudeGeometry(disc, { depth: 0.002, bevelEnabled: false, curveSegments: 24 }), mat.brake);
    rotor.position.z = rotorZ - 0.001;
    const spiderParts = [new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.006, 6), mat.caliper)];
    spiderParts[0].rotation.x = Math.PI / 2;
    spiderParts[0].position.z = rotorZ;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const arm = box(rotorR * 0.5, 0.009, 0.003, mat.caliper, [Math.cos(a) * rotorR * 0.45, Math.sin(a) * rotorR * 0.45, rotorZ], a);
      spiderParts.push(arm);
    }
    g.add(rotor, ...spiderParts);
    parts.brakes.push(rotor, ...spiderParts);
    if (S.reflectors) {
      // Catarifrangenti arancioni sui raggi
      for (const a of [0.4, 0.4 + Math.PI]) {
        const refl = box(0.05, 0.016, 0.006, mat.reflector, [Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62, 0], a);
        g.add(refl);
      }
    }
    if (side === 'rear') {
      for (let i = 0; i < 10; i++) {
        // Pacco pignoni: il più grande verso i raggi, il più piccolo verso l'esterno (come sulle bici vere)
        const cog = new THREE.Mesh(new THREE.TorusGeometry(0.03 + (9 - i) * 0.008, 0.005, 6, 28), mat.chain);
        cog.position.z = 0.045 + i * 0.006;
        g.add(cog);
        parts.gears.push(cog);
      }
      if (S.motor === 'hub') {
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 32), mat.motor);
        motor.rotation.x = Math.PI / 2;
        g.add(motor);
        parts.battery.push(motor);
      }
    }
    return g;
  }

  function buildBike(styleName, mat, extraBattery) {
    const S = settle(STYLES[styleName] || STYLES.classic);
    const parts = { tyres: [], brakes: [], chain: [], gears: [], battery: [], saddle: [], handlebar: [], bell: [], wheels: [], lights: [] };
    const bike = new THREE.Group();
    const rearR = S.rearR || S.R;
    const rear = v3([S.rear, rearR]);
    const front = v3([S.front, S.R]);
    const bb = v3(S.bb);
    const seat = v3(S.seat);
    const head = v3(S.head);
    const headLow = v3(S.headLow);
    const T = S.tube;
    const Z = S.forkZ;

    const rearWheel = wheel(S, rearR, mat, parts, 'rear');
    rearWheel.position.copy(rear);
    rearWheel.userData.R = rearR;
    const frontWheel = wheel(S, S.R, mat, parts, 'front');
    frontWheel.position.copy(front);
    frontWheel.userData.R = S.R;
    bike.add(rearWheel, frontWheel);
    parts.wheels.push(rearWheel, frontWheel);

    // ---- Telaio ----
    bike.add(tube(headLow, head, T * 1.25, mat.frame));
    // Dettagli del telaio: scatola del movimento centrale, calotte dello sterzo, raccordi, forcellini, collarino
    const shellBB = new THREE.Mesh(new THREE.CylinderGeometry(T * 1.35, T * 1.35, 0.074, 20), mat.frame);
    shellBB.rotation.x = Math.PI / 2;
    shellBB.position.copy(bb);
    bike.add(shellBB);
    const headDir = head.clone().sub(headLow).normalize();
    for (const [p, sgn] of [[head, 1], [headLow, -1]]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(T * 1.45, T * 1.45, 0.014, 20), mat.metal);
      cup.position.copy(p).addScaledVector(headDir, sgn * 0.007);
      cup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), headDir);
      bike.add(cup);
    }
    for (const [p, r] of [[seat, T * 1.05], [v3([head.x - 0.01, head.y - 0.03]), T * 1.1]]) {
      const joint = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat.frame);
      joint.position.copy(p);
      bike.add(joint);
    }
    for (const z of [-Z * 0.9 - 0.004, Z * 0.9 + 0.004]) {
      bike.add(box(0.045, 0.032, 0.006, mat.frame, [rear.x + 0.012, rear.y + 0.004, z], 0.35));
    }
    const clamp = new THREE.Mesh(new THREE.TorusGeometry(T * 1.05, 0.004, 6, 18), mat.metal);
    clamp.position.copy(seat);
    clamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), seat.clone().sub(bb).normalize());
    bike.add(clamp);
    const integrated = S.battery === 'integrated';
    if (S.top === 'fold') {
      // Pieghevole: un solo tubo spesso con la cerniera a metà, piantone e attacco alti.
      const low = v3([seat.x + 0.02, seat.y - 0.08]);
      bike.add(tube(low, headLow, T * 1.5, mat.frame), tube(bb, seat, T, mat.frame));
      const mid = low.clone().lerp(headLow, 0.5);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(T * 1.9, T * 1.9, 0.05, 20), mat.metal);
      hinge.position.copy(mid);
      hinge.rotation.z = Math.atan2(headLow.y - low.y, headLow.x - low.x) + Math.PI / 2;
      bike.add(hinge);
      if (integrated) {
        const pack = tube(low.clone().lerp(headLow, 0.12).add(v3([0, -T * 0.9])), low.clone().lerp(headLow, 0.4).add(v3([0, -T * 0.9])), T * 1.05, mat.battery);
        bike.add(pack);
        parts.battery.push(pack);
      }
    } else if (S.top === 'low') {
      // Telaio aperto: due tubi curvi bassi, si sale senza alzare la gamba.
      const [l1, l2, u1] = S.low;
      bike.add(curve([headLow, l1, l2, bb], T * 1.15, mat.frame));
      bike.add(curve([[head.x - 0.01, head.y - 0.06], u1, [u1[0] - 0.2, 0.46], [-0.08, 0.48]], T * 0.85, mat.frame));
      bike.add(tube(bb, seat, T, mat.frame));
    } else {
      bike.add(tube(bb, seat, T, mat.frame));
      // Tubo obliquo: con la batteria integrata è più grosso e ha il coperchio scuro sotto.
      bike.add(tube(bb, headLow, T * (integrated ? 1.75 : 1.15), mat.frame));
      if (integrated) {
        const dir = headLow.clone().sub(bb).normalize();
        const under = new THREE.Vector3(dir.y, -dir.x, 0).multiplyScalar(T * 1.05);
        const pack = tube(bb.clone().lerp(headLow, 0.18).add(under), bb.clone().lerp(headLow, 0.86).add(under), T * 1.05, mat.battery);
        bike.add(pack);
        parts.battery.push(pack);
        const led = box(0.03, 0.01, 0.012, mat.led, [0, 0, 0]);
        led.position.copy(bb.clone().lerp(headLow, 0.55)).add(new THREE.Vector3(0, 0, T * 1.6));
        bike.add(led);
      }
      const topEnd = S.top === 'sloped' ? v3([seat.x + 0.03, seat.y - 0.09]) : seat;
      bike.add(tube(topEnd, v3([head.x - 0.01, head.y - 0.03]), T * 0.9, mat.frame));
    }

    // Foderi: bassi verso il movimento centrale, alti verso il piantone (o il bilanciere della biammortizzata)
    const stayTop = S.rearShock ? v3([seat.x + 0.03, seat.y - 0.2]) : v3([seat.x + 0.03, seat.y - 0.06]);
    for (const z of [-Z * 0.9, Z * 0.9]) {
      bike.add(tube(v3([rear.x, rear.y], z), v3(S.bb, z * 0.6), T * 0.5, mat.frame));
      if (!S.longtail) bike.add(tube(v3([rear.x, rear.y], z), v3([stayTop.x, stayTop.y], z * 0.4), T * 0.46, mat.frame));
    }
    if (S.rearShock) {
      // Ammortizzatore posteriore con molla arancione, tra bilanciere e tubo orizzontale.
      const a = stayTop.clone();
      const b = v3([seat.x + 0.24, seat.y - 0.06]);
      bike.add(tube(a, b, 0.017, mat.dark));
      const dir = b.clone().sub(a);
      for (let i = 1; i < 7; i++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 18), mat.spring);
        coil.position.copy(a).addScaledVector(dir, 0.15 + i * 0.1);
        coil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
        bike.add(coil);
      }
      bike.add(tube(v3([seat.x + 0.03, seat.y - 0.06]), stayTop, T * 0.6, mat.frame));
    }

    // ---- Forcella ----
    for (const z of [-Z, Z]) {
      if (S.fork === 'suspension') {
        const mid = headLow.clone().lerp(front, 0.45);
        bike.add(tube(v3([headLow.x, headLow.y], z * 0.7), v3([mid.x, mid.y], z), 0.019, mat.metal));
        bike.add(tube(v3([mid.x, mid.y], z), v3([front.x, front.y], z), 0.025, mat.dark));
      } else {
        bike.add(tube(v3([headLow.x, headLow.y], z * 0.5), v3([front.x, front.y], z), S.tire > 0.06 ? 0.018 : 0.013, mat.frame));
      }
    }
    if (S.fork === 'suspension') {
      bike.add(box(0.06, 0.03, Z * 2.8, mat.dark, [headLow.x, headLow.y - 0.01, 0]));
      const mid = headLow.clone().lerp(front, 0.45);
      // Archetto che unisce i foderi, parapolvere e manopola di blocco
      bike.add(curve([[mid.x + 0.02, mid.y - 0.01, -Z], [mid.x + 0.05, mid.y + 0.03, 0], [mid.x + 0.02, mid.y - 0.01, Z]], 0.012, mat.dark, 20));
      for (const z of [-Z, Z]) {
        const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 16), mat.rubber);
        seal.position.set(mid.x, mid.y, z);
        seal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), headLow.clone().sub(front).normalize());
        bike.add(seal);
      }
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.014, 12), mat.blueKnob);
      knob.position.set(headLow.x, headLow.y + 0.012, Z * 0.7);
      bike.add(knob);
    }
    // Sgancio rapido delle ruote (lato sinistro): dado e leva
    for (const [c, ang] of [[front, Math.atan2(headLow.y - front.y, headLow.x - front.x)], [rear, Math.atan2(S.bb[1] - rear.y, S.bb[0] - rear.x) + 0.4]]) {
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 14), mat.metal);
      nut.rotation.x = Math.PI / 2;
      nut.position.set(c.x, c.y, -Z - 0.03);
      const lever = box(0.065, 0.012, 0.006, mat.metal, [c.x + Math.cos(ang) * 0.034, c.y + Math.sin(ang) * 0.034, -Z - 0.037], ang);
      bike.add(nut, lever);
    }

    // Pinze dei freni a disco a sinistra: corpo sagomato a cavallo del disco più l'adattatore sul telaio
    const rotorEdge = (R) => (R < 0.3 ? 0.07 : S.knobby ? 0.09 : 0.08) * 0.85;
    function caliper(c, R, angle) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.038, 4, 10), mat.caliper);
      body.rotation.z = angle + Math.PI / 2;
      const halfA = body.clone();
      body.position.z = -0.006;
      halfA.position.z = 0.008;
      halfA.scale.set(0.85, 1, 0.85);
      const adapter = box(0.045, 0.012, 0.006, mat.metal, [0, 0, 0.012], angle);
      adapter.position.x = -Math.cos(angle) * 0.022;
      adapter.position.y = -Math.sin(angle) * 0.022;
      const bleed = tube([0, 0, -0.022], [0, 0, -0.03], 0.004, mat.metal, 6);
      g.add(body, halfA, adapter, bleed);
      const d = rotorEdge(R);
      g.position.set(c.x + Math.cos(angle) * d, c.y + Math.sin(angle) * d, -Z - 0.009);
      return g;
    }
    const caliperF = caliper(front, S.R, Math.PI * 0.62);
    const caliperR = caliper(rear, rearR, Math.PI * 0.32);
    bike.add(caliperF, caliperR);
    parts.brakes.push(...caliperF.children, ...caliperR.children);

    // ---- Sella ----
    const saddleX = seat.x - 0.04;
    bike.add(tube(seat, v3([saddleX, S.saddleY - 0.03]), S.top === 'fold' ? 0.017 : 0.014, mat.metal));
    // Sella vera: punta stretta, dietro larga (più larga sulle bici da passeggio), imbottitura arrotondata.
    const outline = new THREE.Shape();
    const wBack = S.comfort ? 0.1 : 0.07;
    outline.moveTo(0.13, 0);
    outline.bezierCurveTo(0.13, 0.022, 0.05, 0.024, 0, 0.03);
    outline.bezierCurveTo(-0.06, 0.04, -0.12, wBack, -0.13, wBack * 0.55);
    outline.bezierCurveTo(-0.14, 0, -0.14, 0, -0.14, 0);
    outline.bezierCurveTo(-0.14, 0, -0.14, 0, -0.13, -wBack * 0.55);
    outline.bezierCurveTo(-0.12, -wBack, -0.06, -0.04, 0, -0.03);
    outline.bezierCurveTo(0.05, -0.024, 0.13, -0.022, 0.13, 0);
    const saddleGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 4, curveSegments: 16 });
    saddleGeo.rotateX(-Math.PI / 2);
    const saddle = new THREE.Mesh(saddleGeo, mat.saddle);
    saddle.position.set(saddleX - 0.005, S.saddleY - 0.02, 0);
    saddle.rotation.z = 0.04;
    bike.add(saddle);
    parts.saddle.push(saddle);
    // Binari della sella e morsetto in cima al reggisella
    const clampAt = v3([saddleX, S.saddleY - 0.03]);
    bike.add(box(0.04, 0.018, 0.04, mat.dark, [clampAt.x, clampAt.y, 0]));
    for (const z of [-0.022, 0.022]) {
      const rail = curve([[saddleX + 0.1, S.saddleY - 0.012, z * 0.5], [saddleX + 0.05, S.saddleY - 0.028, z], [saddleX - 0.06, S.saddleY - 0.028, z], [saddleX - 0.1, S.saddleY - 0.012, z * 1.3]], 0.0035, mat.metal, 20);
      bike.add(rail);
      parts.saddle.push(rail);
    }

    // ---- Attacco e manubrio ----
    const stemTop = S.top === 'fold' ? v3([head.x - 0.03, 0.98]) : v3([head.x + 0.03, head.y + 0.1]);
    bike.add(tube(head, stemTop, S.top === 'fold' ? 0.019 : 0.016, mat.metal));
    // Distanziali sotto l'attacco e placca con le quattro viti che tiene il manubrio
    const steer = head.clone().sub(headLow).normalize();
    for (let i = 0; i < 3; i++) {
      const spacer = new THREE.Mesh(new THREE.CylinderGeometry(T * 1.25, T * 1.25, 0.008, 18), i === 1 ? mat.metal : mat.dark);
      spacer.position.copy(head).addScaledVector(steer, 0.018 + i * 0.009);
      spacer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), steer);
      bike.add(spacer);
    }
    bike.add(box(0.012, 0.034, 0.042, mat.metal, [stemTop.x + 0.016, stemTop.y, 0]));
    for (const [dy, dz] of [[0.011, 0.014], [0.011, -0.014], [-0.011, 0.014], [-0.011, -0.014]]) {
      bike.add(tube([stemTop.x + 0.022, stemTop.y + dy, dz], [stemTop.x + 0.026, stemTop.y + dy, dz], 0.0032, mat.dark, 6));
    }
    const barParts = [];
    if (S.bar === 'drop') {
      for (const s of [-1, 1]) {
        barParts.push(curve([[stemTop.x, stemTop.y, 0], [stemTop.x, stemTop.y, s * 0.16], [stemTop.x + 0.08, stemTop.y - 0.01, s * 0.2],
          [stemTop.x + 0.1, stemTop.y - 0.08, s * 0.2], [stemTop.x + 0.03, stemTop.y - 0.13, s * 0.2]], 0.013, mat.bar));
      }
    } else if (S.bar === 'riser') {
      for (const s of [-1, 1]) {
        barParts.push(curve([[stemTop.x, stemTop.y, 0], [stemTop.x - 0.01, stemTop.y + 0.03, s * 0.14], [stemTop.x - 0.08, stemTop.y + 0.04, s * 0.27]], 0.013, mat.bar));
        barParts.push(tube(v3([stemTop.x - 0.08, stemTop.y + 0.04], s * 0.24), v3([stemTop.x - 0.1, stemTop.y + 0.04], s * 0.33), 0.02, mat.dark));
      }
    } else {
      const w = S.bar === 'wide' ? 0.36 : 0.27;
      barParts.push(tube(v3([stemTop.x, stemTop.y], -w), v3([stemTop.x, stemTop.y], w), 0.013, mat.bar));
      for (const s of [-1, 1]) {
        barParts.push(tube(v3([stemTop.x, stemTop.y], s * (w - 0.07)), v3([stemTop.x, stemTop.y], s * (w + 0.005)), 0.02, mat.dark));
        // Anelli di bloccaggio delle manopole
        const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.008, 14), mat.metal);
        lock.rotation.x = Math.PI / 2;
        lock.position.set(stemTop.x, stemTop.y, s * (w - 0.074));
        barParts.push(lock);
      }
    }
    for (const p of barParts) bike.add(p);
    parts.handlebar.push(...barParts);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.026, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.bell);
    bell.position.set(stemTop.x, stemTop.y + 0.012, S.bar === 'drop' ? -0.1 : -0.14);
    bike.add(bell);
    parts.bell.push(bell);
    if (S.display) {
      // Display della bici elettrica al centro del manubrio
      const display = box(0.05, 0.012, 0.075, mat.dark, [stemTop.x - 0.025, stemTop.y + 0.03, 0], 0.5);
      const screen = box(0.04, 0.002, 0.06, mat.screen, [stemTop.x - 0.028, stemTop.y + 0.037, 0], 0.5);
      bike.add(display, screen);
      parts.handlebar.push(display, screen);
      // Comando dell'assistenza vicino alla manopola sinistra, con i tasti + e -
      const remoteZ = S.bar === 'drop' ? -0.13 : S.bar === 'riser' ? -0.2 : -((S.bar === 'wide' ? 0.36 : 0.27) - 0.12);
      const remote = box(0.03, 0.02, 0.028, mat.dark, [stemTop.x - 0.01, stemTop.y + 0.018, remoteZ]);
      bike.add(remote);
      for (const dx of [-0.007, 0.007]) bike.add(box(0.008, 0.004, 0.012, mat.metal, [stemTop.x - 0.01 + dx, stemTop.y + 0.03, remoteZ]));
      parts.handlebar.push(remote);
    }
    if (S.battery) {
      // Presa di ricarica con tappo di gomma, sopra il movimento centrale
      const port = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 14), mat.rubber);
      port.rotation.x = Math.PI / 2;
      port.position.copy(bb.clone().lerp(S.top === 'low' || S.top === 'fold' ? headLow : seat, 0.12)).add(new THREE.Vector3(0, 0, T * 1.3));
      bike.add(port);
      parts.battery.push(port);
    }

    // ---- Trasmissione e motore ----
    const crank = new THREE.Group();
    crank.position.copy(bb);
    const ringRadius = S.motor === 'mid' ? 0.085 : 0.1;
    const ringZ = 0.06 + (S.motor === 'mid' ? 0.02 : 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.008, 8, 48), mat.chain);
    ring.position.z = ringZ;
    crank.add(ring);
    parts.chain.push(ring);
    // Denti della corona e "ragno" a quattro bracci
    const tooth = new THREE.BoxGeometry(0.008, 0.012, 0.005);
    const teeth = Math.round(ringRadius * 380);
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const t = new THREE.Mesh(tooth, mat.chain);
      t.position.set(Math.cos(a) * (ringRadius + 0.009), Math.sin(a) * (ringRadius + 0.009), ringZ);
      t.rotation.z = a - Math.PI / 2;
      crank.add(t);
      parts.chain.push(t);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      crank.add(tube([0, 0, ringZ], [Math.cos(a) * ringRadius * 0.92, Math.sin(a) * ringRadius * 0.92, ringZ], 0.007, mat.metal, 6));
    }
    for (const [z, a] of [[0.08, 0], [-0.08, Math.PI]]) {
      const zz = z + Math.sign(z) * (S.motor === 'mid' ? 0.02 : 0);
      const tip = [Math.cos(a) * 0.17, Math.sin(a) * 0.17, zz];
      crank.add(tube([0, 0, zz], tip, 0.011, mat.metal, 10));
      // Pedale a piattaforma: corpo, perno e due guance
      const pz = zz + Math.sign(z) * 0.05;
      crank.add(tube(tip, [tip[0], tip[1], pz + Math.sign(z) * 0.04], 0.005, mat.metal, 6));
      crank.add(box(0.1, 0.012, 0.08, mat.rubber, [tip[0], tip[1], pz]));
      crank.add(box(0.1, 0.022, 0.006, mat.dark, [tip[0], tip[1], pz - 0.04]), box(0.1, 0.022, 0.006, mat.dark, [tip[0], tip[1], pz + 0.04]));
      if (S.comfort || S.reflectors) {
        // Catarifrangenti arancioni davanti e dietro al pedale
        for (const dx of [-0.051, 0.051]) crank.add(box(0.004, 0.014, 0.05, mat.reflector, [tip[0] + dx, tip[1], pz]));
      }
    }
    bike.add(crank);
    const ringR = S.motor === 'mid' ? 0.085 : 0.1;
    const chainZ = 0.06 + (S.motor === 'mid' ? 0.02 : 0); // allineata alla corona

    // ---- Cambio posteriore ----
    // La catena è sul sesto pignone; il cambio pende sotto il mozzo, dietro, allineato a quel pignone.
    const COG = 5;
    const cogR = 0.03 + (9 - COG) * 0.008;
    const cogZ = 0.045 + COG * 0.006;
    const pulleyR = 0.017;
    const upper = v3([rear.x - 0.03, rear.y - cogR - 0.032], cogZ);
    const lower = v3([rear.x - 0.008, rear.y - cogR - 0.11], cogZ);
    const derailleur = new THREE.Group();
    const knuckleB = v3([rear.x - 0.012, rear.y - 0.03], cogZ + 0.03);
    const knuckleP = v3([upper.x - 0.012, upper.y + 0.016], cogZ + 0.03);
    // Forcellino avvitato al telaio
    derailleur.add(box(0.03, 0.03, 0.006, mat.frame, [rear.x - 0.004, rear.y - 0.018, cogZ + 0.022], -0.5));
    for (const k of [knuckleB, knuckleP]) {
      const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.022, 14), mat.dark);
      knuckle.rotation.x = Math.PI / 2;
      knuckle.position.copy(k);
      derailleur.add(knuckle);
    }
    // Parallelogramma: due bracci tra i due snodi
    for (const dz of [-0.006, 0.006]) {
      derailleur.add(tube(knuckleB.clone().add(new THREE.Vector3(0, 0, dz)), knuckleP.clone().add(new THREE.Vector3(0, 0, dz)), 0.006, dz < 0 ? mat.dark : mat.metal, 8));
    }
    derailleur.add(tube(knuckleP, v3([upper.x, upper.y], cogZ + 0.012), 0.005, mat.metal, 8));
    // Gabbia: due piastre sagomate attorno alle rotelline
    const d = lower.clone().sub(upper);
    const ang = Math.atan2(d.y, d.x);
    const cage = new THREE.Shape();
    const cr = 0.023;
    cage.absarc(upper.x, upper.y, cr, ang + Math.PI / 2, ang + (3 * Math.PI) / 2, false);
    cage.absarc(lower.x, lower.y, cr * 1.05, ang - Math.PI / 2, ang + Math.PI / 2, false);
    cage.closePath();
    const cageGeo = new THREE.ExtrudeGeometry(cage, { depth: 0.0025, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 14 });
    for (const [z, m] of [[cogZ + 0.011, mat.dark], [cogZ - 0.0135, mat.metal]]) {
      const plate = new THREE.Mesh(cageGeo, m);
      plate.position.z = z;
      derailleur.add(plate);
    }
    // Rotelline dentate che girano con la catena
    const pulleys = [];
    for (const c of [upper, lower]) {
      const pulley = new THREE.Group();
      pulley.position.copy(c);
      const wheelDisc = new THREE.Mesh(new THREE.CylinderGeometry(pulleyR - 0.002, pulleyR - 0.002, 0.006, 16), mat.dark);
      wheelDisc.rotation.x = Math.PI / 2;
      pulley.add(wheelDisc);
      const tooth = new THREE.BoxGeometry(0.004, 0.005, 0.005);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const t = new THREE.Mesh(tooth, mat.dark);
        t.position.set(Math.cos(a) * pulleyR, Math.sin(a) * pulleyR, 0);
        t.rotation.z = a;
        pulley.add(t);
      }
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8), mat.metal);
      bolt.rotation.x = Math.PI / 2;
      pulley.add(bolt);
      derailleur.add(pulley);
      pulleys.push(pulley);
    }
    bike.add(derailleur);
    derailleur.traverse((o) => { if (o.isMesh) parts.gears.push(o); });

    // ---- Catena a maglie ----
    // Percorso chiuso come sulle bici vere: sopra la corona, indietro fino al pignone, giù attorno al pignone,
    // davanti alla rotellina alta e dietro a quella bassa (la "S" del cambio), poi avanti sotto la corona.
    const arc = (cx, cy, r, from, to, z, n) => Array.from({ length: n + 1 }, (_, i) => {
      const a = from + ((to - from) * i) / n;
      return new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z);
    });
    const deg = Math.PI / 180;
    const pathPoints = [
      ...arc(bb.x, bb.y, ringR, 85 * deg, 95 * deg, chainZ, 1),
      ...arc(rear.x, rear.y, cogR, 90 * deg, 228 * deg, cogZ, 7),
      ...arc(upper.x, upper.y, pulleyR, 70 * deg, -70 * deg, cogZ, 5),
      ...arc(lower.x, lower.y, pulleyR, 175 * deg, 290 * deg, cogZ, 5),
      ...arc(bb.x, bb.y, ringR, -95 * deg, 80 * deg, chainZ, 12),
    ].filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > 0.004);
    const chainCurve = new THREE.CatmullRomCurve3(pathPoints, true, 'centripetal');
    const chainLength = chainCurve.getLength();
    const PITCH = 0.0127; // mezzo pollice, il passo delle catene da bici
    const links = Math.round(chainLength / PITCH);
    const SAMPLES = 1200;
    const samples = chainCurve.getSpacedPoints(SAMPLES);
    const plate = new THREE.BoxGeometry(PITCH * 1.08, 0.0072, 0.0016);
    const linkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.32 });
    const chainMesh = new THREE.InstancedMesh(plate, linkMat, links * 2);
    const silver = new THREE.Color(0xb7bfc8);
    const darkLink = new THREE.Color(0x4a525b);
    for (let i = 0; i < links * 2; i++) chainMesh.setColorAt(i, Math.floor(i / 2) % 2 ? darkLink : silver);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    /** Fa scorrere la catena di "offset" metri lungo il percorso (e gira le rotelline). */
    function moveChain(offset) {
      for (let k = 0; k < links; k++) {
        const u = ((((k * PITCH + offset) % chainLength) + chainLength) % chainLength) / chainLength;
        const i = Math.floor(u * SAMPLES);
        const a = samples[i];
        const b = samples[(i + 1) % SAMPLES];
        q.setFromAxisAngle(zAxis, Math.atan2(b.y - a.y, b.x - a.x));
        for (const [n, dz] of [[0, -0.0034], [1, 0.0034]]) {
          pos.set(a.x, a.y, a.z + dz);
          chainMesh.setMatrixAt(k * 2 + n, m4.compose(pos, q, one));
        }
      }
      chainMesh.instanceMatrix.needsUpdate = true;
      for (const p of pulleys) p.rotation.z = -offset / pulleyR;
    }
    moveChain(0);
    bike.add(chainMesh);
    parts.chain.push(chainMesh);
    const derailleurCable = knuckleB.clone().add(new THREE.Vector3(0.01, 0.01, 0.005));
    if (S.double) {
      // Doppia corona e cambio anteriore sul piantone
      const small = new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.007, 8, 40), mat.chain);
      small.position.set(bb.x, bb.y, chainZ - 0.012);
      bike.add(small);
      parts.chain.push(small);
      const fd = bb.clone().lerp(seat, 0.27);
      for (const z of [chainZ + 0.012, chainZ - 0.016]) {
        bike.add(box(0.075, 0.03, 0.003, mat.metal, [fd.x + 0.035, fd.y - 0.005, z], -0.25));
      }
      bike.add(tube(v3([fd.x, fd.y], 0), v3([fd.x + 0.02, fd.y], chainZ), 0.008, mat.dark, 8));
    }
    if (S.chainguard) {
      // Paracatena come sulle bici da città: lamina sopra il tratto alto della catena, arrotondata sulla corona
      const g = new THREE.Shape();
      const top = 0.022;
      const back = bb.distanceTo(rear) * 0.82;
      g.moveTo(-back, ringR + top - 0.004);
      g.lineTo(0, ringR + top);
      g.absarc(0, 0, ringR + top, Math.PI / 2, -Math.PI / 6, true);
      g.lineTo(Math.cos(-Math.PI / 6) * (ringR - 0.01), Math.sin(-Math.PI / 6) * (ringR - 0.01));
      g.absarc(0, 0, ringR - 0.01, -Math.PI / 6, Math.PI / 2, false);
      g.lineTo(-back, ringR - 0.018);
      g.closePath();
      const guard = new THREE.Mesh(new THREE.ExtrudeGeometry(g, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 20 }), mat.frame);
      guard.position.set(bb.x, bb.y, 0.088);
      guard.rotation.z = Math.atan2(rear.y + 0.03 - bb.y, rear.x - bb.x) - Math.PI;
      bike.add(guard);
    }
    if (S.motor === 'mid') {
      // Motore centrale: carter scuro attorno al movimento centrale
      const k = S.motorSize || 1;
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * k, 0.075 * k, 0.1, 28), mat.motor);
      motor.rotation.x = Math.PI / 2;
      motor.position.set(bb.x - 0.015, bb.y - 0.01, 0);
      const cover = box(0.12 * k, 0.07 * k, 0.1, mat.motor, [bb.x + 0.04, bb.y + 0.01, 0], Math.atan2(headLow.y - bb.y, headLow.x - bb.x));
      bike.add(motor, cover);
      parts.battery.push(motor, cover);
    }

    // ---- Batterie non integrate ----
    let extra = null;
    if (S.battery === 'rack') {
      const pack = box(0.32, 0.06, 0.1, mat.battery, [-0.5, 0.79, 0]);
      bike.add(pack);
      parts.battery.push(pack);
    } else if (!S.battery) {
      // Bici normale segnata come elettrica: batteria esterna sul tubo obliquo.
      extra = new THREE.Group();
      const dir = headLow.clone().sub(bb);
      const pack = box(0.3, 0.075, 0.075, mat.battery, [0, 0, 0]);
      const led = box(0.05, 0.012, 0.078, mat.led, [0, 0.035, 0]);
      extra.add(pack, led);
      extra.position.copy(bb.clone().addScaledVector(dir, 0.5)).add(new THREE.Vector3(0, 0.05, 0));
      extra.rotation.z = Math.atan2(dir.y, dir.x);
      extra.visible = Boolean(extraBattery);
      bike.add(extra);
      parts.battery.push(pack);
    }

    // ---- Accessori ----
    if (S.fenders) {
      // Come sulle bici in commercio (angoli dal mozzo: 0 = davanti, 90° = in alto, 180° = dietro):
      // anteriore da ~56° davanti fin dietro la forcella; posteriore che avvolge la ruota da subito dietro
      // il movimento centrale (~18°) fino a poco sotto il mozzo dietro (~195°), con il catarifrangente.
      const width = Math.max(0.05, S.tire * 2 + 0.03);
      const deg = Math.PI / 180;
      const list = [{ c: front, R: S.R, from: 56 * deg, to: 158 * deg, stays: [56 * deg] }];
      if (!S.longtail) list.push({ c: rear, R: rearR, from: 18 * deg, to: 195 * deg, stays: [120 * deg, 188 * deg], reflector: true });
      for (const f of list) {
        const fr = f.R + S.tire + 0.024;
        const shell = new THREE.Mesh(fenderGeometry(fr, f.from, f.to, width), mat.frame);
        shell.position.copy(f.c);
        bike.add(shell);
        // Astine dal bordo del parafango al mozzo
        for (const a of f.stays) {
          for (const z of [-Z, Z]) {
            bike.add(tube(v3([f.c.x + Math.cos(a) * fr, f.c.y + Math.sin(a) * fr], z * 0.85), v3([f.c.x, f.c.y], z), 0.0035, mat.metal, 5));
          }
        }
        if (f.reflector) {
          const a = f.to - 12 * deg;
          const refl = box(0.012, 0.045, 0.03, mat.tail, [f.c.x + Math.cos(a) * (fr + 0.006), f.c.y + Math.sin(a) * (fr + 0.006), 0], a);
          bike.add(refl);
        }
      }
      if (!S.longtail) {
        // Attacco del parafango posteriore al ponticello dei foderi bassi, dietro il movimento centrale
        const a = 18 * deg;
        const fr = rearR + S.tire + 0.024;
        bike.add(box(0.03, 0.012, Z * 1.9, mat.frame, [rear.x + Math.cos(a) * fr - 0.01, rear.y + Math.sin(a) * fr - 0.012, 0]));
      }
    }
    if (S.rack) {
      const y = 0.74;
      for (const z of [-0.07, 0.07]) {
        bike.add(tube(v3([-0.66, y], z), v3([-0.26, y], z), 0.008, mat.metal), tube(v3([-0.6, y], z), v3([rear.x, rear.y], z), 0.008, mat.metal));
      }
      for (const x of [-0.6, -0.45, -0.3]) bike.add(tube(v3([x, y], -0.07), v3([x, y], 0.07), 0.007, mat.metal));
      bike.add(tube(v3([-0.26, y]), v3([seat.x + 0.02, seat.y - 0.08]), 0.008, mat.metal));
    }
    if (S.longtail) {
      // Cargo a coda lunga: pianale sopra la ruota piccola, pedane per il passeggero, foderi lunghi.
      const y = 0.6;
      const deck = box(0.95, 0.025, 0.24, mat.dark, [rear.x + 0.1, y, 0]);
      bike.add(deck);
      for (const z of [-0.12, 0.12]) {
        bike.add(tube(v3([rear.x - 0.35, y - 0.02], z), v3([seat.x + 0.02, seat.y - 0.12], z * 0.3), 0.012, mat.frame));
        bike.add(tube(v3([rear.x, rear.y], z * 0.6), v3([rear.x + 0.25, y - 0.02], z), 0.012, mat.frame));
        bike.add(tube(v3([rear.x - 0.3, rear.y], z * 0.6), v3([rear.x - 0.3, y - 0.02], z), 0.01, mat.metal));
        bike.add(box(0.5, 0.012, 0.09, mat.metal, [rear.x + 0.2, 0.2, z * 1.6]));
        bike.add(tube(v3([rear.x - 0.05, 0.2], z * 1.6), v3([rear.x - 0.05, y - 0.02], z), 0.008, mat.metal));
      }
      bike.add(curve([[rear.x - 0.38, y + 0.14, -0.12], [rear.x - 0.38, y + 0.2, 0], [rear.x - 0.38, y + 0.14, 0.12]], 0.01, mat.metal));
    }
    // Leve dei freni e cavi verso le pinze
    const leverAt = (s) => (S.bar === 'drop'
      ? v3([stemTop.x + 0.1, stemTop.y - 0.01], s * 0.2)
      : S.bar === 'riser'
        ? v3([stemTop.x - 0.06, stemTop.y + 0.04], s * 0.22)
        : v3([stemTop.x + 0.01, stemTop.y], s * ((S.bar === 'wide' ? 0.36 : 0.27) - 0.1)));
    for (const s of [-1, 1]) {
      const at = leverAt(s);
      const lever = S.bar === 'drop'
        ? box(0.04, 0.05, 0.022, mat.dark, [at.x, at.y + 0.015, at.z], -0.3)
        : box(0.085, 0.012, 0.014, mat.dark, [at.x + 0.045, at.y - 0.01, at.z], -0.25);
      bike.add(lever);
      parts.brakes.push(lever);
    }
    const front2 = leverAt(-1);
    const rear2 = leverAt(1);
    bike.add(curve([front2, [head.x + 0.12, stemTop.y + 0.04, -0.07], [headLow.x + 0.05, headLow.y - 0.02, -0.06], [front.x - 0.05, front.y + 0.1, -Z - 0.02], caliperF.position], 0.0035, mat.cable, 60));
    const topMid = v3(S.top === 'low' ? [0.15, 0.5] : [(seat.x + head.x) / 2, (seat.y + head.y) / 2 - 0.03], 0.03);
    bike.add(curve([rear2, [head.x + 0.12, stemTop.y + 0.03, 0.07], [head.x - 0.03, head.y - 0.05, 0.04], topMid, [stayTop.x + 0.02, stayTop.y - 0.02, -0.03], [rear.x + 0.12, rear.y + 0.1, -Z - 0.02], caliperR.position], 0.0035, mat.cable, 80));

    if (S.kickstand) {
      // Cavalletto ripiegato lungo il fodero sinistro
      bike.add(tube(v3([bb.x - 0.08, bb.y - 0.02], -0.06), v3([bb.x - 0.4, bb.y + 0.005], -0.075), 0.009, mat.dark, 8));
      bike.add(box(0.03, 0.01, 0.025, mat.dark, [bb.x - 0.41, bb.y + 0.005, -0.075]));
    }
    if (S.bottle) {
      // Borraccia nel portaborraccia: sul tubo obliquo, o sul piantone se lì c'è la batteria
      const onSeatTube = S.battery === 'integrated';
      const a = onSeatTube ? bb.clone().lerp(seat, 0.3) : bb.clone().lerp(headLow, 0.32);
      const b = onSeatTube ? bb.clone().lerp(seat, 0.62) : bb.clone().lerp(headLow, 0.68);
      const dir = b.clone().sub(a).normalize();
      const off = onSeatTube ? new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(-0.05) : new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(0.05);
      const bottle = tube(a.clone().add(off), b.clone().add(off), 0.032, mat.bottle, 18);
      const cap = tube(b.clone().add(off), b.clone().add(off).addScaledVector(dir, 0.03), 0.014, mat.dark, 12);
      bike.add(bottle, cap);
      for (const t of [0.25, 0.75]) {
        const cage = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.003, 6, 20), mat.metal);
        cage.position.copy(a.clone().lerp(b, t).add(off));
        cage.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        bike.add(cage);
      }
    }

    // ---- Luci ----
    // Faro: davanti al tubo sterzo per le bici da città, sotto il manubrio per le altre.
    const lampAt = S.lamp ? head.clone().lerp(headLow, 0.55).add(new THREE.Vector3(0.055, 0, 0)) : v3([stemTop.x + 0.05, stemTop.y - 0.035]);
    const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.06, 18), mat.dark);
    lampBody.rotation.z = Math.PI / 2;
    lampBody.position.copy(lampAt);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 20), mat.lens);
    lens.rotation.y = Math.PI / 2;
    lens.position.copy(lampAt).add(new THREE.Vector3(0.031, 0, 0));
    bike.add(lampBody, lens);
    if (!S.lamp) bike.add(tube(v3([stemTop.x + 0.01, stemTop.y - 0.005]), lampAt, 0.005, mat.dark, 6));
    // Fanalino rosso: sul portapacchi o sul reggisella
    const tx = S.longtail ? rear.x - 0.39 : S.rack ? -0.675 : saddleX - 0.035;
    const ty = S.longtail ? 0.6 : S.rack ? 0.74 : S.saddleY - 0.13;
    const tailBody = box(0.022, 0.05, 0.034, mat.dark, [tx + 0.006, ty, 0]);
    const tailLens = box(0.006, 0.04, 0.028, mat.tail, [tx - 0.006, ty, 0]);
    bike.add(tailBody, tailLens);
    parts.lights = [lampBody, lens, tailBody, tailLens];

    // ---- Comandi del cambio e cavi ----
    if (S.bar !== 'drop') {
      // Comando a levetta sotto la manopola destra (e sinistra con la doppia corona)
      for (const s of S.double ? [-1, 1] : [1]) {
        const at = leverAt(s);
        const pod = box(0.03, 0.022, 0.026, mat.dark, [at.x + 0.005, at.y - 0.02, at.z - s * 0.035]);
        bike.add(pod);
        parts.chain.push(pod);
      }
    }
    // Cavo del cambio posteriore: dal comando lungo il tubo obliquo e il fodero destro fino al deragliatore
    const shiftFrom = leverAt(1).clone().add(new THREE.Vector3(0, -0.02, -0.03));
    const downMid = S.top === 'low' || S.top === 'fold' ? v3([0.15, 0.4], 0.035) : bb.clone().lerp(headLow, 0.5).add(new THREE.Vector3(0, -T * 1.4, 0.03));
    bike.add(curve([shiftFrom, [head.x + 0.14, stemTop.y - 0.02, 0.06], [headLow.x + 0.02, headLow.y - 0.03, 0.035], downMid,
      [bb.x + 0.02, bb.y - 0.05, 0.035], [bb.x - 0.12, bb.y + 0.0, 0.055], [rear.x + 0.12, rear.y + 0.015, 0.06], [rear.x + 0.02, rear.y - 0.01, cogZ + 0.035], derailleurCable], 0.0032, mat.cable, 90));
    if (S.double) {
      const fd = bb.clone().lerp(seat, 0.27);
      bike.add(curve([leverAt(-1).clone().add(new THREE.Vector3(0, -0.02, 0.03)), [head.x + 0.14, stemTop.y - 0.02, -0.06], [headLow.x + 0.02, headLow.y - 0.03, -0.03],
        bb.clone().lerp(headLow, 0.5).add(new THREE.Vector3(0, -T * 1.4, -0.03)), [bb.x + 0.03, bb.y - 0.05, -0.02], [fd.x + 0.01, fd.y - 0.04, 0.04], [fd.x + 0.02, fd.y, chainZ]], 0.0032, mat.cable, 80));
    }
    if (S.display) {
      // Cavo del display che entra nel tubo sterzo
      bike.add(curve([[stemTop.x - 0.025, stemTop.y + 0.02, 0.02], [head.x + 0.06, head.y + 0.02, 0.03], [head.x + 0.01, head.y - 0.08, 0.025]], 0.003, mat.cable, 30));
    }

    // ---- Dettagli di tutti i giorni ----
    if (!S.display) {
      // Telefono sul manubrio con ContaKM aperto, nel suo supporto a quattro ganci
      const phone = new THREE.Group();
      phone.position.set(stemTop.x - 0.015, stemTop.y + 0.04, 0);
      phone.rotation.z = 0.55;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.152, 0.009, 0.074), mat.dark);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.142, 0.066), mat.phone);
      screen.rotation.x = -Math.PI / 2;
      screen.position.y = 0.0047;
      phone.add(body, screen);
      for (const [px, pz] of [[0.06, 0.038], [0.06, -0.038], [-0.06, 0.038], [-0.06, -0.038]]) {
        phone.add(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.006), mat.rubber).translateX(px).translateZ(pz));
      }
      bike.add(phone);
      bike.add(tube(v3([stemTop.x - 0.005, stemTop.y + 0.004]), v3([stemTop.x - 0.012, stemTop.y + 0.034]), 0.008, mat.dark, 8));
      parts.handlebar.push(body);
    }
    if (S.comfort || styleName === 'e-trekking') {
      // Specchietto retrovisore sulla manopola sinistra
      const end = S.bar === 'riser' ? v3([stemTop.x - 0.1, stemTop.y + 0.04], -0.31) : v3([stemTop.x, stemTop.y], -0.25);
      const top = end.clone().add(new THREE.Vector3(-0.04, 0.2, -0.06));
      bike.add(curve([end, end.clone().add(new THREE.Vector3(0.02, 0.08, -0.03)), top], 0.005, mat.dark, 16));
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.04, 0.018, 24), mat.dark);
      housing.rotation.z = Math.PI / 2;
      housing.position.copy(top);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), mat.mirror);
      glass.rotation.y = -Math.PI / 2;
      glass.position.copy(top).add(new THREE.Vector3(-0.0095, 0, 0));
      bike.add(housing, glass);
      parts.handlebar.push(housing, glass);
    }
    if (S.fenders && !S.longtail && S.top !== 'fold') {
      // Lucchetto ad anello sui foderi alti, sopra la ruota dietro: chiave inserita e anello che abbraccia la gomma
      const dir = v3([stayTop.x, stayTop.y]).sub(v3([rear.x, rear.y])).normalize();
      const at = v3([rear.x, rear.y]).addScaledVector(dir, rearR + S.tire + 0.075);
      const lock = box(0.05, 0.075, Z * 2.2, mat.dark, [at.x, at.y, 0], Math.atan2(dir.y, dir.x) - Math.PI / 2);
      const key = box(0.012, 0.02, 0.006, mat.metal, [at.x + 0.02, at.y + 0.01, Z * 1.1 + 0.006]);
      bike.add(lock, key);
    }
    if (S.reflectors || S.comfort) {
      // Catarifrangenti arancioni sui raggi: girano con le ruote
      for (const w of [rearWheel, frontWheel]) {
        const r = w.userData.R * 0.62;
        for (const side of [-1, 1]) {
          const refl = box(0.05, 0.016, 0.01, mat.reflector, [0, 0, 0]);
          refl.position.set(side * r * 0.6, side * r * 0.8, 0.012 * side);
          refl.rotation.z = Math.atan2(side * r * 0.8, side * r * 0.6) + Math.PI / 2;
          w.add(refl);
        }
      }
    }
    if (styleName === 'e-trekking') {
      // Borsa da viaggio agganciata a sinistra del portapacchi, con tasca e striscia riflettente
      const bag = new THREE.Group();
      bag.position.set(-0.47, 0.6, -0.13);
      const shell = box(0.3, 0.27, 0.11, mat.bag, [0, 0, 0]);
      const flap = box(0.31, 0.06, 0.115, mat.bag, [0, 0.125, 0]);
      const pocket = box(0.18, 0.13, 0.03, mat.bag, [0.02, -0.03, -0.068]);
      const strip = box(0.3, 0.012, 0.004, mat.lens, [0, 0.07, -0.0565]);
      for (const m of [shell, flap, pocket, strip]) bag.add(m);
      for (const hx of [-0.08, 0.08]) bag.add(box(0.03, 0.03, 0.02, mat.dark, [hx, 0.15, 0.05]));
      bike.add(bag);
    }
    if (styleName === 'city') {
      // Cestino di vimini davanti al manubrio, con le due astine fino al mozzo anteriore
      const bx = stemTop.x + 0.19;
      const by = stemTop.y - 0.04;
      const w = 0.27;
      const d = 0.34;
      const h = 0.19;
      const basket = new THREE.Group();
      basket.position.set(bx, by, 0);
      basket.add(box(w, 0.012, d, mat.wicker, [0, -h / 2, 0]));
      for (const y of [-h / 2, -h / 6, h / 6, h / 2]) {
        for (const [ax, az, bx2, bz] of [[-w / 2, -d / 2, w / 2, -d / 2], [w / 2, -d / 2, w / 2, d / 2], [w / 2, d / 2, -w / 2, d / 2], [-w / 2, d / 2, -w / 2, -d / 2]]) {
          basket.add(tube([ax, y, az], [bx2, y, bz], y === h / 2 ? 0.007 : 0.004, mat.wicker, 6));
        }
      }
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        for (const z of [-d / 2, d / 2]) basket.add(tube([-w / 2 + t * w, -h / 2, z], [-w / 2 + t * w, h / 2, z], 0.0035, mat.wicker, 5));
      }
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        for (const x of [-w / 2, w / 2]) basket.add(tube([x, -h / 2, -d / 2 + t * d], [x, h / 2, -d / 2 + t * d], 0.0035, mat.wicker, 5));
      }
      bike.add(basket);
      for (const z of [-0.09, 0.09]) bike.add(tube(v3([bx + 0.06, by - h / 2], z), v3([front.x, front.y], Math.sign(z) * Z * 1.15), 0.0045, mat.metal, 6));
      bike.add(tube(v3([stemTop.x + 0.01, stemTop.y - 0.01]), v3([bx - w / 2, by + 0.02]), 0.006, mat.metal, 6));
    }

    // Marchio sul telaio, ai due lati del tubo obliquo (sul piantone nei telai bassi)
    {
      const onSeat = S.top === 'low' || S.top === 'fold';
      const a = onSeat ? bb.clone().lerp(seat, 0.35) : bb.clone().lerp(headLow, 0.32);
      const b = onSeat ? bb.clone().lerp(seat, 0.75) : bb.clone().lerp(headLow, 0.72);
      const dir = b.clone().sub(a);
      const r = onSeat ? T : T * (S.battery === 'integrated' ? 1.75 : 1.15);
      const len = dir.length();
      const geo = new THREE.PlaneGeometry(len, len * (96 / 512));
      for (const side of [1, -1]) {
        const holder = new THREE.Group();
        holder.position.copy(a).addScaledVector(dir, 0.5).add(new THREE.Vector3(0, 0, side * (r + 0.0012)));
        holder.rotation.z = Math.atan2(dir.y, dir.x);
        const logo = new THREE.Mesh(geo, mat.decal);
        if (side < 0) logo.rotation.y = Math.PI;
        holder.add(logo);
        bike.add(holder);
      }
    }

    bike.position.y = LIFT + S.tire;
    return { bike, parts, crank, extra, S, moveChain, ringR };
  }

  /** Dove guardare per ogni pezzo, in base alle misure del modello. */
  function focusFor(part, S) {
    const y0 = LIFT + S.tire;
    const rearR = S.rearR || S.R;
    const length = S.front - S.rear + S.R + rearR;
    const center = (S.front + S.rear) / 2;
    const bb = S.bb;
    switch (part) {
      case 'tyres': return { target: [S.front, y0 + S.R, 0], dist: 1.35 * (S.R / 0.34), yaw: 0.3 };
      case 'brakes': return { target: [S.front - 0.02, y0 + S.R + 0.03, -0.06], dist: 0.85, yaw: Math.PI - 0.4 };
      case 'chain': return { target: [(bb[0] + S.rear) / 2, y0 + bb[1] + 0.03, 0.06], dist: 1.15, yaw: -0.15 };
      case 'battery': {
        if (S.battery === 'rack') return { target: [-0.5, y0 + 0.79, 0], dist: 1.0, yaw: 0.4 };
        const p = [(bb[0] + S.headLow[0]) / 2, y0 + (bb[1] + S.headLow[1]) / 2, 0];
        return { target: p, dist: 1.0, yaw: 0.35 };
      }
      case 'saddle': return { target: [S.seat[0] - 0.05, y0 + S.saddleY, 0], dist: 0.85, yaw: 0.55 };
      case 'gears': return { target: [S.rear - 0.02, y0 + rearR - 0.09, 0.07], dist: 0.6, yaw: -0.3 };
      case 'lights': {
        const p = S.lamp ? [S.headLow[0] + 0.07, y0 + S.headLow[1] + 0.02, 0] : [S.head[0] + 0.08, y0 + S.head[1] + 0.06, 0];
        return { target: p, dist: 0.9, yaw: -0.5 };
      }
      case 'handlebar': return { target: [S.head[0], y0 + (S.top === 'fold' ? 0.98 : S.head[1] + 0.1), 0], dist: 1.0, yaw: -0.7 };
      default: return { target: [center, -0.02 + (S.R - 0.34) * 0.5, 0], dist: 3.3 * Math.max(1, length / 1.74) };
    }
  }

  // ---------- Strada per la modalità uscita ----------

  function roadTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#2b3139';
    x.fillRect(0, 0, 512, 96);
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      x.fillRect(Math.random() * 512, Math.random() * 96, 2, 2);
    }
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.fillRect(0, 2, 512, 3);
    x.fillRect(0, 90, 512, 3);
    for (let i = 0; i < 2; i++) x.fillRect(i * 256 + 40, 30, 150, 4);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function fadeTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 4;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, '#000');
    g.addColorStop(0.22, '#fff');
    g.addColorStop(0.78, '#fff');
    g.addColorStop(1, '#000');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 4);
    return new THREE.CanvasTexture(c);
  }

  /**
   * Parafango come quelli veri: una lamiera curva a "U" rovesciata che segue la ruota,
   * più alta al centro e piegata verso la gomma sui bordi. Angoli in radianti dal mozzo.
   */
  function fenderGeometry(radius, from, to, width) {
    const segs = 56;
    const across = 10;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const a = from + ((to - from) * i) / segs;
      for (let j = 0; j <= across; j++) {
        const t = (j / across) * 2 - 1;
        const r = radius - 0.014 * t * t;
        pos.push(Math.cos(a) * r, Math.sin(a) * r, (t * width) / 2);
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < across; j++) {
        const k = i * (across + 1) + j;
        idx.push(k, k + across + 1, k + 1, k + 1, k + across + 1, k + across + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
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
      new THREE.PlaneGeometry(2, 0.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = LIFT + 0.002;
    return mesh;
  }

  /**
   * "Studio fotografico" per i riflessi: cielo chiaro, orizzonte grigio-azzurro, pavimento scuro e due pannelli luminosi.
   * three.js lo trasforma in una mappa d'ambiente: vernice e metalli riflettono come veri.
   */
  function studioEnvironment(renderer) {
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const colors = [];
    const top = new THREE.Color(0xf4f8ff);
    const horizon = new THREE.Color(0x8ea4bd);
    const floor = new THREE.Color(0x141a22);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10;
      const c = y > 0 ? horizon.clone().lerp(top, Math.pow(y, 0.6)) : horizon.clone().lerp(floor, Math.pow(-y, 0.5));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    for (const [x, y, z, w, h] of [[2, 6, 4, 7, 3], [-7, 2.5, -1, 3, 4]]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      panel.position.set(x, y, z);
      panel.lookAt(0, 0, 0);
      env.add(panel);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    const texture = pmrem.fromScene(env, 0.03).texture;
    pmrem.dispose();
    return texture;
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
  const RIDE_YAW = Math.PI / 2 - 0.06; // in uscita: vista da dietro, come il cruscotto di un'auto elettrica

  /**
   * Monta una bici 3D dentro container e restituisce i comandi.
   * options: { style, color, electric, zoomable, closer (<1 avvicina la vista intera), onTap }
   */
  async function mount(container, options = {}) {
    THREE = await loadThree();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.domElement.style.touchAction = 'none';
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.environment = studioEnvironment(renderer);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(2, 3, 2.5);
    const rimLight = new THREE.DirectionalLight(0x88ccff, 0.9);
    rimLight.position.set(-3, 1.5, -2);
    scene.add(sun, rimLight);
    // Ombre vere della bici sul pavimento (solo dove serve la qualità: garage e computer)
    const shadows = options.shadows !== false;
    if (shadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.5, far: 8 });
      sun.shadow.bias = -0.0005;
      sun.shadow.radius = 4;
    }

    const mat = makeMaterials(options.color || '#38bdf8');
    // Marchio scuro sui telai chiari, chiaro su quelli scuri
    const paintDecal = () => {
      const c = mat.frame.color;
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      mat.decal.color.set(lum > 0.45 ? 0x1a2230 : 0xffffff);
      mat.decal.opacity = 0.9;
    };
    paintDecal();
    const turntable = new THREE.Group();
    turntable.add(shadowMesh());
    if (shadows) {
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.ShadowMaterial({ opacity: 0.32 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = LIFT + 0.001;
      floor.receiveShadow = true;
      turntable.add(floor);
    }
    scene.add(turntable);

    // Strada e paletti: compaiono in uscita e scorrono alla velocità vera.
    const roadMap = roadTexture();
    const ROAD_LEN = 26;
    roadMap.repeat.set(ROAD_LEN / 2, 1);
    const roadMat = new THREE.MeshStandardMaterial({ map: roadMap, color: 0x7a838e, alphaMap: fadeTexture(), transparent: true, opacity: 0, roughness: 0.95, depthWrite: false });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN, 1.5), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, LIFT - 0.001, -0.2);
    road.visible = false;
    turntable.add(road);
    const posts = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.6, transparent: true, opacity: 0 });
    const reflMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff7a1a, emissiveIntensity: 0.5, transparent: true, opacity: 0 });
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 10), postMat);
      pole.position.y = 0.21;
      const refl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), reflMat);
      refl.position.y = 0.36;
      p.add(pole, refl);
      p.position.set(-ROAD_LEN / 2 + i * (ROAD_LEN / 10), LIFT, i % 2 ? -1.05 : 0.7);
      posts.add(p);
    }
    posts.visible = false;
    turntable.add(posts);

    let style = options.style || 'classic';
    let electric = Boolean(options.electric);
    let built = null;
    function rebuild() {
      if (built) {
        turntable.remove(built.bike);
        built.bike.traverse((o) => o.geometry?.dispose());
      }
      built = buildBike(style, mat, electric);
      if (shadows) built.bike.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      turntable.add(built.bike);
    }
    rebuild();

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const home = focusFor('all', built.S);
    const cam = { yaw: -0.5, dist: home.dist, target: new THREE.Vector3(...home.target) };
    const goal = { yaw: -0.5, dist: home.dist, target: new THREE.Vector3(...home.target) };
    let focusPart = 'all';
    let mode = 'show';
    let autoSpin = !reduced;
    let speedMs = 0;
    let spinBoost = 0;
    let chainOffset = 0;
    let hop = 0;
    let advance = 0;
    let roadFade = 0;
    let highlight = null;
    let visible = true;
    let lastDraw = 0;
    let aspect = 1;
    let idleTimer = null;

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
      const known = ['tyres', 'brakes', 'chain', 'gears', 'battery', 'saddle', 'handlebar', 'lights'].includes(part);
      focusPart = known ? part : 'all';
      const f = focusFor(focusPart, built.S);
      goal.target.set(...f.target);
      goal.dist = f.dist;
      if (focusPart === 'all' && mode === 'ride') {
        // Telecamera alle spalle: guarda un punto più avanti sulla strada, la bici sta in basso al centro.
        goal.target.set(built.S.front + 2.4, LIFT + 0.15, 0);
        goal.dist = 7.2;
      }
      if (f.yaw != null) goal.yaw = shortest(cam.yaw, f.yaw);
      else if (mode === 'ride') goal.yaw = shortest(cam.yaw, RIDE_YAW);
      autoSpin = focusPart === 'all' && mode === 'show' && !reduced;
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
      try { el.setPointerCapture(e.pointerId); } catch { /* tocco simulato */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: goal.dist };
      }
      autoSpin = false;
      clearTimeout(idleTimer);
    });
    el.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2 && pinch && options.zoomable !== false) {
        const [a, b] = [...pointers.values()];
        goal.dist = Math.min(6, Math.max(0.6, pinch.dist * (pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)))));
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
      // Lasciata la bici, dopo un po' torna a girare (o di lato, in uscita).
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (pointers.size || focusPart !== 'all') return;
        if (mode === 'ride') goal.yaw = shortest(cam.yaw, RIDE_YAW);
        else autoSpin = !reduced;
      }, 2500);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('click', (e) => e.stopPropagation());
    if (options.zoomable !== false) {
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        goal.dist = Math.min(6, Math.max(0.6, goal.dist * (1 + Math.sign(e.deltaY) * 0.12)));
      }, { passive: false });
    }
    el.addEventListener('dblclick', () => setGoal('all'));

    const raycaster = new THREE.Raycaster();
    function onTap(e) {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(built.bike, true).find((h) => h.object.visible && h.object.parent?.visible !== false);
      if (!hit) return;
      const bellAt = built.parts.bell[0].getWorldPosition(new THREE.Vector3());
      const isBell = built.parts.bell.includes(hit.object)
        || (built.parts.handlebar.includes(hit.object) && hit.point.distanceTo(bellAt) < 0.15);
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
    const up = new THREE.Vector3(0, 1, 0);
    const tmp = new THREE.Vector3();
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible || document.hidden) {
        lastDraw = now;
        return;
      }
      // Circa 40 immagini al secondo: fluida e più leggera sulla batteria.
      // Il tempo si misura tra un disegno e l'altro, così ruote e telecamera vanno alla velocità giusta.
      if (now - lastDraw < 24) return;
      const dt = Math.min(0.1, (now - lastDraw) / 1000);
      lastDraw = now;

      if (autoSpin) goal.yaw = cam.yaw + dt * 0.25;
      const k = 1 - Math.exp(-dt * 4.5);
      cam.yaw += (goal.yaw - cam.yaw) * (autoSpin ? 1 : k);
      cam.dist += (goal.dist - cam.dist) * k;
      cam.target.lerp(goal.target, k);
      turntable.rotation.y = cam.yaw;

      tmp.copy(cam.target).applyAxisAngle(up, cam.yaw);
      const fit = focusPart === 'all' ? Math.max(1, 1.6 / aspect) * (options.closer || 1) : 1;
      const d = cam.dist * fit;
      camera.position.set(tmp.x, tmp.y + d * (mode === 'ride' && focusPart === 'all' ? 0.24 : 0.11), tmp.z + d);
      camera.lookAt(tmp);

      // Ruote e pedali: velocità vera, da ferma un rotolare tranquillo; il tocco dà una spinta.
      spinBoost *= Math.exp(-dt * 1.6);
      const real = mode === 'ride' ? speedMs : speedMs > 0.3 ? speedMs : reduced ? 0 : 1.1;
      const v = real + spinBoost + advance * 6;
      for (const w of built.parts.wheels) w.rotation.z -= (v / w.userData.R) * dt;
      const crankStep = (v / built.S.R) * 0.55 * dt;
      built.crank.rotation.z -= crankStep;
      // La catena scorre quanto gira la corona
      chainOffset += crankStep * built.ringR;
      built.moveChain(chainOffset);

      // In uscita la strada compare e scorre sotto le ruote; la bici entra da sinistra.
      roadFade += ((mode === 'ride' ? 1 : 0) - roadFade) * Math.min(1, dt * 3);
      road.visible = posts.visible = roadFade > 0.01;
      roadMat.opacity = roadFade;
      postMat.opacity = reflMat.opacity = roadFade;
      roadMap.offset.x += (v * dt) / 2;
      for (const p of posts.children) {
        p.position.x -= v * dt;
        if (p.position.x < -ROAD_LEN / 2) p.position.x += ROAD_LEN;
      }
      advance = Math.max(0, advance - dt * 0.9);
      const enter = advance * advance * 0.9;
      hop = Math.max(0, hop - dt * 3);
      built.bike.position.x = -enter;
      const bob = mode === 'ride' && v > 0.5 ? Math.sin(now / 120) * 0.003 : reduced ? 0 : Math.sin(now / 900) * 0.006;
      built.bike.position.y = LIFT + built.S.tire + Math.sin(hop * Math.PI) * 0.04 + bob;

      if (highlight) {
        const t = (now - highlight.start) / 1000;
        const on = t < 3.2;
        const glow = on ? 0.35 + 0.35 * Math.sin(t * 7) : 0;
        for (const m of highlight.mats) {
          if (!m.userData.baseEmissive) m.userData.baseEmissive = { c: m.emissive.getHex(), i: m.emissiveIntensity };
          if (on) {
            m.emissive.set(0xfff2b0); // luce calda, si vede su qualsiasi colore di telaio
            m.emissiveIntensity = glow;
          } else {
            m.emissive.setHex(m.userData.baseEmissive.c);
            m.emissiveIntensity = m.userData.baseEmissive.i;
          }
        }
        if (!on) highlight = null;
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);

    return {
      setSpeed(ms) {
        speedMs = Math.max(0, ms || 0);
      },
      setColor(css) {
        mat.frame.color.set((css || '').trim() || '#38bdf8');
        paintDecal();
      },
      setStyle(name) {
        if (!STYLES[name] || name === style) return;
        style = name;
        rebuild();
        setGoal(focusPart);
        hop = 1;
      },
      setElectric(on) {
        electric = Boolean(on);
        if (built.extra) built.extra.visible = electric;
      },
      /** 'show': gira su se stessa. 'ride': si mette di lato e pedala sulla strada. */
      setMode(next) {
        if (next === mode) return;
        mode = next;
        if (mode === 'ride' && !reduced) advance = 1;
        setGoal('all');
      },
      /** Zoom su un pezzo: 'tyres', 'brakes', 'chain', 'battery', 'saddle', 'handlebar' o 'all'. */
      focus(part) {
        const hasBattery = built.parts.battery.length && (built.S.battery || electric);
        const p = part === 'battery' && !hasBattery ? 'all' : part;
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
      /** Ferma la rotazione su un angolo preciso (per le anteprime). */
      pose(yaw) {
        autoSpin = false;
        cam.yaw = goal.yaw = yaw;
      },
    };
  }

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.bike3d = { mount, ring, STYLES: Object.keys(STYLES), geometry: STYLES, settle };
})();
