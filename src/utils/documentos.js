// Utilidades compartidas por Facturación, Historial y el módulo de Cotizaciones / Facturas.

export const ESTADO_DOCUMENTO = {
  VIGENTE: 'Vigente',
  ANULADO: 'Anulado'
};

export const ESTADO_COTIZACION = {
  ABIERTA: 'Abierta',
  FACTURADA: 'Facturada'
};

export const normalizarMoneda = (valor) => {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return 0;
  return Math.round((numero + Number.EPSILON) * 100) / 100;
};

export const formatearMonto = (valor) =>
  normalizarMoneda(valor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Los documentos anteriores a la anulación no traen el campo: se asumen vigentes.
export const esAnulado = (documento) => documento?.estadoDocumento === ESTADO_DOCUMENTO.ANULADO;

export const esCotizacion = (documentoOTipo) => {
  const tipo = typeof documentoOTipo === 'string' ? documentoOTipo : documentoOTipo?.tipo;
  return `${tipo || ''}`.toLowerCase().includes('cotiza');
};

// Una cotización puede estar Abierta o Facturada. Los documentos anteriores a esta
// función no tienen el campo, así que se deduce por la presencia de facturaId.
export const obtenerEstadoCotizacion = (documento) => {
  if (!esCotizacion(documento)) return '';
  if (documento?.estadoCotizacion) return documento.estadoCotizacion;
  return documento?.facturaId ? ESTADO_COTIZACION.FACTURADA : ESTADO_COTIZACION.ABIERTA;
};

export const cotizacionFacturable = (documento) =>
  esCotizacion(documento)
  && !esAnulado(documento)
  && obtenerEstadoCotizacion(documento) === ESTADO_COTIZACION.ABIERTA;

// Etiqueta corta para identificar un documento en pantalla.
export const etiquetaDocumento = (documento) => {
  if (esCotizacion(documento)) {
    return `Cotización${documento?.numeroDocumento ? ` #${documento.numeroDocumento}` : ''}`;
  }
  const numeroFisico = (documento?.numeroFactura || '').trim();
  return `Factura${numeroFisico ? ` N° ${numeroFisico}` : ''}`;
};

export const limpiarParaArchivo = (texto) => `${texto || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

export const nombreArchivoDocumento = (documento) => {
  const tipo = esCotizacion(documento) ? 'Cotizacion' : 'Factura';
  const numero = documento?.numeroDocumento || documento?.numeroFactura || '';
  const cliente = limpiarParaArchivo(documento?.empresa || documento?.cliente);
  const fecha = `${documento?.fecha || ''}`.slice(0, 10);
  return [tipo, limpiarParaArchivo(numero), cliente, fecha].filter(Boolean).join('-') || 'Documento-GLZ';
};

// El navegador toma el título de la página como nombre sugerido al guardar en PDF,
// así que lo cambiamos mientras dura el diálogo de impresión.
export const imprimirDocumento = (nombreArchivo = '') => {
  if (typeof window === 'undefined') return;

  const tituloOriginal = document.title;
  let restaurado = false;
  const restaurar = () => {
    if (restaurado) return;
    restaurado = true;
    document.title = tituloOriginal;
    window.removeEventListener('afterprint', restaurar);
  };

  if (nombreArchivo) {
    document.title = nombreArchivo;
    window.addEventListener('afterprint', restaurar);
    window.setTimeout(restaurar, 2000);
  }

  window.print();

  if (!nombreArchivo) restaurar();
};

// Deja cualquier documento guardado en Firestore listo para las plantillas de impresión,
// tolerando los distintos nombres de campo que se han usado a lo largo del proyecto.
export const normalizarDocumentoParaImpresion = (factura) => {
  const itemsNormalizados = Array.isArray(factura?.items)
    ? factura.items.map((item, index) => {
      const cantidad = normalizarMoneda(item?.cant ?? item?.cantidad ?? item?.cantVenta ?? 0);
      const precio = normalizarMoneda(item?.precio ?? item?.precioSel ?? item?.precioUnitario ?? 0);
      const subtotal = item?.subtotal != null
        ? normalizarMoneda(item.subtotal)
        : normalizarMoneda(cantidad * precio);

      return {
        id: item?.id || `${factura?.id || 'doc'}-item-${index}`,
        codigo: item?.codigo || item?.cod || '',
        alternateCode: item?.alternateCode || '',
        usarCodigoAlterno: Boolean(item?.usarCodigoAlterno),
        codigoImpresion: item?.codigoImpresion || '',
        descripcion: item?.desc || item?.descripcion || 'Sin descripción',
        cantVenta: cantidad,
        precioSel: precio,
        subtotal
      };
    })
    : [];

  const totalItems = normalizarMoneda(itemsNormalizados.reduce((sum, item) => sum + item.subtotal, 0));

  return {
    id: factura?.id || '',
    tipo: factura?.tipo || 'Factura',
    estadoDocumento: factura?.estadoDocumento || ESTADO_DOCUMENTO.VIGENTE,
    anulacion: factura?.anulacion || null,
    numeroDocumento: factura?.numeroDocumento || '',
    numeroFactura: factura?.numeroFactura || '',
    fecha: factura?.fecha || new Date().toISOString(),
    idCliente: factura?.idCliente || factura?.clienteId || '',
    formaPago: factura?.formaPago || 'Efectivo',
    cliente: factura?.cliente || 'Cliente Mostrador',
    empresa: factura?.empresa || '',
    telefono: factura?.telefono || '',
    ruc: factura?.ruc || '',
    notas: factura?.notas || '',
    usuarioCreador: factura?.usuarioCreador || factura?.usuario || factura?.creadoPor || '',
    total: factura?.total != null ? normalizarMoneda(factura.total) : totalItems,
    items: itemsNormalizados
  };
};

// Renglones que caben en una hoja del talonario preimpreso con FILA_ALTO = 0.60cm
// (PlantillaDocumentoComercial.jsx). Verificado con impresión real: el artículo 17 se sale.
export const RENGLONES_TALONARIO = 16;
