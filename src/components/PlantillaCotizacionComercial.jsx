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

const LOGO_ASSET_VERSION = '20260422-logos-v3';

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

function CampoCompacto({ etiqueta, valor, className = '' }) {
  return (
    <div className={`px-2.5 py-1.5 border-slate-300 ${className}`}>
      <div className="grid grid-cols-[92px_1fr] items-start gap-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{etiqueta}:</p>
        <p className="text-sm font-medium text-slate-800 break-words leading-tight">{valor || ''}</p>
      </div>
    </div>
  );
}

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

          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          img {
            background-color: white !important;
          }

          .cotizacion-hoja {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }

          .cotizacion-tabla thead {
            display: table-header-group;
          }

          .cotizacion-fila,
          .cotizacion-no-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <article className="cotizacion-hoja mx-auto w-full max-w-[21.59cm] bg-white text-slate-800 border border-slate-300 shadow-sm p-4 print:text-[11px]">
        <header className="border border-slate-300 rounded-lg overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr]">
            <div className="p-3 border-b md:border-b-0 md:border-r border-slate-300 flex flex-col justify-center">
              <img src="/logo.jpg" alt="GLZ" className="h-16 w-auto object-contain mb-1.5" />
              <p className="text-sm font-black text-slate-900 tracking-wide">COTIZACIÓN COMERCIAL</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Sistema GLZ Cloud</p>
            </div>

            <div className="p-3 bg-slate-50">
              <div className="border border-slate-300 rounded-md bg-white px-2.5 py-1.5 mb-2 text-right">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Cotización #</p>
                <p className="text-xl font-black text-slate-900 leading-tight">{numeroDocumento}</p>
                <p className="text-[11px] text-slate-600 mt-0.5"><span className="font-bold">Fecha:</span> {fechaCotizacion}</p>
              </div>

              <div className="text-[11px] text-slate-700 space-y-0.5 leading-snug">
                <p><span className="font-bold">Elaborar CK a nombre de:</span> Alejandro Salvador Zelaya Alfaro</p>
                <p><span className="font-bold">Ruc:</span> 0011402031003K</p>
                <p><span className="font-bold">Contacto:</span> 505 7726-4543 Tigo</p>
                <p><span className="font-bold">Correo:</span> azelayaglz@gmail.com</p>
              </div>
            </div>
          </div>
        </header>

        <section className="mt-3 border border-slate-300 rounded-lg overflow-hidden">
          <div className="px-2.5 py-1.5 bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider">
            Datos del Cliente
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 border-t border-slate-300">
            <CampoCompacto etiqueta="Id Cliente" valor={idCliente} className="border-b md:border-r" />
            <CampoCompacto etiqueta="Nombre" valor={cliente} className="border-b" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <CampoCompacto etiqueta="Empresa" valor={empresa} className="border-b md:border-r" />
            <CampoCompacto etiqueta="Fecha de Cot" valor={fechaCotizacion} className="border-b" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <CampoCompacto etiqueta="Teléfono" valor={telefono} className="border-b md:border-r" />
            <CampoCompacto etiqueta="RUC" valor={ruc} className="border-b" />
          </div>

          <div className="px-2.5 py-1.5">
            <div className="grid grid-cols-[92px_1fr] items-start gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Notas:</p>
              <p className="text-sm font-medium text-slate-800 break-words leading-tight">{notas || ''}</p>
            </div>
          </div>
        </section>

        <section className="mt-3">
          <table className="cotizacion-tabla w-full border border-slate-300 border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#11325a] text-white">
                <th className="px-2.5 py-1.5 border border-slate-300 text-center w-[11%]">Cantidad</th>
                <th className="px-2.5 py-1.5 border border-slate-300 text-center w-[20%]">Código de producto</th>
                <th className="px-2.5 py-1.5 border border-slate-300 text-left w-[37%]">Descripción</th>
                <th className="px-2.5 py-1.5 border border-slate-300 text-right w-[16%]">P/Unitario</th>
                <th className="px-2.5 py-1.5 border border-slate-300 text-right w-[16%]">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr className="cotizacion-fila">
                  <td colSpan="5" className="px-2.5 py-4 border border-slate-300 text-center text-slate-400 font-semibold">
                    No hay productos cargados en esta cotización.
                  </td>
                </tr>
              ) : items.map((item) => (
                <tr key={item.id} className="cotizacion-fila">
                  <td className="px-2.5 py-1.5 border border-slate-300 text-center align-top">{formatearCantidad(item.cantidad)}</td>
                  <td className="px-2.5 py-1.5 border border-slate-300 text-center align-top">{item.codigo}</td>
                  <td className="px-2.5 py-1.5 border border-slate-300 align-top">{item.descripcion}</td>
                  <td className="px-2.5 py-1.5 border border-slate-300 text-right align-top">{formatearMonto(item.precio)}</td>
                  <td className="px-2.5 py-1.5 border border-slate-300 text-right align-top">{formatearMonto(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="cotizacion-no-break mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <div className="px-2.5 py-1.5 bg-slate-100 border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700">
              Condiciones Comerciales
            </div>
            <div className="p-2.5 text-sm space-y-1.5">
              <p><span className="font-bold text-slate-700">Forma de pago:</span> {formaPago}</p>
              <p><span className="font-bold text-slate-700">Validez:</span> Oferta válida por 7 días</p>
              <p><span className="font-bold text-slate-700">Cotización elaborada por:</span> {usuarioCreador}</p>
            </div>
          </div>

          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <div className="px-2.5 py-1.5 bg-slate-100 border-b border-slate-300 text-[10px] font-black uppercase tracking-wider text-slate-700">
              Resumen
            </div>
            <div className="p-2.5">
              <div className="flex items-center justify-between py-0.5 border-b border-slate-200 text-sm">
                <span className="font-semibold text-slate-600">Subtotal</span>
                <span className="font-bold text-slate-800">{formatearMonto(subtotalCalculado)}</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 text-base">
                <span className="font-black text-slate-900">Total</span>
                <span className="font-black text-slate-900">{formatearMonto(total)}</span>
              </div>
            </div>
          </div>
        </section>

        <footer className="cotizacion-no-break mt-4 pt-3 border-t border-slate-300">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Marcas disponibles</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {LOGOS_MARCAS.map((logo) => (
              <div key={logo} className="border border-slate-200 rounded-md bg-white p-2 flex items-center justify-center">
                <img
                  src={`/${logo}?v=${LOGO_ASSET_VERSION}`}
                  alt={logo.replace('.png', '')}
                  className="max-h-7 w-full object-contain bg-white"
                />
              </div>
            ))}
          </div>
        </footer>
      </article>
    </div>
  );
}
