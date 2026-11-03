import pino, { type Logger as PinoLogger } from 'pino';

export type Logger = PinoLogger;

export function createLogger(level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino({ level, serializers: { err: pino.stdSerializers.err } });
}
