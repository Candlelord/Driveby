export async function hasBuildUpdate(current, url, fetcher = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(url, { cache: 'no-cache', signal: controller.signal });
    if (!response.ok) return false;
    const data = await response.json();
    return typeof data.version === 'string' && data.version.length > 0 && data.version !== current;
  } catch { return false; }
  finally { clearTimeout(timeout); }
}

export function watchBuildUpdates(onReload) {
  if (!import.meta.env.PROD) return;
  let checking = false, offered = false;
  const check = async () => {
    if (checking || offered || document.visibilityState !== 'visible') return;
    checking = true;
    const changed = await hasBuildUpdate(__DRIVE_BUILD__, `${import.meta.env.BASE_URL}build-info.json`);
    checking = false;
    if (!changed || offered) return;
    offered = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', check);
    const notice = document.createElement('div');
    notice.className = 'build-update'; notice.setAttribute('role', 'status');
    const label = document.createElement('span'); label.textContent = 'A new version is ready';
    const button = document.createElement('button'); button.textContent = 'Save & reload';
    button.addEventListener('click', () => { onReload(); location.reload(); });
    notice.append(label, button); document.body.append(notice);
  };
  const timer = setInterval(check, 180000);
  document.addEventListener('visibilitychange', check);
  check();
}
