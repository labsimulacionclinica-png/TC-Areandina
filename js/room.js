// Sala de TC en 3D (Three.js): gantry, camilla, paciente, láseres y acompañante. Compatible con WebXR.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// Unidades: metros. El eje z de la escena es el eje de la mesa (positivo hacia el gantry).
export class Room {
  constructor(container) {
    this.container = container;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);
    const vr = VRButton.createButton(renderer);
    vr.classList.add('vr-button');
    container.appendChild(vr);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x1a2329);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 50);
    this.camera.position.set(2.6, 1.9, -1.4);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 0.9, -0.3);
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.update();

    scene.add(new THREE.HemisphereLight(0xdfefff, 0x334455, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, -2);
    scene.add(sun);

    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
    // Suelo y paredes
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), mat(0x3a4650));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), mat(0x52616b));
    wall.position.set(0, 1.5, 2.6);
    wall.rotation.y = Math.PI;
    scene.add(wall);
    // Ventana del puesto de mando
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), mat(0x7fb6d6, { transparent: true, opacity: 0.35, metalness: 0.2 }));
    glass.position.set(-1.8, 1.5, 2.59);
    glass.rotation.y = Math.PI;
    scene.add(glass);

    // Gantry
    const gantry = (this.gantry = new THREE.Group());
    const housing = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 0.85), mat(0xe8edf0));
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.9, 48, 1, true), mat(0xcfd6db, { side: THREE.DoubleSide }));
    bore.rotation.x = Math.PI / 2;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 1.0, 0, Math.PI * 2);
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.39, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const face = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.86, bevelEnabled: false, curveSegments: 48 }), mat(0xe8edf0));
    face.position.z = -0.43;
    gantry.add(face, bore);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, 8, 64), mat(0x3fb8e6, { emissive: 0x0a3a50 }));
    ring.position.z = -0.44;
    gantry.add(ring);
    this.ring = ring;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.02), mat(0x0e1418, { emissive: 0x113344 }));
    panel.position.set(0.6, 0.55, -0.44);
    gantry.add(panel);
    gantry.position.set(0, 1.05, 0.9);
    scene.add(gantry);
    // Base del gantry
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.9), mat(0xcfd6db));
    base.position.set(0, 0.05, 0.9);
    scene.add(base);

    // Láseres: plano interno (isocentro) y externo (a 0,6 m, donde se marca el cero)
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.9 });
    this.lasers = new THREE.Group();
    const lz = 0.3; // plano del láser externo (delante del gantry)
    const lAxial = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.003, 0.003), laserMat);
    lAxial.position.set(0, 1.05, lz);
    const lSag = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 1.6), laserMat);
    lSag.position.set(0, 1.05 + 0.33, -0.5);
    const lCor = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 1.6), laserMat);
    lCor.position.set(0.33, 1.05, -0.5);
    this.lasers.add(lAxial, lSag, lCor);
    this.lasers.visible = false;
    scene.add(this.lasers);
    this.laserZ = lz;

    // Camilla: base fija + tablero móvil
    this.tableBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 1.2), mat(0xcfd6db));
    scene.add(this.tableBase);
    this.cradle = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 2.1), mat(0x2b3740));
    top.position.z = -0.2;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 2.0), mat(0x5b6b78));
    pad.position.set(0, 0.035, -0.2);
    this.cradle.add(top, pad);
    this.headHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 24, 1, true, Math.PI * 0.5, Math.PI), mat(0x2f6e8c, { side: THREE.DoubleSide }));
    this.headHolder.rotation.x = Math.PI / 2;
    this.headHolder.rotation.y = Math.PI;
    this.cradle.add(this.headHolder);
    scene.add(this.cradle);

    // Paciente
    this.patient = this.buildPatient();
    this.cradle.add(this.patient.group);
    this.strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 24, Math.PI), mat(0xf2c14e));
    this.cradle.add(this.strap);

    // Acompañante y delantal
    this.companion = this.buildPerson(0x7a6a58);
    this.companion.position.set(-0.9, 0, -0.6);
    scene.add(this.companion);
    this.apron = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.7, 0.14), mat(0x2a6f4e));
    this.apron.position.set(0, 1.05, 0.04);
    this.companion.add(this.apron);

    // Inyector
    const inj = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3), mat(0x9aa7b1));
    pole.position.y = 0.65;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.35), mat(0xe8edf0));
    head.position.set(0, 1.35, 0);
    head.rotation.x = -0.6;
    const syr = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22), mat(0xb7e3f5, { transparent: true, opacity: 0.6 }));
    syr.position.set(0.05, 1.32, -0.15); syr.rotation.x = -0.6 + Math.PI / 2;
    inj.add(pole, head, syr);
    inj.position.set(0.75, 0, 0.1);
    scene.add(inj);
    this.injector = inj;

    this.state = { tableHeight: 0, tableTravel: 0, arms: 'down', orientation: 'head', headHolder: false, strap: false, companion: 'dentro', scanning: false, lasers: false };
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    renderer.setAnimationLoop((t) => this.tick(t));
  }

  buildPerson(color) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a77f, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.6, 6, 12), m);
    body.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), skin);
    head.position.y = 1.6;
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.6, 6, 12), new THREE.MeshStandardMaterial({ color: 0x2e3b47 }));
    legs.position.y = 0.45;
    g.add(body, head, legs);
    return g;
  }

  buildPatient() {
    const group = new THREE.Group();
    const gown = new THREE.MeshStandardMaterial({ color: 0x8fb7cf, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a77f, roughness: 0.7 });
    // Paciente acostado: eje largo en z. Cabeza en z = +0.75 (hacia el gantry si "cabeza primero").
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.55, 6, 14), gown);
    torso.rotation.x = Math.PI / 2; torso.scale.set(1.15, 1, 0.75); torso.position.set(0, 0.13, 0.25);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), skin);
    head.position.set(0, 0.13, 0.78);
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.75, 6, 14), gown);
    legs.rotation.x = Math.PI / 2; legs.scale.set(1.25, 1, 0.65); legs.position.set(0, 0.11, -0.45);
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.55, 4, 10), skin);
    const armR = armL.clone();
    group.add(torso, head, legs, armL, armR);
    return { group, armL, armR, head };
  }

  update(s) {
    Object.assign(this.state, s);
    const st = this.state;
    // Brazos
    const { armL, armR } = this.patient;
    if (st.arms === 'up') {
      for (const [a, sx] of [[armL, 1], [armR, -1]]) { a.rotation.set(Math.PI / 2, 0, 0); a.position.set(sx * 0.13, 0.15, 1.12); }
    } else {
      for (const [a, sx] of [[armL, 1], [armR, -1]]) { a.rotation.set(Math.PI / 2, 0, 0); a.position.set(sx * 0.21, 0.12, 0.2); }
    }
    // Orientación: cabeza hacia el gantry (+z) o pies hacia el gantry
    this.patient.group.rotation.y = st.orientation === 'head' ? 0 : Math.PI;
    this.headHolder.visible = st.headHolder;
    this.headHolder.position.set(0, 0.1, (st.orientation === 'head' ? 1 : -1) * 0.8);
    this.strap.visible = st.strap;
    this.strap.position.set(0, 0.13, (st.orientation === 'head' ? 1 : -1) * 0.8);
    this.strap.rotation.set(0, Math.PI / 2, 0);
    this.lasers.visible = st.lasers;
    this.companion.visible = st.companion !== 'fuera';
    this.apron.visible = st.companion === 'delantal';
  }

  // tableHeight: m respecto a la altura del isocentro; tableTravel: m de desplazamiento hacia el gantry
  tick(t) {
    const st = this.state;
    const cradleY = 1.05 - 0.13 + st.tableHeight; // la línea media del paciente queda en el isocentro si tableHeight = 0
    this.tableBase.position.set(0, (cradleY - 0.05) / 2, -0.7);
    this.tableBase.scale.y = Math.max(0.2, cradleY - 0.05);
    this.cradle.position.set(0, cradleY, -0.9 + st.tableTravel);
    if (st.scanning) this.ring.rotation.z = t / 60;
    this.ring.material.emissive.setHex(st.scanning ? 0xf2c14e : 0x0a3a50);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
