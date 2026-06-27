import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
  RemoveEvent,
} from 'typeorm';
import { QueryRunner } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

/**
 * Multi-tenancy subscriber to enforce organisationId presence on tenant-aware entities
 * 
 * This subscriber automatically validates that organisationId is present on all
 * insert/update operations for entities that should be organisation-scoped.
 * 
 * This provides structural enforcement of multi-tenancy, preventing developers
 * from accidentally forgetting to include organisationId in queries.
 */
@EventSubscriber()
export class MultiTenancySubscriber implements EntitySubscriberInterface {
  
  /**
   * Called before entity insertion
   * Validates that organisationId is present for tenant-aware entities
   */
  beforeInsert(event: InsertEvent<any>) {
    if (this.isTenantAwareEntity(event.entity)) {
      // SUPER_ADMIN users are not organisation-scoped
      if (event.entity.role === 'SUPER_ADMIN') {
        return;
      }
      if (!event.entity.organisationId) {
        throw new BadRequestException(
          `organisationId is required for ${event.metadata.name}. Multi-tenancy violation detected.`
        );
      }
    }
  }

  /**
   * Called before entity update
   * Validates that organisationId cannot be changed (security constraint)
   */
  beforeUpdate(event: UpdateEvent<any>) {
    if (this.isTenantAwareEntity(event.entity)) {
      // Prevent organisationId from being changed
      if (event.updatedColumns.some((col) => col.propertyName === 'organisationId')) {
        throw new BadRequestException(
          'organisationId cannot be changed. Multi-tenancy security constraint.'
        );
      }
    }
  }

  /**
   * Called before entity removal
   * 
   * ⚠ KNOWN LIMITATION: Criteria-based deletes (e.g., .delete({ id: x }) or .softDelete({ id: x }))
   * do NOT populate event.entity — they execute a raw SQL DELETE/UPDATE without loading the entity
   * into memory first. This means the multi-tenancy check below is ONLY effective for
   * entity-based removal (i.e., .remove(entity) where the entity object is passed).
   * 
   * Always use repository-level queries with organisationId in the WHERE clause for deletes:
   *   ✅ await manager.delete(Entity, { id, organisationId })
   *   ❌ await manager.delete(Entity, { id })
   */
  beforeRemove(event: RemoveEvent<any>) {
    if (this.isTenantAwareEntity(event.entity)) {
      if (!event.entity.organisationId) {
        throw new BadRequestException(
          `organisationId is required for deletion of ${event.metadata.name}. Multi-tenancy violation detected.`
        );
      }
    }
  }

  /**
   * Determines if an entity should be organisation-scoped
   * Entities with organisationId property are considered tenant-aware
   */
  private isTenantAwareEntity(entity: any): boolean {
    if (!entity) return false;
    return 'organisationId' in entity;
  }
}
