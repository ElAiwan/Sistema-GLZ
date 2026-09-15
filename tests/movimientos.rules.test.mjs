// Pruebas de las reglas de Firestore para el kardex (`movimientos`).
// Correr con: npm run test:rules  (levanta el emulador, necesita Java).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where, writeBatch
} from 'firebase/firestore';

const ADMIN = 'admin@glz.com';
const VENDEDOR = 'vendedor@glz.com';
const SIN_ROL = 'nadie@glz.com';
const ARTICULOS_FACTURA = 18;

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-glz-kardex',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'roles', ADMIN), { rol: 'admin', nombre: 'Admin' });
    await setDoc(doc(db, 'roles', VENDEDOR), { rol: 'vendedor', nombre: 'Vendedor' });
    for (let i = 0; i < ARTICULOS_FACTURA; i += 1) {
      await setDoc(doc(db, 'repuestos', `r${i}`), { codigo: `C-${i}`, descripcion: 'Filtro', localidad: 'Managua', cantidad: 50 });
    }
    await setDoc(doc(db, 'movimientos', 'existente'), movimiento('ajuste', 5));
  });
});

const dbDe = (email) => env.authenticatedContext(email.split('@')[0], { email }).firestore();

function movimiento(tipo, cantidad, extra = {}) {
  return {
    idRepuesto: 'r0',
    codigo: 'C-0',
    descripcion: 'Filtro',
    localidad: 'Managua',
    tipo,
    cantidad,
    stockAnterior: 50,
    stockNuevo: 50 + cantidad,
    referencia: { coleccion: '', id: '', texto: '' },
    motivo: 'prueba',
    usuario: 'Tester',
    fecha: new Date().toISOString(),
    ...extra,
  };
}

const nuevo = (db) => doc(collection(db, 'movimientos'));

// ---------- creación ----------

test('admin crea movimientos de cualquier tipo', async () => {
  const db = dbDe(ADMIN);
  for (const [tipo, cantidad] of [
    ['inicial', 10], ['compra', 3], ['anulacion', 2], ['ajuste', -4],
    ['traslado-salida', -5], ['traslado-entrada', 5], ['baja', -50], ['venta', -1],
  ]) {
    await assertSucceeds(setDoc(nuevo(db), movimiento(tipo, cantidad)));
  }
});

test('vendedor crea movimientos de venta (salida)', async () => {
  await assertSucceeds(setDoc(nuevo(dbDe(VENDEDOR)), movimiento('venta', -2)));
});

test('vendedor no crea ajustes, traslados, bajas ni ventas positivas', async () => {
  const db = dbDe(VENDEDOR);
  await assertFails(setDoc(nuevo(db), movimiento('ajuste', 10)));
  await assertFails(setDoc(nuevo(db), movimiento('traslado-entrada', 5)));
  await assertFails(setDoc(nuevo(db), movimiento('baja', -50)));
  await assertFails(setDoc(nuevo(db), movimiento('compra', 5)));
  await assertFails(setDoc(nuevo(db), movimiento('venta', 3)));
});

test('usuario sin rol no crea movimientos', async () => {
  await assertFails(setDoc(nuevo(dbDe(SIN_ROL)), movimiento('venta', -1)));
});

test('tipo desconocido o campos inválidos se rechazan', async () => {
  const db = dbDe(ADMIN);
  await assertFails(setDoc(nuevo(db), movimiento('regalo', -1)));
  await assertFails(setDoc(nuevo(db), movimiento('ajuste', '3')));
  await assertFails(setDoc(nuevo(db), movimiento('ajuste', 3, { idRepuesto: '' })));
  await assertFails(setDoc(nuevo(db), movimiento('ajuste', 3, { stockNuevo: null })));
  await assertFails(setDoc(nuevo(db), movimiento('ajuste', 3, { usuario: 7 })));
});

// ---------- lectura ----------

test('admin lee y consulta los movimientos de un repuesto', async () => {
  const db = dbDe(ADMIN);
  await assertSucceeds(getDoc(doc(db, 'movimientos', 'existente')));
  await assertSucceeds(getDocs(query(
    collection(db, 'movimientos'), where('idRepuesto', '==', 'r0'), orderBy('fecha', 'desc')
  )));
});

test('vendedor no lee el kardex', async () => {
  const db = dbDe(VENDEDOR);
  await assertFails(getDoc(doc(db, 'movimientos', 'existente')));
  await assertFails(getDocs(collection(db, 'movimientos')));
});

// ---------- inalterable ----------

test('nadie edita ni borra un movimiento', async () => {
  const db = dbDe(ADMIN);
  await assertFails(updateDoc(doc(db, 'movimientos', 'existente'), { cantidad: 99 }));
  await assertFails(deleteDoc(doc(db, 'movimientos', 'existente')));
});

// ---------- límite de accesos de las reglas ----------

test(`factura de ${ARTICULOS_FACTURA} artículos como vendedor: stock + movimientos + factura en un solo batch`, async () => {
  const db = dbDe(VENDEDOR);
  const batch = writeBatch(db);
  const facturaRef = doc(collection(db, 'facturas'));
  for (let i = 0; i < ARTICULOS_FACTURA; i += 1) {
    batch.update(doc(db, 'repuestos', `r${i}`), { cantidad: 49 });
    batch.set(nuevo(db), movimiento('venta', -1, {
      idRepuesto: `r${i}`, stockNuevo: 49, referencia: { coleccion: 'facturas', id: facturaRef.id, texto: 'Factura' },
    }));
  }
  batch.set(facturaRef, {
    cliente: 'Cliente', tipo: 'Factura', fecha: new Date().toISOString(), total: 100, formaPago: 'Contado', items: [],
  });
  await assertSucceeds(batch.commit());
});

test(`compra de ${ARTICULOS_FACTURA} artículos como admin en un solo batch`, async () => {
  const db = dbDe(ADMIN);
  const batch = writeBatch(db);
  for (let i = 0; i < ARTICULOS_FACTURA; i += 1) {
    batch.update(doc(db, 'repuestos', `r${i}`), { cantidad: 60 });
    batch.set(nuevo(db), movimiento('compra', 10, { idRepuesto: `r${i}`, stockNuevo: 60 }));
  }
  await assertSucceeds(batch.commit());
});
