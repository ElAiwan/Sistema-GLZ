const normalizarNumero = (valor) => {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return 0;
  return Math.round((numero + Number.EPSILON) * 100) / 100;
};

const formatearMonto = (valor) =>
  normalizarNumero(valor).toLocaleString('en-US', { minimumFractionDigits: 2 });

const formatearCantidad = (valor) => {
  const cantidad = normalizarNumero(valor);
  if (Number.isInteger(cantidad)) return String(cantidad);
  return cantidad.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const normalizarItems = (items) => {
  if (!Array.isArray(items)) return [];

  return items.map((item, index) => {
    const cantidad = normalizarNumero(item?.cantVenta ?? item?.cant ?? item?.cantidad ?? 0);
    const precio = normalizarNumero(item?.precioSel ?? item?.precio ?? item?.precioUnitario ?? 0);
    const subtotal = item?.subtotal != null
      ? normalizarNumero(item.subtotal)
      : normalizarNumero(cantidad * precio);

    return {
      id: item?.id || `${item?.codigo || 'item'}-${index}`,
      codigo: item?.codigo || item?.cod || '',
      descripcion: item?.descripcion || item?.desc || 'Sin descripción',
      cantidad,
      precio,
      subtotal
    };
  });
};

const fechaSegura = (fecha) => {
  const parsed = fecha ? new Date(fecha) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
};

const esCotizacion = (tipo) => {
  const normalizado = `${tipo || ''}`.toLowerCase();
  return normalizado.includes('cotización') || normalizado.includes('cotizacion');
};

export default function PlantillaDocumentoComercial({ documento, soloImpresion = false }) {
  const tipo = documento?.tipo || 'Factura';
  const numeroDocumento = documento?.numeroDocumento || '';
  const formaPago = documento?.formaPago || 'Efectivo';
  const cliente = documento?.cliente || 'Cliente Mostrador';
  const telefono = documento?.telefono || '';
  const ruc = documento?.ruc || '';
  const notas = documento?.notas || '';

  const items = normalizarItems(documento?.items);
  const totalCalculado = normalizarNumero(items.reduce((sum, item) => sum + item.subtotal, 0));
  const totalDocumento = documento?.total != null ? normalizarNumero(documento.total) : totalCalculado;

  const fecha = fechaSegura(documento?.fecha);
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = String(fecha.getFullYear());

  return (
    <div
      className={
        soloImpresion
          ? "hidden print:block absolute top-0 left-0 w-[21.59cm] h-[27.94cm] bg-white text-black text-xs font-mono z-50"
          : "relative w-[21.59cm] h-[27.94cm] bg-white text-black text-xs font-mono shadow-md"
      }
    >
      <style>{`@media print { @page { margin: 0; size: letter; } }`}</style>

      {esCotizacion(tipo) && (
        <div className="absolute font-bold text-lg text-center" style={{ top: '4.2cm', right: '1.9cm', width: '3.2cm' }}>
          {numeroDocumento}
        </div>
      )}

      <div className="absolute text-center" style={{ top: '5.3cm', right: '4.9cm', width: '0.9cm' }}>{dia}</div>
      <div className="absolute text-center" style={{ top: '5.3cm', right: '5.9cm', width: '0.9cm' }}>{mes}</div>
      <div className="absolute text-center" style={{ top: '5.3cm', right: '3.1cm', width: '1.6cm' }}>{anio}</div>

      {formaPago !== 'Credito' && <div className="absolute font-bold text-sm text-center" style={{ top: '7.7cm', right: '6.1cm', width: '0.7cm', lineHeight: '0.7cm' }}>X</div>}
      {formaPago === 'Credito' && <div className="absolute font-bold text-sm text-center" style={{ top: '7.7cm', right: '10.1cm', width: '0.6cm', lineHeight: '0.6cm' }}>X</div>}

      <div className="absolute font-bold text-[13.5px] uppercase whitespace-nowrap overflow-hidden text-ellipsis" style={{ top: '6.1cm', left: '4.0cm', width: '10.5cm' }}>{cliente}</div>
      <div className="absolute text-[13.5px] whitespace-nowrap overflow-hidden text-ellipsis" style={{ top: '7.0cm', left: '4.0cm', width: '6.8cm' }}>{telefono}</div>
      <div className="absolute uppercase whitespace-nowrap overflow-hidden text-ellipsis" style={{ top: '6.5cm', right: '0.1cm', width: '6.5cm' }}>{ruc}</div>
      <div className="absolute uppercase whitespace-nowrap overflow-hidden text-ellipsis" style={{ top: '7.85cm', left: '4.6cm', width: '10.5cm' }}>{notas}</div>

      <div className="absolute" style={{ top: '11.0cm', left: '1.1cm', width: '19.4cm' }}>
        <table className="text-[10px] leading-tight table-fixed border-collapse" style={{ width: '19.4cm' }}>
          <colgroup>
            <col style={{ width: '3.4cm' }} />
            <col style={{ width: '5.4cm' }} />
            <col style={{ width: '2.1cm' }} />
            <col style={{ width: '3.4cm' }} />
            <col style={{ width: '5.1cm' }} />
          </colgroup>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ height: '0.72cm' }}>
                <td className="align-top pr-[0.12cm] whitespace-nowrap overflow-hidden text-ellipsis">{item.codigo}</td>
                <td className="align-top pr-[0.12cm] whitespace-nowrap overflow-hidden text-ellipsis" style={{ position: 'relative', left: '-1cm' }}>{item.descripcion}</td>
                <td className="align-top text-center whitespace-nowrap" style={{ position: 'relative', left: '-0.7cm' }}>{formatearCantidad(item.cantidad)}</td>
                <td className="align-top text-right whitespace-nowrap" style={{ position: 'relative', left: '-0.9cm' }}>{formatearMonto(item.precio)}</td>
                <td className="align-top text-right whitespace-nowrap" style={{ position: 'relative', left: '-2.3cm' }}>{formatearMonto(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="absolute text-right font-bold" style={{ top: '20.0cm', left: '13.4cm', width: '5.6cm' }}>{formatearMonto(totalDocumento)}</div>
      <div className="absolute text-right font-black text-sm" style={{ top: '21.2cm', left: '13.5cm', width: '5.6cm' }}>{formatearMonto(totalDocumento)}</div>
    </div>
  );
}
