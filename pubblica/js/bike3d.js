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
    classic: { ...BASE },
    city: { ...BASE, seat: [-0.17, 0.8], head: [0.36, 0.9], headLow: [0.41, 0.72], tire: 0.03, bar: 'riser', top: 'low', saddleY: 0.97, fenders: true, rack: true, lamp: true, chainguard: true },
    mtb: { ...BASE, seat: [-0.15, 0.76], head: [0.4, 0.86], headLow: [0.45, 0.66], tube: 0.03, tire: 0.042, bar: 'wide', fork: 'suspension', top: 'sloped', saddleY: 0.97, knobby: true },
    road: { ...BASE, seat: [-0.17, 0.86], head: [0.4, 0.85], headLow: [0.43, 0.72], tube: 0.02, tire: 0.018, bar: 'drop', saddleY: 1.01 },

    'e-city': { ...BASE, seat: [-0.17, 0.8], head: [0.36, 0.9], headLow: [0.41, 0.72], tire: 0.032, bar: 'riser', top: 'low', saddleY: 0.97, fenders: true, rack: true, lamp: true, chainguard: true, battery: 'rack', motor: 'mid', display: true, tailLight: true },
    'e-trekking': { ...BASE, seat: [-0.16, 0.8], head: [0.39, 0.88], headLow: [0.43, 0.7], tube: 0.027, tire: 0.031, fork: 'suspension', top: 'sloped', saddleY: 0.98, fenders: true, rack: true, lamp: true, battery: 'integrated', motor: 'mid', display: true, tailLight: true },
    'e-mtb': { ...BASE, seat: [-0.15, 0.76], head: [0.41, 0.86], headLow: [0.46, 0.66], tube: 0.034, tire: 0.047, bar: 'wide', fork: 'suspension', top: 'sloped', saddleY: 0.97, knobby: true, battery: 'integrated', motor: 'mid', display: true, rearShock: true },
    'e-gravel': { ...BASE, seat: [-0.17, 0.85], head: [0.4, 0.84], headLow: [0.43, 0.71], tube: 0.026, tire: 0.024, bar: 'drop', saddleY: 1.0, battery: 'integrated', motor: 'mid', motorSize: 0.8 },
    'e-cargo': { ...BASE, rear: -0.95, rearR: 0.26, tire: 0.032, seat: [-0.2, 0.8], head: [0.38, 0.88], headLow: [0.42, 0.7], tube: 0.03, top: 'sloped', saddleY: 0.97, longtail: true, fenders: true, lamp: true, battery: 'integrated', motor: 'mid', display: true, tailLight: true, bar: 'riser' },
    'e-folding': { ...BASE, R: 0.25, tire: 0.034, rear: -0.42, front: 0.44, bb: [-0.03, 0.26], seat: [-0.12, 0.5], head: [0.33, 0.66], headLow: [0.31, 0.5], tube: 0.032, top: 'fold', saddleY: 0.95, battery: 'integrated', motor: 'hub', fenders: true, lamp: true, tailLight: true },
    'e-fat': { ...BASE, R: 0.32, tire: 0.075, rear: -0.57, front: 0.6, bb: [-0.04, 0.33], seat: [-0.16, 0.82], head: [0.41, 0.9], headLow: [0.46, 0.72], forkZ: 0.095, tube: 0.032, bar: 'wide', top: 'sloped', saddleY: 0.99, knobby: true, battery: 'integrated', motor: 'hub', display: true, lamp: true },
  };
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

  function makeMaterials(color) {
    const std = (c, metalness, roughness) => new THREE.MeshStandardMaterial({ color: c, metalness, roughness });
    const glow = (c, i) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });
    return {
      frame: std(color, 0.45, 0.32),
      metal: std(0xc8d0d8, 0.9, 0.25),
      spoke: std(0xaab4bf, 0.8, 0.35),
      dark: std(0x23282f, 0.2, 0.6),
      // Pezzi con materiale proprio: lampeggiano da soli quando si fa manutenzione.
      tire: std(0x1b1f24, 0, 0.85),
      brake: std(0xd5dbe2, 0.9, 0.2),
      caliper: std(0x2a2f36, 0.5, 0.4),
      chain: std(0x8d969f, 0.85, 0.35),
      battery: std(0x1f242b, 0.35, 0.45),
      motor: std(0x30363e, 0.6, 0.35),
      saddle: std(0x23282f, 0.1, 0.7),
      bar: std(0xc8d0d8, 0.9, 0.25),
      bell: std(0xe8ecf0, 1, 0.15),
      spring: std(0xff7a1a, 0.6, 0.3),
      lamp: glow(0xfff3c4, 0.9),
      tail: glow(0xff3b3b, 0.9),
      screen: glow(0x38bdf8, 0.7),
      led: glow(0x34d399, 1),
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
    const spokeR = R - S.tire - 0.012;
    const spokes = R < 0.3 ? 16 : 20;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const z = i % 2 ? S.forkZ * 0.8 : -S.forkZ * 0.8;
      g.add(tube([0, 0, z], [Math.cos(a) * spokeR, Math.sin(a) * spokeR, 0], 0.0032, mat.spoke, 5));
    }
    // Disco del freno a sinistra
    const rotorR = R < 0.3 ? 0.07 : 0.08;
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(rotorR, rotorR, 0.004, 40), mat.brake);
    rotor.rotation.x = Math.PI / 2;
    rotor.position.z = -S.forkZ - 0.008;
    const rotorHub = new THREE.Mesh(new THREE.TorusGeometry(rotorR * 0.62, 0.006, 6, 24), mat.caliper);
    rotorHub.position.z = rotor.position.z;
    g.add(rotor, rotorHub);
    parts.brakes.push(rotor);
    if (side === 'rear') {
      for (let i = 0; i < 10; i++) {
        const cog = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.008, 0.005, 6, 28), mat.chain);
        cog.position.z = 0.045 + i * 0.006;
        g.add(cog);
        parts.chain.push(cog);
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
    const S = STYLES[styleName] || STYLES.classic;
    const parts = { tyres: [], brakes: [], chain: [], battery: [], saddle: [], handlebar: [], bell: [], wheels: [] };
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
      bike.add(curve([headLow, [0.2, 0.42], [0.04, 0.33], bb], T * 1.15, mat.frame));
      bike.add(curve([[head.x - 0.01, head.y - 0.06], [0.22, 0.56], [0.02, 0.46], [-0.08, 0.48]], T * 0.85, mat.frame));
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
    if (S.fork === 'suspension') bike.add(box(0.06, 0.03, Z * 2.8, mat.dark, [headLow.x, headLow.y - 0.01, 0]));

    // Pinze dei freni a sinistra
    const caliperF = box(0.06, 0.04, 0.03, mat.caliper, [front.x - 0.055, front.y + 0.055, -Z - 0.016], -0.5);
    const caliperR = box(0.06, 0.04, 0.03, mat.caliper, [rear.x + 0.06, rear.y + 0.05, -Z - 0.016], 0.6);
    bike.add(caliperF, caliperR);
    parts.brakes.push(caliperF, caliperR);

    // ---- Sella ----
    const saddleX = seat.x - 0.04;
    bike.add(tube(seat, v3([saddleX, S.saddleY - 0.03]), S.top === 'fold' ? 0.017 : 0.014, mat.metal));
    const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, S.top === 'low' ? 0.12 : 0.16, 6, 12), mat.saddle);
    saddle.rotation.z = Math.PI / 2;
    saddle.scale.set(1, 1, S.top === 'low' || S.longtail ? 0.85 : 0.55);
    saddle.position.set(saddleX - 0.01, S.saddleY, 0);
    bike.add(saddle);
    parts.saddle.push(saddle);

    // ---- Attacco e manubrio ----
    const stemTop = S.top === 'fold' ? v3([head.x - 0.03, 0.98]) : v3([head.x + 0.03, head.y + 0.1]);
    bike.add(tube(head, stemTop, S.top === 'fold' ? 0.019 : 0.016, mat.metal));
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
      for (const s of [-1, 1]) barParts.push(tube(v3([stemTop.x, stemTop.y], s * (w - 0.07)), v3([stemTop.x, stemTop.y], s * (w + 0.005)), 0.02, mat.dark));
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
    }

    // ---- Trasmissione e motore ----
    const crank = new THREE.Group();
    crank.position.copy(bb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(S.motor === 'mid' ? 0.085 : 0.1, 0.011, 8, 44), mat.chain);
    ring.position.z = 0.06 + (S.motor === 'mid' ? 0.02 : 0);
    crank.add(ring);
    parts.chain.push(ring);
    for (const [z, a] of [[0.08, 0], [-0.08, Math.PI]]) {
      const zz = z + Math.sign(z) * (S.motor === 'mid' ? 0.02 : 0);
      crank.add(tube([0, 0, zz], [Math.cos(a) * 0.17, Math.sin(a) * 0.17, zz], 0.012, mat.metal));
      const pedal = box(0.09, 0.02, 0.06, mat.dark, [Math.cos(a) * 0.17, Math.sin(a) * 0.17, zz + Math.sign(z) * 0.04]);
      crank.add(pedal);
    }
    bike.add(crank);
    const ringR = S.motor === 'mid' ? 0.085 : 0.1;
    const chainZ = 0.06 + (S.motor === 'mid' ? 0.01 : 0);
    const chainTop = tube(v3([bb.x, bb.y + ringR], chainZ), v3([rear.x, rear.y + 0.042], chainZ), 0.006, mat.chain, 6);
    const chainLow = tube(v3([bb.x, bb.y - ringR], chainZ), v3([rear.x, rear.y - 0.042], chainZ), 0.006, mat.chain, 6);
    bike.add(chainTop, chainLow);
    parts.chain.push(chainTop, chainLow);
    if (S.chainguard) {
      const len = bb.distanceTo(rear) * 0.75;
      const guard = box(len, 0.05, 0.012, mat.frame, [bb.x + (rear.x - bb.x) * 0.45, bb.y + 0.07, 0.085], Math.atan2(rear.y - bb.y, rear.x - bb.x));
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
      // Angoli: 0 = davanti, PI/2 = in alto, PI = dietro
      const fenders = S.longtail ? [[front, S.R, 0.15, 1.7]] : [[rear, rearR, 0.9, 2.0], [front, S.R, 0.15, 1.7]];
      for (const [c, R, start, arcLen] of fenders) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(R + S.tire + 0.025, 0.03, 4, 40, arcLen), mat.frame);
        arc.scale.z = S.tire > 0.03 ? 0.65 : 0.5;
        arc.position.copy(c);
        arc.rotation.z = start;
        bike.add(arc);
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
    if (S.lamp) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.05, 18), mat.lamp);
      lamp.rotation.z = Math.PI / 2;
      lamp.position.set(headLow.x + 0.06, headLow.y + 0.02, 0);
      bike.add(lamp);
    }
    if (S.tailLight) {
      const x = S.longtail ? rear.x - 0.38 : S.rack ? -0.67 : saddleX - 0.04;
      const y = S.longtail ? 0.6 : S.rack ? 0.74 : S.saddleY - 0.12;
      bike.add(box(0.02, 0.025, 0.05, mat.tail, [x, y, 0]));
    }

    bike.position.y = LIFT + S.tire;
    return { bike, parts, crank, extra, S };
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
    let hop = 0;
    let advance = 0;
    let roadFade = 0;
    let highlight = null;
    let visible = true;
    let last = performance.now();
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
      const known = ['tyres', 'brakes', 'chain', 'battery', 'saddle', 'handlebar'].includes(part);
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
      el.setPointerCapture(e.pointerId);
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
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      // Circa 40 immagini al secondo: fluida e più leggera sulla batteria.
      if (now - lastDraw < 24) return;
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
      built.crank.rotation.z -= (v / built.S.R) * 0.55 * dt;

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
    };
  }

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.bike3d = { mount, ring, STYLES: Object.keys(STYLES) };
})();
