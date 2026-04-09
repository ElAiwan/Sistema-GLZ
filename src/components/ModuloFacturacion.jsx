import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, doc, getDoc, setDoc, addDoc } from 'firebase/firestore';
import { Search, Trash2, Printer } from 'lucide-react';

export default function ModuloFacturacion({ registrarHistorial }) {
  const [inventario, setInventario] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  
  const [tipoTransaccion, setTipoTransaccion] = useState('Cotización');
  const [clienteStr, setClienteStr] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [telefono, setTelefono] = useState('');
  const [ruc, setRuc] = useState('');
  const [notas, setNotas] = useState('Entrega Inmediata');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [carrito, setCarrito] = useState([]);
  const [numDoc, setNumDoc] = useState(0);

  useEffect(() => {
    const cargarDatos = async () => {
      const inv = await getDocs(collection(db, "repuestos"));
      setInventario(inv.docs.map(d => ({ id: d.id, ...d.data() })));
      const cli = await getDocs(collection(db, "clientes"));
      setClientes(cli.docs.map(d => ({ id: d.id, ...d.data() })));
      
      const docRef = doc(db, "sistema", "secuencia");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) setNumDoc(docSnap.data().siguiente);
      else { await setDoc(docRef, { siguiente: 1 }); setNumDoc(1); }
    };
    cargarDatos();
  }, [carrito]);

  const formatoTelefono = (valor) => {
    let num = valor.replace(/\D/g, '');
    if (num.startsWith('505')) num = num.substring(3);
    num = num.substring(0, 8);
    if (num.length > 4) num = num.substring(0, 4) + '-' + num.substring(4);
    return num.length > 0 ? `+505 ${num}` : '';
  };

  const seleccionarCliente = (nombre) => {
    setClienteStr(nombre);
    const c = clientes.find(c => `${c.nombres} ${c.apellidos}` === nombre);
    if (c) { setEmpresa(c.empresa||''); setTelefono(c.telefono||''); setRuc(c.ruc||''); }
  };

  const agregar = (prod) => {
    if (carrito.find(i => i.id === prod.id)) return;
    setCarrito([...carrito, { ...prod, cantVenta: 1, precioSel: prod.precioVerde }]);
  };

  const total = carrito.reduce((sum, i) => sum + (i.cantVenta * i.precioSel), 0);
  const numFormateado = String(numDoc).padStart(5, '0');

  const procesar = async () => {
    const nombreFinal = clienteStr || 'Cliente Mostrador';
    
    // GUARDADO PARA EL MÓDULO DE BUSINESS INTELLIGENCE
    await addDoc(collection(db, "facturas"), {
      cliente: nombreFinal,
      telefono: telefono,
      tipo: tipoTransaccion,
      total: total,
      formaPago: formaPago,
      estadoPago: formaPago === 'Credito' ? 'Pendiente' : 'Pagado',
      fecha: new Date().toISOString(),
      items: carrito.map(i => ({ desc: i.descripcion, cant: i.cantVenta }))
    });

    if (tipoTransaccion === 'Factura') {
      for (const item of carrito) {
        await updateDoc(doc(db, "repuestos", item.id), { cantidad: Math.max(0, item.cantidad - item.cantVenta) });
      }
    }
    
    await registrarHistorial(tipoTransaccion, `${tipoTransaccion} #${numFormateado} a ${nombreFinal} por C$${total.toLocaleString('en-US')}`);
    window.print();
    await updateDoc(doc(db, "sistema", "secuencia"), { siguiente: numDoc + 1 });
    setCarrito([]); setClienteStr(''); setEmpresa(''); setTelefono(''); setRuc('');
  };

  // Solo mostramos repuestos con stock > 0
  const disponibles = inventario.filter(i => i.cantidad > 0 && (i.codigo.toLowerCase().includes(busqueda.toLowerCase()) || i.descripcion.toLowerCase().includes(busqueda.toLowerCase())));

  // 🔒 CANDADO 3: Validar si hay error de stock para deshabilitar el botón
  const hayErrorDeStock = tipoTransaccion === 'Factura' && carrito.some(item => item.cantVenta > item.cantidad);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 print:hidden h-full">
      {/* PANEL IZQUIERDO: Catálogo Scrollable */}
      <div className="lg:col-span-1 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-8rem)]">
        <h2 className="text-lg font-bold mb-4 border-b pb-2 text-slate-800">Catálogo Disponible</h2>
        <div className="mb-4 flex items-center bg-slate-50 border rounded-lg p-2"><Search className="text-slate-400 mr-2" size={18} /><input type="text" placeholder="Buscar repuesto..." className="w-full outline-none bg-transparent text-sm" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></div>
        <div className="overflow-y-auto flex-1 pr-1 space-y-2">
          {disponibles.map(item => (
            <div key={item.id} className="p-3 border rounded-lg bg-slate-50 flex justify-between items-center hover:border-emerald-300 transition-colors">
              <div><p className="font-bold text-sm text-slate-800">{item.codigo}</p><p className="text-xs text-slate-500 truncate w-32" title={item.descripcion}>{item.descripcion}</p><p className="text-xs font-bold text-emerald-600">Stock: {item.cantidad} <span className="text-[10px] text-slate-400 ml-1">({item.localidad})</span></p></div>
              <button onClick={() => agregar(item)} className="bg-emerald-100 text-emerald-700 w-8 h-8 rounded-full font-bold hover:bg-emerald-200">+</button>
            </div>
          ))}
          {disponibles.length === 0 && <p className="text-xs text-center text-slate-400 mt-10">No hay coincidencias en stock.</p>}
        </div>
      </div>

      {/* PANEL DERECHO: Documento */}
      <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-sm border-t-4 border-slate-800 flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex justify-between items-center mb-6 border-b pb-4 shrink-0">
          <h2 className="text-2xl font-bold flex items-center">Documento Comercial <span className="ml-4 text-lg font-medium bg-slate-100 px-3 py-1 rounded-md border text-slate-600">#{numFormateado}</span></h2>
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button onClick={() => setTipoTransaccion('Cotización')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tipoTransaccion === 'Cotización' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>Cotización</button>
            <button onClick={() => setTipoTransaccion('Factura')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${tipoTransaccion === 'Factura' ? 'bg-slate-800 shadow text-white' : 'text-slate-500'}`}>Factura (Venta Real)</button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0">
          <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Cliente</label><input type="text" list="cli-list" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500" value={clienteStr} onChange={e => seleccionarCliente(e.target.value)} placeholder="Escribe o elige de la lista..." /><datalist id="cli-list">{clientes.map(c => <option key={c.id} value={`${c.nombres} ${c.apellidos}`} />)}</datalist></div>
          <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Empresa</label><input type="text" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500" value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Ej: Transportes S.A." /></div>
          <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Teléfono</label><input type="text" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500 font-medium" value={telefono} onChange={e => setTelefono(formatoTelefono(e.target.value))} placeholder="+505 XXXX-XXXX" /></div>
          <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">RUC</label><input type="text" className="w-full border p-2.5 rounded-lg bg-white outline-none focus:border-emerald-500 uppercase" value={ruc} onChange={e => setRuc(e.target.value)} placeholder="Ej: 0011402031003K" /></div>
          <div className="col-span-4"><label className="block text-xs font-bold text-slate-500 mb-1">Notas del Documento</label><input type="text" list="notas-list" className="w-full border p-2.5 rounded-lg bg-green-50 text-green-800 outline-none" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: Entrega Inmediata" /><datalist id="notas-list"><option value="Entrega Inmediata"/><option value="Crédito a 15 días"/></datalist></div>
        </div>

        <div className="overflow-y-auto flex-1 border rounded-lg bg-slate-50">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 bg-slate-200"><tr className="border-b border-slate-300"><th className="p-3">Producto</th><th className="p-3 w-24">Cant.</th><th className="p-3 w-40">Precio Aplicado</th><th className="p-3 text-right">Subtotal</th><th className="p-3"></th></tr></thead>
            <tbody>
              {carrito.map(item => (
                <tr key={item.id} className="border-b bg-white">
                  <td className="p-3"><p className="font-bold">{item.codigo}</p><p className="text-xs text-slate-500">{item.descripcion}</p></td>
                  <td className="p-3">
                    <input 
                      type="number" 
                      min="1" 
                      value={item.cantVenta} 
                      onChange={(e) => {
                        const nuevaCant = Number(e.target.value);
                        // 🔒 CANDADO 1: Evitar que suban la cantidad si es Factura
                        if (tipoTransaccion === 'Factura' && nuevaCant > item.cantidad) {
                          alert(`❌ Acción denegada: Stock insuficiente.\nSolo hay ${item.cantidad} unidades disponibles de este repuesto.`);
                          return;
                        }
                        setCarrito(carrito.map(i => i.id === item.id ? {...i, cantVenta: nuevaCant} : i));
                      }} 
                      className="w-full border rounded p-1.5 text-center outline-none" 
                    />
                    {/* ⚠️ CANDADO 2: Advertencia visual para Cotizaciones */}
                    {item.cantVenta > item.cantidad && (
                      <div className="text-red-500 text-[10px] font-bold leading-tight mt-1 bg-red-50 p-1 rounded border border-red-100 text-center">
                        ⚠️ Stock: {item.cantidad || 0}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <select value={item.precioSel} onChange={(e) => setCarrito(carrito.map(i => i.id === item.id ? {...i, precioSel: Number(e.target.value)} : i))} className="w-full border rounded p-1.5 outline-none bg-slate-50 cursor-pointer font-medium">
                      <option value={item.precioVerde}>V: C${item.precioVerde.toLocaleString('en-US')}</option>
                      <option value={item.precioAmarillo}>A: C${item.precioAmarillo.toLocaleString('en-US')}</option>
                      <option value={item.precioRojo}>R: C${item.precioRojo.toLocaleString('en-US')}</option>
                    </select>
                  </td>
                  <td className="p-3 text-right font-bold text-slate-700">C$ {(item.cantVenta * item.precioSel).toLocaleString('en-US', {minimumFractionDigits:2})}</td>
                  <td className="p-3"><button onClick={() => setCarrito(carrito.filter(i => i.id !== item.id))} className="text-red-400 p-1"><Trash2 size={18}/></button></td>
                </tr>
              ))}
              {carrito.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400">El documento está vacío. Selecciona repuestos del catálogo izquierdo.</td></tr>}
            </tbody>
          </table>
        </div>
        
        <div className="flex justify-between items-center mt-4 shrink-0 bg-slate-100 p-4 rounded-xl border border-slate-200">
          <div><label className="text-xs font-bold text-slate-500 mr-2 uppercase">Pago:</label><select className="border border-slate-300 p-2 rounded-lg bg-white outline-none font-bold text-slate-700" value={formaPago} onChange={e => setFormaPago(e.target.value)}><option>Efectivo</option><option>Credito</option><option>Transferencia</option></select></div>
          <div className="text-right flex items-center"><span className="text-sm font-bold text-slate-500 mr-4 uppercase">Total Documento:</span><span className="text-3xl font-black text-emerald-600">C$ {total.toLocaleString('en-US', {minimumFractionDigits:2})}</span></div>
        </div>
        
        <div className="mt-4 flex justify-end shrink-0">
          <button 
            onClick={procesar} 
            disabled={carrito.length === 0 || hayErrorDeStock} 
            className={`px-8 py-3.5 rounded-xl font-bold flex items-center shadow-lg transition-colors disabled:opacity-50
              ${hayErrorDeStock 
                ? 'bg-slate-400 text-white cursor-not-allowed' 
                : 'bg-slate-800 text-white hover:bg-slate-900'
              }`}
          >
            <Printer className="mr-2" size={20} /> 
            {hayErrorDeStock ? '⚠️ Corrige el stock para facturar' : (tipoTransaccion === 'Factura' ? 'Procesar Venta e Imprimir' : 'Generar Cotización')}
          </button>
        </div>
      </div>
      {/* CAPA DE IMPRESIÓN EXCLUSIVA PARA EL PAPEL PRE-IMPRESO DE LA DGI */}
      <div className="hidden print:block absolute top-0 left-0 w-[21.59cm] h-[27.94cm] bg-white text-black text-xs font-mono z-50">
        
        {/* Forzamos a la impresora a quitar los márgenes por defecto */}
        <style>{`@media print { @page { margin: 0; size: letter; } }`}</style>

        {/* --- CABECERA DERECHA --- */}
        <div className="absolute font-bold" style={{ top: '3.8cm', left: '16cm' }}>{numFormateado}</div>
        <div className="absolute" style={{ top: '4.8cm', left: '14.5cm' }}>{new Date().toLocaleDateString('es-NI')}</div>
        
        {/* --- DATOS DEL CLIENTE (IZQUIERDA) --- */}
        <div className="absolute" style={{ top: '5.2cm', left: '3cm' }}>{clienteStr}</div>
        <div className="absolute" style={{ top: '6cm', left: '3cm' }}>{telefono}</div>
        
        {/* Checkbox de Condiciones */}
        {formaPago === 'Credito' && <div className="absolute font-bold text-lg" style={{ top: '6.7cm', left: '10.2cm' }}>X</div>}
        {formaPago !== 'Credito' && <div className="absolute font-bold text-lg" style={{ top: '6.7cm', left: '13.5cm' }}>X</div>}

        {/* --- TABLA DE PRODUCTOS --- */}
        <div className="absolute w-full" style={{ top: '8.5cm', left: '0' }}>
          {carrito.map((item, index) => (
            <div key={index} className="relative w-full mb-2 h-[0.6cm]">
              {/* Ajusta el 'left' de cada dato para que caiga en su columna física */}
              <div className="absolute" style={{ left: '1.5cm' }}>{item.codigo}</div>
              <div className="absolute" style={{ left: '4cm' }}>{item.descripcion}</div>
              <div className="absolute text-center w-[2cm]" style={{ left: '10.5cm' }}>{item.cantVenta}</div>
              <div className="absolute text-right w-[2.5cm]" style={{ left: '13cm' }}>{item.precioSel.toLocaleString('en-US', {minimumFractionDigits:2})}</div>
              <div className="absolute text-right w-[3cm]" style={{ left: '16.5cm' }}>{(item.cantVenta * item.precioSel).toLocaleString('en-US', {minimumFractionDigits:2})}</div>
            </div>
          ))}
        </div>

        {/* --- PIE DE PÁGINA (TOTALES) --- */}
        <div className="absolute text-right w-[3cm] font-bold" style={{ top: '16.5cm', left: '16.5cm' }}>{total.toLocaleString('en-US', {minimumFractionDigits:2})}</div>
        <div className="absolute text-right w-[3cm] font-black text-sm" style={{ top: '17.8cm', left: '16.5cm' }}>{total.toLocaleString('en-US', {minimumFractionDigits:2})}</div>
        
        {/* RUC del Cliente abajo */}
        <div className="absolute" style={{ top: '18.7cm', left: '2cm' }}>{ruc}</div>
      </div>
    </div>
  );
}