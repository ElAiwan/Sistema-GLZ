const LOGOS_MARCAS = [
  'automann.png',
  'bullusa.png',
  'caterpillar.png',
  'ctp.png',
  'delcoremy.png',
  'donaldson.png',
  'johndeere.png',
  'komatsu.png',
  'ktc.png',
  'tecfil.png',
  'wixfilters.png'
];

const normalizarNumero = (valor) => {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return 0;
  return Math.round((numero + Number.EPSILON) * 100) / 100;
};

const formatearMonto = (valor) =>
  `C$ ${normalizarNumero(valor).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const fechaSegura = (fecha) => {
  const parsed = fecha ? new Date(fecha) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
};

const formatearFecha = (fecha) =>
  fechaSegura(fecha).toLocaleDateString('es-NI', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

const normalizarItems = (items) => {
  if (!Array.isArray(items)) return [];

  return items.map((item, index) => {
    const cantidad = normalizarNumero(item?.cantVenta ?? item?.cant ?? item?.cantidad ?? 0);
    const precio = normalizarNumero(item?.precioSel ?? item?.precio ?? item?.precioUnitario ?? 0);
    const subtotal = item?.subtotal != null
      ? normalizarNumero(item.subtotal)
      : normalizarNumero(cantidad * precio);
    const codigoAlterno = (item?.alternateCode || '').trim();
    const usarAlterno = Boolean(
      item?.usarCodigoAlterno ||
      item?.preferenciaCodigo === 'alterno' ||
      item?.codigoSeleccionado === 'alterno'
    );
    const codigoElegido = item?.codigoImpresion || (usarAlterno && codigoAlterno ? codigoAlterno : (item?.codigo || item?.cod || ''));

    return {
      id: item?.id || `${codigoElegido || 'item'}-${index}`,
      codigo: codigoElegido,
      descripcion: item?.descripcion || item?.desc || 'Sin descripción',
      cantidad,
      precio,
      subtotal
    };
  });
};

export default function PlantillaCotizacionComercial({ documento, soloImpresion = false }) {
  const numeroDocumento = documento?.numeroDocumento || '---';
  const fechaCotizacion = formatearFecha(documento?.fecha);
  const cliente = documento?.cliente || 'Cliente Mostrador';
  const idCliente = documento?.idCliente || documento?.clienteId || '';
  const empresa = documento?.empresa || '';
  const telefono = documento?.telefono || '';
  const ruc = documento?.ruc || '';
  const notas = documento?.notas || '';
  const formaPago = documento?.formaPago || 'Efectivo';
  const usuarioCreador = documento?.usuarioCreador || documento?.usuario || documento?.creadoPor || 'N/D';

  const items = normalizarItems(documento?.items);
  const subtotalCalculado = normalizarNumero(items.reduce((sum, item) => sum + item.subtotal, 0));
  const total = documento?.total != null ? normalizarNumero(documento.total) : subtotalCalculado;

  return (
    <div className={soloImpresion ? 'hidden print:block' : 'block'}>
      <style>{`
        @media print {
          @page {
            size: letter;
            margin: 1cm;
          }

          .cotizacion-print-root {
            max-width: none !important;
            border: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
          }

          .cotizacion-print-table thead {
            display: table-header-group;
          }

          .cotizacion-print-table tr,
          .cotizacion-print-no-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <article className="cotizacion-print-root mx-auto w-full max-w-[21.59cm] min-h-[27.94cm] bg-white text-slate-800 border border-slate-200 shadow-sm p-6 print:p-0 print:min-h-0">
        <header className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b-2 border-slate-800 pb-4">
          <div>
            <img src="/logo.jpg" alt="GLZ" className="h-16 w-auto object-contain" />
            <p className="text-sm font-bold text-slate-900 mt-2 tracking-wide">COTIZACIÓN COMERCIAL</p>
          </div>
          <div className="text-sm text-slate-700 sm:text-right space-y-1">
            <p><span className="font-bold">Elaborar CK a nombre de:</span> Alejandro Salvador Zelaya Alfaro</p>
            <p><span className="font-bold">RUC:</span> 0011402031003K</p>
            <p><span className="font-bold">Contacto:</span> 505 7726-4543 Tigo</p>
            <p><span className="font-bold">Correo:</span> azelayaglz@gmail.com</p>
            <p className="pt-2"><span className="font-bold">No. Cotización:</span> {numeroDocumento}</p>
            <p><span className="font-bold">Fecha:</span> {fechaCotizacion}</p>
          </div>
        </header>

        <section className="mt-4 border border-slate-300 rounded-lg overflow-hidden text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="border-b sm:border-b-0 sm:border-r border-slate-300 p-3"><span className="font-bold text-slate-600 block text-xs uppercase">Id Cliente</span><span>{idCliente}</span></div>
            <div className="border-b border-slate-300 p-3"><span className="font-bold text-slate-600 block text-xs uppercase">Nombre</span><span>{cliente}</span></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="border-b sm:border-r border-slate-300 p-3"><span className="font-bold text-slate-600 block text-xs uppercase">Empresa</span><span>{empresa}</span></div>
            <div className="border-b border-slate-300 p-3"><span className="font-bold text-slate-600 block text-xs uppercase">Fecha de Cot</span><span>{fechaCotizacion}</span></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="border-b sm:border-r border-slate-300 p-3"><span className="font-bold text-slate-600 block text-xs uppercase">Teléfono</span><span>{telefono}</span></div>
            <div className="border-b border-slate-300 p-3"><span className="font-bold text-slate-600 block text-xs uppercase">RUC</span><span>{ruc}</span></div>
          </div>
          <div className="p-3">
            <span className="font-bold text-slate-600 block text-xs uppercase">Notas</span>
            <span>{notas}</span>
          </div>
        </section>

        <section className="mt-5">
          <table className="cotizacion-print-table w-full border border-slate-300 text-[11px]">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-3 py-2 text-center border border-slate-300">Cantidad</th>
                <th className="px-3 py-2 text-center border border-slate-300">Código de producto</th>
                <th className="px-3 py-2 text-left border border-slate-300">Descripción</th>
                <th className="px-3 py-2 text-right border border-slate-300">P/Unitario</th>
                <th className="px-3 py-2 text-right border border-slate-300">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-3 py-6 text-center text-slate-400 border border-slate-300">
                    Sin productos seleccionados
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 text-center border border-slate-300">{item.cantidad}</td>
                  <td className="px-3 py-2 text-center border border-slate-300">{item.codigo}</td>
                  <td className="px-3 py-2 border border-slate-300">{item.descripcion}</td>
                  <td className="px-3 py-2 text-right border border-slate-300">{formatearMonto(item.precio)}</td>
                  <td className="px-3 py-2 text-right border border-slate-300">{formatearMonto(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cotizacion-print-no-break mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="border border-slate-300 rounded-lg p-3 space-y-1">
            <p><span className="font-bold text-slate-700">Forma de pago:</span> {formaPago}</p>
            <p><span className="font-bold text-slate-700">Validez:</span> Oferta válida por 7 días</p>
            <p><span className="font-bold text-slate-700">Cotización elaborada por:</span> {usuarioCreador}</p>
          </div>

          <div className="border border-slate-300 rounded-lg p-3">
            <div className="flex items-center justify-between py-1 border-b border-slate-200">
              <span className="font-semibold text-slate-600">Subtotal</span>
              <span className="font-bold">{formatearMonto(subtotalCalculado)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="font-black text-slate-800">Total</span>
              <span className="font-black text-base text-slate-900">{formatearMonto(total)}</span>
            </div>
          </div>
        </section>

        <footer className="cotizacion-print-no-break mt-8 pt-4 border-t border-slate-300">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Marcas disponibles</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 items-center">
            {LOGOS_MARCAS.map((logo) => (
              <div key={logo} className="border border-slate-200 rounded-md p-2 bg-white">
                <img src={`/${logo}`} alt={logo.replace('.png', '')} className="h-8 w-full object-contain" />
              </div>
            ))}
          </div>
        </footer>
      </article>
    </div>
  );
}

