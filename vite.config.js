import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Збірка в один HTML-файл: його можна відкрити подвійним кліком без сервера
// і викласти на GitHub Pages. base './' — щоб працювало в підпапці /turka-shop/.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  test: { environment: 'node' },
});
