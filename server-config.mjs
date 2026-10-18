export function serverConfig(env = process.env) {
  const hosted = env.RENDER === 'true';
  const host = env.DASHBOARD_HOST || (hosted ? '0.0.0.0' : '127.0.0.1');
  const portText = String(env.DASHBOARD_PORT || env.PORT || '3000');
  if (!/^\d+$/.test(portText)) throw Error('Porta inválida: use um inteiro entre 1 e 65535.');
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw Error('Porta inválida: use um inteiro entre 1 e 65535.');
  }
  let publicOrigin = env.DASHBOARD_PUBLIC_ORIGIN || (hosted ? env.RENDER_EXTERNAL_URL : '') || '';
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/' || (hosted && url.protocol !== 'https:')) {
      throw Error('DASHBOARD_PUBLIC_ORIGIN deve conter apenas a origem do painel, com HTTPS no Render.');
    }
    publicOrigin = url.origin;
  }
  return {host, port, publicOrigin};
}
