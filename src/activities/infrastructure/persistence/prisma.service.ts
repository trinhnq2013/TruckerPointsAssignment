import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Without this, Jest hangs on open handles at the end of the e2e suite. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
