import { Module } from '@nestjs/common';
import { LegacyApiModule } from './legacy-api.module';

@Module({
  imports: [LegacyApiModule],
})
export class AppModule {}
