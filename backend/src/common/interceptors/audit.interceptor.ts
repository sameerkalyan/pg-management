import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditAction } from '../../entities/audit-log.entity';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user, ip, headers } = request;
    const requestId = request.id || headers['x-request-id'];

    return next.handle().pipe(
      tap(async () => {
        // Only log certain actions (not GET requests)
        if (method === 'GET') return;

        // Determine action type based on method and endpoint
        let action: AuditAction;
        const entityType = this.extractEntityType(url);

        switch (method) {
          case 'POST':
            action = AuditAction.CREATE;
            break;
          case 'PUT':
          case 'PATCH':
            action = AuditAction.UPDATE;
            break;
          case 'DELETE':
            action = AuditAction.DELETE;
            break;
          default:
            return;
        }

        // Special cases for specific endpoints
        if (url.includes('/approve')) action = AuditAction.APPROVE;
        if (url.includes('/reject')) action = AuditAction.REJECT;
        if (url.includes('/suspend')) action = AuditAction.SUSPEND;
        if (url.includes('/reactivate')) action = AuditAction.REACTIVATE;
        if (url.includes('/login')) action = AuditAction.LOGIN;
        if (url.includes('/logout')) action = AuditAction.LOGOUT;
        if (url.includes('/password')) {
          if (url.includes('/reset')) action = AuditAction.PASSWORD_RESET;
          else action = AuditAction.PASSWORD_CHANGE;
        }
        if (url.includes('/mfa/enable')) action = AuditAction.MFA_ENABLED;
        if (url.includes('/mfa/disable')) action = AuditAction.MFA_DISABLED;

        try {
          const sanitizedBody = this.sanitizeBody(body);
          // Limit stored body size to 10KB to prevent audit log bloat
          let limitedBody: Record<string, any> | null = null;
          if (sanitizedBody) {
            try {
              const serialized = JSON.stringify(sanitizedBody);
              limitedBody = serialized.length > 10240 ? JSON.parse(serialized.substring(0, 10240)) : sanitizedBody;
            } catch {
              limitedBody = null;
            }
          }

          const auditLog = this.auditLogRepository.create({
            userId: user?.id || 'system',
            userEmail: user?.email || 'system',
            userRole: user?.role || 'system',
            action,
            entityType,
            entityId: body?.id || this.extractIdFromUrl(url),
            entityName: body?.name || body?.firstName || null,
            newValues: limitedBody,
            ipAddress: ip,
            userAgent: headers['user-agent'],
            requestId,
          });

          await this.auditLogRepository.save(auditLog);
        } catch (error) {
          this.logger.error(`Failed to create audit log: ${error.message}`, error.stack);
        }
      }),
    );
  }

  private extractEntityType(url: string): string {
    const parts = url.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return parts[1]; // e.g., /users -> users, /organisations -> organisations
    }
    return 'unknown';
  }

  private extractIdFromUrl(url: string): string | null {
    const parts = url.split('/').filter(Boolean);
    if (parts.length >= 3) {
      return parts[2]; // e.g., /users/123 -> 123
    }
    return null;
  }

  private sanitizeBody(body: any): Record<string, any> | null {
    if (!body) return null;

    // Remove sensitive fields
    const {
      password,
      mfaSecret,
      confirmPassword,
      newPassword,
      currentPassword,
      token,
      refreshToken,
      accessToken,
      mfaCode,
      otp,
      ...sanitized
    } = body;
    return sanitized;
  }
}
