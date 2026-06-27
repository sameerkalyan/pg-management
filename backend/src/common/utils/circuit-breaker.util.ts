import { Logger } from '@nestjs/common';

interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

export class CircuitBreaker {
  private readonly logger = new Logger(CircuitBreaker.name);
  private state: CircuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0,
  };

  private readonly threshold: number;
  private readonly timeout: number;
  private readonly halfOpenTimeout: number;

  constructor(threshold: number = 5, timeout: number = 60000, halfOpenTimeout: number = 30000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.halfOpenTimeout = halfOpenTimeout;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Check if circuit should reset to half-open
    if (this.state.isOpen && now >= this.state.nextAttemptTime) {
      this.state.isOpen = false;
      this.state.failureCount = 0;
      this.logger.log('Circuit breaker transitioning to half-open state');
    }

    // Circuit is open, reject immediately
    if (this.state.isOpen) {
      throw new Error('Circuit breaker is OPEN. Service unavailable.');
    }

    try {
      const result = await fn();

      // Success: reset failure count
      this.state.failureCount = 0;
      return result;
    } catch (error) {
      this.state.failureCount++;
      this.state.lastFailureTime = now;

      // Open circuit if threshold reached
      if (this.state.failureCount >= this.threshold) {
        this.state.isOpen = true;
        this.state.nextAttemptTime = now + this.timeout;
        this.logger.warn(
          `Circuit breaker OPENED after ${this.state.failureCount} failures. Next attempt at ${new Date(this.state.nextAttemptTime).toISOString()}`,
        );
      }

      throw error;
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  reset(): void {
    this.state = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0,
    };
    this.logger.log('Circuit breaker manually reset');
  }
}
