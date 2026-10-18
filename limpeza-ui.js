export function installClearImports({isAdmin, isBusy, request, setState, setBusy, refreshAdmin}) {
  const section = document.getElementById('adminSection');
  if (!section || document.getElementById('clearAllImports')) return;
  const box = document.createElement('div');
  box.className = 'notice';
  const heading = document.createElement('h3');
  heading.textContent = 'Apagar todas as planilhas importadas';
  const description = document.createElement('p');
  description.textContent = 'Remove os arquivos Excel salvos, os dados de todas as competências e o histórico de importações e restaurações, das duas origens. Mantém usuários, senhas e registro de auditoria. Baixe um backup antes se quiser guardar esses dados.';
  const button = document.createElement('button');
  button.id = 'clearAllImports';
  button.type = 'button';
  button.textContent = 'Apagar todas as planilhas e dados';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  box.append(heading, description, button, status);
  section.append(box);
  button.onclick = async () => {
    if (!isAdmin() || isBusy()) return;
    button.disabled = true;
    setBusy(true);
    try {
      const info = await request('/api/imports/clear');
      const confirmation = window.prompt(
        `Apagar ${info.files} arquivos, ${info.rows} registros, ${info.months} competências e ${info.history} versões do histórico?\n\nNão será possível restaurar pelo painel sem um backup externo. Usuários e senhas serão mantidos.\n\nDigite APAGAR TODOS para confirmar:`
      );
      if (confirmation === null) return;
      if (confirmation !== 'APAGAR TODOS') {
        status.textContent = 'Nada foi apagado. Para confirmar, digite APAGAR TODOS exatamente.';
        return;
      }
      const result = await request('/api/imports/clear', {revision: info.revision, confirmation});
      setState(result.state);
      status.textContent = 'Planilhas, dados e histórico apagados. Usuários e senhas preservados.';
      try { await refreshAdmin(); } catch {
        status.textContent += ' A exclusão foi concluída; atualize a página para recarregar a auditoria.';
      }
    } catch (error) {
      status.textContent = 'Exclusão não confirmada: ' + error.message;
    } finally {
      button.disabled = false;
      setBusy(false);
    }
  };
}
