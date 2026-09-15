// Pruebas de las reglas de Firestore para `gastos`: abonos y anulación de compras y gastos.
// Correr con: npm run test:rules  (levanta el emulador, necesita Java).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

const ADMIN = 'admin@glz.com';
const VENDEDOR = 'vendedor@glz.com';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-glz-gastos',
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
    await setDoc(doc(db, 'gastos', 'vigente'), {
      tipo: 'Compra', fecha: '2026-09-14T18:00:00.000Z', total: 100, formaPago: 'Credito', items: [],
      abonoInicial: 40, totalPagado: 40, saldoPendiente: 60, estadoPago: 'Pendiente', historialAbonos: [],
    });
    await setDoc(doc(db, 'gastos', 'anulado'), {
      tipo: 'Gasto', fecha: '2026-09-10T18:00:00.000Z', total: 50, formaPago: 'Efectivo', items: [],
      estadoDocumento: 'Anulado', anulacion: { fecha: '2026-09-11T18:00:00.000Z', usuario: 'Admin', motivo: 'Registrado dos veces' },
      saldoPendiente: 0, estadoPago: 'Anulado',
    });
  });
});

const dbDe = (email) => env.authenticatedContext(email.split('@')[0], { email }).firestore();

const anulacion = (motivo = 'Proveedor devolvió la factura') => ({
  estadoDocumento: 'Anulado',
  anulacion: { fecha: new Date().toISOString(), usuario: 'Admin', motivo },
  saldoPendiente: 0,
  estadoPago: 'Anulado',
});

// ---------- anular ----------

test('admin anula una compra con motivo', async () => {
  await assertSucceeds(updateDoc(doc(dbDe(ADMIN), 'gastos', 'vigente'), anulacion()));
});

test('anular exige motivo de al menos 5 caracteres', async () => {
  const ref = doc(dbDe(ADMIN), 'gastos', 'vigente');
  await assertFails(updateDoc(ref, anulacion('')));
  await assertFails(updateDoc(ref, anulacion('mal')));
  await assertFails(updateDoc(ref, { ...anulacion(), anulacion: { fecha: 'x', usuario: 'Admin' } }));
});

test('anular deja el saldo en cero y no toca otros campos', async () => {
  const ref = doc(dbDe(ADMIN), 'gastos', 'vigente');
  await assertFails(updateDoc(ref, { ...anulacion(), saldoPendiente: 60 }));
  await assertFails(updateDoc(ref, { ...anulacion(), total: 0 }));
});

test('un registro anulado no se puede des-anular ni volver a anular', async () => {
  const ref = doc(dbDe(ADMIN), 'gastos', 'anulado');
  await assertFails(updateDoc(ref, { estadoDocumento: 'Vigente' }));
  await assertFails(updateDoc(ref, anulacion('Otro motivo distinto')));
});

test('el vendedor no anula', async () => {
  await assertFails(updateDoc(doc(dbDe(VENDEDOR), 'gastos', 'vigente'), anulacion()));
});

// ---------- abonos ----------

test('admin sigue pudiendo abonar a un registro vigente', async () => {
  await assertSucceeds(updateDoc(doc(dbDe(ADMIN), 'gastos', 'vigente'), {
    totalPagado: 70, saldoPendiente: 30, estadoPago: 'Pendiente',
    historialAbonos: [{ fecha: new Date().toISOString(), monto: 30, tipo: 'Abono', nota: '' }],
  }));
});

test('no se puede abonar a un registro anulado', async () => {
  await assertFails(updateDoc(doc(dbDe(ADMIN), 'gastos', 'anulado'), {
    totalPagado: 10, historialAbonos: [{ fecha: new Date().toISOString(), monto: 10, tipo: 'Abono', nota: '' }],
  }));
});

test('nadie borra un gasto', async () => {
  await assertFails(deleteDoc(doc(dbDe(ADMIN), 'gastos', 'vigente')));
});

// ---------- kardex ----------

const movimientoAnulacion = {
  idRepuesto: 'r1', codigo: 'C-1', descripcion: 'Filtro', localidad: 'Managua',
  tipo: 'anulacion-compra', cantidad: -5, stockAnterior: 10, stockNuevo: 5,
  referencia: { coleccion: 'gastos', id: 'vigente', texto: 'Anulación de compra' },
  motivo: 'Proveedor devolvió la factura', usuario: 'Admin', fecha: new Date().toISOString(),
};

test('admin registra el movimiento de anulación de compra en el kardex', async () => {
  await assertSucceeds(setDoc(doc(collection(dbDe(ADMIN), 'movimientos')), movimientoAnulacion));
});

test('el vendedor no registra anulaciones de compra en el kardex', async () => {
  await assertFails(setDoc(doc(collection(dbDe(VENDEDOR), 'movimientos')), movimientoAnulacion));
});
