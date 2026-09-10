import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for any frontend origin in dev / production
  app.enableCors({
    origin: (origin, callback) => {
      // Allow all origins (localhost, 127.0.0.1, Vercel preview/production domains, mobile)
      callback(null, true);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Trade Flow Backend is running on: http://localhost:${port}`);
  console.log(`🩺 Health Check endpoint: http://localhost:${port}/health`);
}
bootstrap();
