import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Trash2, Search, Edit2, Check, X } from 'lucide-react';

export default function ModuloCRM({ registrarHistorial, rol }) {
  const [clientes, setClientes] = useState([]);
  const [nuevo, setNuevo] = useState({ nombres: '', apellidos: '', empresa: '', telefono: '', correo: '', ruc: '' });
  const [editandoId, setEditandoId] = useState(null);
  const [editado, setEditado] = useState({});
  const [busqueda, setBusqueda] = useState('');

  const obtener = async () => {
    const snap = await getDocs(collection(db, "clientes"));
    setClientes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };
  useEffect(() => { obtener(); }, []);

  const formatoTelefono = (valor) => {
    let num = valor.replace(/\D/g, '');
    if (num.startsWith('505')) num = num.substring(3);
    num = num.substring(0, 8);
    if (num.length > 4) num = num.substring(0, 4) + '-' + num.substring(4);
    return num.length > 0 ? `+505 ${num}` : '';
  };

  const guardar = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "clientes"), nuevo);
    await registrarHistorial("CRM", `Registró al cliente: ${nuevo.nombres} ${nuevo.apellidos}`);
    setNuevo({ nombres: '', apellidos: '', empresa: '', telefono: '', correo: '', ruc: '' });
    obtener();
  };

  const eliminar = async (item) => {
    if (window.confirm("¿Eliminar cliente?")) {
      await deleteDoc(doc(db, "clientes", item.id));
      await registrarHistorial("CRM", `Eliminó al cliente: ${item.nombres}`);
      obtener();
    }
  };

  const guardarEdicion = async (id) => {
    await updateDoc(doc(db, "clientes", id), editado); 
    await registrarHistorial("CRM", `Actualizó cliente: ${editado.nombres}`);
    setEditandoId(null); obtener(); 
  };

  const filtrados = clientes.filter(c => 
    `${c.nombres} ${c.apellidos} ${c.empresa} ${c.telefono}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">Directorio de Clientes (CRM)</h2>
      
      <form onSubmit={guardar} className="mb-8 bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div><label className="block text-xs font-bold text-slate-500 mb-1">Nombres</label><input required value={nuevo.nombres} onChange={e => setNuevo({...nuevo, nombres: e.target.value})} placeholder="Ej: Iván Alejandro" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1">Apellidos</label><input required value={nuevo.apellidos} onChange={e => setNuevo({...nuevo, apellidos: e.target.value})} placeholder="Ej: Zelaya Alfaro" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1">Empresa</label><input value={nuevo.empresa} onChange={e => setNuevo({...nuevo, empresa: e.target.value})} placeholder="Ej: Alcaldía MGA (Opcional)" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1">Teléfono</label><input required value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: formatoTelefono(e.target.value)})} placeholder="+505 0000-0000" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white font-medium text-slate-700" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1">Correo Electrónico</label><input type="email" value={nuevo.correo} onChange={e => setNuevo({...nuevo, correo: e.target.value})} placeholder="ejemplo@correo.com" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" /></div>
          <div><label className="block text-xs font-bold text-slate-500 mb-1">RUC</label><input value={nuevo.ruc} onChange={e => setNuevo({...nuevo, ruc: e.target.value})} placeholder="Ej: 0011402031003K" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white uppercase" /></div>
        </div>
        <button type="submit" className="bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-600 shadow-sm transition-colors">Guardar Cliente</button>
      </form>

      <div className="mb-4 flex items-center bg-white border border-slate-300 rounded-lg p-2 md:w-1/2 focus-within:border-emerald-500 transition-colors">
        <Search className="text-slate-400 mr-2" size={20} /><input type="text" placeholder="Buscar cliente..." className="w-full outline-none text-slate-700" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead><tr className="bg-slate-800 text-white"><th className="p-3 rounded-tl-lg">Cliente</th><th className="p-3">Empresa</th><th className="p-3">Teléfono</th><th className="p-3">Correo</th><th className="p-3 text-center rounded-tr-lg">Acciones</th></tr></thead>
          <tbody>
            {filtrados.map(c => (
              <tr key={c.id} className="border-b hover:bg-slate-50">
                {editandoId === c.id ? (
                  <td colSpan="5" className="p-3 bg-slate-100"><div className="flex gap-2"><input value={editado.nombres} onChange={e=>setEditado({...editado, nombres:e.target.value})} className="border p-1 w-full"/><input value={editado.telefono} onChange={e=>setEditado({...editado, telefono:formatoTelefono(e.target.value)})} className="border p-1 w-full"/><button onClick={()=>guardarEdicion(c.id)} className="text-green-600"><Check/></button><button onClick={()=>setEditandoId(null)} className="text-red-500"><X/></button></div></td>
                ) : (
                  <>
                    <td className="p-3 font-bold text-slate-700">{c.nombres} {c.apellidos}</td>
                    <td className="p-3">{c.empresa||'-'}</td>
                    <td className="p-3 font-medium">{c.telefono}</td>
                    <td className="p-3">{c.correo||'-'}</td>
                    <td className="p-3 text-center flex justify-center space-x-2">
                      <button onClick={()=>{setEditandoId(c.id); setEditado({...c});}} className="text-blue-500 hover:bg-blue-100 p-1.5 rounded" title="Editar"><Edit2 size={16}/></button>
                      {/* SEGURIDAD: Solo admin puede borrar */}
                      {rol === 'admin' && <button onClick={()=>eliminar(c)} className="text-red-500 hover:bg-red-100 p-1.5 rounded" title="Eliminar"><Trash2 size={16}/></button>}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}