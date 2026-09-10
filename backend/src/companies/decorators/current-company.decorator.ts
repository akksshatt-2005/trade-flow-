import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentCompany = createParamDecorator(
  (data: 'id' | 'role' | 'company' | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    if (data === 'id') return request.companyId;
    if (data === 'role') return request.companyRole;
    if (data === 'company') return request.company;

    return {
      id: request.companyId,
      role: request.companyRole,
      details: request.company,
    };
  },
);
