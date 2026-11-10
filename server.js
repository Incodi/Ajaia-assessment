import { createApp } from './src/app.js';
import { createDatabase } from './src/db.js';

const db = createDatabase();
const app = createApp(db);
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Docs with Friends. listening on port ${port}`);
});
