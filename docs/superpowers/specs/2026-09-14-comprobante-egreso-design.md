# Comprobante imprimible de compras y gastos — Diseño y plan

Fecha: 2026-09-14 · Aprobado por el usuario en chat.

## Decisiones

- Constancia en hoja carta con logo + líneas de firma "Entregado por" / "Recibido por".
- Número = código corto derivado del id del documento (`EG-` + 6 primeros caracteres en
  mayúsculas). Sin correlativo: no hay contador, ni reglas nuevas, ni cambios en la base.
- Se reutiliza `imprimirDocumento(nombreArchivo)` de `src/utils/documentos.js`.

## Componentes

| Archivo | Responsabilidad |
|---|---|
| `src/utils/gastos.js` | `codigoComprobante(egreso)` y `nombreArchivoComprobante(egreso)` |
| `src/components/PlantillaComprobanteEgreso.jsx` | la hoja (vista previa y `soloImpresion`) |
| `src/components/ModalComprobanteEgreso.jsx` | vista previa con Imprimir / Descargar PDF / Cerrar |
| `src/components/ModuloGastos.jsx` | columna con botón Comprobante; "Ver comprobante" tras registrar |

## Contenido de la hoja

1. Encabezado: logo, "COMPROBANTE DE COMPRA" o "COMPROBANTE DE GASTO", código, fecha.
2. Datos: proveedor, N° de documento del proveedor, categoría / descripción, forma de pago,
   registrado por.
3. Compra: tabla cantidad · código · descripción · costo unitario · subtotal.
4. Resumen: total. Crédito: abono inicial, cada abono (fecha, monto, nota), total pagado,
   saldo pendiente y estado.
5. Notas y dos líneas de firma.

## Flujo

- Cada fila de la tabla (Compras, Gastos, Por pagar) tiene el botón **Comprobante**.
- `registrar` devuelve el id del gasto creado; el aviso de éxito ofrece **Ver comprobante**
  con el egreso armado localmente (mismos datos que se guardaron).
- Nombre del PDF: `Comprobante-EG-XXXXXX-Proveedor-AAAA-MM-DD`.

## Plan

- [ ] Helpers en `gastos.js`; comprobar con `node`.
- [ ] Plantilla y modal.
- [ ] Integración en `ModuloGastos.jsx`.
- [ ] `npm run lint && npm run build`.
- [ ] Vista previa en el navegador con datos de ejemplo (sin escribir en Firestore).
- [ ] Commit, push y deploy de hosting (no hay reglas nuevas).
