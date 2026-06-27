import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const isDev = process.env.NODE_ENV === 'development';

    this.logger.error({
      message: `${request.method} ${request.url} failed`,
      statusCode: status,
      requestId: request.headers['x-request-id'],
      error: exception instanceof Error ? exception.message : 'Unknown error',
      ...(isDev && exception instanceof Error ? { stack: exception.stack } : {}),
    });

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof message === 'string' ? message : (message as any).message,
      ...(isDev ? { stack: exception instanceof Error ? exception.stack : undefined } : {}),
    });
  }
}
