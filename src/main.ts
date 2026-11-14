export async function bootstrap() {
  require('dotenv').config();
  process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

  const { createApp } = require('./app') as typeof import('./app');
  const app = await createApp();
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`HRM chạy tại http://localhost:${port}`);
  return app;
}

if (require.main === module) {
  bootstrap().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
