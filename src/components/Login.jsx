import { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { Lock } from 'lucide-react';

const ERRORES_RESET = {
  'auth/invalid-email': 'El correo no tiene un formato válido.',
  'auth/missing-email': 'Escriba su correo electrónico primero.',
  'auth/network-request-failed': 'No hay conexión a internet. Intente de nuevo.',
  'auth/too-many-requests': 'Demasiados intentos. Espere unos minutos e intente de nuevo.'
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviandoReset, setEnviandoReset] = useState(false);

  const manejarIngreso = async (e) => {
    e.preventDefault();
    setAviso('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Credenciales incorrectas o sesión expirada.');
    }
  };

  // El mensaje de éxito es el mismo exista o no la cuenta, para no revelar qué correos están registrados.
  const recuperarContrasena = async () => {
    setError('');
    setAviso('');
    const correo = email.trim();
    if (!correo) {
      setError('Escriba su correo electrónico arriba y vuelva a tocar "¿Olvidó su contraseña?".');
      return;
    }

    setEnviandoReset(true);
    try {
      await sendPasswordResetEmail(auth, correo);
      setAviso('Si el correo está registrado, le llegará un enlace para cambiar la contraseña. Revise también la carpeta de spam.');
    } catch (errorReset) {
      if (errorReset.code === 'auth/user-not-found') {
        setAviso('Si el correo está registrado, le llegará un enlace para cambiar la contraseña. Revise también la carpeta de spam.');
      } else {
        console.error('Error enviando correo de contraseña:', errorReset);
        setError(ERRORES_RESET[errorReset.code] || 'No se pudo enviar el correo. Intente de nuevo.');
      }
    } finally {
      setEnviandoReset(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.jpg" alt="GLZ Logo" className="w-full h-auto mx-auto mb-8 object-contain max-h-40" />
          <h1 className="text-3xl font-black text-slate-800 tracking-wider">SISTEMA GLZ</h1>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4 text-sm font-medium text-center">{error}</div>}
        {aviso && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded mb-4 text-sm font-medium text-center">{aviso}</div>}

        <form onSubmit={manejarIngreso} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Correo Electrónico</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:border-emerald-500 bg-slate-50" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contraseña</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-slate-300 p-3 rounded-lg outline-none focus:border-emerald-500 bg-slate-50" />
          </div>
          <button type="submit" className="w-full bg-emerald-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-emerald-600 transition-colors shadow-lg">
            Ingresar
          </button>
          <button
            type="button"
            onClick={recuperarContrasena}
            disabled={enviandoReset}
            className="w-full text-sm font-semibold text-slate-500 hover:text-emerald-600 transition-colors disabled:opacity-50"
          >
            {enviandoReset ? 'Enviando correo...' : '¿Olvidó su contraseña?'}
          </button>
        </form>
      </div>
    </div>
  );
}
