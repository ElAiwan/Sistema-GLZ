import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Trash2, Search, Edit2, Check, X, Truck } from 'lucide-react';

const PROVEEDOR_VACIO = { nombre: '', contacto: '', telefono: '', correo: '', ruc: '', direccion: '', notas: '' };

const formatoTelefono = (valor) => {
  let num = `${valor || ''}`.replace(/\D/g, '');
  if (num.startsWith('505')) num = num.substring(3);
  num = num.substring(0, 8);
  if (num.length > 4) num = num.substring(0, 4) + '-' + num.substring(4);
  return num.length > 0 ? `+505 ${num}` : '';
};

export default function ModuloProveedores({ registrarHistorial, rol }) {
  const [proveedores, setProveedores] = useState([]);
  const [nuevo, setNuevo] = useState(PROVEEDOR_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [editado, setEditado] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esAdmin = rol === 'admin';

  const obtener = async () => {
    const snap = await getDocs(collection(db, 'proveedores'));
    setProveedores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    let activo = true;
    getDocs(collection(db, 'proveedores'))
      .then((snap) => {
        if (!activo) return;
        setProveedores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch((errorCarga) => {
        console.error('Error cargando proveedores:', errorCarga);
        if (activo) setError('No se pudieron cargar los proveedores.');
      });
    return () => { activo = false; };
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    if (!esAdmin) {
      setError('Solo un administrador puede registrar proveedores.');
      return;
    }
    if (!nuevo.nombre.trim()) {
      setError('El nombre del proveedor es obligatorio.');
      return;
    }

    setGuardando(true);
    try {
      await addDoc(collection(db, 'proveedores'), { ...nuevo, nombre: nuevo.nombre.trim() });
      await registrarHistorial('Proveedores', `Registró al proveedor: ${nuevo.nombre.trim()}`);
      setNuevo(PROVEEDOR_VACIO);
      setError('');
      await obtener();
    } catch (errorGuardado) {
      console.error('Error guardando proveedor:', errorGuardado);
      setError('No se pudo guardar el proveedor.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (item) => {
    if (!esAdmin) return;
    if (!window.confirm(`¿Eliminar al proveedor ${item.nombre}?`)) return;

    try {
      await deleteDoc(doc(db, 'proveedores', item.id));
      await registrarHistorial('Proveedores', `Eliminó al proveedor: ${item.nombre}`);
      await obtener();
    } catch (errorEliminar) {
      console.error('Error eliminando proveedor:', errorEliminar);
      setError('No se pudo eliminar el proveedor.');
    }
  };

  const guardarEdicion = async (id) => {
    try {
      await updateDoc(doc(db, 'proveedores', id), {
        nombre: (editado.nombre || '').trim(),
        contacto: editado.contacto || '',
        telefono: editado.telefono || '',
        correo: editado.correo || '',
        ruc: editado.ruc || '',
        direccion: editado.direccion || '',
        notas: editado.notas || ''
      });
      await registrarHistorial('Proveedores', `Actualizó al proveedor: ${editado.nombre}`);
      setEditandoId(null);
      await obtener();
    } catch (errorEdicion) {
      console.error('Error actualizando proveedor:', errorEdicion);
      setError('No se pudo guardar la edición.');
    }
  };

  const filtrados = proveedores.filter((p) =>
    `${p.nombre} ${p.contacto} ${p.telefono} ${p.ruc}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200 print:hidden">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4 flex items-center gap-2">
        <Truck size={24} className="text-slate-500" /> Directorio de Proveedores
      </h2>

      {error && (
        <div className="mb-4 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>
      )}

      {esAdmin && (
        <form onSubmit={guardar} className="mb-8 bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-1">Nombre o razón social</label>
              <input required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej: Repuestos del Norte S.A." className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Persona de contacto</label>
              <input value={nuevo.contacto} onChange={(e) => setNuevo({ ...nuevo, contacto: e.target.value })} placeholder="Opcional" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono</label>
              <input value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: formatoTelefono(e.target.value) })} placeholder="+505 0000-0000" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white font-medium" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Correo</label>
              <input type="email" value={nuevo.correo} onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} placeholder="ejemplo@correo.com" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">RUC</label>
              <input value={nuevo.ruc} onChange={(e) => setNuevo({ ...nuevo, ruc: e.target.value })} placeholder="Opcional" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white uppercase" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 mb-1">Dirección</label>
              <input value={nuevo.direccion} onChange={(e) => setNuevo({ ...nuevo, direccion: e.target.value })} placeholder="Opcional" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Notas</label>
              <input value={nuevo.notas} onChange={(e) => setNuevo({ ...nuevo, notas: e.target.value })} placeholder="Ej: entrega los martes" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" />
            </div>
          </div>
          <button type="submit" disabled={guardando} className="bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-600 shadow-sm transition-colors w-full sm:w-auto disabled:opacity-50">
            {guardando ? 'Guardando...' : 'Guardar Proveedor'}
          </button>
        </form>
      )}

      <div className="mb-4 flex items-center bg-white border border-slate-300 rounded-lg p-2 md:w-1/2 focus-within:border-emerald-500 transition-colors">
        <Search className="text-slate-400 mr-2" size={20} />
        <input type="text" placeholder="Buscar proveedor..." className="w-full outline-none text-slate-700" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      <div className="md:hidden space-y-3">
        {filtrados.map((p) => (
          <div key={p.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
            <p className="font-bold text-slate-800">{p.nombre}</p>
            {p.contacto && <p className="text-xs text-slate-500 mt-1">Contacto: {p.contacto}</p>}
            <p className="text-sm font-medium text-slate-700 mt-1">{p.telefono || '-'}</p>
            <p className="text-sm text-slate-500">{p.correo || '-'}</p>
            {esAdmin && (
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => { setEditandoId(p.id); setEditado({ ...p }); }} className="text-blue-500 border border-slate-200 bg-white p-2 rounded" title="Editar"><Edit2 size={16} /></button>
                <button onClick={() => eliminar(p)} className="text-red-500 border border-slate-200 bg-white p-2 rounded" title="Eliminar"><Trash2 size={16} /></button>
              </div>
            )}
          </div>
        ))}
        {filtrados.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No hay proveedores para mostrar.</p>}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="p-3 rounded-tl-lg">Proveedor</th>
              <th className="p-3">Contacto</th>
              <th className="p-3">Teléfono</th>
              <th className="p-3">RUC</th>
              <th className="p-3 text-center rounded-tr-lg">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => (
              <tr key={p.id} className="border-b hover:bg-slate-50">
                {editandoId === p.id ? (
                  <td colSpan="5" className="p-3 bg-slate-100">
                    <div className="flex flex-wrap gap-2">
                      <input value={editado.nombre || ''} onChange={(e) => setEditado({ ...editado, nombre: e.target.value })} className="border p-1.5 rounded flex-1 min-w-[12rem]" placeholder="Nombre" />
                      <input value={editado.contacto || ''} onChange={(e) => setEditado({ ...editado, contacto: e.target.value })} className="border p-1.5 rounded flex-1 min-w-[9rem]" placeholder="Contacto" />
                      <input value={editado.telefono || ''} onChange={(e) => setEditado({ ...editado, telefono: formatoTelefono(e.target.value) })} className="border p-1.5 rounded w-40" placeholder="Teléfono" />
                      <button onClick={() => guardarEdicion(p.id)} className="text-green-600 px-2"><Check /></button>
                      <button onClick={() => setEditandoId(null)} className="text-red-500 px-2"><X /></button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="p-3 font-bold text-slate-700">
                      {p.nombre}
                      {p.direccion && <p className="text-[11px] font-medium text-slate-400">{p.direccion}</p>}
                    </td>
                    <td className="p-3 text-slate-600">{p.contacto || '-'}</td>
                    <td className="p-3 font-medium">{p.telefono || '-'}</td>
                    <td className="p-3 text-slate-500 uppercase">{p.ruc || '-'}</td>
                    <td className="p-3 text-center">
                      {esAdmin && (
                        <div className="flex justify-center gap-2">
                          <button onClick={() => { setEditandoId(p.id); setEditado({ ...p }); }} className="text-blue-500 hover:bg-blue-100 p-1.5 rounded" title="Editar"><Edit2 size={16} /></button>
                          <button onClick={() => eliminar(p)} className="text-red-500 hover:bg-red-100 p-1.5 rounded" title="Eliminar"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan="5" className="p-8 text-center text-slate-400">No hay proveedores para mostrar.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
