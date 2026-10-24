/* Бренд КОМФОРТ home: контурна квітка бавовни. Колір — зі змінних теми (--logo, --logo-leaf). */
export const BRAND = 'КОМФОРТ home';
export const cottonLogo = (cls = 'logo') => `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <g stroke="var(--logo)">
    <path d="M15.5 30.5c-5 0-6.2-6.6-1.9-8.2-2.4-5 2.9-9.2 6.9-6.6.8-5.6 6.2-5.6 7 0 4-2.6 9.3 1.6 6.9 6.6 4.3 1.6 3.1 8.2-1.9 8.2z"/>
    <path d="M20.5 15.7c.4 3.6 1.6 5.9 3.5 7.3 1.9-1.4 3.1-3.7 3.5-7.3M13.6 22.3c3.4.2 6 1.6 7.4 4.6M34.4 22.3c-3.4.2-6 1.6-7.4 4.6M24 23v7.5"/>
  </g>
  <g stroke="var(--logo-leaf)">
    <path d="M15.5 30.5c1.8 3.4 5.4 4 8.5 2.2 3.1 1.8 6.7 1.2 8.5-2.2"/>
    <path d="M24 32.7V44"/>
    <path d="M24 40.2c-2.6-3.2-6.8-3.9-10-2 2.5 3.1 6.7 3.9 10 2z"/>
    <path d="M24 37.6c2.4-3 6.3-3.6 9.2-1.8-2.3 2.9-6.2 3.6-9.2 1.8z"/>
  </g>
</svg>`;
