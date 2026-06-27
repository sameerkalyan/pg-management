import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ResponseTimeMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ResponseTimeMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const method = req.method;
      const path = req.originalUrl || req.url;
      const status = res.statusCode;

      const logEntry = {
        method,
        path,
        status,
        durationMs: duration,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      if (duration > 1000) {
        this.logger.warn(`[SLOW REQUEST] ${method} ${path} ${status} ${duration}ms`, logEntry);
      } else if (duration > 500) {
        this.logger.log(`[SLOW REQUEST] ${method} ${path} ${status} ${duration}ms`, logEntry);
      } else {
        this.logger.debug(`${method} ${path} ${status} ${duration}ms`, logEntry);
      }
    });

    next();
  }
}
