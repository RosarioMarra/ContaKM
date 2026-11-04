// Bici 3D della dashboard desktop, disegnata con forme semplici di three.js.
// Le ruote girano alla velocità vera, il telaio ha il colore scelto in Altro e si ruota trascinando.
// three.js (650 kB) si carica solo qui, quindi solo sullo schermo grande.

(() => {
  const WHEEL_R = 0.34;
  let THREE = null;
  let loading = null;

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

  /** Cilindro da a a b (punti [x, y, z]). */
  function tube(a, b, radius, material) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const dir = to.clone().sub(from);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 16), material);
    mesh.position.copy(from).add(dir.multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    mesh.castShadow = true;
    return mesh;
  }

  function wheel(mat) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R, 0.028, 14, 64), mat.tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.03, 0.011, 8, 64), mat.metal);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 16), mat.metal);
    hub.rotation.x = Math.PI / 2;
    g.add(tire, rim, hub);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const side = i % 2 ? 0.035 : -0.035;
      g.add(tube([0, 0, side], [Math.cos(a) * (WHEEL_R - 0.035), Math.sin(a) * (WHEEL_R - 0.035), 0], 0.0035, mat.spoke));
    }
    return g;
  }

  function buildBike(mat) {
    const bike = new THREE.Group();
    const P = {
      rear: [-0.52, WHEEL_R, 0], front: [0.54, WHEEL_R, 0], bb: [-0.04, 0.3, 0],
      seat: [-0.18, 0.84, 0], head: [0.38, 0.86, 0], headLow: [0.42, 0.7, 0],
    };
    const rearWheel = wheel(mat);
    rearWheel.position.set(...P.rear);
    const frontWheel = wheel(mat);
    frontWheel.position.set(...P.front);
    bike.add(rearWheel, frontWheel);

    const F = 0.024;
    bike.add(
      tube(P.bb, P.seat, F, mat.frame),
      tube(P.seat, P.head, F * 0.9, mat.frame),
      tube(P.bb, P.headLow, F * 1.15, mat.frame),
      tube(P.headLow, P.head, F * 1.2, mat.frame),
    );
    for (const z of [-0.045, 0.045]) {
      bike.add(
        tube([P.rear[0], P.rear[1], z], [P.bb[0], P.bb[1], z * 0.6], 0.012, mat.frame),
        tube([P.rear[0], P.rear[1], z], [P.seat[0] + 0.03, P.seat[1] - 0.05, z * 0.4], 0.011, mat.frame),
        tube([P.headLow[0], P.headLow[1], z * 0.5], [P.front[0], P.front[1], z], 0.013, mat.frame),
      );
    }

    // Reggisella, sella, attacco e manubrio
    bike.add(tube(P.seat, [-0.21, 0.96, 0], 0.014, mat.metal));
    const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 6, 12), mat.dark);
    saddle.rotation.z = Math.PI / 2;
    saddle.scale.set(1, 1, 0.55);
    saddle.position.set(-0.22, 0.99, 0);
    bike.add(saddle);
    bike.add(tube(P.head, [0.4, 0.97, 0], 0.016, mat.metal));
    bike.add(tube([0.42, 0.98, -0.26], [0.42, 0.98, 0.26], 0.013, mat.metal));
    for (const z of [-0.22, 0.22]) bike.add(tube([0.42, 0.98, z], [0.42, 0.98, z + Math.sign(z) * 0.06], 0.02, mat.dark));

    // Pedivella che gira mentre si pedala
    const crank = new THREE.Group();
    crank.position.set(...P.bb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 40), mat.metal);
    ring.position.z = 0.06;
    crank.add(ring);
    for (const [z, a] of [[0.08, 0], [-0.08, Math.PI]]) {
      const arm = tube([0, 0, z], [Math.cos(a) * 0.17, Math.sin(a) * 0.17, z], 0.012, mat.metal);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.06), mat.dark);
      pedal.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, z + Math.sign(z) * 0.04);
      crank.add(arm, pedal);
    }
    bike.add(crank);

    // Batteria sul tubo obliquo, solo per le elettriche
    const battery = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.07), mat.dark);
    battery.position.set(0.2, 0.52, 0);
    battery.rotation.z = Math.atan2(P.headLow[1] - P.bb[1], P.headLow[0] - P.bb[0]);
    battery.visible = false;
    bike.add(battery);

    bike.position.y = -0.5;
    return { bike, wheels: [rearWheel, frontWheel], crank, battery };
  }

  /** Ombra morbida sotto la bici, disegnata su un canvas. */
  function shadow() {
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
    mesh.position.y = -0.505;
    return mesh;
  }

  async function mount(container) {
    THREE = await loadThree();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    container.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0.35, 3.3);
    camera.lookAt(0, -0.02, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 3, 2.5);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x88ccff, 1.2);
    rim.position.set(-3, 1.5, -2);
    scene.add(rim);

    const mat = {
      frame: new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.55, roughness: 0.3 }),
      metal: new THREE.MeshStandardMaterial({ color: 0xc8d0d8, metalness: 0.9, roughness: 0.25 }),
      spoke: new THREE.MeshStandardMaterial({ color: 0xaab4bf, metalness: 0.8, roughness: 0.35 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.85 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x23282f, roughness: 0.6 }),
    };
    const { bike, wheels, crank, battery } = buildBike(mat);
    const turntable = new THREE.Group();
    turntable.add(bike, shadow());
    scene.add(turntable);

    let speedMs = 0;
    let yaw = -0.5;
    let autoSpin = true;
    let drag = null;
    let last = performance.now();
    let visible = true;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Su un riquadro stretto si arretra, così la bici entra sempre tutta.
      camera.position.z = Math.max(3.3, 3.3 * (1.6 / camera.aspect));
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(container);
    resize();

    container.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, yaw };
      autoSpin = false;
      container.setPointerCapture(e.pointerId);
    });
    container.addEventListener('pointermove', (e) => {
      if (drag) yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
    });
    const release = () => {
      drag = null;
      setTimeout(() => { if (!drag) autoSpin = true; }, 2500);
    };
    container.addEventListener('pointerup', release);
    container.addEventListener('pointercancel', release);
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(container);

    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      // Ferma: le ruote girano piano, giusto per vivacità. In movimento: velocità vera.
      const v = speedMs > 0.3 ? speedMs : reduced ? 0 : 1.2;
      for (const w of wheels) w.rotation.z -= (v / WHEEL_R) * dt;
      crank.rotation.z -= (v / WHEEL_R) * 0.55 * dt;
      if (autoSpin && !reduced) yaw += dt * 0.25;
      turntable.rotation.y = yaw;
      turntable.position.y = reduced ? 0 : Math.sin(now / 900) * 0.01;
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);

    return {
      setSpeed(ms) {
        speedMs = ms;
      },
      setColor(css) {
        mat.frame.color.set(css.trim() || '#38bdf8');
      },
      setElectric(on) {
        battery.visible = Boolean(on);
      },
    };
  }

  globalThis.ContaKM ??= {};
  globalThis.ContaKM.bike3d = { mount };
})();
