// Los empleados entran con usuarios inventados de estos dominios. Los dominios existen
// y son de terceros, así que nunca se les manda el correo de restablecer contraseña:
// el enlace le llegaría al dueño del dominio. Su contraseña se cambia en la consola.
const DOMINIOS_SIN_BUZON = ['glz.com'];

export const recibeCorreos = (correo) => {
  const dominio = `${correo || ''}`.trim().toLowerCase().split('@')[1] || '';
  return !DOMINIOS_SIN_BUZON.includes(dominio);
};
