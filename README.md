# Sistema GLZ Cloud

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)

Plataforma web para gestión comercial de GLZ: inventario, facturación/cotizaciones, CRM de clientes, historial de operaciones y análisis por cliente, con backend en Firebase.

## Qué resuelve este sistema

- Control de inventario por bodega.
- Venta y cotización con catálogo dinámico.
- Bloqueo de stock en factura (venta real) y advertencia en cotización.
- Gestión de créditos, abonos y saldo pendiente.
- Historial operativo + KPIs por cliente.
- Impresión comercial:
  - Factura calibrada por coordenadas sobre formato físico.
  - Cotización moderna, multipágina y exportable a PDF desde el navegador.

## Stack técnico

- Frontend: React 19 + Hooks + componentes funcionales.
- Bundler: Vite.
- Estilos: Tailwind CSS.
- Backend/BaaS: Firebase Authentication + Cloud Firestore.
- Íconos: lucide-react.

## Módulos funcionales

- `Inventario`
  - CRUD de repuestos (admin).
  - Ajuste de stock.
  - Búsqueda por código, descripción y código alterno.
  - Filtro por localidad (`Managua`, `Tecolostote`).
- `Facturación / Cotización`
  - Documento comercial con carrito.
  - Control de concurrencia con `runTransaction` + reintento.
  - Secuencia de documento en `sistema/secuencia`.
  - Crédito con `abonoInicial`, `totalPagado`, `saldoPendiente`, `historialAbonos`.
  - Selección de código a imprimir (`codigo` o `alternateCode`).
- `CRM`
  - Alta, edición y eliminación de clientes (delete solo admin).
- `Historial / BI`
  - Bitácora de eventos.
  - Análisis por cliente (total comprado, deuda, producto favorito).
  - Registro de abonos desde modal.
  - Reimpresión de documentos desde historial.

## Arquitectura resumida

- App SPA con layout principal en `src/App.jsx`.
- Carga de sesión con `onAuthStateChanged`.
- Rol leído desde `roles/{email}` para habilitar vistas en UI.
- Cada módulo opera sobre su colección Firestore.
- La lógica de impresión se encapsula en:
  - `PlantillaDocumentoComercial.jsx` para factura calibrada.
  - `PlantillaCotizacionComercial.jsx` para cotización corporativa.
  - `PlantillaDocumentoImpresion.jsx` como selector por tipo.

## Estructura del proyecto

```txt
src/
  App.jsx
  firebase.js
  components/
    Login.jsx
    ModuloInventario.jsx
    ModuloFacturacion.jsx
    ModuloCRM.jsx
    ModuloHistorial.jsx
    PlantillaDocumentoComercial.jsx
    PlantillaCotizacionComercial.jsx
    PlantillaDocumentoImpresion.jsx
public/
  logo.jpg
  *.png (logos de marcas para cotización)
firebase.json
firestore.rules
firestore.indexes.json
.firebaserc
```

## Modelo de datos (Firestore)

### `repuestos/{id}`

- `codigo: string`
- `alternateCode?: string`
- `descripcion: string`
- `cantidad: number`
- `costo: number`
- `precioVerde: number`
- `precioAmarillo: number`
- `precioRojo: number`
- `localidad: "Managua" | "Tecolostote" | string`

### `clientes/{id}`

- `nombres: string`
- `apellidos: string`
- `empresa?: string`
- `telefono: string`
- `correo?: string`
- `ruc?: string`

### `facturas/{id}`

- `tipo: "Factura" | "Cotización"`
- `numeroDocumento: string`
- `secuenciaDocumento: number`
- `fecha: string (ISO)`
- `idCliente?: string`
- `cliente: string`
- `empresa?: string`
- `telefono?: string`
- `ruc?: string`
- `notas?: string`
- `formaPago: string`
- `total: number`
- `estadoPago: "Pagado" | "Pendiente" | "Saldado"`
- `abonoInicial?: number`
- `totalPagado?: number`
- `saldoPendiente?: number`
- `historialAbonos?: Array<{fecha,monto,tipo,nota}>`
- `usuarioCreador?: string`
- `items: Array<...>`
  - `idRepuesto?: string`
  - `codigo?: string`
  - `alternateCode?: string`
  - `usarCodigoAlterno?: boolean`
  - `codigoImpresion?: string`
  - `desc/descripcion: string`
  - `cant: number`
  - `precio: number`
  - `subtotal: number`

### `sistema/secuencia`

- `siguiente: number`

### `roles/{email}`

- `rol: "admin" | "vendedor"`
- `nombre?: string`

### `historial/{id}`

- `tipo: string`
- `descripcion: string`
- `usuario: string`
- `fecha: string (ISO)`

## Reglas de negocio importantes

- En `Factura`, no se permite vender por encima del stock disponible.
- En `Cotización`, se permite cotizar sin afectar stock.
- Estado de crédito:
  - `Saldado` solo cuando `saldoPendiente === 0`.
  - `Pendiente` cuando `saldoPendiente > 0`.
- Facturación crítica (secuencia + stock + documento) se ejecuta en transacción Firestore.

## Configuración local

### Requisitos

- Node.js `20.19+` recomendado por Vite 7.
- npm.
- Proyecto Firebase activo.

### Instalación

```bash
git clone https://github.com/ElAiwan/Sistema-GLZ.git
cd Sistema-GLZ
npm install
```

### Variables de entorno

Crear `.env` en la raíz:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### Ejecutar en desarrollo

```bash
npm run dev
```

## Comandos útiles

```bash
npm run dev      # servidor de desarrollo
npm run lint     # análisis estático
npm run build    # build de producción
npm run preview  # preview local del build
```

## Firebase (este repo)

- Proyecto por defecto en `.firebaserc`: `glz-sistema`.
- Hosting SPA configurado en `firebase.json` (`dist` + rewrite a `/index.html`).
- Reglas e índices en:
  - `firestore.rules`
  - `firestore.indexes.json`

### Deploy de hosting

```bash
npm run build
firebase deploy --only hosting
```

### Deploy de reglas/índices

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Seguridad

Las reglas actuales en `firestore.rules` ya aplican controles por rol para:

- lectura/escritura de clientes y repuestos según perfil;
- eliminación restringida a admin en módulos sensibles;
- creación/actualización de facturas con restricciones;
- actualización de secuencia con incremento controlado;
- historial visible para admin.

Recomendación: mantener UI y reglas alineadas; nunca depender solo del frontend para permisos.

## Impresión de documentos

- `Factura`: plantilla calibrada por coordenadas para formato físico preimpreso.
- `Cotización`: plantilla fluida, compacta, multipágina y profesional.
- Selector automático por tipo: `PlantillaDocumentoImpresion.jsx`.

Nota: si se sustituyen imágenes en `public` con el mismo nombre y no se reflejan, usar cache-busting o forzar recarga del navegador.

## Estado actual de calidad

- `npm run lint`: pasando.
- `npm run build`: compila correctamente (pueden aparecer warnings de chunk grande o versión de Node si es menor a `20.19`).

## Licencia

Uso interno / privado de GLZ, salvo que se defina una licencia pública explícita.
