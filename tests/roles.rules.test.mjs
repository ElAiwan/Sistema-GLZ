// Pruebas de las reglas de Firestore para la colección `roles`.
// Correr con: npm run test:rules  (levanta el emulador, necesita Java).
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const ADMIN = 'admin@glz.com';
const OTRO_ADMIN = 'jefe@glz.com';
const VENDEDOR = 'vendedor@glz.com';
const SIN_ROL = 'nadie@glz.com';
const NUEVO = 'nuevo@glz.com';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-glz',
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
    await setDoc(doc(db, 'roles', OTRO_ADMIN), { rol: 'admin', nombre: 'Jefe' });
    // Campo extra puesto a mano desde la consola: las ediciones deben respetarlo.
    await setDoc(doc(db, 'roles', VENDEDOR), { rol: 'vendedor', nombre: 'Vendedor', telefono: '8888-8888' });
  });
});

const dbDe = (email) => env.authenticatedContext(email.split('@')[0], { email }).firestore();
const rol = (db, email) => doc(db, 'roles', email);

// ---------- admin ----------

test('admin lista todos los roles', async () => {
  await assertSucceeds(getDocs(collection(dbDe(ADMIN), 'roles')));
});

test('admin da acceso a un correo nuevo', async () => {
  await assertSucceeds(setDoc(rol(dbDe(ADMIN), NUEVO), { rol: 'vendedor', nombre: 'Nuevo' }));
});

test('admin cambia nombre y perfil de otro y se conservan los campos extra', async () => {
  const db = dbDe(ADMIN);
  await assertSucceeds(updateDoc(rol(db, VENDEDOR), { rol: 'admin', nombre: 'Vendedor Jefe' }));
  const snap = await getDoc(rol(db, VENDEDOR));
  if (snap.data().telefono !== '8888-8888') throw new Error('Se perdió el campo extra');
});

test('admin puede cambiar el perfil de otro admin', async () => {
  await assertSucceeds(updateDoc(rol(dbDe(ADMIN), OTRO_ADMIN), { rol: 'vendedor' }));
});

test('admin quita el acceso a otro', async () => {
  await assertSucceeds(deleteDoc(rol(dbDe(ADMIN), VENDEDOR)));
});

test('admin no puede editar su propio rol', async () => {
  await assertFails(updateDoc(rol(dbDe(ADMIN), ADMIN), { rol: 'vendedor' }));
});

test('admin no puede borrar su propio rol', async () => {
  await assertFails(deleteDoc(rol(dbDe(ADMIN), ADMIN)));
});

test('admin no puede tocar campos que no sean nombre o rol', async () => {
  await assertFails(updateDoc(rol(dbDe(ADMIN), VENDEDOR), { telefono: '0000-0000' }));
});

test('perfil inválido se rechaza', async () => {
  await assertFails(setDoc(rol(dbDe(ADMIN), NUEVO), { rol: 'cajero', nombre: 'Nuevo' }));
  await assertFails(updateDoc(rol(dbDe(ADMIN), VENDEDOR), { rol: 'superadmin' }));
});

test('nombre vacío o de más de 60 caracteres se rechaza', async () => {
  const db = dbDe(ADMIN);
  await assertFails(setDoc(rol(db, NUEVO), { rol: 'vendedor', nombre: '' }));
  await assertFails(setDoc(rol(db, NUEVO), { rol: 'vendedor', nombre: 'x'.repeat(61) }));
  await assertFails(setDoc(rol(db, NUEVO), { rol: 'vendedor' }));
});

test('correo con mayúsculas se rechaza', async () => {
  await assertFails(setDoc(rol(dbDe(ADMIN), 'Nuevo@glz.com'), { rol: 'vendedor', nombre: 'Nuevo' }));
});

test('al dar acceso no se permiten campos extra', async () => {
  await assertFails(setDoc(rol(dbDe(ADMIN), NUEVO), { rol: 'vendedor', nombre: 'Nuevo', extra: true }));
});

// ---------- vendedor ----------

test('vendedor lee su propio rol', async () => {
  await assertSucceeds(getDoc(rol(dbDe(VENDEDOR), VENDEDOR)));
});

test('vendedor no lee el rol de otro ni lista la colección', async () => {
  const db = dbDe(VENDEDOR);
  await assertFails(getDoc(rol(db, ADMIN)));
  await assertFails(getDocs(collection(db, 'roles')));
});

test('vendedor no puede darse admin ni dar acceso a otros', async () => {
  const db = dbDe(VENDEDOR);
  await assertFails(updateDoc(rol(db, VENDEDOR), { rol: 'admin' }));
  await assertFails(setDoc(rol(db, NUEVO), { rol: 'vendedor', nombre: 'Nuevo' }));
  await assertFails(deleteDoc(rol(db, ADMIN)));
});

// ---------- sin rol / sin sesión ----------

test('usuario sin rol puede consultar su propio documento (para la pantalla Sin acceso)', async () => {
  await assertSucceeds(getDoc(rol(dbDe(SIN_ROL), SIN_ROL)));
});

test('usuario sin rol no puede darse acceso', async () => {
  await assertFails(setDoc(rol(dbDe(SIN_ROL), SIN_ROL), { rol: 'admin', nombre: 'Intruso' }));
});

test('sin sesión no se lee nada', async () => {
  await assertFails(getDoc(rol(env.unauthenticatedContext().firestore(), ADMIN)));
});
