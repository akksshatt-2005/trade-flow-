import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

interface FailedAttemptTracker {
  attempts: number[];
  lockedUntil?: number;
}

@Injectable()
export class AuthRateLimitService {
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
  private readonly failureMap = new Map<string, FailedAttemptTracker>();

  private cleanKey(username: string): string {
    return username.trim().toLowerCase();
  }

  /**
   * Checks whether the given username is currently rate-limited/locked.
   * Throws 429 Too Many Requests if currently locked.
   */
  public checkLimit(username: string): void {
    const key = this.cleanKey(username);
    const now = Date.now();
    const tracker = this.failureMap.get(key);

    if (!tracker) return;

    if (tracker.lockedUntil && tracker.lockedUntil > now) {
      const remainingSeconds = Math.ceil((tracker.lockedUntil - now) / 1000);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Too many failed login attempts for user '${username}'. Account temporarily locked. Please try again in ${remainingMinutes} minute(s).`,
          remainingSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Records a failed login attempt for a username and triggers lockout if threshold is reached.
   */
  public recordFailure(username: string): void {
    const key = this.cleanKey(username);
    const now = Date.now();
    let tracker = this.failureMap.get(key);

    if (!tracker) {
      tracker = { attempts: [] };
      this.failureMap.set(key, tracker);
    }

    // Filter attempts to only those within the sliding window
    tracker.attempts = tracker.attempts.filter(
      (timestamp) => now - timestamp < this.WINDOW_MS,
    );
    tracker.attempts.push(now);

    if (tracker.attempts.length >= this.MAX_FAILED_ATTEMPTS) {
      tracker.lockedUntil = now + this.LOCKOUT_DURATION_MS;
    }
  }

  /**
   * Clears failure history on successful login.
   */
  public recordSuccess(username: string): void {
    const key = this.cleanKey(username);
    this.failureMap.delete(key);
  }
}
