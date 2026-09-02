import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('TruckerPoints Activities')
    .setDescription('Processes rewardable truck-driver activities submitted by logistics providers')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api', app, () => SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
