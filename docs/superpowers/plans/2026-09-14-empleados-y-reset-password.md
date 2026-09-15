# Empleados + Olvidé mi contraseña — Plan de implementación

> Spec: `docs/superpowers/specs/2026-09-14-empleados-y-reset-password-design.md`.
> Ejecución inline en la sesión (el usuario pidió "hazlo").

**Goal:** que el admin gestione `roles` desde la app y que cualquier usuario pueda pedir el
correo de restablecer contraseña, sin salir del plan Spark.

**Architecture:** las reglas de Firestore son la única barrera real, así que se prueban
primero en el emulador (TDD). La UI solo refleja lo que las reglas permiten.

**Tech Stack:** React 19, Firebase JS SDK 12 (Auth + Firestore), Firestore emulator (Java 21),
`@firebase/rules-unit-testing` + `node:test`.

---

## Archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `tests/roles.rules.test.mjs` | crear | casos de reglas para `roles` |
| `package.json` | modificar | devDependency `@firebase/rules-unit-testing`, script `test:rules` |
| `firestore.rules` | modificar | bloque `roles` |
| `src/App.jsx` | modificar | estado de acceso + pantalla Sin acceso + entrada de menú |
| `src/components/Login.jsx` | modificar | enlace ¿Olvidaste tu contraseña? |
| `src/components/ModuloEmpleados.jsx` | crear | módulo de gestión de roles |

## Task 1: Reglas de `roles` (TDD)

- [ ] Instalar `@firebase/rules-unit-testing` como devDependency; script
      `"test:rules": "firebase emulators:exec --only firestore --project demo-glz \"node --test tests/\""`.
- [ ] Escribir `tests/roles.rules.test.mjs` con los casos del spec:
      admin crea/edita/borra rol ajeno ✔ · admin toca el propio ✘ · rol inválido ✘ ·
      nombre vacío ✘ · correo con mayúsculas ✘ · campos extra en create ✘ ·
      update conserva campos extra ✔ · vendedor lee ajeno ✘ · vendedor lee propio ✔ ·
      vendedor escribe ✘ · admin lista la colección ✔.
- [ ] Correr `npm run test:rules` → deben fallar los casos de admin.
- [ ] Cambiar el bloque `roles` en `firestore.rules`.
- [ ] Correr `npm run test:rules` → todo pasa.

## Task 2: Pantalla Sin acceso

- [ ] En `App.jsx`, reemplazar el fallback a `vendedor` por `estadoAcceso`
      (`cargando | ok | sin-rol | error`) y una función `verificarAcceso(user)` reutilizable
      por el botón Reintentar.
- [ ] Renderizar la pantalla con el mismo fondo `bg-slate-900` y tarjeta blanca del Login.
- [ ] `npm run lint && npm run build`.

## Task 3: ¿Olvidaste tu contraseña?

- [ ] En `Login.jsx`, botón tipo `button` bajo Ingresar; `sendPasswordResetEmail(auth, email)`.
- [ ] Mensaje neutro de éxito; `auth/invalid-email`, `auth/missing-email` y
      `auth/network-request-failed` con mensaje propio.
- [ ] `npm run lint && npm run build`.

## Task 4: Módulo Empleados

- [ ] Crear `ModuloEmpleados.jsx` con props `{ registrarHistorial, correoActual }`
      siguiendo el patrón de `ModuloProveedores.jsx`.
- [ ] Agregar entrada `empleados` (ícono `UserCog`) al menú y el render condicionado a admin.
- [ ] `npm run lint && npm run build`.

## Task 5: Verificación final

- [ ] `npm run test:rules`, `npm run lint`, `npm run build`.
- [ ] Revisar `git status`: sin `firebase-debug.log` ni archivos del emulador.
- [ ] Entregar al usuario: pasos de consola + bloque de commit/push/deploy (hosting y rules).
