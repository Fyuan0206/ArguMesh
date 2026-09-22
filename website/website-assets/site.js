document.getElementById('copy').addEventListener('click', async () => {
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(document.getElementById('commands').textContent.trim());
    status.textContent = '命令已复制。请在本机终端运行。';
  } catch {
    status.textContent = '无法访问剪贴板，请选中上方命令手动复制。';
  }
});
