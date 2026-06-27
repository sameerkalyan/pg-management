import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription.decorator';
import { SkipOrgStatusCheck } from '../../common/decorators/skip-org-status.decorator';
import { UserRole } from '../../entities/user.entity';
import { Throttle } from '@nestjs/throttler';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@SkipSubscriptionCheck()
@SkipOrgStatusCheck()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @Throttle({ default: { limit: 100, ttl: 60 } })
  async getAllPlans() {
    return await this.subscriptionsService.getAllPlans();
  }

  @Get('plans/:planId')
  async getPlanById(@Param('planId') planId: string) {
    return await this.subscriptionsService.getPlanById(planId);
  }

  @Post('initiate-payment')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @Throttle({ default: { limit: 5, ttl: 3600 } })
  async initiatePayment(@Request() req, @Body() initiatePaymentDto: InitiatePaymentDto) {
    return await this.subscriptionsService.initiatePayment(
      req.user.organisationId,
      initiatePaymentDto.planId,
    );
  }

  @Post('send-expiry-warnings')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async sendExpiryWarnings(@Request() req) {
    return await this.subscriptionsService.sendExpiryWarnings(req.user.organisationId);
  }

  @Post('renew')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async renewByPlanId(@Request() req, @Body() body: { planId: string }) {
    const subscription = await this.subscriptionsService.getSubscriptionByOrganisation(req.user.organisationId);
    return await this.subscriptionsService.renewSubscription(
      subscription.id,
      req.user.organisationId,
      { planId: body.planId } as any,
    );
  }

  @Post('create')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async createSubscription(@Request() req, @Body() createSubscriptionDto: CreateSubscriptionDto) {
    return await this.subscriptionsService.createSubscriptionWithPaymentVerification(
      req.user.organisationId,
      createSubscriptionDto,
    );
  }

  @Post(':subscriptionId/renew')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async renewSubscription(
    @Request() req,
    @Param('subscriptionId') subscriptionId: string,
    @Body() renewSubscriptionDto: RenewSubscriptionDto,
  ) {
    return await this.subscriptionsService.renewSubscription(
      subscriptionId,
      req.user.organisationId,
      renewSubscriptionDto,
    );
  }

  @Get('my-subscription')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getMySubscription(@Request() req) {
    return await this.subscriptionsService.getSubscriptionByOrganisation(req.user.organisationId);
  }

  @Get('my-subscription/status')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async getMySubscriptionStatus(@Request() req) {
    return await this.subscriptionsService.getSubscriptionStatus(req.user.organisationId);
  }

  @Post(':subscriptionId/cancel')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async cancelSubscription(@Request() req, @Param('subscriptionId') subscriptionId: string) {
    return await this.subscriptionsService.cancelSubscription(
      subscriptionId,
      req.user.organisationId,
    );
  }
}
