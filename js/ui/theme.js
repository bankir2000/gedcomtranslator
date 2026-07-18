// ===================== ТЕМА (день/ніч) =====================
export function toggleTheme() {
  const isDay = document.body.classList.toggle('day');
  document.getElementById('themeBtn').textContent = isDay ? '🌙 Ніч' : '☀️ День';
  localStorage.setItem('gedcom_theme', isDay ? 'day' : 'night');
}

export function initTheme() {
  const t = localStorage.getItem('gedcom_theme');
  if (t === 'day') {
    document.body.classList.add('day');
    document.getElementById('themeBtn').textContent = '🌙 Ніч';
  }
}
