# Reporte PDF por período — Diseño y plan

Fecha: 2026-09-14 · Aprobado por el usuario en chat.

## Decisiones

- Botón **Reporte PDF** en Panel y reportes, reemplaza "Imprimir panel".
- Usa el período elegido en el panel. Vista previa con Imprimir / Descargar PDF
  (`imprimirDocumento`), igual que facturas y comprobantes.
- Resumen siempre; secciones de detalle opcionales con casillas.
- Sin reglas nuevas ni cambios en la base. El inventario se lee (`repuestos`) solo si su
  casilla está marcada.

## Componentes

| Archivo | Responsabilidad |
|---|---|
| `src/utils/reportes.js` | `fechaArchivo(fecha)`: AAAA-MM-DD en hora local (también corrige el sufijo de los CSV) |
| `src/components/PlantillaReporte.jsx` | la hoja: resumen + secciones |
| `src/components/ModalReporte.jsx` | casillas, carga del inventario, vista previa, impresión |
| `src/components/ModuloReportes.jsx` | guarda la lista de cuentas por cobrar, botón, modal, `print:hidden` en el panel |

## Contenido

1. Encabezado: logo, "REPORTE DEL NEGOCIO", período, fecha de generación.
2. Resumen: los 8 indicadores del panel (ventas con variación, utilidad bruta con costo,
   gastos, utilidad estimada, compras, por cobrar, por pagar, ticket promedio); últimos 6
   meses; top 10 productos.
3. Opcionales:
   - Detalle de ventas: fecha, N° factura, cliente, forma de pago, total, saldo + totales.
   - Detalle de compras y gastos: fecha, tipo/categoría, proveedor, documento, total, saldo + totales.
   - Cuentas por cobrar: cliente, N° factura, fecha, total, saldo, días desde la factura + total.
   - Inventario valorizado: repuestos con stock > 0, stock × costo, subtotal por bodega y total.

Cada sección opcional empieza en página nueva; los encabezados de tabla se repiten.

Nombre del PDF: `Reporte-GLZ-AAAA-MM-DD-a-AAAA-MM-DD`.

## Plan

- [ ] Helper `fechaArchivo` y cambios en `ModuloReportes.jsx` (script con coincidencia única).
- [ ] Plantilla y modal.
- [ ] `npm run lint && npm run build`.
- [ ] Vista previa en navegador con datos de ejemplo.
- [ ] Commit, push, deploy de hosting.
