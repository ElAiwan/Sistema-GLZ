# Empleados + Olvidé mi contraseña — Diseño

Fecha: 2026-09-14 · Aprobado por el usuario en chat.

## Contexto

Los permisos viven en `roles/{correo}` con los campos `rol` (`admin` | `vendedor`) y
`nombre`. Hoy las reglas prohíben escribir en `roles` y cada usuario solo lee su propio
documento; el cliente administra todo desde la consola de Firebase. Plan Spark: sin Cloud
Functions, así que la app **no** puede crear, borrar ni modificar cuentas de Authentication.

## Alcance

1. Módulo **Empleados** (solo admin) sobre la colección `roles` existente.
2. Reglas de Firestore para que el admin gestione `roles` de otros usuarios.
3. Pantalla **Sin acceso** para usuarios autenticados sin documento en `roles`.
4. **¿Olvidaste tu contraseña?** en el login.
5. Guía de dos ajustes de consola.

Fuera de alcance: crear/borrar cuentas de Auth, cambiar correo, perfiles nuevos.

## 1. Módulo Empleados (`src/components/ModuloEmpleados.jsx`)

- Entrada `empleados` en el menú lateral, visible solo con `rol === 'admin'`.
- Carga `getDocs(collection(db, 'roles'))`; id del documento = correo.
- **Agregar acceso:** correo (normalizado con `trim().toLowerCase()`), nombre (obligatorio,
  1–60 caracteres), perfil. Usa `setDoc` solo si el documento no existe (si existe, error
  "Ese correo ya tiene acceso"). Aviso fijo: crear primero la cuenta en Authentication.
- **Tabla:** correo, nombre, perfil, acciones.
  - Editar nombre y perfil (`updateDoc` solo con `nombre` y `rol`).
  - Contraseña: `sendPasswordResetEmail(auth, correo)`.
  - Quitar acceso: `deleteDoc` con `window.confirm`. Recordatorio de borrar la cuenta en consola.
- La fila del usuario actual se muestra con la etiqueta "Tu cuenta" y sin acciones.
- Cada acción llama a `registrarHistorial('Empleados', …)`.
- Sigue el patrón visual de `ModuloProveedores.jsx` (tabla en desktop, tarjetas en móvil).

## 2. Reglas (`firestore.rules`, bloque `roles`)

```
match /roles/{userEmail} {
  allow read: if signedIn() && (userEmail == request.auth.token.email || isAdmin());
  allow create: if isAdmin() && noEsPropio(userEmail) && userEmail == userEmail.lower()
    && request.resource.data.keys().hasOnly(["rol", "nombre"]) && rolValido();
  allow update: if isAdmin() && noEsPropio(userEmail)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["rol", "nombre"])
    && rolValido();
  allow delete: if isAdmin() && noEsPropio(userEmail);
}
```

`rolValido()`: `rol in ["admin","vendedor"]`, `nombre is string`, tamaño 1–60.
Los campos extra que el cliente haya puesto a mano se conservan en `update`.

## 3. Sin acceso (`src/App.jsx`)

Estado de acceso: `cargando | ok | sin-rol | error`.
- `sin-rol` (no existe el documento o el rol no es válido): mensaje "Tu usuario no tiene
  acceso al sistema" + botón Salir. Ya no se asume `vendedor`.
- `error` (falla la lectura): "No se pudo verificar tu acceso" + Reintentar + Salir.

## 4. Login (`src/components/Login.jsx`)

Enlace "¿Olvidaste tu contraseña?" que usa el correo escrito. Si está vacío, pide
escribirlo. Tras llamar `sendPasswordResetEmail` muestra siempre "Si el correo está
registrado, te llegará un enlace para cambiar la contraseña." (no revela si existe).
Solo `auth/invalid-email` y errores de red muestran un mensaje distinto.

## 5. Consola (manual, una vez)

- Authentication → Configuración → Acciones del usuario → desmarcar
  **Habilitar creación (registro)**. Evita que alguien se registre con el correo de un rol.
- Authentication → Plantillas → idioma **Español**.

## Verificación

- `npm run lint` y `npm run build`.
- Reglas en emulador de Firestore: admin crea/edita/borra rol ajeno ✔; admin no toca el
  propio ✘; rol inválido ✘; vendedor no lee ni escribe roles ajenos ✘; vendedor lee el propio ✔.
