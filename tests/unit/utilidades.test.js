// Pruebas de la lógica pura del sistema: montos, saldos, fechas, CSV y kardex.
// Correr con: npm run test:unit  (la zona horaria se fija en vite.config.js → America/Managua).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cotizacionFacturable,
  esAnulado,
  esCotizacion,
  etiquetaDocumento,
  limpiarParaArchivo,
  nombreArchivoDocumento,
  normalizarDocumentoParaImpresion,
  normalizarMoneda,
  obtenerEstadoCotizacion,
  RENGLONES_TALONARIO
} from '../../src/utils/documentos';
import {
  codigoComprobante,
  esCompra,
  esEgresoAnulado,
  etiquetaEgreso,
  nombreArchivoComprobante,
  obtenerEstadoEgreso,
  obtenerSaldoEgreso,
  obtenerTotalPagadoEgreso
} from '../../src/utils/gastos';
import {
  calcularRango,
  claveMes,
  construirCSV,
  dentroDe,
  etiquetaMes,
  fechaArchivo,
  fechaCSV,
  montoCSV,
  rangoAnterior,
  ultimosMeses,
  variacion
} from '../../src/utils/reportes';
import { ETIQUETA_MOVIMIENTO, TIPO_MOVIMIENTO, construirMovimiento, otraBodega } from '../../src/utils/kardex';
import { recibeCorreos } from '../../src/utils/accesos';

afterEach(() => {
  vi.useRealTimers();
});

describe('entorno', () => {
  it('corre en hora de Nicaragua', () => {
    expect(new Date('2026-09-14T12:00:00Z').getTimezoneOffset()).toBe(360);
  });
});

describe('documentos', () => {
  it('normaliza montos a dos decimales y trata lo inválido como cero', () => {
    expect(normalizarMoneda(10.126)).toBe(10.13);
    expect(normalizarMoneda('45.5')).toBe(45.5);
    expect(normalizarMoneda('abc')).toBe(0);
    expect(normalizarMoneda(undefined)).toBe(0);
  });

  it('reconoce cotizaciones y documentos anulados', () => {
    expect(esCotizacion('Cotización')).toBe(true);
    expect(esCotizacion({ tipo: 'Cotizacion' })).toBe(true);
    expect(esCotizacion({ tipo: 'Factura' })).toBe(false);
    expect(esAnulado({ estadoDocumento: 'Anulado' })).toBe(true);
    expect(esAnulado({})).toBe(false);
  });

  it('deduce el estado de cotizaciones viejas por facturaId', () => {
    expect(obtenerEstadoCotizacion({ tipo: 'Factura' })).toBe('');
    expect(obtenerEstadoCotizacion({ tipo: 'Cotización' })).toBe('Abierta');
    expect(obtenerEstadoCotizacion({ tipo: 'Cotización', facturaId: 'f1' })).toBe('Facturada');
    expect(obtenerEstadoCotizacion({ tipo: 'Cotización', facturaId: 'f1', estadoCotizacion: 'Abierta' })).toBe('Abierta');
  });

  it('solo deja facturar cotizaciones abiertas y vigentes', () => {
    expect(cotizacionFacturable({ tipo: 'Cotización' })).toBe(true);
    expect(cotizacionFacturable({ tipo: 'Cotización', estadoDocumento: 'Anulado' })).toBe(false);
    expect(cotizacionFacturable({ tipo: 'Cotización', estadoCotizacion: 'Facturada' })).toBe(false);
    expect(cotizacionFacturable({ tipo: 'Factura' })).toBe(false);
  });

  it('arma etiquetas y nombres de archivo legibles', () => {
    expect(etiquetaDocumento({ tipo: 'Cotización', numeroDocumento: '00027' })).toBe('Cotización #00027');
    expect(etiquetaDocumento({ tipo: 'Factura', numeroFactura: ' 1201 ' })).toBe('Factura N° 1201');
    expect(etiquetaDocumento({ tipo: 'Factura' })).toBe('Factura');
    expect(limpiarParaArchivo('María López & Cía.')).toBe('Maria-Lopez-Cia');
    expect(nombreArchivoDocumento({
      tipo: 'Factura', numeroFactura: '1201', cliente: 'Juan Pérez', fecha: '2026-09-14T15:00:00.000Z'
    })).toBe('Factura-1201-Juan-Perez-2026-09-14');
  });

  it('prepara documentos viejos para imprimir calculando lo que falta', () => {
    const doc = normalizarDocumentoParaImpresion({
      tipo: 'Factura',
      items: [{ cant: 3, precio: 150.5, desc: 'Filtro' }, { cantidad: 2, precioSel: 100, subtotal: 200 }]
    });
    expect(doc.items[0].subtotal).toBe(451.5);
    expect(doc.items[1].descripcion).toBe('Sin descripción');
    expect(doc.total).toBe(651.5);
    expect(doc.cliente).toBe('Cliente Mostrador');
    expect(doc.estadoDocumento).toBe('Vigente');
  });

  it('el talonario admite 16 renglones', () => {
    expect(RENGLONES_TALONARIO).toBe(16);
  });
});

describe('compras y gastos', () => {
  const contado = { tipo: 'Gasto', categoria: 'Servicios básicos', formaPago: 'Efectivo', total: 3420.5 };
  const credito = { tipo: 'Compra', formaPago: 'Credito', total: 1000, abonoInicial: 300, numeroDocumento: 'F-1' };

  it('distingue compras de gastos', () => {
    expect(esCompra(credito)).toBe(true);
    expect(esCompra(contado)).toBe(false);
  });

  it('calcula lo pagado y el saldo', () => {
    expect(obtenerTotalPagadoEgreso(contado)).toBe(3420.5);
    expect(obtenerSaldoEgreso(contado)).toBe(0);
    expect(obtenerTotalPagadoEgreso(credito)).toBe(300);
    expect(obtenerSaldoEgreso(credito)).toBe(700);
    expect(obtenerSaldoEgreso({ ...credito, totalPagado: 1000, saldoPendiente: 0 })).toBe(0);
    expect(obtenerSaldoEgreso({ ...credito, saldoPendiente: -5 })).toBe(0);
  });

  it('muestra el estado correcto, incluido anulado', () => {
    expect(obtenerEstadoEgreso(contado)).toBe('Pagado');
    expect(obtenerEstadoEgreso(credito)).toBe('Pendiente');
    expect(obtenerEstadoEgreso({ ...credito, saldoPendiente: 0 })).toBe('Saldado');
    const anulado = { ...credito, estadoDocumento: 'Anulado', saldoPendiente: 0 };
    expect(esEgresoAnulado(anulado)).toBe(true);
    expect(obtenerEstadoEgreso(anulado)).toBe('Anulado');
    expect(obtenerSaldoEgreso(anulado)).toBe(0);
  });

  it('arma etiquetas y códigos de comprobante', () => {
    expect(etiquetaEgreso(credito)).toBe('Compra N° F-1');
    expect(etiquetaEgreso(contado)).toBe('Servicios básicos');
    expect(codigoComprobante({ id: '7f3k2aXYZ' })).toBe('EG-7F3K2A');
    expect(codigoComprobante({})).toBe('EG-SINID');
    expect(nombreArchivoComprobante({ id: '7f3k2aXYZ', proveedor: 'Repuestos del Norte, S.A.', fecha: '2026-09-14T18:00:00.000Z' }))
      .toBe('Comprobante-EG-7F3K2A-Repuestos-del-Norte-S-A-2026-09-14');
  });
});

describe('reportes', () => {
  it('el rango personalizado cubre los días completos en hora local', () => {
    const { desde, hasta } = calcularRango('personalizado', '2026-09-01', '2026-09-14');
    expect(desde).toEqual(new Date(2026, 8, 1, 0, 0, 0, 0));
    expect(hasta).toEqual(new Date(2026, 8, 14, 23, 59, 59, 999));
  });

  it('la semana arranca el lunes y el mes pasado es el mes completo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 20, 10, 0));
    expect(calcularRango('semana').desde).toEqual(new Date(2026, 8, 14));
    const mesPasado = calcularRango('mesPasado');
    expect(mesPasado.desde).toEqual(new Date(2026, 7, 1));
    expect(mesPasado.hasta).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
    expect(ultimosMeses(3)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('el período anterior tiene el mismo largo y termina justo antes', () => {
    const actual = calcularRango('personalizado', '2026-09-01', '2026-09-14');
    const previo = rangoAnterior(actual);
    expect(fechaArchivo(previo.desde)).toBe('2026-08-18');
    expect(previo.hasta.getTime()).toBe(actual.desde.getTime() - 1);
  });

  it('ubica fechas dentro del rango', () => {
    const rango = calcularRango('personalizado', '2026-09-01', '2026-09-14');
    expect(dentroDe('2026-09-14T23:30:00-06:00', rango)).toBe(true);
    expect(dentroDe('2026-09-15T00:10:00-06:00', rango)).toBe(false);
    expect(dentroDe('no-es-fecha', rango)).toBe(false);
  });

  it('calcula la variación contra el período anterior', () => {
    expect(variacion(120, 100)).toBe(20);
    expect(variacion(80, 100)).toBe(-20);
    expect(variacion(50, 0)).toBe(100);
    expect(variacion(0, 0)).toBe(0);
  });

  it('agrupa por mes con etiquetas cortas', () => {
    expect(claveMes('2026-09-14T15:00:00.000Z')).toBe('2026-09');
    expect(etiquetaMes('2026-09')).toBe('sep 26');
  });

  it('usa la fecha de Nicaragua en archivos y filas de CSV', () => {
    expect(fechaArchivo(new Date(2026, 8, 14, 23, 59))).toBe('2026-09-14');
    expect(fechaCSV('2026-09-14T23:30:00-06:00')).toBe('2026-09-14');
    expect(fechaCSV('')).toBe('');
  });

  it('arma CSV que Excel abre bien', () => {
    const csv = construirCSV(['Cliente', 'Nota'], [['Pérez, Juan', 'dijo "ya"'], [1, null]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿Cliente,Nota\r\n"Pérez, Juan","dijo ""ya"""\r\n1,');
    expect(montoCSV(12.5)).toBe('12.50');
  });
});

describe('kardex', () => {
  it('calcula la cantidad con signo a partir del stock antes y después', () => {
    const salida = construirMovimiento({
      idRepuesto: 'r1', repuesto: { codigo: 'C-1', descripcion: 'Filtro' },
      tipo: TIPO_MOVIMIENTO.VENTA, stockAnterior: 10, stockNuevo: 7.5, usuario: 'Ivan'
    });
    expect(salida.cantidad).toBe(-2.5);
    expect(salida.localidad).toBe('Managua');
    expect(salida.referencia).toEqual({ coleccion: '', id: '', texto: '' });
    expect(salida).not.toHaveProperty('idTraslado');
  });

  it('enlaza los traslados y limpia el motivo', () => {
    const entrada = construirMovimiento({
      idRepuesto: 'r2', repuesto: { localidad: 'Tecolostote' }, tipo: TIPO_MOVIMIENTO.TRASLADO_ENTRADA,
      stockAnterior: 0, stockNuevo: 5, motivo: '  pedido  ', idTraslado: 't1'
    });
    expect(entrada.cantidad).toBe(5);
    expect(entrada.motivo).toBe('pedido');
    expect(entrada.idTraslado).toBe('t1');
    expect(otraBodega('Managua')).toBe('Tecolostote');
    expect(otraBodega('Tecolostote')).toBe('Managua');
  });

  it('todo tipo de movimiento tiene su etiqueta', () => {
    for (const tipo of Object.values(TIPO_MOVIMIENTO)) {
      expect(ETIQUETA_MOVIMIENTO[tipo]).toBeTruthy();
    }
  });
});

describe('accesos', () => {
  it('no manda correos a los usuarios inventados de glz.com', () => {
    expect(recibeCorreos('vendedor1@glz.com')).toBe(false);
    expect(recibeCorreos(' JoseCarlos@GLZ.com ')).toBe(false);
    expect(recibeCorreos('azelayaglz@gmail.com')).toBe(true);
  });
});
