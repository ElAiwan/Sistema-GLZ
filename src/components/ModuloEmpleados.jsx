import { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { Check, Edit2, Info, KeyRound, Search, UserCog, UserMinus, X } from 'lucide-react';

// Los permisos viven en `roles/{correo}`. Las cuentas de Authentication (correo y
// contraseña) se crean y se borran desde la consola: el plan Spark no tiene Functions.

const PERFILES = [
  { valor: 'vendedor', etiqueta: 'Vendedor' },
  { valor: 'admin', etiqueta: 'Administrador' }
];

const NOMBRE_MAX = 60;
const EMPLEADO_VACIO = { correo: '', nombre: '', rol: 'vendedor' };

const etiquetaPerfil = (rol) => PERFILES.find((p) => p.valor === rol)?.etiqueta || 'Sin perfil';
const perfilValido = (rol) => PERFILES.some((p) => p.valor === rol);

const validarNombre = (nombre) => {
  if (!nombre) return 'El nombre es obligatorio.';
  if (nombre.length > NOMBRE_MAX) return `El nombre no puede pasar de ${NOMBRE_MAX} caracteres.`;
  return '';
};

const leerEmpleados = async () => {
  const snap = await getDocs(collection(db, 'roles'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || a.id).localeCompare(b.nombre || b.id, 'es'));
};

export default function ModuloEmpleados({ registrarHistorial, correoActual }) {
  const [empleados, setEmpleados] = useState([]);
  const [nuevo, setNuevo] = useState(EMPLEADO_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [editado, setEditado] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  const miCorreo = (correoActual || '').toLowerCase();

  useEffect(() => {
    let activo = true;
    leerEmpleados()
      .then((lista) => { if (activo) setEmpleados(lista); })
      .catch((errorCarga) => {
        console.error('Error cargando empleados:', errorCarga);
        if (activo) setError('No se pudo cargar la lista de empleados.');
      });
    return () => { activo = false; };
  }, []);

  const obtener = async () => setEmpleados(await leerEmpleados());

  const limpiarMensajes = () => {
    setError('');
    setAviso('');
  };

  const darAcceso = async (e) => {
    e.preventDefault();
    limpiarMensajes();
    const correo = nuevo.correo.trim().toLowerCase();
    const nombre = nuevo.nombre.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError('Escriba un correo válido.');
      return;
    }
    const errorNombre = validarNombre(nombre);
    if (errorNombre) {
      setError(errorNombre);
      return;
    }
    if (correo === miCorreo) {
      setError('No puede modificar su propio acceso.');
      return;
    }

    setGuardando(true);
    try {
      const referencia = doc(db, 'roles', correo);
      if ((await getDoc(referencia)).exists()) {
        setError('Ese correo ya tiene acceso. Búsquelo en la lista para editarlo.');
        return;
      }
      await setDoc(referencia, { rol: nuevo.rol, nombre });
      await registrarHistorial('Empleados', `Dio acceso a ${nombre} (${correo}) como ${etiquetaPerfil(nuevo.rol)}`);
      setNuevo(EMPLEADO_VACIO);
      setAviso(`${nombre} ya tiene acceso como ${etiquetaPerfil(nuevo.rol)}. Si todavía no existe su cuenta, créela en Firebase → Authentication con el correo ${correo}.`);
      await obtener();
    } catch (errorGuardado) {
      console.error('Error dando acceso:', errorGuardado);
      setError('No se pudo dar el acceso.');
    } finally {
      setGuardando(false);
    }
  };

  const empezarEdicion = (empleado) => {
    limpiarMensajes();
    setEditandoId(empleado.id);
    setEditado({ nombre: empleado.nombre || '', rol: perfilValido(empleado.rol) ? empleado.rol : 'vendedor' });
  };

  const guardarEdicion = async (empleado) => {
    limpiarMensajes();
    const nombre = (editado.nombre || '').trim();
    const errorNombre = validarNombre(nombre);
    if (errorNombre) {
      setError(errorNombre);
      return;
    }

    const cambios = [];
    if (nombre !== (empleado.nombre || '')) cambios.push(`el nombre a "${nombre}"`);
    if (editado.rol !== empleado.rol) cambios.push(`el perfil a ${etiquetaPerfil(editado.rol)}`);
    if (cambios.length === 0) {
      setEditandoId(null);
      return;
    }

    try {
      await updateDoc(doc(db, 'roles', empleado.id), { nombre, rol: editado.rol });
      await registrarHistorial('Empleados', `Cambió ${cambios.join(' y ')} de ${empleado.id}`);
      setEditandoId(null);
      await obtener();
    } catch (errorEdicion) {
      console.error('Error editando empleado:', errorEdicion);
      setError('No se pudo guardar la edición.');
    }
  };

  const enviarCambioContrasena = async (empleado) => {
    if (!window.confirm(`¿Enviar a ${empleado.id} un correo para cambiar su contraseña?`)) return;
    limpiarMensajes();
    try {
      await sendPasswordResetEmail(auth, empleado.id);
      await registrarHistorial('Empleados', `Envió correo de cambio de contraseña a ${empleado.id}`);
      setAviso(`Correo enviado a ${empleado.id}. Si no le llega, que revise la carpeta de spam y confirme que la cuenta exista en Firebase → Authentication.`);
    } catch (errorReset) {
      console.error('Error enviando correo de contraseña:', errorReset);
      setError(errorReset.code === 'auth/too-many-requests'
        ? 'Demasiados intentos. Espere unos minutos e intente de nuevo.'
        : 'No se pudo enviar el correo.');
    }
  };

  const quitarAcceso = async (empleado) => {
    const nombre = empleado.nombre || empleado.id;
    const confirmado = window.confirm(
      `¿Quitar el acceso a ${nombre}?\n\nYa no podrá consultar ni guardar nada en el sistema. ` +
      'Para borrar también su cuenta, hágalo en Firebase → Authentication.'
    );
    if (!confirmado) return;
    limpiarMensajes();
    try {
      await deleteDoc(doc(db, 'roles', empleado.id));
      await registrarHistorial('Empleados', `Quitó el acceso a ${nombre} (${empleado.id})`);
      setAviso(`Se quitó el acceso a ${nombre}. Recuerde borrar su cuenta en Firebase → Authentication.`);
      await obtener();
    } catch (errorEliminar) {
      console.error('Error quitando acceso:', errorEliminar);
      setError('No se pudo quitar el acceso.');
    }
  };

  const filtrados = empleados.filter((e) =>
    `${e.nombre || ''} ${e.id} ${etiquetaPerfil(e.rol)}`.toLowerCase().includes(busqueda.toLowerCase())
  );

  const acciones = (empleado, compacto) => {
    if (empleado.id === miCorreo) {
      return <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Su cuenta</span>;
    }
    const base = compacto ? 'border border-slate-200 bg-white p-2 rounded' : 'p-1.5 rounded';
    return (
      <div className={`flex gap-2 ${compacto ? 'justify-end' : 'justify-center'}`}>
        <button onClick={() => empezarEdicion(empleado)} className={`${base} text-blue-500 hover:bg-blue-100`} title="Editar nombre y perfil"><Edit2 size={16} /></button>
        <button onClick={() => enviarCambioContrasena(empleado)} className={`${base} text-amber-600 hover:bg-amber-100`} title="Enviar correo para cambiar contraseña"><KeyRound size={16} /></button>
        <button onClick={() => quitarAcceso(empleado)} className={`${base} text-red-500 hover:bg-red-100`} title="Quitar acceso"><UserMinus size={16} /></button>
      </div>
    );
  };

  const editor = (empleado) => (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={editado.nombre}
        onChange={(e) => setEditado({ ...editado, nombre: e.target.value })}
        maxLength={NOMBRE_MAX}
        className="border p-1.5 rounded flex-1 min-w-0 sm:min-w-[12rem] bg-white"
        placeholder="Nombre"
      />
      <select
        value={editado.rol}
        onChange={(e) => setEditado({ ...editado, rol: e.target.value })}
        className="border p-1.5 rounded bg-white"
      >
        {PERFILES.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
      </select>
      <button onClick={() => guardarEdicion(empleado)} className="text-green-600 px-2" title="Guardar"><Check /></button>
      <button onClick={() => setEditandoId(null)} className="text-red-500 px-2" title="Cancelar"><X /></button>
    </div>
  );

  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200 print:hidden">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4 flex items-center gap-2">
        <UserCog size={24} className="text-slate-500" /> Empleados y accesos
      </h2>

      {error && (
        <div className="mb-4 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</div>
      )}
      {aviso && (
        <div className="mb-4 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">{aviso}</div>
      )}

      <form onSubmit={darAcceso} className="mb-8 bg-slate-50 p-4 sm:p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex gap-2 items-start text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 mb-5">
          <Info size={16} className="shrink-0 text-blue-500 mt-0.5" />
          <p className="min-w-0">
            Primero cree la cuenta (correo y contraseña) en <b>Firebase → Authentication</b>. Después dé acceso aquí con el mismo correo.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Correo</label>
            <input type="email" required value={nuevo.correo} onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} placeholder="empleado@correo.com" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Nombre visible</label>
            <input required maxLength={NOMBRE_MAX} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej: Carlos López" className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Perfil</label>
            <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })} className="w-full border p-2.5 rounded-lg outline-none focus:border-emerald-500 bg-white">
              {PERFILES.map((p) => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" disabled={guardando} className="bg-emerald-500 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-emerald-600 shadow-sm transition-colors w-full sm:w-auto disabled:opacity-50">
          {guardando ? 'Guardando...' : 'Dar acceso'}
        </button>
      </form>

      <div className="mb-4 flex items-center bg-white border border-slate-300 rounded-lg p-2 md:w-1/2 focus-within:border-emerald-500 transition-colors">
        <Search className="text-slate-400 mr-2 shrink-0" size={20} />
        <input type="text" placeholder="Buscar empleado..." className="w-full min-w-0 outline-none text-slate-700" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      <div className="md:hidden space-y-3">
        {filtrados.map((e) => (
          <div key={e.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
            {editandoId === e.id ? editor(e) : (
              <>
                <p className="font-bold text-slate-800">{e.nombre || '(sin nombre)'}</p>
                <p className="text-sm text-slate-500 break-all">{e.id}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mt-1">{etiquetaPerfil(e.rol)}</p>
                <div className="mt-3">{acciones(e, true)}</div>
              </>
            )}
          </div>
        ))}
        {filtrados.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No hay empleados para mostrar.</p>}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="p-3 rounded-tl-lg">Nombre</th>
              <th className="p-3">Correo</th>
              <th className="p-3">Perfil</th>
              <th className="p-3 text-center rounded-tr-lg">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((e) => (
              <tr key={e.id} className="border-b hover:bg-slate-50">
                {editandoId === e.id ? (
                  <td colSpan="4" className="p-3 bg-slate-100">
                    <p className="text-xs text-slate-500 mb-2">{e.id}</p>
                    {editor(e)}
                  </td>
                ) : (
                  <>
                    <td className="p-3 font-bold text-slate-700">{e.nombre || '(sin nombre)'}</td>
                    <td className="p-3 text-slate-600">{e.id}</td>
                    <td className="p-3">
                      <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded ${e.rol === 'admin' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {etiquetaPerfil(e.rol)}
                      </span>
                    </td>
                    <td className="p-3 text-center">{acciones(e, false)}</td>
                  </>
                )}
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan="4" className="p-8 text-center text-slate-400">No hay empleados para mostrar.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
