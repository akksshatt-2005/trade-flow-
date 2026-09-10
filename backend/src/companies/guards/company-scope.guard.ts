import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { CompaniesService } from '../companies.service';

@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private readonly companiesService: CompaniesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    if (!req.user || !req.user.id) {
      throw new UnauthorizedException(
        'Authentication required before verifying company scope.',
      );
    }

    // Extract company ID from headers, query, params, or body
    const companyId =
      req.headers['x-company-id'] ||
      req.headers['company-id'] ||
      req.params?.companyId ||
      req.params?.company_id ||
      req.query?.company_id ||
      req.query?.companyId ||
      req.body?.company_id ||
      req.body?.companyId;

    if (!companyId || typeof companyId !== 'string') {
      throw new BadRequestException(
        'Missing required company identifier. Pass x-company-id header or company_id parameter.',
      );
    }

    const { hasAccess, role, company } =
      await this.companiesService.verifyUserCompanyAccess(
        req.user.id,
        companyId.trim(),
      );

    if (!hasAccess) {
      throw new ForbiddenException(
        'Access denied: You do not have permission to access this company or the company does not exist.',
      );
    }

    // Attach tenant context to the request object
    req.companyId = companyId.trim();
    req.companyRole = role;
    req.company = company;

    return true;
  }
}
