# Kardex de inventario — Diseño

Fecha: 2026-09-14 · Aprobado por el usuario en chat.

## Contexto

Cada repuesto es un documento de `repuestos` **por bodega** (`localidad`: `Managua` |
`Tecolostote`). El stock cambia hoy en: alta de repuesto (stock inicial), ajuste manual en
Inventario (sobrescribe la cantidad sin motivo), Facturación (transacción, resta), Compras
(transacción, suma) y Anulación (transacción, devuelve). Eliminar un repuesto borra el
documento. No hay traslados entre bodegas ni registro de por qué cambió un número.

## Decisiones

- Colección top-level `movimientos`, un documento por movimiento (no subcolección, no array).
- Consulta solo desde cada repuesto (botón en Inventario), solo admin.
- Traslados entre bodegas incluidos.
- Sin reconstrucción histórica: cada repuesto arranca su kardex con el stock del día del deploy.

## Documento `movimientos/{id}`

| Campo | Tipo | Nota |
|---|---|---|
| `idRepuesto` | string | documento de `repuestos` afectado |
| `codigo`, `descripcion`, `localidad` | string | copia para leer sin cargar el repuesto |
| `tipo` | string | ver tabla de tipos |
| `cantidad` | number | con signo: + entra, − sale |
| `stockAnterior`, `stockNuevo` | number | |
| `referencia` | map `{ coleccion, id, texto }` | `facturas` / `gastos` / `repuestos` (el otro lado del traslado) / vacío |
| `motivo` | string | obligatorio en ajuste; opcional en el resto |
| `usuario` | string | `nombreSeguro` del usuario |
| `fecha` | string ISO | |
| `idTraslado` | string | solo en traslados; enlaza salida y entrada |

### Tipos

| `tipo` | Origen | Signo |
|---|---|---|
| `inicial` | Nuevo repuesto en Inventario | + |
| `venta` | Factura | − |
| `compra` | Compra en Compras / Gastos | + |
| `anulacion` | Anulación de factura | + |
| `ajuste` | Ajuste manual en Inventario (motivo obligatorio) | ± |
| `traslado-salida` | Traslado, bodega origen | − |
| `traslado-entrada` | Traslado, bodega destino | + |
| `baja` | Eliminar repuesto | − stock restante |

## Escritura

Todo movimiento se escribe en la **misma transacción o batch** que cambia el stock, después
de todas las lecturas. Si la operación falla, no queda movimiento. Helper compartido
`src/utils/kardex.js` con los tipos, etiquetas y `construirMovimiento(...)`.

- **Nuevo repuesto:** `writeBatch` con el repuesto y el movimiento `inicial`.
- **Ajuste:** `runTransaction`: lee el repuesto, calcula la diferencia contra el stock vigente,
  escribe cantidad + movimiento. Sin diferencia no escribe. Motivo mínimo 3 caracteres.
- **Eliminar:** `runTransaction`: lee, escribe movimiento `baja` y borra el repuesto.
- **Factura:** en el bucle de escrituras existente, un movimiento `venta` por artículo con
  referencia a la factura. Las cotizaciones no mueven stock y no generan movimientos.
- **Compra:** un movimiento `compra` por artículo con referencia al gasto.
- **Anulación:** un movimiento `anulacion` por artículo devuelto con referencia a la factura.
- **Traslado:** antes de la transacción se busca el mismo `codigo` en la bodega destino
  (`getDocs` con `where`). En la transacción: lee origen (y destino si existe), valida stock,
  resta en origen, suma en destino o crea el repuesto copiando código, código alterno,
  descripción, costo y precios; escribe `traslado-salida` y `traslado-entrada` con el mismo
  `idTraslado`. Solo admin.

`registrarHistorial` se sigue llamando como hoy.

## Lectura

Botón **Movimientos** por fila en Inventario (solo admin) → modal con
`where('idRepuesto','==',id)`, `orderBy('fecha','desc')`, `limit(50)` y "Cargar más"
(`startAfter`). Índice compuesto en `firestore.indexes.json`: `idRepuesto ASC, fecha DESC`.

## Reglas

```
match /movimientos/{id} {
  allow read: if isAdmin();
  allow create: if movimientoValido() && (isAdmin() || (canOperate() && tipo == "venta"));
  allow update, delete: if false;
}
```

`movimientoValido()`: `tipo` en la lista, `cantidad`, `stockAnterior`, `stockNuevo` numéricos,
`idRepuesto`, `usuario`, `fecha` string.

## Riesgos a verificar en emulador

- Límite de 20 accesos a documentos en reglas por transacción: factura de 16+ artículos
  (16 updates de repuesto + 16 movimientos + factura) debe pasar como vendedor.
- Vendedor no crea `ajuste`/`traslado`/`baja`; nadie edita ni borra movimientos.

## Fuera de alcance

Vista global de movimientos en el menú, reconstrucción del historial previo.
